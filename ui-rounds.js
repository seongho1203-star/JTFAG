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
function applyHoleScores() {
    refreshForFinishedScore();
    const changed = syncScoresFromHoles();
    const filled = applyRoundCourses();
    const dropped = dropRetiredFields();
    const settled = settleScheduleRound();   // 지운 차수에 남아 있던 일정을 마지막 차수로
    const seeded = typeof seedTrips === 'function' && seedTrips();   // 여행 일정(trip.js) — 처음 한 번만
    if (changed || filled || dropped || settled || seeded) syncToSupabase(appData);
}

function toggleScoreEdit() {
    isScoreUnlocked = !isScoreUnlocked;
    renderTable();
    renderAdminModal();
    showToast(isScoreUnlocked
        ? "✏️ 타수 직접 수정을 활성화했습니다. 홀 기록이 있는 차수는 제외됩니다."
        : "🔒 타수 수정을 잠갔습니다.");
}

function renderTable() {
    const headerRow = document.getElementById('headerRow'); const tbody = document.getElementById('scoreTbody');
    
    const currentInputs = tbody.querySelectorAll('.score-input');
    const expectedCount = appData.totalRounds * golfers.length;
    
    if (currentInputs.length === expectedCount && tbody.children.length === golfers.length) {
        for (let r = 0; r < appData.totalRounds; r++) {
            const cInput = document.getElementById(`course_input_${r}`);
            if (cInput && document.activeElement !== cInput) cInput.value = (appData.courses && appData.courses[r]) ? appData.courses[r] : "";
            paintSubCourse(r);
            const pBtn = document.getElementById(`photo_btn_${r}`);
            if (pBtn) pBtn.innerHTML = `📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장`;
        }
        golfers.forEach(name => {
            for (let r = 0; r < appData.totalRounds; r++) {
                const sInput = document.getElementById(`score_input_${name}_${r}`);
                if (!sInput) continue;
                if (document.activeElement !== sInput) sInput.value = (appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : "";
                const locked = isScoreCellLocked(r);
                sInput.readOnly = locked;
                sInput.classList.toggle('locked', locked);
            }
        });
        return;
    }

    let headerHtml = `<th class="sticky-col-1">이름</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        // 골프장은 사람이 여기서 치지 않는다 — 일정에서 차수를 고르면 저절로 채워진다.
        // 칸을 눌렀을 때 그 차수 일정이 열리게 해 둔다(고칠 길이 있어야 한다).
        headerHtml += `<th><div class="header-round-title">${r + 1}차</div><div class="course-slot" onclick="openScheduleForRound(${r})"><input type="text" id="course_input_${r}" class="course-input locked" readonly value="${escapeHtml((appData.courses && appData.courses[r]) || "")}" placeholder="골프장"></div><div id="photo_btn_${r}" class="photo-btn" onclick="openRoundPhotoModal(${r})">📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장</div></th>`;
    }
    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap;">- 평균</th>`;
    headerRow.innerHTML = headerHtml;
    for (let r = 0; r < appData.totalRounds; r++) paintSubCourse(r);

    tbody.innerHTML = "";
    golfers.forEach(name => {
        const tr = document.createElement('tr'); tr.setAttribute('data-name', name);
        let rowHtml = `<td class="golfer-name sticky-col-1">${name}</td>`;
        for (let r = 0; r < appData.totalRounds; r++) {
            const locked = isScoreCellLocked(r);
            rowHtml += `<td class="score-cell"><input type="text" id="score_input_${name}_${r}" inputmode="numeric" pattern="[0-9]*" class="score-input${locked ? ' locked' : ''}"${locked ? ' readonly' : ''} value="${(appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : ""}" placeholder="타수" onfocus="this.select()" onchange="updateScore('${name}', ${r}, this.value)"></td>`;
        }
        rowHtml += `<td class="avg-cell"><span class="avg-pill empty">-</span></td>`;
        tr.innerHTML = rowHtml; tbody.appendChild(tr);
    });
}

// 홈 · 통합 정산 요약 아래(사용자 요청으로 정산·스코어에서 옮겼다).
// **이 기기 주인 기준 대결표다**(사용자가 시안 다섯 중 B를 골랐다 — 아티팩트 `JTFAG 핸디캡 시안`).
// 상대 셋마다 가운데에 그 상대와의 통산 승률(`headToHead`), 오른쪽에 받는/주는 타수와 승패를 적는다.
// (처음엔 가운데가 타수 칸 막대였는데 사용자 요청으로 승률로 바꿨다.)
// 이름을 아직 안 정한 기기는 첫 사람 기준으로 보여 준다.
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
        if (title) title.textContent = `${me}님 내 목표 타수 ${avgScores[me]} · ${roundRangeText(rounds)} 평균`;
        const rec = typeof headToHead === 'function' ? headToHead(me, allRoundIdx()) : {};
        html = '';
        golfers.filter(g => g !== me).forEach(opp => {
            const diff = avgScores[me] - avgScores[opp];      // 양수면 내가 받는다
            const abs = Math.abs(diff);
            const cls = diff > 0 ? 'get' : diff < 0 ? 'give' : 'even';
            const label = diff > 0 ? `${abs}타 받음` : diff < 0 ? `${abs}타 줌` : '스크래치';
            const r = rec[opp] || { w: 0, l: 0, t: 0 };
            const n = r.w + r.l + r.t;
            const recText = n ? `${r.w}승 ${r.l}패${r.t ? ` ${r.t}무` : ''}` : '전적 없음';
            // 가운데는 그 상대와의 통산 승률 — 무승부는 반 승으로 센다.
            const pct = n ? Math.round((r.w + r.t / 2) / n * 100) : null;
            const tone = pct === null ? 'none' : pct > 50 ? 'up' : pct < 50 ? 'down' : 'flat';
            const mid = pct === null ? `<span class="vs-pct none">-</span><span class="vs-rate"></span>`
                : `<span class="vs-pct ${tone}">승률 <b>${pct}%</b></span>`
                + `<span class="vs-rate"><i class="w" style="width:${r.w / n * 100}%"></i><i class="t" style="width:${r.t / n * 100}%"></i></span>`;
            html += `<div class="match-vs" role="button" onclick="openH2HDetail(${golfers.indexOf(opp)})"><span class="vs-name">${escapeHtml(opp)}</span>`
                + `<span class="vs-mid">${mid}</span>`
                + `<span class="vs-val ${cls}">${label}<span class="vs-rec">${recText}</span></span></div>`;
        });
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
    saveState(); appData.totalRounds++;
    // 일정에서 이 차수 골프장을 미리 잡아 뒀으면 그걸 넣는다.
    if (!appData.courses) appData.courses = []; appData.courses.push(roundCourseMap()[appData.totalRounds] || "");
    if (!appData.roundPhotos) appData.roundPhotos = []; appData.roundPhotos.push([]);
    golfers.forEach(g => { if (!appData.scores[g]) appData.scores[g] = []; appData.scores[g].push(""); });
    const newRoundMoney = {}; golfers.forEach(g => newRoundMoney[g] = { start: 0, end: 0 });
    if (!appData.roundMoney) appData.roundMoney = []; appData.roundMoney.push(newRoundMoney);
    // 같은 번호의 차수를 예전에 지운 적이 있으면 테이블에 그때 금액이 남아 있다. 새 경기라 비운다.
    if (typeof clearMoneyRound === 'function') clearMoneyRound(appData.totalRounds - 1);
    selectedMoneyRoundIdx = appData.totalRounds - 1;
    syncToSupabase(appData); renderAll(); showToast(`➕ ${appData.totalRounds}차전이 추가되었습니다.`);
    setTimeout(() => { const wrapper = document.getElementById('tableWrapper'); if(wrapper) wrapper.scrollTo({ left: wrapper.scrollWidth + 1000, behavior: 'smooth' }); }, 150);
}

// 마지막 차수를 지운다. 무엇이 사라지는지 먼저 보여 주고 한 번 더 묻는다 —
// 사진이 붙은 차수를 무심코 지웠다가 되돌리기가 실시간 갱신에 밀려
// 사진이 통째로 안 보이게 된 적이 있다.
async function removeRound() {
    if (appData.totalRounds <= 2) { showToast("⚠️ 최소 2개 라운드는 유지되어야 합니다."); return; }

    const r = appData.totalRounds - 1;
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

function settleScheduleRound() {
    const next = parseInt(appData.nextRoundNo, 10);
    const last = appData.totalRounds;
    if (next !== last + 1 || !roundIsEmpty(last - 1)) return false;
    moveScheduleTo(next, last);
    return true;
}

let selectedPhotoRoundIdx = -1;
function openRoundPhotoModal(r) { selectedPhotoRoundIdx = r; document.getElementById('roundPhotoTitle').textContent = `📸 ${r + 1}차전 갤러리`; renderRoundPhotos(); document.getElementById('roundPhotoModal').classList.add('active'); }
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

