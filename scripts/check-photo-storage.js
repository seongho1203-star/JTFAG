// 사진 저장소 용량 알림. GitHub Actions가 매주 한 번 실행한다(.github/workflows/photo-storage.yml).
//
// round-photos 통의 사용량(DB 함수 photo_storage_usage — supabase/photo-usage.sql)이
// 한도(무료 1GB)의 80%를 넘으면 사진 관리자(SCORE_OWNER)의 기기에만 푸시를 보낸다.
// 넘지 않으면 아무것도 안 하고 끝난다. 한도·기준은 앱의 관리자 메뉴 `📸 사진 용량 확인`과 같은 값이다
// (api.js 쪽은 PHOTO_STORAGE_LIMIT, 여기는 LIMIT_BYTES — 한쪽만 고치지 말 것).

const { sendPush } = require('./push');

const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
    OWNER_NAME = '신성호',
    DRY_RUN = ''
} = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY })) {
    if (!v) { console.error(`환경변수 ${k}가 없습니다.`); process.exit(1); }
}

const LIMIT_BYTES = 1024 * 1024 * 1024;
const ALERT_PERCENT = 80;

function sizeText(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + 'GB';
    return (bytes / 1024 / 1024).toFixed(0) + 'MB';
}

const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
};

(async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/photo_storage_usage`, { method: 'POST', headers, body: '{}' });
    if (!res.ok) throw new Error(`사진 용량 조회 실패: ${res.status} ${await res.text()} (supabase/photo-usage.sql을 실행했는지 확인)`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('사진 용량 응답이 올바르지 않습니다.');

    const total = rows.reduce((a, r) => a + (Number(r.bytes) || 0), 0);
    const percent = total / LIMIT_BYTES * 100;
    console.log(`사진 저장소 ${sizeText(total)} / ${sizeText(LIMIT_BYTES)} (${percent.toFixed(1)}%)`);

    if (percent < ALERT_PERCENT) { console.log(`${ALERT_PERCENT}% 미만이라 알림을 보내지 않습니다.`); return; }

    // 어느 차수가 가장 큰지 함께 알린다 — 지울 곳을 바로 정할 수 있게.
    const biggest = rows.filter(r => /^round\d+$/.test(r.folder))
        .sort((a, b) => (Number(b.bytes) || 0) - (Number(a.bytes) || 0))[0];
    const left = Math.max(0, LIMIT_BYTES - total);
    await sendPush({
        supabaseUrl: SUPABASE_URL, headers, env: process.env,
        title: `📸 사진 저장소 ${Math.floor(percent)}% 사용`,
        body: `${sizeText(total)} 사용 · 남은 공간 ${sizeText(left)}` +
            (biggest ? ` · 가장 큰 차수 ${biggest.folder.slice(5)}차(${sizeText(Number(biggest.bytes))})` : '') +
            '. 지난 차수 사진을 삭제해 주세요.',
        tag: 'photo-storage',
        onlyName: OWNER_NAME,
        dryRun: !!DRY_RUN
    });
})().catch(err => { console.error(err); process.exit(1); });
