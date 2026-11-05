// node tests/eagle-coronation.js — 합성 DOM·시계. 실데이터/서버 쓰기 없음.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const tick=()=>new Promise(setImmediate);
function app(options={}) {
    let now=1000,next=0;
    const overlays=[],frames=[],timers=new Map(),listeners=new Map(),storage=new Map();
    const document={hidden:false,activeElement:null};
    class Element {
        constructor(tag='div',attrs='') {
            this.tag=tag;this.events={};this.attributes={};this.nodes=[];this.isConnected=true;
            this.className=(attrs.match(/class="([^"]*)"/)||[,''])[1];
            this.style={setProperty(k,v){this[k]=v;}};
            this.classList={contains:n=>this.className.split(' ').includes(n),
                add:(...ns)=>ns.forEach(n=>{if(!this.classList.contains(n))this.className+=' '+n;}),
                remove:(...ns)=>{this.className=this.className.split(' ').filter(n=>!ns.includes(n)).join(' ');}};
        }
        set innerHTML(html){this.html=html;this.nodes=[...html.matchAll(/<button\b([^>]*)>/g)].map(m=>new Element('button',m[1]));}
        get innerHTML(){return this.html;}
        setAttribute(k,v){this.attributes[k]=String(v);}
        querySelector(s){return this.nodes.find(el=>el.classList.contains(s.slice(1)))||null;}
        addEventListener(k,fn){(this.events[k]||=[]).push(fn);}
        focus(){document.activeElement=this;}
        remove(){const i=overlays.indexOf(this);if(i>=0)overlays.splice(i,1);this.isConnected=false;this.nodes.forEach(n=>n.isConnected=false);}
    }
    const prior=new Element('button');document.activeElement=prior;
    Object.assign(document,{createElement:t=>new Element(t),body:{style:{overflow:'auto'},appendChild:el=>overlays.push(el)},
        head:{appendChild(){}},getElementById:()=>null,
        querySelector:s=>overlays.find(el=>el.classList.contains(s.slice(1)))||null,
        addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:(k,fn)=>{if(listeners.get(k)===fn)listeners.delete(k);}});
    const golfers=['신성호','예시'];
    const ctx={console,document,navigator:{userActivation:{isActive:!!options.gesture}},Date:{now:()=>now},
        matchMedia:()=>({matches:!!options.reduce}),requestAnimationFrame:fn=>frames.push(fn),
        setTimeout:(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+Math.max(0,delay)});return id;},clearTimeout:id=>timers.delete(id),
        localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
        golfers,appData:{scores:{'신성호':[80,79,78,77,76,75],'예시':[82,81,80]}},rankedRoundsList:[0,1,2],
        golferRankHistory:{'신성호':[0,0,0],'예시':[1,1,1]},eagleStreak:r=>{let n=0;for(let i=r.length-1;i>=0&&r[i]===0;i--)n++;return n;},
        EAGLE_HERO_URL:'assets/ranks/v1/eagle.webp'};
    ctx.window=ctx;vm.createContext(ctx);
    vm.runInContext(source('ui-effects.js'),ctx);vm.runInContext(source('eagle-coronation.js'),ctx);
    const run=code=>vm.runInContext(code,ctx);run('entranceReady=true');
    function advance(ms){const end=now+ms;while(true){const entry=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)break;now=entry[1].at;timers.delete(entry[0]);entry[1].fn();}now=end;}
    return {ctx,run,overlays,frames,timers,listeners,storage,prior,advance,
        frame:()=>frames.splice(0).forEach(fn=>fn()),
        click:selector=>overlays[0].querySelector(selector).onclick({stopPropagation(){}}),
        hidden:value=>{document.hidden=value;listeners.get('visibilitychange')?.();}};
}
async function main(){
    const m=app();m.run('checkEagleStreakCelebration()');m.frame();
    assert.equal(m.overlays.length,1);assert.equal(m.storage.get('jtfag_eagle_신성호_3'),'1');
    const o=m.overlays[0];assert.ok(o.classList.contains('ec-gold'));assert.equal(m.ctx.document.body.style.overflow,'hidden');
    assert.match(o.html,/<b>1차<\/b><small>80타/);assert.match(o.html,/<b>3차<\/b><small>78타/);
    assert.ok(!o.html.includes('<video'),'네트워크 영상/자동재생 정책에 의존하지 않음');
    m.advance(1599);assert.ok(!o.classList.contains('ec-descent'));m.advance(1);assert.ok(o.classList.contains('ec-descent'));
    m.advance(3899);assert.ok(!o.classList.contains('ec-recorded'));m.advance(1);assert.ok(o.classList.contains('ec-recorded'));
    m.advance(3300);assert.ok(o.classList.contains('ec-glory'));
    m.run('checkEagleStreakCelebration()');assert.equal(m.overlays.length,1,'자동 알림 1회 판정 유지');
    m.advance(9700);assert.equal(m.run('eagleCoronation'),null);m.advance(260);assert.equal(m.overlays.length,0);
    assert.equal(m.listeners.size,0);assert.equal(m.timers.size,0);assert.equal(m.ctx.document.activeElement,m.prior);assert.equal(m.ctx.document.body.style.overflow,'auto');
    m.run('checkEagleStreakCelebration()');assert.equal(m.overlays.length,0);
    for(const [n,theme] of [[3,'gold'],[4,'fire'],[5,'legend'],[6,'legend'],[10,'legend']]){
        m.ctx.fixture=n;m.run("showEagleCoronation('<신&성호>',Array.from({length:fixture},(_,i)=>({no:i+1,score:70+i})),fixture)");m.frame();
        assert.equal(m.overlays.length,1);assert.ok(m.overlays[0].classList.contains(`ec-${theme}`));assert.match(m.overlays[0].html,/&lt;신&amp;성호&gt;/);
        assert.match(m.overlays[0].html,new RegExp(`<b>${n}</b><span>연속`));
        assert.equal((m.overlays[0].html.match(/<span><b>\d+차/g)||[]).length,Math.min(n,8));
    }
    m.run("showEagleCoronation('보안', [{no:'<img>',score:'<script>'}],3)");m.frame();
    assert.match(m.overlays[0].html,/&lt;img&gt;차/);assert.match(m.overlays[0].html,/&lt;script&gt;타/);
    let prevented=false;m.click('.ec-replay');m.click('.ec-replay');m.frame();
    assert.equal(m.timers.size,7,'빠른 연속 재시작에도 하나의 타임라인만 존재');
    m.advance(3000);m.hidden(true);assert.equal(m.timers.size,0);assert.ok(m.overlays[0].classList.contains('ec-paused'));
    m.advance(30000);m.hidden(false);m.advance(1199);assert.ok(!m.overlays[0].classList.contains('ec-crowned'));
    m.advance(1);assert.ok(m.overlays[0].classList.contains('ec-crowned'),'화면 복귀 시 남은 시간에서 재개');
    const current=m.overlays[0],sound=current.querySelector('.ec-sound'),replay=current.querySelector('.ec-replay');
    replay.focus();current.events.keydown[0]({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});assert.ok(prevented);assert.equal(m.ctx.document.activeElement,sound);
    current.events.keydown[0]({key:'Escape',preventDefault(){}});m.advance(260);assert.equal(m.overlays.length,0);assert.equal(m.timers.size,0);
    assert.equal(m.ctx.document.activeElement,m.prior,'새 대관식으로 교체해도 원래 실행 버튼으로 복귀');
    const reduced=app({reduce:true});reduced.run("celebrateEagleStreak('신성호',5)");reduced.frame();
    assert.ok(reduced.overlays[0].classList.contains('ec-reduced'));assert.ok(reduced.overlays[0].classList.contains('ec-glory'));
    reduced.advance(12000);assert.equal(reduced.run('eagleCoronation'),null);reduced.advance(260);assert.equal(reduced.timers.size,0);
    const race=app();race.run("celebrateEagleStreak('신성호',3);closeEagleCoronation(true)");race.frame();assert.equal(race.overlays.length,0);assert.equal(race.timers.size,0);
    const audio=app();let stopped=0,resolve;audio.ctx.makeScore=()=>({resume:()=>new Promise(r=>resolve=r),stop:()=>stopped++});
    audio.run('createCoronationScore=makeScore');audio.run("celebrateEagleStreak('신성호',3)");audio.frame();audio.click('.ec-sound');
    audio.run('closeEagleCoronation(true)');resolve();await tick();assert.ok(stopped>=1);assert.equal(audio.overlays.length,0);assert.equal(audio.timers.size,0,'늦은 오디오 시작도 닫은 대관식을 되살리지 않음');
    const noAudio=app();noAudio.run("celebrateEagleStreak('신성호',3)");noAudio.frame();noAudio.click('.ec-sound');await tick();assert.equal(noAudio.run('eagleCoronation.soundWanted'),false);
    assert.ok(source('index.html').includes('eagle-coronation.js?ver='));assert.ok(!source('eagle-coronation.js').includes('localStorage'));
    console.log('PASS: 3·4·5·6+ 테마와 실제 기록, 자동 1회, 재시작, 백그라운드 재개, 초점/스크롤 복원, 모션 축소, 종료/음악 경합 정리');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
