// ◇ ui.js를 나눈 조각 — renderAll(렌더 파이프라인) · 연출(입장 순서 · 카운트업 · 계급 변동 · 결과 발표 · 독수리 축포 · 대관식)
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
function renderAll() {
    renderTable();
    calculateAndRender();
    renderMoneyTable();
    forceTableReflow();
    jumpToLatestRound();
    renderStorageUsage();
    updateScoreRequestBtn();
    checkAndGreetUser();
    animateFinalTotals();
    checkRankChange();
    checkRoundResultReveal();
    if (typeof checkMissionReveal === 'function') checkMissionReveal();
    checkEagleStreakCelebration();
    if (typeof renderMissionPage === 'function') renderMissionPage();
    if (typeof renderBadgePage === 'function') { renderBadgePage(); checkBadgeUnlocks(); }
    if (typeof refreshTripPage === 'function') refreshTripPage();
    if (typeof checkPassportStamps === 'function') checkPassportStamps();
}

// ─── 연출 세 가지 ───
// 공통 규칙: **한 번만 돌고 끝나야 하고, transform과 opacity만 움직여야 한다.**
// 계속 도는 애니메이션이나 filter·blur을 쓰면 안드로이드에서 화면이 끊기고 일부가 안 그려진다
// (실제로 그래서 뱃지의 무한 glow와 닫힌 모달의 blur을 걷어냈다).
//
// **입장 인사말이 걷힌 뒤에 시작한다.** 인사말이 3초 넘게 화면을 덮고 있어서,
// 그 뒤에서 카운트업(0.7초)이 혼자 끝나 버려 아무도 못 봤다.
//
// '인사말이 화면에 있는가'로 막으면 안 된다 — 표가 먼저 그려지고 인사말이 조금 뒤에
// 뜨는 순간이 있어서, 그 틈에 카운트업이 시작해 버린다(실제로 그랬다).
// 그래서 **인사말이 지나갔는가**를 한 번만 뒤집는 문으로 둔다.
let entranceReady = false;
let entranceFallback = null;

function entranceBlocked() {
    // 결과 발표가 떠 있는 동안에도 막는다 — 그 창이 화면을 덮고 있어서
    // 뒤에서 카운트업이 돌면 또 아무도 못 본다. 발표를 닫으면 그때 이어서 돈다.
    if (document.querySelector('.reveal-overlay')) return true;
    if (entranceReady) return false;
    // 인사말이 아예 안 뜨는 경우(이미 인사한 세션, 이름 미등록 등)에도 연출은 나와야 한다.
    if (!entranceFallback) entranceFallback = setTimeout(runEntranceEffects, 6000);
    return true;
}

// 인사말이 사라지는 순간 showGreeting()이 불러 준다.
function runEntranceEffects() {
    if (entranceReady) return;
    entranceReady = true;
    clearTimeout(entranceFallback);
    // 발표가 열리면 아래 셋은 entranceBlocked()에 막히고, 발표를 닫을 때 이어서 돈다.
    checkRoundResultReveal();
    afterRevealEffects();
}

function afterRevealEffects() {
    // 미션 결과 발표가 뜨면 아래 넷은 entranceBlocked()에 막히고, 그 창을 닫을 때 다시 이 함수가 돈다.
    if (typeof checkMissionReveal === 'function') checkMissionReveal();
    animateFinalTotals();
    checkRankChange();
    checkEagleStreakCelebration();
    if (typeof checkBadgeUnlocks === 'function') checkBadgeUnlocks();
}

// 1) 합산 금액이 0에서 실제 값까지 굴러 올라간다. 접속당 한 번.
//    글자만 바꾸므로 그리기 비용이 사실상 없다.
// 저장할 때마다 실시간 이벤트가 되돌아와 요약 카드를 통째로 다시 그린다.
// 그래서 연출은 **다시 그려져도 살아남게** 만들어야 한다 —
// 붙여 둔 DOM을 들고 있지 말고, 매번 다시 찾아서 적용한다.
let countUpStarted = 0;   // 0이면 아직 시작 안 함

function animateFinalTotals() {
    if (countUpStarted || entranceBlocked()) return;
    if (document.querySelectorAll('.final-total[data-final]').length === 0) return;
    countUpStarted = performance.now();
    if (typeof summaryTotalsShown !== 'undefined' && !summaryTotalsShown) return;   // 접혀 있으면 펼칠 때 돈다
    runFinalCountUp();
}
// 합산 금액을 0에서 실제 값까지 굴린다. 펼치는 순간에도 쓴다(toggleSummaryTotals).
function runFinalCountUp() {
    const startedAt = performance.now();
    const DURATION = 700;
    const step = (now) => {
        if (typeof summaryTotalsShown !== 'undefined' && !summaryTotalsShown) return;
        const t = Math.min(1, (now - startedAt) / DURATION);
        const eased = 1 - Math.pow(1 - t, 3);   // 끝에서 부드럽게 멎는다
        // 다시 그려지면 예전 칸은 사라지므로 매 프레임 새로 찾는다.
        document.querySelectorAll('.final-total[data-final]').forEach(el => {
            const target = parseFloat(el.getAttribute('data-final')) || 0;
            // 만 원 단위로 끊어 올린다 — 1원 단위로 굴리면 글자가 정신없다.
            const v = Math.round(target * eased / 10000) * 10000;
            el.textContent = formatFinalBalance(t < 1 ? v : target);   // '합산' 글자는 위 줄(.final-label)에 따로 있다
        });
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// 2) 계급이 바뀐 사람의 뱃지가 튀어오른다. 기기마다 그 변화당 한 번.
//    올라갔으면 위로 솟고, 떨어졌으면 아래로 툭 떨어진다.
// 무엇이 바뀌었는지는 한 번만 판정해 pendingRankBump에 담아 두고,
// 실제로 붙이는 건 다시 그릴 때마다 한다 (안 그러면 실시간 갱신에 지워진다).
let pendingRankBump = {};
let rankBumpChecked = false;

function checkRankChange() {
    if (typeof golferRankHistory === 'undefined' || entranceBlocked()) return;

    if (!rankBumpChecked) {
        let ready = false;
        golfers.forEach(name => {
            const ranks = golferRankHistory[name] || [];
            if (ranks.length === 0) return;
            ready = true;
            const now = ranks[ranks.length - 1];
            const key = `jtfag_rank_${name}`;
            const seen = localStorage.getItem(key);
            localStorage.setItem(key, `${ranks.length}:${now}`);
            if (!seen) return;                   // 처음 보는 기기면 조용히 넘어간다
            const [seenCount, seenRank] = seen.split(':').map(Number);
            if (seenCount === ranks.length || seenRank === now) return;
            // 숫자가 작을수록 높은 계급이다 (0 = 독수리).
            pendingRankBump[name] = now < seenRank ? 'rank-up' : 'rank-down';
        });
        if (ready) rankBumpChecked = true;
        // 연출은 잠깐이면 충분하다. 지나면 더 붙이지 않는다.
        if (Object.keys(pendingRankBump).length) setTimeout(() => { pendingRankBump = {}; }, 4000);
    }

    Object.keys(pendingRankBump).forEach(name => {
        // 이름 칸에는 ⭐(독수리 명예 표식)이 붙을 수 있어 첫 글자 마디(이름 자체)로 견준다.
        const card = [...document.querySelectorAll('.summary-item')]
            .find(el => { const n = el.querySelector('.name'); return n && n.firstChild && n.firstChild.textContent === name; });
        const badge = card && card.querySelector('.rank-badge');
        if (badge && !badge.classList.contains(pendingRankBump[name])) {
            badge.classList.add(pendingRankBump[name]);
        }
    });
}

// 3) 새 차수 결과가 처음 보이면 4위부터 1위까지 차례로 공개한다.
//    기기마다 그 차수당 한 번. 이미 아는 결과라도 순서대로 까 보는 맛이 있다.
function checkRoundResultReveal() {
    if (typeof lastRankedRound === 'undefined' || lastRankedRound < 0) return;
    if (entranceBlocked()) return;
    if (document.querySelector('.reveal-overlay, .celebrate-overlay')) return;

    const key = 'jtfag_result_seen';
    const seen = parseInt(localStorage.getItem(key), 10);
    if (seen === lastRankedRound) return;
    localStorage.setItem(key, String(lastRankedRound));
    if (!Number.isFinite(seen)) return;          // 처음 보는 기기면 예전 차수까지 들출 이유가 없다

    const order = golfers.slice().sort((a, b) => {
        const ra = (golferRankHistory[a] || []).slice(-1)[0];
        const rb = (golferRankHistory[b] || []).slice(-1)[0];
        return ra - rb;
    });
    revealRoundResult(lastRankedRound, order);
}

// 우승 포스터(사용자가 시안 넷 중 C를 골랐다 — 아티팩트 `JTFAG 결과 발표 시안`).
// 금빛 화면에 4위 → 3위 → 2위가 아래에서 차례로 올라오고, 마지막에 우승자 이름과 계급 그림이 뜬다.
// 금액은 적지 않는다(사용자 요청). 계급 그림은 투명 이모티콘을 바탕 없이 통째로 띄운다(입장 인사말과 같다).
function revealRoundResult(roundIdx, order) {
    const rankOf = name => {
        const r = (golferRankHistory[name] || []).slice(-1)[0];
        return RANK_CONFIG[r] ? r : 3;
    };
    const picOf = r => { const m = /src="([^"]+)"/.exec(RANK_CONFIG[r].icon || ''); return m ? m[1] : ''; };
    const grossOf = name => (appData.scores[name] && appData.scores[name][roundIdx]) || '';

    const STEP = 0.45;                                  // 줄 하나가 올라오는 간격(초)
    const rest = order.slice(1);
    const rows = rest.map((name, i) => {
        const r = rankOf(name), pic = picOf(r), g = grossOf(name);
        const delay = 0.4 + (rest.length - 1 - i) * STEP;   // 4위부터
        return `<div class="rp-row" style="animation-delay:${delay}s">
            <span class="rp-place">${i + 2}</span>
            ${pic ? `<img class="rp-pic" src="${pic}" alt="">` : ''}
            <span class="rp-name">${escapeHtml(name)}</span>
            <span class="rp-meta">${g !== '' ? g + '타 · ' : ''}${RANK_CONFIG[r].name}</span>
        </div>`;
    });
    const winAt = 0.4 + rest.length * STEP + 0.25;       // 마지막 줄이 뜬 뒤 우승자

    const champ = order[0];
    const cr = rankOf(champ), cpic = picOf(cr), cg = grossOf(champ);
    const course = (appData.courses && appData.courses[roundIdx]) || '';
    const no = String(roundIdx + 1).padStart(2, '0');

    const overlay = document.createElement('div');
    overlay.className = 'reveal-overlay reveal-poster';
    overlay.innerHTML = `
        <div class="rp-num" aria-hidden="true">${no}</div>
        <div class="rp-head">ROUND ${roundIdx + 1}${course ? ' · ' + escapeHtml(course) : ''}</div>
        ${cpic ? `<img class="rp-hero" src="${cpic}" alt="" style="animation-delay:${winAt}s">` : ''}
        <div class="rp-body">
            <div class="rp-win" style="animation-delay:${winAt + 0.3}s">
                <div class="rp-kick">🏆 ${roundIdx + 1}차전 우승</div>
                <div class="rp-champ">${escapeHtml(champ)}님</div>
                <div class="rp-sub">${cg !== '' ? cg + '타 · ' : ''}${RANK_CONFIG[cr].name}</div>
            </div>
            <div class="rp-rows">${rows.join('')}</div>
            <div class="rp-tap" style="animation-delay:${winAt + 0.9}s">화면을 누르면 넘어갑니다</div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));

    // 우승자가 뜨는 순간 색종이를 뿌린다.
    const timers = [setTimeout(() => dropConfetti(overlay, 60), (winAt + 0.3) * 1000)];

    const close = () => {
        timers.forEach(clearTimeout);
        overlay.classList.remove('on');
        // 창이 완전히 걷힌 뒤에 카운트업·계급 변동을 이어서 보여 준다.
        setTimeout(() => { overlay.remove(); afterRevealEffects(); }, 300);
    };
    overlay.onclick = close;
}

// ─── 독수리 연속 달성 축포 ───
// 모임에서 크게 축하하기로 한 기록이라 뱃지만으로는 모자라 화면 전체로 터뜨린다.
// 기기마다 사람·연속수 조합당 딱 한 번만 뜬다 — 접속할 때마다 뜨면 축하가 아니라 방해다.
// (4연속이 되면 키가 달라지므로 그때 또 한 번 뜬다.)
const CONFETTI_COLORS = ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff', '#34d399', '#60a5fa', '#f472b6'];

// 색종이는 결과 발표와 독수리 축포가 함께 쓴다.
// transform만 움직이므로 80장을 뿌려도 안드로이드에서 안 끊긴다.
function dropConfetti(host, count, colors) {
    const palette = colors && colors.length ? colors : CONFETTI_COLORS;
    for (let i = 0; i < count; i++) {
        const bit = document.createElement('div');
        bit.className = 'confetti';
        bit.style.left = (Math.random() * 100) + 'vw';
        bit.style.backgroundColor = palette[i % palette.length];
        bit.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
        bit.style.animationDelay = (Math.random() * 1.4) + 's';
        if (Math.random() < 0.35) bit.style.borderRadius = '50%';
        host.appendChild(bit);
    }
}

function checkEagleStreakCelebration() {
    if (typeof eagleStreak !== 'function' || typeof golferRankHistory === 'undefined') return;
    if (entranceBlocked()) return;
    if (document.querySelector('.celebrate-overlay, .reveal-overlay')) return;
    for (const name of golfers) {
        const streak = eagleStreak(golferRankHistory[name] || []);
        if (streak < 3) continue;
        const key = `jtfag_eagle_${name}_${streak}`;
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
        celebrateEagleStreak(name, streak);
        return;   // 한 번에 하나만. 둘이 동시에 달성했으면 나머지는 다음 접속 때 뜬다
    }
}

/* 독수리 연속 달성 축포.
   모임에서 크게 축하하기로 한 기록이라 화면을 통째로 쓴다 —
   독수리가 하늘에서 날아 내려오고 울음소리가 함께 난다.

   **여기서도 transform과 opacity만 움직인다.** 화면을 꽉 채우는 연출이라
   filter나 blur을 쓰면 안드로이드가 그대로 주저앉는다. 날갯짓도 회전(transform)이고
   반복 횟수가 정해져 있어 6.5초 뒤 창과 함께 사라진다 — 무한 반복이 남지 않는다.

   소리는 막힐 수 있다(브라우저가 사용자 동작 없는 자동 재생을 막는다).
   막혀도 그림은 그대로 나오고 오류창도 안 띄운다. 뱃지를 눌러서 볼 때는
   누른 동작이 있으니 반드시 난다. */
function playEagleCry() {
    if (!SOUND_CONFIG[0]) return;
    try {
        const audio = new Audio(SOUND_CONFIG[0]);
        audio.volume = 0.7;
        audio.play().catch(e => console.log("독수리 소리 재생 실패:", e));
    } catch (e) { /* 소리가 안 나도 축하는 계속된다 */ }
}

/* 앞에서 본 흰머리수리. 날개는 따로 묶어 두어 몸통과 별개로 회전시킨다(날갯짓).

   **병아리처럼 보이지 않게 하는 건 비율이다.** 머리가 크고 날개가 짧으면 아기 새가 된다.
   그래서 날개폭을 몸통의 다섯 배 가까이 벌리고, 머리는 작게 두고, 날개를 위로 살짝
   들어 올려(솟아오르는 V자) 활공하는 자세로 잡았다. 머리를 키우지 말 것.

   독수리로 읽히게 하는 나머지는 **흰 머리 · 갈고리 부리 · 갈라진 날개 끝 · 사나운 눈썹**이다.
   눈썹을 빼면 순한 새가 되므로 빼지 말 것. */
function eagleSvg() {
    // 어깨에서 위로 뻗어 나가 끝이 다섯 갈래로 갈라지는 날개 (왼쪽 기준, 오른쪽은 뒤집어 쓴다)
    const wing = `M 138 58
        C 116 44, 78 26, 40 18
        L 12 10  L 40 26
        L 8 26   L 40 38
        L 14 44  L 44 52
        L 26 62  L 56 62
        L 44 76  L 74 66
        C 98 60, 124 62, 138 66 Z`;
    return `
    <svg class="eg-bird" viewBox="0 0 300 165" aria-hidden="true">
      <defs>
        <linearGradient id="egBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8a5a1b"/><stop offset="45%" stop-color="#5c2a0c"/><stop offset="100%" stop-color="#2e1206"/>
        </linearGradient>
        <linearGradient id="egWing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fde68a"/><stop offset="38%" stop-color="#c98b25"/><stop offset="100%" stop-color="#5c2a0c"/>
        </linearGradient>
        <linearGradient id="egHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#dbe2ea"/>
        </linearGradient>
      </defs>

      <g class="eg-wing eg-wl"><path d="${wing}" fill="url(#egWing)"/></g>
      <g class="eg-wing eg-wr"><path d="${wing}" fill="url(#egWing)" transform="translate(300,0) scale(-1,1)"/></g>

      <!-- 부챗살처럼 펼친 꼬리 -->
      <path d="M 138 104 L 162 104 L 170 148 L 159 138 L 155 152 L 150 140 L 145 152 L 141 138 L 130 148 Z" fill="url(#egWing)"/>

      <!-- 몸통. 가슴은 넓고 아래로 갈수록 좁아진다 -->
      <path d="M 150 44 C 164 44, 172 54, 171 66 L 167 92 L 160 110 L 150 118 L 140 110 L 133 92 L 129 66 C 128 54, 136 44, 150 44 Z" fill="url(#egBody)"/>
      <!-- 가슴 깃 결 -->
      <path d="M 150 62 L 156 76 L 150 90 L 144 76 Z" fill="#3f1c08" opacity="0.55"/>

      <!-- 흰 머리. 작게 둘 것 — 키우면 아기 새가 된다 -->
      <path d="M 150 20 C 161 20, 168 28, 168 37 C 168 45, 160 50, 150 50 C 140 50, 132 45, 132 37 C 132 28, 139 20, 150 20 Z" fill="url(#egHead)"/>
      <!-- 사나운 눈매 -->
      <path d="M 136 29 L 147 34 L 147 38 L 136 33 Z" fill="#4a2109"/>
      <path d="M 164 29 L 153 34 L 153 38 L 164 33 Z" fill="#4a2109"/>
      <circle cx="141" cy="37" r="2.7" fill="#f59e0b"/><circle cx="159" cy="37" r="2.7" fill="#f59e0b"/>
      <circle cx="141" cy="37" r="1.4" fill="#111827"/><circle cx="159" cy="37" r="1.4" fill="#111827"/>
      <!-- 끝이 아래로 굽은 갈고리 부리 -->
      <path d="M 143 42 L 157 42 L 155 52 C 154 59, 151 63, 147 64 C 150 59, 151 54, 148 50 L 144 48 Z" fill="#facc15"/>
    </svg>`;
}

/* 연출은 기기마다 한 번만 뜬다 — 접속할 때마다 뜨면 축하가 아니라 방해다.
   그 '봤다' 표시가 localStorage에 남아 있어서, 차수를 지웠다 다시 만들어도
   축포가 다시 뜨지 않는다(실제로 이것 때문에 안 나온다는 문의가 있었다).

   이 버튼은 **표시만 지운다.** 타수·금액·사진 어느 것도 건드리지 않는다. */
function resetEffectSeen() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('jtfag_eagle_') || k.startsWith('jtfag_rank_') || k === 'jtfag_result_seen')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    // 결과 발표는 기록이 '아예 없으면' 처음 온 기기로 보고 안 띄운다(checkRoundResultReveal).
    // 그래서 지우지 말고 '바로 앞 차수까지 봤다'로 적어 둬야 새로고침 때 마지막 차수 결과가 다시 뜬다.
    if (typeof lastRankedRound === 'number' && lastRankedRound >= 0) {
        localStorage.setItem('jtfag_result_seen', String(lastRankedRound - 1));
    }
    showToast(keys.length
        ? `🎬 연출 기록 ${keys.length}개를 초기화했습니다. 새로고침하면 다시 재생됩니다.`
        : "🎬 초기화할 연출 기록이 없습니다.");
}

/* 독수리 연속 달성 — 대관식(사용자 요청 — `독수리3연속하기 쉽지않잖아. 그래서 엄청 웅장하게` ·
   시안 `독수리 3연속 대관식`을 보고 `이대로 넣어줘`).

   차례: 어둠 속 금빛 한 줄 → 검은 막이 위아래로 열림 → 우승 메달이 차수마다 하나씩 내리꽂힘(그 차수 타수) →
   독수리 강림(실사 영상을 금테 원판에 · 못 받으면 앱이 그린 독수리) → 섬광과 함께 큰 숫자 폭발 →
   `독·수·리` → 이름 → 붉은 낙인. 메달이 꽂힐 때·숫자가 터질 때 화면이 흔들리고 북소리가 난다(WebAudio로 만든다 — 파일이 없다).

   등급은 뱃지와 같은 셋이다(3 금빛 · 4 불꽃 · 5 이상 전설). **transform·opacity만 움직이고 모든 애니메이션이 횟수가 정해져 끝난다**
   (안드로이드 규칙). 화면 비율을 세로 1:2.05에 맞춰 가운데 둔다 — 크기를 폭 기준(cqw)으로 잡아 넓은 화면에서 넘치지 않게. */
const EAGLE_TIERS = [
    { min: 5, cls: 't5', seal: 'JTFAG<br>전설', sub: n => `<em>${n}경기 연속 1위</em> · 모임 역사에 이름을 새겼습니다`, conf: ['#fff1c9', '#c79bff', '#f4c95d', '#ffffff'], confN: 110 },
    { min: 4, cls: 't4', seal: '불패의<br>군림', sub: n => `<em>${n}경기 연속 1위</em> · 아무도 막지 못했습니다`, conf: ['#ffe1c2', '#ff7a2f', '#ffb347', '#ffffff'], confN: 90 },
    { min: 3, cls: '', seal: '명예의<br>전당', sub: n => `<em>${n}경기 연속 1위</em> · 독수리 계급을 지켜 냈습니다`, conf: ['#fff4cf', '#f4c95d', '#e0a52b', '#ffffff'], confN: 70 }
];

function eagleTier(streak) {
    return EAGLE_TIERS.find(t => streak >= t.min) || EAGLE_TIERS[EAGLE_TIERS.length - 1];
}

// 연속을 이룬 차수들 — 계급 이력의 끝에서 연속수만큼(`rankedRoundsList[i]`가 i번째 계급의 차수 인덱스다)
function eagleStreakRounds(name, streak) {
    const list = (typeof rankedRoundsList !== 'undefined' && rankedRoundsList) || [];
    return list.slice(Math.max(0, list.length - streak)).map(r => {
        const s = parseFloat(appData && appData.scores && appData.scores[name] ? appData.scores[name][r] : NaN);
        return { no: r + 1, score: isNaN(s) ? '' : String(s) };
    });
}

// 북소리 — 낮은 사인파가 뚝 떨어지며 사라지고 짧은 잡음을 얹는다. 소리가 막혀도 그림은 그대로다.
let eagleAudioCtx = null;
function eagleDrums(plan) {
    try {
        if (!eagleAudioCtx) eagleAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const ctx = eagleAudioCtx;
        if (ctx.resume) ctx.resume();
        const boom = (at, f, g) => {
            const t = ctx.currentTime + at;
            const o = ctx.createOscillator(), v = ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.5);
            v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(g, t + 0.01); v.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
            o.connect(v).connect(ctx.destination); o.start(t); o.stop(t + 1.2);
            const len = Math.floor(ctx.sampleRate * 0.25), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
            const s = ctx.createBufferSource(), n = ctx.createGain(), lp = ctx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 900; n.gain.value = g * 0.5;
            s.buffer = buf; s.connect(lp).connect(n).connect(ctx.destination); s.start(t);
        };
        const swell = (at, dur) => {
            const t = ctx.currentTime + at;
            [98, 147, 196, 247].forEach((f, i) => {
                const o = ctx.createOscillator(), v = ctx.createGain(), lp = ctx.createBiquadFilter();
                o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass';
                lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(2200, t + dur * 0.6);
                v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(0.035, t + 0.4); v.gain.setValueAtTime(0.035, t + dur * 0.7); v.gain.linearRampToValueAtTime(0.0001, t + dur);
                o.connect(lp).connect(v).connect(ctx.destination); o.start(t + i * 0.02); o.stop(t + dur + 0.1);
            });
        };
        swell(0.2, 1.4);
        plan.hits.forEach(t => boom(t, 70, 0.7));
        boom(plan.count, 46, 1); boom(plan.count, 92, 0.5);
        boom(plan.seal, 120, 0.45);
        swell(plan.count - 0.05, 3.2);
    } catch (e) { /* 소리가 안 나도 축하는 계속된다 */ }
}

// 제목 글꼴(Black Han Sans·Cinzel)은 이 연출에서만 쓰므로 처음 뜰 때 한 번 불러온다. 못 받으면 앱 글꼴로 그려진다.
function loadEagleFonts() {
    if (document.getElementById('g3Fonts')) return;
    const l = document.createElement('link');
    l.id = 'g3Fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Cinzel:wght@600&display=swap';
    document.head.appendChild(l);
}

function celebrateEagleStreak(name, streak) {
    if (typeof closeEagleFilm === 'function') closeEagleFilm(true);
    const existing = document.querySelector('.celebrate-overlay');
    if (existing) existing.remove();
    if ([3, 4, 5].includes(streak) && typeof showEagleFilm === 'function') return showEagleFilm(name, eagleStreakRounds(name, streak), streak);
    loadEagleFonts();

    const tier = eagleTier(streak);
    const rounds = eagleStreakRounds(name, streak);
    const shown = rounds.slice(-8);      // 메달은 여덟 개까지 — 그 넘어로는 한 줄에 안 들어간다
    const n = shown.length || 1;
    const M0 = 1.6, GAP = n > 5 ? 0.25 : 0.45;
    const EAG = M0 + (n - 1) * GAP + 0.75, CNT = EAG + 1.25, TTL = CNT + 0.55, NAME = TTL + 0.55, SEAL = NAME + 0.6, SUB = SEAL + 0.4;
    const mSize = n <= 3 ? 24 : n === 4 ? 19 : n === 5 ? 15.5 : 11;
    const photo = EAGLE_HERO_URL;

    const overlay = document.createElement('div');
    overlay.className = 'celebrate-overlay g3-host';
    overlay.innerHTML = `<div class="g3 ${tier.cls}">
        <div class="g3-sky" style="animation-delay:.9s"></div>
        <div class="g3-rays" style="animation-delay:1s,1s"></div>
        <div class="g3-halo" style="animation-delay:${(EAG + 0.3).toFixed(2)}s"></div>
        <div class="g3-stage"><div class="g3-shake">
            <div class="g3-medals" style="--m:${mSize}cqw;animation-delay:${(EAG - 0.1).toFixed(2)}s">
                ${shown.map((r, i) => `<div class="g3-medal" style="animation-delay:${(M0 + i * GAP).toFixed(2)}s"><b>${r.no}</b>${r.score ? `<small>${escapeHtml(r.score)}타</small>` : ''}</div>`).join('')}
            </div>
            <div class="g3-eagle${photo ? ' g3-photo' : ''}" style="animation-delay:${EAG.toFixed(2)}s">${photo
                ? `<div class="g3-disc"><img src="${photo}" alt=""></div>`
                : eagleSvg()}</div>
            <div class="g3-wave" style="animation-delay:${(CNT + 0.05).toFixed(2)}s"></div>
            <div class="g3-count" style="animation-delay:${CNT.toFixed(2)}s"><b>${streak}</b><span>연속</span></div>
            <div class="g3-title">${['독', '수', '리'].map((c, i) => `<i style="animation-delay:${(TTL + i * 0.12).toFixed(2)}s">${c}</i>`).join('')}</div>
            <div class="g3-name" style="animation-delay:${NAME.toFixed(2)}s"><b>${escapeHtml(name)}</b></div>
            <div class="g3-seal" style="animation-delay:${SEAL.toFixed(2)}s">${tier.seal}</div>
            <div class="g3-sub" style="animation-delay:${SUB.toFixed(2)}s">${tier.sub(streak)}</div>
        </div></div>
        <div class="g3-fx"></div>
        <div class="g3-curtain top" style="animation-delay:.9s"></div><div class="g3-curtain bot" style="animation-delay:.9s"></div>
        <div class="g3-line" style="animation-delay:.1s"></div>
        <div class="g3-kicker" style="animation-delay:.15s">JTFAG · HALL OF FAME</div>
        <div class="g3-flash" style="animation-delay:${CNT.toFixed(2)}s"></div>
        <div class="g3-skip" style="animation-delay:${(SUB + 0.4).toFixed(2)}s">화면을 누르면 닫힙니다</div>
    </div>`;

    // 사진을 못 받아오면(주소가 바뀌었거나 오프라인) 앱이 그린 독수리로 되돌아간다.
    const img = overlay.querySelector('.g3-disc img');
    if (img) img.onerror = () => {
        const box = overlay.querySelector('.g3-eagle');
        if (box) { box.classList.remove('g3-photo'); box.innerHTML = eagleSvg(); }
    };

    // 메달이 꽂힐 때마다·숫자가 터질 때·낙인이 찍힐 때 화면이 흔들린다(같은 키프레임을 여러 번 건다)
    const hits = shown.map((_, i) => M0 + i * GAP + 0.38);
    overlay.querySelector('.g3-shake').style.animation =
        hits.concat([CNT + 0.1, SEAL + 0.3]).map((t, i) => `g3-shake ${i === hits.length ? 0.5 : 0.32}s ease-out ${t.toFixed(2)}s`).join(',');

    document.body.appendChild(overlay);

    // 불씨(아래에서 위로)와 색종이(위에서 아래로) — 개수를 정해 두고 한 번씩만 돈다. 이동 거리는 실제 화면 높이로 준다.
    const stage = overlay.querySelector('.g3');
    const H = stage.clientHeight || window.innerHeight, W = stage.clientWidth || window.innerWidth;
    let fx = '';
    for (let i = 0; i < 34; i++) {
        fx += `<span class="g3-ember" style="left:${(Math.random() * 100).toFixed(1)}%;--d:${(2.6 + Math.random() * 2.2).toFixed(2)}s;--x:${((Math.random() - 0.5) * 40).toFixed(0)}px;--rise:${(-H * (0.5 + Math.random() * 0.6)).toFixed(0)}px;animation-delay:${(EAG + Math.random() * 3).toFixed(2)}s"></span>`;
    }
    for (let i = 0; i < tier.confN; i++) {
        fx += `<span class="g3-conf" style="left:${(Math.random() * 100).toFixed(1)}%;background:${tier.conf[i % tier.conf.length]};--d:${(2.4 + Math.random() * 2).toFixed(2)}s;--x:${((Math.random() - 0.5) * W * 0.4).toFixed(0)}px;--fall:${(H * (1.05 + Math.random() * 0.2)).toFixed(0)}px;--r:${(Math.random() * 900 - 450).toFixed(0)}deg;animation-delay:${(CNT + 0.05 + Math.random() * 1.2).toFixed(2)}s${Math.random() < 0.3 ? ';border-radius:50%' : ''}"></span>`;
    }
    overlay.querySelector('.g3-fx').innerHTML = fx;

    requestAnimationFrame(() => overlay.classList.add('on'));
    eagleDrums({ hits, count: CNT + 0.05, seal: SEAL + 0.3 });
    const timers = [setTimeout(playEagleCry, (EAG + 0.4) * 1000)];

    const close = () => {
        timers.forEach(clearTimeout);
        overlay.classList.remove('on');
        setTimeout(() => overlay.remove(), 300);
    };
    overlay.onclick = close;
    timers.push(setTimeout(close, (SUB + 3.6) * 1000));
}

