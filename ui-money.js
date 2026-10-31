// ◇ ui.js를 나눈 조각 — 정산 금액 표 · 찬조 · 니어 잔액 · 금액 잠금과 저장 입구(updateMoney) · 보관 용량
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
// 접속하면 표를 맨 오른쪽으로 밀어 둔다 — 궁금한 건 방금 친 차수라서다.
// 딱 한 번만 한다. 남이 값을 고쳐 실시간 갱신이 들어올 때마다 밀어 버리면
// 앞 차수를 보고 있던 사람의 화면이 튄다.
let jumpedToLatestRound = false;

function jumpToLatestRound() {
    if (jumpedToLatestRound) return;
    const wrapper = document.getElementById('tableWrapper');
    // 아직 표가 안 그려졌으면(뼈대만 있을 때) 다음 렌더에 다시 해 본다.
    if (!wrapper || wrapper.scrollWidth <= wrapper.clientWidth) return;
    jumpedToLatestRound = true;

    // 부드럽게 밀지 않는다. 처음 보이는 화면은 이미 오른쪽이어야 한다.
    const toEnd = () => { if (!isTableTouched) wrapper.scrollLeft = wrapper.scrollWidth; };
    toEnd();
    // 글꼴이 늦게 붙으면 표 폭이 달라진다. 자리를 두 번 더 맞춘다.
    requestAnimationFrame(toEnd);
    setTimeout(toEnd, 400);
}

function renderStorageUsage() {
    const storageInfo = document.getElementById('storageInfoDisplay');
    if (!storageInfo) return;

    const jsonString = JSON.stringify(appData);
    const bytes = new Blob([jsonString]).size;
    
    const maxBytes = 5 * 1024 * 1024; 
    
    const kb = (bytes / 1024).toFixed(1);
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    
    let displaySize = bytes > 1024 * 1024 ? `${mb} MB` : `${kb} KB`;
    let percent = (bytes / maxBytes) * 100;
    if (percent > 100) percent = 100;

    let statusColor = "#16a34a"; 
    let statusIcon = "🟢";
    let statusText = "원활";

    if (percent > 85) {
        statusColor = "#dc2626"; 
        statusIcon = "🔴";
        statusText = "위험 (사진 삭제 권장)";
    } else if (percent > 60) {
        statusColor = "#eab308"; 
        statusIcon = "🟡";
        statusText = "주의 (사진 누적됨)";
    }

    storageInfo.innerHTML = `
        <div class="storage-line">
            <span>💾 데이터 용량</span>
            <span style="color:${statusColor}; font-weight:800;">${statusIcon} ${displaySize} / 5.0 MB · ${statusText}</span>
        </div>
        <div class="storage-bar"><span style="width:${Math.max(percent, 1)}%; background:${statusColor};"></span></div>`;
}

// `전체`를 고르면 아래 차수 카드가 1차부터 지금까지 모두 보인다(사용자 요청). 위 정산 표는 금액 칸이 차수 하나에 묶여 있어
// 마지막으로 보던 차수(selectedMoneyRoundIdx)를 그대로 둔다 — 그래서 값을 따로 들고 있고 selectedMoneyRoundIdx를 건드리지 않는다.
let moneyShowAll = false;
function changeMoneyRound(idxVal) {
    if (idxVal === 'all') moneyShowAll = true;
    else { moneyShowAll = false; selectedMoneyRoundIdx = parseInt(idxVal, 10); }
    renderMoneyTable(); if (typeof renderRoundCards === 'function') renderRoundCards();
}

// 차수 목록을 드롭다운에 채운다. 차수가 늘어도 화면이 커지지 않는다 —
// 예전엔 칩을 격자로 늘어놓는 창이었는데, 스무 개가 되면 감당이 안 된다.
function renderMoneyRoundOptions(select) {
    const want = [];
    for (let r = 0; r < appData.totalRounds; r++) {
        const course = (appData.courses && appData.courses[r]) ? appData.courses[r].trim() : "";
        want.push(`${r + 1}차전${course ? ` · ${course}` : ""}`);
    }
    const cur = () => moneyShowAll ? 'all' : String(selectedMoneyRoundIdx);
    // 내용이 그대로면 다시 만들지 않는다 (실시간 갱신 때마다 목록이 껌뻑인다).
    if (select.getAttribute('data-labels') === want.join('|')) {
        select.value = cur();
        return;
    }
    select.innerHTML = "";
    want.forEach((label, r) => select.add(new Option(label, r)));
    select.add(new Option('전체 (1차~현재)', 'all'));
    select.setAttribute('data-labels', want.join('|'));
    select.value = cur();
}

// 정산 금액 뱃지. 계급정산·타수정산이 같은 함수를 쓰므로 두 칸이 어긋날 수 없다.
function moneyResultTone(v) { return v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero'); }
function moneyResultText(v) { return v === 0 ? "0원" : (v > 0 ? "+" : "") + (v / 10000).toFixed(1) + "만"; }
function paintMoneyResult(el, v, wait) {
    if (!el) return;
    el.className = `money-result-badge ${wait ? 'wait' : moneyResultTone(v)}`;
    el.textContent = wait ? '대기' : moneyResultText(v);
}
// 스코어 입력 대기인 차수는 계급정산·타수정산 칸에 금액 대신 `대기`를 적는다(roundScored in calc.js).

// 남의 칸은 readonly로 두고 누르면 왜 안 되는지 알려 준다.
// pointer-events를 끄지 않는 이유가 그것이다 — 아무 반응이 없으면 고장으로 보인다.
/* 칸에 **그 칸이 만들어질 때의 차수를 박아 둔다**(네 번째 인자).
   예전엔 `updateMoney()`가 그때그때의 `selectedMoneyRoundIdx`를 읽었다 — 금액을 적다가
   차수 드롭다운을 바꾸면 블러(= 저장)가 드롭다운 처리보다 늦게 도는 기기에서
   **방금 적은 금액이 엉뚱한 차수에 들어간다**(그 차수 금액은 덮이고 원래 차수는 안 바뀐다).
   칸에 박아 두면 어떤 순서로 돌든 적은 자리에 들어간다. */
function moneyCell(g, type, value) {
    const editable = canEditMoney(g);
    const r = selectedMoneyRoundIdx;
    return `<input type="text" id="money_${type}_${g}" inputmode="numeric" pattern="[0-9]*"
        class="money-input${editable ? '' : ' locked'}" value="${formatNumber(value)}"
        ${editable ? '' : 'readonly '}onfocus="this.select()"
        ${editable
            ? `onchange="updateMoney('${g}', '${type}', this.value, ${r})" onkeydown="moneyKeydown(event)"`
            : `onclick="moneyLockNotice('${g}')"`}>`;
}

/* ── 금액 입력 마무리 ─────────────────────────────────────────────
   금액 칸은 확인 단추 없이 **포커스가 빠질 때(`onchange`)** 저장된다. 그런데 저장됐다는
   표시가 없어 "다른 데를 눌렀는데 들어간 건지 모르겠다"는 말이 나왔다. 아이폰 숫자
   키패드에는 완료 키조차 없어(홈 화면 앱은 사파리의 '완료' 줄도 안 뜬다) 더 그렇다.

   그래서 셋을 둔다:
   1. 저장되면 **토스트로 무엇이 얼마로 저장됐는지** 알리고 그 칸을 잠깐 반짝인다
      (`.just-saved` — 한 칸에 한 번만 도는 box-shadow 애니메이션이다. 배경색은
      `.money-input`이 `!important`라 애니메이션이 못 이긴다).
   2. 금액 칸에 커서가 있는 동안만 화면 아래에 **`✓ 입력 완료`**(`#moneyDoneBar`)가 뜬다.
      누르면 포커스를 빼서 저장을 태우고, 바뀐 게 없으면 그렇다고 말해 준다.
      단추의 `pointerdown`을 막아 **단추를 누르는 순간 포커스가 먼저 빠지지 않게** 한다 —
      안 막으면 눌리기 전에 바가 사라져 손가락이 엉뚱한 곳에 닿는다.
      아이폰은 키보드가 올라와도 `position:fixed`가 키보드 뒤에 깔리므로
      `visualViewport`로 키보드 위에 붙인다.
   3. Enter(안드로이드 키보드의 완료 키)로도 포커스가 빠져 저장된다. */
const MONEY_FIELD_LABEL = { start: '시작 금액', end: '남은 금액', donate: '찬조' };
let lastMoneySavedAt = 0;

function isMoneyField(el) {
    return !!el && el.matches && el.matches('.money-input:not(.locked), .donate-input:not(.locked)');
}

function moneyKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
}

function flashMoneySaved(name, type, after) {
    lastMoneySavedAt = Date.now();
    showToast(`💾 ${name} ${MONEY_FIELD_LABEL[type] || type} ${formatNumber(after)}원 저장됨`);
    const el = document.getElementById(`money_${type}_${name}`);
    if (!el) return;
    el.classList.remove('just-saved');
    void el.offsetWidth;                          // 애니메이션을 처음부터 다시 돌린다
    el.classList.add('just-saved');
}

function placeMoneyDoneBar() {
    const bar = document.getElementById('moneyDoneBar');
    if (!bar || !bar.classList.contains('on')) return;
    const vv = window.visualViewport;
    // 키보드가 올라오면 보이는 영역이 줄어든다. 그 아래쪽 끝에서 12px 위에 둔다.
    const hidden = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = `${hidden + 12}px`;
}

function showMoneyDoneBar(on) {
    const bar = document.getElementById('moneyDoneBar');
    if (!bar) return;
    bar.classList.toggle('on', !!on);
    if (on) placeMoneyDoneBar(); else bar.style.bottom = '';
}

// 눌림 표시. `:active`는 터치에서 안 켜진다 — pointerdown을 막았기 때문이다(포커스를 지키려고).
// 그래서 pointerdown/up에 직접 `.pressing`을 붙였다 뗀다. 손가락이 밖으로 나가도 풀린다.
function pressMoneyDone(e, on) {
    if (on) e.preventDefault();                   // 포커스가 먼저 빠지지 않게
    e.currentTarget.classList.toggle('pressing', !!on);
}

function finishMoneyInput() {
    const el = document.activeElement;
    const before = lastMoneySavedAt;
    if (isMoneyField(el)) el.blur();              // change → updateMoney → 토스트
    if (lastMoneySavedAt === before) showToast('✔️ 변경된 금액이 없습니다.');
    showMoneyDoneBar(false);
}

document.addEventListener('focusin', e => { if (isMoneyField(e.target)) showMoneyDoneBar(true); });
document.addEventListener('focusout', e => {
    if (!isMoneyField(e.target)) return;
    // 다음 칸으로 옮겨 가는 중이면 바를 그대로 둔다.
    setTimeout(() => { if (!isMoneyField(document.activeElement)) showMoneyDoneBar(false); }, 0);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', placeMoneyDoneBar);
    window.visualViewport.addEventListener('scroll', placeMoneyDoneBar);
}

/* 계급정산·타수정산 — 표의 뒤 두 칸이 이 값이다.
   **니어 이월이 `strokeDiffOf()`를 같이 쓴다** — 규칙이 두 군데가 되면
   표에 적힌 타수정산과 니어가 합이 안 맞아 어디가 틀렸는지 알 수 없게 된다. */
function rankPenaltyOf(name, roundIdx) {
    return (cachedRoundRankProfit[name] && cachedRoundRankProfit[name][roundIdx] !== undefined)
        ? cachedRoundRankProfit[name][roundIdx] : 0;
}

function strokeDiffOf(name, roundIdx) {
    const m = (appData.roundMoney && appData.roundMoney[roundIdx] && appData.roundMoney[roundIdx][name]) || { start: 0, end: 0 };
    const start = Number(m.start) || 0, end = Number(m.end) || 0;
    if (!moneySettled(m) || !roundScored(roundIdx)) return 0;   // 남은 금액 전이거나 스코어 입력 대기면 0(calc.js)
    return (end - start) - rankPenaltyOf(name, roundIdx);
}

function renderMoneyTable() {
    const tbody = document.getElementById('moneyTbody');
    const roundSelect = document.getElementById('moneyRoundSelect');

    if (!tbody || !roundSelect) return;

    renderMoneyRoundOptions(roundSelect);

    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.roundMoney[selectedMoneyRoundIdx]) {
        appData.roundMoney[selectedMoneyRoundIdx] = {};
        golfers.forEach(g => appData.roundMoney[selectedMoneyRoundIdx][g] = { start: 0, end: 0 });
    }

    // 잠금 상태가 바뀌면 칸을 다시 만들어야 한다 — 아래 빠른 길은 값만 갈아 끼운다.
    const lockKey = `${isMoneyUnlocked ? 'all' : myGolferName() || 'none'}`;
    const waiting = !roundScored(selectedMoneyRoundIdx);

    if (tbody.children.length === golfers.length
        && tbody.getAttribute('data-round') === String(selectedMoneyRoundIdx)
        && tbody.getAttribute('data-lock') === lockKey) {
        golfers.forEach(g => {
            const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
            const sInput = document.getElementById(`money_start_${g}`);
            const eInput = document.getElementById(`money_end_${g}`);
            if (sInput && document.activeElement !== sInput) sInput.value = formatNumber(m.start);
            if (eInput && document.activeElement !== eInput) eInput.value = formatNumber(m.end);

            paintMoneyResult(document.getElementById(`money_rank_${g}`), rankPenaltyOf(g, selectedMoneyRoundIdx), waiting);
            paintMoneyResult(document.getElementById(`money_stroke_${g}`), strokeDiffOf(g, selectedMoneyRoundIdx), waiting);
        });
        renderDonateRow();
        return;
    }

    tbody.setAttribute('data-round', String(selectedMoneyRoundIdx));
    tbody.setAttribute('data-lock', lockKey);
    tbody.innerHTML = "";
    golfers.forEach(g => {
        const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
        const rankPenalty = rankPenaltyOf(g, selectedMoneyRoundIdx);
        const pureStrokeDiff = strokeDiffOf(g, selectedMoneyRoundIdx);

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:800; color:var(--text-main);">${g}</td>
                <td>${moneyCell(g, 'start', m.start)}</td>
                <td>${moneyCell(g, 'end', m.end)}</td>
                <td><span id="money_rank_${g}" class="money-result-badge ${waiting ? 'wait' : moneyResultTone(rankPenalty)}">${waiting ? '대기' : moneyResultText(rankPenalty)}</span></td>
                <td><span id="money_stroke_${g}" class="money-result-badge ${waiting ? 'wait' : moneyResultTone(pureStrokeDiff)}">${waiting ? '대기' : moneyResultText(pureStrokeDiff)}</span></td>
            </tr>`;
    });
    renderDonateRow();
}

/* ── 찬조 ────────────────────────────────────────────────────────
   모임을 위해 개인이 쓴 돈이다. 정산과 달리 시작·남은 금액에서 나오지 않고
   그 사람이 따로 적는다. **합산에서 그만큼 뺀다** — -50만인 사람이 5만을 찬조하면 -55만.

   값은 `roundMoney[차수][이름].donate`에 같이 둔다. 배열을 새로 만들면
   `addRound()`·`removeRound()`가 길이를 또 맞춰야 하는데, 여기 얹으면 저절로 따라다닌다.
   예전 payload에는 이 키가 없으므로 **없으면 0으로 볼 것.**

   **표의 6번째 열로 넣지 말 것.** 5열이 이미 364px(390px 기기)를 꽉 쓰고 있어
   하나를 더 넣으면 금액 칸이 찌그러진다 — 320px에서는 지금도 가로로 넘친다.
   `.money-input`도 재사용하지 않는다(68px로 묶여 있다).

   가로 한 줄에 넷을 늘어놓는다. 이름을 위, 칸을 아래에 둬야 91px 안에 들어간다 —
   옆에 붙이면 이름이 자리를 먹어 칸이 45px로 찌그러진다. 니어는 그 아래 줄이다. */
function renderDonateRow() {
    const box = document.getElementById('donateRow');
    if (!box) return;
    const round = (appData.roundMoney && appData.roundMoney[selectedMoneyRoundIdx]) || {};
    const valueOf = g => Number(round[g] && round[g].donate) || 0;

    // 차수나 잠금이 바뀔 때만 다시 만든다. 아니면 값만 갈아 끼운다 —
    // 정산 표와 같은 이유다(안 그러면 타이핑 중에 칸이 새로 만들어져 포커스가 날아간다).
    const key = `${selectedMoneyRoundIdx}|${isMoneyUnlocked ? 'all' : myGolferName() || 'none'}`;
    if (box.getAttribute('data-key') === key) {
        golfers.forEach(g => {
            const el = document.getElementById(`money_donate_${g}`);
            if (el && document.activeElement !== el) el.value = valueOf(g) ? formatNumber(valueOf(g)) : '';
        });
        paintDonateSum();
        paintNearBox();
        paintRaveBox();
        return;
    }

    box.setAttribute('data-key', key);
    box.innerHTML = `
        <div class="donate-box">
            <div class="donate-head"><span class="donate-title">🎁 찬조</span><b id="donateSum"></b></div>
            <div class="donate-grid">` + golfers.map(g => {
                const v = valueOf(g);
                const editable = canEditMoney(g);
                return `<label class="donate-cell"><span class="donate-name">${g}</span>
                    <input type="text" id="money_donate_${g}" inputmode="numeric" pattern="[0-9]*"
                        class="donate-input${editable ? '' : ' locked'}" value="${v ? formatNumber(v) : ''}" placeholder="0"
                        ${editable ? '' : 'readonly '}onfocus="this.select()"
                        ${editable
                            ? `onchange="updateMoney('${g}', 'donate', this.value, ${selectedMoneyRoundIdx})" onkeydown="moneyKeydown(event)"`
                            : `onclick="moneyLockNotice('${g}')"`}></label>`;
            }).join('') + `</div>
        </div>
        <div class="near-box">
            <span class="near-head">🎯 정산 일치 여부</span>
            <b id="nearCarry">0원</b>
            <span id="nearCheck" class="near-check"></span>
        </div>
        <div class="reason-box" id="reasonBox"></div>
        <div class="rave-box" id="raveBox"></div>`;
    paintDonateSum();
    paintNearBox();
    paintRaveBox();
}

/* ── 라베 갱신 지급 ──────────────────────────────────────────────
   11차부터 개인 최저타(라베)를 줄이면 줄인 타수 1타당 1만원을 **동반자가 각자** 준다(사용자 규칙 — 공금이 아니다).
   내역은 calc.js의 computeRaveAwards()가 기록에서 매번 셈한다 — 여기는 보여 주기만 한다.
   **정산 금액(시작·남은)에는 섞지 않는다.** 선수끼리 따로 주고받는 돈이라 섞으면 니어 검산이 어긋난다.
   공금 잔액은 건드리지 않는다. */
function paintRaveBox() {
    const box = document.getElementById('raveBox');
    if (!box) return;
    if (selectedMoneyRoundIdx + 1 < RAVE_FROM_ROUND) { box.innerHTML = ''; return; }
    const list = (typeof raveAwards !== 'undefined' ? raveAwards : []).filter(a => a.round === selectedMoneyRoundIdx);
    const man = n => `${formatNumber(n / 10000)}만원`;
    // 합계가 아니라 **동반자 1인이 내는 금액**으로 적는다(사용자 요청 — `합계 3만원`이 아니라 `1인 1만원씩`).
    // 갱신이 한 명이면 오른쪽 표에, 둘 이상이면 줄마다 적는다(낼 금액이 사람마다 다를 수 있다).
    const one = list.length === 1;
    const html = `<span class="near-head">🏆 라베 갱신</span>`
        + (list.length
            ? `<span class="rave-list">${list.map(a => `<b>${escapeHtml(a.name)}</b> ${a.prev}→${a.score}타${one ? '' : ` · 1인 ${man(a.pay)}씩`}`).join('<br>')}</span>`
                + (one ? `<span class="near-check ok">1인 ${man(list[0].pay)}씩</span>` : '')
            : `<span class="near-check none">갱신 없음</span>`);
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
}

/* ── 니어 잔액 · 정산 일치 검산 ───────────────────────────────────
   **검산은 '합이 정확히 0'이다**(사용자 규칙 — 니어에 낸 돈까지 잃은 돈에 포함되어 있어,
   잃은 사람과 딴 사람의 금액이 0으로 딱 맞아야 한다. 일치 기능은 누가 얼마를 잃고 땄는지 확인하려는 것이다).
   예전엔 2만원의 배수면 일치로 봤는데(임자 없는 홀의 돈이 이월되는 것으로 보고), 그러면 +2만원처럼
   실제로는 안 맞는 것도 일치로 떴다. **배수 검사로 되돌리지 말 것.** 아래 설명 가운데 '이월'은 옛 해석이다.

   파3 홀마다 **1인당 5천원씩** 걷는다 — 넷이면 한 홀에 2만원이다.
   18홀에 파3가 넷이니 한 차수에 8만원이 모이고, 그 홀의 니어 임자가 없으면
   그 2만원이 팟에 남아 다음으로 넘어간다. 그게 니어 잔액이다.
   **그래서 잔액은 2만원의 배수가 된다** — 8차의 40,000원은 두 홀이 주인 없이 남은 것이다.

   **잔액 하나만 적는다.** 잃은·딴 금액은 표의 `타수정산` 칸에 사람마다 이미 다 나와 있어
   되풀이일 뿐이다. 표에 없는 건 잔액 하나뿐이다.

   **더하는 값은 표의 `타수정산` 칸이다**(`strokeDiffOf()`). 시작·남은 차이를 그대로 쓰면 안 된다 —
   거기엔 계급정산이 섞여 있는데 그 돈은 공금으로 가지 선수들 사이에서 오간 게 아니다.
   표에 적힌 숫자와 같은 함수를 써야 눈으로 더해 봤을 때도 맞는다.

   **입력받지 않고 계산한다.** 타수정산의 합이 정확히 그 금액이라, 따로 적으면
   시작·남은 금액을 고칠 때마다 어긋난다. 계산하면 언제나 맞는다.

   **마이너스일 수도 있다** — 지난 차수에서 넘어온 잔액을 이번에 누가 먹어, 팟에서 나간 돈이
   걷은 돈보다 많은 경우다. 부호를 그대로 붙여 적고 색으로 구분한다. 0이면 '없음'.

   금액 옆에 `파3 2개`처럼 홀 수를 적어 봤는데 사용자 요청으로 뺐다. 되살리지 말 것. */
const NEAR_PER_PERSON = 5000;                 // 파3 한 홀에 한 사람이 내는 돈
function nearPotPerHole() { return NEAR_PER_PERSON * golfers.length; }   // 한 홀에 모이는 돈

function paintNearBox() {
    const el = document.getElementById('nearCarry');
    if (!el) return;
    paintReasonBox();

    // 화면에는 타수정산 합계를 그대로 표시한다. 잃은 돈이 딴 돈보다 많으면 음수다.
    // 스코어 입력 대기면 계급이 안 정해져 합계를 셀 수 없다.
    if (!roundScored(selectedMoneyRoundIdx)) {
        el.textContent = '-';
        el.className = 'zero';
        paintNearCheck(0);
        return;
    }
    const sum = golfers.reduce((a, g) => a + strokeDiffOf(g, selectedMoneyRoundIdx), 0);
    const left = sum;

    el.textContent = left === 0 ? '없음' : `${left < 0 ? '-' : '+'}${formatNumber(Math.abs(left))}원`;
    el.className = left === 0 ? 'zero' : (left > 0 ? 'carry-out' : 'carry-in');
    paintNearCheck(left);
}

/* ── 정산 검산 ───────────────────────────────────────────────────
   니어 팟은 파3 홀마다 2만원(1인당 5천 × 넷)씩 모이므로 **잔액은 반드시 2만원의 배수**다.
   배수가 아니면 누군가의 시작·남은 금액이 잘못 적힌 것이다. 얼마가 어긋났는지 같이 적는다.

   **`잃은 + 딴 + 잔액`을 검산으로 쓰지 말 것** — 잔액을 그 둘의 합으로 계산하므로
   언제나 0이 나온다. 늘 '일치'만 뜨는 표시는 아무것도 안 알려 준다.

   아무도 금액을 안 적은 차수는 '일치'라고 하면 거짓말이라 `입력 전`으로 둔다. */
function paintNearCheck(left) {
    const badge = document.getElementById('nearCheck');
    if (!badge) return;
    const round = (appData.roundMoney && appData.roundMoney[selectedMoneyRoundIdx]) || {};
    const entered = golfers.some(g => {
        const m = round[g] || {};
        return (Number(m.start) || 0) !== 0 || (Number(m.end) || 0) !== 0;
    });

    if (!roundScored(selectedMoneyRoundIdx)) {
        badge.className = 'near-check none';
        badge.textContent = '스코어 입력 대기';
        return;
    }
    if (!entered) {
        badge.className = 'near-check none';
        badge.textContent = '미입력';
        return;
    }
    // 네 명이 모두 남은 금액을 적기 전에는 합이 맞을 수 없다(사용자 요청) — 불일치로 겁주지 않고 '입력 중'으로 둔다.
    const playing = golfers.some(g => !moneySettled(round[g]));
    if (playing) {
        badge.className = 'near-check none';
        badge.textContent = '입력 중';
        return;
    }

    // 니어로 낸 돈도 잃은 돈에 들어 있으므로, 딴 돈과 잃은 돈의 합이 정확히 0이어야 한다(사용자 규칙).
    // 0이 아니면 — 2만원의 배수라도 — 누군가의 시작·남은 금액이 잘못 적힌 것이다.
    // 다만 캐디 팁·남은 니어처럼 **나간 돈**을 차액 사유로 적어 두었으면 그만큼은 설명된 것으로 본다(사용자 요청).
    // 사유는 '모자란 돈(합이 −)'만 설명한다. 금액을 바로잡아 합이 0 이상이 되면 옛 사유는 쓸모가 없어져, 그대로 두면
    // 0에 사유가 더해져 도리어 `초과`로 불일치가 뜬다(사용자 제보) — 합이 −가 아니면 사유를 무시하고, 이 기기 주인이면 걷는다.
    let explained = diffReasonTotal(selectedMoneyRoundIdx);
    if (left >= 0 && explained) { clearStaleReasons(selectedMoneyRoundIdx); explained = 0; }
    const rest = left + explained;       // 0이면 차액이 사유로 다 설명된 것
    if (rest === 0) {
        badge.className = 'near-check ok';
        badge.textContent = explained ? '✅ 일치 · 사유 반영' : '✅ 정산 일치';
    } else {
        badge.className = 'near-check bad';
        badge.textContent = !explained ? '⚠️ 불일치'
            : `⚠️ 불일치 · ${formatNumber(Math.abs(rest))}원 ${rest < 0 ? '남음' : '초과'}`;
        maybeAskMismatch(selectedMoneyRoundIdx, rest);
    }
}

/* ── 불일치 팝업 ────────────────────────────────────────────────────
   네 명이 남은 금액을 다 적었는데 합이 안 맞으면(설명 안 된 지출이 있는 경우) **이 기기 주인**에게 사유를 묻는다
   (사용자 요청 — `정산이 일치하지 않습니다. 사유를 선택해 주세요`). 캐디 팁 · 니어 · 기타 중 하나를 고르면
   금액 입력창이 뜨고(남은 차액이 미리 들어 있다), 저장하면 `차액 사유`에 들어간다.
   **나간 돈(차액이 −)일 때만** 묻는다 — 딴 돈이 더 많은 차액은 사유로 설명되지 않는다.
   같은 차수·같은 차액으로는 이 앱을 켠 동안 한 번만 묻는다(sessionStorage) — 닫았는데 계속 뜨면 방해다.
   입력칸에 커서가 있거나 다른 창이 떠 있거나 정산 화면이 아닐 때는 미룬다(묻지 않고 다음 그리기 때 다시 본다). */
let mismatchTimer = null;
function maybeAskMismatch(r, rest) {
    if (!canEditDiffReason() || rest >= 0) return;
    const key = `${r}:${rest}`;
    let asked = {};
    try { asked = JSON.parse(sessionStorage.getItem('jtfag_mismatch_asked') || '{}'); } catch (e) { asked = {}; }
    if (asked[key]) return;
    clearTimeout(mismatchTimer);
    mismatchTimer = setTimeout(async () => {
        const page = document.getElementById('appContainer');
        if (selectedMoneyRoundIdx !== r || !page || page.getAttribute('data-page') !== 'detail') return;
        if (anyOverlayOpen() || document.querySelector('.mm-overlay') || isMoneyField(document.activeElement)) return;
        asked[key] = 1;
        try { sessionStorage.setItem('jtfag_mismatch_asked', JSON.stringify(asked)); } catch (e) { /* 기록을 못 남겨도 팝업은 한 번 뜬다 */ }
        const kind = await showMismatchPicker(r, -rest);
        if (!kind) return;
        const cur = diffReasonsOf(r);
        const res = await showDiffReasonPrompt(r, cur, { kind, need: -rest });
        if (res) setDiffReason(r, res.kind, res.amount);
    }, 600);
}

// 사유 고르는 창. 취소(바깥 누르기·닫기)면 null.
function showMismatchPicker(r, need) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'mm-overlay';
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        const box = document.createElement('div');
        box.style.cssText = "background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        box.innerHTML = `<div style="color:#16181a; font-size:0.95rem; font-weight:800; word-break:keep-all;">정산이 일치하지 않습니다</div>
            <div style="color:#6b7075; font-size:0.78rem; font-weight:700; margin:6px 0 14px 0; line-height:1.5;">${r + 1}차 · 차액 <b style="color:#c0392b;">${formatNumber(need)}원</b><br>사유를 선택해 주세요.</div>`;
        const list = document.createElement('div');
        list.style.cssText = "display:flex; flex-direction:column; gap:7px; margin-bottom:10px;";
        Object.keys(DIFF_REASONS).forEach(k => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = DIFF_REASONS[k];
            b.style.cssText = "padding:11px 0; border-radius:8px; border:1px solid #2b5394; background:#ffffff; color:#2b5394; font-size:0.88rem; font-weight:800; cursor:pointer; font-family:inherit;";
            b.onclick = () => cleanup(k);
            list.appendChild(b);
        });
        const close = document.createElement('button');
        close.type = 'button'; close.textContent = '나중에 입력';
        close.style.cssText = "width:100%; padding:9px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.8rem; font-weight:700; cursor:pointer; font-family:inherit;";
        close.onclick = () => cleanup(null);
        box.appendChild(list); box.appendChild(close);
        overlay.appendChild(box); document.body.appendChild(overlay);
        setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; }, 10);
        function cleanup(v) {
            overlay.style.opacity = '0'; box.style.transform = 'scale(0.9)';
            setTimeout(() => { overlay.remove(); resolve(v); }, 200);
        }
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
    });
}

/* ── 차액 사유 (캐디 팁 · 니어 · 기타) ──────────────────────────────────────
   타수정산 합이 0이 아닌 까닭이 캐디 팁이나 남은 니어 돈일 수 있다. 그 금액을 적어 두면
   `타수정산 합 + 사유 합 = 0`일 때 '일치 · 사유 반영'으로 본다. 사유는 **나간 돈만** 받는다 —
   딴 돈이 더 많은 차액(+)은 사유로 설명할 수 없다.

   **적는 것은 이 기기 주인(SCORE_OWNER)뿐이다**(사용자 요청 — 스코어 등록 버튼과 같은 기기).
   jtfag_my_name은 보안이 아니라 실수 방지 장치다.
   값은 `payload.diffReasons[차수 번호(1부터)] = {tip, near, typo}`(원)다. 항목마다 금액 하나 — 다시 적으면 덮는다.
   **정산 금액(시작·남은)·공금·니어 잔액 계산에는 섞지 않는다.** 검산 표시에만 쓴다. */
const DIFF_REASONS = { tip: '캐디 팁', near: '니어', typo: '기타' };

function diffReasonsOf(r) {
    const m = appData.diffReasons && appData.diffReasons[String(r + 1)];
    const out = {};
    Object.keys(DIFF_REASONS).forEach(k => { const v = Number(m && m[k]) || 0; if (v > 0) out[k] = v; });
    return out;
}
function diffReasonTotal(r) {
    const m = diffReasonsOf(r);
    return Object.keys(m).reduce((a, k) => a + m[k], 0);
}
function diffRestOf(r) {
    if (!roundScored(r)) return 0;
    const sum = golfers.reduce((a, g) => a + strokeDiffOf(g, r), 0);
    return sum < 0 ? sum + diffReasonTotal(r) : sum;     // 합이 −가 아니면 옛 사유는 없는 것으로 본다
}
// 금액을 바로잡아 더는 모자라지 않는데 남아 있는 사유를 걷는다(이 기기 주인만 · 조용히 · 있을 때만 저장).
function clearStaleReasons(r) {
    if (!canEditDiffReason()) return;
    const key = String(r + 1);
    if (!appData.diffReasons || !appData.diffReasons[key]) return;
    saveState();
    delete appData.diffReasons[key];
    syncToSupabase(appData);
    paintNearBox();
}
function canEditDiffReason() {
    return localStorage.getItem('jtfag_my_name') === SCORE_OWNER;
}

function paintReasonBox() {
    const box = document.getElementById('reasonBox');
    if (!box) return;
    const r = selectedMoneyRoundIdx;
    const owner = canEditDiffReason();
    const m = diffReasonsOf(r);
    const keys = Object.keys(m);
    // 적은 사유가 없으면 줄을 아예 안 그린다(사유는 불일치 팝업에서 자동으로 받는다).
    const html = !keys.length ? '' :
        `<span class="near-head">차액 사유</span><span class="reason-list">`
        + keys.map(k => `<span class="reason-chip">${DIFF_REASONS[k]} ${formatNumber(m[k])}원`
            + (owner ? `<button type="button" class="reason-x" aria-label="${DIFF_REASONS[k]} 삭제" onclick="removeDiffReason(${r}, '${k}')">✕</button>` : '')
            + `</span>`).join('')
        + `</span>`;
    if (box._html !== html) { box.innerHTML = html; box._html = html; }
}

// 값을 바꾸는 입구는 이 함수 하나다. 같은 값이면 저장하지 않는다(실시간 이벤트가 되돌아오는 구조라 헛저장을 만들지 않는다).
function setDiffReason(r, kind, amount) {
    if (!canEditDiffReason() || !DIFF_REASONS[kind]) return;
    const key = String(r + 1);
    const cur = (appData.diffReasons && appData.diffReasons[key] && Number(appData.diffReasons[key][kind])) || 0;
    const next = Math.max(0, Math.round(Number(amount) || 0));
    if (cur === next) return;
    saveState();
    if (!appData.diffReasons) appData.diffReasons = {};
    const entry = Object.assign({}, appData.diffReasons[key] || {});
    if (next) entry[kind] = next; else delete entry[kind];
    if (Object.keys(entry).length) appData.diffReasons[key] = entry; else delete appData.diffReasons[key];
    syncToSupabase(appData);
    paintNearBox();
    showToast(next ? `${r + 1}차 ${DIFF_REASONS[kind]} ${formatNumber(next)}원 저장됨` : `${r + 1}차 ${DIFF_REASONS[kind]} 사유 삭제됨`);
}

async function openDiffReason(r) {
    if (!canEditDiffReason()) return;
    const need = Math.max(0, -(diffRestOf(r)));
    const res = await showDiffReasonPrompt(r, diffReasonsOf(r), need ? { need } : null);
    if (res) setDiffReason(r, res.kind, res.amount);
}

async function removeDiffReason(r, kind) {
    if (!canEditDiffReason()) return;
    const amt = diffReasonsOf(r)[kind] || 0;
    const ok = await showConfirmPrompt(`${r + 1}차 ${DIFF_REASONS[kind]} ${formatNumber(amt)}원 사유를<br>삭제하시겠습니까?`, '삭제');
    if (!ok) return;
    forgetMismatchAsked(r);      // 잘못 고른 사유를 지우면 같은 차액이라도 팝업이 다시 떠서 바로 다른 사유를 고를 수 있다
    setDiffReason(r, kind, 0);
}
function forgetMismatchAsked(r) {
    try {
        const asked = JSON.parse(sessionStorage.getItem('jtfag_mismatch_asked') || '{}');
        Object.keys(asked).forEach(k => { if (k.startsWith(`${r}:`)) delete asked[k]; });
        sessionStorage.setItem('jtfag_mismatch_asked', JSON.stringify(asked));
    } catch (e) { /* 기록이 없으면 처음부터 다시 묻는다 */ }
}

// 항목(캐디 팁/니어)을 고르고 금액을 적는 창. 취소하면 null, 저장하면 {kind, amount}.
// `.modal-overlay` 클래스를 쓰지 않고 스스로 스타일을 지정한다(닫히면 visibility:hidden이라 인라인 opacity로는 안 보인다).
function showDiffReasonPrompt(r, current, opt) {
    return new Promise((resolve) => {
        let kind = (opt && DIFF_REASONS[opt.kind] && opt.kind) || Object.keys(DIFF_REASONS).find(k => !current[k]) || 'tip';
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        const box = document.createElement('div');
        box.style.cssText = "background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        const head = document.createElement('div');
        head.innerHTML = `차액 사유 입력<div style="color:#94a3b8; font-size:0.72rem; font-weight:700; margin-top:3px;">${r + 1}차 · 타수정산 합과의 차이를 설명하는 금액</div>`;
        head.style.cssText = "color:#16181a; font-size:0.9rem; margin-bottom:12px; font-weight:800; word-break:keep-all;";

        const tabRow = document.createElement('div');
        tabRow.style.cssText = "display:flex; gap:5px; margin-bottom:12px;";
        const tabs = {};
        Object.keys(DIFF_REASONS).forEach(k => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = DIFF_REASONS[k];
            b.style.cssText = "flex:1; padding:7px 0; border-radius:6px; border:1px solid #e6e6e2; background:#ffffff; color:#6b7075; font-size:0.75rem; font-weight:800; cursor:pointer; font-family:inherit;";
            b.onclick = () => setKind(k);
            tabs[k] = b; tabRow.appendChild(b);
        });

        const label = document.createElement('div');
        label.textContent = '금액';
        label.style.cssText = "color:#94a3b8; font-size:0.72rem; font-weight:700; text-align:left; margin-bottom:4px;";
        const input = document.createElement('input');
        input.type = 'text'; input.inputMode = 'numeric'; input.placeholder = '0';
        input.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #e6e6e2; background:#f7f7f5; color:#16181a; font-size:1rem; font-weight:800; text-align:center; outline:none; font-family:inherit; margin-bottom:6px;";
        const note = document.createElement('div');
        note.style.cssText = "color:#94a3b8; font-size:0.68rem; font-weight:700; min-height:15px; margin-bottom:10px;";

        const row = document.createElement('div'); row.style.cssText = "display:flex; gap:8px;";
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '취소';
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.85rem; font-weight:700; cursor:pointer; font-family:inherit;";
        const okBtn = document.createElement('button');
        okBtn.textContent = '저장';
        okBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#2b5394; color:#ffffff; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit;";
        row.appendChild(cancelBtn); row.appendChild(okBtn);

        [head, tabRow, label, input, note, row].forEach(el => box.appendChild(el));
        overlay.appendChild(box); document.body.appendChild(overlay);

        function setKind(k) {
            kind = k;
            Object.keys(tabs).forEach(x => {
                const on = x === k;
                tabs[x].style.background = on ? '#2b5394' : '#ffffff';
                tabs[x].style.color = on ? '#ffffff' : '#6b7075';
                tabs[x].style.borderColor = on ? '#2b5394' : '#e6e6e2';
            });
            // 남은 차액이 있으면 미리 채워 둔다 — 이미 적힌 금액이 있으면 거기에 더한 합계다.
            const need = (opt && opt.need) || 0;
            const prefill = (current[k] || 0) + need;
            input.value = prefill ? formatNumber(prefill) : '';
            note.textContent = current[k]
                ? (need ? `이미 적힌 ${formatNumber(current[k])}원에 남은 차액을 더한 금액입니다. 저장하면 이 금액으로 바뀝니다.` : '이미 적힌 금액입니다. 저장하면 이 금액으로 바뀌고, 0이면 삭제됩니다.')
                : (need ? `남은 차액 ${formatNumber(need)}원이 입력되어 있습니다.` : '');
            input.focus();
        }
        setKind(kind);
        setTimeout(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1)'; input.focus(); }, 10);

        function cleanup(v) {
            overlay.style.opacity = '0'; box.style.transform = 'scale(0.9)';
            setTimeout(() => { overlay.remove(); resolve(v); }, 200);
        }
        const submit = () => cleanup({ kind, amount: parseNumber(input.value) });
        cancelBtn.onclick = () => cleanup(null);
        okBtn.onclick = submit;
        input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
    });
}

// 이 차수에 모인 찬조. 0이면 아무것도 안 적는다 — 늘 '0원'이 붙어 있으면 잡음이다.
function paintDonateSum() {
    const el = document.getElementById('donateSum');
    if (!el) return;
    const round = (appData.roundMoney && appData.roundMoney[selectedMoneyRoundIdx]) || {};
    const sum = golfers.reduce((a, g) => a + (Number(round[g] && round[g].donate) || 0), 0);
    el.textContent = sum ? `찬조 합계 ${formatNumber(sum)}원` : '';
}

/* ── 정산 금액은 본인 칸만 ───────────────────────────────────────
   6차 정산 금액이 남의 손에 지워진 일이 있었다. 이제 시작·남은 금액은
   `jtfag_my_name`이 그 사람일 때만 열린다.

   이건 보안이 아니라 **실수 방지 장치**다 — jtfag_my_name은 누구나 바꿀 수 있고
   서버는 접속자를 구분하지 못한다. 무심코 남의 줄을 건드리는 걸 막는 게 목적이다.

   관리자는 `💰 정산 금액 전체 수정`으로 잠시 열 수 있다. 이 문이 없으면
   동반자 폰이 없을 때 아무도 고칠 수 없게 되어 오히려 곤란해진다. */
function myGolferName() {
    const n = localStorage.getItem('jtfag_my_name');
    return golfers.includes(n) ? n : '';
}

function canEditMoney(name) {
    return isMoneyUnlocked || name === myGolferName();
}

function moneyLockNotice(name) {
    const me = myGolferName();
    showToast(me
        ? `🔒 ${name}님 칸은 본인만 입력할 수 있습니다.`
        : `🔒 먼저 사용자 이름을 등록해 주세요.`);
}

function toggleMoneyEdit() {
    isMoneyUnlocked = !isMoneyUnlocked;
    renderMoneyTable();
    renderAdminModal();
    showToast(isMoneyUnlocked
        ? "💰 정산 금액 전체 수정을 활성화했습니다."
        : "🔒 정산 금액 수정을 본인 항목으로 제한했습니다.");
}

/* ── 내가 방금 적은 금액은 들어오는 payload에 덮이지 않는다 ───────
   "시작 금액을 적고 남은 금액을 적다 보면 금액이 사라진다"는 제보가 있었다.
   부분 저장이 없어 **언제나 행 전체가 오가기** 때문에 두 갈래로 지워진다:
   1. **내 저장의 메아리가 늦게 온다.** 시작 금액 저장(A)과 남은 금액 저장(B)을 잇따라 보내면
      A의 실시간 이벤트가 B보다 늦게 도착할 수 있다. A에는 남은 금액이 없으므로
      `appData = payload`로 갈아 끼우는 순간 방금 적은 남은 금액이 0으로 돌아간다.
   2. **남이 같은 때 저장한다.** 넷이 둘러앉아 각자 금액을 적는 정산 자리에서, 내 금액을
      아직 모르는 payload가 내 것을 덮는다. 폰이 잠겨 있던 사람은 실시간을 놓쳐 더 낡아 있다.
   그래서 내가 적은 금액을 `MONEY_GUARD_MS` 동안 들고 있다가, 들어온 payload에 그 값이 없으면
   `reapplyMyMoney()`가 다시 얹는다. 얹었으면 **한 번 더 저장해** 남의 화면에도 돌려준다 —
   내 화면에만 있고 DB에 없으면 다음 사람이 또 지운다.
   **금액은 이력이 없어 한 번 지워지면 못 되살린다**(6차 정산 금액이 그렇게 날아갔다).
   이 보호막을 빼지 말 것.
   값이 이미 같으면 아무것도 안 하므로 저장 → 메아리 → 저장으로 끝없이 돌지 않는다.
   내가 **0으로 지운 것도 기억한다** — 안 그러면 낡은 payload의 옛 금액이 되살아난다. */
const MONEY_GUARD_MS = 60000;      // 확인이 영영 안 와도 이만큼만 붙들고 있는다
const MONEY_GUARD_KEY = 'jtfag_money_guard';

/* **이 기억은 새로고침해도 살아남아야 한다.** 넷이 동시에 적으면, 먼저 적은 사람 금액이
   남의 낡은 payload에 잠깐 지워졌다가 **그 사람 폰이 되살려 놓는다.** 그런데 적자마자 앱을
   닫거나 새로고침하면 기억이 날아가 되살릴 사람이 없어진다(금액은 이력이 없어 끝이다).
   그래서 localStorage에 같이 둔다 — 다시 열면 `fetchFromSupabase()`가 읽어 온 payload에
   내 값이 없는 걸 보고 되돌려 놓는다. 1분 상한은 그대로다. */
function loadMoneyGuard() {
    try {
        const a = JSON.parse(localStorage.getItem(MONEY_GUARD_KEY) || '[]');
        const now = Date.now();
        return Array.isArray(a) ? a.filter(e => e && typeof e.at === 'number' && now - e.at < MONEY_GUARD_MS) : [];
    } catch (e) { return []; }
}
function saveMoneyGuard() {
    try {
        if (myMoneyEdits.length) localStorage.setItem(MONEY_GUARD_KEY, JSON.stringify(myMoneyEdits));
        else localStorage.removeItem(MONEY_GUARD_KEY);
    } catch (e) { /* 저장 공간이 막혀도 앱은 그대로 돌아간다 */ }
}

let myMoneyEdits = loadMoneyGuard();

function rememberMyMoney(round, name, field, value) {
    const now = Date.now();
    myMoneyEdits = myMoneyEdits.filter(e => now - e.at < MONEY_GUARD_MS
        && !(e.round === round && e.name === name && e.field === field));
    myMoneyEdits.push({ round, name, field, value, at: now });
    saveMoneyGuard();
}

/* 들어온 payload에 내가 적은 금액이 그대로 있으면 **확인된 것**이라 기억에서 지운다.
   없으면 다시 얹는다. 시간이 아니라 '확인됐는가'로 손을 떼므로, 보호가 필요 없는 값을
   붙들고 있지 않고 확인이 늦어도 지켜 준다. (그래도 영영 붙들진 않게 1분 상한을 둔다.) */
function reapplyMyMoney() {
    // 테이블 모드에서는 쓰지 않는다 — 테이블 값을 얹는 `overlayMoney()`가 그 일을 한다.
    // 여기서 payload를 또 저장하면 그게 다시 낡은 값을 퍼뜨리는 통로가 된다.
    if (typeof moneyMode !== 'undefined' && moneyMode === 'table') { myMoneyEdits = []; saveMoneyGuard(); return false; }
    const now = Date.now();
    let fixed = false;
    myMoneyEdits = myMoneyEdits.filter(e => {
        if (now - e.at >= MONEY_GUARD_MS) return false;
        if (e.round < 0 || e.round >= (appData.totalRounds || 0)) return false;   // 차수가 지워졌으면 손대지 않는다
        if (!appData.roundMoney) appData.roundMoney = [];
        if (!appData.roundMoney[e.round]) appData.roundMoney[e.round] = {};
        if (!appData.roundMoney[e.round][e.name]) appData.roundMoney[e.round][e.name] = { start: 0, end: 0 };
        const row = appData.roundMoney[e.round][e.name];
        // 값이 맞으면 확인된 것으로 보고 손을 뗀다. '맞아도 1분 내내 지키기'로 바꿔 봤는데
        // 네 폰이 서로 자기 칸을 되살리느라 4초에 저장이 83번 나갔다(multi.js payload).
        // 이 보호막은 테이블이 없을 때만 쓰는 임시 그물이다 — 진짜 해법은 money.js의 분리 저장이다.
        if ((Number(row[e.field]) || 0) === e.value) return false;
        row[e.field] = e.value; fixed = true;
        return true;
    });
    saveMoneyGuard();
    return fixed;
}

function updateMoney(name, type, value, round) {
    // 화면이 막고 있어도 여기서 한 번 더 본다 — 이 함수가 유일한 입구다.
    if (!canEditMoney(name)) { moneyLockNotice(name); renderMoneyTable(); return; }
    // 칸에 박아 둔 차수를 쓴다. 없으면(예전 호출) 지금 보고 있는 차수.
    const r = (round === undefined || round === null) ? selectedMoneyRoundIdx : Number(round);
    if (r < 0 || r >= appData.totalRounds) return;          // 그 사이 차수가 지워졌다
    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.roundMoney[r]) appData.roundMoney[r] = {};
    if (!appData.roundMoney[r][name]) appData.roundMoney[r][name] = { start: 0, end: 0 };
    const after = parseNumber(value);
    const before = Number(appData.roundMoney[r][name][type]) || 0;
    if (moneyMode === 'table') {
        // **그 칸 한 줄만 쓴다**(money.js). payload를 통째로 보내지 않으므로 남의 금액에 닿을 수 없다.
        if (after !== before) {
            saveState();
            appData.roundMoney[r][name][type] = after;
            writeMoneyCell(r, name, type, after);
            renderAll();
        }
    } else {
        rememberMyMoney(r, name, type, after);    // 테이블이 없을 때의 보호막 — 낡은 payload에 덮이지 않게
        if (after !== before) {                   // 같은 값이면 헛저장을 안 만든다
            saveState();
            appData.roundMoney[r][name][type] = after;
            syncToSupabase(appData); renderAll();
        }
    }
    // 값이 그대로여도 칸의 글자는 맞춰 둔다 — `300000`을 치면 `300,000`으로 보여야
    // '입력이 안 먹었나' 싶지 않다. 보고 있는 차수의 칸일 때만 손댄다.
    if (r === selectedMoneyRoundIdx) {
        const el = document.getElementById(`money_${type}_${name}`);
        if (el && document.activeElement !== el) {
            el.value = (type === 'donate') ? (after ? formatNumber(after) : '') : formatNumber(after);
        }
    }
    flashMoneySaved(name, type, after);           // 렌더 뒤에 — 칸이 새로 만들어졌을 수 있다
}

// ─── 타수 자동 입력 ───
// 타수는 사람이 넣지 않는다. 스코어카드를 판독해 stats.js의 ROUND_HOLES에 넣으면
// par + rel 합계가 그 차수의 그로스가 되고, 그 값이 appData.scores로 흘러들어간다.
// 핸디캡·정산·평균은 예전처럼 appData.scores를 읽으므로 아래 계산은 손대지 않아도 된다.

