// 사진 목록 복구기.
//
// 차수를 지우면(removeRound) payload.roundPhotos에서 그 차수의 URL 목록이 잘려 나간다.
// 그런데 **Storage의 파일 자체는 지워지지 않는다** — 파일을 지우는 건 갤러리에서
// 사진 한 장을 직접 지울 때(deletePhotoFromStorage)뿐이다.
// 그래서 버킷을 훑어 URL 목록을 다시 만들어 넣으면 사진이 돌아온다.
//
// 업로드 경로가 `round{차수}/{시각}_{난수}.jpg`라 **어느 차수 사진인지 경로에 들어 있고,
// 파일명이 업로드 시각이라 순서까지 복원된다.**
//
// 있는 것을 지우지 않는다. 지금 payload에 있는 항목은 그대로 두고, 빠진 것만 채운다
// (예전 base64 사진이 남아 있어도 사라지지 않는다).
//
// 기본은 확인만 하는 dry run이다. 실제로 고치려면 DRY_RUN을 비운다.

const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    DRY_RUN = '1'
} = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY })) {
    if (!v) { console.error(`환경변수 ${k}가 없습니다.`); process.exit(1); }
}

const TABLE = 'jtfag_league';
const BUCKET = 'round-photos';

const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
};

// Storage의 한 폴더 안 파일을 모두 가져온다. 100개씩 끊어 받는다.
async function listFolder(prefix) {
    const out = [];
    for (let offset = 0; ; offset += 100) {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
            method: 'POST', headers,
            body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
        });
        if (!res.ok) throw new Error(`목록 조회 실패(${prefix}): ${res.status} ${await res.text()}`);
        const page = await res.json();
        // 폴더 자체는 id가 없다. 파일만 거른다.
        out.push(...page.filter(f => f.id));
        if (page.length < 100) break;
    }
    return out;
}

function publicUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function main() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1&select=payload`, { headers });
    if (!res.ok) throw new Error(`리그 데이터 조회 실패: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    const payload = rows[0] && rows[0].payload;
    if (!payload) { console.log('데이터가 없습니다. 종료.'); return; }

    const total = payload.totalRounds || 0;
    const current = Array.isArray(payload.roundPhotos) ? payload.roundPhotos : [];
    console.log(`차수 ${total}개 · 지금 payload의 사진: [${
        Array.from({ length: total }, (_, r) => (current[r] || []).length).join(', ')}]`);

    const restored = [];
    let added = 0;
    for (let r = 0; r < total; r++) {
        const have = Array.isArray(current[r]) ? current[r].slice() : [];
        const files = await listFolder(`round${r + 1}`);
        // 파일명이 업로드 시각으로 시작하므로 이름순이 곧 올린 순서다.
        const urls = files
            .map(f => publicUrl(`round${r + 1}/${f.name}`))
            .filter(u => !have.includes(u));
        added += urls.length;
        restored.push([...have, ...urls]);
        console.log(`  ${r + 1}차: 있던 ${have.length}장 + 되살린 ${urls.length}장 = ${have.length + urls.length}장`);
    }

    // 표에 없는 차수의 사진이 버킷에 남아 있을 수 있다. 알려만 주고 건드리지 않는다.
    for (let r = total; r < total + 5; r++) {
        const files = await listFolder(`round${r + 1}`);
        if (files.length) console.log(`  (참고) ${r + 1}차 폴더에 ${files.length}장이 있지만 차수가 없어 넣지 않았습니다.`);
    }

    if (added === 0) {
        console.log('\n되살릴 사진이 없습니다. payload가 이미 온전합니다.');
        return;
    }

    if (DRY_RUN) {
        console.log(`\n[DRY RUN] ${added}장을 되살릴 수 있습니다. 실제로 고치려면 dry_run을 끄고 다시 실행하세요.`);
        return;
    }

    payload.roundPhotos = restored;
    const put = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.1`, {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ payload })
    });
    if (!put.ok) throw new Error(`저장 실패: ${put.status} ${await put.text()}`);
    console.log(`\n${added}장을 되살렸습니다. 앱을 새로고침하면 보입니다.`);
}

main().catch(err => { console.error(err); process.exit(1); });
