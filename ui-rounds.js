// ◇ ui.js를 나눈 조각 — 스코어 표 · 1:1 핸디캡 카드 · 차수 추가·삭제 · 일정 이동 · 알림 받는 기기 창
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
function hasHoleRecord(r) {   // r은 0부터 시작하는 차수 인덱스
    return typeof ROUND_HOLES !== 'undefined' && !!ROUND_HOLES[String(r + 1)];
}

// 잠긴 칸인가. 홀 기록이 있는 차수는 관리자가 열어도 잠긴 채로 둔다 —
// 손으로 고쳐 봐야 다음 접속 때 홀 기록 값으로 되돌아가기 때문이다.
function isScoreCellLocked(r) {
    return hasHoleRecord(r) || !isScoreUnlocked;
}

// 홀 기록에서 뽑은 그로스를 appData.scores에 반영한다. 실제로 바뀐 게 있을 때만 true.
function syncScoresFromHoles() {
    if (typeof grossFromHoles !== 'function') return false;
    let changed = false;
    if (!appData.scores) appData.scores = {};
    for (let r = 0; r < appData.totalRounds; r++) {
        if (!hasHoleRecord(r)) continue;
        golfers.forEach(name => {
            const gross = grossFromHoles(r + 1, name);
            if (gross === null) return;
            if (!appData.scores[name]) appData.scores[name] = [];
            if (appData.scores[name][r] !== gross) { appData.scores[name][r] = gross; changed = true; }
        });
    }
    return changed;
}

// 없앤 기능이 payload에 남긴 필드를 한 번 걷어낸다.
//   changeLogs  — 변경 이력(공금 기록은 fundLogs에 따로 있다)
//   guestRounds — 게스트 라운드 표시
function dropRetiredFields() {
    let dropped = false;
    ['changeLogs', 'guestRounds'].forEach(key => {
        if (key in appData) { delete appData[key]; dropped = true; }
    });
    return dropped;
}

/* 판독이 끝났다고 payload에 적혔는데 이 화면이 읽어 둔 stats.js에는 그 차수가 없는 경우를 찾는다.
   stats.js는 접속할 때 한 번만 받으므로, 앱을 열어 둔 채로 판독이 끝나면(워크플로가 stats.js를 커밋하고
   Pages가 배포한 뒤) 상태만 '완료'로 바뀌고 타수 칸은 새로고침하기 전까지 비어 있었다.
   요청 id는 `Date.now()-…`라 30분 안의 것만 본다(예전 요청 때문에 헛새로고침이 도는 걸 막는다).
   요청마다 한 번만 시도한다(`jtfag_score_refresh`) — 배포가 아직이면 새로고침해도 같으니 되풀이하지 않는다. */
function staleScoreRequests() {
    const now = Date.now(), latest = {};
    (appData.scoreRequests || []).forEach(r => {
        if (!r || r.status !== '완료' || r.action === '멀리건') return;
        latest[r.round] = r;
    });
    return Object.values(latest).filter(r => {
        const at = parseInt(String(r.id || '').split('-')[0], 10);
        if (!Number.isFinite(at) || now - at > 30 * 60 * 1000) return false;
        return hasHoleRecord(r.round - 1) === (r.action === '삭제');
    });
}

function refreshForFinishedScore() {
    if (typeof ROUND_HOLES === 'undefined') return;
    const stale = staleScoreRequests();
    if (!stale.length) return;
    let tried = [];
    try { tried = JSON.parse(localStorage.getItem('jtfag_score_refresh') || '[]'); } catch (e) { tried = []; }
    const fresh = stale.filter(r => !tried.includes(r.id));
    if (!fresh.length) return;
    try { localStorage.setItem('jtfag_score_refresh', JSON.stringify(tried.concat(fresh.map(r => r.id)).slice(-20))); } catch (e) { /* 저장이 막혀도 새로고침은 한다 */ }
    const typing = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) { showToast("✅ 스코어가 등록되었습니다. 입력을 마치고 새로고침하면 타수가 반영됩니다.", 5000); return; }
    showToast("✅ 스코어가 등록되어 화면을 새로 불러옵니다.");
    setTimeout(() => location.reload(), 1200);
}

// 값이 달라졌을 때만 저장한다. 4명이 동시에 접속해도 첫 한 명만 쓰고 나머지는 조용하다.
/* ── 스코어카드가 곧 차수를 만든다 ─────────────────────────────────
   사용자 요청 — 일정만 입력하고 스코어는 사진으로 자동 등록하면 `+ 차수 추가`와 골프장 입력이 필요 없게.
   ① 홀 기록(ROUND_HOLES)이 있는 차수가 표에 없으면 접속 때 만든다(`appendRoundFromHoles()`).
   ② 골프장 칸이 비어 있으면 스코어카드에 인쇄된 클럽 이름으로 채운다(`fillCoursesFromHoles()` — 일정에서 정한 이름이 먼저다).
   ③ 일정이 붙은 차수의 기록이 들어오면 끝난 일정이므로 다음 라운드 칸을 비운다(`clearFinishedSchedule()`).
   셋 다 ROUND_HOLES(원본)에서 파생되므로 여러 폰이 동시에 해도 같은 결과로 모이고, 바뀐 게 있을 때만 true를 돌려 헛저장이 없다.
   **금액 줄은 비우지 않는다**(addRound와 다른 점) — 다른 폰이 방금 적은 금액을 지울 수 있다. */
function appendRoundFromHoles() {
    if (typeof ROUND_HOLES === 'undefined') return false;
    const nums = Object.keys(ROUND_HOLES).map(k => parseInt(k, 10)).filter(n => n > 0 && n <= 60);
    const max = nums.length ? Math.max(...nums) : 0;
    if (max <= appData.totalRounds) return false;
    const wasLast = selectedMoneyRoundIdx === appData.totalRounds - 1;
    const from = appData.totalRounds;
    if (!appData.courses) appData.courses = [];
    if (!appData.roundPhotos) appData.roundPhotos = [];
    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.scores) appData.scores = {};
    for (let n = from + 1; n <= max; n++) {
        appData.totalRounds = n;
        appData.courses[n - 1] = roundCourseMap()[n] || '';
        appData.roundPhotos[n - 1] = [];
        const money = {}; golfers.forEach(g => money[g] = { start: 0, end: 0 });
        appData.roundMoney[n - 1] = money;
        golfers.forEach(g => { if (!appData.scores[g]) appData.scores[g] = []; appData.scores[g][n - 1] = ""; });
    }
    if (wasLast) selectedMoneyRoundIdx = appData.totalRounds - 1;
    if (typeof overlayMoney === 'function') overlayMoney();
    showToast(`➕ 스코어카드 기록에 맞춰 ${from + 1}${max > from + 1 ? `~${max}` : ''}차를 자동 생성했습니다.`);
    return true;
}

function fillCoursesFromHoles() {
    if (typeof ROUND_HOLES === 'undefined' || typeof parseStatsCourse !== 'function') return false;
    if (!appData.courses) appData.courses = [];
    let changed = false;
    for (let r = 0; r < appData.totalRounds; r++) {
        if (String(appData.courses[r] || '').trim() || !hasHoleRecord(r)) continue;
        const club = parseStatsCourse(ROUND_HOLES[String(r + 1)].course).club;
        if (club) { appData.courses[r] = club; changed = true; }
    }
    return changed;
}

function clearFinishedSchedule() {
    const no = parseInt(appData.nextRoundNo, 10) || 0;
    if (!no || !hasHoleRecord(no - 1)) return false;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(appData.nextRoundISO || ''))) {
        if (!appData.roundDates) appData.roundDates = {};
        if (!appData.roundDates[no]) appData.roundDates[no] = appData.nextRoundISO;   // 스탬프용 날짜는 남긴다
    }
    appData.nextRoundDate = '';
    delete appData.nextRoundISO;
    delete appData.nextRoundNo;
    delete appData.nextRoundSrc;
    return true;
}

function applyHoleScores() {
    refreshForFinishedScore();
    const added = appendRoundFromHoles();   // 스코어카드가 있는데 표에 없는 차수를 만든다
    const changed = syncScoresFromHoles();
    const filled = applyRoundCourses();
    const filledHoles = fillCoursesFromHoles();   // 일정에서 정한 이름이 없으면 카드에 인쇄된 클럽 이름
    const dropped = dropRetiredFields();
    const settled = settleScheduleRound();   // 지운 차수에 남아 있던 일정을 마지막 차수로
    const finished = clearFinishedSchedule();   // 기록이 들어온 차수의 일정은 끝난 일정이다
    const tripSched = syncScheduleFromTrips();   // 여행에 잡힌 라운드를 다음 라운드 일정으로
    const seeded = typeof seedTrips === 'function' && seedTrips();   // 여행 일정(trip.js) — 처음 한 번만
    const pre = ensureScheduledRound();   // 다음 일정이 붙은 새 차수를 미리 만든다(시작 금액 입력용)
    if (added || changed || filled || filledHoles || dropped || settled || finished || seeded || tripSched || pre) syncToSupabase(appData);
}

function toggleScoreEdit() {
    isScoreUnlocked = !isScoreUnlocked;
    renderTable();
    renderAdminModal();
    showToast(isScoreUnlocked
        ? "✏️ 타수 직접 수정을 활성화했습니다. 홀 기록이 있는 차수는 제외됩니다."
        : "🔒 타수 수정을 잠갔습니다.");
}

// ─── 정산 화면의 타수 영역 — 차수별 결과 카드다(사용자 요청 — 홈의 내 목표 타수 카드와 겹치는 가로 표를 바꿨다 · 시안 A) ───
// 차수마다 카드 한 장(최신이 위) · 네 명을 **실제 계급 순서**로 세운다. 오른쪽 알약은 그 차수의 정산 기준을 따른다:
//   1~10차 — 1:1 맞대결 승패(`2승 1패`) · 카드 머리 `1:1 핸디 방식`
//   11차~  — 내 목표 타수 대비(`-5`) + 줄 가운데 `목표 97` · 카드 머리 `목표 대비 방식`
// 홈의 5경기 기준 목표 대비를 1~10차에 붙이지 않는다 — 그때 정산은 2경기 핸디 기준이라 확정된 순위와 어긋나 보인다.
// 타수·계급은 calc.js가 채운 값(golferRankHistory · roundNetInfo)을 읽기만 한다 — **calculateAndRender()가 계산한 뒤에 그린다.**
// 타수 칸은 홀 기록이 있으면 잠긴 숫자이고, 홀 기록이 없는 차수만 관리자 `✏️ 타수 직접 수정`으로 칸이 열린다(updateScore).
let roundCardsOpen = false;                // `이전 차수 보기` — 이번 실행 동안만 기억한다
const ROUND_CARDS_MIN = 2;                 // 11차 이후 카드가 이보다 적으면 최근 차수로 채운다
const RANK_CIRCLE = ['#c98d00', '#3b82c4', '#7c5cc4', '#8a8f96'];   // 독수리 · 매 · 학 · 참새

function renderTable() { renderRoundCards(); }

// 그 차수의 실제 계급 순서. 계급이 아직 안 매겨진 차수(타수가 덜 찼다)는 null.
function roundRankOrder(r) {
    const i = typeof rankedRoundsList !== 'undefined' ? rankedRoundsList.indexOf(r) : -1;
    if (i < 0) return null;
    const rows = golfers.map(g => ({ name: g, rank: (golferRankHistory[g] || [])[i] }));
    if (rows.some(x => x.rank === undefined)) return null;
    return rows.sort((a, b) => a.rank - b.rank);
}

// 1~10차 알약 — 그 차수 정산 규칙(직전 2경기 핸디) 그대로 세 명과 겨룬 결과. 기준이 없던 차수는 null.
function roundH2hRecord(r, name) {
    const d = typeof h2hRoundData === 'function' ? h2hRoundData(r) : null;
    if (!d) return null;
    let w = 0, l = 0, t = 0;
    golfers.forEach(o => { if (o === name) return; const res = h2hOutcome(d, name, o).res; if (res === 'w') w++; else if (res === 'l') l++; else t++; });
    return { w, l, t };
}

function roundCardHtml(r, me) {
    const useNet = r + 1 >= HANDICAP_RULE_FROM_ROUND;
    const order = roundRankOrder(r);
    const scoreOf = g => { const v = parseFloat(((appData.scores || {})[g] || [])[r]); return Number.isFinite(v) && v > 0 ? v : null; };
    const hasAny = golfers.some(g => scoreOf(g) !== null);
    const rows = order || golfers.map(g => ({ name: g, rank: null }));
    const editable = !isScoreCellLocked(r);
    const course = (appData.courses && appData.courses[r]) || '';
    const sub = typeof subCourseOf === 'function' ? subCourseOf(r) : '';
    const date = (appData.roundDates || {})[r + 1] || (typeof ROUND_HOLES !== 'undefined' && (ROUND_HOLES[String(r + 1)] || {}).date) || '';
    const dateText = /^\d{4}-(\d{2})-(\d{2})$/.test(date) ? ` · ${+date.slice(5, 7)}/${+date.slice(8, 10)}` : '';
    const where = (course ? escapeHtml(course) : '골프장 미정') + (sub ? ` <i>${escapeHtml(sub)}</i>` : '') + dateText;
    const photos = (appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0;
    const tag = order ? `<em class="rc-tag">${useNet ? '목표 대비 방식' : '1:1 핸디 방식'}</em>` : '';
    const sign = n => (n > 0 ? '+' : '') + n;
    let body = rows.map(x => {
        const g = x.name, sc = scoreOf(g);
        const ni = useNet && roundNetInfo[r] ? roundNetInfo[r][g] : null;
        let pill = '', small = '';
        if (order) {
            // 오른쪽 알약 = 그 차수 개인별 홀인원·이글·버디·파 개수(홀 기록이 있는 차수만 · 홀인원·이글은 있을 때만).
            // 색은 글자에만 준다 — 홀인원 황금 · 이글 빨강 · 버디 주황 · 파 파랑(사용자 요청). 계급 벌금은 위 `차수별 정산` 표에 있다.
            const h = typeof badgeHoles === 'function' ? badgeHoles(g, r) : null;
            if (h) {
                let hio = 0, eg = 0, bd = 0, pr = 0;
                h.rel.forEach((x, i) => { if (x === 1 - h.par[i]) hio++; else if (x <= -2) eg++; else if (x === -1) bd++; else if (x === 0) pr++; });
                const seg = (cls, name, n) => `<b class="${cls}">${name} ${n}</b>`;
                const parts = [];
                if (hio) parts.push(seg('hio', '홀인원', hio));
                if (eg) parts.push(seg('eg', '이글', eg));
                parts.push(seg('bd', '버디', bd), seg('pr', '파', pr));
                const tight = parts.length > 2;
                pill = `<span class="rc-pill rc-bp${tight ? ' tight' : ''}">${parts.join(tight ? '·' : ' · ')}</span>`;
            }
            if (useNet && ni) small = `<small><em class="${ni.net <= 0 ? 'ok' : 'miss'}">${sign(ni.net)}</em></small>`;
        }
        const no = x.rank === null ? '<span class="rc-no off"></span>' : `<span class="rc-no" style="background:${RANK_CIRCLE[x.rank]}" title="${RANK_CONFIG[x.rank].name}">${x.rank + 1}</span>`;
        const val = (appData.scores && appData.scores[g] && appData.scores[g][r] !== undefined) ? appData.scores[g][r] : '';
        const score = editable
            ? `<input type="text" id="score_input_${g}_${r}" class="rc-input" inputmode="numeric" pattern="[0-9]*" value="${escapeHtml(String(val))}" placeholder="타수" onfocus="this.select()" onchange="updateScore('${g}', ${r}, this.value)">`
            : `<strong>${sc === null ? '-' : sc}</strong>`;
        return `<div class="rc-row${g === me ? ' me' : ''}${x.rank === 0 ? ' win' : ''}">${no}<span class="rc-nm">${g}</span><span class="rc-sc">${score}${small}</span>${pill}</div>`;
    }).join('');
    if (!order && !hasAny && !editable) body += '<div class="rc-wait">스코어 입력 대기</div>';
    const sel = r === selectedMoneyRoundIdx ? ' sel' : '';
    return `<div class="rc-card${sel}" onclick="rcCardTap(event, ${r})"><div class="rc-head"><b>${r + 1}차</b><span class="rc-where">${where}</span>${tag}<button type="button" class="rc-photo" onclick="openRoundPhotoModal(${r})">📸 ${photos}장</button></div>${body}</div>`;
}

function renderRoundCards() {
    const box = document.getElementById('roundCards'); if (!box) return;
    // 칸에 커서가 있는 동안은 다시 그리지 않는다 — 남의 저장이 들어와도 적던 숫자가 안 날아간다.
    const ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains('rc-input') && box.contains(ae)) return;
    const saved = localStorage.getItem('jtfag_my_name');
    const me = golfers.includes(saved) ? saved : null;
    const total = appData.totalRounds;
    const all = []; for (let r = total - 1; r >= 0; r--) all.push(r);
    const newer = all.filter(r => r + 1 >= HANDICAP_RULE_FROM_ROUND);
    const shown = roundCardsOpen ? all : all.slice(0, Math.max(newer.length, Math.min(ROUND_CARDS_MIN, total)));
    const hidden = all.length - shown.length;
    let html = shown.map(r => roundCardHtml(r, me)).join('');
    if (hidden > 0) html += `<button type="button" class="rc-more" onclick="toggleRoundCards()">이전 차수 ${hidden}개 보기 ▾</button>`;
    else if (roundCardsOpen && all.length > ROUND_CARDS_MIN) html += `<button type="button" class="rc-more" onclick="toggleRoundCards()">이전 차수 접기 ▴</button>`;
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
}

// 카드를 누르면 맨 위 `차수별 정산` 표가 그 차수로 바뀌고 화면이 그쪽으로 올라간다(사용자 요청).
// 사진 단추·타수 입력 칸을 누른 것은 제 일이 있으므로 건드리지 않는다.
function rcCardTap(e, r) {
    if (e.target.closest('button, input')) return;
    changeMoneyRound(r);
    renderRoundCards();
    const sel = document.getElementById('moneyRoundSelect');
    const card = sel && sel.closest('.money-card');
    const top = document.getElementById('topBar');
    if (card) window.scrollTo({ top: Math.max(0, card.getBoundingClientRect().top + window.scrollY - (top ? top.offsetHeight : 0) - 8), behavior: 'smooth' });
}

function toggleRoundCards() { roundCardsOpen = !roundCardsOpen; renderRoundCards(); }

// 홈 · 통합 정산 요약 아래 — **내 목표 타수 카드**다(사용자 요청 — 11차부터 계급이 '내 목표와의 싸움'이라 상대에게 받는 타수는 의미가 없다).
// 큰 숫자는 다음 라운드 내 목표 타수(최근 5경기 평균), 아래에 최근 5경기 목표 대비 타수와 목표 달성 횟수, 한 줄로 멤버들의 목표 타수.
// **후핸디(받음·줌)와 1:1 승률은 일부러 안 보인다.** 목표 달성은 목표 대비 0 이하다.
// 최근 경기의 목표 대비는 모두 '5경기 평균 기준'으로 다시 셈한다 — 10차까지 실제 정산은 2경기 기준이었으므로 참고 값이다(그 정산은 안 바뀐다).
// 이름을 아직 안 정한 기기는 첫 사람 기준으로 보여 준다.
function goalNetAt(name, r) {
    const avg = handicapAverageAt(r - 1, HANDICAP_ROUNDS);
    const score = parseFloat(((appData.scores || {})[name] || [])[r]);
    if (!avg || !Number.isFinite(score) || score <= 0) return null;
    return { r, score, target: avg[name], net: score - avg[name] };
}

// 카드 아래 한 줄 요약 — 최근 경기의 목표 대비(낮을수록 좋음)가 어느 쪽으로 흐르는지 말로 적는다(사용자 요청).
// 전부 달성 > 연속 개선 > 연속 상승 > 직전 경기 대비 순이다. 기록이 둘 미만이면 흐름이 없다.
function goalFlowText(last) {
    if (!last || last.length < 2) return null;
    const nets = last.map(g => g.net);
    if (nets.every(n => n <= 0)) return { tone: 'up', text: `최근 ${nets.length}경기 모두 목표 달성` };
    let up = 0, down = 0;
    for (let i = nets.length - 1; i > 0 && nets[i] < nets[i - 1]; i--) up++;
    for (let i = nets.length - 1; i > 0 && nets[i] > nets[i - 1]; i--) down++;
    if (up >= 2) return { tone: 'up', text: `최근 ${up + 1}경기 연속 목표 대비 개선 중` };
    if (down >= 2) return { tone: 'down', text: `최근 ${down + 1}경기 연속 목표 대비 상승 중` };
    const d = Math.round((nets[nets.length - 1] - nets[nets.length - 2]) * 10) / 10;
    if (d < 0) return { tone: 'up', text: `직전 경기보다 ${Math.abs(d)}타 개선` };
    if (d > 0) return { tone: 'down', text: `직전 경기보다 ${d}타 상승` };
    return { tone: '', text: '직전 경기와 같은 타수' };
}

function renderHandicapMatchCard(rounds) {
    const matchGrid = document.getElementById('matchGrid'); if (!matchGrid) return;
    const avgScores = rounds.length ? handicapAverageAt(rounds[rounds.length - 1]) : null;

    const saved = localStorage.getItem('jtfag_my_name');
    const me = golfers.includes(saved) ? saved : golfers[0];
    const title = document.getElementById('matchCardTitle');
    let html;
    if (!avgScores) {
        html = `<div class="match-empty">스코어를 먼저 입력해 주세요.</div>`;
    } else {
        if (title) title.textContent = `${me} · ${roundRangeText(rounds)} 평균`;
        const recent = [];
        for (let r = 0; r < appData.totalRounds; r++) { const g = goalNetAt(me, r); if (g) recent.push(g); }
        const last = recent.slice(-5);
        const hit = last.filter(g => g.net <= 0).length;
        const mean = last.length ? last.reduce((t, g) => t + g.net, 0) / last.length : null;
        const sign = n => (n > 0 ? '+' : '') + n;
        // 최근 5경기 중 목표 대비가 가장 낮은 경기에 ★ — 전부 같으면 가릴 것이 없어 붙이지 않는다.
        const nets = last.map(g => g.net);
        const bestNet = nets.length >= 2 && Math.min(...nets) < Math.max(...nets) ? Math.min(...nets) : null;
        const chips = last.length ? last.map(g => {
            const star = bestNet !== null && g.net === bestNet;
            return `<div class="goal-chip tap ${g.net <= 0 ? 'ok' : 'miss'}${star ? ' best' : ''}" role="button" onclick="openMyScorecard(${g.r}, '${me}')"${star ? ' title="최근 경기 중 목표 대비 가장 좋은 기록"' : ''}>`
                + `<i>${g.r + 1}차${star ? '<em class="star">★</em>' : ''}</i><strong>${g.score}</strong><small>목표 ${g.target}</small><span class="pill">${sign(g.net)}</span></div>`;
        }).join('') : `<div class="goal-none">비교할 기록이 아직 없습니다.</div>`;
        const meanR = mean === null ? null : Math.round(mean * 10) / 10;
        const meanCls = meanR === null || meanR === 0 ? '' : (meanR > 0 ? ' over' : ' under');
        const flow = goalFlowText(last);
        const others = golfers.filter(g => g !== me).map(g => `${escapeHtml(g)} <b>${avgScores[g]}</b>`).join(' · ');
        html = `<div class="goal-top"><div class="goal-num"><b>${avgScores[me]}</b><span>다음 라운드<br>내 목표 타수</span></div>`
            + `<div class="goal-hit"><b>${last.length ? `${hit}/${last.length}` : '-'}</b><span>목표 달성<br>(목표 대비 0 이하)</span></div></div>`
            + `<div class="goal-cap"><span>최근 ${last.length || 5}경기 목표 대비 타수${meanR === null ? '' : ` · 평균 <b class="goal-mean${meanCls}">${sign(meanR)}</b>`}</span><button type="button" class="goal-all" onclick="openMyScorecardList('${me}')">전체 스코어카드 ›</button></div>`
            + `<div class="goal-recent">${chips}</div>`
            + (flow ? `<div class="goal-flow ${flow.tone}">${flow.text}</div>` : '')
            + `<div class="goal-others"><span>멤버 목표 타수</span>${others}</div>`;
    }
    if (matchGrid._html !== html) { matchGrid.innerHTML = html; matchGrid._html = html; }
}

// 1:1 카드의 줄을 누르면 그 상대와의 차수별 승부를 아래에서 올라오는 창으로 보여 준다(사용자 요청).
// 차수 · 골프장 · 두 사람 타수 · 받은 타수를 뺀 보정 타수 · 승패. 셈은 headToHeadGames()(calc.js) — 카드의 승률과 같은 함수다.
function closeH2HDetail() {
    const o = document.querySelector('.h2h-overlay');
    if (!o) return;
    o.classList.remove('show', 'h2h-overlay');
    setTimeout(() => o.remove(), 220);
}

function openH2HDetail(oppIdx) {
    const opp = golfers[oppIdx]; if (!opp) return;
    const saved = localStorage.getItem('jtfag_my_name');
    const me = golfers.includes(saved) ? saved : golfers[0];
    if (opp === me) return;
    closeH2HDetail();
    const games = headToHeadGames(me, opp, allRoundIdx()).reverse();   // 최근 차수가 위
    const w = games.filter(g => g.res === 'w').length, l = games.filter(g => g.res === 'l').length, t = games.length - w - l;
    const pct = games.length ? Math.round((w + t / 2) / games.length * 100) : null;
    const tone = pct === null ? '' : pct > 50 ? 'up' : pct < 50 ? 'down' : '';
    // 경기 카드(사용자가 시안 넷 중 D를 골랐다 — 아티팩트 `JTFAG 전적 창 시안`). 나는 늘 왼쪽 · 보정 타수 한 쌍을 크게.
    const rows = games.map(g => {
        const course = (appData.courses && appData.courses[g.r]) || '';
        const myNet = g.my - Math.max(0, g.give), oppNet = g.opp - Math.max(0, -g.give);
        const hc = g.give > 0 ? `<em>${g.give}타 받음</em>` : g.give < 0 ? `<em>${-g.give}타 줌</em>` : '스크래치';
        const desc = g.give <= 0 ? `${g.my}타 · ${escapeHtml(opp)} ${g.opp}타 · ${hc}` : `${g.my}타 · ${hc} · ${escapeHtml(opp)} ${g.opp}타`;
        const resTxt = g.res === 'w' ? '승' : g.res === 'l' ? '패' : '무승부';
        const gap = Math.abs(myNet - oppNet);
        const tail = g.res === 't' ? '무승부' : gap ? `${gap}타 차 ${resTxt}` : `동타 · 핸디 우위 ${resTxt}`;
        return `<div class="h2h-card ${g.res}"><div class="h2h-l"><div class="h2h-a">${g.r + 1}차${course ? `<span>${escapeHtml(course)}</span>` : ''}</div>`
            + `<div class="h2h-b">${desc}</div></div>`
            + `<div class="h2h-r"><div class="h2h-x">${myNet}<i>:</i>${oppNet}</div><div class="h2h-y">${tail}</div></div></div>`;
    }).join('');
    const o = document.createElement('div');
    o.className = 'bdg-sheet-overlay h2h-overlay';
    o.innerHTML = `<div class="bdg-sheet h2h-sheet" role="dialog" aria-label="${escapeHtml(opp)} 상대 전적">
        <div class="bdg-grip"></div>
        <div class="h2h-head"><div class="h2h-title">${escapeHtml(me)} <i>vs</i> ${escapeHtml(opp)}</div>
            <div class="h2h-sum">${games.length ? `${w}승 ${l}패${t ? ` ${t}무` : ''} · 승률 <b class="${tone}">${pct}%</b>` : '전적 없음'}</div></div>
        ${rows ? `<div class="h2h-list">${rows}</div>` : ''}
        <div class="h2h-foot">큰 숫자는 보정 타수(${escapeHtml(me)} : ${escapeHtml(opp)})입니다. 핸디캡은 해당 차수 직전 경기 평균의 차이이며, 1~10차는 기존 2경기, ${HANDICAP_RULE_FROM_ROUND}차부터 5경기 기준을 적용합니다. 받는 타수를 뺀 보정 타수로 승패를 가립니다. 1·2차와 산출에 필요한 기록이 없는 차수는 제외됩니다.</div>
        <button type="button" class="bdg-close" onclick="closeH2HDetail()">닫기</button>
    </div>`;
    o.addEventListener('click', e => { if (e.target === o) closeH2HDetail(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}

/* ── 차수를 누르면 스코어카드 ───────────────────────────────────────
   목표 타수 카드의 최근 경기 칩을 누르면 그 라운드 홀별 기록을 본다(사용자 요청 — 본인 스코어만 보이고 다른 사람 것은 안 보인다).
   원본은 stats.js의 ROUND_HOLES뿐이라 저장하는 것이 없다(par + rel = 타수). 홀 기록이 없는 차수는 알려 준다. */
function closeMyScorecard() {
    const o = document.querySelector('.sc-overlay');
    if (!o) return;
    o.classList.remove('show', 'sc-overlay');
    setTimeout(() => o.remove(), 220);
}

/* 내 스코어카드 전체 목록(사용자 요청 — 최근 5경기 칩 밖의 지난 차수도 보려고). 홀 기록이 있는 차수만, 최신 차수가 위.
   줄을 누르면 openMyScorecard()가 열리고, 그 함수가 `.sc-overlay`를 먼저 닫으므로 이 창도 같은 클래스를 달아 저절로 닫힌다. */
function openMyScorecardList(who) {
    const saved = typeof myGolferName === 'function' ? myGolferName() : '';
    const name = golfers.includes(saved) ? saved : (golfers.includes(who) ? who : golfers[0]);
    const holes = typeof ROUND_HOLES !== 'undefined' ? ROUND_HOLES : {};
    const rows = [];
    for (let r = appData.totalRounds - 1; r >= 0; r--) {
        const rec = holes[String(r + 1)];
        if (!rec || !rec.par || rec.par.length !== 18 || !rec.rel || !rec.rel[name]) continue;
        const total = rec.par.reduce((t, p, i) => t + p + rec.rel[name][i], 0), diff = total - rec.par.reduce((t, p) => t + p, 0);
        const club = (appData.courses && appData.courses[r]) || '';
        rows.push(`<button type="button" class="sc-row" onclick="openMyScorecard(${r}, '${name}')"><i>${r + 1}차</i><span>${escapeHtml(club) || '&nbsp;'}</span><b>${total}타</b><em class="${diff > 0 ? 'over' : diff < 0 ? 'under' : ''}">${diff === 0 ? 'E' : (diff > 0 ? '+' : '') + diff}</em></button>`);
    }
    if (!rows.length) { showToast('홀별 기록이 등록된 경기가 아직 없습니다.'); return; }
    closeMyScorecard();
    const o = document.createElement('div');
    o.className = 'bdg-sheet-overlay sc-overlay';
    o.innerHTML = `<div class="bdg-sheet sc-sheet" role="dialog" aria-label="내 스코어카드 전체">
        <div class="bdg-grip"></div>
        <div class="sc-head"><div class="sc-title">내 스코어카드 · ${escapeHtml(name)}</div><div class="sc-sub">${rows.length}경기 · 누르면 홀별 기록</div></div>
        <div class="sc-list">${rows.join('')}</div>
        <button type="button" class="bdg-close" onclick="closeMyScorecard()">닫기</button>
    </div>`;
    o.addEventListener('click', e => { if (e.target === o) closeMyScorecard(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}

function scHalf(par, rel, from) {
    const cells = [], parRow = [], scoreRow = [];
    let parSum = 0, sum = 0;
    for (let i = from; i < from + 9; i++) {
        const p = par[i], strokes = p + rel[i];
        parSum += p; sum += strokes;
        const cls = rel[i] <= -2 ? 'eagle' : rel[i] === -1 ? 'birdie' : rel[i] === 0 ? 'par' : rel[i] === 1 ? 'bogey' : 'double';
        cells.push(`<th>${i + 1}</th>`);
        parRow.push(`<td>${p}</td>`);
        scoreRow.push(`<td><span class="sc-s ${cls}">${strokes}</span></td>`);
    }
    const label = from === 0 ? 'OUT' : 'IN';
    return `<table class="sc-table"><tr><th class="sc-lab">홀</th>${cells.join('')}<th class="sc-tot">${label}</th></tr>`
        + `<tr><th class="sc-lab">파</th>${parRow.join('')}<td class="sc-tot">${parSum}</td></tr>`
        + `<tr><th class="sc-lab">타수</th>${scoreRow.join('')}<td class="sc-tot"><b>${sum}</b></td></tr></table>`;
}

// anyone이 참이면 who 본인의 카드를 그대로 연다(뱃지 상세의 멤버 현황 — 그 사람이 딴 차수를 보려는 것).
// 아니면 예전처럼 이 기기 주인 것만 뜬다(목표 타수 카드의 칩).
function openMyScorecard(r, who, anyone) {
    const saved = typeof myGolferName === 'function' ? myGolferName() : '';
    const name = anyone && golfers.includes(who) ? who : (golfers.includes(saved) ? saved : (golfers.includes(who) ? who : golfers[0]));
    const rec = typeof ROUND_HOLES !== 'undefined' ? ROUND_HOLES[String(r + 1)] : null;
    if (!rec || !rec.par || !rec.rel || !rec.rel[name] || rec.par.length !== 18) {
        showToast(`${r + 1}차는 홀별 기록이 아직 없습니다. 스코어를 등록하면 볼 수 있습니다.`);
        return;
    }
    closeMyScorecard();
    const par = rec.par, rel = rec.rel[name];
    const total = par.reduce((t, p, i) => t + p + rel[i], 0), parTotal = par.reduce((t, p) => t + p, 0);
    const diff = total - parTotal;
    const count = f => rel.filter(f).length;
    const club = (appData.courses && appData.courses[r]) || '';
    const sub = typeof subCourseOf === 'function' ? subCourseOf(r) : '';
    const o = document.createElement('div');
    o.className = 'bdg-sheet-overlay sc-overlay';
    o.innerHTML = `<div class="bdg-sheet sc-sheet" role="dialog" aria-label="${r + 1}차 스코어카드">
        <div class="bdg-grip"></div>
        <div class="sc-head"><div class="sc-title">${r + 1}차 스코어카드 · ${escapeHtml(name)}</div>
            <div class="sc-sub">${escapeHtml([club, sub].filter(Boolean).join(' · ')) || '&nbsp;'}</div></div>
        <div class="sc-total"><b>${total}</b>타 <span class="${diff > 0 ? 'over' : diff < 0 ? 'under' : ''}">${diff === 0 ? '이븐파' : `${diff > 0 ? '+' : ''}${diff}`}</span></div>
        ${scHalf(par, rel, 0)}${scHalf(par, rel, 9)}
        <div class="sc-legend"><span><i class="sc-s birdie">·</i>버디 ${count(v => v === -1)}</span><span><i class="sc-s eagle">·</i>이글 이상 ${count(v => v <= -2)}</span><span>파 ${count(v => v === 0)}</span><span><i class="sc-s bogey">·</i>보기 ${count(v => v === 1)}</span><span><i class="sc-s double">·</i>더블 이상 ${count(v => v >= 2)}</span></div>
        <button type="button" class="bdg-close" onclick="closeMyScorecard()">닫기</button>
    </div>`;
    o.addEventListener('click', e => { if (e.target === o) closeMyScorecard(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}

function updateScore(name, r, val) {
    // readonly 칸은 onchange가 안 뜨지만, 잠금 상태가 바뀌는 순간을 대비해 한 번 더 막는다.
    // renderTable()은 커서가 놓인 칸을 건너뛰므로, 여기서 그 칸을 직접 되돌린다.
    if (isScoreCellLocked(r)) {
        const cell = document.getElementById(`score_input_${name}_${r}`);
        if (cell) cell.value = (appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : "";
        return;
    }
    saveState(); if (!appData.scores) appData.scores = {}; if (!appData.scores[name]) appData.scores[name] = [];
    const after = val === "" ? "" : parseNumber(val);
    appData.scores[name][r] = after; syncToSupabase(appData); renderAll();
}

function addRound() {
    if (localStorage.getItem('jtfag_my_name') !== SCORE_OWNER) return;   // 버튼은 본인에게만 보인다 — 여기서도 막는다
    saveState(); appData.totalRounds++;
    // 일정에서 이 차수 골프장을 미리 잡아 뒀으면 그걸 넣는다.
    if (!appData.courses) appData.courses = []; appData.courses.push(roundCourseMap()[appData.totalRounds] || "");
    if (!appData.roundPhotos) appData.roundPhotos = []; appData.roundPhotos.push([]);
    golfers.forEach(g => { if (!appData.scores[g]) appData.scores[g] = []; appData.scores[g].push(""); });
    const newRoundMoney = {}; golfers.forEach(g => newRoundMoney[g] = { start: 0, end: 0 });
    if (!appData.roundMoney) appData.roundMoney = []; appData.roundMoney.push(newRoundMoney);
    // 같은 번호의 차수를 예전에 지운 적이 있으면 테이블에 그때 금액이 남아 있다. 새 경기라 비운다.
    if (typeof clearMoneyRound === 'function') clearMoneyRound(appData.totalRounds - 1);
    // 예전에 지운 같은 번호 차수의 차액 사유(캐디 팁·니어·금액 오입력)가 남아 있으면 새 경기에 되살아나지 않게 비운다.
    if (appData.diffReasons) delete appData.diffReasons[String(appData.totalRounds)];
    selectedMoneyRoundIdx = appData.totalRounds - 1;
    syncToSupabase(appData); renderAll(); showToast(`➕ ${appData.totalRounds}차전이 추가되었습니다.`);
    setTimeout(() => { const wrapper = document.getElementById('tableWrapper'); if(wrapper) wrapper.scrollTo({ left: wrapper.scrollWidth + 1000, behavior: 'smooth' }); }, 150);
}

// 마지막 차수를 지운다. 무엇이 사라지는지 먼저 보여 주고 한 번 더 묻는다 —
// 사진이 붙은 차수를 무심코 지웠다가 되돌리기가 실시간 갱신에 밀려
// 사진이 통째로 안 보이게 된 적이 있다.
async function removeRound() {
    if (localStorage.getItem('jtfag_my_name') !== SCORE_OWNER) return;   // 버튼은 본인에게만 보인다 — 여기서도 막는다
    if (appData.totalRounds <= 2) { showToast("⚠️ 최소 2개 라운드는 유지되어야 합니다."); return; }

    const r = appData.totalRounds - 1;
    // 홀 기록이 있는 차수는 접속할 때 다시 만들어진다(appendRoundFromHoles) — 지워 봐야 되살아나므로 먼저 홀 기록을 지우게 한다.
    if (hasHoleRecord(r)) { showToast(`⚠️ ${r + 1}차는 스코어카드 기록이 있어 삭제할 수 없습니다. 스코어 등록 창에서 홀 기록을 먼저 삭제해 주세요.`); return; }
    const course = (appData.courses && appData.courses[r] || '').trim();
    const photos = (appData.roundPhotos && appData.roundPhotos[r] || []).length;
    const scored = golfers.filter(g => {
        const v = appData.scores[g] && appData.scores[g][r];
        return v !== "" && v !== undefined && !isNaN(parseFloat(v));
    }).length;

    const parts = [];
    if (course) parts.push(escapeHtml(course));
    if (scored) parts.push(`타수 ${scored}명`);
    if (photos) parts.push(`<b style="color:#fca5a5;">사진 ${photos}장</b>`);
    const detail = parts.length ? parts.join(' · ') : '입력된 데이터 없음';

    const ok = await showConfirmPrompt(
        `${r + 1}차전을 삭제할까요?<br>` +
        `<span style="font-size:0.78rem; font-weight:600; color:#cbd5e1;">${detail}</span>` +
        (photos ? `<br><span style="font-size:0.72rem; font-weight:600; color:#94a3b8;">실시간 동기화 상황에 따라 되돌리기 시 사진 목록이 복구되지 않을 수 있습니다.</span>` : ''),
        "삭제");
    if (!ok) return;

    saveState(); appData.totalRounds--;
    if (appData.courses) appData.courses.pop();
    if (appData.roundPhotos && appData.roundPhotos.length > 0) appData.roundPhotos.pop();
    golfers.forEach(name => { if (appData.scores[name]) appData.scores[name].pop(); });
    if (appData.roundMoney && appData.roundMoney.length > 0) appData.roundMoney.pop();
    if (selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
    const moved = carryScheduleAfterRemove(r + 1);
    // 일정이 지운 차수에 그대로 남았으면 접속할 때 다시 만들어지지 않게 표시한다(ensureScheduledRound).
    if (!moved && parseInt(appData.nextRoundNo, 10) === r + 1) appData.autoRoundOff = r + 1;
    syncToSupabase(appData); renderAll();
    showToast(`➖ ${r + 1}차전 데이터가 삭제되었습니다.` + (moved ? ` 일정은 ${appData.totalRounds}차로 이동했습니다.` : ''));
}

/* 지운 차수에 일정이 붙어 있었다면 어디로 가야 하나.
   10차를 지웠는데 일정 창을 열면 여전히 `10차 (예정) · 골프장`이 골라져 있었다 —
   `nextRoundNo`와 `roundCourses[10]`이 그대로 남기 때문이다(골프장 이름은 차수를 지웠다
   다시 만들어도 돌아오도록 **일부러** 남긴다). 그런데 일정까지 지운 차수를 붙들고 있으면
   "지웠는데 아직 있다"로 보인다.

   남은 마지막 차수가 **아직 안 친 차수**면 일정을 그쪽으로 옮긴다 — 지운 차수는 미리 만들어
   둔 것이었을 테니. 골프장·코스도 함께 옮기고 지운 번호의 것은 지운다.
   '안 친 차수'는 `roundIsEmpty()`로 본다 — 홀 기록·타수·정산 금액·사진이 **모두** 없을 때만이다.
   홀 기록만 보면 지난 차수를 치고 스코어카드를 아직 안 올린 사이에 다음 일정을 잡은 경우에
   그 차수를 안 친 것으로 잘못 보고 골프장을 덮어쓴다. 하나라도 있으면 다음 라운드는 정말로
   지운 번호이므로 그대로 둔다.

   **이미 그렇게 된 데이터도 접속할 때 바로잡는다**(`settleScheduleRound()`, `applyHoleScores()`에서).
   일정이 '아직 없는 다음 차수'에 붙어 있는데 마지막 차수가 비어 있으면 같은 규칙으로 옮긴다.
   바뀐 게 있을 때만 true를 돌려 헛저장이 안 나간다. */
function roundIsEmpty(r) {
    if (r < 0 || r >= appData.totalRounds || hasHoleRecord(r)) return false;
    const scored = golfers.some(g => {
        const v = appData.scores && appData.scores[g] && appData.scores[g][r];
        return v !== "" && v !== undefined && v !== null && !isNaN(parseFloat(v));
    });
    if (scored) return false;
    const money = appData.roundMoney && appData.roundMoney[r];
    const paid = money && golfers.some(g => money[g] && ((Number(money[g].start) || 0) !== 0 || (Number(money[g].end) || 0) !== 0 || (Number(money[g].donate) || 0) !== 0));
    if (paid) return false;
    const photos = appData.roundPhotos && appData.roundPhotos[r];
    return !(photos && photos.length);
}

function moveScheduleTo(from, to) {
    const clubs = roundCourseMap(), subs = subCourseMap();
    appData.nextRoundNo = to;
    if (clubs[from]) {
        clubs[to] = clubs[from];
        if (!appData.courses) appData.courses = [];
        if (to <= appData.totalRounds) appData.courses[to - 1] = clubs[from];
    }
    delete clubs[from];
    if (subs[from]) subs[to] = subs[from]; else delete subs[to];
    delete subs[from];
    if (appData.roundDates && appData.roundDates[from]) {
        appData.roundDates[to] = appData.roundDates[from];
        delete appData.roundDates[from];
    }
}

function carryScheduleAfterRemove(deleted) {
    if (parseInt(appData.nextRoundNo, 10) !== deleted) return false;
    const last = appData.totalRounds;
    if (!roundIsEmpty(last - 1)) return false;
    moveScheduleTo(deleted, last);
    return true;
}

/* 일정이 '아직 없는 다음 차수'에 잡히면 그 차수를 미리 만든다.
   사용자 요청 — 10차가 끝나고 11차 일정을 등록하면 게임을 시작하기 전에 차수별 정산에서
   시작 금액부터 입력할 수 있어야 한다(예전엔 스코어카드가 올라오거나 `+ 차수 추가`를 눌러야 생겼다).
   - 일정이 정확히 `totalRounds + 1`에 붙어 있을 때만 만든다. 몇 차수씩 건너뛰어 만들지 않는다.
   - **마지막 차수가 비어 있으면 만들지 않는다** — 그 경우는 `settleScheduleRound()`가 일정을 마지막
     차수로 옮기는 몫이다(두 규칙이 맞서면 만들었다 옮겼다 한다).
   - 금액 줄은 비우지 않는다(`appendRoundFromHoles()`와 같다 — 다른 폰이 방금 적은 금액을 지울 수 있다).
   - **직접 지운 차수는 되살리지 않는다**: `removeRound()`가 `autoRoundOff`에 번호를 남기고,
     일정을 새로 저장하면(`saveSchedule()`) 지운다. 안 그러면 지울 때마다 접속하면 되살아난다.
   - 값이 그대로면 false를 돌려 헛저장이 없다. 되살아난 같은 번호의 차액 사유는 비운다. */
function ensureScheduledRound(quiet) {
    const no = parseInt(appData.nextRoundNo, 10);
    if (!no || !String(appData.nextRoundDate || '').trim()) return false;
    if (parseInt(appData.autoRoundOff, 10) && parseInt(appData.autoRoundOff, 10) !== no) delete appData.autoRoundOff;
    if (no !== appData.totalRounds + 1 || parseInt(appData.autoRoundOff, 10) === no) return false;
    if (appData.totalRounds < 1 || roundIsEmpty(appData.totalRounds - 1)) return false;
    const wasLast = selectedMoneyRoundIdx === appData.totalRounds - 1;
    if (!appData.courses) appData.courses = [];
    if (!appData.roundPhotos) appData.roundPhotos = [];
    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.scores) appData.scores = {};
    appData.totalRounds = no;
    appData.courses[no - 1] = roundCourseMap()[no] || '';
    appData.roundPhotos[no - 1] = [];
    const money = {}; golfers.forEach(g => money[g] = { start: 0, end: 0 });
    appData.roundMoney[no - 1] = money;
    golfers.forEach(g => { if (!appData.scores[g]) appData.scores[g] = []; appData.scores[g][no - 1] = ""; });
    if (appData.diffReasons) delete appData.diffReasons[String(no)];
    if (wasLast) selectedMoneyRoundIdx = appData.totalRounds - 1;
    if (typeof overlayMoney === 'function') overlayMoney();
    if (!quiet) showToast(`➕ ${no}차를 미리 생성했습니다.\n정산 금액을 입력할 수 있습니다.`);
    return true;
}

function settleScheduleRound() {
    const next = parseInt(appData.nextRoundNo, 10);
    const last = appData.totalRounds;
    if (next !== last + 1 || !roundIsEmpty(last - 1)) return false;
    moveScheduleTo(next, last);
    return true;
}

/* ── 여행에 잡힌 라운드를 다음 라운드 일정에 자동 반영 ─────────────────
   사용자 요청 — 여행 일정에 골프장·날짜를 적어 두었는데 일정을 따로 또 등록해야 했다.
   **일정이 비었거나 지났거나 그 차수가 이미 기록된 때**, 오늘 이후 가장 이른 여행 라운드를 다음 라운드로 올린다.
   사람이 잡아 둔 앞으로의 일정이 있으면 건드리지 않는다(그게 더 늦은 날짜여도 마찬가지 — 일부러 잡은 것일 수 있다).
   자동으로 올린 일정에는 `nextRoundSrc`(`여행id|날짜`)를 남겨, 그 여행 날의 골프장·티오프를 고치면 따라가게 한다.
   일정 창에서 직접 저장하면 이 표시가 지워진다(saveSchedule). 값이 그대로면 아무것도 안 하므로 헛저장이 없다. */
function tripRoundText(day, club) {
    const m = parseInt(day.date.slice(5, 7), 10), d = parseInt(day.date.slice(8, 10), 10);
    const tee = String(day.tee || '').match(/(?:(오전|오후)\s*)?(\d{1,2})\s*(?::|시)\s*(\d{2})?/);
    if (!tee) return `${m}월 ${d}일 ${club}`;
    let h = parseInt(tee[2], 10); const mm = tee[3] || '00';
    const ap = tee[1] || (h >= 12 ? '오후' : '오전');
    if (h > 12) h -= 12;
    return `${m}월 ${d}일 ${ap} ${h}:${mm} ${club}`;
}

function syncScheduleFromTrips() {
    if (typeof allTrips !== 'function' || typeof tripDays !== 'function') return false;
    const today = kstToday();
    const golfDays = [];
    allTrips().forEach(trip => tripDays(trip).forEach(day => {
        if (day.date < today || !String(day.course || '').trim() || noRound(day)) return;
        golfDays.push({ trip, day });
    }));
    golfDays.sort((a, b) => a.day.date < b.day.date ? -1 : a.day.date > b.day.date ? 1 : 0);

    const nowNo = parseInt(appData.nextRoundNo, 10) || 0;
    const iso = String(appData.nextRoundISO || '');
    const recorded = nowNo > 0 && hasHoleRecord(nowNo - 1);
    const valid = !!appData.nextRoundDate && /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= today && !recorded;
    const [srcId, srcDate] = String(appData.nextRoundSrc || '').split('|');
    const linked = srcId ? golfDays.find(g => g.trip.id === srcId && g.day.date === srcDate) : null;

    let pick = null;
    if (linked && valid) pick = linked;                       // 여행에서 올린 일정 — 여행 칸을 고치면 따라간다
    else if (!valid) {
        // 이미 스코어가 기록된 날은 다음 라운드가 아니다(여행 첫날을 치고 둘째 날로 넘어갈 때).
        pick = golfDays.find(g => !(typeof hasHoleRecord === 'function' && Object.keys(appData.roundDates || {}).some(n => appData.roundDates[n] === g.day.date && hasHoleRecord(Number(n) - 1)))) || null;
    }
    if (!pick) return false;

    const club = String(pick.day.course).replace(/\s*\([^()]*\)\s*$/, '').trim();
    let no = nowNo > 0 && valid ? nowNo : appData.totalRounds + 1;
    if (!(nowNo > 0 && valid) && appData.totalRounds > 0 && roundIsEmpty(appData.totalRounds - 1)) no = appData.totalRounds;
    const text = tripRoundText(pick.day, club);
    const src = `${pick.trip.id}|${pick.day.date}`;
    const clubs = roundCourseMap(), dates = appData.roundDates || (appData.roundDates = {});
    if (appData.nextRoundDate === text && appData.nextRoundISO === pick.day.date && appData.nextRoundNo === no
        && appData.nextRoundSrc === src && clubs[no] === club && dates[no] === pick.day.date) return false;

    appData.nextRoundDate = text; appData.nextRoundISO = pick.day.date; appData.nextRoundNo = no; appData.nextRoundSrc = src;
    dates[no] = pick.day.date; clubs[no] = club;
    delete subCourseMap()[no];
    if (no <= appData.totalRounds) { if (!appData.courses) appData.courses = []; appData.courses[no - 1] = club; }
    return true;
}

let selectedPhotoRoundIdx = -1;
function openRoundPhotoModal(r) { selectedPhotoRoundIdx = r; document.getElementById('roundPhotoTitle').innerHTML = `📸 ${r + 1}차전 갤러리`; renderRoundPhotos(); document.getElementById('roundPhotoModal').classList.add('active'); }
function closeRoundPhotoModal() { document.getElementById('roundPhotoModal').classList.remove('active'); }

/* ── 알림 받는 기기 ───────────────────────────────────────────────
   push_subscriptions에 남아 있는 구독을 그대로 보여 준다. 사람 수가 아니라
   기기 수다 — 한 사람이 폰과 PC로 따로 구독하면 두 줄이 된다.
   기기를 바꾸거나 앱을 지워도 예전 구독이 남아 있을 수 있는데, 그런 건
   발송할 때 만료(404/410)로 확인되면 scripts/push.js가 알아서 지운다. */

let pushSubsCache = [];
let pushSubsMine = null;

function closePushSubsModal() { document.getElementById('pushSubsModal').classList.remove('active'); }

async function openPushSubsModal() {
    const content = document.getElementById('pushSubsContent');
    if (!content) return;
    content.innerHTML = `<div class="subs-empty">불러오는 중…</div>`;
    document.getElementById('pushSubsModal').classList.add('active');

    try {
        pushSubsCache = await listPushSubscriptions();
    } catch (err) {
        content.innerHTML = `<div class="subs-empty">⚠️ ${escapeHtml(err.message)}</div>`;
        return;
    }
    // 이 기기가 목록의 어느 줄인지 표시해 준다.
    pushSubsMine = null;
    try {
        const sub = await getPushSubscription();
        if (sub) pushSubsMine = sub.endpoint;
    } catch (e) { /* 이 기기 표시는 못 해도 목록은 보여 준다 */ }

    renderPushSubs();
}

function renderPushSubs() {
    const content = document.getElementById('pushSubsContent');
    if (!content) return;

    if (pushSubsCache.length === 0) {
        content.innerHTML = `<div class="subs-empty">알림 수신 기기가 없습니다.<br>상단 🔔 버튼으로 활성화할 수 있습니다.</div>`;
        return;
    }

    // 사람별로 묶어 보여 준다. 이름을 안 남긴 구독은 맨 뒤로.
    const byName = {};
    pushSubsCache.forEach((s, i) => {
        const key = s.name || '이름 미등록';
        (byName[key] = byName[key] || []).push({ sub: s, idx: i });
    });
    const order = golfers.filter(n => byName[n]).concat(Object.keys(byName).filter(n => !golfers.includes(n)));

    content.innerHTML =
        `<div class="subs-total">전체 <b>${pushSubsCache.length}</b>대 · ${order.length}명</div>` +
        order.map(name => `
            <div class="subs-person">
                <div class="subs-name">${escapeHtml(name)} <span class="subs-count">${byName[name].length}대</span></div>
                ${byName[name].map(({ sub, idx }) => {
                    const me = sub.endpoint === pushSubsMine;
                    return `<div class="subs-device${me ? ' me' : ''}">
                        <span class="subs-device-name">${escapeHtml(pushEndpointLabel(sub.endpoint))}</span>
                        ${me ? '<span class="subs-me-tag">이 기기</span>' : ''}
                        <button type="button" class="subs-del" onclick="removePushSub(${idx})" title="알림 해제">✕</button>
                    </div>`;
                }).join('')}
            </div>`).join('') +
        `<div class="subs-note">✕를 누르면 해당 기기의 알림 수신이 해제됩니다. 사용자가 다시 활성화하면 복구됩니다.<br>
         기기 변경·앱 삭제로 만료된 구독은 다음 발송 시 자동으로 정리됩니다.</div>`;
}

// 남의 기기를 지우면 그 사람은 이유도 모른 채 알림이 끊긴다. 그래서 한 번 더 묻는다.
async function removePushSub(idx) {
    const sub = pushSubsCache[idx];
    if (!sub) return;
    const me = sub.endpoint === pushSubsMine;
    const who = sub.name || '이름 미등록';

    const ok = await showConfirmPrompt(
        `${escapeHtml(who)}님의 <b>${escapeHtml(pushEndpointLabel(sub.endpoint))}</b> 알림을 해제할까요?` +
        `<br><span style="font-size:0.8rem; font-weight:400; color:#94a3b8;">` +
        (me ? '현재 사용 중인 기기입니다. 🔔 버튼으로 다시 활성화할 수 있습니다.'
            : '해당 기기에서 🔔 버튼을 누르면 다시 활성화됩니다.') + '</span>', '알림 해제');
    if (!ok) return;

    try {
        // 이 기기면 브라우저 구독까지 끊는다. 안 그러면 버튼만 켜진 채로 남는다.
        if (me) { await unsubscribeFromPush(); pushSubsMine = null; }
        else await deletePushSubscription(sub.endpoint);
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
        return;
    }

    pushSubsCache.splice(idx, 1);
    renderPushSubs();
    if (me) updateAlarmUI();
    showToast("🔕 알림을 해제했습니다.");
}

/* ── 스코어카드 등록 ──────────────────────────────────────────────
   여기서는 사진만 올리고 요청을 남긴다. 실제 판독은 GitHub Actions가
   맡는다(scripts/read-scorecard.js). 판독이 끝나면 stats.js에 그 차수가
   커밋되고, 배포된 뒤 접속하면 표의 타수가 저절로 채워진다.
   payload.scoreRequests 한 건 = {id, round, url, time, by, status, note}
   round는 차수(1부터), status는 대기 / 완료 / 실패. */

