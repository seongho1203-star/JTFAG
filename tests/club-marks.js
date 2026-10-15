// node tests/club-marks.js — 로컬 마크·도장·캐시 검증. 실제 네트워크 요청 없음.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { make } = require('./prediction-passport');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
function worker(cache = new Map()) {
    const handlers = {}, calls = [];
    let offline = false, failed = '', skipped = 0;
    let catalog={version:1,marks:{}};
    const ctx = { URL, Response, Map, Promise,
        caches: {
            async open(name) {
                if (!cache.has(name)) cache.set(name, new Map());
                return { async match(url) { return cache.get(name).get(url)?.clone(); }, async put(url, value) { cache.get(name).set(url, value.clone()); } };
            },
            async keys() { return [...cache.keys()]; },
            async delete(name) { return cache.delete(name); }
        },
        async fetch(url) {
            calls.push(url);
            if (offline) throw new Error('offline');
            await new Promise(setImmediate);
            if (url.endsWith('/auto.json')) return new Response(JSON.stringify(catalog), {status:url===failed?404:200,headers:{'content-type':'application/json'}});
            return new Response('mark:' + url, {status: url === failed ? 404 : 200, headers:{'content-type':url.endsWith('.svg') ? 'image/svg+xml' : 'image/png'}});
        },
        self: {
            registration: { scope: 'https://seongho1203-star.github.io/JTFAG/' },
            clients: { async claim() {} },
            async skipWaiting() { skipped++; },
            addEventListener(type, handler) { handlers[type] = handler; }
        }
    };
    vm.createContext(ctx);vm.runInContext(source, ctx);
    const run = code => vm.runInContext(code, ctx);
    async function fire(type, extra = {}) {
        const waits = []; let response;
        handlers[type]({waitUntil: p => waits.push(p), respondWith: p => { response = p; }, ...extra});
        await Promise.all(waits);
        return response && await response;
    }
    return {run, fire, calls, cache, offline: () => {offline=true;}, fail: url => {failed=url;}, skipped: () => skipped, catalog:value=>{catalog=value;}};
}
async function main() {
    const app = make();
    const marks = app.run('Object.values(PASSPORT_MARKS).map(m=>m.file)');
    const bytes = new Set();
    for (const file of marks) {
        const b = fs.readFileSync(path.join(root, 'assets/club-marks/v1', file));
        assert.ok(b.length > 100, file);
        bytes.add(b.toString('base64'));
        if (file.endsWith('.svg')) {
            assert.match(b.toString(), /<svg/);
            assert.doesNotMatch(b.toString(), /<script|<foreignObject|(?:href|src)=["']https?:/i);
        } else assert.ok(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || b[0]===255 && b[1]===216, file);
    }
    assert.equal(bytes.size, marks.length, '골프장마다 다른 원본 마크');
    for (const key of app.run('Object.keys(PASSPORT_MARKS)')) {
        app.ctx.group = {key,name:key,visits:[{round:1}]};
        const html = app.run('passportStampHtml(group,0)');
        assert.match(html, /src="assets\/club-marks\/v1\//);
        assert.doesNotMatch(html, /passport-pin|⚑/);
    }
    app.ctx.group = {key:'jnj',name:'JNJ골프리조트',visits:[{round:1}]};
    assert.equal(app.run("passportClubKey('JNJ골프리조트')"), 'jnj');
    assert.match(app.run('passportStampHtml(group,0)'), /src="assets\/club-marks\/v1\/jnj\.jpeg"/);
    app.ctx.group = {key:'unknown',name:'UNKNOWN CC',visits:[{round:1}]};
    const missing = app.run('passportStampHtml(group,0)');
    assert.doesNotMatch(missing, /<img/);
    assert.match(missing, />UNKN<\/span>/, '미등록 마크는 임의 이미지 대신 이름을 표시');
    const w = worker();
    const urls = Array.from(w.run('CLUB_MARK_URLS'));
    assert.deepEqual(urls.map(u=>u.split('/').pop()).sort(),Array.from(marks).sort(), '화면·서비스워커 파일 목록 일치');
    await w.fire('install');
    assert.equal(w.skipped(),1);
    assert.equal(w.calls.length, urls.length + 6);
    const count = w.calls.length;
    await w.fire('message',{data:{type:'CACHE_RANK_ICONS'}});
    assert.equal(w.calls.length,count+1,'재접속 시 자동 목록만 확인하고 이미지 재다운로드 없음');
    for (const url of urls) {
        const response = await w.fire('fetch',{request:{method:'GET',url,mode:'no-cors'}});
        assert.equal(await response.text(),'mark:'+url);
    }
    assert.equal(w.calls.length,count+1,'도장 표시 시 캐시만 사용');
    w.offline();
    assert.ok((await w.fire('fetch',{request:{method:'GET',url:urls[0],mode:'no-cors'}})).ok);
    assert.equal(w.calls.length,count+1);
    assert.equal(await w.fire('fetch',{request:{method:'GET',url:'https://other.example/logo.png',mode:'no-cors'}}),undefined);
    const failed = worker();failed.fail(urls[0]);await failed.fire('install');
    assert.equal(failed.skipped(),1,'한 이미지 오류가 SW 설치를 막지 않음');
    const before = failed.calls.length;
    failed.fail('');await failed.fire('message',{data:{type:'CACHE_RANK_ICONS'}});
    assert.equal(failed.calls.length,before+2,'목록 확인 후 빠진 이미지 한 장만 다시 다운로드');
    w.cache.set('jtfag-club-marks-old',new Map());w.cache.set('jtfag-rank-icons-old',new Map());w.cache.set('other-app-cache',new Map());
    await w.fire('activate');
    assert.ok(!w.cache.has('jtfag-club-marks-old'));assert.ok(!w.cache.has('jtfag-rank-icons-old'));
    assert.ok(w.cache.has('other-app-cache'));assert.ok(w.cache.has('jtfag-rank-icons-v1'));assert.ok(w.cache.has('jtfag-club-marks-v1'));
    const auto=worker(); await auto.fire('install');
    const file='auto-'+'a'.repeat(64)+'.png', url=auto.run('CLUB_MARK_BASE')+file;
    auto.catalog({version:1,marks:{'신규골프장':{file},bad:{file:'../../other.js'}}});
    const initial=auto.calls.length;
    await auto.fire('message',{data:{type:'CACHE_RANK_ICONS'}});
    assert.equal(auto.calls.length,initial+2,'새 자동 마크만 추가 저장');
    await auto.fire('message',{data:{type:'CACHE_RANK_ICONS'}});
    assert.equal(auto.calls.filter(x=>x===url).length,1,'저장된 자동 마크 재다운로드 없음');
    auto.offline();
    assert.equal(await (await auto.fire('fetch',{request:{method:'GET',url,mode:'no-cors'}})).text(),'mark:'+url);
    const index=await auto.fire('fetch',{request:{method:'GET',url:auto.run('CLUB_MARK_INDEX')+'?ver=1',mode:'cors'}});
    assert.equal((await index.json()).marks['신규골프장'].file,file,'오프라인에서도 자동 목록 복원');
    const client=make();let loads=0,refreshes=0;
    client.ctx.fetch=async()=>{loads++;return {ok:true,json:async()=>({version:1,marks:{'신규골프장':{file,ink:'#246842',background:'#ffffff'},'악성골프장':{file:'https://evil.example/logo.png',ink:'#ffffff',background:'#ffffff'},jnj:{file,ink:'#246842',background:'#ffffff'}}})};};
    client.ctx.refreshTripPage=()=>{refreshes++;};client.run("tripSection='passport'");
    await Promise.all([client.run('loadPassportMarks()'),client.run('loadPassportMarks()')]);
    assert.equal(loads,1);assert.equal(refreshes,1);
    client.ctx.group={key:'신규골프장',name:'신규골프장CC',visits:[{round:1}]};
    assert.ok(client.run('passportStampHtml(group,0)').includes(file));
    assert.equal(client.run("passportMark('악성골프장')"),undefined);
    assert.equal(client.run("passportMark('jnj').file"),'jnj.jpeg','사용자 제공 기존 마크를 자동 결과로 교체하지 않음');
    client.ctx.fetch=async()=>{throw new Error('offline');};client.setNow('2026-10-26T06:02:00+09:00');
    await client.run('loadPassportMarks()');
    assert.equal(client.run("passportMark('신규골프장').file"),file,'조회 실패 시 이미 받은 목록 유지');
    console.log('PASS: 골프장별 실제 마크 파일·도장 연결·안전한 SVG·캐시 파일 목록 일치');
    console.log('PASS: 최초 저장·재다운로드 없음·오프라인 표시·부분 실패 재시도·등급 이미지와 기존 캐시 보존');
    console.log('PASS: 신규 자동 마크·목록 갱신·중복 조회 방지·오프라인 복원·외부 경로 거부·기존 마크 우선');
}
main().catch(err => { console.error(err);process.exitCode=1; });
