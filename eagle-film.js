// 독수리 3·4·5연속 시네마틱. 점수·계급·연출 확인 기록은 읽기만 한다.
const EAGLE_FILMS = Object.freeze({
    3:{id:'three',title:'명예의 전당'},
    4:{id:'four',title:'불패의 군림'},
    5:{id:'five',title:'JTFAG 전설'}
});
let eagleFilm = null;

function closeEagleFilm(immediate = false) {
    const state = eagleFilm;
    if (!state) return;
    eagleFilm = null;
    Object.values(state.timers).forEach(clearTimeout);
    document.removeEventListener('visibilitychange', state.visibility);
    state.video.pause();
    state.video.removeAttribute('src');
    state.video.load();  // 닫힌 뒤 다운로드·효과음이 계속되지 않도록 해제한다.
    state.overlay.classList.remove('on');
    const finish = () => {
        state.overlay.remove();
        if (!immediate && !eagleFilm && !document.querySelector('.celebrate-overlay') && state.focus && state.focus.isConnected) state.focus.focus({preventScroll:true});
    };
    if (immediate) finish();
    else setTimeout(finish, 300);
}

function showEagleFilm(name, rounds, streak = 3) {
    const film = EAGLE_FILMS[streak];
    if (!film) return;
    const base = `assets/celebrations/eagle-${film.id}-v1/`;
    closeEagleFilm(true);
    const overlay = document.createElement('div');
    overlay.className = `celebrate-overlay eagle-film tier-${streak}`;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', `${name} · 독수리 ${streak}연속 축하 영상`);
    overlay.innerHTML = `<div class="eagle-film-stage">
        <img class="eagle-film-poster" src="${base}poster.jpg" alt="">
        <div class="eagle-film-emblem" aria-hidden="true">${streak}연속<br><b>독수리</b></div>
        <video class="eagle-film-video" playsinline webkit-playsinline muted preload="auto" disablepictureinpicture disableremoteplayback aria-hidden="true"></video>
        <div class="eagle-film-award">
            <strong>${escapeHtml(name)}</strong><small>${film.title} · ${streak}경기 연속 독수리 계급</small>
            <div class="eagle-film-rounds">${rounds.slice(-streak).map(r => `<span>${escapeHtml(r.no)}차${r.score ? ` · ${escapeHtml(r.score)}타` : ''}</span>`).join('')}</div>
        </div>
        <div class="eagle-film-cover"><span>JTFAG</span><small>HALL OF FAME</small>
            <button type="button" class="eagle-film-play">영상 재생</button></div>
        <div class="eagle-film-tools">
            <button type="button" class="eagle-film-sound" aria-pressed="false">소리 켜기</button>
            <button type="button" class="eagle-film-close" aria-label="축하 영상 닫기">✕</button>
        </div>
        <div class="eagle-film-progress" aria-hidden="true"><i></i></div>
    </div>`;
    const video = overlay.querySelector('video');
    const play = overlay.querySelector('.eagle-film-play');
    const sound = overlay.querySelector('.eagle-film-sound');
    const close = overlay.querySelector('.eagle-film-close');
    const progress = overlay.querySelector('.eagle-film-progress i');
    const state = {overlay, video, focus:document.activeElement, timers:{}, visibility:null, resume:false, still:false};
    eagleFilm = state;
    const active = () => eagleFilm === state;
    const cancel = key => { clearTimeout(state.timers[key]); delete state.timers[key]; };
    const later = (key, callback, delay) => {
        if (!active()) return;
        cancel(key);
        state.timers[key] = setTimeout(() => { if (active()) callback(); }, delay);
    };
    const updateSound = () => {
        const audible = !video.muted;
        sound.textContent = audible ? '소리 끄기' : '소리 켜기';
        sound.setAttribute('aria-pressed', String(audible));
    };
    const updateFrame = () => {
        if (!active()) return;
        overlay.classList.toggle('award-show', video.currentTime >= 7.5 || state.still);
        const ratio = video.duration ? video.currentTime / video.duration : 0;
        progress.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
    };
    const still = () => {
        if (!active() || state.still) return;
        state.still = true;
        cancel('load'); cancel('stall'); cancel('end');
        video.pause();
        video.removeAttribute('src');
        video.load();
        overlay.classList.remove('awaiting');
        overlay.classList.add('still', 'award-show');
        sound.disabled = true;
        sound.hidden = true;
        later('end', () => closeEagleFilm(), 8000);
    };
    const start = async audible => {
        if (!active() || state.still) return;
        cancel('end');
        video.muted = !audible;
        updateSound();
        try {
            await video.play();
        } catch (error) {
            if (!active() || state.still) return;
            if (video.error) { still(); return; }
            // 사용자 동작 없는 소리 재생이 막히면 같은 영상을 무음으로 이어 간다.
            if (audible) { start(false); return; }
            cancel('load'); cancel('stall');
            overlay.classList.add('awaiting');
            if (overlay.contains(document.activeElement)) play.focus({preventScroll:true});
        }
    };
    video.addEventListener('playing', () => {
        if (!active() || state.still) return;
        cancel('load'); cancel('stall');
        overlay.classList.remove('awaiting');
        overlay.classList.add('ready');
        if (document.activeElement === play) sound.focus({preventScroll:true});
        updateFrame();
    });
    video.addEventListener('timeupdate', updateFrame);
    video.addEventListener('volumechange', updateSound);
    video.addEventListener('waiting', () => { if (active() && !document.hidden && !state.still) later('stall', still, 8000); });
    video.addEventListener('error', still);
    video.addEventListener('ended', () => {
        if (!active() || state.still) return;
        cancel('stall');
        overlay.classList.add('award-show');
        later('end', () => closeEagleFilm(), 2600);
    });
    overlay.querySelector('.eagle-film-poster').addEventListener('error', () => overlay.classList.add('no-poster'));
    play.onclick = event => { event.stopPropagation(); start(true); };
    sound.onclick = event => { event.stopPropagation(); start(video.muted); };
    close.onclick = event => { event.stopPropagation(); closeEagleFilm(); };
    overlay.onclick = () => closeEagleFilm();
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeEagleFilm(); }
        if (event.key !== 'Tab') return;
        const buttons = [play, sound, close].filter(button => !button.disabled && !button.hidden
            && (button !== play || overlay.classList.contains('awaiting')));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    state.visibility = () => {
        if (!active() || state.still) return;
        if (document.hidden) {
            state.resume = !video.paused && !video.ended;
            video.pause(); cancel('stall');
        } else if (state.resume) {
            state.resume = false;
            start(!video.muted);
        }
    };
    document.addEventListener('visibilitychange', state.visibility);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
        if (!active()) return;
        overlay.classList.add('on');
        close.focus({preventScroll:true});
    });
    // 동작 줄이기를 선택한 기기는 완성된 장면으로 축하한다. MP4도 받지 않는다.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) still();
    else {
        video.muted = true;
        video.defaultMuted = true;
        video.src = base + `eagle-${film.id}.mp4`;
        later('load', still, 12000);
        // 뱃지·미리보기에서 직접 누른 경우에는 원본 효과음도 함께 시작한다.
        start(!!(navigator.userActivation && navigator.userActivation.isActive));
    }
    later('limit', () => closeEagleFilm(), 60000);
}
