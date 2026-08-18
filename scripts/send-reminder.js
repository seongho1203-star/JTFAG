// 라운드 알림 발송기. GitHub Actions가 매일 한 번 실행한다.
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

async function main() {
    const today = todayInSeoul();

    const leagueRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=payload`, { headers });
    if (!leagueRes.ok) throw new Error(`리그 데이터 조회 실패: ${leagueRes.status} ${await leagueRes.text()}`);
    const rows = await leagueRes.json();
    const payload = rows[0] && rows[0].payload;
    if (!payload) { console.log('데이터가 없습니다. 종료.'); return; }

    const roundDate = payload.nextRoundISO;
    const label = payload.nextRoundDate || '';
    if (!roundDate) {
        console.log(`등록된 라운드 날짜(nextRoundISO)가 없습니다. 표시 문구: "${label}" — 일정을 다시 저장하면 채워집니다.`);
        return;
    }

    // 알림 시점·문구는 앱의 관리자 메뉴에서 정한다. 없으면 아래 기본값을 쓴다.
    const settings = payload.notifySettings || {};
    const configured = normalizeDaysBefore(settings.daysBefore);
    const daysBefore = configured.length > 0 ? configured : envDaysBefore;
    const titleTemplate = settings.title || '⛳ {디데이} 라운드입니다';
    const bodyTemplate = settings.body || '{일정}';

    const remaining = daysUntil(roundDate, today);
    console.log(`오늘(KST) ${today} · 라운드 ${roundDate} · D-${remaining} · 알림 기준 ${daysBefore.map(d => 'D-' + d).join(', ')}`);
    if (!daysBefore.includes(remaining)) { console.log('알림 보낼 날이 아닙니다. 종료.'); return; }

    const fill = (s) => String(s)
        .replace(/\{남은일수\}/g, String(remaining))
        .replace(/\{디데이\}/g, ddayLabel(remaining))
        .replace(/\{일정\}/g, label || roundDate);

    await sendPush({
        supabaseUrl: SUPABASE_URL, headers,
        env: { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY },
        title: fill(titleTemplate),
        body: fill(bodyTemplate),
        tag: `round-${roundDate}`,
        dryRun: !!DRY_RUN
    });
}

main().catch(err => { console.error(err); process.exit(1); });
