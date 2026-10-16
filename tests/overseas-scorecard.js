// node tests/overseas-scorecard.js — 해외(전반·후반 두 장) 판독 검증.
// 실제 AI·Supabase·git 원격을 쓰지 않는다: 가짜 SDK와 가짜 서버, 임시 저장소로 scripts/read-scorecard.js를 돌린다.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { execFileSync, spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'read-scorecard.js');
const NAMES = ['이관교', '김지명', '신성호', '박승수'];

function startServer(state) {
    return new Promise(res => {
        const srv = http.createServer((req, rsp) => {
            if (req.url.startsWith('/img/')) {
                rsp.writeHead(200, { 'content-type': 'image/png' });
                return rsp.end(decodeURIComponent(req.url.slice(5)));
            }
            if (req.method === 'GET') { rsp.writeHead(200, { 'content-type': 'application/json' }); return rsp.end(JSON.stringify([{ payload: state.payload }])); }
            let body = ''; req.on('data', c => body += c); req.on('end', () => { state.payload = JSON.parse(body).payload; rsp.writeHead(204); rsp.end(); });
        }).listen(0, () => res(srv));
    });
}

async function run(tagA, tagB, extra = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ovs-'));
    const remote = path.join(dir, 'remote.git'), work = path.join(dir, 'work');
    execFileSync('git', ['init', '-q', '--bare', remote]);
    fs.mkdirSync(work);
    fs.copyFileSync(path.join(root, 'stats.js'), path.join(work, 'stats.js'));
    const git = (...a) => execFileSync('git', a, { cwd: work, stdio: 'pipe' });
    git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't');
    git('add', '.'); git('commit', '-qm', 'init'); git('branch', '-M', 'main');
    git('remote', 'add', 'origin', remote); git('push', '-q', '-u', 'origin', 'main');

    const state = { payload: { scores: Object.fromEntries(NAMES.map(n => [n, []])), scoreRequests: [] } };
    const srv = await startServer(state);
    const base = `http://127.0.0.1:${srv.address().port}`;
    state.payload.scoreRequests.push({ id: 'r1', round: 12, overseas: true, url: `${base}/img/${tagA}`, url2: `${base}/img/${tagB}`, time: '10/16 09:00', by: '신성호', status: '대기', note: '', ...extra });

    const pre = path.join(dir, 'pre.js');
    fs.writeFileSync(pre, `const M = require('module'); const o = M._resolveFilename;
M._resolveFilename = function (r, ...a) { return r === '@anthropic-ai/sdk' ? __filename : r === 'web-push' ? __dirname + '/wp.js' : o.call(this, r, ...a); };
module.exports = require(${JSON.stringify(path.join(__dirname, 'overseas-fake-sdk.js'))});`);
    fs.writeFileSync(path.join(dir, 'wp.js'), 'module.exports = {};');
    const out = await new Promise(resolve => {
        let log = '';
        const p = spawn(process.execPath, ['-r', pre, script], { cwd: work, env: { PATH: process.env.PATH, ANTHROPIC_API_KEY: 'x', SUPABASE_URL: base, SUPABASE_SERVICE_KEY: 'x' } });
        p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
        p.on('close', () => resolve(log));
    });
    srv.close();
    return { req: state.payload.scoreRequests[0], stats: fs.readFileSync(path.join(work, 'stats.js'), 'utf8'), log: out };
}

(async () => {
    // 1. 정상 — 영문 이름이 성으로 붙고, 전반 + 후반이 18홀로 합쳐져 쓰인다.
    let r = await run('F-ok', 'B-ok');
    assert.equal(r.req.status, '완료', r.req.note + r.log);
    assert.match(r.stats, /"12": \{/);
    const blk = r.stats.slice(r.stats.indexOf('"12": {'));
    assert.match(blk, /par: \[4, 4, 5, 3, 4, 3, 5, 4, 4,   4, 5, 3, 4, 4, 4, 3, 5, 4\]/);
    assert.match(blk, /"이관교": \[1, 0, 1, 0, 1, 1, 1, 1, 0,   0, 1, 0, 1, 1, 0, 1, 0, 0\]/);   // LEE → 이관교
    assert.match(blk, /"박승수": \[1, 0, 0, 0, 1, 0, 0, 0, 0,   0, 0, 0, 0, 0, 0, 1, 0, 1\]/);   // PARK → 박승수
    console.log('✓ 영문 성으로 우리 넷에 붙고 전반+후반이 18홀로 합쳐진다');

    // 2. 사진이 바뀌어 올라와도(후반이 먼저) 시작 홀 번호로 순서를 바로잡는다.
    r = await run('B-ok', 'F-ok');
    assert.equal(r.req.status, '완료', r.req.note);
    assert.match(r.stats.slice(r.stats.indexOf('"12": {')), /"이관교": \[1, 0, 1, 0, 1, 1, 1, 1, 0,   0, 1/);
    console.log('✓ 전반·후반이 바뀌어 올라와도 바로잡는다');

    // 3. 한 번 틀리게 읽혀도 다시 읽어 맞는 쪽을 쓴다.
    r = await run('F-flaky', 'B-ok');
    assert.equal(r.req.status, '완료', r.req.note);
    assert.match(r.stats.slice(r.stats.indexOf('"12": {')), /"이관교": \[1, 0, 1,/);   // 틀린 첫 읽기(6타 → +2)가 아니라 맞는 값
    console.log('✓ 읽을 때마다 달라지면 다시 읽어 일치하는 값을 쓴다');

    // 4. 세 번 다 다르면 쓰지 않고 실패.
    const before = fs.readFileSync(path.join(root, 'stats.js'), 'utf8');
    r = await run('F-chaos', 'B-ok');
    assert.equal(r.req.status, '실패');
    assert.match(r.req.note, /서로 달라 확정할 수 없습니다/);
    assert.equal(r.stats, before);
    console.log('✓ 끝까지 안 맞으면 stats.js를 건드리지 않고 실패');

    // 5. 같은 쪽을 두 번 올림.
    r = await run('F-ok', 'F-ok');
    assert.equal(r.req.status, '실패');
    assert.match(r.req.note, /전반\(1~9번홀\)으로 읽혔습니다/);
    assert.equal(r.stats, before);
    console.log('✓ 전반을 두 번 올리면 거절');

    // 6. 비어 있는 칸.
    r = await run('F-blank', 'B-ok');
    assert.equal(r.req.status, '실패');
    assert.match(r.req.note, /4번홀 타수가 비어 있거나/);
    assert.equal(r.stats, before);
    console.log('✓ 비어 있는 홀이 있으면 거절');

    // 7. 퍼트 열 같은 건 스키마에 없으므로 읽을 수 없고, 해외 요청이 아닌 국내 요청은 예전 길(url 하나)을 그대로 탄다 — 분기만 확인.
    const src = fs.readFileSync(script, 'utf8');
    assert.match(src, /if \(req\.overseas\) return processOverseas/);
    console.log('✓ 국내 요청은 예전 길 그대로');
    console.log('모두 통과');
})().catch(e => { console.error(e); process.exit(1); });
