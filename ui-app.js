// ◇ ui.js를 나눈 조각 — 앱 설치 안내 · 라운드 알림 · 입장 인사말 · 요약 칸 높이 맞춤 · 화면 넘기기(pagerSwipe)
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
// ─── 앱 설치 안내 ───
// 안드로이드는 크롬이 실제 설치를 지원해 버튼 한 번으로 끝나지만,
// iOS는 애플이 프로그램적 설치를 막아뒀다. 그래서 방법을 안내만 한다.
let deferredInstallPrompt = null;
const INSTALL_DISMISS_KEY = 'jtfag_install_dismissed';

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // 아이패드 사파리
}

function dismissInstallBanner() {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    const el = document.getElementById('installBanner');
    if (el) el.classList.remove('show');
}

function renderInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (!banner) return;
    if (isAppInstalled() || localStorage.getItem(INSTALL_DISMISS_KEY)) { banner.classList.remove('show'); return; }

    const desc = document.getElementById('installDesc');
    const action = document.getElementById('installAction');

    if (deferredInstallPrompt) {
        desc.textContent = '홈 화면에 앱을 설치하고 라운드 알림을 받아 보세요.';
        action.innerHTML = `<button type="button" class="install-btn" onclick="runInstall()">📲 설치</button>`;
    } else if (isIOS()) {
        desc.textContent = '앱으로 이용하고 라운드 알림을 받으려면 홈 화면에 추가하세요.';
        action.innerHTML = `<div class="install-steps">
            <span><b>1</b> 아래 <b>공유</b> <span class="ios-share">⬆︎</span> 를 누르고</span>
            <span><b>2</b> <b>‘홈 화면에 추가’</b> 를 선택하세요</span>
        </div>`;
    } else {
        banner.classList.remove('show');
        return;
    }
    banner.classList.add('show');
}

async function runInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === 'accepted') {
        document.getElementById('installBanner').classList.remove('show');
    } else {
        showToast("설치를 취소했습니다. 나중에 다시 설치할 수 있습니다.");
        renderInstallBanner();
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();               // 크롬 기본 배너 대신 우리 안내를 쓴다
    deferredInstallPrompt = e;
    renderInstallBanner();
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const el = document.getElementById('installBanner');
    if (el) el.classList.remove('show');
    showToast("🎉 앱이 설치되었습니다!");
});

// ─── 라운드 알림 구독 ───
// 실제 발송은 GitHub Actions가 한다. 여기서는 각자 기기의 구독을 켜고 끈다.
// 머리말 단추의 그림 — 그림문자(🔔·🔕)는 기기마다 모양이 달라 선 그림으로 바꿨다(사용자 요청).
const BELL_ICON = '<svg class="hd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33"/></svg>';
const BELL_OFF_ICON = '<svg class="hd-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.27 21a2 2 0 0 0 3.46 0"/><path d="M17 17H4a1 1 0 0 1-.74-1.67C4.59 13.96 6 12.5 6 8a6 6 0 0 1 .26-1.74"/><path d="M8.67 3.24A6 6 0 0 1 18 8c0 2.5.44 4.07 1 5.16"/><path d="m2 2 20 20"/></svg>';
async function updateAlarmUI() {
    const btn = document.getElementById('alarmToggleBtn');
    if (!btn) return;
    if (!pushSupported()) { btn.innerHTML = BELL_OFF_ICON; btn.classList.remove('on'); btn.title = '이 브라우저는 알림을 지원하지 않습니다'; return; }
    const sub = await getPushSubscription();
    const on = !!sub && Notification.permission === 'granted';
    btn.innerHTML = on ? BELL_ICON : BELL_OFF_ICON;
    btn.classList.toggle('on', on);
    btn.title = on ? '라운드 알림 사용 중 — 눌러서 해제' : '라운드 알림 설정';
}

async function toggleRoundAlarm() {
    if (!pushSupported()) {
        showToast("⚠️ 이 브라우저는 알림을 지원하지 않습니다. 홈 화면에 추가한 앱에서 열어 주세요.");
        return;
    }
    if (Notification.permission === 'denied') {
        showToast("⚠️ 알림이 차단되어 있습니다. 기기 설정에서 이 앱의 알림을 허용해 주세요.");
        return;
    }

    const existing = await getPushSubscription();
    if (existing && Notification.permission === 'granted') {
        if (!(await showConfirmPrompt("라운드 알림을 해제할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#6b7075;'>이 기기에서 더 이상 알림을 수신하지 않습니다.</span>", "해제"))) return;
        try { await unsubscribeFromPush(); showToast("🔕 라운드 알림을 해제했습니다."); }
        catch (err) { console.error(err); showToast("⚠️ 알림 해제에 실패했습니다."); }
        updateAlarmUI();
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast("⚠️ 알림 권한이 허용되지 않았습니다."); updateAlarmUI(); return; }

    try {
        await subscribeToPush(localStorage.getItem('jtfag_my_name'));
        showToast(`🔔 라운드 알림을 설정했습니다. (${getNotifySettings().daysBefore.map(notifyDayName).join(' · ')})`);
    } catch (err) {
        console.error("구독 실패:", err);
        showToast(`⚠️ 알림 등록 실패 — ${(err && err.message) ? err.message : err}`, 9000);
    }
    updateAlarmUI();
}


let hasGreeted = false;

async function checkAndGreetUser() {
    if (hasGreeted || !isLoaded || Object.keys(golferRankHistory).length === 0) return;

    let myName = localStorage.getItem('jtfag_my_name');
    if (!myName || !golfers.includes(myName)) {
        hasGreeted = true; 
        setTimeout(async () => {
            myName = await showNameSelectionPrompt("👋 환영합니다!<br>본인의 이름을 선택해 주세요.");
            if (myName && golfers.includes(myName)) {
                localStorage.setItem('jtfag_my_name', myName);
                updateScoreRequestBtn();
                showGreeting(myName);
            } else {
                hasGreeted = false; 
            }
        }, 500);
        return;
    }

    hasGreeted = true;
    // 먼저 그려 둔 인사말을 데이터가 오기 전에 눌러 넘겼으면 다시 띄우지 않고 연출로 넘어간다.
    if (window.__greetEarlyDone) { runEntranceEffects(); return; }
    showGreeting(myName);
}

async function deleteMyName() {
    const currentName = localStorage.getItem('jtfag_my_name');
    if (!currentName) {
        showToast("⚠️ 현재 기기에 등록된 이름이 없습니다.");
        checkAndGreetUser();
        return;
    }
    
    const isConfirmed = await showConfirmPrompt("기기에 저장된 이름을 삭제하시겠습니까?<br><span style='font-size:0.8rem; font-weight:400; color:#6b7075;'>삭제 후 다음 접속 시 다시 등록할 수 있습니다.</span>");
    
    if (isConfirmed) {
        localStorage.removeItem('jtfag_my_name');
        updateScoreRequestBtn();
        showToast("🗑️ 이름이 삭제되었습니다.");
        hasGreeted = false; 
        
        setTimeout(() => {
            checkAndGreetUser();
        }, 500);
    }
}

// ─── 입장 인사말의 계급 그림을 이 기기에 담아 둔다 ───
// 사용자 제보 — `등급 이모티콘이 인터넷 환경에 따라서 늦게 뜬다`. 그림이 Supabase 저장소에 있어
// 접속할 때마다 받아 와야 했고, 느린 곳에서는 포스터가 다 뜬 뒤에야 그림이 나타났다.
// 한 번 받은 그림을 data URL로 localStorage(`jtfag_greet_pic` = {url, data})에 남기면
// index.html 맨 앞의 줄이 다음 접속 때 인터넷 없이 첫 프레임부터 그린다.
// - 내 계급 하나만 담는다(네 장을 다 담으면 아이폰에서 PNG라 2MB 가까이 된다). 계급이 바뀐 첫 접속만 받아 온다.
// - 크기는 긴 변 720px까지 — 포스터에서 폭 320px로 보이므로 레티나에서도 안 뭉개진다.
// - Supabase 공개 저장소는 CORS를 열어 두어 캔버스로 옮길 수 있다. 막히면(캔버스 오염) 조용히 넘어간다 — 예전처럼 받아 올 뿐이다.
const GREET_PIC_KEY = 'jtfag_greet_pic';
const GREET_PIC_EDGE = 720;
function greetPicCached(url) {
    try {
        const c = JSON.parse(localStorage.getItem(GREET_PIC_KEY) || 'null');
        return c && c.url === url && typeof c.data === 'string' && c.data.startsWith('data:image/') ? c.data : '';
    } catch (e) { return ''; }
}
// 그림이 다 풀린 뒤에 미끄러져 들어오게 한다 — 늦게 오면 포스터가 뜬 뒤 툭 나타나는 대신 그때 들어온다.
function setGreetPic(pic, src) {
    pic.classList.add('wait');
    const ready = () => pic.classList.remove('wait');
    pic.onload = ready;
    pic.src = src;
    if (pic.complete && pic.naturalWidth) ready();
}
function storeGreetPic(url) {
    if (!url || greetPicCached(url)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const w = img.naturalWidth, h = img.naturalHeight;
            if (!w || !h) return;
            const k = Math.min(1, GREET_PIC_EDGE / Math.max(w, h));
            const cv = document.createElement('canvas');
            cv.width = Math.round(w * k); cv.height = Math.round(h * k);
            const cx = cv.getContext('2d');
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(img, 0, 0, cv.width, cv.height);
            // 바탕이 투명한 그림이라 JPEG은 안 된다. webp를 못 만드는 브라우저(사파리)는 PNG를 돌려준다.
            let data = cv.toDataURL('image/webp', 0.9);
            if (!data.startsWith('data:image/webp')) data = cv.toDataURL('image/png');
            if (data.length > 1500000) return;
            localStorage.setItem(GREET_PIC_KEY, JSON.stringify({ url, data }));
        } catch (e) {}
    };
    img.src = url;
}

function showGreeting(myName) {
    const ranks = golferRankHistory[myName] || [];
    let myRankIdx = 3; 
    if (ranks.length > 0) {
        myRankIdx = ranks[ranks.length - 1]; 
    }

    const rankInfo = RANK_CONFIG[myRankIdx];

    // 포스터 — 화면 전체를 계급 색으로 칠하고 이름을 크게 쓴다(사용자가 시안 여덟 개 중 F를 골랐다).
    // 문구(`⚔️ 맹수의 발톱!`)는 분위기를 내는 연출 글이라 그대로 둔다.
    const GREET = [
        { phrase: '✨ 황제 귀환!', from: '#d4a62a', to: '#7a4e12' },
        { phrase: '⚔️ 맹수의 발톱!', from: '#1196d8', to: '#1c4f9a' },
        { phrase: '🦢 우아한 날개짓!', from: '#a35ae6', to: '#5b3aa8' },
        { phrase: '💦 앗!', from: '#8592a0', to: '#46505c' }
    ];
    const g = GREET[myRankIdx] || GREET[3];
    const m = /src="([^"]+)"/.exec(rankInfo.icon || '');
    const picSrc = m ? m[1] : '';

    // 다음 접속 때 index.html 맨 앞의 줄이 데이터를 기다리지 않고 이 값으로 먼저 그린다(홈보다 인사말이 먼저).
    try {
        localStorage.setItem('jtfag_greet', JSON.stringify({
            name: myName, rankName: rankInfo.name, phrase: g.phrase, from: g.from, to: g.to, pic: picSrc
        }));
    } catch (e) {}

    // 덮는 창 하나다 — 화면 전체·position:fixed·입력을 받으므로 watchOverlays()가 뒷배경을 잠근다.
    // greet-overlay 표식은 연출(카운트업·결과 발표)이 이게 사라질 때까지 기다리게 하는 데 쓴다.
    // transform·opacity만 움직인다(blur·filter는 안드로이드에서 끊긴다).
    // 먼저 그려 둔 창(early)이 있으면 새로 만들지 않고 이어받는다 — 계급이 바뀌었으면 그 자리에서 고쳐 쓴다.
    let overlay = document.querySelector('.greet-poster.early:not(.hide)');
    let shown = 0;
    if (overlay) {
        overlay.dataset.adopted = '1';
        clearTimeout(Number(overlay.dataset.fallback));
        shown = Date.now() - Number(overlay.dataset.at || Date.now());
    } else {
        overlay = document.createElement('div');
        overlay.className = 'greet-overlay greet-poster';
        overlay.innerHTML = `<img class="greet-pic" alt="">
            <div class="greet-text">
                <div class="greet-kick"></div>
                <div class="greet-name"><span class="greet-rank"></span>등급<br><span class="greet-who"></span>님</div>
                <div class="greet-msg">입장하였습니다 · 화면을 누르면 넘어갑니다</div>
            </div>`;
        if (window.__greetFont) window.__greetFont(overlay);
    }
    overlay.style.setProperty('--g1', g.from);
    overlay.style.setProperty('--g2', g.to);
    overlay.querySelector('.greet-kick').textContent = g.phrase;
    overlay.querySelector('.greet-rank').textContent = rankInfo.name;
    overlay.querySelector('.greet-who').textContent = myName;
    let pic = overlay.querySelector('.greet-pic');
    if (picSrc) {
        if (!pic) { pic = document.createElement('img'); pic.className = 'greet-pic'; pic.alt = ''; overlay.prepend(pic); }
        // 이 기기에 담아 둔 그림이 있으면 그것을 쓴다 — 인터넷을 안 기다린다(greetPicCached).
        const show = greetPicCached(picSrc) || picSrc;
        if (pic.getAttribute('src') !== show) setGreetPic(pic, show);
    } else if (pic) pic.remove();
    // 다음 접속 때 바로 뜨게 계급 그림을 이 기기에 담아 둔다(이미 담겨 있으면 아무 일도 안 한다).
    setTimeout(() => storeGreetPic(picSrc), 3500);
    if (!overlay.isConnected) {
        document.body.appendChild(overlay);
        requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));
    }

    // 3초를 채우든 눌러서 넘기든 한 번만 사라지게 한다.
    // 먼저 그려 둔 창은 이미 떠 있던 만큼 빼고, 홈이 다 그려진 뒤 잠깐은 더 둔다.
    let gone = false;
    const dismiss = () => {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        overlay.classList.remove('show');
        overlay.classList.add('hide');
        // 인사말이 완전히 걷힌 뒤에 연출을 시작한다 — 안 그러면 뒤에서 혼자 끝나 버린다.
        setTimeout(() => { overlay.remove(); runEntranceEffects(); }, 450);
    };
    const timer = setTimeout(dismiss, Math.max(600, 3000 - shown));
    overlay.onclick = dismiss;
}

// 통합 정산 요약의 뱃지 칩 높이를 네 칸 모두 같게 맞춘다.
// 다 한 줄이면 한 줄 높이로 낮게, 하나라도 두 줄로 접히면 모두 두 줄 높이로 — 그래야 합산이 같은 높이에 선다.
// (예전엔 늘 두 줄 자리로 못박아 한 줄짜리 칩이 헐렁했다 — 사용자 요청 `뱃지높이를 좀만 줄여줘`.)
function equalizeSummaryBadges() {
    const grid = document.getElementById('summaryGrid');
    if (!grid) return;
    grid.style.removeProperty('--chip-h');
    let h = 0;
    grid.querySelectorAll('.sum-badges .season-badge').forEach(c => { h = Math.max(h, c.offsetHeight); });
    if (h) grid.style.setProperty('--chip-h', h + 'px');
}
let equalizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(equalizeTimer); equalizeTimer = setTimeout(equalizeSummaryBadges, 150); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => equalizeSummaryBadges());

// ─── 화면 다섯: 홈 / 정산·스코어 / 미션 / 뱃지 / 여행 — 좌우로 밀어서 넘긴다 ───
// 사용자 요청 — `통합정산요약까지 1화면, 나머지 2화면` → `탭 모양이 너무 안예뻐. 좌우 슬라이드방식으로`.
// 숨긴 쪽은 display:none일 뿐 그대로 그려진다(renderAll은 손대지 않는다).
// 표는 숨어 있는 동안 폭이 0이라 jumpToLatestRound()가 오른쪽 끝으로 못 보낸다 —
// 처음 정산·스코어로 넘어올 때 다시 부른다(그 함수는 한 번만 보낸다).
// top: 넘어간 뒤 놓을 스크롤 자리(안 주면 맨 위).
// 화면 차례 — 왼쪽부터. 알약의 칸 차례이자 밀어서 넘기는 차례다.
// 여행은 맨 끝 — 자주 쓰는 탭이 아니다(사용자 요청).
// 미션은 세 번째(사용자 요청 — `미션탭을 3번째 위치에`).
const PAGE_ORDER = ['home', 'detail', 'mission', 'badges', 'trip'];

function showPage(name, top) {
    const box = document.getElementById('appContainer');
    if (!box || !PAGE_ORDER.includes(name)) return;
    const same = box.dataset.page === name;
    box.dataset.page = name;
    document.querySelectorAll('.page-tab').forEach(b => {
        const on = b.dataset.tab === name;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const sw = document.getElementById('pageSwitch');
    if (sw) sw.style.setProperty('--seg', PAGE_ORDER.indexOf(name));
    try { sessionStorage.setItem('jtfag_page', name); } catch (e) {}
    window.scrollTo(0, typeof top === 'number' ? top : 0);
    if (!same && name === 'detail') {
        requestAnimationFrame(() => { if (typeof jumpToLatestRound === 'function') jumpToLatestRound(); forceTableReflow(); });
    }
}
// 새로고침해도 보던 화면에 남는다(앱을 새로 켜면 홈부터).
try {
    const p = sessionStorage.getItem('jtfag_page');
    if (p !== 'home' && PAGE_ORDER.includes(p)) document.addEventListener('DOMContentLoaded', async () => {
        if (window.jtfagStylesReady) await window.jtfagStylesReady;
        showPage(p);
    });
} catch (e) {}

// 미는 동안만 두 화면을 나란히 펴고(.swiping) .pager를 옆으로 옮긴다.
// - 들어오는 화면은 지금 보이는 자리(스크롤)에 맞춰 내려 둔다 — 정산·스코어 아래쪽에서 밀어도
//   홈이 빈자리 없이 손을 따라 나온다. 넘어간 뒤 그만큼 스크롤을 옮겨 한 픽셀도 안 튄다.
// - 가로로 굴러가는 칸(타수 표 등)과 입력칸에서 시작한 손짓은 안 받는다 — 표는 표대로 민다.
const pagerSwipe = (() => {
    const EASE_MS = 320;
    const PAGE_GAP = 16;    // 두 화면 사이 틈 — style.css의 .pager gap과 같아야 한다
    let st = null;          // 손짓 하나의 상태
    let busy = false;       // 넘어가는 움직임이 도는 중
    const el = id => document.getElementById(id);
    const order = n => Math.max(0, PAGE_ORDER.indexOf(n));
    const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function taken(t, clip) {
        if (!t || !t.closest) return true;
        if (t.closest('input, textarea, select, [contenteditable="true"]')) return true;
        for (let n = t; n && n !== clip; n = n.parentElement) {
            if (n.scrollWidth > n.clientWidth + 1) {
                const ox = getComputedStyle(n).overflowX;
                if (ox === 'auto' || ox === 'scroll') return true;
            }
        }
        return false;
    }

    // 두 화면을 펴고 들어올 화면을 지금 보는 높이에 맞춘다
    function open(from, to) {
        const box = el('appContainer'), clip = el('pagerClip'), pager = el('pager');
        const W = clip.clientWidth + PAGE_GAP;   // 한 화면 + 사이 틈
        const P = clip.getBoundingClientRect().top + window.scrollY;
        // 보이는 자리는 붙박인 위 막대 아래부터다 — 들어오는 화면의 맨 위가 막대에 가리지 않게 그만큼 더한다
        const bar = el('topBar');
        const H = bar ? bar.offsetHeight : 0;
        const off = Math.max(0, window.scrollY + H - P);
        box.classList.add('swiping');
        const incoming = to !== from ? box.querySelector('.page-' + to) : null;
        if (incoming && off) incoming.style.transform = `translateY(${off}px)`;
        pager.style.transform = `translateX(${-order(from) * W}px)`;
        return { box, clip, pager, W, P, H, off, incoming, from, to };
    }

    function paint(s, x) {
        s.pager.style.transform = `translateX(${x}px)`;
        const sw = el('pageSwitch');
        if (sw) sw.style.setProperty('--seg', Math.min(PAGE_ORDER.length - 1, Math.max(0, -x / s.W)));
    }

    // 넘어가거나(commit) 제자리로 돌아간 뒤 정리한다
    function settle(s, commit) {
        busy = true;
        const sw = el('pageSwitch');
        if (sw) { sw.classList.remove('drag'); sw.style.setProperty('--seg', order(commit ? s.to : s.from)); }
        s.pager.classList.add('anim');
        s.pager.style.transform = `translateX(${-order(commit ? s.to : s.from) * s.W}px)`;
        let done = false;
        const end = () => {
            if (done) return; done = true;
            const keep = window.scrollY;
            s.pager.classList.remove('anim');
            s.pager.style.transform = '';
            if (s.incoming) s.incoming.style.transform = '';
            s.box.classList.remove('swiping');
            if (commit) showPage(s.to, s.off ? Math.max(0, s.P - s.H) : keep);
            busy = false;
        };
        s.pager.addEventListener('transitionend', end, { once: true });
        setTimeout(end, EASE_MS + 120);   // transitionend가 안 오는 판(앱을 덮어 둔 때 등)의 그물
    }

    function slideTo(name) {
        const box = el('appContainer');
        if (!box || busy || st) return;
        const from = box.dataset.page || 'home';
        if (from === name) return;
        if (reduce()) { showPage(name); return; }
        const s = open(from, name);
        void s.pager.offsetWidth;   // 출발 자리를 한 번 그려 두고 움직인다
        settle(s, true);
    }

    function start(e) {
        if (busy || e.touches.length !== 1) { st = null; return; }
        const clip = el('pagerClip');
        const t = e.touches[0];
        st = { x: t.clientX, y: t.clientY, own: false, dead: taken(e.target, clip), dx: 0, hist: [[t.clientX, Date.now()]] };
    }

    function move(e) {
        if (!st || st.dead) return;
        const t = e.touches[0];
        const dx = t.clientX - st.x, dy = t.clientY - st.y;
        if (!st.own) {
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
            if (Math.abs(dx) < Math.abs(dy) * 1.2) { st.dead = true; return; }   // 세로로 굴리는 손짓
            const from = el('appContainer').dataset.page || 'home';
            // 왼쪽으로 밀면 다음 화면, 오른쪽으로 밀면 앞 화면. 그쪽에 화면이 없으면 제자리(살짝만 따라온다).
            const step = dx < 0 ? 1 : -1;
            const to = PAGE_ORDER[order(from) + step] || null;
            st.own = true; st.x = t.clientX;   // 여기서부터 손을 따라간다(처음 10px은 버린다)
            st.s = open(from, to || from);
            st.s.step = step; st.s.edge = !to;
            const sw = el('pageSwitch'); if (sw) sw.classList.add('drag');
        }
        e.preventDefault();
        const s = st.s;
        let d = t.clientX - st.x;
        // 갈 데가 없거나, 처음 민 쪽과 반대로 되밀면 살짝만 따라온다
        if (s.edge || d * s.step > 0) d *= 0.2;
        d = Math.max(-s.W, Math.min(s.W, d));
        st.dx = d;
        st.hist.push([t.clientX, Date.now()]);
        if (st.hist.length > 5) st.hist.shift();
        paint(s, -order(s.from) * s.W + d);
    }

    function end() {
        if (!st) return;
        const cur = st; st = null;
        if (!cur.own) return;
        const s = cur.s;
        const h = cur.hist, a = h[0], b = h[h.length - 1];
        const dt = b[1] - a[1];
        const v = dt > 0 && Date.now() - b[1] < 120 ? (b[0] - a[0]) / dt : 0;   // px/ms, 멈췄다 놓으면 0
        const dir = -s.step;   // 넘어가려면 이쪽으로 밀어야 한다
        const go = !s.edge && (cur.dx * dir > s.W * 0.3 || (v * dir > 0.5 && cur.dx * dir > 20));
        settle(s, go);
    }

    document.addEventListener('DOMContentLoaded', () => {
        // 내용이 위 막대 밑으로 들어가기 시작하면 막대 아래에 가는 선을 긋는다
        const bar = el('topBar');
        if (bar) {
            let q = false;
            const mark = () => { q = false; bar.classList.toggle('lifted', (window.scrollY || 0) > 2); };
            window.addEventListener('scroll', () => { if (!q) { q = true; requestAnimationFrame(mark); } }, { passive: true });
            mark();
        }
        const clip = el('pagerClip');
        if (!clip) return;
        clip.addEventListener('touchstart', start, { passive: true });
        clip.addEventListener('touchmove', move, { passive: false });   // 가로로 미는 동안만 세로 굴림을 막는다
        clip.addEventListener('touchend', end);
        clip.addEventListener('touchcancel', end);
    });

    return { slideTo };
})();
function slideToPage(name) { pagerSwipe.slideTo(name); }
