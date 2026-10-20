// ◇ ui.js를 나눈 조각 — 토스트 · 저장 상태 · 실시간 연결 상태 · 공지 카드 · 창 뒤 잠금(watchOverlays) · 표 터치 감시
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
function renderSkeleton() {
    const summaryGrid = document.getElementById('summaryGrid');
    if (summaryGrid) { summaryGrid.innerHTML = golfers.map(() => `<div class="summary-item skeleton"><div class="name">---</div><div class="detail-line">---</div><div class="detail-line">---</div><div class="detail-line">---</div><div class="final-total">---</div></div>`).join(''); }
}

let toastTimer = null;
/* 알림 문구는 문장이 끝나는 자리에서 줄을 나눈다. 그냥 두면 두 번째 줄에 `요.` 같은 두세 글자만
   덜렁 남아 보기 나쁘다(실측 — 126개 문구 중 320px에서 46개가 두 줄 이상). 길이가 짧거나 이미
   줄바꿈이 있는 문구는 그대로 둔다. 줄 길이 균형은 CSS(`text-wrap: balance`)가 맡는다. */
function toastWrap(msg) {
    msg = String(msg == null ? '' : msg);
    if (msg.includes('\n') || msg.length < 22) return msg;
    return msg.replace(/([.!?])[ \t]+(?=\S)/g, '$1\n');
}
function showToast(msg, ms) {
    const toast = document.getElementById('customToast'); if (!toast) return;
    toast.textContent = toastWrap(msg); toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms || 2200);
}

// `⚠️`로 시작하는 문구는 서버와 안 이어진 상태라 빨강(.off), 나머지는 초록이다.
// 실시간이 끊겨 있는 동안은 초록 문구를 띄우지 않는다 — 저장(REST)은 돼도 남이 고친 게 안 들어오는
// 상태라, `동기화 완료`로 덮으면 끊긴 걸 모르고 지나간다.
function showSaveStatus(msg) {
    if (realtimeDown && !msg.startsWith('⚠️')) return;
    const saveStatus = document.getElementById('saveStatus'); if (saveStatus) { saveStatus.textContent = msg; saveStatus.classList.toggle('off', msg.startsWith('⚠️')); saveStatus.style.opacity = '1'; setTimeout(() => { saveStatus.style.opacity = '0.7'; }, 1200); }
}

/* 실시간 연결 상태를 상태 문구에 반영한다. 예전엔 접속·저장만 봐서, 쓰는 도중 실시간이 끊겨도
   초록으로 남아 있었다 — 그 사이 남이 고친 금액·일정이 안 들어오는데 아무도 모른다.
   채널(payload · 금액)마다 `.subscribe(realtimeStatus('이름'))`으로 상태를 받는다.
   - 하나라도 끊기면(`CHANNEL_ERROR`·`TIMED_OUT`·`CLOSED`) 3초 기다렸다 빨강으로 바꾼다.
     잠깐 끊겼다 바로 붙는 경우까지 깜빡이면 오히려 불안하다.
   - 다시 다 붙으면 **payload를 한 번 다시 읽는다.** 실시간은 끊긴 동안의 이벤트를 다시 보내 주지
     않으므로(앞으로 나올 때 다시 읽는 것과 같은 이유) 읽어야 그 틈이 메워지고, 읽고 나면 초록이 된다.
   supabase-js가 끊긴 채널을 알아서 다시 붙이므로 여기서 재접속은 하지 않는다. */
let realtimeDown = false;
let realtimeDownTimer = null;
const realtimeStates = {};
function realtimeStatus(name) {
    return status => {
        realtimeStates[name] = status;
        const down = Object.values(realtimeStates).some(st => st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED');
        if (down) {
            if (!realtimeDown && !realtimeDownTimer) realtimeDownTimer = setTimeout(() => {
                realtimeDownTimer = null;
                realtimeDown = true;
                showSaveStatus("⚠️ 실시간 연결 끊김");
            }, 3000);
            return;
        }
        clearTimeout(realtimeDownTimer); realtimeDownTimer = null;
        if (!realtimeDown) return;
        realtimeDown = false;
        if (isLoaded) fetchFromSupabase();   // 끊긴 사이 놓친 걸 메운다(끝나면 초록 문구를 띄운다)
    };
}

// 다음 라운드까지 남은 날. 표시 문구(nextRoundDate)에는 연도가 없으므로
// 일정 저장 때 따로 남겨 둔 nextRoundISO(YYYY-MM-DD)만 본다. 알림 발송기와 같은 값이다.
// 기기 시간대와 무관하게 한국 날짜끼리 비교한다.
function daysUntilNextRound() {
    const iso = appData.nextRoundISO;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

// 일정이 없거나 이미 지난 날짜면 뱃지를 붙이지 않는다.
function ddayBadgeHtml() {
    const left = daysUntilNextRound();
    if (left === null || left < 0) return '';
    if (left === 0) return `<span class="dday-badge dday-today">D-DAY</span>`;
    return `<span class="dday-badge ${left <= 3 ? 'dday-soon' : 'dday-far'}">D-${left}</span>`;
}

/* 일정 문구에 요일을 붙인다 — `10월 3일 오후 5:21` → `10월 3일(토) 오후 5:21`.
   문구(`nextRoundDate`)에는 연도가 없어 요일을 알 수 없으므로 함께 저장된 `nextRoundISO`에서 낸다.
   **화면에 그릴 때만 붙이고 저장하지 않는다** — 문구를 읽는 곳(알림 발송 · `lastScheduledCourse()` ·
   날씨의 `courseFromText()`)이 여럿이라 저장 형식을 바꾸면 하나씩 다 손봐야 한다.
   ISO의 월·일이 문구와 다르면(예전 데이터가 어긋난 경우) 틀린 요일을 붙이는 대신 그냥 둔다. */
function withWeekday(text) {
    const iso = appData.nextRoundISO;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m || !text) return text || '';
    const month = parseInt(m[2], 10), day = parseInt(m[3], 10);
    const re = /(\d{1,2})월\s*(\d{1,2})일(?!\s*\()/;
    const hit = re.exec(text);
    if (!hit || parseInt(hit[1], 10) !== month || parseInt(hit[2], 10) !== day) return text;
    const wd = '일월화수목금토'[new Date(Date.UTC(+m[1], month - 1, day)).getUTCDay()];
    return text.replace(re, `$1월 $2일(${wd})`);
}

/* 일정 문구를 줄바꿈해도 안 갈리게 다듬는다. `keep-all`은 콜론 뒤에서 줄을 바꿔
   `오후 5:` / `34 JNJ골프리조트`처럼 시각이 두 동강 났다. 날짜(`10월 14일(수)`)와
   시각(`오후 5:34`)을 한 덩어리로 묶어 줄은 그 사이에서만 바뀌게 한다.
   사용자가 적은 글이라 먼저 `escapeHtml()`을 거친다. */
function scheduleHtml(text) {
    return escapeHtml(text)
        .replace(/\d{1,2}월\s*\d{1,2}일(?:\([일월화수목금토]\))?/, m => `<span class="nowrap">${m}</span>`)
        .replace(/(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}/, m => `<span class="nowrap">${m}</span>`)
        .replace(/\([^()]*\)\s*$/, m => `<span class="nowrap">${m}</span>`);   // 끝의 코스 `(정-남)` — 하이픈에서 갈렸다
}

// 공지 카드: 날짜·시각 한 줄, 골프장(코스 괄호까지)은 다음 줄 (사용자 요청 — `일정과 골프장과 줄바꿈해줘`).
// 시각을 못 찾는 예전 문구는 예전처럼 한 덩어리로 그린다.
function noticeScheduleHtml(text) {
    const m = text.match(/(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}/);
    if (!m) return scheduleHtml(text);
    const cut = m.index + m[0].length;
    const head = text.slice(0, cut), tail = text.slice(cut).trim();
    return scheduleHtml(head) + (tail ? `<span class="sched-course">${scheduleHtml(tail)}</span>` : '');
}

function renderNoticeArea() {
    const dateDisplay = document.getElementById('nextRoundDisplay');
    if (dateDisplay) { dateDisplay.innerHTML = appData.nextRoundDate ? (ddayBadgeHtml() + noticeScheduleHtml(withWeekday(appData.nextRoundDate))) : `일정 등록하기`; checkWeather(appData.nextRoundDate); }
    // 머리말에 몇 차 라운드인지 적는다(사용자 요청 — `다음 라운드 11차`). 일정이 없으면 예전 그대로다.
    const label = document.querySelector('.notice-next label');
    if (label) {
        const no = parseInt(appData.nextRoundNo, 10);
        const html = appData.nextRoundDate && no > 0 ? `다음 라운드 <b class="sched-no">${no}차</b>` : '다음 라운드';
        if (label._html !== html) { label.innerHTML = html; label._html = html; }
    }
    updateLockUI();
}

// 홈 화면 앱은 백그라운드에 그대로 떠 있어, 자정을 넘겨도 어제 계산한 D-day가 남는다.
// 다시 앞으로 불러올 때 한 번 더 그린다.
//
// **그때 payload도 다시 읽는다.** 실시간 이벤트는 놓친 걸 나중에 다시 보내 주지 않는다 —
// 폰이 잠겨 있는 동안 남이 고친 내용을 못 받은 채로 깨어나면, 그 낡은 appData를 그대로
// 저장하는 순간 **남의 금액이 통째로 지워진다**(행 전체가 오가는 구조라 그렇다).
// 앞으로 나올 때 한 번 읽어 두면 그 창이 닫힌다. 적다 만 칸은 `renderMoneyTable()`의
// 빠른 길이 포커스 있는 칸을 건너뛰므로 글자가 날아가지 않는다.
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // 금액을 적다가 앱을 내려놓거나 화면이 꺼지면 `change`가 안 울려 **적은 값이 그냥 사라진다.**
        // 떠나기 전에 포커스를 빼서 저장을 태운다.
        if (isMoneyField(document.activeElement)) document.activeElement.blur();
        return;
    }
    if (!isLoaded) return;
    renderNoticeArea();
    fetchFromSupabase();
});

// 표가 가끔 안 그려지는 걸 막으려고 overflow를 잠깐 껐다 켜서 다시 그리게 한다.
// 그런데 손가락으로 밀고 있는 중에 이게 돌면 스크롤이 그 자리에서 죽는다.
// (다른 사람이 값을 고쳐 실시간 갱신이 들어오면 renderAll이 도는 탓에 종종 겹쳤다)
// 그래서 표를 만지고 있는 동안에는 건너뛴다.
let isTableTouched = false;

function watchTableTouch() {
    const wrapper = document.getElementById('tableWrapper');
    if (!wrapper) return;
    const on = () => { isTableTouched = true; };
    const off = () => { isTableTouched = false; };
    wrapper.addEventListener('touchstart', on, { passive: true });
    wrapper.addEventListener('touchend', off, { passive: true });
    wrapper.addEventListener('touchcancel', off, { passive: true });
    wrapper.addEventListener('pointerdown', on, { passive: true });
    wrapper.addEventListener('pointerup', off, { passive: true });
    wrapper.addEventListener('pointercancel', off, { passive: true });
}

// ─── 창이 떠 있는 동안 뒷배경 잠그기 ───
// 창을 여는 곳이 스무 군데가 넘고(모달 10개 + 직접 만들어 붙이는 창 6개), 한 곳씩 고치면
// 반드시 하나를 빠뜨린다 — 그러면 화면이 잠긴 채로 안 풀려서 원래 문제보다 나쁘다.
// 그래서 '화면을 덮는 게 생겼는지'를 지켜보다가 body를 잠근다. 여는 코드는 손대지 않는다.
//
// 덮는 창의 조건: body 바로 아래 · position:fixed · 누를 수 있고(pointer-events) · 화면을 거의 다 덮음.
// 이 조건이 곧 필터다 — 닫힌 모달(pointer-events:none)·토스트(작음)·인사말은 저절로 빠진다.
// opacity는 보지 않는다. 창이 열릴 때 0에서 1로 서서히 오르는데, 관찰자는 그 첫 프레임에
// 돌아서 아직 0을 읽는다 — 그러면 안 잠기고, 그 뒤로 바뀌는 게 없어 영영 다시 안 본다.
// (실제로 관리자 메뉴와 일정 모달만 안 잠기는 걸로 나타났다.)
// pointer-events는 전환 없이 즉시 바뀌고, '입력을 가로채고 있는가'라는 뜻이라 더 정확하다.
function isCoveringOverlay(el) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.display === 'none' || s.pointerEvents === 'none') return false;
    if (s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
}

function anyOverlayOpen() {
    for (const el of document.body.children) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        if (isCoveringOverlay(el)) return true;
    }
    return false;
}

// **iOS와 나머지의 잠그는 방법이 다르다.**
// iOS 사파리는 overflow:hidden만으로는 뒤가 계속 밀려서 body를 position:fixed로 붙잡아야 한다.
// 그런데 안드로이드에서 그렇게 하면 **키보드가 올라올 때 화면이 어긋난다** — 소프트 키보드가
// 뷰포트 높이를 줄이는데, 붙잡아 둔 body가 그걸 따라가지 못해 창이 밀려 보인다.
// (관리자 비밀번호 창이 반쯤 밀려 나온 제보가 실제로 이것이었다.)
// 안드로이드·PC는 html+body의 overflow:hidden만으로 충분하고, 스크롤 위치도 알아서 남는다.
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let scrollLocked = false;
let lockedScrollY = 0;

function applyScrollLock() {
    const want = anyOverlayOpen();
    if (want === scrollLocked) return;   // 안 바뀌었으면 건드리지 않는다
    scrollLocked = want;
    const body = document.body, html = document.documentElement;

    if (want) {
        lockedScrollY = window.scrollY || window.pageYOffset || 0;
        if (IS_IOS) {
            body.style.position = 'fixed';
            body.style.top = `-${lockedScrollY}px`;
            body.style.left = '0';
            body.style.right = '0';
            body.style.width = '100%';
        }
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        // 잠그면 body가 스스로 굴러가는 칸이 되어(overflow:hidden) 위 막대의 sticky가 body 맨 위로 돌아간다 —
        // 굴려 둔 만큼 화면 위로 사라진다. 그만큼 내려 두어 창 뒤에서도 막대가 제자리에 있게 한다.
        const bar = document.getElementById('topBar');
        if (bar && lockedScrollY) bar.style.transform = `translateY(${lockedScrollY}px)`;
    } else {
        const bar = document.getElementById('topBar');
        if (bar) bar.style.transform = '';
        if (IS_IOS) {
            body.style.position = '';
            body.style.top = '';
            body.style.left = '';
            body.style.right = '';
            body.style.width = '';
        }
        html.style.overflow = '';
        body.style.overflow = '';
        // 붙잡아 둔 동안 스크롤이 0으로 밀린 건 iOS뿐이다. 나머지는 그대로 남아 있다.
        if (IS_IOS) window.scrollTo(0, lockedScrollY);
    }
}

// 잠가 둔 동안(창이 떠 있는 동안) 아이폰에서 입력칸을 누르면 키보드가 칸을 보이게 하려고 **창(window)을
// 위로 민다.** 키보드를 내려도 그 자리를 안 돌려놓는 때가 있어, 화면이 밀린 채 굳고 손으로 밀어도 창 안이
// 안 굴러가는 것처럼 보였다(여행 창 · 사용자 제보 — '스크롤하다가 멈춘다'). 잠가 둔 동안 창의 자리는
// 언제나 0이어야 하므로(body를 position:fixed로 붙든다), 입력이 끝나면 0으로 되돌린다.
document.addEventListener('focusout', () => {
    if (!IS_IOS) return;
    setTimeout(() => {
        if (!scrollLocked) return;
        const a = document.activeElement;
        if (a && a.matches && a.matches('input, textarea, select, [contenteditable="true"]')) return;   // 칸에서 칸으로 옮겨 가는 중
        if (window.scrollY || window.pageYOffset) window.scrollTo(0, 0);
    }, 150);
}, true);

let overlayObserver = null;
let overlayChildObserver = null;

function watchOverlays() {
    let queued = false;
    const check = () => {
        if (queued) return;
        queued = true;
        // 한 번 열 때 여러 번 바뀌므로(class → style → 자식 추가) 한 프레임에 한 번만 본다.
        requestAnimationFrame(() => { queued = false; applyScrollLock(); });
    };

    // **body 바로 아래 것들만 본다.** 예전엔 subtree까지 통째로 봤는데, 표와 요약 카드를
    // 다시 그릴 때마다 관찰자가 수백 번 깨어나 매번 화면 크기를 재느라 폰이 버벅였다
    // (느린 안드로이드에서 눈에 띄게 끊겼다). 덮는 창은 언제나 body 바로 아래에 있으므로
    // .container 안쪽 변화는 볼 이유가 없다.
    overlayChildObserver = new MutationObserver(check);
    const watchChildren = () => {
        overlayChildObserver.disconnect();
        for (const el of document.body.children) {
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
            overlayChildObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        }
        check();
    };

    // 창이 새로 붙거나 떨어지면 관찰 대상을 다시 맞춘다.
    overlayObserver = new MutationObserver(watchChildren);
    overlayObserver.observe(document.body, { childList: true });
    watchChildren();
    // 여는 순간 opacity가 0에서 시작하는 창이 있어, 화면 회전·리사이즈 때도 다시 본다.
    window.addEventListener('resize', check);
    check();
}

function forceTableReflow() {
    if (isTableTouched) return;
    const wrapper = document.getElementById('tableWrapper');
    if (!wrapper) return;
    const currentScroll = wrapper.scrollLeft;
    wrapper.style.overflowX = 'hidden';
    void wrapper.offsetHeight;
    wrapper.style.overflowX = 'auto';
    wrapper.scrollLeft = currentScroll;
}

