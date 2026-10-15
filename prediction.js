// 라운드 예측. 기록은 수정본을 덧붙여 저장하고 합집합으로 복원한다.
// 판정·점수는 홀 기록과 기존 계급 이력을 읽어서 계산한다. 미션 포인트와 별개다.
const PREDICTION_POINTS = 2;
const PREDICTION_NONE = 'none';
const PREDICTION_MINE_KEY = 'jtfag_prediction_mine_v1';
let predictionOpen = false;
let predictionHistoryOpen = false;
let predictionSaving = false;
let predictionDraft = null;
let predictionDeadlineTimer = null;

function predictionValid(e) {
    return !!(e && typeof e.id === 'string' && /^[a-z0-9_-]{8,100}$/i.test(e.id)
        && Number.isInteger(e.round) && e.round > 0 && golfers.includes(e.player)
        && (golfers.includes(e.first) || e.first === PREDICTION_NONE) && golfers.includes(e.eagle)
        && Number.isInteger(e.birdies) && e.birdies >= 0 && e.birdies <= 72
        && Number.isFinite(e.at) && e.at > 0 && Number.isFinite(e.deadline) && e.at < e.deadline);
}
function predictionEntries() {
    return Object.values(appData.predictions || {}).filter(predictionValid);
}
function predictionRoundEntries(round) { return predictionEntries().filter(e => e.round === round); }
function predictionRoundDeadline(round, fallback) {
    const es = predictionRoundEntries(round);
    return es.length ? Math.min(...es.map(e => e.deadline), fallback || Infinity) : fallback;
}
function predictionLatest(round, player) {
    const schedule = predictionSchedule();
    const end = predictionRoundDeadline(round, schedule && schedule.round === round ? schedule.deadline : undefined);
    return predictionRoundEntries(round).filter(e => e.player === player && e.at < end)
        .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id))[0] || null;
}
function predictionRemember(e) {
    try {
        let mine = JSON.parse(localStorage.getItem(PREDICTION_MINE_KEY) || '{}');
        if (!mine || typeof mine !== 'object' || Array.isArray(mine)) mine = {};
        mine[e.id] = e;
        localStorage.setItem(PREDICTION_MINE_KEY, JSON.stringify(mine));
    } catch (err) {}
}
function mergePredictionData(prev) {
    let mine = {};
    try { mine = JSON.parse(localStorage.getItem(PREDICTION_MINE_KEY) || '{}') || {}; } catch (err) {}
    let changed = false;
    for (const source of [(prev && prev.predictions) || {}, mine]) {
        for (const e of Object.values(source)) {
            if (!predictionValid(e)) continue;
            if (!appData.predictions || typeof appData.predictions !== 'object' || Array.isArray(appData.predictions)) appData.predictions = {};
            if (!appData.predictions[e.id]) { appData.predictions[e.id] = e; changed = true; }
        }
    }
    return changed;
}
function predictionSchedule() {
    const round = Number(appData.nextRoundNo), iso = String(appData.nextRoundISO || '');
    const match = String(appData.nextRoundDate || '').match(/(오전|오후)\s+(\d{1,2}):(\d{2})/);
    if (!Number.isInteger(round) || round < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !match) return null;
    const hour = Number(match[2]), minute = Number(match[3]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const h = hour % 12 + (match[1] === '오후' ? 12 : 0);
    const deadline = Date.parse(`${iso}T${String(h).padStart(2, '0')}:${match[3]}:00+09:00`);
    if (!Number.isFinite(deadline)) return null;
    return { round, deadline: predictionRoundDeadline(round, deadline),
        course: String((appData.roundCourses || {})[round] || (appData.courses || [])[round - 1] || ''),
        date: iso };
}
function predictionHoles(round) {
    const rec = typeof ROUND_HOLES !== 'undefined' && ROUND_HOLES[String(round)];
    return rec && Array.isArray(rec.par) && rec.par.length === 18 && rec.par.every(p => Number.isFinite(p) && p > 0)
        && golfers.every(g => rec.rel && Array.isArray(rec.rel[g]) && rec.rel[g].length === 18 && rec.rel[g].every(Number.isFinite)) ? rec : null;
}
function predictionHasStarted(round, deadline) {
    return Date.now() >= deadline || !!(typeof ROUND_HOLES !== 'undefined' && ROUND_HOLES[String(round)])
        || golfers.some(g => Number((appData.scores[g] || [])[round - 1]) > 0);
}
function predictionAnswers(round) {
    const rec = predictionHoles(round);
    if (!rec || round > appData.totalRounds) return null;
    let first = [], firstHole = null;
    for (let h = 0; h < 18; h++) {
        const names = golfers.filter(g => rec.rel[g][h] === -1);
        if (names.length) { first = names; firstHole = h + 1; break; }
    }
    if (!first.length) first = [PREDICTION_NONE];
    const birdies = golfers.reduce((n, g) => n + rec.rel[g].filter(x => x === -1).length, 0);
    const index = typeof rankedRoundsList !== 'undefined' ? rankedRoundsList.indexOf(round - 1) : -1;
    const eagle = index < 0 ? [] : golfers.filter(g => (golferRankHistory[g] || [])[index] === 0);
    return { first, firstHole, birdies, eagle };
}
function predictionResult(e) {
    const a = predictionAnswers(e.round);
    const hits = [a ? a.first.includes(e.first) : null, a && a.eagle.length ? a.eagle.includes(e.eagle) : null, a ? a.birdies === e.birdies : null];
    return { hits, points: hits.filter(x => x === true).length * PREDICTION_POINTS, answers: a };
}
function predictionYear(e) {
    return new Date(e.deadline + 9 * 60 * 60 * 1000).getUTCFullYear();
}
function predictionRanks(year) {
    return golfers.map(player => {
        const rounds = [...new Set(predictionEntries().filter(e => e.player === player && predictionYear(e) === year).map(e => e.round))];
        const entries = rounds.map(r => predictionLatest(r, player)).filter(Boolean);
        return { player, points: entries.reduce((n, e) => n + predictionResult(e).points, 0), rounds: entries.length };
    }).sort((a, b) => b.points - a.points);
}
function predictionName(name) { return name === PREDICTION_NONE ? '버디 없음' : name; }
function predictionTime(ms) {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}
function togglePrediction() { predictionOpen = !predictionOpen; renderPredictionCard(); }
function togglePredictionHistory() { predictionHistoryOpen = !predictionHistoryOpen; renderPredictionCard(); }
function editPrediction(round) {
    const schedule = predictionSchedule(), me = localStorage.getItem('jtfag_my_name');
    if (!golfers.includes(me)) { showToast('⚠️ 내 이름을 먼저 선택해 주세요.'); return; }
    if (!schedule || schedule.round !== round || predictionHasStarted(round, schedule.deadline)) { showToast('⚠️ 예측 참여가 마감되었습니다.'); return; }
    const old = predictionLatest(round, me);
    predictionDraft = { round, player: me, first: old ? old.first : '', eagle: old ? old.eagle : '', birdies: old ? String(old.birdies) : '' };
    renderPredictionCard();
}
function pickPrediction(key, value) {
    if (!predictionDraft || !['first', 'eagle'].includes(key)) return;
    predictionDraft[key] = value;
    if (document.activeElement && document.activeElement.id === 'predictionBirdies') document.activeElement.blur();
    renderPredictionCard();
}
function cancelPrediction() { if (!predictionSaving) { predictionDraft = null; renderPredictionCard(); } }
async function savePrediction() {
    if (predictionSaving || !predictionDraft) return;
    const s = predictionSchedule(), d = predictionDraft, me = localStorage.getItem('jtfag_my_name');
    if (typeof leagueReadReady !== 'undefined' && !leagueReadReady) { showToast('⚠️ 서버 자료 확인 후 다시 시도해 주세요.'); return; }
    if (!s || d.round !== s.round || d.player !== me || predictionHasStarted(s.round, s.deadline)) { showToast('⚠️ 예측 참여가 마감되었거나 일정이 변경되었습니다.'); renderPredictionCard(); return; }
    if (!/^\d{1,2}$/.test(d.birdies) || Number(d.birdies) > 72 || ![...golfers, PREDICTION_NONE].includes(d.first) || !golfers.includes(d.eagle)) {
        showToast('⚠️ 두 명의 예측 대상과 버디 총개수(0~72개)를 입력해 주세요.'); return;
    }
    const entry = { id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10), round: s.round,
        player: me, first: d.first, eagle: d.eagle, birdies: Number(d.birdies), deadline: s.deadline, at: Date.now(), course: s.course };
    if (!predictionValid(entry)) return;
    if (!appData.predictions || typeof appData.predictions !== 'object' || Array.isArray(appData.predictions)) appData.predictions = {};
    appData.predictions[entry.id] = entry;
    predictionSaving = true;
    renderPredictionCard();
    let saved = false;
    try { saved = await syncToSupabase(appData); } catch (err) { console.error('Prediction save:', err); }
    predictionSaving = false;
    if (saved) {
        if (!appData.predictions) appData.predictions = {};
        appData.predictions[entry.id] = entry;
        predictionRemember(entry);
        predictionDraft = null;
        showToast('✅ 예측을 등록했습니다. 티오프 전까지 수정할 수 있습니다.');
    } else {
        if (appData.predictions) delete appData.predictions[entry.id];
        showToast('⚠️ 예측 저장에 실패했습니다. 다시 시도해 주세요.');
    }
    renderPredictionCard();
}
function predictionFormHtml(d) {
    const buttons = (key, names) => `<div class="pred-choices">${names.map(g => `<button type="button" aria-pressed="${d[key] === g}" class="${d[key] === g ? 'selected' : ''}" onclick="pickPrediction('${key}','${g}')"${predictionSaving ? ' disabled' : ''}>${escapeHtml(predictionName(g))}</button>`).join('')}</div>`;
    return `<div class="pred-form">
        <div class="pred-label">첫 버디 주인공 <small>적중 +2점</small></div>${buttons('first', [...golfers, PREDICTION_NONE])}
        <div class="pred-label">독수리 등급 주인공 <small>적중 +2점</small></div>${buttons('eagle', golfers)}
        <label class="pred-label" for="predictionBirdies">네 명의 버디 총개수 <small>정확히 적중 +2점</small></label>
        <div class="pred-count"><input id="predictionBirdies" type="number" inputmode="numeric" min="0" max="72" step="1" value="${escapeHtml(d.birdies)}" placeholder="개수 입력" oninput="predictionDraft.birdies=this.value"${predictionSaving ? ' disabled' : ''}><span>개</span></div>
        <div class="pred-actions"><button type="button" onclick="cancelPrediction()"${predictionSaving ? ' disabled' : ''}>취소</button><button type="button" class="primary" onclick="savePrediction()"${predictionSaving ? ' disabled' : ''}>${predictionSaving ? '저장 중…' : '예측 등록'}</button></div>
    </div>`;
}
function predictionEntryHtml(e, reveal) {
    const result = predictionResult(e);
    if (!reveal) return `<div class="pred-person"><b>${escapeHtml(e.player)}</b><span>참여 완료 · 마감 후 공개</span></div>`;
    const choices = [predictionName(e.first), e.eagle, `${e.birdies}개`];
    const labels = ['첫 버디', '독수리', '전체 버디'];
    return `<div class="pred-person detail"><div class="pred-person-head"><b>${escapeHtml(e.player)}</b><strong>${result.answers ? result.points + '점' : '판정 대기'}</strong></div>${choices.map((v, i) => `<div class="pred-result"><span>${labels[i]} · ${escapeHtml(v)}</span><em class="${result.hits[i] === true ? 'hit' : ''}">${result.hits[i] === null ? '대기' : result.hits[i] ? '적중 +2' : '미적중'}</em></div>`).join('')}</div>`;
}
function predictionRoundHtml(round, me) {
    const entries = golfers.map(g => predictionLatest(round, g)).filter(Boolean);
    const a = predictionAnswers(round);
    const schedule = predictionSchedule();
    const deadline = predictionRoundDeadline(round, schedule && schedule.round === round ? schedule.deadline : undefined);
    const reveal = predictionHasStarted(round, deadline);
    return `${a ? `<div class="pred-answer">첫 버디 <b>${a.first.map(predictionName).map(escapeHtml).join('·')}${a.firstHole ? ` (${a.firstHole}번 홀)` : ''}</b><br>독수리 <b>${a.eagle.length ? a.eagle.map(escapeHtml).join('·') : '판정 대기'}</b> · 전체 버디 <b>${a.birdies}개</b></div>` : ''}
        ${entries.map(e => predictionEntryHtml(e, reveal || e.player === me)).join('')}`;
}
function renderPredictionCard() {
    const host = document.getElementById('predictionHost');
    if (!host) return;
    const me = localStorage.getItem('jtfag_my_name'), s = predictionSchedule();
    const rounds = [...new Set(predictionEntries().map(e => e.round))].sort((a, b) => b - a);
    const round = s ? s.round : rounds[0];
    const entries = round ? golfers.map(g => predictionLatest(round, g)).filter(Boolean) : [];
    const locked = !s || predictionHasStarted(s.round, s.deadline);
    const draft = predictionDraft && s && predictionDraft.round === s.round && predictionDraft.player === me && !locked ? predictionDraft : null;
    clearTimeout(predictionDeadlineTimer);
    if (s && !locked) predictionDeadlineTimer = setTimeout(renderPredictionCard, Math.min(Math.max(1, s.deadline - Date.now()), 2147483647));
    const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date());
    const ranks = predictionRanks(Number(year));
    const head = `<button type="button" class="msn-head msn-fold${predictionOpen ? ' open' : ''}" aria-expanded="${predictionOpen}" onclick="togglePrediction()"><span>🔮 라운드 예측</span><span class="msn-sub">${round ? `${round}차 · ${entries.length}/4명` : '일정 대기'}${MSN_CHEVRON}</span></button>`;
    let content = '';
    if (predictionOpen) {
        content = `<p class="pred-rule">항목별 적중 2점 · 라운드 최대 6점 · 예측 전용 포인트</p>`;
        if (s) content += `<div class="pred-schedule"><b>${s.round}차 · ${escapeHtml(s.course || '예정 라운드')}</b><span>${locked ? '참여 마감' : '참여 가능'} · ${predictionTime(s.deadline)} 마감</span></div>`;
        else if (!round) content += '<div class="msn-empty">티오프 시각이 포함된 다음 라운드 일정을 등록하면 예측에 참여할 수 있습니다.</div>';
        if (round) content += predictionRoundHtml(round, me);
        if (draft) content += predictionFormHtml(draft);
        else if (s && !locked) content += `<button type="button" class="pred-start" onclick="editPrediction(${s.round})">${predictionLatest(s.round, me) ? '내 예측 수정' : '예측 참여'}</button>`;
        content += '<p class="pred-rule">첫 버디는 1번 홀부터 확인하며 같은 홀의 동시 달성자는 모두 정답입니다. 버디는 파보다 1타 적은 기록만 집계합니다.</p>';
        content += `<details class="pred-ranking"><summary>${year} 예측 포인트 순위</summary>${ranks.map(x => `<div class="pred-rank${x.player === me ? ' me' : ''}"><span>${1 + ranks.filter(y => y.points > x.points).length}위 ${escapeHtml(x.player)}</span><b>${x.points}점</b></div>`).join('')}</details>`;
        const past = rounds.filter(r => r !== round);
        if (past.length) content += `<button type="button" class="pred-history-toggle" aria-expanded="${predictionHistoryOpen}" onclick="togglePredictionHistory()">지난 예측 ${past.length}라운드 ${predictionHistoryOpen ? '접기' : '보기'}</button>${predictionHistoryOpen ? past.map(r => `<details class="pred-past"><summary>${r}차 예측 결과</summary>${predictionRoundHtml(r, me)}</details>`).join('') : ''}`;
    }
    const html = `<div class="msn-card pred-card${predictionOpen ? '' : ' folded'}">${head}${content}</div>`;
    // 입력 중 실시간 갱신으로 숫자 칸의 커서가 사라지는 것을 막는다. 마감 시에는 즉시 잠근다.
    if (draft && !predictionSaving && document.activeElement && document.activeElement.id === 'predictionBirdies') return;
    if (host._html !== html) { host.innerHTML = html; host._html = html; }
}
