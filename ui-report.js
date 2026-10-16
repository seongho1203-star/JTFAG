// ◇ ui.js를 나눈 조각 — 기록 창 · 개인 리포트 · 알림 설정 · 관리자 메뉴 · 분석
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
function openHistoryModal() { const modal = document.getElementById('historyModal'); if (modal) modal.classList.add('active'); }
function closeHistoryModal() { const modal = document.getElementById('historyModal'); if (modal) modal.classList.remove('active'); }

/* ── 1:1 승률 보여주기 ──────────────────────────────────────────
   통산과 골프장별이 같은 모양으로 나와야 견주기 쉽다. 그래서 그리는 것도 한 함수다. */
function winRateListHtml(rec) {
    let html = "", any = false;
    for (const opp in rec) {
        const n = rec[opp].w + rec[opp].l + rec[opp].t;
        if (!n) continue;
        any = true;
        html += `<div class="slot-roll" style="display:flex; animation-delay: 0.3s; width: 100%;"><span>vs ${opp}</span> <b style="color:#b8860b;">승률 ${Math.round((rec[opp].w / n) * 100)}%</b> <span>(${rec[opp].w}승 ${rec[opp].t}무 ${rec[opp].l}패)</span></div>`;
    }
    return any ? html : "<div style='text-align:center; color:#94a3b8;'>진행된 매치가 없습니다.</div>";
}

/* 골프장별 1:1 승률.
   1~10차는 기존 두 경기 기준을 보존한다. 1·2차는 승부가 안 나온다 — 그 골프장에 3차 이후 라운드가
   하나도 없으면 목록에 올리지 않는다. 빈 칸을 골라 놓고 '매치 없음'만 보는 건 헛걸음이다. */
let h2hCourseKey = null;

function courseWinRateOptions(name) {
    return roundsByCourse()
        .map(c => ({ ...c, rec: headToHead(name, c.rounds) }))
        .map(c => {
            const played = Object.values(c.rec).reduce((m, v) => Math.max(m, v.w + v.l + v.t), 0);
            return { ...c, played };
        })
        .filter(c => c.played > 0);
}

function renderCourseWinRate(name) {
    const box = document.getElementById('courseWinRate');
    const sel = document.getElementById('courseWinRateSelect');
    if (!box || !sel) return;

    const list = courseWinRateOptions(name);
    if (list.length === 0) {
        sel.style.display = 'none';
        box.innerHTML = "<div style='text-align:center; color:#94a3b8;'>골프장별 승률을 산출할 기록이 없습니다.</div>";
        return;
    }
    sel.style.display = '';

    // 고른 곳이 없거나 사라졌으면 라운드가 가장 많은 곳부터 보여 준다.
    if (!list.some(c => c.label.replace(/\s+/g, '') === h2hCourseKey)) {
        h2hCourseKey = list.slice().sort((a, b) => b.played - a.played)[0].label.replace(/\s+/g, '');
    }
    const cur = list.find(c => c.label.replace(/\s+/g, '') === h2hCourseKey);

    sel.innerHTML = list.map(c => {
        const key = c.label.replace(/\s+/g, '');
        return `<option value="${escapeHtml(key)}"${key === h2hCourseKey ? ' selected' : ''}>${escapeHtml(c.label)} (${c.played}경기)</option>`;
    }).join('');
    sel.value = h2hCourseKey;

    box.innerHTML = winRateListHtml(cur.rec)
        + `<div class="winrate-note">1~10차는 기존 2경기, ${THREE_GAME_HANDICAP_FROM_ROUND}차부터 직전 3경기 평균 기준입니다. 1·2차전과 산출에 필요한 기록이 없는 차수는 집계에서 제외됩니다.</div>`;
}

function selectCourseWinRate(key, name) {
    h2hCourseKey = key;
    renderCourseWinRate(name);
}

function openPersonalReport(name) {
    const ranksForSound = golferRankHistory[name] || [];
    let currentRankForSound = ranksForSound.length > 0 ? ranksForSound[ranksForSound.length - 1] : 3;
    
    if (currentRankForSound === 0 && SOUND_CONFIG[0]) {
        try {
            const audio = new Audio(SOUND_CONFIG[0]);
            audio.play().catch(e => console.log("오디오 재생 실패:", e));
        } catch(e) {}
    }

    document.getElementById('reportTitle').innerHTML = `✨ <span style="color:var(--primary-gold);">${name}</span> 명예의 전당 ✨`;
    const validScores = (appData.scores && appData.scores[name]) ? appData.scores[name].filter((s) => s !== "" && !isNaN(parseFloat(s))).map(s => parseFloat(s)) : [];
    let maxStr = "-", minStr = "-", avgStr = "-";
    
    if(validScores.length > 0) { 
        maxStr = Math.max(...validScores); 
        minStr = Math.min(...validScores); 
        avgStr = (validScores.reduce((a,b)=>a+b,0) / validScores.length).toFixed(1); 
    }
    
    const rankCounts = [0, 0, 0, 0]; (golferRankHistory[name] || []).forEach(r => rankCounts[r]++);
    const badgeHtmlWithDesc = (golferBadgesMap[name] || []).map((b, idx) => `<div class="badge-desc-item slot-roll" style="animation-delay: ${idx * 0.1}s;"><div style="flex-shrink:0;">${b.html}</div><div class="badge-desc-text">${b.desc}</div></div>`).join('');
    
    // 통산 승률. 계산은 calc.js의 headToHead() 한 곳에만 있다 —
    // 골프장별 승률이 같은 함수를 쓰므로 규칙이 어긋날 자리가 없다.
    const winRateHtml = winRateListHtml(headToHead(name, allRoundIdx()));

    const myStats = (typeof CUMULATIVE_STATS !== 'undefined') ? CUMULATIVE_STATS : { "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "김지명": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "신성호": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "박승수": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 } };

    const iE = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8343.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
    const iH = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8331.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
    const iC = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8333.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
    const iS = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8335.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;

    document.getElementById('reportContent').innerHTML = `
        <div class="report-tabs">
            <button type="button" class="report-tab active" data-tab="record" onclick="switchReportTab('record')">기록</button>
            <button type="button" class="report-tab" data-tab="analysis" onclick="switchReportTab('analysis')">분석</button>
        </div>
        <div id="reportPaneAnalysis" style="display:none;">${buildAnalysisHtml(name)}</div>
        <div id="reportPaneRecord">
        <div class="report-section"><div class="report-title">🎯 상세 타수 누적 기록</div><div class="stat-grid" style="grid-template-columns: repeat(5, 1fr);">
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">홀인원</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].holeInOne}" style="color:#dc2626; animation-delay: 0.1s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">이글</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].eagle}" style="color:#ea580c; animation-delay: 0.2s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">버디</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].birdie}" style="color:#059669; animation-delay: 0.3s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">파</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].par}" style="color:#2563eb; animation-delay: 0.4s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">양파</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].doublePar}" style="color:#475569; animation-delay: 0.5s;">0</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">🏆 획득한 뱃지 컬렉션</div><div class="report-badges-area">${badgeHtmlWithDesc ? badgeHtmlWithDesc : '<span style="color:#94a3b8; font-size:0.75rem; text-align:center; padding:10px;">아직 획득한 뱃지가 없습니다.</span>'}</div></div>
        <div class="report-section"><div class="report-title">📊 스코어 요약</div><div class="stat-grid">
            <div class="stat-box"><div class="stat-label">최저타</div><div class="stat-val slot-roll count-up" data-val="${minStr}" style="color:#2563eb; animation-delay: 0.2s;">0</div></div>
            <div class="stat-box"><div class="stat-label">평균타수</div><div class="stat-val slot-roll count-up" data-val="${avgStr}" style="color:#b8860b; animation-delay: 0.3s;">0</div></div>
            <div class="stat-box"><div class="stat-label">최고타</div><div class="stat-val slot-roll count-up" data-val="${maxStr}" style="color:#dc2626; animation-delay: 0.4s;">0</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">🎖️ 계급별 달성 횟수</div><div class="stat-grid cols-4">
            <div class="stat-box"><div class="stat-label">${iE}독수리</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[0]}" data-suffix="회" style="color:#b8860b; animation-delay: 0.1s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iH}매</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[1]}" data-suffix="회" style="color:#0ea5e9; animation-delay: 0.2s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iC}학</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[2]}" data-suffix="회" style="color:#a855f7; animation-delay: 0.3s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iS}참새</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[3]}" data-suffix="회" style="color:#64748b; animation-delay: 0.4s;">0회</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">⚔️ 1:1 통산 승률</div><div class="winrate-list">${winRateHtml}</div></div>
        <div class="report-section">
            <div class="report-title report-title-row">
                <span>🏌️ 골프장별 1:1 승률</span>
                <select class="course-wr-select" id="courseWinRateSelect"
                        onchange="selectCourseWinRate(this.value, '${escapeHtml(name)}')"></select>
            </div>
            <div class="winrate-list" id="courseWinRate"></div>
        </div>
        </div>
    `;
    renderCourseWinRate(name);
    switchReportTab('record');
    
    document.getElementById('personalReportModal').classList.add('active');

    setTimeout(() => {
        document.querySelectorAll('#personalReportModal .count-up').forEach(el => {
            const targetVal = el.getAttribute('data-val');
            if(targetVal === "-") { el.textContent = "-"; return; }
            const target = parseFloat(targetVal);
            const suffix = el.getAttribute('data-suffix') || "";
            const duration = 1200; 
            const startTime = performance.now();
            
            function updateCount(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                const current = target * ease;
                
                if (Number.isInteger(target)) {
                    el.textContent = Math.floor(current) + suffix;
                } else {
                    el.textContent = current.toFixed(1) + suffix;
                }
                
                if (progress < 1) requestAnimationFrame(updateCount);
                else el.textContent = targetVal + suffix;
            }
            requestAnimationFrame(updateCount);
        });
    }, 100);
}

// 메뉴를 열기 전에 인증한다. 인증 전에는 로그도 메뉴도 보이지 않는다.
// ─── 알림 설정 ───
function getNotifySettings() {
    const s = Object.assign({}, DEFAULT_NOTIFY_SETTINGS, appData.notifySettings || {});
    s.daysBefore = normalizeDaysBefore(s.daysBefore);
    if (s.daysBefore.length === 0) s.daysBefore = normalizeDaysBefore(DEFAULT_NOTIFY_SETTINGS.daysBefore);
    return s;
}

// 알림 설정 모달이 열려 있는 동안의 선택 상태. 저장을 눌러야 payload에 들어간다.
let notifyDaysDraft = [];

function notifyDayName(d) { return d === 0 ? '당일' : `${d}일 전`; }

function renderNotifyDayChips() {
    const box = document.getElementById('notifyDayChips');
    if (!box) return;
    box.innerHTML = NOTIFY_DAY_CHOICES.map(d =>
        `<button type="button" class="notify-day-chip${notifyDaysDraft.includes(d) ? ' on' : ''}" onclick="toggleNotifyDay(${d})">${notifyDayName(d)}</button>`
    ).join('');
}

function toggleNotifyDay(d) {
    const i = notifyDaysDraft.indexOf(d);
    if (i >= 0) notifyDaysDraft.splice(i, 1);
    else {
        if (notifyDaysDraft.length >= MAX_NOTIFY_DAYS) { showToast(`⚠️ 최대 ${MAX_NOTIFY_DAYS}개까지 선택할 수 있습니다.`); return; }
        notifyDaysDraft.push(d);
    }
    notifyDaysDraft = normalizeDaysBefore(notifyDaysDraft);
    renderNotifyDayChips();
    renderNotifyPreview();
}

function renderNotifyPreview() {
    const box = document.getElementById('notifyPreview');
    if (!box) return;
    // 사람마다 달라지는 자리표시자는 '이 기기의 나'로 미리 보여 준다.
    // 실제로는 받는 사람 각자의 이름·계급으로 바뀐다 (scripts/send-reminder.js).
    const me = localStorage.getItem('jtfag_my_name') || '';
    const myRank = (appData.currentRanks && appData.currentRanks[me]) ? `${appData.currentRanks[me]}등급` : '';
    const myTitle = me ? (myRank ? `${myRank} ${me}님` : `${me}님`) : '';
    const fill = (s, days) => String(s)
        .replace(/\{남은일수\}/g, String(days))
        .replace(/\{디데이\}/g, ddayLabel(days))
        .replace(/\{일정\}/g, appData.nextRoundDate || '(등록된 일정 없음)')
        .replace(/\{이름\}/g, me)
        .replace(/\{등급\}/g, myRank)
        .replace(/\{호칭\}/g, myTitle)
        .replace(/\s{2,}/g, ' ').trim();
    const title = document.getElementById('notifyTitle').value;
    const body = document.getElementById('notifyBody').value;

    if (notifyDaysDraft.length === 0) {
        box.innerHTML = `<div class="notify-preview-label">미리보기</div>
            <div class="notify-preview-empty">알림 시점을 1개 이상 선택해 주세요.</div>`;
        return;
    }
    // 고른 날마다 실제로 어떤 문구가 나가는지 따로 보여준다.
    // 당일에 "0일 뒤 라운드입니다"처럼 어색해지는 걸 여기서 바로 알아챌 수 있다.
    box.innerHTML = `<div class="notify-preview-label">미리보기 · ${notifyDaysDraft.length}번 발송</div>` +
        notifyDaysDraft.map(d => `<div class="notify-preview-card">
            <div class="notify-preview-when">${notifyDayName(d)}</div>
            <div class="notify-preview-title">${fill(title, d)}</div>
            <div class="notify-preview-body">${fill(body, d)}</div>
        </div>`).join('');
}

function openNotifySettings() {
    const s = getNotifySettings();
    notifyDaysDraft = s.daysBefore.slice();
    document.getElementById('notifyTitle').value = s.title;
    document.getElementById('notifyBody').value = s.body;
    ['notifyTitle', 'notifyBody'].forEach(id =>
        document.getElementById(id).oninput = renderNotifyPreview);
    renderNotifyDayChips();
    renderNotifyPreview();
    document.getElementById('notifySettingsModal').classList.add('active');
}
function closeNotifySettings() { document.getElementById('notifySettingsModal').classList.remove('active'); }

function saveNotifySettings() {
    const days = normalizeDaysBefore(notifyDaysDraft);
    const title = document.getElementById('notifyTitle').value.trim();
    const body = document.getElementById('notifyBody').value.trim();

    if (days.length === 0) { showToast("⚠️ 알림 시점을 1개 이상 선택해 주세요."); return; }
    if (!title) { showToast("⚠️ 알림 제목을 입력해 주세요."); return; }

    saveState();
    appData.notifySettings = { daysBefore: days, title: title, body: body || '{일정}' };
    syncToSupabase(appData);
    closeNotifySettings();
    renderAdminModal();
    showToast(`🔔 알림 시점을 저장했습니다. (${days.map(notifyDayName).join(' · ')})`);
}

async function openAdminModal() {
    if (!isFundUnlocked && !(await authenticateAdmin())) return;
    renderAdminModal(); renderStorageUsage();
    document.getElementById('adminModal').classList.add('active');
}
function closeAdminModal() { document.getElementById('adminModal').classList.remove('active'); }

function adminLock() {
    isFundUnlocked = false;
    isScoreUnlocked = false;
    isMoneyUnlocked = false;
    renderMoneyTable();
    renderTable();
    updateLockUI();
    closeAdminModal();
    showToast("🔒 관리자 권한을 해제했습니다.");
}

async function adminRunAction(fn) {
    await fn();
    renderAdminModal();
}

// 관리자 메뉴의 `🦅 독수리 대관식 미리보기` — 아무도 연속 중이 아닐 때도 연출을 볼 수 있게(사용자 요청 — `내가 지금 볼수있는 방법은없나`).
// 누를 때마다 3 → 4 → 5연속을 돌아가며 보여 준다. 이름은 이 기기 주인, 메달은 마지막 차수들의 실제 타수다. 아무것도 저장하지 않는다.
let eaglePreviewNext = 3;
function previewEagleCrown() {
    const n = eaglePreviewNext;
    eaglePreviewNext = n >= 5 ? 3 : n + 1;
    const me = localStorage.getItem('jtfag_my_name');
    closeAdminModal();
    celebrateEagleStreak(golfers.includes(me) ? me : golfers[0], n);
}

function renderAdminModal() {
    const status = document.getElementById('adminStatus');
    const actions = document.getElementById('adminActions');
    if (!status || !actions) return;

    status.innerHTML = `<div class="admin-state on">
            <span>🔓 관리자 권한 활성</span>
            <button type="button" class="admin-state-btn" onclick="adminLock()">잠금</button>
        </div>`;

    const legacy = countLegacyPhotos();
    let btns = `
        <button type="button" class="admin-btn" onclick="openNotifySettings()">🔔 알림 설정 <span class="admin-btn-sub">${getNotifySettings().daysBefore.map(notifyDayName).join(' · ')}</span></button>
        <button type="button" class="admin-btn" onclick="openFundLogModal()">📜 공금 수정 로그</button>
        <button type="button" class="admin-btn" onclick="openPushSubsModal()">🔔 알림 받는 기기</button>
        <button type="button" class="admin-btn" onclick="toggleScoreEdit()">${isScoreUnlocked ? '🔒 타수 수정 잠금' : '✏️ 타수 직접 수정'} <span class="admin-btn-sub">${isScoreUnlocked ? '수정 가능' : '홀 기록 없는 차수만'}</span></button>
        <button type="button" class="admin-btn" onclick="toggleMoneyEdit()">${isMoneyUnlocked ? '🔒 정산 금액 수정 잠금' : '💰 정산 금액 전체 수정'} <span class="admin-btn-sub">${isMoneyUnlocked ? '전체 수정 가능' : '기본: 본인 항목만'}</span></button>
        <button type="button" class="admin-btn" onclick="resetMissionRound()">🎯 미션 차수 초기화 <span class="admin-btn-sub">선택 차수의 미션을 다시 받기</span></button>
        <button type="button" class="admin-btn" onclick="previewEagleCrown()">🦅 독수리 대관식 미리보기 <span class="admin-btn-sub">누를 때마다 ${eaglePreviewNext}연속</span></button>
        <button type="button" class="admin-btn" onclick="resetEffectSeen()">🎬 연출 다시 보기 <span class="admin-btn-sub">이 기기의 연출 기록만 초기화</span></button>
        <button type="button" class="admin-btn" onclick="adminRunAction(changeAdminPassword)">🔑 비밀번호 변경</button>
        <button type="button" class="admin-btn danger" onclick="adminRunAction(deleteMyName)">👤 이 기기의 이름 삭제</button>`;
    if (legacy > 0) {
        btns += `<button type="button" class="admin-btn" onclick="adminRunAction(migratePhotosToStorage)">🗄️ 기존 사진 ${legacy}장 Storage로 이전</button>`;
    }
    btns += `<button type="button" class="admin-btn danger-strong" onclick="resetAllData()">🔄 전체 데이터 초기화</button>`;
    actions.innerHTML = btns;

}

function switchReportTab(tab) {
    const showRecord = (tab !== 'analysis');
    const rec = document.getElementById('reportPaneRecord');
    const ana = document.getElementById('reportPaneAnalysis');
    if (rec) rec.style.display = showRecord ? 'block' : 'none';
    if (ana) ana.style.display = showRecord ? 'none' : 'block';
    document.querySelectorAll('.report-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === (showRecord ? 'record' : 'analysis')));
    const body = document.getElementById('reportContent');
    if (body) body.scrollTop = 0;
}

// 개인 리포트 '분석' 탭. 홀 기록이 있는 차수만 ①②에 쓰이고, ③은 입력된 스코어 전체를 쓴다.
function buildAnalysisHtml(name) {
    const a = (typeof getHoleAnalysis === 'function') ? getHoleAnalysis(name) : null;
    let html = "";

    if (!a) {
        html += `<div class="report-section"><div class="report-title">🕳️ 홀별 분석</div>
            <div class="analysis-empty">홀 단위 기록이 아직 없습니다.<br>스코어카드가 등록되면 표시됩니다.</div></div>`;
    } else {
        // ① 파 종류별 강약 — 값이 낮을수록 좋다. 가장 좋은 쪽 초록, 나쁜 쪽 빨강.
        const pars = [{ k: '파3', v: a.par3 }, { k: '파4', v: a.par4 }, { k: '파5', v: a.par5 }].filter(x => x.v !== null);
        const best = Math.min(...pars.map(x => x.v)), worst = Math.max(...pars.map(x => x.v));
        // 세 값이 거의 같으면 억지로 강약을 가르지 않고 전부 '보통'으로 둔다.
        const meaningful = (worst - best) >= 0.3;
        const parCells = pars.map(x => {
            let label = '보통', color = '#475569';
            if (meaningful && x.v === best) { label = '강함'; color = '#059669'; }
            else if (meaningful && x.v === worst) { label = '약함'; color = '#dc2626'; }
            const width = worst > 0 ? Math.max(8, (x.v / worst) * 100) : 8;
            return `<div class="stat-box" style="padding:6px 4px;">
                <div class="stat-label" style="font-size:0.62rem;">${x.k}</div>
                <div class="analysis-val" style="color:${color};">${label}</div>
                <div class="analysis-bar"><span style="width:${width}%; background:${color};"></span></div></div>`;
        }).join('');
        html += `<div class="report-section"><div class="report-title">🕳️ 파 종류별 강약</div>
            <div class="stat-grid" style="grid-template-columns: repeat(${pars.length}, 1fr);">${parCells}</div>
            <div class="analysis-note">${meaningful ? '막대가 짧을수록 성적이 좋은 홀 유형입니다.' : '파 유형별 편차가 거의 없습니다.'}</div></div>`;

        // ② 전반 / 후반
        const diff = a.back - a.front;
        let comment = "전·후반 편차가 크지 않습니다.";
        if (diff >= 5) comment = `후반 스코어가 평균 ${diff}타 높습니다.`;
        else if (diff <= -5) comment = `후반 스코어가 평균 ${Math.abs(diff)}타 낮습니다.`;
        // 두 칸이 같은 함수를 쓴다. 예전에는 전반만 등호(<=)가 붙어 있어,
        // 전후반이 같은 값일 때 전반은 초록·후반은 빨강으로 갈렸다.
        const halfColor = (mine, other) => mine === other ? '#475569' : (mine < other ? '#059669' : '#dc2626');
        html += `<div class="report-section"><div class="report-title">🌗 전반 / 후반</div>
            <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr);">
                <div class="stat-box"><div class="stat-label">전반 9홀</div><div class="analysis-val" style="color:${halfColor(a.front, a.back)};">+${a.front}</div></div>
                <div class="stat-box"><div class="stat-label">후반 9홀</div><div class="analysis-val" style="color:${halfColor(a.back, a.front)};">+${a.back}</div></div>
            </div>
            <div class="analysis-note">${comment}</div></div>`;
    }

    // ③ 차수별 추이
    const scores = (appData.scores && appData.scores[name]) ? appData.scores[name] : [];
    const valid = scores.map((s, i) => ({ r: i + 1, v: parseFloat(s) })).filter(x => !isNaN(x.v) && x.v > 0);
    let trend = `<div class="analysis-empty">입력된 스코어가 없습니다.</div>`;
    if (valid.length > 0) {
        const lo = Math.min(...valid.map(x => x.v)), hi = Math.max(...valid.map(x => x.v));
        // 눈금 최소 폭을 둬서 1~2타 차이가 막대에서 과장돼 보이지 않게 한다.
        const span = Math.max(hi - lo, 8);
        // 세로 막대라 차수가 늘어도 높이는 그대로다. 막대만 얇아진다.
        const step = valid.length > 12 ? Math.ceil(valid.length / 8) : 1;
        const cols = valid.map((x, i) => {
            const isBest = (x.v === lo && valid.length > 1);
            return `<div class="trend-col" title="${x.r}차전 ${x.v}타"><span style="height:${30 + ((x.v - lo) / span) * 70}%; background:${isBest ? '#059669' : '#cbd5e1'};"></span></div>`;
        }).join('');
        const axis = valid.map((x, i) => {
            const show = (step === 1) || (i % step === 0) || (i === valid.length - 1);
            return `<span>${show ? x.r : ''}</span>`;
        }).join('');
        const last = valid[valid.length - 1];
        trend = `<div class="trend-chart">${cols}</div><div class="trend-axis">${axis}</div>
            <div class="analysis-note">최저 <b style="color:#059669;">${lo}타</b> · 최고 ${hi}타 · 최근 <b>${last.v}타</b>(${last.r}차)</div>`;
    }
    html += `<div class="report-section"><div class="report-title">📈 차수별 추이</div>${trend}
        ${a ? `<div class="analysis-note">위 분석은 홀 기록이 있는 ${a.roundCount}개 차수 기준입니다.</div>` : ''}</div>`;

    return html;
}

function closePersonalReport() { document.getElementById('personalReportModal').classList.remove('active'); }

async function resetAllData() {
    if (!(await authenticateAdmin())) return;
    if (!(await showConfirmPrompt("정말로 모든 데이터를<br>초기화할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#6b7075;'>스코어·정산·사진이 모두 사라집니다.</span>", "초기화"))) return;
    saveState(); appData = getDefaultData(); selectedMoneyRoundIdx = appData.totalRounds - 1; syncToSupabase(appData);
    closeAdminModal();
    renderAll(); showToast("🔄 모든 데이터가 초기화되었습니다."); forceTableReflow();
}

