// 앱의 일정(다음 라운드 · 여행)을 구글 캘린더에 그대로 맞춰 넣는다.
//
// 흐름 —
//   앱이 일정을 저장한 뒤 이 함수를 부른다(api.js의 syncGoogleCalendar).
//   함수가 DB에서 일정을 **직접 읽어** 캘린더에 있어야 할 이벤트를 셈하고, 있는 것과 맞춘다.
//   (앱이 일정 내용을 실어 보내지 않는다 — 장난으로 부르거나 낡은 폰이 불러도 DB 기준으로만 맞춰진다.)
//
// 왜 서비스 계정인가 —
//   OAuth(내 구글 계정 로그인)는 테스트 상태 앱의 갱신 토큰이 7일이면 만료돼 조용히 끊긴다.
//   서비스 계정은 만료가 없다. 내 캘린더를 그 계정과 '공유'해 두기만 하면 된다.
//
// 이벤트를 어떻게 알아보는가 —
//   이벤트 id를 일정 키의 해시로 정해(`jt` + 32자) 같은 일정은 늘 같은 이벤트다 → 고치면 수정, 없으면 생성.
//   만든 이벤트에는 비공개 속성 jtfag=1이 붙는다. 내가 직접 넣은 다른 일정은 절대 안 건드린다.
//   앞으로의 이벤트 중 DB에 없는 것은 지운다(여행을 지웠거나 날짜를 옮긴 경우).
//   **이미 지난 이벤트는 안 지운다** — 다음 라운드가 바뀌어도 지난 라운드는 기록으로 남는다.
//
// 필요한 것: Supabase의 Edge Function Secret (저장소에 넣지 말 것)
//   GOOGLE_SA_JSON    — 서비스 계정 키(JSON 통째로)
//   GCAL_CALENDAR_ID  — 이벤트를 넣을 캘린더 id (보통 내 구글 계정 이메일)
// SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY는 Supabase가 알아서 넣어 준다.
// 켜는 법은 docs/구글캘린더.md.

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SA_JSON = Deno.env.get('GOOGLE_SA_JSON') ?? '';
const CAL_ID = Deno.env.get('GCAL_CALENDAR_ID') ?? '';

const TZ = 'Asia/Seoul';
const ROUND_HOURS = 5;           // 티오프 시각만 알 때 이벤트 길이
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// ───────────────────────── 일정 → 이벤트 ─────────────────────────

type Ev = {
    key: string;
    summary: string;
    location?: string;
    description?: string;
    allDay?: { start: string; endExclusive: string };
    timed?: { start: string; end: string };      // 'YYYY-MM-DDTHH:MM:00' (한국 시각)
    transparent?: boolean;
};

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const stripSub = (v: string) => v.replace(/\s*\([^()]*\)\s*$/, '').trim();    // 끝의 9홀 코스 괄호

const pad = (n: number) => String(n).padStart(2, '0');
function isoAdd(iso: string, days: number) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// '오전 7:30' · '오후 1:05' · '07:30' · '7시 30분'을 시·분으로. 못 읽으면 null.
function parseTee(text: string): { h: number; m: number } | null {
    const t = clean(text);
    const m = t.match(/(오전|오후)?\s*(\d{1,2})\s*(?::|시)\s*(\d{1,2})?/);
    if (!m) return null;
    let h = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    if (m[1] === '오후' && h < 12) h += 12;
    if (m[1] === '오전' && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return { h, m: min };
}

function timedRange(iso: string, tee: { h: number; m: number }) {
    const start = `${iso}T${pad(tee.h)}:${pad(tee.m)}:00`;
    const [y, mo, d] = iso.split('-').map(Number);
    const end = new Date(Date.UTC(y, mo - 1, d, tee.h + ROUND_HOURS, tee.m)).toISOString().slice(0, 19);
    return { start, end };
}

// DB의 payload에서 캘린더에 있어야 할 이벤트를 모두 낸다.
export function planEvents(payload: Record<string, unknown>): Ev[] {
    const out: Ev[] = [];
    const nextISO = clean(payload.nextRoundISO);
    const nextText = clean(payload.nextRoundDate);
    const nextNo = Number(payload.nextRoundNo) || 0;
    const nextTime = nextText.match(/(오전|오후)\s+\d{1,2}:\d{2}/);
    const nextClub = stripSub(nextText.replace(/^\d{1,2}월\s*\d{1,2}일\s*(오전|오후)?\s*\d{1,2}:\d{2}\s*/, ''));

    // 여행: 기간 전체 한 줄(바쁨 아님) + 라운드가 있는 날마다 한 줄.
    const trips = Array.isArray(payload.trips) ? payload.trips as Record<string, unknown>[] : [];
    let nextRoundCovered = false;
    for (const trip of trips) {
        const id = clean(trip?.id);
        if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) continue;
        const days = (Array.isArray(trip.days) ? trip.days as Record<string, unknown>[] : [])
            .filter((d) => d && ISO_RE.test(clean(d.date)))
            .sort((a, b) => clean(a.date) < clean(b.date) ? -1 : 1);
        if (!days.length) continue;
        const title = clean(trip.title) || '골프 여행';
        const first = clean(days[0].date), last = clean(days[days.length - 1].date);

        const lines = days.map((d, i) => {
            const bits = [clean(d.golf) === 'no' ? '라운드 없음' : clean(d.course), clean(d.tee) && `티오프 ${clean(d.tee)}`, clean(d.stay) && `숙소 ${clean(d.stay)}`].filter(Boolean);
            return `${i + 1}일차 ${clean(d.date).slice(5).replace('-', '/')} · ${bits.join(' · ') || '미정'}`;
        });
        const memo = clean(trip.memo);
        out.push({
            key: `trip-${id}`,
            summary: `🧳 ${title}`,
            description: [...lines, memo && `\n${memo}`].filter(Boolean).join('\n'),
            allDay: { start: first, endExclusive: isoAdd(last, 1) },
            transparent: true
        });

        for (const d of days) {
            const date = clean(d.date), course = clean(d.course);
            if (!course || clean(d.golf) === 'no') continue;
            const isNext = nextISO === date;
            if (isNext) nextRoundCovered = true;
            // 여행 칸의 티오프가 비어 있고 그날이 일정에 잡힌 라운드면 그 시각을 쓴다(알림 발송기와 같은 규칙).
            const tee = parseTee(clean(d.tee)) ?? (isNext && nextTime ? parseTee(nextTime[0]) : null);
            const label = isNext && nextNo ? `${nextNo}차 · ` : '';
            const detail = [clean(d.area) && `지역 ${clean(d.area)}`, clean(d.stay) && `숙소 ${clean(d.stay)}`, clean(d.memo)].filter(Boolean).join('\n');
            const ev: Ev = {
                key: `trip-${id}-${date}`,
                summary: `⛳ ${label}${stripSub(course)}`,
                location: stripSub(course),
                description: [`여행: ${title}`, detail].filter(Boolean).join('\n')
            };
            if (tee) ev.timed = timedRange(date, tee); else ev.allDay = { start: date, endExclusive: isoAdd(date, 1) };
            out.push(ev);
        }
    }

    // 다음 라운드(일정 창에서 잡은 것). 같은 날 여행 라운드가 이미 있으면 거기에 합쳐졌으므로 넣지 않는다.
    if (ISO_RE.test(nextISO) && !nextRoundCovered && nextClub) {
        const tee = nextTime ? parseTee(nextTime[0]) : null;
        const ev: Ev = {
            key: nextNo ? `round-${nextNo}` : `round-${nextISO}`,
            summary: `⛳ ${nextNo ? `${nextNo}차 라운드 · ` : ''}${nextClub}`,
            location: nextClub,
            description: 'JTFAG 다음 라운드'
        };
        if (tee) ev.timed = timedRange(nextISO, tee); else ev.allDay = { start: nextISO, endExclusive: isoAdd(nextISO, 1) };
        out.push(ev);
    }
    return out;
}

// ───────────────────────── 구글 인증 · 호출 ─────────────────────────

const b64url = (data: ArrayBuffer | string) => {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    let s = '';
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

let tokenCache: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
    if (tokenCache && tokenCache.exp - 60_000 > Date.now()) return tokenCache.token;
    const sa = JSON.parse(SA_JSON);
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }));
    const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`));
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: `${head}.${claim}.${b64url(sig)}`
        })
    });
    if (!res.ok) throw new Error(`구글 인증 실패: ${res.status} ${await res.text()}`);
    const data = await res.json();
    tokenCache = { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return tokenCache.token;
}

const CAL = () => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL_ID)}/events`;

async function gcal(path: string, init: RequestInit = {}) {
    const res = await fetch(CAL() + path, {
        ...init,
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }
    });
    return res;
}

// 구글 이벤트 id는 a-v·0-9 5~1024자다. 일정 키의 해시(16진수)를 쓰면 늘 맞는다.
async function eventId(key: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jtfag:${key}`));
    return 'jt' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function toGoogle(ev: Ev, id: string) {
    const body: Record<string, unknown> = {
        id,
        status: 'confirmed',
        summary: ev.summary,
        description: ev.description ?? '',
        location: ev.location ?? '',
        reminders: { useDefault: true },
        transparency: ev.transparent ? 'transparent' : 'opaque',
        extendedProperties: { private: { jtfag: '1', key: ev.key } }
    };
    if (ev.timed) {
        body.start = { dateTime: ev.timed.start, timeZone: TZ };
        body.end = { dateTime: ev.timed.end, timeZone: TZ };
    } else if (ev.allDay) {
        body.start = { date: ev.allDay.start };
        body.end = { date: ev.allDay.endExclusive };
    }
    return body;
}

// 이미 같은 내용이면 쓰지 않는다 — 불필요한 수정이 쌓이면 구글 쪽 알림·기록만 늘어난다.
function same(existing: Record<string, any>, next: Record<string, any>) {
    const sd = (o: any) => o?.dateTime ? `${String(o.dateTime).slice(0, 19)}` : o?.date ?? '';
    return existing.status !== 'cancelled'
        && existing.summary === next.summary
        && (existing.description ?? '') === next.description
        && (existing.location ?? '') === next.location
        && (existing.transparency ?? 'opaque') === next.transparency
        && sd(existing.start) === sd(next.start) && sd(existing.end) === sd(next.end);
}

async function listManaged(): Promise<Record<string, any>[]> {
    const items: Record<string, any>[] = [];
    // 어제부터의 것만 본다 — 지난 이벤트는 건드리지 않는다(위 머리말).
    const min = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let page = '';
    do {
        const qs = new URLSearchParams({
            privateExtendedProperty: 'jtfag=1', timeMin: min, maxResults: '250', showDeleted: 'false', singleEvents: 'true'
        });
        if (page) qs.set('pageToken', page);
        const res = await gcal(`?${qs}`);
        if (!res.ok) throw new Error(`캘린더 목록 실패: ${res.status} ${await res.text()}`);
        const data = await res.json();
        items.push(...(data.items ?? []));
        page = data.nextPageToken ?? '';
    } while (page);
    return items;
}

async function syncOnce(events: Ev[]) {
    const wanted = new Map<string, { ev: Ev; body: Record<string, unknown> }>();
    for (const ev of events) {
        const id = await eventId(ev.key);
        wanted.set(id, { ev, body: toGoogle(ev, id) });
    }
    const existing = new Map((await listManaged()).map((e) => [String(e.id), e]));
    let created = 0, updated = 0, unchanged = 0, deleted = 0;

    for (const [id, { body }] of wanted) {
        const cur = existing.get(id);
        if (cur && same(cur, body as Record<string, any>)) { unchanged++; continue; }
        // 먼저 수정을 시도한다. 지워진 이벤트의 id는 새로 만들 수 없고 수정으로만 되살아난다.
        let res = await gcal(`/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        if (res.status === 404) {
            res = await gcal('', { method: 'POST', body: JSON.stringify(body) });
            if (res.ok) created++;
        } else if (res.ok) updated++;
        if (!res.ok) throw new Error(`이벤트 저장 실패(${(body as any).summary}): ${res.status} ${await res.text()}`);
    }

    for (const [id, cur] of existing) {
        if (wanted.has(id)) continue;
        const res = await gcal(`/${id}`, { method: 'DELETE' });
        if (res.ok || res.status === 410 || res.status === 404) deleted++;
        else throw new Error(`이벤트 삭제 실패(${cur.summary}): ${res.status} ${await res.text()}`);
    }
    return { created, updated, unchanged, deleted, total: wanted.size };
}

// 한 번에 하나만 돈다. 도는 중에 또 부르면 끝난 뒤 한 번만 다시 맞춘다(그동안 일정이 더 바뀌었을 수 있다).
let running = false;
let again = false;

async function loadPayload() {
    const res = await fetch(`${SB_URL}/rest/v1/jtfag_league?id=eq.1&select=payload`, {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const rows = await res.json();
    const payload = rows?.[0]?.payload;
    if (!payload || typeof payload !== 'object') throw new Error('리그 데이터가 비어 있습니다.');
    return payload as Record<string, unknown>;
}

export async function handle(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return reply(405, { error: 'POST만 받습니다.' });
    if (!SA_JSON || !CAL_ID) return reply(503, { error: 'not_configured', detail: 'GOOGLE_SA_JSON · GCAL_CALENDAR_ID가 설정되지 않았습니다.' });
    if (!SB_URL || !SB_KEY) return reply(500, { error: 'Supabase 환경변수가 없습니다.' });

    if (running) { again = true; return reply(200, { synced: false, reason: '진행 중이라 끝난 뒤 한 번 더 맞춥니다.' }); }
    running = true;
    try {
        let result;
        do {
            again = false;
            let payload;
            try { payload = await loadPayload(); } catch (err) { return reply(502, { error: `리그 데이터를 읽지 못했습니다: ${err}` }); }
            result = await syncOnce(planEvents(payload));
        } while (again);
        return reply(200, { synced: true, ...result });
    } catch (err) {
        return reply(502, { error: String((err as Error)?.message ?? err) });
    } finally {
        running = false;
    }
}

Deno.serve(handle);
