// 구글 캘린더 동기화 함수(supabase/functions/calendar-sync) 검증.
// 가짜 Supabase · 가짜 구글(인증·캘린더)로 돌린다 — 실제 서버·실제 캘린더를 쓰지 않는다.
//   node --experimental-strip-types tests/calendar-sync.js
const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = {
    client_email: 'sync@test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
};
process.env.GOOGLE_SA_JSON = JSON.stringify(sa);
process.env.GCAL_CALENDAR_ID = 'me@example.com';
process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';

let payload = {};
const events = new Map();      // id → 이벤트
const log = [];
let tokenCalls = 0;

global.Deno = { env: { get: (k) => process.env[k] }, serve: () => {} };
global.fetch = async (url, init = {}) => {
    url = String(url);
    const method = init.method || 'GET';
    const json = (status, body) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith('https://fake.supabase.test/rest/v1/jtfag_league')) return json(200, [{ payload }]);
    if (url === 'https://oauth2.googleapis.com/token') { tokenCalls++; return json(200, { access_token: 'tok', expires_in: 3600 }); }
    if (url.startsWith('https://www.googleapis.com/calendar/v3/calendars/me%40example.com/events')) {
        assert.strictEqual(init.headers.Authorization, 'Bearer tok');
        const rest = url.split('/events')[1];
        const [p, qs] = rest.split('?');
        const id = p.replace(/^\//, '');
        if (method === 'GET') {
            const q = new URLSearchParams(qs);
            assert.strictEqual(q.get('privateExtendedProperty'), 'jtfag=1');
            const min = new Date(q.get('timeMin')).getTime();
            const items = [...events.values()].filter((e) => e.extendedProperties?.private?.jtfag === '1' && e.status !== 'cancelled')
                .filter((e) => new Date(e.end.dateTime ? e.end.dateTime + '+09:00' : e.end.date + 'T00:00:00+09:00').getTime() > min);
            return json(200, { items });
        }
        if (method === 'PUT') {
            const body = JSON.parse(init.body);
            if (!events.has(id)) return json(404, { error: 'notFound' });
            events.set(id, body); log.push(['PUT', body.summary]); return json(200, body);
        }
        if (method === 'POST') {
            const body = JSON.parse(init.body);
            assert(!events.has(body.id), '이미 있는 id로 만들려 함');
            events.set(body.id, body); log.push(['POST', body.summary]); return json(200, body);
        }
        if (method === 'DELETE') {
            const e = events.get(id); if (!e) return json(404, {});
            events.set(id, { ...e, status: 'cancelled' }); log.push(['DELETE', e.summary]); return json(204, null);
        }
    }
    throw new Error('예상 못 한 호출: ' + method + ' ' + url);
};

(async () => {
    const mod = await import(path.resolve(__dirname, '../supabase/functions/calendar-sync/index.ts'));
    const run = async () => { log.length = 0; const r = await mod.handle(new Request('https://x', { method: 'POST', body: '{}' })); return [r.status, await r.json()]; };
    const future = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

    // 1) 다음 라운드 + 여행 → 이벤트 생성
    const D1 = future(10), D2 = future(11), TR = future(30), TR2 = future(31);
    payload = {
        nextRoundISO: D1, nextRoundDate: '10월 14일 오후 5:34 무등산CC (송정-어등)', nextRoundNo: 11,
        trips: [{ id: 't1', title: '남도 여행', memo: '렌트카', days: [
            { date: TR, course: '디오션CC', tee: '오전 7:30', area: '여수', stay: '리조트', memo: '' },
            { date: TR2, course: '경도CC', tee: '', stay: '', memo: '' },
            { date: future(32), course: '', golf: 'no', tee: '', stay: '', memo: '귀가' }
        ] }]
    };
    let [st, r] = await run();
    assert.strictEqual(st, 200, JSON.stringify(r));
    // 라운드 1 + 여행 기간 1 + 여행 라운드 2 = 4
    assert.deepStrictEqual([r.created, r.updated, r.deleted, r.total], [4, 0, 0, 4]);
    const byKey = Object.fromEntries([...events.values()].map((e) => [e.extendedProperties.private.key, e]));
    assert.strictEqual(byKey['round-11'].summary, '⛳ 11차 라운드 · 무등산CC');
    assert.strictEqual(byKey['round-11'].start.dateTime, `${D1}T17:34:00`);
    assert.strictEqual(byKey['round-11'].location, '무등산CC');
    assert.strictEqual(byKey[`trip-t1-${TR}`].start.dateTime, `${TR}T07:30:00`);
    assert.strictEqual(byKey[`trip-t1-${TR}`].end.dateTime, `${TR}T12:30:00`);
    assert.strictEqual(byKey[`trip-t1-${TR2}`].start.date, TR2);            // 티오프 없으면 종일
    assert.strictEqual(byKey['trip-t1'].start.date, TR);
    assert.strictEqual(byKey['trip-t1'].end.date, future(33));              // 마지막 날 다음 날(제외 끝)
    assert.strictEqual(byKey['trip-t1'].transparency, 'transparent');
    assert(/^jt[0-9a-f]{32}$/.test(byKey['round-11'].id));
    console.log('✓ 생성: 라운드·여행 기간·여행 라운드');

    // 2) 그대로 다시 → 아무것도 안 쓴다
    [st, r] = await run();
    assert.deepStrictEqual([r.created, r.updated, r.deleted, r.unchanged], [0, 0, 0, 4]);
    assert.deepStrictEqual(log, []);
    assert.strictEqual(tokenCalls, 1, '토큰은 다시 쓴다');
    console.log('✓ 같은 내용이면 쓰기 0번 · 토큰 재사용');

    // 3) 시각을 고침 → 그 이벤트만 수정
    payload.nextRoundDate = '10월 14일 오전 7:10 무등산CC';
    [st, r] = await run();
    assert.deepStrictEqual([r.created, r.updated, r.deleted], [0, 1, 0]);
    assert.strictEqual(events.get(byKey['round-11'].id).start.dateTime, `${D1}T07:10:00`);
    console.log('✓ 시각 수정은 그 이벤트만 수정');

    // 4) 날짜를 옮김(같은 11차) → 같은 이벤트가 옮겨 간다, 새로 안 생긴다
    payload.nextRoundISO = D2;
    [st, r] = await run();
    assert.deepStrictEqual([r.created, r.updated, r.deleted], [0, 1, 0]);
    assert.strictEqual(events.get(byKey['round-11'].id).start.dateTime, `${D2}T07:10:00`);
    console.log('✓ 날짜 이동은 같은 이벤트를 옮김');

    // 5) 여행을 지움 → 앞으로의 이벤트 3개 삭제
    payload.trips = [];
    [st, r] = await run();
    assert.deepStrictEqual([r.created, r.updated, r.deleted], [0, 0, 3]);
    console.log('✓ 여행 삭제 → 이벤트 삭제');

    // 6) 지운 이벤트 id를 되살린다(PUT으로 부활 — 새로 만들 수 없다)
    payload.trips = [{ id: 't1', title: '남도 여행', days: [{ date: TR, course: '디오션CC', tee: '오전 7:30' }] }];
    [st, r] = await run();
    assert.strictEqual(st, 200, JSON.stringify(r));
    assert.strictEqual(events.get(byKey[`trip-t1-${TR}`].id).status, 'confirmed');
    console.log('✓ 지웠던 이벤트 되살리기');

    // 7) 지난 이벤트·내가 직접 넣은 이벤트는 안 건드린다
    const past = future(-5);
    events.set('jtpast', { id: 'jtpast', summary: '지난 라운드', status: 'confirmed', start: { date: past }, end: { date: future(-4) }, extendedProperties: { private: { jtfag: '1', key: 'round-9' } } });
    events.set('mine', { id: 'mine', summary: '치과', status: 'confirmed', start: { date: TR }, end: { date: TR } });
    payload.trips = [];
    await run();
    assert.strictEqual(events.get('jtpast').status, 'confirmed', '지난 이벤트가 지워졌다');
    assert.strictEqual(events.get('mine').summary, '치과');
    assert.strictEqual(events.get('mine').status, 'confirmed');
    console.log('✓ 지난 이벤트·남의 일정은 그대로');

    // 8) 여행 첫날이 다음 라운드와 같은 날 → 한 이벤트로 합쳐진다(차수·일정 시각 사용)
    payload = { nextRoundISO: TR, nextRoundDate: '11월 1일 오후 12:30 디오션CC', nextRoundNo: 12,
        trips: [{ id: 't2', title: '합침', days: [{ date: TR, course: '디오션CC', tee: '' }] }] };
    [st, r] = await run();
    assert.strictEqual(r.total, 2, '여행 기간 + 합쳐진 라운드 하나');
    const merged = [...events.values()].find((e) => e.extendedProperties?.private?.key === `trip-t2-${TR}`);
    assert.strictEqual(merged.summary, '⛳ 12차 · 디오션CC');
    assert.strictEqual(merged.start.dateTime, `${TR}T12:30:00`);
    console.log('✓ 여행 라운드와 같은 날 일정은 하나로');

    // 9) 설정이 없으면 503(앱은 조용히 넘어간다)
    delete process.env.GCAL_CALENDAR_ID;
    const mod2 = await import(path.resolve(__dirname, '../supabase/functions/calendar-sync/index.ts') + '?x=1');
    const res = await mod2.handle(new Request('https://x', { method: 'POST', body: '{}' }));
    assert.strictEqual(res.status, 503);
    console.log('✓ 설정이 없으면 503');
    console.log('\n모두 통과');
})().catch((e) => { console.error(e); process.exit(1); });
