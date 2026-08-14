// 라운드 알림 발송기. GitHub Actions가 매일 한 번 실행한다.
//
// appData.nextRoundISO(YYYY-MM-DD)와 오늘(한국시간)을 비교해, 남은 날이
// REMIND_DAYS_BEFORE와 같을 때만 구독자 전원에게 푸시를 보낸다.
// 조건이 맞지 않으면 아무것도 하지 않고 끝난다.

const webpush = require('web-push');

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
const PUSH_TABLE = 'push_subscriptions';
const envDaysBefore = parseInt(REMIND_DAYS_BEFORE, 10);

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
    const configuredDays = parseInt(settings.daysBefore, 10);
    const daysBefore = (Number.isFinite(configuredDays) && configuredDays > 0) ? configuredDays : envDaysBefore;
    const titleTemplate = settings.title || '⛳ {남은일수}일 뒤 라운드입니다';
    const bodyTemplate = settings.body || '{일정}';

    const remaining = daysUntil(roundDate, today);
    console.log(`오늘(KST) ${today} · 라운드 ${roundDate} · D-${remaining} · 알림 기준 D-${daysBefore}`);
    if (remaining !== daysBefore) { console.log('알림 보낼 날이 아닙니다. 종료.'); return; }

    const fill = (s) => String(s)
        .replace(/\{남은일수\}/g, String(remaining))
        .replace(/\{일정\}/g, label || roundDate);

    const subRes = await fetch(`${SUPABASE_URL}/rest/v1/${PUSH_TABLE}?select=*`, { headers });
    if (!subRes.ok) throw new Error(`구독 조회 실패: ${subRes.status} ${await subRes.text()}`);
    const subs = await subRes.json();
    if (subs.length === 0) { console.log('구독자가 없습니다. 종료.'); return; }

    const body = JSON.stringify({
        title: fill(titleTemplate),
        body: fill(bodyTemplate),
        tag: `round-${roundDate}`
    });

    if (DRY_RUN) { console.log(`[DRY RUN] 구독자 ${subs.length}명에게 보낼 내용:`, body); return; }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let sent = 0;
    const expired = [];
    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
            sent++;
        } catch (err) {
            // 404/410이면 구독이 만료된 것이라 정리한다
            if (err.statusCode === 404 || err.statusCode === 410) expired.push(s.endpoint);
            else console.error(`발송 실패 (${s.name || '이름없음'}):`, err.statusCode, err.body || err.message);
        }
    }
    console.log(`발송 완료: ${sent}/${subs.length}명`);

    for (const endpoint of expired) {
        await fetch(`${SUPABASE_URL}/rest/v1/${PUSH_TABLE}?endpoint=eq.${encodeURIComponent(endpoint)}`,
            { method: 'DELETE', headers });
    }
    if (expired.length) console.log(`만료된 구독 ${expired.length}건을 정리했습니다.`);
}

main().catch(err => { console.error(err); process.exit(1); });
