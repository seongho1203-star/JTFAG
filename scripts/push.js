// 웹푸시 발송 공용부.
// 라운드 알림(send-reminder.js)과 스코어카드 판독(read-scorecard.js)이 함께 쓴다.
// 발송 규칙을 한 곳에만 두려고 뺀 것이니, 한쪽만 고치는 일이 없도록 여기를 고칠 것.

const webpush = require('web-push');

const PUSH_TABLE = 'push_subscriptions';

let vapidReady = false;
function setVapid(env) {
    if (vapidReady) return;
    webpush.setVapidDetails(
        env.VAPID_SUBJECT || 'mailto:seongho1203@gmail.com',
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
    );
    vapidReady = true;
}

// title·body는 문자열이거나, 구독 한 건을 받아 문자열을 돌려주는 함수다.
// 함수를 주면 사람마다 다른 문구를 보낼 수 있다 ("학등급 신성호님 …").
function textFor(v, sub) { return typeof v === 'function' ? v(sub) : v; }

// onlyName을 주면 그 사람 기기에만 보낸다.
// 한 사람이 폰과 PC를 따로 구독했을 수 있어 이름이 같은 구독은 모두 받는다.
// 만료된 구독(404/410)은 보내면서 정리한다.
async function sendPush({ supabaseUrl, headers, env, title, body, tag, onlyName, dryRun }) {
    const res = await fetch(`${supabaseUrl}/rest/v1/${PUSH_TABLE}?select=*`, { headers });
    if (!res.ok) throw new Error(`구독 조회 실패: ${res.status} ${await res.text()}`);

    const all = await res.json();
    const subs = onlyName ? all.filter(s => s.name === onlyName) : all;
    if (subs.length === 0) {
        console.log(onlyName ? `${onlyName}의 구독이 없어 알림을 건너뜁니다.` : '구독자가 없어 알림을 건너뜁니다.');
        return { sent: 0, total: 0 };
    }

    if (dryRun) {
        subs.forEach(s => console.log(`[DRY RUN] ${s.name || '이름없음'}:`,
            JSON.stringify({ title: textFor(title, s), body: textFor(body, s), tag })));
        return { sent: 0, total: subs.length };
    }

    setVapid(env);

    let sent = 0;
    const expired = [];
    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                JSON.stringify({ title: textFor(title, s), body: textFor(body, s), tag }));
            sent++;
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) expired.push(s.endpoint);
            else console.error(`발송 실패 (${s.name || '이름없음'}):`, err.statusCode, err.body || err.message);
        }
    }
    console.log(`발송 완료: ${sent}/${subs.length}명`);

    for (const endpoint of expired) {
        await fetch(`${supabaseUrl}/rest/v1/${PUSH_TABLE}?endpoint=eq.${encodeURIComponent(endpoint)}`,
            { method: 'DELETE', headers });
    }
    if (expired.length) console.log(`만료된 구독 ${expired.length}건을 정리했습니다.`);

    return { sent, total: subs.length };
}

module.exports = { sendPush, PUSH_TABLE };
