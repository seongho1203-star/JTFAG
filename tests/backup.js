// 백업·복구 스크립트(scripts/backup.js · restore-backup.js) 검증.
// 가짜 Supabase(PostgREST) 서버를 띄워 스크립트를 진짜로 실행한다 — 실제 DB를 쓰지 않는다.
//   node tests/backup.js
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { pickExpired } = require('../scripts/backup.js');

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();

// ── 가짜 DB ──
const db = { league: null, money: null, backups: [], seq: 0, patched: 0, moneyUpserts: [] };
const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const table = u.pathname.replace('/rest/v1/', '');
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
        const json = (s, v) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(v === undefined ? '' : JSON.stringify(v)); };
        assert(/^Bearer /.test(req.headers.authorization || ''), '서비스 키 없이 호출');
        const m = req.method;
        if (table === 'jtfag_league') {
            if (m === 'GET') return json(200, db.league ? [{ payload: db.league }] : []);
            if (m === 'PATCH') { db.league = JSON.parse(body).payload; db.patched++; return json(204); }
        }
        if (table === 'jtfag_money') {
            if (db.money === 'missing') return json(404, { code: 'PGRST205', message: 'Could not find the table public.jtfag_money' });
            if (m === 'GET') { const off = Number(u.searchParams.get('offset') || 0); return json(200, db.money.slice(off, off + 1000)); }
            if (m === 'POST') { db.moneyUpserts.push(...JSON.parse(body)); return json(201); }
        }
        if (table === 'jtfag_backups') {
            if (db.backups === 'missing') return json(404, { code: 'PGRST205', message: 'Could not find the table public.jtfag_backups' });
            if (m === 'POST') {
                const row = { id: ++db.seq, taken_at: iso(Date.now()), ...JSON.parse(body) };
                db.backups.push(row); return json(201, [{ id: row.id, taken_at: row.taken_at }]);
            }
            if (m === 'DELETE') {
                const ids = u.searchParams.get('id').replace(/^in\.\(|\)$/g, '').split(',').map(Number);
                db.backups = db.backups.filter(r => !ids.includes(r.id)); return json(204);
            }
            if (m === 'GET') {
                let rows = db.backups.slice();
                const idEq = u.searchParams.get('id');
                if (idEq && idEq.startsWith('eq.')) rows = rows.filter(r => r.id === Number(idEq.slice(3)));
                const order = u.searchParams.get('order') || '';
                rows.sort((a, b) => order === 'id.desc' ? b.id - a.id : a.id - b.id);
                const lim = Number(u.searchParams.get('limit') || 1000); rows = rows.slice(0, lim);
                const cols = (u.searchParams.get('select') || '*').split(',');
                return json(200, rows.map(r => cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, r[c]]))));
            }
        }
        json(500, { error: 'unexpected ' + m + ' ' + req.url });
    });
});

function run(script, env = {}) {
    return new Promise(resolve => {
        const p = spawn(process.execPath, [path.join(__dirname, '../scripts', script)], {
            env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_KEY: 'svc', ...env }
        });
        let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
        p.on('close', code => resolve({ code, out }));
    });
}

const goodLeague = (extra = {}) => ({ totalRounds: 10, scores: { a: [1] }, nextRoundDate: '10월 14일 오후 5:34 무등산CC', clubFund: 120000, _rev: { by: 'x', n: 1 }, ...extra });

(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let r;

    // ── 오래된 것 가르기(순수 함수) ──
    {
        const now = Date.parse('2026-10-16T00:00:00Z');       // 금요일
        const row = (id, ageDays, kind = 'daily') => ({ id, taken_at: iso(now - ageDays * DAY), kind });
        // 2026-10-04는 일요일(한국 시각 기준)
        const sunday = iso(Date.parse('2026-10-04T03:00:00Z'));
        const rows = [
            row(1, 200), row(2, 100), { id: 3, taken_at: sunday, kind: 'daily' }, row(4, 41), row(5, 41, 'pre-restore'),
            row(6, 10), row(7, 9), row(8, 8), row(9, 7), row(10, 6), row(11, 5)
        ];
        const gone = pickExpired(rows, now);
        assert(gone.includes(1), '200일 지난 것은 지운다');
        assert(gone.includes(2), '100일 지난 평일 것은 지운다(30일 넘고 일요일 아님)');
        assert(!gone.includes(3), '12일 전 일요일 것… 30일 안이라 남는다');
        assert(gone.includes(4), '41일 지난 평일(토) 것은 지운다');
        assert(!gone.includes(5), '복구 직전 백업은 180일까지 남는다');
        assert.strictEqual(pickExpired([row(1, 400), row(2, 399), row(3, 398)], now).length, 0, '최근 5개는 늘 남긴다');
        console.log('✓ 오래된 백업 가르기(30일 · 일요일/직접/복구직전 180일 · 최근 5개 보호)');
    }

    // ── 백업 ──
    db.league = goodLeague(); db.money = [{ round: 10, name: '신성호', field: 'start', value: 300000, rev: 'a', updated_at: iso(Date.now()) }];
    r = await run('backup.js'); assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(db.backups.length, 1);
    assert.deepStrictEqual(db.backups[0].money, db.money, '금액 표도 함께 남긴다');
    assert.strictEqual(db.backups[0].kind, 'daily');
    console.log('✓ 첫 백업: payload + 금액');

    r = await run('backup.js'); assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(db.backups.length, 1); assert(/내용이 같아/.test(r.out));
    console.log('✓ 같은 내용이면 새로 안 남김');

    db.league = goodLeague({ _rev: { by: 'other', n: 99 } });       // 저장 도장만 바뀜
    r = await run('backup.js'); assert.strictEqual(db.backups.length, 1, '_rev만 바뀐 것은 같은 내용');
    console.log('✓ 저장 도장(_rev)만 바뀐 것은 같은 내용으로 본다');

    db.league = goodLeague({ clubFund: 130000 });
    r = await run('backup.js'); assert.strictEqual(db.backups.length, 2);
    // jsonb처럼 키 순서가 뒤바뀌어도 같은 내용이다
    const reordered = Object.fromEntries(Object.entries(db.league).reverse());
    db.league = reordered; r = await run('backup.js'); assert.strictEqual(db.backups.length, 2, '키 순서만 다른 것은 같은 내용');
    console.log('✓ 내용이 바뀌면 새 백업 · 키 순서만 다르면 같은 내용');

    r = await run('backup.js', { BACKUP_KIND: 'manual' }); assert.strictEqual(db.backups.length, 3);
    assert.strictEqual(db.backups[2].kind, 'manual');
    console.log('✓ 직접 백업은 같은 내용이어도 남긴다');

    // 정리: 오래된 평일 daily 둘(일요일이 아닌 날로 골라 심는다)은 지워지고, 오래된 일요일 것은 남는다.
    const kstDay = ms => new Date(ms + 9 * 3600000).getUTCDay();
    let weekdayAge = 45; while (kstDay(Date.now() - weekdayAge * DAY) === 0) weekdayAge++;
    let sundayAge = 45; while (kstDay(Date.now() - sundayAge * DAY) !== 0) sundayAge++;
    for (let i = 0; i < 4; i++) db.backups.push({ id: 10 + i, taken_at: iso(Date.now() - i * 1000), kind: 'manual', digest: 'f' + i, bytes: 1, payload: {}, money: null });
    db.backups.push({ id: -1, taken_at: iso(Date.now() - weekdayAge * DAY), kind: 'daily', digest: 'o1', bytes: 1, payload: {}, money: null });
    db.backups.push({ id: -2, taken_at: iso(Date.now() - (weekdayAge + 1 === sundayAge ? weekdayAge + 2 : weekdayAge + 1) * DAY), kind: 'daily', digest: 'o2', bytes: 1, payload: {}, money: null });
    db.backups.push({ id: -3, taken_at: iso(Date.now() - sundayAge * DAY), kind: 'daily', digest: 'o3', bytes: 1, payload: {}, money: null });
    db.seq = 1000;
    db.league = goodLeague({ clubFund: 140000 });
    r = await run('backup.js'); assert.strictEqual(r.code, 0, r.out);
    assert(!db.backups.some(b => b.id === -1), '오래된 평일 백업이 안 지워졌다: ' + r.out);
    assert(db.backups.some(b => b.id === -3), '오래된 일요일 백업은 남아야 한다');
    console.log('✓ 오래된 백업 정리 (평일 것 삭제 · 일요일 것 보존)');

    // 망가진 payload는 백업하지 않는다
    const before = db.backups.length;
    db.league = { totalRounds: 0 };
    r = await run('backup.js'); assert.notStrictEqual(r.code, 0); assert(/유효하지 않아/.test(r.out));
    assert.strictEqual(db.backups.length, before);
    console.log('✓ 비었거나 망가진 payload는 백업 거절(실패로 알림)');

    // 금액 표가 없는 저장소(예전 방식)도 백업된다
    db.league = goodLeague({ clubFund: 150000 }); db.money = 'missing';
    r = await run('backup.js'); assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(db.backups[db.backups.length - 1].money, null);
    console.log('✓ 금액 표가 없어도 백업된다');

    // 백업 표가 없으면 안내와 함께 실패
    const keep = db.backups; db.backups = 'missing';
    r = await run('backup.js'); assert.notStrictEqual(r.code, 0); assert(/backup\.sql/.test(r.out), r.out);
    db.backups = keep;
    console.log('✓ 백업 표가 없으면 backup.sql 안내와 함께 실패');

    // ── 복구 ──
    db.money = [{ round: 10, name: '신성호', field: 'start', value: 999, rev: 'z' }];
    const target = db.backups.find(b => b.payload && b.payload.clubFund === 130000);
    assert(target);
    db.league = goodLeague({ clubFund: 1 });                          // '망가진' 현재 상태
    r = await run('restore-backup.js'); assert.strictEqual(r.code, 0, r.out);
    assert(/#\d+ ·/.test(r.out) && db.patched === 0);
    console.log('✓ 번호 없이 실행하면 목록만');

    r = await run('restore-backup.js', { BACKUP_ID: String(target.id), DRY_RUN: '1' }); assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(db.patched, 0); assert.strictEqual(db.league.clubFund, 1); assert(/DRY RUN/.test(r.out));
    console.log('✓ dry run은 아무것도 안 고친다');

    const n0 = db.backups.length;
    r = await run('restore-backup.js', { BACKUP_ID: String(target.id), DRY_RUN: '0' }); assert.strictEqual(r.code, 0, r.out);
    assert.strictEqual(db.league.clubFund, 130000, 'payload가 되살아나야 한다');
    assert.strictEqual(db.league._rev.by, 'workflow', '저장 도장은 workflow로');
    assert.strictEqual(db.backups.length, n0 + 1);
    const pre = db.backups[db.backups.length - 1];
    assert.strictEqual(pre.kind, 'pre-restore'); assert.strictEqual(pre.payload.clubFund, 1, '고치기 직전 상태를 먼저 남긴다');
    assert.strictEqual(db.moneyUpserts.length, 0, '금액은 안 건드린다');
    console.log('✓ 되살리기: payload 복원 · 복구 직전 백업 · 도장 workflow · 금액 그대로');

    r = await run('restore-backup.js', { BACKUP_ID: String(target.id), DRY_RUN: '0', INCLUDE_MONEY: '1' }); assert.strictEqual(r.code, 0, r.out);
    assert(db.moneyUpserts.length >= 1 && db.moneyUpserts[0].value === 300000, JSON.stringify(db.moneyUpserts));
    console.log('✓ include_money면 금액도 덮어쓴다');

    r = await run('restore-backup.js', { BACKUP_ID: '99999', DRY_RUN: '0' }); assert.notStrictEqual(r.code, 0); assert(/없습니다/.test(r.out));
    db.backups.push({ id: 5000, taken_at: iso(Date.now()), kind: 'manual', digest: 'bad', bytes: 1, payload: { totalRounds: 0 }, money: null });
    const patched = db.patched;
    r = await run('restore-backup.js', { BACKUP_ID: '5000', DRY_RUN: '0' }); assert.notStrictEqual(r.code, 0); assert.strictEqual(db.patched, patched);
    console.log('✓ 없는 번호·망가진 백업은 거절');

    server.close();
    console.log('\n모두 통과');
})().catch(e => { console.error(e); process.exit(1); });
