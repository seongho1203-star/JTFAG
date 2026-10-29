// ◇ ui.js를 나눈 조각 — 기록 창 · 개인 리포트 · 알림 설정 · 관리자 메뉴 · 분석
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.

/* 개인 리포트의 `내 목표 달성 기록`·`골프장별 목표 대비` 카드는 사용자 요청으로 걷어냈다(되살리지 말 것). 목표 대비 셈은 ui-rounds.js의 goalNetAt()에 남아 있다. */
const signNum = n => (n > 0 ? '+' : '') + n;

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
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">홀인원</div><div class="stat-val" style="color:#dc2626;">${myStats[name].holeInOne}</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">이글</div><div class="stat-val" style="color:#ea580c;">${myStats[name].eagle}</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">버디</div><div class="stat-val" style="color:#059669;">${myStats[name].birdie}</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">파</div><div class="stat-val" style="color:#2563eb;">${myStats[name].par}</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">양파</div><div class="stat-val" style="color:#475569;">${myStats[name].doublePar}</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">🏆 시즌 타이틀</div><div class="report-badges-area">${badgeHtmlWithDesc ? badgeHtmlWithDesc : '<span style="color:#94a3b8; font-size:0.75rem; text-align:center; padding:10px;">아직 획득한 뱃지가 없습니다.</span>'}</div></div>
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
        </div>
    `;
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
    // 관리자 메뉴는 신성호(SCORE_OWNER)만 쓴다(사용자 요청). 단추도 그에게만 보이지만 여기서 한 번 더 막는다.
    if (localStorage.getItem('jtfag_my_name') !== SCORE_OWNER) return;
    // 신성호는 비밀번호 없이 곧바로 열린다(사용자 요청). 다른 문(사진 이전 · 장부의 `관리자 인증`)은 그대로 비밀번호를 묻는다.
    if (!isFundUnlocked) { isFundUnlocked = true; updateLockUI(); }
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
    refreshFundLedger();
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
        <button type="button" class="admin-btn" onclick="openFundLedger()">📒 공금 장부</button>
        <button type="button" class="admin-btn" onclick="openPushSubsModal()">🔔 알림 받는 기기</button>
        <button type="button" class="admin-btn" onclick="openPhotoUsageModal()">📸 사진 용량 확인 <span class="admin-btn-sub">저장소 사용량</span></button>
        <button type="button" class="admin-btn" onclick="toggleScoreEdit()">${isScoreUnlocked ? '🔒 타수 수정 잠금' : '✏️ 타수 직접 수정'} <span class="admin-btn-sub">${isScoreUnlocked ? '수정 가능' : '홀 기록 없는 차수만'}</span></button>
        <button type="button" class="admin-btn" onclick="toggleMoneyEdit()">${isMoneyUnlocked ? '🔒 정산 금액 수정 잠금' : '💰 정산 금액 전체 수정'} <span class="admin-btn-sub">${isMoneyUnlocked ? '전체 수정 가능' : '기본: 본인 항목만'}</span></button>
        <button type="button" class="admin-btn" onclick="resetMissionRound()">🎯 미션 차수 초기화 <span class="admin-btn-sub">선택 차수의 미션을 다시 받기</span></button>
        <button type="button" class="admin-btn" onclick="restoreMissionRound()">↩️ 미션 차수 초기화 취소 <span class="admin-btn-sub">잘못 초기화한 차수 되살리기</span></button>
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

// 개인 리포트 '분석' 탭(사용자가 시안을 고른 모양 — 아티팩트 `분석 탭 시안`).
// ① 최근 5경기 평균 큰 숫자 + 꺾은선(목표 타수 점선) ② 베스트 스코어 카드(라이프/최근 5경기) + `스코어카드 보기` ③ 파 종류별 강약.
// **전반/후반 카드는 사용자 요청으로 뺐다 — 되살리지 말 것.** 홀 기록이 있는 차수만 ②의 개수·③에 쓰이고, 꺾은선은 입력된 스코어 전체를 쓴다.
let analysisBestScope = 'life';

function analysisScores(name) {
    const sc = (appData.scores && appData.scores[name]) ? appData.scores[name] : [];
    return sc.map((s, i) => ({ r: i, v: parseFloat(s) })).filter(x => Number.isFinite(x.v) && x.v > 0);
}

// 최근 경기 꺾은선. 점마다 타수를 적고 마지막 점에 둥근 강조를 둔다. 목표 타수는 점선이다.
function analysisChartSvg(games, target) {
    const W = 340, X0 = 30, X1 = 310, YT = 24, YB = 118;
    const vals = games.map(g => g.v).concat(target ? [target] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (hi - lo < 6) { const mid = (hi + lo) / 2; lo = mid - 3; hi = mid + 3; }
    const y = v => YB - (v - lo) / (hi - lo) * (YB - YT);
    const n = games.length;
    const xs = games.map((g, i) => n === 1 ? (X0 + X1) / 2 : X0 + i * (X1 - X0) / (n - 1));
    const pts = games.map((g, i) => `${xs[i].toFixed(1)},${y(g.v).toFixed(1)}`).join(' ');
    const last = n - 1;
    let svg = `<svg class="an-chart" viewBox="0 0 ${W} 150" role="img" aria-label="최근 ${n}경기 타수 꺾은선 그래프">`;
    [YT + 8, (YT + YB) / 2, YB].forEach(gy => { svg += `<line x1="16" x2="324" y1="${gy}" y2="${gy}" stroke="#e5e9f0" stroke-width="1"/>`; });
    if (target) svg += `<line x1="16" x2="324" y1="${y(target).toFixed(1)}" y2="${y(target).toFixed(1)}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 4"/>`;
    if (n > 1) svg += `<polyline points="${pts}" fill="none" stroke="#2b5394" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    games.forEach((g, i) => {
        const cy = y(g.v);
        if (i === last) svg += `<circle cx="${xs[i].toFixed(1)}" cy="${cy.toFixed(1)}" r="11" fill="#2b5394" opacity=".15"/><circle cx="${xs[i].toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="#2b5394" stroke="#fff" stroke-width="2"/>`;
        else svg += `<circle cx="${xs[i].toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#fff" stroke="#2b5394" stroke-width="2"/>`;
        // 값 글자는 점 위에 둔다. 위쪽이 모자라면(맨 위 점) 아래에 둔다.
        const ty = cy - 11 < 12 ? cy + 20 : cy - 11;
        svg += `<text class="an-val${i === last ? ' sel' : ''}" x="${xs[i].toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${g.v}</text>`;
        svg += `<text class="an-ax" x="${xs[i].toFixed(1)}" y="144" text-anchor="middle">${g.r + 1}차</text>`;
    });
    return svg + '</svg>';
}

function analysisDateText(r) {
    const d = (appData.roundDates || {})[r + 1] || (typeof ROUND_HOLES !== 'undefined' && (ROUND_HOLES[String(r + 1)] || {}).date) || '';
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return '';
    const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
    return `${m[1]}.${m[2]}.${m[3]} (${wd})`;
}

function analysisBestCard(name, all, recent) {
    const pool = analysisBestScope === 'recent' ? recent : all;
    // 같은 타수면 가장 최근 경기를 보여 준다.
    const best = pool.reduce((m, g) => (g.v <= m.v ? g : m), pool[0]);
    const r = best.r;
    const holes = (typeof badgeHoles === 'function') ? badgeHoles(name, r) : null;
    let bd = 0, pr = 0;
    if (holes) holes.rel.forEach(x => { if (x <= -1) bd++; else if (x === 0) pr++; });
    const course = (appData.courses && appData.courses[r]) || '';
    const sub = typeof subCourseOf === 'function' ? subCourseOf(r) : '';
    const place = (course ? escapeHtml(course) : '골프장 미정') + (sub ? ` <i>${escapeHtml(sub)}</i>` : '');
    const dateTxt = analysisDateText(r);
    // 그 골프장의 스탬프(스탬프 탭의 도장과 같은 그림). 마크가 없는 곳은 이니셜이 든다. 골프장 이름이 없는 차수는 그림을 뺀다.
    let seal = '';
    if (typeof passportSealHtml === 'function' && typeof passportData === 'function') {
        const cname = passportCourse(r + 1), key = cname ? passportClubKey(cname) : '';
        if (key) {
            const g = passportData().groups.find(x => x.key === key) || { key, name: cname, country: 'KR', visits: [{ round: r + 1, date: '' }] };
            const mk = passportMark(g.key);
            seal = `<div class="an-seal" style="color:${mk ? mk.ink : '#667b70'}">${passportSealHtml(g, 'anSeal')}</div>`;
        }
    }
    const tiles = holes ? `<div class="an-tiles">
        <div class="an-tile"><span class="an-ic">${AN_ICON.bird}</span><div><div class="an-k">버디 이상</div><div class="an-v">${bd}<small> 개</small></div></div></div>
        <div class="an-tile"><span class="an-ic">${AN_ICON.flag}</span><div><div class="an-k">파</div><div class="an-v">${pr}<small> 개</small></div></div></div></div>` : '';
    const cta = holes ? `<button type="button" class="an-cta" onclick="openMyScorecard(${r}, '${escapeHtml(name)}', true)">스코어카드 보기</button>` : '';
    const opt = (v, t) => `<option value="${v}"${analysisBestScope === v ? ' selected' : ''}>${t}</option>`;
    // 오른쪽 한 칸에 선택 알약과 스탬프를 세로로 쌓고 가운데 맞춘다(사용자 요청 — 스탬프를 `라이프 베스트` 칸 기준 중앙정렬).
    return `<div class="an-card">
        <div class="an-top"><div class="an-top-l"><h3>베스트 스코어</h3>
            <div class="an-best-l"><div class="an-sc">${best.v}<small>타</small></div>
            <div class="an-meta"><b>${place}</b><br>${r + 1}차${dateTxt ? ' · ' + dateTxt : ''}</div></div></div>
            <div class="an-top-r"><select class="an-pill" aria-label="베스트 기준" onchange="setAnalysisBestScope(this.value, '${escapeHtml(name)}')">${opt('life', '라이프 베스트')}${opt('recent', '최근 5경기 베스트')}</select>${seal}</div></div>
        ${tiles}${cta}</div>`;
}

const AN_ICON = {
    bird: '<svg viewBox="0 0 24 24" fill="none" stroke="#2b5394" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="#2b5394" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M12 4l7 3-7 3"/></svg>'
};

function setAnalysisBestScope(scope, name) {
    analysisBestScope = scope === 'recent' ? 'recent' : 'life';
    const pane = document.getElementById('reportPaneAnalysis');
    if (pane) pane.innerHTML = buildAnalysisHtml(name);
}

function buildAnalysisHtml(name) {
    const all = analysisScores(name);
    if (!all.length) {
        return `<div class="an-card"><div class="analysis-empty">입력된 스코어가 없습니다.<br>스코어카드가 등록되면 표시됩니다.</div></div>`;
    }
    const recent = all.slice(-5);
    const mean = Math.round(recent.reduce((t, g) => t + g.v, 0) / recent.length * 10) / 10;
    // 목표 대비·목표선은 직전 5경기가 있는 경기(6차부터)에서만 나온다.
    const nets = recent.map(g => goalNetAt(name, g.r)).filter(Boolean);
    const lastNet = nets.length ? nets[nets.length - 1] : null;
    const delta = nets.length ? Math.round(nets.reduce((t, g) => t + g.net, 0) / nets.length * 10) / 10 : null;
    const pill = delta === null ? '' : `<span class="an-delta ${delta <= 0 ? 'ok' : 'miss'}">목표 대비 ${typeof signNum === 'function' ? signNum(delta) : delta}</span>`;
    const hero = `<div class="an-hero">
        <div class="an-lbl">최근 ${recent.length}경기 평균</div>
        <div class="an-avg"><b>${mean}</b><span>타</span>${pill}</div>
        ${analysisChartSvg(recent, lastNet ? lastNet.target : null)}
        <div class="an-legend"><span><i></i>내 타수</span>${lastNet ? `<span><i class="t"></i>목표 ${lastNet.target}</span>` : ''}</div></div>`;

    let html = hero + analysisBestCard(name, all, recent);

    // 파 종류별 강약 — 값이 낮을수록 좋다. 가장 좋은 쪽 초록, 나쁜 쪽 빨강.
    const a = (typeof getHoleAnalysis === 'function') ? getHoleAnalysis(name) : null;
    if (!a) {
        html += `<div class="an-card"><h3>파 종류별 강약</h3><div class="analysis-empty">홀 단위 기록이 아직 없습니다.<br>스코어카드가 등록되면 표시됩니다.</div></div>`;
    } else {
        const pars = [{ k: '파3', v: a.par3 }, { k: '파4', v: a.par4 }, { k: '파5', v: a.par5 }].filter(x => x.v !== null);
        const best = Math.min(...pars.map(x => x.v)), worst = Math.max(...pars.map(x => x.v));
        // 세 값이 거의 같으면 억지로 강약을 가르지 않고 전부 '보통'으로 둔다.
        const meaningful = (worst - best) >= 0.3;
        const rows = pars.map(x => {
            let label = '보통', color = '#64748b';
            if (meaningful && x.v === best) { label = '강함'; color = '#059669'; }
            else if (meaningful && x.v === worst) { label = '약함'; color = '#dc2626'; }
            const width = worst > 0 ? Math.max(8, (x.v / worst) * 100) : 8;
            return `<div class="an-row"><span class="an-t">${x.k}</span><div class="an-track"><span style="width:${width}%; background:${color};"></span></div><span class="an-s" style="color:${color};">${label}</span></div>`;
        }).join('');
        html += `<div class="an-card"><h3>파 종류별 강약</h3><div class="an-bars">${rows}</div>
            <div class="analysis-note">${meaningful ? '막대가 짧을수록 성적이 좋은 홀 유형입니다.' : '파 유형별 편차가 거의 없습니다.'}</div>
            <div class="analysis-note">홀 기록이 있는 ${a.roundCount}개 차수 기준입니다.</div></div>`;
    }
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


// JTFAG 회칙 — 머리말의 책 단추가 연다. 글은 index.html의 #rulesModal이 원본이다(읽기만 한다 · 저장 없음).
function openRulesModal() {
    const m = document.getElementById('rulesModal');
    if (!m) return;
    m.classList.add('active');
    const body = m.querySelector('.rules-body');
    if (body) body.scrollTop = 0;
}
function closeRulesModal() { const m = document.getElementById('rulesModal'); if (m) m.classList.remove('active'); }


/* ── 공금 장부 ─────────────────────────────────────────────────────────────
   홈의 공금 잔액 칸을 누르면 열린다(사용자 요청 — 공금 부분을 장부처럼 보게). 예전에는 그 칸이 곧바로 비밀번호를 물었다.
   **보는 것은 누구나, 적립·사용·취소는 관리자 인증(`isFundUnlocked`) 뒤에만이다.**
   값은 예전 그대로 `payload.clubFund`(잔액)와 `payload.fundLogs`(기록)다 — 새 필드는 둘뿐이고 옛 기록은 그대로 읽힌다:
     void: {time, name, eff}  취소 처리한 기록. **지우지 않고 남기며** 그 금액(eff)만큼 잔액을 되돌린다(복구하면 다시 반영). eff 0은 잔액에 영향이 없던 중복 기록이다.
   ts:   기록한 시각(ms) — 방금 같은 금액을 또 넣는지 `editClubFund()`가 본다. 예전 기록에는 없다.
     fix:  true          잔액을 직접 정정한 기록(`직접` 모드) — 장부에 `정정`으로 따로 보인다.
     kind: '그늘집' …    입력창에서 고른 항목(2단계). 내역이 비어 있으면 장부에 항목이 대신 보인다. 안 고른 옛 기록에는 없다.
   **거래 뒤의 잔액은 저장하지 않고 지금 잔액에서 거꾸로 셈한다**(가장 최근 유효 기록 뒤 = clubFund). 기록이 중간에
   잘렸거나 사슬이 어긋난 예전 자료여도 맨 위 잔액이 늘 맞고, 취소·복구를 해도 줄마다 따로 고칠 것이 없다.
   이번 달 적립·사용에는 취소한 기록과 정정을 뺀다. 50건 제한은 없앴다(상한 500 — `editClubFund()`). */
let fundLedgerFilter = 'all';
let fundView = 'list', fundStatMonth = 'all';   // 장부 보기: 내역 / 통계(3단계)

/* 장부 3단계 — 월별·항목 통계(사용자 요청). 저장하지 않고 fundLogs에서 매번 셈한다.
   취소한 기록과 정정(fix)은 뺀다. 월은 기록 시각(`10/18 19:02`)의 앞 숫자라 연도는 모른다.
   항목(kind)은 2단계 이후 기록에만 있어, 없는 옛 기록은 내역 글에서 낱말로 짐작한다(`fundKindGuess` — 화면에서만, 저장 안 함).
   짐작이 틀려도 합계에는 영향이 없다 — 어느 항목 줄에 들어가느냐만 달라진다. */
function fundKindGuess(l) {
    const m = String(l.memo || '').replace(/\s/g, '');
    if (fundDelta(l) > 0) {
        if (/회비/.test(m)) return '회비';
        if (/타수/.test(m)) return '타수정산';
        if (/계급/.test(m)) return '계급정산';
        if (/벌금/.test(m)) return '벌금';
        if (/찬조/.test(m)) return '찬조';
        return '기타';
    }
    if (/간식|음료|편의점|닭강정|김밥|깐풍기|과자/.test(m)) return '간식';
    if (/점심|저녁|식당|식사|돈까스|회식/.test(m)) return '식사';
    if (/예약금|카트/.test(m)) return '예약금·카트비';
    if (/여행/.test(m)) return '여행 경비';
    if (/톨비|기름|교통|주유/.test(m)) return '교통비';
    return '기타';
}
const fundKindOf = (l) => l.kind || fundKindGuess(l);
function fundStats(logs) {
    const months = [], byM = {};
    logs.forEach(l => {
        if (l.void || l.fix) return;
        const m = parseInt(String(l.time || '').split('/')[0], 10) || 0;
        if (!byM[m]) { byM[m] = { m, inn: 0, out: 0, inK: {}, outK: {} }; months.push(m); }
        const d = fundDelta(l), k = fundKindOf(l), b = byM[m];
        if (d > 0) { b.inn += d; b.inK[k] = (b.inK[k] || 0) + d; }
        else if (d < 0) { b.out += -d; b.outK[k] = (b.outK[k] || 0) + -d; }
    });
    return { months, byM };
}
function fundStatsHtml(logs) {
    const { months, byM } = fundStats(logs);
    if (!months.length) return '<div class="fl-empty">통계를 낼 내역이 없습니다.</div>';
    const sel = fundStatMonth !== 'all' && byM[fundStatMonth] ? +fundStatMonth : 'all';
    const pick = sel === 'all' ? months : [sel];
    const sum = { inn: 0, out: 0, inK: {}, outK: {} };
    pick.forEach(m => { const b = byM[m]; sum.inn += b.inn; sum.out += b.out;
        Object.keys(b.inK).forEach(k => sum.inK[k] = (sum.inK[k] || 0) + b.inK[k]);
        Object.keys(b.outK).forEach(k => sum.outK[k] = (sum.outK[k] || 0) + b.outK[k]); });
    const net = sum.inn - sum.out;
    const bars = (obj, total, cls) => {
        const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
        if (!keys.length) return '<div class="fl-st-none">내역 없음</div>';
        return keys.map(k => `<div class="fl-bar"><div class="fl-bar-h"><span>${escapeHtml(k)}</span><b>${formatNumber(obj[k])}<i>${total ? Math.round(obj[k] / total * 100) : 0}%</i></b></div><div class="fl-bar-t"><div class="${cls}" style="width:${total ? Math.max(2, obj[k] / total * 100) : 0}%"></div></div></div>`).join('');
    };
    const maxM = Math.max(1, ...months.map(m => Math.max(byM[m].inn, byM[m].out)));
    const monthRows = sel === 'all' ? `<div class="fl-st-card"><div class="fl-st-h">월별 적립 · 사용</div>${months.map(m => `<div class="fl-mrow"><div class="fl-mrow-n">${m ? m + '월' : '기록'}</div><div class="fl-mrow-b"><div class="fl-bar-t"><div class="in" style="width:${byM[m].inn / maxM * 100}%"></div></div><div class="fl-bar-t"><div class="out" style="width:${byM[m].out / maxM * 100}%"></div></div></div><div class="fl-mrow-v"><span class="in">+${formatNumber(byM[m].inn)}</span><span class="out">−${formatNumber(byM[m].out)}</span></div></div>`).join('')}</div>` : '';
    const chip = (k, label) => `<button type="button" class="fl-chip${String(fundStatMonth) === String(k) || (k === 'all' && sel === 'all') ? ' sel' : ''}" data-fl="statMonth" data-k="${k}">${label}</button>`;
    return `<div class="fl-chips fl-mchips">${chip('all', '전체')}${months.map(m => chip(m, (m || '기록') + (m ? '월' : ''))).join('')}</div>
        <div class="fl-st-sum"><div><small>적립</small><b class="in">+${formatNumber(sum.inn)}</b></div><div><small>사용</small><b class="out">−${formatNumber(sum.out)}</b></div><div><small>순증감</small><b class="${net >= 0 ? 'in' : 'out'}">${net >= 0 ? '+' : '−'}${formatNumber(Math.abs(net))}</b></div></div>
        ${monthRows}
        <div class="fl-st-card"><div class="fl-st-h">사용 항목별</div>${bars(sum.outK, sum.out, 'out')}</div>
        <div class="fl-st-card"><div class="fl-st-h">적립 항목별</div>${bars(sum.inK, sum.inn, 'in')}</div>
        <div class="fl-foot">취소한 기록·정정은 뺀 값입니다 · 항목을 안 고른 예전 기록은 내역 글로 짐작해 나눴습니다</div>`;
}
const fundDelta = (l) => (l.after || 0) - (l.before || 0);
function fundNowLabel() {
    const n = new Date();
    return `${n.getMonth() + 1}/${n.getDate()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}
// 창이 떠 있는 사이 남의 저장이 들어오면 appData가 통째로 바뀐다 — 확인 뒤에 같은 기록을 다시 찾아 처리한다.
function findFundLogAt(log) {
    return (appData.fundLogs || []).findIndex(l => l.time === log.time && l.name === log.name && l.before === log.before && l.after === log.after);
}
function openFundLedger() {
    const m = document.getElementById('fundLedgerModal'); if (!m) return;
    renderFundLedger();
    m.classList.add('active');
    const sc = document.getElementById('fundLedgerScroll'); if (sc) sc.scrollTop = 0;
}
function closeFundLedger() { const m = document.getElementById('fundLedgerModal'); if (m) m.classList.remove('active'); }
function refreshFundLedger() {
    const m = document.getElementById('fundLedgerModal');
    if (m && m.classList.contains('active')) renderFundLedger();
}

function renderFundLedger() {
    const body = document.getElementById('fundLedgerBody'); if (!body) return;
    const logs = appData.fundLogs || [];
    const cur = appData.clubFund || 0;
    const admin = isFundAdmin() || isFundUnlocked;   // 총무는 곧바로, 그 밖의 사람은 비밀번호로 인증한 뒤
    const thisMonth = new Date().getMonth() + 1;
    const monthOf = (l) => parseInt(String(l.time || '').split('/')[0], 10) || 0;

    // 거래 뒤 잔액: 가장 최근 유효 기록 뒤가 지금 잔액이고, 거꾸로 거래 금액을 뺀다.
    const balAfter = [];
    let bal = cur;
    for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].void) { balAfter[i] = null; continue; }
        balAfter[i] = bal; bal -= fundDelta(logs[i]);
    }
    let inM = 0, outM = 0, voidN = 0;
    logs.forEach(l => {
        if (l.void) { voidN++; return; }
        if (l.fix || monthOf(l) !== thisMonth) return;
        const d = fundDelta(l);
        if (d > 0) inM += d; else outM += -d;
    });

    const shown = [];
    for (let i = logs.length - 1; i >= 0; i--) {
        const d = fundDelta(logs[i]);
        if (fundLedgerFilter === 'in' && !(d > 0 && !logs[i].fix)) continue;
        if (fundLedgerFilter === 'out' && !(d < 0 && !logs[i].fix)) continue;
        shown.push(i);
    }
    let lastMonth = -1;
    const rows = shown.map(i => {
        const l = logs[i], d = fundDelta(l), plus = d > 0;
        const m = monthOf(l);
        const head = m !== lastMonth ? `<div class="fl-month">${m ? m + '월' : '기록'}</div>` : '';
        lastMonth = m;
        const kind = l.fix ? '<span class="fl-tag fix">정정</span>' : `<span class="fl-tag ${plus ? 'in' : 'out'}">${plus ? '적립' : '사용'}</span>`;
        const voidTag = l.void ? '<span class="fl-tag void">취소됨</span>' : '';
        const memo = escapeHtml(l.memo || l.kind || (l.fix ? '잔액 정정' : (plus ? '적립' : '사용')));
        const voidInfo = l.void ? ` · ${escapeHtml(l.void.time || '')} ${escapeHtml(l.void.name || '')} 취소` : '';
        let ctl = '';
        if (admin) {
            ctl = l.void
                ? `<button type="button" data-fl="restore" data-i="${i}">복구</button>`
                : `<button type="button" data-fl="memo" data-i="${i}">내역 수정</button><button type="button" data-fl="void" data-i="${i}">취소</button>`;
            ctl = `<div class="fl-ctl">${ctl}</div>`;
        }
        return `${head}<div class="fl-row${l.void ? ' void' : ''}">
            <div class="fl-what">${kind}${voidTag}<span class="fl-memo">${memo}</span></div>
            <div class="fl-amt ${plus ? 'in' : 'out'}">${plus ? '+' : '−'}${formatNumber(Math.abs(d))}</div>
            <div class="fl-sub">${escapeHtml(String(l.time || ''))} · ${escapeHtml(l.name || '')}${voidInfo}</div>
            <div class="fl-bal">${l.void ? '' : '잔액 ' + formatNumber(balAfter[i])}</div>${ctl}</div>`;
    }).join('');

    const chip = (key, label) => `<button type="button" class="fl-chip${fundLedgerFilter === key ? ' sel' : ''}" data-fl="filter" data-k="${key}">${label}</button>`;
    const listHtml = logs.length === 0 ? '<div class="fl-empty">기록된 내역이 없습니다.</div>'
        : (shown.length ? `<div class="fl-list">${rows}</div>` : '<div class="fl-empty">해당하는 내역이 없습니다.</div>');
    const html = `
        <div class="fl-top">
            ${fundCalcOpen
                ? `<div class="fl-card mini"><div class="fl-mini-bal"><small>공금 잔액</small><b>${formatNumber(cur)}</b></div>${admin
                    ? `<div class="fl-acts mini"><button type="button" class="a-in" data-fl="add">+ 적립</button><button type="button" class="a-out" data-fl="use">− 사용</button><button type="button" class="a-fix" data-fl="fix">정정</button></div>`
                    : `<button type="button" class="fl-unlock mini" data-fl="unlock">🔒 인증</button>`}</div>`
                : `<div class="fl-card">
                <div class="fl-lockrow"><small>현재 공금 잔액</small><span class="fl-lock${admin ? ' open' : ''}">${admin ? '관리자 인증됨' : '보기 전용'}</span></div>
                <div class="fl-big">${formatNumber(cur)}<span>원</span></div>
                <div class="fl-month2"><div><small>${thisMonth}월 적립</small><b class="in">+${formatNumber(inM)}</b></div><div><small>${thisMonth}월 사용</small><b class="out">${outM ? '−' : ''}${formatNumber(outM)}</b></div></div>
                ${admin
                    ? `<div class="fl-acts"><button type="button" class="a-in" data-fl="add">+ 적립</button><button type="button" class="a-out" data-fl="use">− 사용</button><button type="button" class="a-fix" data-fl="fix">정정</button></div>`
                    : `<button type="button" class="fl-unlock" data-fl="unlock">🔒 관리자 인증 (적립 · 사용 입력)</button>`}
            </div>`}
            <div class="fl-calc${fundCalcOpen ? ' open' : ''}">
                <button type="button" class="fl-calc-head" data-fl="calcToggle" aria-expanded="${fundCalcOpen}">🧮 계산기 <span>${fundCalcOpen ? '접기 ▴' : '펼치기 ▾'}</span></button>
                ${fundCalcOpen ? `<div class="fl-calc-body">
                    <div class="fl-calc-expr" id="flCalcExpr"> </div>
                    <div class="fl-calc-res" id="flCalcRes">= 0</div>
                    <div class="fl-keys">${['7','8','9','÷','4','5','6','×','1','2','3','−','0','00','⌫','+'].map(k =>
                        `<button type="button" class="${'+−×÷'.includes(k) ? 'op' : ''}" data-fl="ck" data-k="${k}">${k}</button>`).join('')}</div>
                    <div class="fl-calc-foot${admin ? '' : ' solo'}"><button type="button" data-fl="ck" data-k="C">지우기</button><button type="button" class="eq" data-fl="ck" data-k="=">=</button>${admin
                        ? `<button type="button" class="use" data-fl="calcTo" data-m="use" id="flCalcUse">사용 입력</button><button type="button" class="add" data-fl="calcTo" data-m="add" id="flCalcAdd">적립 입력</button>`
                        : ''}</div>
                </div>` : ''}
            </div>
            <div class="fl-ctrl"><div class="fl-views"><button type="button" class="${fundView === 'list' ? 'sel' : ''}" data-fl="view" data-k="list">내역</button><button type="button" class="${fundView === 'stats' ? 'sel' : ''}" data-fl="view" data-k="stats">통계</button></div>
            ${fundView === 'list' ? `<div class="fl-chips">${chip('all', '전체')}${chip('in', '적립')}${chip('out', '사용')}</div>` : ''}</div>
        </div>
        <div class="fl-scroll" id="fundLedgerScroll">${fundView === 'stats' ? fundStatsHtml(logs) : `${listHtml}
            <div class="fl-foot">기록 ${logs.length}건${voidN ? ` · 취소 ${voidN}건` : ''} · 취소한 기록도 남아 있습니다</div>`}
        </div>`;
    // 목록을 보는 동안 남의 저장으로 다시 그려져도 굴려 둔 자리를 안 잃는다.
    const old = document.getElementById('fundLedgerScroll');
    const keep = old ? old.scrollTop : 0;
    body.innerHTML = html;
    const sc = document.getElementById('fundLedgerScroll'); if (sc) sc.scrollTop = keep;
    fundCalcPaint();
}

/* 장부의 계산기(사용자 요청 — 사용 내역 여러 개를 보면서 계산하려고 장부 화면에 둔다).
   위(잔액·계산기·칩)는 붙박이고 목록만 굴러간다. 식은 모듈 값이라 장부가 다시 그려져도 남는다.
   결과가 0보다 크면 관리자는 `사용으로 입력`/`적립으로 입력`으로 그 금액을 입력 창에 미리 채워 열 수 있다. */
let fundCalcOpen = false, fundCalcExpr = [];
const fundIsOp = (x) => x === '+' || x === '−' || x === '×' || x === '÷';
function fundCalcPaint() {
    const ex = document.getElementById('flCalcExpr'), rs = document.getElementById('flCalcRes');
    if (!ex || !rs) return;
    const res = fundCalcEval(fundCalcExpr);
    ex.textContent = fundCalcExpr.map(x => fundIsOp(x) ? ` ${x} ` : formatNumber(Number(x))).join('').trim() || ' ';
    rs.textContent = res === null ? '= 0' : '= ' + formatNumber(res);
    ['flCalcUse', 'flCalcAdd'].forEach(id => { const b = document.getElementById(id); if (b) { b.disabled = !(res > 0); b.style.opacity = res > 0 ? '1' : '0.45'; } });
}
function fundCalcKey(k) {
    const e = fundCalcExpr, last = e[e.length - 1];
    if (k === 'C') fundCalcExpr = [];
    else if (k === '=') { const res = fundCalcEval(e); if (res !== null) fundCalcExpr = [String(Math.max(0, res))]; }   // 식을 결과 하나로 접는다 — 이어서 계산할 수 있다
    else if (k === '⌫') { if (last !== undefined) { if (fundIsOp(last) || last.length <= 1) e.pop(); else e[e.length - 1] = last.slice(0, -1); } }
    else if (fundIsOp(k)) { if (!e.length) return fundCalcPaint(); if (fundIsOp(last)) e[e.length - 1] = k; else e.push(k); }
    else {   // 숫자 · 00
        if (last === undefined || fundIsOp(last)) e.push(k === '00' ? '0' : k);
        else if (last === '0') e[e.length - 1] = k === '00' ? '0' : k;
        else if (last.length + k.length <= 12) e[e.length - 1] = last + k;
    }
    fundCalcPaint();
}

async function fundLedgerClick(ev) {
    const t = ev.target.closest('[data-fl]'); if (!t) return;
    const act = t.dataset.fl, i = +t.dataset.i;
    if (act === 'filter') { fundLedgerFilter = t.dataset.k; renderFundLedger(); }
    else if (act === 'view') { fundView = t.dataset.k; renderFundLedger(); const sc = document.getElementById('fundLedgerScroll'); if (sc) sc.scrollTop = 0; }
    else if (act === 'statMonth') { fundStatMonth = t.dataset.k; renderFundLedger(); }
    else if (act === 'calcToggle') { fundCalcOpen = !fundCalcOpen; renderFundLedger(); }
    else if (act === 'ck') fundCalcKey(t.dataset.k);
    else if (act === 'calcTo') {
        const res = fundCalcEval(fundCalcExpr); if (!(res > 0)) return;
        await editClubFund(t.dataset.m, res);
    }
    else if (act === 'unlock') { if (await authenticateAdmin()) renderFundLedger(); }
    else if (act === 'add' || act === 'use') { await editClubFund(act); }
    else if (act === 'fix') { await editClubFund('direct'); }
    else if (act === 'void') await voidFundLog(i);
    else if (act === 'restore') await restoreFundLog(i);
    else if (act === 'memo') await editFundLedgerMemo(i);
}

async function voidFundLog(i) {
    if (!(await authorizeFund())) return;
    const log = (appData.fundLogs || [])[i];
    if (!log || log.void) return;
    const d = fundDelta(log), cur = appData.clubFund || 0;
    const ok = await showConfirmPrompt(
        `이 거래를 취소할까요?<br><span style="font-size:0.78rem; color:#6b7075;">${escapeHtml(log.time || '')} · ${escapeHtml(log.name || '')} · ${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d))}원${log.memo ? ' · ' + escapeHtml(log.memo) : ''}</span><br><span style="font-size:0.78rem; color:#c0392b;">공금 잔액 ${formatNumber(cur)}원 → ${formatNumber(cur - d)}원</span>`,
        '거래 취소');
    if (!ok) return;
    const at = findFundLogAt(log);
    if (at < 0 || appData.fundLogs[at].void) { showToast("이미 처리된 기록입니다."); renderFundLedger(); return; }
    saveState();
    appData.fundLogs[at].void = { time: fundNowLabel(), name: localStorage.getItem('jtfag_my_name') || "알 수 없음", eff: d };   // eff = 이때 잔액에서 뺀 금액(복구할 때 그만큼 되돌린다)
    appData.clubFund = (appData.clubFund || 0) - d;
    syncToSupabase(appData); renderNoticeArea(); renderAll();
    showToast(`↩️ 거래를 취소했습니다. 공금 ${formatFundString(appData.clubFund)}`);
}

async function restoreFundLog(i) {
    if (!(await authorizeFund())) return;
    const log = (appData.fundLogs || [])[i];
    if (!log || !log.void) return;
    const d = (typeof log.void.eff === 'number') ? log.void.eff : fundDelta(log), cur = appData.clubFund || 0;   // 잔액에 영향이 없던 기록(eff 0)은 복구해도 잔액이 안 바뀐다
    const ok = await showConfirmPrompt(
        `취소한 거래를 복구할까요?<br><span style="font-size:0.78rem; color:#6b7075;">${escapeHtml(log.time || '')} · ${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d))}원</span><br><span style="font-size:0.78rem; color:#1f6b45;">공금 잔액 ${formatNumber(cur)}원 → ${formatNumber(cur + d)}원</span>`,
        '복구', '#2b5394');
    if (!ok) return;
    const at = findFundLogAt(log);
    if (at < 0 || !appData.fundLogs[at].void) { showToast("이미 처리된 기록입니다."); renderFundLedger(); return; }
    saveState();
    delete appData.fundLogs[at].void;
    appData.clubFund = (appData.clubFund || 0) + d;
    syncToSupabase(appData); renderNoticeArea(); renderAll();
    showToast(`✅ 거래를 복구했습니다. 공금 ${formatFundString(appData.clubFund)}`);
}

// 내역(메모)만 고친다. 금액은 못 고친다 — 틀렸으면 취소하고 다시 입력한다.
async function editFundLedgerMemo(i) {
    if (!(await authorizeFund())) return;
    const picked = (appData.fundLogs || [])[i];
    if (!picked) return;
    const memo = await showMemoPrompt(picked);
    if (memo === null) return;
    const at = findFundLogAt(picked);
    if (at < 0) { showToast("이미 삭제된 기록입니다."); renderFundLedger(); return; }
    const log = appData.fundLogs[at];
    if (memo === (log.memo || '')) return;
    saveState();
    if (memo) log.memo = memo; else delete log.memo;
    syncToSupabase(appData); renderFundLedger();
    showToast(memo ? "✏️ 내역을 수정했습니다." : "✏️ 내역을 삭제했습니다.");
}
