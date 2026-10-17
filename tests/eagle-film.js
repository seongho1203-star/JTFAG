// node tests/eagle-film.js — 가상 영상·DOM·캐시만 사용. 서버 쓰기·실제 알림 없음.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const tick = () => new Promise(setImmediate);

function app(options = {}) {
    const overlays = [], frames = [], timers = new Map(), storage = new Map(), requests = [], plays = [];
    let nextTimer = 0, mode = options.mode || 'allow';
    const listeners = new Map();
    const document = {hidden:false, activeElement:null};
    class Element {
        constructor(tag='div', attrs='') {
            this.tag = tag; this.attributes = {}; this.nodes = []; this.events = {}; this.style = {};
            this.className = (attrs.match(/class="([^"]*)"/) || [,''])[1];
            this.disabled = false; this.hidden = false; this.isConnected = true;
            this.paused = true; this.ended = false; this.currentTime = 0; this.duration = 12; this.muted = true;
            this.classList = {
                contains: name => this.className.split(' ').includes(name),
                add: (...names) => { for (const name of names) if (!this.classList.contains(name)) this.className += ' '+name; },
                remove: (...names) => { this.className = this.className.split(' ').filter(x=>!names.includes(x)).join(' '); },
                toggle: (name, force) => { const yes = force === undefined ? !this.classList.contains(name) : force; this.classList[yes?'add':'remove'](name); return yes; }
            };
        }
        set innerHTML(html) {
            this.html = html;
            this.nodes = [...html.matchAll(/<(div|img|video|button|i|link)\b([^>]*)>/g)].map(m=>new Element(m[1],m[2]));
        }
        get innerHTML() { return this.html; }
        set src(value) { this._src = value; if (this.tag==='video') requests.push(value); }
        get src() { return this._src; }
        setAttribute(k,v) { this.attributes[k]=String(v); }
        removeAttribute(k) { delete this.attributes[k]; if (k==='src') this._src=''; }
        contains(el) { return el===this || this.nodes.includes(el); }
        querySelector(s) { return this.nodes.find(el=>s.endsWith(' i') ? el.tag==='i' : s.startsWith('.') ? el.classList.contains(s.slice(1)) : el.tag===s) || null; }
        addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
        emit(k) { (this.events[k] || []).forEach(fn=>fn({})); }
        focus() { document.activeElement=this; }
        remove() { const i=overlays.indexOf(this); if (i>=0) overlays.splice(i,1); this.isConnected=false; }
        pause() { this.paused=true; }
        load() { this.loads=(this.loads||0)+1; }
        play() {
            plays.push(this.muted);
            if (mode==='blocked' || mode==='no-audio' && !this.muted) return Promise.reject(new Error('NotAllowedError'));
            if (this.ended) { this.ended=false; this.currentTime=0; }
            this.paused=false; this.emit('playing');
            return Promise.resolve();
        }
    }
    const prior = new Element('button');
    document.activeElement = prior;
    Object.assign(document, {
        createElement: tag=>new Element(tag),
        body:{appendChild:el=>overlays.push(el)}, head:{appendChild() {}},
        getElementById:()=>null,
        querySelector: s=>overlays.find(el=>s.split(',').some(c=>el.classList.contains(c.trim().slice(1)))) || null,
        addEventListener:(k,fn)=>listeners.set(k,fn), removeEventListener:(k,fn)=>{if(listeners.get(k)===fn) listeners.delete(k);}
    });
    const golfers=['이관교','김지명','신성호','박승수'];
    const ctx={console,document,navigator:{userActivation:{isActive:!!options.gesture}},
        matchMedia:()=>({matches:!!options.reduce}),
        requestAnimationFrame:fn=>frames.push(fn),
        setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},
        clearTimeout:id=>timers.delete(id),
        localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
        golfers, appData:{scores:Object.fromEntries(golfers.map(g=>[g,[80,81,79]]))},
        rankedRoundsList:[0,1,2], golferRankHistory:Object.fromEntries(golfers.map(g=>[g,g==='신성호'?[0,0,0]:[1,1,1]])),
        eagleStreak:r=>{let n=0;for(let i=r.length-1;i>=0&&r[i]===0;i--)n++;return n;},
        escapeHtml:x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
        EAGLE_HERO_URL:'known-legacy.gif', SOUND_CONFIG:{}, innerWidth:390,innerHeight:844
    };
    ctx.window=ctx;vm.createContext(ctx);
    vm.runInContext(source('ui-effects.js'),ctx);
    vm.runInContext(source('eagle-film.js'),ctx);
    const run=code=>vm.runInContext(code,ctx);
    run('entranceReady=true');
    return {ctx,run,overlays,frames,timers,storage,requests,plays,prior,listeners,
        mode:value=>{mode=value;}, frame:()=>frames.splice(0).forEach(fn=>fn()),
        timer:delay=>{const item=[...timers].find(([,v])=>v.delay===delay); assert.ok(item,`timer ${delay}`); timers.delete(item[0]);item[1].fn();}
    };
}

function worker(options={}) {
    const handlers={}, cache=new Map(), calls=[];
    let offline=false;
    const ctx={URL,Response,Headers,Map,Promise,
        caches:{async open(){if(options.quota)throw new Error('Quota');return {
            async match(url){return cache.get(url)?.clone();},async put(url,r){cache.set(url,r.clone());}
        };}},
        fetch:async url=>{calls.push(url);if(offline)throw new Error('offline');return new Response('0123456789',{
            status:options.status||200,headers:{'content-type':url.endsWith('.jpg')?'image/jpeg':'video/mp4'}
        });},
        self:{registration:{scope:'https://example.test/JTFAG/'},addEventListener:(type,fn)=>handlers[type]=fn}
    };
    vm.createContext(ctx);vm.runInContext(source('sw.js'),ctx);
    const urls=vm.runInContext('EAGLE_FILM_URLS',ctx);
    async function request(range,url=urls[0]) {
        let result;
        handlers.fetch({request:{method:'GET',url,headers:new Headers(range?{Range:range}:{})},respondWith:p=>result=p});
        return result&&await result;
    }
    return {request,cache,calls,urls,offline:()=>{offline=true;}};
}

async function main() {
    const m=app();m.run('checkEagleStreakCelebration()');m.frame();await tick();
    assert.equal(m.overlays.length,1);assert.equal(m.storage.get('jtfag_eagle_신성호_3'),'1');
    const state=m.run('eagleFilm'), v=state.video, o=state.overlay;
    assert.ok(o.classList.contains('ready'));assert.equal(v.muted,true);
    assert.ok(m.requests[0].endsWith('eagle-three.mp4'));
    assert.equal(m.timers.size,1,'재생 중에는 60초 상한만 존재; 로드 시각 기준으로 조기 종료하지 않음');
    m.run('checkEagleStreakCelebration()');assert.equal(m.overlays.length,1);
    let prevented=false;
    o.querySelector('.eagle-film-close').focus();
    o.events.keydown[0]({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
    assert.ok(prevented);assert.equal(m.ctx.document.activeElement,o.querySelector('.eagle-film-sound'),'마지막 버튼에서 Tab이 창 안으로 순환');
    v.currentTime=7.4;v.emit('timeupdate');assert.ok(!o.classList.contains('award-show'));
    v.currentTime=7.6;v.emit('timeupdate');assert.ok(o.classList.contains('award-show'));
    assert.match(o.html,/1차 · 80타/);assert.match(o.html,/3차 · 79타/);
    const button=o.querySelector('.eagle-film-sound');button.onclick({stopPropagation(){}});await tick();
    assert.equal(v.muted,false);assert.equal(button.attributes['aria-pressed'],'true');
    m.ctx.document.hidden=true;m.listeners.get('visibilitychange')();assert.equal(v.paused,true);
    m.ctx.document.hidden=false;m.listeners.get('visibilitychange')();await tick();assert.equal(v.paused,false);
    v.ended=true;v.emit('ended');assert.ok([...m.timers.values()].some(t=>t.delay===2600));
    m.timer(2600);assert.equal(m.run('eagleFilm'),null);assert.equal(v.paused,true);assert.equal(v.src,'');
    assert.equal(m.listeners.size,0);m.timer(300);assert.equal(m.overlays.length,0);assert.equal(m.ctx.document.activeElement,m.prior);
    v.emit('waiting');assert.equal(m.timers.size,0,'닫힌 영상의 늦은 대기 이벤트 무시');
    m.run('checkEagleStreakCelebration()');assert.equal(m.overlays.length,0,'한 번 본 자동 축하는 재생하지 않음');
    m.run("celebrateEagleStreak('신성호',3)");await tick();assert.equal(m.overlays.length,1,'직접 다시 보기 가능');
    m.run("celebrateEagleStreak('신성호',4)");await tick();
    assert.ok(m.run('eagleFilm.video.src').endsWith('eagle-four-v1/eagle-four.mp4'));
    assert.ok(m.run("eagleFilm.overlay.classList.contains('tier-4')"));assert.match(m.run('eagleFilm.overlay.html'),/불패의 군림 · 4경기/);
    m.run("rankedRoundsList=[0,1,2,3,4];appData.scores['신성호']=[80,81,79,78,77];celebrateEagleStreak('신성호',5)");await tick();
    assert.ok(m.run('eagleFilm.video.src').endsWith('eagle-five-v1/eagle-five.mp4'));
    assert.match(m.run('eagleFilm.overlay.html'),/JTFAG 전설 · 5경기/);
    assert.equal((m.run('eagleFilm.overlay.html').match(/<span>\d+차/g)||[]).length,5,'5연속 실제 차수 5개 표시');
    assert.match(m.run('eagleFilm.overlay.html'),/5차 · 77타/);
    m.run("celebrateEagleStreak('신성호',6)");assert.equal(m.run('eagleFilm'),null);assert.ok(m.overlays[0].classList.contains('g3-host'),'6연속 이상 기존 대관식 유지');
    for(const streak of [4,5]) {
        const next=app();next.ctx.fixtureStreak=streak;
        next.run("golferRankHistory['신성호']=Array(fixtureStreak).fill(0);checkEagleStreakCelebration()");await tick();
        assert.equal(next.storage.get(`jtfag_eagle_신성호_${streak}`),'1');
        assert.match(next.run('eagleFilm.overlay.attributes["aria-label"]'),new RegExp(`${streak}연속`));
    }
    const blocked=app({mode:'no-audio',gesture:true});blocked.run("celebrateEagleStreak('신성호',3)");await tick();
    assert.deepEqual(blocked.plays,[false,true],'소리 차단 시 무음으로 자동 재시도');
    assert.equal(blocked.run('eagleFilm.video.muted'),true);
    const tap=app({mode:'blocked'});tap.run("celebrateEagleStreak('신성호',3)");tap.frame();await tick();
    assert.ok(tap.run("eagleFilm.overlay.classList.contains('awaiting')"));
    assert.ok(![...tap.timers.values()].some(t=>t.delay===12000),'재생 버튼 대기 중 로드 실패 타이머 제거');
    tap.mode('allow');tap.run('eagleFilm.overlay').querySelector('.eagle-film-play').onclick({stopPropagation(){}});await tick();
    assert.ok(tap.run("eagleFilm.overlay.classList.contains('ready')"));
    const reduced=app({reduce:true});reduced.run("celebrateEagleStreak('신성호',3)");
    assert.equal(reduced.requests.length,0);assert.ok(reduced.run('eagleFilm.still'));assert.equal(reduced.run('eagleFilm.video.src'),'');
    const fail=app({mode:'blocked'});fail.run("celebrateEagleStreak('<test>',3)");await tick();
    const failState=fail.run('eagleFilm');failState.video.emit('error');
    assert.ok(failState.still);assert.match(failState.overlay.html,/&lt;test&gt;/);assert.equal(failState.video.src,'');
    failState.video.emit('playing');assert.ok(failState.overlay.classList.contains('still'),'늦게 도착한 이벤트가 정지 화면을 뒤집지 않음');
    const race=app();race.run("celebrateEagleStreak('신성호',3);closeEagleFilm(true)");race.frame();await tick();
    assert.equal(race.overlays.length,0);assert.equal(race.timers.size,0,'즉시 닫아도 타이머·소리·다운로드가 남지 않음');
    const stalled=app();stalled.run("celebrateEagleStreak('신성호',3)");await tick();
    stalled.run('eagleFilm.video').emit('waiting');stalled.timer(8000);assert.ok(stalled.run('eagleFilm.still'),'재생 중 긴 버퍼링도 완성 장면으로 대체');
    console.log('PASS: 3·4·5연속별 영상/색/숫자/실제 차수·자동 1회·수동 재생·6연속 유지·무음/실패 대체·종료 정리');

    const w=worker();let r=await w.request('bytes=0-1');assert.equal(r.status,206);assert.equal(await r.text(),'01');
    assert.equal(r.headers.get('content-range'),'bytes 0-1/10');assert.equal(r.headers.get('content-length'),'2');
    w.offline();r=await w.request('bytes=5-');assert.equal(await r.text(),'56789');
    r=await w.request('bytes=-3');assert.equal(await r.text(),'789');
    r=await w.request('bytes=8-99');assert.equal(await r.text(),'89');
    for(const range of ['bytes=10-','bytes=8-2','bytes=-0','bytes=-','bytes=1-2,5-6','nonsense']){
        r=await w.request(range);assert.equal(r.status,416,range);assert.equal(r.headers.get('content-range'),'bytes */10');
    }
    assert.equal(await (await w.request()).text(),'0123456789');assert.equal(w.calls.length,1,'전체 원본 1회 저장 후 오프라인 구간 재생');
    assert.equal(await w.request(null,'https://other.test/eagle-three.mp4'),undefined,'외부·다른 자산은 가로채지 않음');
    const quota=worker({quota:true});assert.equal((await quota.request('bytes=0-1')).status,206,'저장 공간 오류에도 재생');
    const missing=worker({status:404});assert.equal((await missing.request()).status,404);assert.equal(missing.cache.size,0);
    const concurrent=worker();await Promise.all([concurrent.request('bytes=0-1'),concurrent.request('bytes=5-')]);assert.equal(concurrent.calls.length,1);
    const all=worker();assert.equal(all.urls.length,6);
    for(const url of all.urls) {
        assert.ok(fs.existsSync(path.join(root,new URL(url).pathname.replace('/JTFAG/',''))));
        assert.equal((await all.request(null,url)).status,200);
    }
    all.offline();
    for(const url of all.urls.filter(u=>u.endsWith('.mp4'))) assert.equal((await all.request('bytes=0-1',url)).status,206);
    assert.equal(all.calls.length,6,'세 버전 영상·포스터가 각각 1회만 저장되고 재사용');
    console.log('PASS: iPhone Range 206·열린/접미 구간·416·중복 다운로드 방지·오프라인·저장 실패');

    for(const [streak,id] of [[3,'three'],[4,'four'],[5,'five']]) {
    const file=path.join(root,`assets/celebrations/eagle-${id}-v1/eagle-${id}.mp4`);
    const probe=spawnSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8'});
    assert.equal(probe.status,0,probe.stderr);const media=JSON.parse(probe.stdout);
    assert.equal(Number(media.format.duration),12);assert.ok(Number(media.format.size)<3_000_000);
    assert.match(media.format.tags.title,new RegExp(`${streak}연속`));
    const video=media.streams.find(s=>s.codec_type==='video'), audio=media.streams.find(s=>s.codec_type==='audio');
    assert.equal(video.codec_name,'h264');assert.equal(video.width,720);assert.equal(video.height,1280);assert.equal(video.pix_fmt,'yuv420p');assert.equal(audio.codec_name,'aac');
    const b=fs.readFileSync(file);assert.ok(b.indexOf('moov')<b.indexOf('mdat'),'faststart metadata precedes video');
    const decoded=spawnSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{encoding:'utf8'});
    assert.equal(decoded.status,0,decoded.stderr);assert.equal(decoded.stderr,'','전체 영상·효과음 디코딩 오류 없음');
    }
    console.log('PASS: 세 영상 모두 12초·720×1280·H.264/AAC·빠른 시작·각 3MB 미만·전체 디코딩');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
