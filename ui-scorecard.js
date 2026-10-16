// ◇ ui.js를 나눈 조각 — 스코어 등록(사진 판독 요청) · 홀 기록 삭제 · 해외 라운드(전반·후반 2장)
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
let selectedScorecardRound = -1;

// 본인 기기에서만 버튼을 보여 준다. 이름은 언제든 바뀔 수 있어 렌더마다 다시 판단한다.
function updateScoreRequestBtn() {
    const btn = document.getElementById('scoreRequestBtn');
    if (!btn) return;
    const isOwner = localStorage.getItem('jtfag_my_name') === SCORE_OWNER;
    btn.style.display = isOwner ? '' : 'none';
}

// 올릴 차수는 거의 항상 '방금 친 차수'다. 홀 기록이 아직 없는 마지막 차수를
// 미리 골라 둬, 차수가 몇 개든 열자마자 사진만 올리면 되게 한다.
function defaultScorecardRound() {
    for (let r = appData.totalRounds - 1; r >= 0; r--) {
        if (!hasHoleRecord(r)) return r;
    }
    return appData.totalRounds - 1;
}

async function openScoreRequestModal() {
    if (localStorage.getItem('jtfag_my_name') !== SCORE_OWNER) return;
    selectedScorecardRound = defaultScorecardRound();
    // 게스트 표시는 매번 새로 정한다. 지난번 값이 남아 있으면 엉뚱한 사람이 빠진다.
    const check = document.getElementById('scorecardHasGuest');
    if (check) check.checked = false;
    ['scorecardGuestTotal', 'scorecardGuestBirdie', 'scorecardGuestPar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    toggleGuestInput();
    // 해외 라운드 표시와 고른 사진도 매번 새로 정한다.
    const ov = document.getElementById('scorecardOverseas');
    if (ov) ov.checked = false;
    overseasFront = null; overseasBack = null;
    const ovCourse = document.getElementById('scorecardOverseasCourse');
    if (ovCourse) ovCourse.value = '';
    toggleOverseas();
    renderScoreRequestModal();
    document.getElementById('scoreRequestModal').classList.add('active');
}

function toggleGuestInput() {
    const check = document.getElementById('scorecardHasGuest');
    const box = document.getElementById('scorecardGuestBox');
    if (!check || !box) return;
    box.style.display = check.checked ? '' : 'none';
}

function closeScoreRequestModal() { document.getElementById('scoreRequestModal').classList.remove('active'); }

function selectScorecardRound(r) { selectedScorecardRound = r; renderScoreRequestModal(); paintOverseas(); }

function renderScoreRequestModal() {
    const select = document.getElementById('scoreRequestRound');
    const log = document.getElementById('scoreRequestLog');
    const pickBtn = document.getElementById('scorecardPickBtn');
    if (!select || !log || !pickBtn) return;

    // 차수가 몇 개가 되든 창 크기가 그대로인 드롭다운으로 고른다.
    // 홀 기록이 이미 있는 차수는 ✓로 표시해, 다시 올리는 건지 알 수 있게 한다.
    let optionHtml = "";
    for (let r = 0; r < appData.totalRounds; r++) {
        optionHtml += `<option value="${r}"${selectedScorecardRound === r ? ' selected' : ''}>${r + 1}차${hasHoleRecord(r) ? ' ✓ 기록 있음' : ''}</option>`;
    }
    select.innerHTML = optionHtml;
    select.value = String(selectedScorecardRound);

    pickBtn.disabled = selectedScorecardRound === -1;
    pickBtn.textContent = selectedScorecardRound === -1
        ? "먼저 차수를 선택하세요"
        : (hasHoleRecord(selectedScorecardRound)
            ? `📷 ${selectedScorecardRound + 1}차 스코어카드 재업로드`
            : `📷 ${selectedScorecardRound + 1}차 스코어카드 사진 업로드`);

    // 지울 게 있을 때만 보여 준다 — 홀 기록이 없는 차수에 뜨면 누를 이유가 없다.
    const delBtn = document.getElementById('scorecardDelBtn');
    if (delBtn) {
        const can = selectedScorecardRound !== -1 && hasHoleRecord(selectedScorecardRound);
        delBtn.style.display = can ? '' : 'none';
        if (can) delBtn.textContent = `🗑️ ${selectedScorecardRound + 1}차 홀 기록 삭제`;
    }

    // 멀리건 알림 요청은 같은 줄을 탈 뿐 스코어카드가 아니라 목록에 안 보인다(mission.js의 useMulligan).
    const list = (appData.scoreRequests || []).filter(r => r && r.action !== '멀리건').slice().reverse();
    if (list.length === 0) {
        log.innerHTML = `<div class="scorecard-log-empty">등록된 스코어카드가 없습니다.</div>`;
        return;
    }
    log.innerHTML = list.map(req => {
        const tone = req.status === '완료' ? 'ok' : (req.status === '실패' ? 'bad' : 'wait');
        const note = req.note ? `<div class="scorecard-log-note">${escapeHtml(req.note)}</div>` : "";
        return `<div class="scorecard-log-row">
            <div class="scorecard-log-head">
                <span>${req.time} · <b>${req.round}차</b></span>
                <span class="scorecard-status ${tone}">${req.status}</span>
            </div>${note}
        </div>`;
    }).join('');
}

/* scoreRequests는 MAX_SCORE_REQUESTS개까지만 둔다. 끝난 멀리건 알림 요청을 먼저 걷는다 —
   안 그러면 알림 몇 건이 스코어카드 기록을 밀어낸다. */
function pruneScoreRequests() {
    if (!Array.isArray(appData.scoreRequests)) return;
    appData.scoreRequests = appData.scoreRequests.filter(r => !(r && r.action === '멀리건' && r.status !== '대기'));
    while (appData.scoreRequests.length > MAX_SCORE_REQUESTS) appData.scoreRequests.shift();
}

/* 홀 기록 지우기 요청. 사진 판독과 **같은 줄**을 탄다 —
   `stats.js`는 저장소 파일이라 앱이 직접 못 고치고, 워크플로만 고칠 수 있기 때문이다.
   요청을 payload에 남기면 `kickScorecardWorkflow()`가 깨우고,
   `scripts/read-scorecard.js`의 `removeOne()`이 그 차수 블록을 걷어내 커밋한다.

   **이 길이 없으면 막다른 길이 된다** — 홀 기록이 있는 차수는 타수 칸이 잠겨
   관리자 메뉴로도 못 고친다. 8차 카드가 9차로 잘못 올라갔을 때 실제로 그랬다. */
async function requestHoleDelete() {
    if (selectedScorecardRound === -1) { showToast("⚠️ 차수를 먼저 선택해 주세요."); return; }
    const round = selectedScorecardRound;
    if (!hasHoleRecord(round)) { showToast(`${round + 1}차는 홀 기록이 없습니다.`); return; }

    const scores = golfers.map(g => {
        const v = appData.scores && appData.scores[g] && appData.scores[g][round];
        return `${g} ${v || '-'}타`;
    }).join(' · ');
    const okGo = await showConfirmPrompt(
        `🗑️ <b>${round + 1}차</b> 홀 기록을 삭제할까요?` +
        `<div style="font-size:0.76rem; font-weight:600; color:#cbd5e1; margin-top:10px; line-height:1.6;">` +
        `현재 기록<br>${escapeHtml(scores)}</div>` +
        `<div style="font-size:0.74rem; font-weight:600; color:#94a3b8; margin-top:10px; line-height:1.6;">` +
        `삭제하면 타수 칸 잠금이 해제되어 올바른 사진을 재업로드하거나 직접 수정할 수 있습니다.<br>` +
        `<span style="color:#fbbf24;">스코어표의 타수는 자동으로 삭제되지 않습니다. 삭제 후 직접 수정해 주세요.</span></div>`,
        "삭제");
    if (!okGo) return;

    const now = new Date();
    saveState();
    if (!appData.scoreRequests) appData.scoreRequests = [];
    appData.scoreRequests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: '삭제',                 // 이게 있으면 판독 대신 삭제로 간다
        round: round + 1,
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        by: localStorage.getItem('jtfag_my_name') || SCORE_OWNER,
        status: '대기',
        note: ''
    });
    pruneScoreRequests();

    // 사진 등록과 같은 이유로 저장이 끝난 뒤에 깨운다 — 워크플로가 DB의 '대기'를 보고 움직인다.
    const saved = await syncToSupabase(appData);
    renderScoreRequestModal();
    if (!saved) {
        showToast("⚠️ 삭제 요청 저장에 실패했습니다. 서버 연결 상태를 확인해 주세요.", 5000);
        return;
    }
    showToast(`🗑️ ${round + 1}차 삭제를 요청했습니다.`);
    if (await kickScorecardWorkflow()) {
        showToast("🚀 처리를 시작했습니다. 1~2분 뒤 새로고침하면 반영됩니다.");
    }
}

async function handleScorecardUpload(event) {
    const input = event.target;
    const file = (input.files || [])[0];
    input.value = '';
    if (!file) return;
    if (selectedScorecardRound === -1) { showToast("⚠️ 차수를 먼저 선택해 주세요."); return; }
    const round = selectedScorecardRound;

    // 게스트는 이름이 아니라 타수로 지목한다. 스코어카드가 이름을 가려 보여줘도,
    // 성이 우리와 겹쳐도 이 타수 한 줄만 정확히 빠진다.
    // 버디·파는 그 타수인 사람이 둘일 때만 쓰는 보조 열쇠라 비워둘 수 있다.
    let guestTotal = null, guestBirdies = null, guestPars = null;
    if (document.getElementById('scorecardHasGuest').checked) {
        guestTotal = parseNumber(document.getElementById('scorecardGuestTotal').value);
        if (!Number.isInteger(guestTotal) || guestTotal < 50 || guestTotal > 200) {
            showToast("⚠️ 게스트 타수를 정확히 입력해 주세요. (예: 100)");
            return;
        }
        const optional = (id, label) => {
            const raw = document.getElementById(id).value.trim();
            if (raw === '') return null;
            const n = parseNumber(raw);
            if (!Number.isInteger(n) || n < 0 || n > 18) { showToast(`⚠️ 게스트 ${label} 개수가 올바르지 않습니다. (0~18)`); return false; }
            return n;
        };
        guestBirdies = optional('scorecardGuestBirdie', '버디');
        if (guestBirdies === false) return;
        guestPars = optional('scorecardGuestPar', '파');
        if (guestPars === false) return;
    }

    showToast("⏳ 스코어카드를 업로드 중입니다...");
    let url;
    try {
        url = await uploadPhotoBlob(await compressImageToBlob(file, SCORECARD_MAX_PX, SCORECARD_QUALITY), round);
    } catch (err) {
        console.error("스코어카드 업로드 실패:", err);
        showToast("⚠️ 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
    }

    const now = new Date();
    saveState();
    if (!appData.scoreRequests) appData.scoreRequests = [];
    appData.scoreRequests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        round: round + 1,
        url: url,
        year: (Number(appData.nextRoundNo) === round + 1 && parseInt((appData.nextRoundISO || '').slice(0, 4), 10)) || missionYearNow(),
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        by: localStorage.getItem('jtfag_my_name') || SCORE_OWNER,
        guestTotal: guestTotal,
        guestBirdies: guestBirdies,
        guestPars: guestPars,
        status: '대기',
        note: ''
    });
    pruneScoreRequests();

    // 깨우기 전에 저장이 끝나야 한다. 판독 함수는 DB에 '대기' 요청이 있는지 보고
    // 움직이므로, 저장이 아직 안 닿았으면 "대기 중인 요청이 없다"며 그냥 돌아간다.
    const saved = await syncToSupabase(appData);
    renderScoreRequestModal();
    if (!saved) {
        showToast("⚠️ 스코어카드 요청 저장에 실패했습니다. 서버 연결 상태를 확인해 주세요.", 5000);
        return;
    }
    showToast(guestTotal === null
        ? `✅ ${round + 1}차 스코어카드를 등록했습니다. 판독 완료 후 타수가 자동 반영됩니다.`
        : `✅ ${round + 1}차 스코어카드를 등록했습니다. 게스트(${guestTotal}타)는 제외하고 기록됩니다.`);

    // 예약 실행을 기다리지 않고 지금 판독을 시작시킨다.
    // 실패해도 등록은 이미 끝났고 예약 실행이 그물로 남아 있으므로 조용히 넘어간다.
    if (await kickScorecardWorkflow()) {
        showToast("🚀 판독을 시작했습니다. 1~2분 뒤 새로고침하면 타수가 반영됩니다.");
    }
}

/* 해외 라운드 — 태블릿 스코어가 전반(OUT)·후반(IN) 두 화면으로 나뉘어 찍힌다.
   사진 두 장을 모두 고른 뒤 한 번에 요청 하나로 남긴다(`req.url` = 전반, `req.url2` = 후반, `req.overseas`).
   판독은 scripts/read-scorecard.js의 `processOverseas()`가 한다 — 영문 이름은 성으로 우리 넷에 붙인다. */
let overseasFront = null, overseasBack = null;

function overseasOn() {
    const el = document.getElementById('scorecardOverseas');
    return !!(el && el.checked);
}

function toggleOverseas() {
    const on = overseasOn();
    const box = document.getElementById('scorecardOverseasBox');
    if (box) box.style.display = on ? '' : 'none';
    // 해외에서는 게스트 입력(국내 카드의 합계 열쇠)과 일반 업로드 단추를 감춘다.
    ['scorecardGuestCheckRow', 'scorecardGuestBox', 'scorecardPickBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (on) el.style.display = 'none';
        else el.style.display = id === 'scorecardGuestBox' ? (document.getElementById('scorecardHasGuest').checked ? '' : 'none') : '';
    });
    paintOverseas();
}

function handleOverseasPick(which, event) {
    const input = event.target;
    const file = (input.files || [])[0];
    input.value = '';
    if (!file) return;
    if (which === 'front') overseasFront = file; else overseasBack = file;
    paintOverseas();
}

function paintOverseas() {
    const f = document.getElementById('scorecardFrontBtn');
    const b = document.getElementById('scorecardBackBtn');
    const go = document.getElementById('scorecardOverseasSubmit');
    if (!f || !b || !go) return;
    f.classList.toggle('done', !!overseasFront);
    b.classList.toggle('done', !!overseasBack);
    f.textContent = overseasFront ? '✓ 전반 선택됨 (재선택)' : '📷 전반 (OUT)';
    b.textContent = overseasBack ? '✓ 후반 선택됨 (재선택)' : '📷 후반 (IN)';
    const ready = !!(overseasFront && overseasBack) && selectedScorecardRound !== -1;
    go.disabled = !ready;
    go.textContent = ready
        ? `${selectedScorecardRound + 1}차 해외 스코어 등록`
        : (!overseasFront && !overseasBack ? '전반·후반 사진을 선택하세요'
            : (!overseasFront ? '전반 사진을 선택하세요' : '후반 사진을 선택하세요'));
}

let overseasBusy = false;
async function submitOverseasScorecard() {
    if (overseasBusy) return;
    if (selectedScorecardRound === -1) { showToast("⚠️ 차수를 먼저 선택해 주세요."); return; }
    if (!overseasFront || !overseasBack) { showToast("⚠️ 전반·후반 사진을 모두 선택해 주세요."); return; }
    const round = selectedScorecardRound;
    const course = (document.getElementById('scorecardOverseasCourse').value || '').trim().slice(0, 40);

    overseasBusy = true;
    const go = document.getElementById('scorecardOverseasSubmit');
    if (go) go.disabled = true;
    let urlFront, urlBack;
    try {
        showToast("⏳ 전반 사진을 업로드 중입니다...");
        urlFront = await uploadPhotoBlob(await compressImageToBlob(overseasFront, SCORECARD_MAX_PX, SCORECARD_QUALITY), round);
        showToast("⏳ 후반 사진을 업로드 중입니다...");
        urlBack = await uploadPhotoBlob(await compressImageToBlob(overseasBack, SCORECARD_MAX_PX, SCORECARD_QUALITY), round);
    } catch (err) {
        console.error("해외 스코어카드 업로드 실패:", err);
        showToast("⚠️ 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        overseasBusy = false; paintOverseas();
        return;
    }

    const now = new Date();
    saveState();
    if (!appData.scoreRequests) appData.scoreRequests = [];
    appData.scoreRequests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        round: round + 1,
        overseas: true,                 // 이게 있으면 url(전반) · url2(후반) 두 장을 합쳐 읽는다
        url: urlFront,
        url2: urlBack,
        course: course,
        year: (Number(appData.nextRoundNo) === round + 1 && parseInt((appData.nextRoundISO || '').slice(0, 4), 10)) || missionYearNow(),
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        by: localStorage.getItem('jtfag_my_name') || SCORE_OWNER,
        status: '대기',
        note: ''
    });
    pruneScoreRequests();

    const saved = await syncToSupabase(appData);
    overseasBusy = false;
    renderScoreRequestModal();
    if (!saved) {
        showToast("⚠️ 스코어카드 요청 저장에 실패했습니다. 서버 연결 상태를 확인해 주세요.", 5000);
        paintOverseas();
        return;
    }
    // 등록이 끝났으니 고른 사진을 비운다 — 다음 차수에 같은 사진이 또 올라가지 않게.
    overseasFront = null; overseasBack = null;
    paintOverseas();
    showToast(`✅ ${round + 1}차 해외 스코어카드를 등록했습니다. 판독 완료 후 타수가 자동 반영됩니다.`);
    if (await kickScorecardWorkflow()) {
        showToast("🚀 판독을 시작했습니다. 1~2분 뒤 새로고침하면 타수가 반영됩니다.");
    }
}

