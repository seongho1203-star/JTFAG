// 사진 저장소 용량 알림(scripts/check-photo-storage.js) 확인. 가짜 서버만 쓰며 실제 DB·푸시는 건드리지 않는다.
// 실행: NODE_PATH=<web-push가 든 node_modules 상위> node tests/photo-storage-alert.js
// (web-push 없이 돌리려면 NODE_PATH에 빈 흉내 모듈을 두면 된다 — dry run이라 실제 발송은 안 한다.)
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const MB = 1024 * 1024;
function run(rows) {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', () => {
                res.setHeader('Content-Type', 'application/json');
                if (req.url.includes('/rpc/photo_storage_usage')) return res.end(JSON.stringify(rows));
                if (req.url.includes('/push_subscriptions')) return res.end(JSON.stringify([
                    { name: '신성호', endpoint: 'e1', p256dh: 'x', auth: 'y' },
                    { name: '김지명', endpoint: 'e2', p256dh: 'x', auth: 'y' }]));
                res.statusCode = 404; res.end('{}');
            });
        }).listen(0, () => {
            const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${srv.address().port}`, SUPABASE_SERVICE_KEY: 'k',
                VAPID_PUBLIC_KEY: 'p', VAPID_PRIVATE_KEY: 'q', DRY_RUN: '1' };
            const child = spawn('node', [path.join(__dirname, '../scripts/check-photo-storage.js')], { env });
            let out = '';
            child.stdout.on('data', c => out += c);
            child.stderr.on('data', c => out += c);
            child.on('close', code => { srv.close(); resolve({ code, out }); });
        });
    });
}

let fail = 0;
function check(name, ok, info) { console.log((ok ? 'PASS: ' : 'FAIL: ') + name + (ok ? '' : '\n' + info)); if (!ok) fail++; }

(async () => {
    let r = await run([{ folder: 'round1', files: 3, bytes: 300 * MB }]);
    check('30%면 알림 없음', r.code === 0 && /미만이라 알림을 보내지 않습니다/.test(r.out) && !/DRY RUN/.test(r.out), r.out);

    r = await run([{ folder: 'round11', files: 40, bytes: 700 * MB }, { folder: 'round9', files: 20, bytes: 130 * MB }, { folder: 'thumbs', files: 60, bytes: 3 * MB }]);
    check('81%면 신성호에게만 알림', r.code === 0 && /\[DRY RUN\] 신성호/.test(r.out) && !/김지명/.test(r.out)
        && /81% 사용/.test(r.out) && /가장 큰 차수 11차/.test(r.out), r.out);

    r = await run([{ folder: 'round1', files: 3, bytes: 800 * MB }, { folder: 'x', files: 1, bytes: 24 * MB }]);
    check('정확히 80.5%도 알림', /\[DRY RUN\] 신성호/.test(r.out), r.out);

    r = await run('not-an-array');
    check('이상한 응답은 실패로 끝남', r.code === 1, r.out);
    process.exit(fail ? 1 : 0);
})();
