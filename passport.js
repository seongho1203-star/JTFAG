// 스탬프(골프장 도장 모음) — 완료된 홀 기록에서 계산한다. 방문 횟수·최고 타수를 따로 저장하지 않는다.
let tripSection = 'schedule';
let passportPopup = null;
let passportGroupsShown = [];
let passportTripsShown = [];
const PASSPORT_SEEN_KEY = 'jtfag_passport_seen_v1';
const PASSPORT_NEW_KEY = 'jtfag_passport_new_v1';
// 공식 홈페이지·공식 예약 앱에서 확인한 마크와 사용자 제공 JNJ 마크. 파일은 앱에 포함하고 SW가 기기에 캐시한다.
const PASSPORT_MARKS = Object.freeze({
    '함평엘리체': { file: 'hampyeong-eliche.png', ink: '#a07e24', background: '#282524' },
    '어등산': { file: 'eodeungsan.svg', ink: '#346c57', background: '#214c3e' },
    '해피니스': { file: 'happiness.png', ink: '#174d82', background: '#073c78' },
    '광주': { file: 'gwangju.png', ink: '#b56920', background: '#283c2f', symbol: true },
    '무등산': { file: 'mudeungsan.png', ink: '#a88a80', background: '#ffffff' },
    'jnj': { file: 'jnj.jpeg', ink: '#087fab', background: '#ffffff' },
    '디오션': { file: 'ocean.jpeg', ink: '#2b6cb0', background: '#ffffff' },
    '사우스케이프오너스클럽': { file: 'southcape.jpeg', ink: '#4a413e', background: '#ffffff' }
});
// 자동 수집 마크 목록은 이 기기에도 남긴다 — 여권을 처음 그릴 때 네트워크를 기다리지 않고 바로 마크가 보인다(서비스워커 그림 캐시와 한 쌍).
const PASSPORT_MARKS_KEY = 'jtfag_passport_marks_v1';
const passportMarkOk = (key, mark) => !(key.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(key) || !mark
    || !/^auto-[a-f0-9]{64}\.(png|jpg|webp)$/.test(mark.file) || !/^#[a-f0-9]{6}$/i.test(mark.ink) || !/^#[a-f0-9]{6}$/i.test(mark.background));
let passportAutoMarks = (() => {
    const marks = Object.create(null);
    try {
        const saved = JSON.parse(localStorage.getItem(PASSPORT_MARKS_KEY) || '{}');
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) for (const [key, mark] of Object.entries(saved)) if (passportMarkOk(key, mark)) marks[key] = { file: mark.file, ink: mark.ink, background: mark.background };
    } catch (err) {}
    return marks;
})();
// 마크 그림을 미리 풀어 둔다. 서비스워커가 저장본을 바로 내주므로 네트워크 요청이 없고, 도장을 그릴 때 이미 디코딩되어 있다.
const passportWarmed = new Map();
function passportPreloadMarks() {
    const files = [...Object.values(PASSPORT_MARKS), ...Object.values(passportAutoMarks)].map(m => m.file);
    files.forEach(file => {
        if (passportWarmed.has(file) || typeof Image !== 'function') return;
        const img = new Image();
        img.decoding = 'async';
        img.src = 'assets/club-marks/v1/' + file;
        passportWarmed.set(file, img);
    });
}
let passportMarksPending = false, passportMarksNextCheck = 0, passportMarksTimer = null;
function passportMark(key) { return PASSPORT_MARKS[key] || passportAutoMarks[key]; }
async function loadPassportMarks() {
    if (typeof fetch !== 'function' || passportMarksPending || Date.now() < passportMarksNextCheck) return;
    passportMarksPending = true;
    passportMarksNextCheck = Date.now() + 60000;
    try {
        const response = await fetch('assets/club-marks/auto.json', {cache:'no-store'});
        if (!response.ok) throw new Error('마크 목록 조회 실패');
        const data = await response.json(), marks = Object.create(null);
        if (data.version !== 1 || !data.marks || typeof data.marks !== 'object' || Array.isArray(data.marks)) throw new Error('마크 목록 형식 오류');
        for (const [key, mark] of Object.entries(data.marks)) {
            if (!passportMarkOk(key, mark)) continue;
            marks[key] = {file:mark.file, ink:mark.ink, background:mark.background};
        }
        const changed = JSON.stringify(marks) !== JSON.stringify(passportAutoMarks);
        passportAutoMarks = marks;
        if (changed) { try { localStorage.setItem(PASSPORT_MARKS_KEY, JSON.stringify(marks)); } catch (err) {} }
        passportPreloadMarks();
        if (changed && tripSection === 'passport' && typeof refreshTripPage === 'function') refreshTripPage();
    } catch (err) {}  // 마크 확인 중에도 도장·방문 기록은 그대로 사용할 수 있다.
    finally {
        passportMarksPending = false;
        clearTimeout(passportMarksTimer);
        if (tripSection === 'passport') passportMarksTimer = setTimeout(() => {
            if (tripSection === 'passport' && document.visibilityState !== 'hidden') loadPassportMarks();
        }, 60000);
    }
}
const passportNewKeys = new Set((() => {
    try { const saved = JSON.parse(localStorage.getItem(PASSPORT_NEW_KEY) || '[]'); return Array.isArray(saved) ? saved.filter(k => typeof k === 'string') : []; }
    catch (err) { return []; }
})());
let passportToastTimer = null;
function rememberPassportNew() {
    try { localStorage.setItem(PASSPORT_NEW_KEY, JSON.stringify([...passportNewKeys])); } catch (err) {}
}
function tripSectionHtml() {
    return `<div id="tripSectionNav" class="passport-tabs" role="group" aria-label="여행 화면 선택">
        <button type="button" class="${tripSection === 'schedule' ? 'on' : ''}" aria-pressed="${tripSection === 'schedule'}" onclick="switchTripSection('schedule')">여행 일정</button>
        <button type="button" class="${tripSection === 'passport' ? 'on' : ''}" aria-pressed="${tripSection === 'passport'}" onclick="switchTripSection('passport')">스탬프</button>
    </div>`;
}
function switchTripSection(section) {
    if (!['schedule', 'passport'].includes(section)) return;
    if (tripEditing) { showToast('⚠️ 편집을 저장하거나 취소한 후 전환해 주세요.'); return; }
    closePassportDetail(false);
    tripSection = section;
    renderTripPage();
}
function passportBaseKey(name) {
    const k = clubKey(String(name || '').replace(/\s*\([^()]*\)\s*$/, '')).toLocaleLowerCase('en');
    return ({ '골프존카운티무등산': '무등산', '함평다이너스티': '함평엘리체', '사우스케이프': '사우스케이프오너스클럽', '사우스케이프cc': '사우스케이프오너스클럽' })[k] || k;
}
// GORA에서 고른 일본 골프장은 일정에 한글 이름(day.course)과 일본어 원문(day.gora.ja)이 함께 남는다.
// 도장은 일본어 원문을 이름으로 쓰고(지난 방문으로 직접 적은 일본 골프장과 같다) 한글 이름은 그 아래 병기하며, 한글 이름으로 적은 기록도 같은 도장으로 합친다.
function passportTripJa(day) {
    const ja = day && day.gora && typeof day.gora.ja === 'string' ? day.gora.ja.trim() : '';
    return ja && day.course && ja !== String(day.course).trim() ? ja : '';
}
function passportAliases() {
    const map = {};
    allTrips().forEach(trip => tripDays(trip).forEach(day => {
        const ja = passportTripJa(day);
        if (!ja) return;
        const from = passportBaseKey(day.course), to = passportBaseKey(ja);
        if (from && to && from !== to) map[from] = to;
    }));
    return map;
}
function passportClubKey(name) {
    const k = passportBaseKey(name);
    return passportAliases()[k] || k;
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
// 앱을 만들기 전에 다녀온 골프장(직접 등록)과 해외 여행의 지난 라운드는 스코어와 이어지지 않는다.
// 그래서 홀 기록이 아니라 방문 사실(골프장·날짜)만으로 도장을 찍는다. 국내 여행은 스코어카드로 이미 잡히므로 여기서 세지 않는다.
const PASSPORT_COUNTRY = Object.freeze({ KR: '한국', JP: '일본', OTHER: '기타 해외' });
const PASSPORT_COUNTRY_TAG = Object.freeze({ JP: 'JAPAN', OTHER: 'OVERSEAS' });
function passportPastList() {
    const list = Array.isArray(appData.passportPast) ? appData.passportPast : [];
    return list.filter(p => p && typeof p.id === 'string' && ID_RE.test(p.id) && typeof p.name === 'string' && p.name.trim())
        .map(p => ({ id: p.id, name: p.name.trim().slice(0, 40), ko: typeof p.ko === 'string' ? p.ko.trim().slice(0, 40) : '', date: ISO_RE.test(p.date) ? p.date : '', country: PASSPORT_COUNTRY[p.country] ? p.country : 'OTHER' }));
}
// 일본어(가나·한자)로만 적힌 골프장 이름 뒤에 한글 이름을 붙여 보여 준다. 직접 적은 한글 이름이 먼저고, 없으면 사전과 가나 표기로 옮긴다.
// 사전에 없는 한자가 남으면 틀린 이름을 보이느니 아무것도 안 보인다. 저장하지 않고 그릴 때마다 셈한다(사전이 늘면 예전 기록도 따라온다).
const PASSPORT_JA_RE = /[぀-ヿ㐀-鿿]/, PASSPORT_HANGUL_RE = /[가-힣]/;
const PASSPORT_JA_WORDS = [
    ['北九州', '기타큐슈'], ['九州', '규슈'], ['四国', '시코쿠'], ['関東', '간토'], ['関西', '간사이'],
    ['札幌', '삿포로'], ['仙台', '센다이'], ['横浜', '요코하마'], ['名古屋', '나고야'], ['神戸', '고베'], ['那覇', '나하'], ['糸島', '이토시마'],
    ['別府', '벳푸'], ['湯布院', '유후인'], ['指宿', '이부스키'], ['霧島', '기리시마'], ['阿蘇', '아소'], ['箱根', '하코네'], ['軽井沢', '가루이자와'],
    ['淡路', '아와지'], ['琵琶湖', '비와코'], ['金沢', '가나자와'], ['富士', '후지'], ['桜島', '사쿠라지마'], ['屋久島', '야쿠시마'], ['種子島', '다네가시마'],
    ['朝陽', '아사히'], ['朝日', '아사히'], ['旭川', '아사히카와'], ['宇部', '우베'], ['小倉', '고쿠라'], ['門司', '모지'], ['下関', '시모노세키'], ['若松', '와카마쓰'], ['久留米', '구루메'],
    ['太宰府', '다자이후'], ['唐津', '가라쓰'], ['佐世保', '사세보'], ['大村', '오무라'], ['島原', '시마바라'], ['雲仙', '운젠'], ['天草', '아마쿠사'], ['八代', '야쓰시로'], ['人吉', '히토요시'],
    ['日田', '히타'], ['中津', '나카쓰'], ['宇佐', '우사'], ['延岡', '노베오카'], ['都城', '미야코노조'], ['鹿屋', '가노야'], ['薩摩', '사쓰마'], ['川内', '센다이'], ['枕崎', '마쿠라자키'], ['奄美', '아마미'],
    ['石垣', '이시가키'], ['松山', '마쓰야마'], ['高松', '다카마쓰'], ['福山', '후쿠야마'], ['倉敷', '구라시키'], ['姫路', '히메지'], ['明石', '아카시'], ['宝塚', '다카라즈카'], ['大津', '오쓰'],
    ['浜松', '하마마쓰'], ['熱海', '아타미'], ['伊豆', '이즈'], ['河口湖', '가와구치코'], ['日光', '닛코'], ['那須', '나스'], ['水戸', '미토'], ['成田', '나리타'], ['房総', '보소'], ['相模', '사가미'],
    ['厚木', '아쓰기'], ['御殿場', '고텐바'], ['苫小牧', '도마코마이'], ['函館', '하코다테'], ['千歳', '지토세'], ['小樽', '오타루'], ['太陽', '다이요'], ['大洋', '다이요'],
    ['国際', '국제'], ['南国', '난고쿠'], ['太平洋', '다이헤이요'], ['平和', '헤이와'], ['日本', '일본'], ['中央', '주오'], ['桜', '사쿠라'],
    ['ゴルフ場', '골프장'], ['ゴルフ倶楽部', '골프클럽'], ['ゴルフ俱楽部', '골프클럽'], ['倶楽部', '클럽'], ['俱楽部', '클럽']
];
let passportJaDict = null;
function passportKoName(name) {
    const src = String(name || '').trim();
    if (!src || !PASSPORT_JA_RE.test(src) || PASSPORT_HANGUL_RE.test(src) || typeof koName !== 'function' || typeof JP_PREFS === 'undefined') return '';
    if (!passportJaDict) passportJaDict = [...JP_PREFS.map((p, i) => [p, JP_PREFS_KO[i]]), ...PASSPORT_JA_WORDS].sort((a, b) => b[0].length - a[0].length);
    let s = src;
    passportJaDict.forEach(([ja, ko]) => { s = s.split(ja).join(` ${ko} `); });
    const out = koName(s);
    return out && out !== src ? out.replace(/컨트리 클럽/g, '컨트리클럽').replace(/([가-힣]) (\d)/g, '$1$2') : '';
}
const passportKoOf = group => group.ko || passportKoName(group.name);
function passportExtraVisits() {
    const visits = passportPastList().map(p => ({ src: 'past', id: p.id, name: p.name, ko: p.ko, date: p.date, country: p.country }));
    const today = kstToday();
    allTrips().forEach(trip => {
        const kind = tripKind(trip);
        if (kind === 'domestic') return;
        tripDays(trip).forEach(day => {
            if (!day.course || noRound(day) || day.date > today) return;
            const ja = passportTripJa(day), shown = ja || String(day.course);
            visits.push({ src: 'trip', tripId: trip.id, name: shown.replace(/\s*\([^()]*\)\s*$/, '').trim(), ko: ja ? String(day.course).replace(/\s*\([^()]*\)\s*$/, '').trim() : '', date: day.date, country: kind === 'japan' ? 'JP' : 'OTHER' });
        });
    });
    return visits;
}
const passportVisitRank = v => v.src === 'past' ? 0 : v.src === 'trip' ? 2 : 1;
function passportData() {
    const groups = new Map();
    let rounds = 0, unnamed = 0;
    if (typeof ROUND_HOLES !== 'undefined') Object.keys(ROUND_HOLES).map(Number).filter(r => r > 0 && r <= appData.totalRounds).sort((a, b) => a - b).forEach(round => {
        if (!predictionHoles(round)) return;
        rounds++;
        const name = passportCourse(round), key = passportClubKey(name);
        if (!name || !key) { unnamed++; return; }
        if (!groups.has(key)) groups.set(key, { key, name, country: 'KR', visits: [], best: {} });
        const group = groups.get(key);
        const scores = Object.fromEntries(golfers.map(g => [g, grossFromHoles(round, g)]));
        group.visits.push({ round, date: passportRoundDate(round), sub: typeof subCourseOf === 'function' ? subCourseOf(round - 1) : '', scores });
        golfers.forEach(g => { if (Number.isFinite(scores[g])) group.best[g] = Math.min(group.best[g] || Infinity, scores[g]); });
    });
    passportExtraVisits().forEach(extra => {
        const key = passportClubKey(extra.name);
        if (!key) return;
        const known = groups.has(key);
        if (!known) groups.set(key, { key, name: extra.name, country: extra.country, visits: [], best: {} });
        if (extra.ko && !groups.get(key).ko) groups.get(key).ko = extra.ko;
        groups.get(key).visits.push({ round: null, date: extra.date, sub: '', scores: {}, src: extra.src, id: extra.id, tripId: extra.tripId });
    });
    groups.forEach(g => g.visits.sort((a, b) => passportVisitRank(a) - passportVisitRank(b) || (a.round || 0) - (b.round || 0) || a.date.localeCompare(b.date)));
    // 여행 라운드가 있는 곳 → 스코어 기록이 있는 곳(최근 차수 순) → 지난 방문만 있는 곳(최근 날짜 순)
    const tier = g => g.visits.some(v => v.src === 'trip') ? 2 : g.visits.some(v => v.round) ? 1 : 0;
    const lastDate = g => g.visits.reduce((m, v) => v.date > m ? v.date : m, '');
    const lastRound = g => g.visits.reduce((m, v) => v.round > m ? v.round : m, 0);
    return { groups: [...groups.values()].sort((a, b) => tier(b) - tier(a) || (tier(a) === 1 ? lastRound(b) - lastRound(a) : lastDate(b).localeCompare(lastDate(a)))), rounds, unnamed };
}
function openPassport(index) {
    const group = passportGroupsShown[index];
    if (!group) return;
    if (passportPopup && passportPopup.key === group.key) { refreshPassportDetail(); return; }
    closePassportDetail(false);
    passportNewKeys.delete(group.key);
    rememberPassportNew();
    renderTripPage();
    const element = document.createElement('div');
    element.className = 'passport-overlay';
    element.innerHTML = `<section class="bdg-sheet passport-sheet" role="dialog" aria-modal="true" aria-labelledby="passportDetailTitle">
        <div class="passport-popup-head"><div><p>스탬프</p><h2 id="passportDetailTitle" class="passport-popup-title"></h2></div><button type="button" class="passport-popup-close" aria-label="닫기" onclick="closePassportDetail()">×</button></div>
        <div class="passport-popup-body"></div>
        <div class="passport-popup-footer"><button type="button" class="bdg-close" onclick="closePassportDetail()">닫기</button></div>
    </section>`;
    passportPopup = { element, key: group.key, title: element.querySelector('.passport-popup-title'), body: element.querySelector('.passport-popup-body'), html: '' };
    element.addEventListener('click', e => { if (e.target === element && passportPopup && passportPopup.element === element) closePassportDetail(); });
    element.addEventListener('keydown', e => {
        if (!passportPopup || passportPopup.element !== element) return;
        if (e.key === 'Escape') { e.preventDefault(); closePassportDetail(); }
        if (e.key === 'Tab') {
            const buttons = [...element.querySelectorAll('button:not(:disabled)')];
            const edge = e.shiftKey ? buttons[0] : buttons[buttons.length - 1];
            if (document.activeElement === edge) { e.preventDefault(); buttons[e.shiftKey ? buttons.length - 1 : 0].focus(); }
        }
    });
    document.body.appendChild(element);
    refreshPassportDetail();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (passportPopup && passportPopup.element === element) element.classList.add('show');
    }));
    element.querySelector('.passport-popup-close').focus({ preventScroll: true });
}
function closePassportDetail(restoreFocus = true) {
    if (!passportPopup) return;
    const { element, key } = passportPopup;
    passportPopup = null;
    element.classList.remove('show');
    setTimeout(() => element.remove(), 260);
    const stamp = restoreFocus && document.getElementById('passportStamp-' + key);
    if (stamp) stamp.focus({ preventScroll: true });
}
function refreshPassportDetail(groups = passportData().groups) {
    const popup = passportPopup;
    if (!popup) return;
    const group = groups.find(g => g.key === popup.key);
    if (!group) { closePassportDetail(false); return; }
    popup.title.textContent = group.name;
    const ko = passportKoOf(group);
    if (ko) { const small = document.createElement('small'); small.className = 'passport-ko'; small.textContent = ko; popup.title.appendChild(small); }
    const html = passportDetailHtml(group);
    if (popup.html !== html) { popup.html = html; popup.body.innerHTML = html; }
}
function openPassportTrip(index) {
    const trip = passportTripsShown[index];
    if (!trip || !findTrip(trip.id)) return;
    closePassportDetail(false);
    tripSection = 'schedule';
    switchTrip(trip.id);
}
function passportMarkHtml(group) {
    const mark = passportMark(group.key);
    const text = group.name.replace(/\s+/g, '');
    const initials = escapeHtml((text.match(/^[a-z0-9]{1,4}/i) || [Array.from(text).slice(0, 2).join('')])[0]);
    return `<span class="passport-mark${mark && mark.symbol ? ' passport-mark-symbol' : ''}"${mark ? ` style="background:${mark.background}"` : ''}>
        ${mark ? `<img src="assets/club-marks/v1/${mark.file}" alt="${escapeHtml(group.name)} 마크" width="128" height="96" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false">` : ''}
        <span class="passport-mark-fallback"${mark ? ' hidden' : ''}>${initials}</span>
    </span>`;
}
// 도장 둘레 글자 — 이름이 길수록(일본 골프장 등) 글자를 줄여 호 안에 맞춘다.
function passportRingName(name) {
    const chars = Array.from(String(name || '').replace(/\s+/g, ' ').trim());
    const text = (chars.length > 18 ? chars.slice(0, 17).join('') + '…' : chars.join('')).replace(/(\S)(CC|GC)$/i, '$1 $2');
    return { text, size: Math.max(9, Math.min(17, 190 / (Array.from(text).length * 1.12))) };
}
function passportTilt(key) {  // 같은 골프장은 늘 같은 각도로 찍힌다
    let sum = 0;
    for (const ch of String(key)) sum = (sum * 31 + ch.charCodeAt(0)) % 997;
    return (sum % 41) - 20;
}
const passportWhen = v => v.round ? (v.date || v.round + '차') : (v.date || '날짜 미상');
const passportRingWhen = v => v.round ? v.round + '차' : (v.date ? v.date.slice(0, 7).replace('-', '.') : 'PAST');
function passportStampHtml(group, index) {
    const first = group.visits[0], n = group.visits.length, tag = PASSPORT_COUNTRY_TAG[group.country];
    const mark = passportMark(group.key), ink = mark ? mark.ink : '#667b70';
    const ring = passportRingName(group.name), id = 'passportRing' + index;
    return `<button type="button" id="passportStamp-${escapeHtml(group.key)}" class="passport-stamp" style="--passport-ink:${ink}" onclick="openPassport(${index})" aria-haspopup="dialog" aria-label="${escapeHtml(group.name)} 방문 기록">
        ${passportNewKeys.has(group.key) ? '<span class="passport-new">NEW</span>' : ''}${tag ? `<span class="passport-country">${tag}</span>` : ''}
        <span class="passport-seal" style="--tilt:${passportTilt(group.key)}deg" aria-hidden="true">
            <svg viewBox="0 0 200 200" focusable="false"><defs><path id="${id}t" d="M24 100 A76 76 0 0 1 176 100"/><path id="${id}b" d="M17 100 A83 83 0 0 0 183 100"/></defs>
                <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="3.5"/>
                <circle cx="100" cy="100" r="89" fill="none" stroke="currentColor" stroke-width="1"/>
                <circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" stroke-width="2"/>
                <text class="passport-ring-name" font-size="${ring.size.toFixed(1)}" text-anchor="middle"><textPath href="#${id}t" startOffset="50%">${escapeHtml(ring.text)}</textPath></text>
                <text class="passport-ring-sub" font-size="10.5" text-anchor="middle" dominant-baseline="hanging"><textPath href="#${id}b" startOffset="50%">FIRST ${passportRingWhen(first)} · ${n} VISIT${n > 1 ? 'S' : ''}</textPath></text>
                <path d="M13 100l4-3v6zM187 100l-4-3v6z" fill="currentColor"/>
            </svg>
            <span class="passport-core"${mark ? ` style="background:${mark.background}"` : ''}>${passportMarkHtml(group)}</span>
        </span>
        <b class="passport-name">${escapeHtml(group.name)}</b>${passportKoOf(group) ? `<small class="passport-ko">${escapeHtml(passportKoOf(group))}</small>` : ''}<small class="passport-first">첫 방문 ${passportWhen(first)}</small>
        <span class="passport-visits">${n}회 방문 <span aria-hidden="true">›</span></span>
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
    const scored = group.visits.some(v => v.round), tag = PASSPORT_COUNTRY[group.country];
    return `<div class="passport-detail"><p class="passport-sub">${group.visits.length}회 방문 · 첫 방문 ${passportWhen(group.visits[0])}${group.country !== 'KR' ? ' · ' + tag : ''}</p>
        ${scored ? `<h3>멤버별 개인 최고 기록</h3><div class="passport-bests">${golfers.map(g => `<div><span>${escapeHtml(g)}</span><b>${Number.isFinite(group.best[g]) ? group.best[g] + '<small>타</small>' : '기록 없음'}</b></div>`).join('')}</div>` : '<p class="passport-sub">스코어카드와 이어지지 않는 방문이라 타수 기록은 없습니다.</p>'}
        <h3>방문 이력</h3><div class="passport-history">${group.visits.slice().reverse().map(v => `<div><b>${v.round ? v.round + '차' : v.src === 'trip' ? '여행 라운드' : '지난 방문'}${v.date ? ' · ' + v.date : ''}</b>${v.sub ? `<span>${escapeHtml(v.sub)}</span>` : ''}${v.round ? `<div class="passport-scores">${golfers.map(g => `<span>${escapeHtml(g)} <strong>${v.scores[g]}타</strong></span>`).join('')}</div>` : ''}${v.src === 'past' ? `<button type="button" class="passport-del" onclick="deletePassportPast('${v.id}')">이 방문 삭제</button>` : ''}</div>`).join('')}</div>
        ${related.length ? `<h3>관련 여행</h3>${related.map(x => `<button type="button" class="passport-trip-link" onclick="openPassportTrip(${x.index})">${escapeHtml(x.trip.title || '여행')} ›</button>`).join('')}` : ''}</div>`;
}
function passportHtml() {
    loadPassportMarks();
    const data = passportData();
    passportGroupsShown = data.groups;
    passportTripsShown = allTrips();
    refreshPassportDetail(data.groups);
    const upcoming = passportUpcoming(data.groups);
    const mrz = [
        'P<KOR<JTFAG<<GOLF<STAMP'.padEnd(44, '<'),
        (String(data.rounds).padStart(4, '0') + '<' + data.groups.length + '<<KOR').padEnd(44, '<')
    ];
    return `<div class="passport-book">
        <div class="passport-cover"><div class="passport-heading"><p class="passport-eyebrow">JTFAG · STAMP</p><h2>스탬프</h2></div><div class="passport-totals"><div><b>${data.groups.length}</b><span>방문 골프장</span></div></div></div>
        ${data.groups.length ? `<div class="passport-page"><span class="passport-page-no" aria-hidden="true">PAGE 01</span><div class="passport-grid">${data.groups.map(passportStampHtml).join('')}</div></div>
        <p class="passport-sub">도장을 선택하면 방문 기록을 확인할 수 있습니다.</p>` : '<div class="passport-empty">첫 라운드의 스코어카드가 등록되면 골프장 도장이 찍힙니다.</div>'}
        <button type="button" class="passport-add" onclick="openPassportAdd()">＋ 지난 방문 추가</button>
        ${data.unnamed ? `<p class="passport-sub">골프장 미지정 ${data.unnamed}라운드는 골프장 등록 후 도장에 반영됩니다.</p>` : ''}
        ${upcoming.length ? `<details class="passport-plans"><summary>방문 예정 · ${upcoming.length}곳</summary>${upcoming.map(x => `<button type="button" onclick="openPassportTrip(${x.index})"><span>${escapeHtml(x.name)}<small>${x.date}</small></span><em>방문 예정 ›</em></button>`).join('')}</details>` : ''}
        <p class="passport-mrz" aria-hidden="true">${mrz.map(escapeHtml).join('<br>')}</p>
    </div>`;
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

// ── 지난 방문 직접 등록(앱을 만들기 전에 다녀온 곳, 특히 해외) ──
// 해외 여행(일본·기타)의 라운드는 날짜가 지나면 저절로 찍히므로, 여기서는 그 이전 기록만 손으로 넣는다.
function editPassportPast(mutate, msg) {
    saveState();
    const list = Array.isArray(appData.passportPast) ? appData.passportPast.slice() : [];
    if (mutate(list) === false) { historyStack.pop(); return false; }
    if (list.length) appData.passportPast = list; else delete appData.passportPast;
    syncToSupabase(appData);
    if (msg) showToast(msg);
    return true;
}
function closePassportAdd() {
    closeTripSheet();
    if (tripEditing === 'passport') tripEditing = null;
}
function openPassportAdd() {
    if (tripEditing) { showToast('⚠️ 편집을 저장하거나 취소한 후 추가해 주세요.'); return; }
    closePassportDetail(false);
    closeTripSheet();
    tripEditing = 'passport';
    const o = document.createElement('div');
    o.className = 'bdg-sheet-overlay trip-sheet-overlay';
    o.innerHTML = `<div class="bdg-sheet trip-sheet" role="dialog" aria-label="지난 방문 추가"><div class="bdg-grip"></div>
        <div class="trip-sheet-head">지난 방문 추가</div>
        <label class="trip-field">골프장 이름<input type="text" id="passportAddName" maxlength="40" autocomplete="off"></label>
        <label class="trip-field">한글 이름 (선택)<input type="text" id="passportAddKo" maxlength="40" autocomplete="off"></label>
        <div class="trip-field">국가
            <div class="trip-kind-row">${Object.entries(PASSPORT_COUNTRY).map(([k, v]) => `<label class="trip-kind"><input type="radio" name="passportAddCountry" value="${k}"${k === 'JP' ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
        </div>
        <label class="trip-field">방문일 (선택)<input type="date" id="passportAddDate" max="${kstToday()}"></label>
        <div class="trip-hint">스코어카드와 이어지지 않는 방문으로 기록됩니다. 같은 골프장을 여러 번 갔으면 방문마다 한 번씩 추가해 주세요.</div>
        <div class="trip-actions">
            <button type="button" class="trip-btn ghost" onclick="closePassportAdd()">취소</button>
            <button type="button" class="trip-btn primary" onclick="savePassportAdd()">저장</button>
        </div></div>`;
    o.addEventListener('click', e => { if (e.target === o) closePassportAdd(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}
function savePassportAdd() {
    const val = id => ((document.getElementById(id) || {}).value || '').trim();
    const name = val('passportAddName'), date = val('passportAddDate'), ko = PASSPORT_HANGUL_RE.test(name) ? '' : val('passportAddKo');
    const countryEl = document.querySelector('input[name="passportAddCountry"]:checked');
    const country = countryEl && PASSPORT_COUNTRY[countryEl.value] ? countryEl.value : 'JP';
    if (!name) { showToast('⚠️ 골프장 이름을 입력해 주세요.'); return; }
    if (date && (!ISO_RE.test(date) || date > kstToday())) { showToast('⚠️ 방문일은 오늘 이전 날짜로 선택해 주세요.'); return; }
    const key = passportClubKey(name);
    if (!key) { showToast('⚠️ 골프장 이름을 확인해 주세요.'); return; }
    if (passportPastList().some(p => passportClubKey(p.name) === key && p.date === date)) { showToast('⚠️ 같은 날짜의 같은 골프장이 이미 등록되어 있습니다.'); return; }
    const id = 'pp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    closePassportAdd();
    editPassportPast(list => { list.push(ko ? { id, name, ko, date, country } : { id, name, date, country }); }, `✅ ${name} 방문을 등록했습니다.`);
    renderTripPage();
}
async function deletePassportPast(id) {
    if (!ID_RE.test(String(id)) || !passportPastList().some(p => p.id === id)) return;
    const ok = await showConfirmPrompt('이 방문 기록을 삭제할까요? 같은 골프장의 다른 방문 기록은 그대로 유지됩니다.', '삭제');
    if (!ok || !passportPastList().some(p => p.id === id)) return;
    editPassportPast(list => { const i = list.findIndex(p => p && p.id === id); if (i < 0) return false; list.splice(i, 1); }, '삭제했습니다.');
    renderTripPage();
}
// 앱을 연 뒤 잠시 쉬었다가(첫 화면을 방해하지 않게) 마크 목록과 그림을 미리 받아 둔다 — 여권 탭을 열 때는 이미 저장본이 있다.
setTimeout(() => { passportPreloadMarks(); loadPassportMarks(); }, 2500);
