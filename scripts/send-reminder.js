// 라운드·여행 알림 발송기. GitHub Actions가 매일 한 번 실행한다.
// 여행(payload.trips)도 같은 알림 날짜를 따른다 — 아래 remindTrips.
//
// appData.nextRoundISO(YYYY-MM-DD)와 오늘(한국시간)을 비교해, 남은 날이
// 설정된 알림 날짜 중 하나와 같을 때만 구독자 전원에게 푸시를 보낸다.
// 조건이 맞지 않으면 아무것도 하지 않고 끝난다.
//
// notifySettings.daysBefore는 배열이다 ([3, 0] = 3일 전 + 당일). 0이 당일.
// 예전 payload에는 숫자 하나로 들어 있어 normalizeDaysBefore가 둘 다 받는다.
// 이 기본값과 정규화 규칙은 api.js와 같아야 한다 — 한쪽만 고치지 말 것.

const { sendPush } = require('./push');

const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    VAPID_SUBJECT = 'mailto:seongho1203@gmail.com',
    REMIND_DAYS_BEFORE = '2',
    DRY_RUN = ''
} = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY })) {
    if (!v) { console.error(`환경변수 ${k}가 없습니다.`); process.exit(1); }
}

const TABLE = 'jtfag_league';

function normalizeDaysBefore(value) {
    const list = Array.isArray(value) ? value : String(value == null ? '' : value).split(',');
    const out = [];
    list.forEach(function (x) {
        const n = parseInt(x, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 30 && out.indexOf(n) === -1) out.push(n);
    });
    return out.sort(function (a, b) { return b - a; });
}

function ddayLabel(days) { return days === 0 ? '오늘' : `${days}일 뒤`; }

// 설정이 아예 없을 때만 쓰이는 예비값 (워크플로의 REMIND_DAYS_BEFORE)
const envDaysBefore = normalizeDaysBefore(REMIND_DAYS_BEFORE);

const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
};

// 러너는 UTC로 도니 한국 시간 기준 오늘 날짜를 직접 구한다.
function todayInSeoul() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

function daysUntil(target, today) {
    const a = Date.UTC(...target.split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n));
    const b = Date.UTC(...today.split('-').map(Number).map((n, i) => i === 1 ? n - 1 : n));
    return Math.round((a - b) / 86400000);
}

// 받는 사람에 따라 달라지는 자리표시자. 구독에 이름이 없으면 조용히 빈칸이 된다.
// 라운드와 여행이 같이 쓴다 — 호칭 규칙이 두 군데가 되지 않게.
function makeFill(ranks, extra) {
    return (s, sub) => {
        const name = (sub && sub.name) || '';
        const rank = name && ranks[name] ? `${ranks[name]}등급` : '';
        const 호칭 = name ? (rank ? `${rank} ${name}님` : `${name}님`) : '';
        let out = String(s);
        for (const [k, v] of Object.entries(extra)) out = out.split(`{${k}}`).join(v);
        return out
            .replace(/\{이름\}/g, name)
            .replace(/\{등급\}/g, rank)
            .replace(/\{호칭\}/g, 호칭)
            // 이름을 모르는 구독에서 자리표시자가 빠지면 공백이 겹친다. 정리해서 보낸다.
            .replace(/\s{2,}/g, ' ').trim();
    };
}

const push = (title, body, tag) => sendPush({
    supabaseUrl: SUPABASE_URL, headers,
    env: { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY },
    title, body, tag,
    dryRun: !!DRY_RUN
});

async function remindRound(payload, today, daysBefore, ranks) {
    const roundDate = payload.nextRoundISO;
    const label = payload.nextRoundDate || '';
    if (!roundDate) {
        console.log(`등록된 라운드 날짜(nextRoundISO)가 없습니다. 표시 문구: "${label}" — 일정을 다시 저장하면 채워집니다.`);
        return;
    }

    // 알림 문구는 앱의 관리자 메뉴에서 정한다. 없으면 아래 기본값을 쓴다.
    const settings = payload.notifySettings || {};
    const titleTemplate = settings.title || '⛳ {디데이} 라운드입니다';
    const bodyTemplate = settings.body || '{호칭} {일정} 라운딩입니다';

    const remaining = daysUntil(roundDate, today);
    console.log(`[라운드] ${roundDate} · D-${remaining}`);
    if (!daysBefore.includes(remaining)) { console.log('[라운드] 알림 보낼 날이 아닙니다.'); return; }

    const fill = makeFill(ranks, { 남은일수: String(remaining), 디데이: ddayLabel(remaining), 일정: label || roundDate });
    await push((sub) => fill(titleTemplate, sub), (sub) => fill(bodyTemplate, sub), `round-${roundDate}`);
}

// ── 여행 알림 ────────────────────────────────────────────────
// 라운드와 같은 알림 날짜(notifySettings.daysBefore)를 따른다.
//  · 출발 N일 전(N > 0) — 여행 이름·기간·첫날 골프장
//  · 0(당일)이 들어 있으면 여행 중 날마다 아침 — 그날 몇 일차·골프장·티오프·숙소
// 값은 payload.trips(trip.js)를 읽기만 한다. 거르는 규칙(날짜 모양)은 trip.js의 tripDays()와 같다.
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function weekday(iso) { return '일월화수목금토'[new Date(iso + 'T00:00:00Z').getUTCDay()]; }
function shortDate(iso) { return `${parseInt(iso.slice(5, 7), 10)}/${parseInt(iso.slice(8, 10), 10)}(${weekday(iso)})`; }
function tripDaysOf(trip) {
    return (trip && Array.isArray(trip.days) ? trip.days : [])
        .filter(d => d && ISO_RE.test(d.date))
        .slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

async function remindTrips(payload, today, daysBefore, ranks) {
    const trips = Array.isArray(payload.trips) ? payload.trips : [];
    for (const trip of trips) {
        const days = tripDaysOf(trip);
        if (!days.length) continue;
        const name = clean(trip.title) || '골프 여행';
        const first = days[0], last = days[days.length - 1];
        const until = daysUntil(first.date, today);

        if (until > 0) {
            console.log(`[여행] ${name} · 출발 D-${until}`);
            if (!daysBefore.includes(until)) continue;
            const span = days.length > 1 ? `${shortDate(first.date)} ~ ${shortDate(last.date)}` : shortDate(first.date);
            const course = clean(first.course);
            const fill = makeFill(ranks, {});
            await push(
                `🧳 ${ddayLabel(until)} ${name}`,
                (sub) => fill(`{호칭} ${span}${course ? ` · 1일차 ${course}` : ''}${clean(first.tee) ? ` ${clean(first.tee)}` : ''}`, sub),
                `trip-${trip.id}`);
            continue;
        }

        // 여행 중: 당일 알림(0)을 켜 둔 경우에만 날마다 보낸다.
        const i = days.findIndex(d => d.date === today);
        if (i < 0 || !daysBefore.includes(0)) continue;
        const d = days[i];
        const course = clean(d.course), tee = clean(d.tee), stay = clean(d.stay);
        if (!course && !tee && !stay) { console.log(`[여행] ${name} ${i + 1}일차 — 적힌 것이 없어 건너뜁니다.`); continue; }
        console.log(`[여행] ${name} · ${i + 1}일차`);
        const fill = makeFill(ranks, {});
        const parts = [tee && `티오프 ${tee}`, stay && `숙소 ${stay}`].filter(Boolean).join(' · ');
        await push(
            `🧳 오늘 ${i + 1}일차${course ? ` · ${course}` : ''}`,
            (sub) => fill(`{호칭} ${name}${parts ? ` · ${parts}` : ''}`, sub),
            `trip-${trip.id}`);
    }
}

async function main() {
    const today = todayInSeoul();

    const leagueRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=payload`, { headers });
    if (!leagueRes.ok) throw new Error(`리그 데이터 조회 실패: ${leagueRes.status} ${await leagueRes.text()}`);
    const rows = await leagueRes.json();
    const payload = rows[0] && rows[0].payload;
    if (!payload) { console.log('데이터가 없습니다. 종료.'); return; }

    // 알림 시점은 앱의 관리자 메뉴 → 알림 설정에서 정한다. 라운드와 여행이 같이 쓴다.
    const configured = normalizeDaysBefore((payload.notifySettings || {}).daysBefore);
    const daysBefore = configured.length > 0 ? configured : envDaysBefore;
    console.log(`오늘(KST) ${today} · 알림 기준 ${daysBefore.map(d => 'D-' + d).join(', ')}`);

    // 계급은 앱이 계산해 payload.currentRanks에 남겨 둔 값을 읽기만 한다.
    // 여기서 다시 계산하면 계급 규칙이 두 군데가 되어 언젠가 어긋난다.
    const ranks = payload.currentRanks || {};

    // 한쪽이 실패해도 다른 쪽은 보낸다.
    let failed = false;
    for (const job of [remindRound, remindTrips]) {
        try { await job(payload, today, daysBefore, ranks); }
        catch (err) { failed = true; console.error(err); }
    }
    if (failed) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
