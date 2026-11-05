// 독수리 대관식 v2 — 원본 일러스트의 날개 관절, 순차 공개, 기기 내 합성 음악.
// 계급·점수·확인 기록은 변경하지 않는다. 자동 1회 판정은 ui-effects.js에서 유지한다.
const EAGLE_CORONATION_THEMES = Object.freeze({
    3:{className:'gold',title:'명예의 전당',motto:'왕의 귀환',accent:'#edc874',light:'#fff0be'},
    4:{className:'fire',title:'불패의 군림',motto:'끝나지 않는 비상',accent:'#ffa66b',light:'#ffe4bd'},
    5:{className:'legend',title:'JTFAG 전설',motto:'새로운 왕조의 시작',accent:'#d1b2ff',light:'#f4e7ff'}
});
let eagleCoronation = null;
let eagleCoronationSerial = 0;
let eagleCoronationAudioContext = null;

function coronationEscape(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 동일한 원본을 세 관절로 표시한다. 몸통을 마지막에 그려 어깨 연결을 덮는다.
function coronationEagleRig(url, id) {
    const image = `<image href="${coronationEscape(url)}" width="1000" height="1000"/>`;
    return `<svg class="ec-rig" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false">
        <defs>
            <clipPath id="ec-left-${id}"><path d="M0 0H370V225L365 285 406 340 437 405 421 505 392 590 340 660 278 719 180 735H0Z"/></clipPath>
            <clipPath id="ec-right-${id}"><path d="M660 0H1000V740H760L680 680 631 591 610 505 587 423 608 362 659 315Z"/></clipPath>
            <clipPath id="ec-body-${id}"><path d="M365 140H680V317L643 346 618 365 624 423 674 476 700 590 734 696 740 785 1000 1000H0V850H250L261 751 299 675 320 590 331 515 346 458 390 405 409 350 360 315Z"/></clipPath>
        </defs>
        <g class="ec-wing ec-wing-left"><g clip-path="url(#ec-left-${id})">${image}</g></g>
        <g class="ec-wing ec-wing-right"><g clip-path="url(#ec-right-${id})">${image}</g></g>
        <g clip-path="url(#ec-body-${id})">${image}</g>
    </svg>`;
}

function coronationCrown(id) {
    return `<svg viewBox="0 0 160 90" aria-hidden="true" focusable="false"><defs><linearGradient id="ec-crown-metal-${id}" x2="0" y2="1"><stop stop-color="#fff5c8"/><stop offset=".42" stop-color="#f2cd75"/><stop offset="1" stop-color="#a16b25"/></linearGradient></defs><path d="M20 65 10 22 48 42 80 8 112 42 150 22 140 65Z" fill="url(#ec-crown-metal-${id})" stroke="#fff0b0" stroke-width="2"/><path d="M22 69H138V81H22Z" fill="url(#ec-crown-metal-${id})"/><path d="m80 25 8 12-8 12-8-12Z" fill="var(--ec-accent)" stroke="#fff0bf" stroke-width="2"/><circle cx="12" cy="20" r="5" fill="#fff1bd"/><circle cx="80" cy="8" r="5" fill="#fff1bd"/><circle cx="148" cy="20" r="5" fill="#fff1bd"/></svg>`;
}

// 짧은 금관 화음·저음 타격·잔향. 외부 음원 없이 생성하고 닫을 때 모든 노드를 해제한다.
function createCoronationScore(offset = 0) {
    const Constructor = window.AudioContext || window.webkitAudioContext;
    if (!Constructor) return null;
    try {
        if (!eagleCoronationAudioContext || eagleCoronationAudioContext.state === 'closed') eagleCoronationAudioContext = new Constructor();
        const ctx = eagleCoronationAudioContext, nodes = [], oscillators = [];
        const bus = ctx.createGain(), limiter = ctx.createDynamicsCompressor();
        bus.gain.value = .19;
        limiter.threshold.value = -16; limiter.ratio.value = 5;
        bus.connect(limiter).connect(ctx.destination);
        const delay = ctx.createDelay(.6), wet = ctx.createGain(), feedback = ctx.createGain();
        delay.delayTime.value = .27; wet.gain.value = .18; feedback.gain.value = .2;
        bus.connect(delay); delay.connect(wet).connect(limiter); delay.connect(feedback).connect(delay);
        nodes.push(bus,limiter,delay,wet,feedback);
        const now = ctx.currentTime, elapsed = offset / 1000;
        const tone = (at,duration,frequency,volume,type='sawtooth',detune=0) => {
            if (at + duration <= elapsed) return;
            const start = now + Math.max(0,at-elapsed), length = Math.max(.15,at+duration-Math.max(at,elapsed));
            const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
            osc.type = type; osc.frequency.value = frequency; osc.detune.value = detune;
            filter.type = 'lowpass'; filter.frequency.value = type === 'sine' ? 420 : 1350; filter.Q.value = .55;
            gain.gain.setValueAtTime(.0001,start);
            gain.gain.exponentialRampToValueAtTime(volume,start+Math.min(.25,length*.18));
            gain.gain.setValueAtTime(volume,start+length*.55);
            gain.gain.exponentialRampToValueAtTime(.0001,start+length);
            osc.connect(filter).connect(gain).connect(bus); osc.start(start); osc.stop(start+length+.05);
            oscillators.push(osc); nodes.push(osc,filter,gain);
        };
        const chord = (at,duration,notes,volume) => notes.forEach((f,i)=>tone(at,duration,f,volume,'sawtooth',(i%2?1:-1)*4));
        const boom = (at,frequency,volume) => {
            if (at < elapsed) return;
            const start = now + at - elapsed, osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.type = 'sine'; osc.frequency.setValueAtTime(frequency,start); osc.frequency.exponentialRampToValueAtTime(28,start+1.1);
            gain.gain.setValueAtTime(.0001,start); gain.gain.exponentialRampToValueAtTime(volume,start+.012); gain.gain.exponentialRampToValueAtTime(.0001,start+1.5);
            osc.connect(gain).connect(bus); osc.start(start); osc.stop(start+1.6);
            oscillators.push(osc); nodes.push(osc,gain);
        };
        chord(.1,4.3,[55,82.41,110],.045);
        boom(1.6,72,.65); boom(3.1,64,.7); boom(4.2,58,.75);
        chord(3.9,5.2,[110,164.81,220,277.18],.047);
        boom(5.5,50,1); boom(5.5,100,.35);
        chord(7.1,5.1,[146.83,220,293.66,369.99],.045);
        boom(7.2,62,.75); boom(8.8,72,.55);
        chord(11,4.5,[110,164.81,220],.035);
        let stopped = false;
        return {
            resume: () => ctx.resume ? ctx.resume() : Promise.resolve(),
            stop: () => {
                if (stopped) return; stopped = true;
                try { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setValueAtTime(0,ctx.currentTime); } catch (e) {}
                oscillators.forEach(node=>{try{node.stop();}catch(e){}});
                nodes.forEach(node=>{try{node.disconnect();}catch(e){}});
            }
        };
    } catch (e) { return null; }
}

function closeEagleCoronation(immediate = false) {
    const state = eagleCoronation;
    if (!state) return;
    eagleCoronation = null;
    state.closed = true; state.audioVersion++;
    state.timers.forEach(clearTimeout); state.timers.clear();
    if (state.audio) state.audio.stop();
    document.removeEventListener('visibilitychange',state.visibility);
    document.body.style.overflow = state.bodyOverflow;
    state.overlay.classList.remove('on');
    const finish = () => {
        state.overlay.remove();
        if (!immediate && !eagleCoronation && !document.querySelector('.celebrate-overlay') && state.focus && state.focus.isConnected) state.focus.focus({preventScroll:true});
    };
    if (immediate) finish(); else setTimeout(finish,260);
}

function showEagleCoronation(name, rounds, streak = 3) {
    streak = Number.isFinite(Number(streak)) ? Math.max(3,Math.floor(Number(streak) || 3)) : 3;
    const previousFocus = eagleCoronation ? eagleCoronation.focus : document.activeElement;
    closeEagleCoronation(true);
    if (typeof closeEagleFilm === 'function') closeEagleFilm(true);
    const previous = document.querySelector('.celebrate-overlay'); if (previous) previous.remove();
    if (typeof loadEagleFonts === 'function') loadEagleFonts();
    const theme = EAGLE_CORONATION_THEMES[Math.min(5,streak)];
    const safeName = String(name == null ? '' : name), id = ++eagleCoronationSerial;
    const history = (Array.isArray(rounds) ? rounds : []).slice(-Math.min(streak,8));
    const picture = typeof EAGLE_HERO_URL === 'string' && EAGLE_HERO_URL ? EAGLE_HERO_URL : 'assets/ranks/v1/eagle.webp';
    const overlay = document.createElement('div');
    overlay.className = `celebrate-overlay eagle-coronation ec-${theme.className}`;
    overlay.style.setProperty('--ec-accent',theme.accent); overlay.style.setProperty('--ec-light',theme.light);
    overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label',`${safeName} · 독수리 ${streak}연속 대관식`);
    const particles = Array.from({length:28},(_,i)=>`<i class="ec-ember" style="--x:${(i*37)%100}%;--dx:${(i%2?1:-1)*(12+i%8)}cqw;--delay:${(i%7)*.34}s;--time:${3+i%4*.45}s;--turn:${i*43}deg"></i>`).join('');
    overlay.innerHTML = `<div class="ec-stage">
        <div class="ec-sky" aria-hidden="true"></div><div class="ec-rays" aria-hidden="true"></div>
        <div class="ec-orbit ec-orbit-a" aria-hidden="true"></div><div class="ec-orbit ec-orbit-b" aria-hidden="true"></div>
        <div class="ec-shock ec-shock-a" aria-hidden="true"></div><div class="ec-shock ec-shock-b" aria-hidden="true"></div>
        <div class="ec-particles" aria-hidden="true">${particles}</div>
        <div class="ec-brand">JTFAG<span>HALL OF FAME</span></div>
        <div class="ec-heading">독수리 대관식</div>
        <div class="ec-crown">${coronationCrown(id)}</div>
        <div class="ec-hero">${coronationEagleRig(picture,id)}</div>
        <div class="ec-record" style="--ec-num-size:${streak>99?18:25}cqw"><b>${streak}</b><span>연속<strong>독수리</strong></span></div>
        <div class="ec-title">${theme.title}</div>
        <div class="ec-winner"><span class="ec-name${safeName.length>5?' long':''}">${coronationEscape(safeName)}</span><small>${theme.motto}</small></div>
        <div class="ec-history"><div class="ec-history-label">${streak>8?'달성 기록 · 최근 8경기':'달성 기록'}</div><div class="ec-rounds">${history.map(r=>`<span><b>${coronationEscape(r.no)}차</b>${r.score!=='' && r.score!=null?`<small>${coronationEscape(r.score)}타</small>`:''}</span>`).join('')}</div></div>
        <div class="ec-flash" aria-hidden="true"></div>
        <div class="ec-controls"><button type="button" class="ec-sound" aria-pressed="false">소리 켜기</button><button type="button" class="ec-close" aria-label="대관식 닫기">✕</button></div>
        <button type="button" class="ec-replay">다시 보기</button>
        <div class="ec-progress" aria-hidden="true"><i></i></div>
    </div>`;
    const state = {overlay,timers:new Set(),started:Date.now(),pausedAt:0,closed:false,runVersion:0,audio:null,audioVersion:0,audible:false,soundWanted:false,focus:previousFocus,bodyOverflow:document.body.style.overflow,visibility:null,
        reduced:!!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)};
    eagleCoronation = state;
    const active = () => eagleCoronation === state && !state.closed;
    const sound = overlay.querySelector('.ec-sound'), close = overlay.querySelector('.ec-close'), replay = overlay.querySelector('.ec-replay');
    const phases = [[850,'ec-summon'],[1600,'ec-descent'],[4200,'ec-crowned'],[5500,'ec-recorded'],[7200,'ec-named'],[8800,'ec-glory']];
    const elapsed = () => Math.max(0,(state.pausedAt || Date.now())-state.started);
    const updateSound = () => { sound.textContent=state.audible?'소리 끄기':'소리 켜기';sound.setAttribute('aria-pressed',String(state.audible)); };
    const stopSound = () => { state.audioVersion++;if(state.audio)state.audio.stop();state.audio=null;state.audible=false;updateSound(); };
    const startSound = async () => {
        if (!active() || state.pausedAt) return;
        stopSound();
        const version = state.audioVersion, score = createCoronationScore(elapsed());
        if (!score) { state.soundWanted=false; return; }
        state.audio=score;
        try {
            await score.resume();
            if (!active() || version !== state.audioVersion || state.pausedAt) {score.stop();return;}
            state.audible=true;updateSound();
        } catch(e) { if(active() && version===state.audioVersion){stopSound();state.soundWanted=false;} }
    };
    const clearTimers = () => {state.timers.forEach(clearTimeout);state.timers.clear();};
    const later = (fn,delay) => {
        const timer=setTimeout(()=>{state.timers.delete(timer);if(active() && !state.pausedAt)fn();},Math.max(0,delay));
        state.timers.add(timer);
    };
    const schedule = () => {
        clearTimers();
        const at=elapsed();
        phases.forEach(([time,cls])=>{
            if(state.reduced || at>=time)overlay.classList.add(cls);
            else later(()=>overlay.classList.add(cls),time-at);
        });
        later(()=>closeEagleCoronation(),(state.reduced?12000:18500)-at);
    };
    const restart = () => {
        if(!active())return;
        clearTimers();stopSound();state.started=Date.now();state.pausedAt=0;
        const version=++state.runVersion;
        overlay.classList.remove('ec-playing','ec-paused',...phases.map(p=>p[1]));
        void overlay.offsetWidth;
        requestAnimationFrame(()=>{if(active() && version===state.runVersion){overlay.classList.add('ec-playing');schedule();if(state.soundWanted)startSound();}});
    };
    sound.onclick=event=>{event.stopPropagation();state.soundWanted=!state.soundWanted;if(state.soundWanted)startSound();else stopSound();};
    close.onclick=event=>{event.stopPropagation();closeEagleCoronation();};
    replay.onclick=event=>{event.stopPropagation();restart();};
    overlay.onclick=()=>closeEagleCoronation();
    overlay.addEventListener('keydown',event=>{
        if(event.key==='Escape'){event.preventDefault();closeEagleCoronation();return;}
        if(event.key!=='Tab')return;
        const buttons=[sound,close,replay],first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    });
    state.visibility=()=>{
        if(!active())return;
        if(document.hidden && !state.pausedAt){state.pausedAt=Date.now();clearTimers();stopSound();overlay.classList.add('ec-paused');}
        else if(!document.hidden && state.pausedAt){state.started+=Date.now()-state.pausedAt;state.pausedAt=0;overlay.classList.remove('ec-paused');schedule();if(state.soundWanted)startSound();}
    };
    if(state.reduced)overlay.classList.add('ec-reduced');
    document.addEventListener('visibilitychange',state.visibility);
    document.body.style.overflow='hidden';
    document.body.appendChild(overlay);
    state.soundWanted=!!(navigator.userActivation && navigator.userActivation.isActive);
    if(state.soundWanted)startSound();
    requestAnimationFrame(()=>{
        if(!active())return;
        overlay.classList.add('on','ec-playing');close.focus({preventScroll:true});schedule();
    });
    return state;
}
