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

