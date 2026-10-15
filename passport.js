// 골프장 여권 — 완료된 홀 기록에서 계산한다. 방문 횟수·최고 타수를 따로 저장하지 않는다.
let tripSection = 'schedule';
let passportSelected = '';
let passportGroupsShown = [];
let passportTripsShown = [];
const PASSPORT_SEEN_KEY = 'jtfag_passport_seen_v1';
const PASSPORT_NEW_KEY = 'jtfag_passport_new_v1';
// 공식 홈페이지·공식 예약 앱에서 확인한 마크. 파일은 앱에 포함하고 SW가 기기에 캐시한다.
const PASSPORT_MARKS = Object.freeze({
    '함평엘리체': { file: 'hampyeong-eliche.png', ink: '#a07e24', background: '#282524' },
    '어등산': { file: 'eodeungsan.svg', ink: '#346c57', background: '#214c3e' },
    '해피니스': { file: 'happiness.png', ink: '#174d82', background: '#073c78' },
    '광주': { file: 'gwangju.png', ink: '#b56920', background: '#283c2f', symbol: true },
    '무등산': { file: 'mudeungsan.png', ink: '#a88a80', background: '#ffffff' }
});
const passportNewKeys = new Set((() => {
    try { const saved = JSON.parse(localStorage.getItem(PASSPORT_NEW_KEY) || '[]'); return Array.isArray(saved) ? saved.filter(k => typeof k === 'string') : []; }
    catch (err) { return []; }
})());
let passportToastTimer = null;
function rememberPassportNew() {
    try { localStorage.setItem(PASSPORT_NEW_KEY, JSON.stringify([...passportNewKeys])); } catch (err) {}
}
function passportScrollTop() {
    const nav = document.getElementById('tripSectionNav');
    if (nav && typeof nav.scrollIntoView === 'function') nav.scrollIntoView({ block: 'start' });
}

function tripSectionHtml() {
    return `<div id="tripSectionNav" class="passport-tabs" role="group" aria-label="여행 화면 선택">
        <button type="button" class="${tripSection === 'schedule' ? 'on' : ''}" aria-pressed="${tripSection === 'schedule'}" onclick="switchTripSection('schedule')">여행 일정</button>
        <button type="button" class="${tripSection === 'passport' ? 'on' : ''}" aria-pressed="${tripSection === 'passport'}" onclick="switchTripSection('passport')">골프장 여권</button>
    </div>`;
}
function switchTripSection(section) {
    if (!['schedule', 'passport'].includes(section)) return;
    if (tripEditing) { showToast('⚠️ 편집을 저장하거나 취소한 후 전환해 주세요.'); return; }
    tripSection = section;
    renderTripPage();
}
function passportClubKey(name) {
    const k = clubKey(String(name || '').replace(/\s*\([^()]*\)\s*$/, '')).toLocaleLowerCase('en');
    return ({ '골프존카운티무등산': '무등산', '함평다이너스티': '함평엘리체' })[k] || k;
}
function passportCourse(round) {
    const stored = String((appData.roundCourses || {})[round] || (appData.courses || [])[round - 1] || '').trim();
    if (stored) return stored.replace(/\s*\([^()]*\)\s*$/, '').trim();
    const printed = String((ROUND_HOLES[String(round)] || {}).course || '').trim();
    // 「어등-송정」처럼 9홀 코스만 있는 기록을 새 골프장으로 찍지 않는다.
    if (printed.includes('(') || /(?:CC|GC|컨트리클럽|골프클럽|골프리조트)$/i.test(printed) || clubCourses(printed).length) {
        return printed.replace(/\s*\([^()]*\)\s*$/, '').trim();
    }
    return '';
}
function passportRoundDate(round) {
    const stored = (appData.roundDates || {})[round] || (ROUND_HOLES[String(round)] || {}).date;
    if (typeof stored === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
    const es = typeof predictionRoundEntries === 'function' ? predictionRoundEntries(round) : [];
    return es.length ? new Date(Math.min(...es.map(e => e.deadline)) + 9 * 3600000).toISOString().slice(0, 10) : '';
}
function passportData() {
    const groups = new Map();
    let rounds = 0, unnamed = 0;
    if (typeof ROUND_HOLES === 'undefined') return { groups: [], rounds, unnamed };
    Object.keys(ROUND_HOLES).map(Number).filter(r => r > 0 && r <= appData.totalRounds).sort((a, b) => a - b).forEach(round => {
        if (!predictionHoles(round)) return;
        rounds++;
        const name = passportCourse(round), key = passportClubKey(name);
        if (!name || !key) { unnamed++; return; }
        if (!groups.has(key)) groups.set(key, { key, name, visits: [], best: {} });
        const group = groups.get(key);
        const scores = Object.fromEntries(golfers.map(g => [g, grossFromHoles(round, g)]));
        group.visits.push({ round, date: passportRoundDate(round), sub: typeof subCourseOf === 'function' ? subCourseOf(round - 1) : '', scores });
        golfers.forEach(g => { if (Number.isFinite(scores[g])) group.best[g] = Math.min(group.best[g] || Infinity, scores[g]); });
    });
    return { groups: [...groups.values()].sort((a, b) => b.visits[b.visits.length - 1].round - a.visits[a.visits.length - 1].round), rounds, unnamed };
}
function openPassport(index) {
    const group = passportGroupsShown[index];
    if (!group) return;
    passportSelected = group.key;
    passportNewKeys.delete(group.key);
    rememberPassportNew();
    renderTripPage();
    passportScrollTop();
}
function closePassportDetail() { passportSelected = ''; renderTripPage(); passportScrollTop(); }
function openPassportTrip(index) {
    const trip = passportTripsShown[index];
    if (!trip || !findTrip(trip.id)) return;
    tripSection = 'schedule';
    switchTrip(trip.id);
}
function passportMarkHtml(group) {
    const mark = PASSPORT_MARKS[group.key];
    const text = group.name.replace(/\s+/g, '');
    const initials = escapeHtml((text.match(/^[a-z0-9]{1,4}/i) || [Array.from(text).slice(0, 2).join('')])[0]);
    return `<span class="passport-mark${mark && mark.symbol ? ' passport-mark-symbol' : ''}"${mark ? ` style="background:${mark.background}"` : ''}>
        ${mark ? `<img src="assets/club-marks/v1/${mark.file}" alt="${escapeHtml(group.name)} 마크" width="128" height="96" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ''}
        <span class="passport-mark-fallback"${mark ? ' hidden' : ''}>${initials}</span>
    </span>`;
}
function passportStampHtml(group, index) {
    const first = group.visits[0];
    const mark = PASSPORT_MARKS[group.key];
    return `<button type="button" class="passport-stamp" style="--passport-ink:${mark ? mark.ink : '#667b70'}" onclick="openPassport(${index})" aria-label="${escapeHtml(group.name)} 방문 기록">
        ${passportNewKeys.has(group.key) ? '<span class="passport-new">NEW</span>' : ''}
        <span class="passport-seal"><span class="passport-seal-label">JTFAG · GOLF PASSPORT</span>${passportMarkHtml(group)}<b>${escapeHtml(group.name)}</b><small>첫 방문 ${first.date || first.round + '차'}</small></span>
        <span class="passport-visits">${group.visits.length}회 방문 <span aria-hidden="true">›</span></span>
    </button>`;
}
function passportUpcoming(groups) {
    const today = kstToday(), visited = new Set(groups.map(g => g.key));
    const plans = [];
    const seen = new Set();
    passportTripsShown.forEach((trip, index) => tripDays(trip).forEach(day => {
        const key = passportClubKey(day.course);
        if (day.date < today || noRound(day) || !key || visited.has(key) || seen.has(key)) return;
        seen.add(key);
        plans.push({ name: day.course, date: day.date, index });
    }));
    return plans.sort((a, b) => a.date.localeCompare(b.date));
}
function passportDetailHtml(group) {
    const related = [];
    passportTripsShown.forEach((trip, index) => {
        if (tripDays(trip).some(day => group.visits.some(v => v.date && v.date === day.date && passportClubKey(day.course) === group.key))) related.push({ trip, index });
    });
    return `<button type="button" class="passport-back" onclick="closePassportDetail()">‹ 도장 모음</button>
        <div class="passport-detail"><p class="passport-eyebrow">JTFAG GOLF PASSPORT</p><h2>${escapeHtml(group.name)}</h2><p class="passport-sub">${group.visits.length}회 방문 · 첫 방문 ${group.visits[0].date || group.visits[0].round + '차'}</p>
        <h3>멤버별 개인 최고 기록</h3><div class="passport-bests">${golfers.map(g => `<div><span>${escapeHtml(g)}</span><b>${Number.isFinite(group.best[g]) ? group.best[g] + '<small>타</small>' : '기록 없음'}</b></div>`).join('')}</div>
        <h3>방문 이력</h3><div class="passport-history">${group.visits.slice().reverse().map(v => `<div><b>${v.round}차${v.date ? ' · ' + v.date : ''}</b>${v.sub ? `<span>${escapeHtml(v.sub)}</span>` : ''}<div class="passport-scores">${golfers.map(g => `<span>${escapeHtml(g)} <strong>${v.scores[g]}타</strong></span>`).join('')}</div></div>`).join('')}</div>
        ${related.length ? `<h3>관련 여행</h3>${related.map(x => `<button type="button" class="passport-trip-link" onclick="openPassportTrip(${x.index})">${escapeHtml(x.trip.title || '여행')} ›</button>`).join('')}` : ''}</div>`;
}
function passportHtml() {
    const data = passportData();
    passportGroupsShown = data.groups;
    passportTripsShown = allTrips();
    const selected = data.groups.find(g => g.key === passportSelected);
    if (selected) return passportDetailHtml(selected);
    passportSelected = '';
    const upcoming = passportUpcoming(data.groups);
    return `<div class="passport-cover"><p class="passport-eyebrow">OUR GOLF JOURNEY</p><h2>JTFAG<br>골프장 여권</h2><div class="passport-totals"><div><b>${data.groups.length}</b><span>방문 골프장</span></div><div><b>${data.rounds}</b><span>완료 라운드</span></div></div></div>
        <p class="passport-sub">완료된 스코어카드로 도장을 수집합니다. 도장을 선택하면 방문 기록을 확인할 수 있습니다.</p>
        ${data.groups.length ? `<div class="passport-grid">${data.groups.map(passportStampHtml).join('')}</div>` : '<div class="passport-empty">첫 라운드의 스코어카드가 등록되면 골프장 도장이 찍힙니다.</div>'}
        ${data.unnamed ? `<p class="passport-sub">골프장 미지정 ${data.unnamed}라운드는 골프장 등록 후 도장에 반영됩니다.</p>` : ''}
        ${upcoming.length ? `<details class="passport-plans"><summary>방문 예정 · ${upcoming.length}곳</summary>${upcoming.map(x => `<button type="button" onclick="openPassportTrip(${x.index})"><span>${escapeHtml(x.name)}<small>${x.date}</small></span><em>방문 예정 ›</em></button>`).join('')}</details>` : ''}`;
}
function checkPassportStamps() {
    if (typeof isLoaded !== 'undefined' && !isLoaded) return;
    const groups = passportData().groups;
    if (!groups.length) return;
    try {
        const saved = JSON.parse(localStorage.getItem(PASSPORT_SEEN_KEY) || 'null');
        const seen = Array.isArray(saved) ? saved : null;
        const added = seen ? groups.filter(g => !seen.includes(g.key)) : [];
        localStorage.setItem(PASSPORT_SEEN_KEY, JSON.stringify([...new Set([...(seen || []), ...groups.map(g => g.key)])]));
        if (!added.length) return;
        added.forEach(g => passportNewKeys.add(g.key));
        rememberPassportNew();
        const announce = (tries = 0) => {
            if (typeof entranceBlocked === 'function' && entranceBlocked()) {
                if (tries < 30) passportToastTimer = setTimeout(() => announce(tries + 1), 1000);
                return;
            }
            showToast(`🛂 새로운 골프장 도장 획득! ${added.map(g => g.name).join(' · ')}`, 3500);
            if (tripSection === 'passport') refreshTripPage();
        };
        clearTimeout(passportToastTimer);
        announce();
    } catch (err) {}
}
