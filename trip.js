// trip.js - 여행 일정 (넷이 같이 가는 골프 여행) + 일본 골프장 찾기(라쿠텐 GORA)
//
// 값은 payload.trips에 둔다 — 여행 하나가
//   {id, title, kind:'domestic'|'japan'|'abroad', base:{name,lat,lon}?, memo,
//    days:[{date, course, area, tee, stay, memo, lat?, lon?, gora?:{id,url}}]}
// 고치는 차례는 다른 곳과 같다: saveState() → appData 수정 → syncToSupabase(appData).
// **고칠 때는 순번이 아니라 id·날짜로 다시 찾는다** — 창이 떠 있는 사이 남의 저장이 들어오면
// appData가 통째로 바뀌어 순번이 밀릴 수 있다(공금 로그·사진에서 겪은 그 자리다).

const TRIP_SEED = {
    id: 'trip-2026-10-namdo',
    title: '10월 남도 골프 여행',
    kind: 'domestic',
    days: [
        { date: '2026-10-26', course: '디오션CC', area: '여수', tee: '', stay: '', memo: '' },
        { date: '2026-10-27', course: '여수경도골프앤리조트CC', area: '여수', tee: '', stay: '', memo: '' },
        { date: '2026-10-28', course: '사우스케이프오너스클럽', area: '남해', tee: '', stay: '', memo: '' },
        { date: '2026-10-29', course: '아난티 남해 골프클럽', area: '남해', tee: '', stay: '', memo: '라운드 후 집으로 복귀 🏠' }
    ],
    memo: ''
};

const TRIP_KINDS = { domestic: '🇰🇷 국내', japan: '🇯🇵 일본', abroad: '🌏 그 밖의 해외' };
const TRIP_MAX_DAYS = 14;

// 처음 한 번만 넣는다. `undefined`일 때만 — 누가 지워서 빈 배열이 되면 다시 안 넣는다.
// (같은 내용이라 넷이 동시에 넣어도 결과가 같다.)
function seedTrips() {
    if (appData.trips !== undefined) return false;
    appData.trips = [JSON.parse(JSON.stringify(TRIP_SEED))];
    return true;
}

function kstToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function isoDiff(a, b) {   // b - a (일)
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
function isoAdd(iso, n) {
    return new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
function isoWeekday(iso) {
    return '일월화수목금토'[new Date(iso + 'T00:00:00Z').getUTCDay()];
}
function isoLabel(iso, short) {
    const m = parseInt(iso.slice(5, 7), 10), d = parseInt(iso.slice(8, 10), 10);
    return short ? `${m}/${d}(${isoWeekday(iso)})` : `${m}월 ${d}일 (${isoWeekday(iso)})`;
}
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[\w-]{1,40}$/;   // onclick 속성에 그대로 넣으므로 이 모양만 받는다

function allTrips() {
    return (Array.isArray(appData.trips) ? appData.trips : []).filter(t => t && ID_RE.test(t.id));
}
function tripKind(trip) { return TRIP_KINDS[trip && trip.kind] ? trip.kind : 'domestic'; }
function tripDays(trip) {
    return (trip && Array.isArray(trip.days) ? trip.days : []).filter(d => d && ISO_RE.test(d.date))
        .slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}
function findTrip(id) { return allTrips().find(t => t.id === id) || null; }

// 아직 안 끝난 여행, 가까운 순.
function upcomingTrips() {
    const today = kstToday();
    return allTrips().map(t => ({ t, days: tripDays(t) }))
        .filter(x => x.days.length && x.days[x.days.length - 1].date >= today)
        .sort((a, b) => a.days[0].date < b.days[0].date ? -1 : 1).map(x => x.t);
}
function activeTrip() { return upcomingTrips()[0] || null; }

let tripOpenId = null;
// 'memo' · 'new' · 'settings' · 고치는 중인 날짜. 고치는 동안은 다시 그리지 않는다(적던 글이 날아간다).
let tripEditing = null;

// ─── 홈 카드 ───
// 다가오는 여행이 없어도 한 줄로 남긴다 — 그래야 새 여행을 만들 문이 늘 있다.
function renderTripCard() {
    const card = document.getElementById('tripCard');
    if (!card) return;
    card.style.display = 'block';
    const up = upcomingTrips();
    const trip = up[0];
    if (!trip) {
        card.classList.add('slim');
        card.innerHTML = `<div class="trip-card-top"><span class="trip-card-title">🧳 여행</span><span class="trip-card-more">＋ 새 여행 만들기 ›</span></div>`;
        card.onclick = () => openTripModal(null, 'new');
        return;
    }
    card.classList.remove('slim');
    const days = tripDays(trip);
    const today = kstToday();
    const left = isoDiff(today, days[0].date);
    const nowDay = days.findIndex(d => d.date === today);
    const badge = left > 0
        ? `<span class="dday-badge ${left <= 3 ? 'dday-soon' : 'dday-far'}">D-${left}</span>`
        : `<span class="dday-badge dday-today">여행 중</span>`;
    let sub;
    if (nowDay >= 0) {
        const d = days[nowDay];
        sub = `<b>${nowDay + 1}일차</b> · 오늘 ⛳ ${escapeHtml(d.course || '골프장 미정')}${d.tee ? ' · ' + escapeHtml(d.tee) : ''}`;
    } else {
        sub = days.map(d => escapeHtml(d.area || d.course || '미정')).join(' → ') + ' → 🏠';
    }
    const rounds = days.filter(d => d.course).length;
    card.innerHTML = `
        <div class="trip-card-top">
            <span class="trip-card-title">🧳 ${escapeHtml(trip.title || '여행')}</span>
            ${badge}
        </div>
        <div class="trip-card-when">${isoLabel(days[0].date, true)} ~ ${isoLabel(days[days.length - 1].date, true)} · ${rounds}라운드</div>
        <div class="trip-card-sub">${sub}</div>
        <div class="trip-card-more">${up.length > 1 ? `다른 여행 ${up.length - 1}개 · ` : ''}일정 보기 ›</div>`;
    card.onclick = () => openTripModal(trip.id);
}

function openTripModal(id, mode) {
    tripOpenId = id || (activeTrip() || {}).id || null;
    tripEditing = mode || (tripOpenId ? null : 'new');
    renderTripModal();
    document.getElementById('tripModal').classList.add('active');
}
function closeTripModal() {
    document.getElementById('tripModal').classList.remove('active');
    tripEditing = null;
}

// 남이 고쳐서 렌더가 돌 때 — 창이 열려 있고 내가 안 고치는 중이면 다시 그린다.
function refreshTripModal() {
    const modal = document.getElementById('tripModal');
    if (modal && modal.classList.contains('active') && !tripEditing) renderTripModal();
}

// ─── 위치 ───
function dayGeo(d) {
    const lat = parseFloat(d && d.lat), lon = parseFloat(d && d.lon);
    if (isFinite(lat) && isFinite(lon) && (lat || lon)) return { lat, lon };
    return courseGeo(d && d.course);
}
function kmBetween(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(h));
}
// 차로 걸리는 시간 어림 — 직선거리에 길 구불음(1.3배)을 얹고 평균 50km/h로 나눈다. 어디까지나 어림이다.
function driveMinutes(km) { return Math.max(5, Math.round(km * 1.3 / 50 * 60 / 5) * 5); }

// ─── 지도·길찾기 ───
// **`<a target="_blank">`로 열지 않는다.** 폰은 새 창을 열고 그 주소를 지도 앱에 넘기는데,
// 넘겨준 뒤 **빈 창이 남아** 돌아오면 그것부터 닫아야 했다(사용자 제보). 그래서 앱 주소로 곧바로 연다.
// 국내는 카카오맵(앱이 없으면 아이폰은 1.5초 뒤 웹, 안드로이드는 intent의 예비 주소),
// 해외는 카카오맵이 안 되므로 아이폰은 애플 지도(늘 깔려 있다), 안드로이드는 구글 지도다.
// PC(손가락 없는 기기)만 웹 지도를 새 탭으로 연다.
function tripGo(url) { location.href = url; }   // 시험에서 갈아 끼울 수 있게 한 곳으로 모은다

function mapTargets(day, kind) {
    const name = String(day.course || '').trim();
    const geo = dayGeo(day);
    const n = encodeURIComponent(name);
    if (kind === 'domestic') {
        if (geo) return {
            map: { web: `https://map.kakao.com/link/map/${n},${geo.lat},${geo.lon}`, app: `kakaomap://look?p=${geo.lat},${geo.lon}`, intent: `look?p=${geo.lat},${geo.lon}` },
            route: { web: `https://map.kakao.com/link/to/${n},${geo.lat},${geo.lon}`, app: `kakaomap://route?ep=${geo.lat},${geo.lon}&by=CAR`, intent: `route?ep=${geo.lat},${geo.lon}&by=CAR` }
        };
        if (!name) return {};
        return { map: { web: `https://map.kakao.com/link/search/${n}`, app: `kakaomap://search?q=${n}`, intent: `search?q=${n}` } };
    }
    const q = geo ? `${geo.lat},${geo.lon}` : n;
    if (!geo && !name) return {};
    const fb = u => `;S.browser_fallback_url=${encodeURIComponent(u)};end`;
    const mapWeb = `https://www.google.com/maps/search/?api=1&query=${q}`;
    const routeWeb = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
    return {
        map: { web: mapWeb, apple: geo ? `maps://?ll=${q}&q=${n}` : `maps://?q=${n}`,
               gmaps: `intent://maps.google.com/maps?q=${geo ? q + '(' + n + ')' : n}#Intent;scheme=https;package=com.google.android.apps.maps` + fb(mapWeb) },
        route: { web: routeWeb, apple: `maps://?daddr=${q}&dirflg=d`,
                 gmaps: `intent://maps.google.com/maps?daddr=${q}#Intent;scheme=https;package=com.google.android.apps.maps` + fb(routeWeb) }
    };
}

function openTripMap(kind, date) {
    const trip = findTrip(tripOpenId);
    const day = trip && tripDays(trip).find(d => d.date === date);
    if (!day) return;
    const t = mapTargets(day, tripKind(trip))[kind];
    if (!t) return;
    const touch = navigator.maxTouchPoints > 0;
    const android = /Android/i.test(navigator.userAgent);
    if (!touch) { window.open(t.web, '_blank', 'noopener'); return; }
    if (t.apple || t.gmaps) {   // 해외
        tripGo(android ? t.gmaps : t.apple);
        return;
    }
    if (android) {
        tripGo(`intent://${t.intent}#Intent;scheme=kakaomap;package=net.daum.android.map;S.browser_fallback_url=${encodeURIComponent(t.web)};end`);
        return;
    }
    let left = false;
    const away = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', away);
    setTimeout(() => {
        document.removeEventListener('visibilitychange', away);
        window.removeEventListener('pagehide', away);
        if (!left && !document.hidden) tripGo(t.web);   // 앱이 없다 — 웹 지도로
    }, 1500);
    tripGo(t.app);
}

// ─── 일정 창 ───
function tripChipsHtml() {
    const list = allTrips().map(t => ({ t, days: tripDays(t) }))
        .sort((a, b) => (b.days[0] || {}).date > (a.days[0] || {}).date ? 1 : -1);
    const today = kstToday();
    const chips = list.map(({ t, days }) => {
        const past = days.length && days[days.length - 1].date < today;
        return `<button type="button" class="trip-chip${t.id === tripOpenId && tripEditing !== 'new' ? ' on' : ''}${past ? ' past' : ''}" onclick="switchTrip('${t.id}')">${escapeHtml(t.title || '여행')}${days.length ? ` <small>${isoLabel(days[0].date, true)}</small>` : ''}</button>`;
    }).join('');
    return `<div class="trip-chips">${chips}<button type="button" class="trip-chip add${tripEditing === 'new' ? ' on' : ''}" onclick="startNewTrip()">＋ 새 여행</button></div>`;
}
function switchTrip(id) { tripOpenId = id; tripEditing = null; renderTripModal(); }
function startNewTrip() { tripEditing = 'new'; renderTripModal(); }

function newTripHtml() {
    const start = isoAdd(kstToday(), 14);
    const opts = Array.from({ length: TRIP_MAX_DAYS }, (_, i) => `<option value="${i + 1}"${i === 2 ? ' selected' : ''}>${i + 1}일</option>`).join('');
    return `
        <div class="trip-day editing">
            <div class="trip-day-head">🧳 새 여행 만들기</div>
            <label class="trip-field">여행 이름<input type="text" id="tripNewTitle" maxlength="30" placeholder="예: 11월 지바 골프 여행"></label>
            <div class="trip-field">어디로?
                <div class="trip-kind-row">${Object.entries(TRIP_KINDS).map(([k, v], i) => `<label class="trip-kind"><input type="radio" name="tripNewKind" value="${k}"${i === 0 ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
            </div>
            <div class="trip-two">
                <label class="trip-field">첫날<input type="date" id="tripNewStart" value="${start}"></label>
                <label class="trip-field">며칠<select id="tripNewDays">${opts}</select></label>
            </div>
            <div class="trip-hint">날짜마다 골프장·티오프·숙소는 만든 뒤 <b>✏️ 고치기</b>로 적습니다. 일본이면 날마다 <b>🔎 일본 골프장 찾기</b>가 생깁니다.</div>
            <div class="trip-actions">
                ${tripOpenId ? `<button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>` : ''}
                <button type="button" class="trip-btn primary" onclick="createTrip()">만들기</button>
            </div>
        </div>`;
}

function createTrip() {
    const title = (document.getElementById('tripNewTitle').value || '').trim();
    const start = document.getElementById('tripNewStart').value;
    const n = Math.min(TRIP_MAX_DAYS, Math.max(1, parseInt(document.getElementById('tripNewDays').value, 10) || 1));
    const kindEl = document.querySelector('input[name="tripNewKind"]:checked');
    const kind = kindEl && TRIP_KINDS[kindEl.value] ? kindEl.value : 'domestic';
    if (!title) { showToast('⚠️ 여행 이름을 적어 주세요.'); return; }
    if (!ISO_RE.test(start)) { showToast('⚠️ 첫날을 골라 주세요.'); return; }
    const trip = {
        id: 'trip-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        title, kind, memo: '',
        days: Array.from({ length: n }, (_, i) => ({ date: isoAdd(start, i), course: '', area: '', tee: '', stay: '', memo: '' }))
    };
    saveState();
    if (!Array.isArray(appData.trips)) appData.trips = [];
    appData.trips.push(trip);
    syncToSupabase(appData);
    tripOpenId = trip.id;
    tripEditing = null;
    showToast(`✅ ${title}을(를) 만들었습니다.`);
    renderTripModal();
    renderTripCard();
}

function settingsHtml(trip) {
    const days = tripDays(trip);
    return `
        <div class="trip-day editing">
            <div class="trip-day-head">⚙️ 여행 고치기</div>
            <label class="trip-field">여행 이름<input type="text" id="tripSetTitle" maxlength="30" value="${escapeHtml(trip.title)}"></label>
            <div class="trip-field">어디로?
                <div class="trip-kind-row">${Object.entries(TRIP_KINDS).map(([k, v]) => `<label class="trip-kind"><input type="radio" name="tripSetKind" value="${k}"${tripKind(trip) === k ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
            </div>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripSettings()">저장</button>
            </div>
            <div class="trip-actions">
                <button type="button" class="trip-btn" onclick="addTripDay()"${days.length >= TRIP_MAX_DAYS ? ' disabled' : ''}>＋ 하루 늘리기</button>
                <button type="button" class="trip-btn" onclick="removeTripDay()"${days.length <= 1 ? ' disabled' : ''}>－ 마지막 날 빼기</button>
            </div>
            <div class="trip-actions"><button type="button" class="trip-btn danger" onclick="deleteTrip()">🗑️ 이 여행 지우기</button></div>
        </div>`;
}

// 고치는 동안 들어온 남의 저장을 덮지 않게, 늘 지금 appData에서 다시 찾아 고친다.
function editTrip(mutate, msg) {
    if (!findTrip(tripOpenId)) { showToast('⚠️ 그 여행을 찾지 못했습니다. 다시 열어 주세요.'); tripEditing = null; renderTripModal(); return false; }
    saveState();
    const t = findTrip(tripOpenId);
    if (mutate(t) === false) { historyStack.pop(); return false; }
    syncToSupabase(appData);
    if (msg) showToast(msg);
    return true;
}

function saveTripSettings() {
    const title = (document.getElementById('tripSetTitle').value || '').trim();
    const kindEl = document.querySelector('input[name="tripSetKind"]:checked');
    const kind = kindEl && TRIP_KINDS[kindEl.value] ? kindEl.value : 'domestic';
    if (!title) { showToast('⚠️ 여행 이름을 적어 주세요.'); return; }
    const trip = findTrip(tripOpenId);
    if (trip && (trip.title !== title || tripKind(trip) !== kind)) editTrip(t => { t.title = title; t.kind = kind; }, '✅ 저장했습니다.');
    tripEditing = null; renderTripModal(); renderTripCard();
}
function addTripDay() {
    editTrip(t => {
        const days = tripDays(t);
        if (!days.length || days.length >= TRIP_MAX_DAYS) return false;
        t.days.push({ date: isoAdd(days[days.length - 1].date, 1), course: '', area: '', tee: '', stay: '', memo: '' });
    }, '✅ 하루를 늘렸습니다.');
    renderTripModal(); renderTripCard();
}
async function removeTripDay() {
    const trip = findTrip(tripOpenId);
    const days = tripDays(trip);
    if (days.length <= 1) return;
    const last = days[days.length - 1];
    const filled = last.course || last.tee || last.stay || last.memo;
    if (filled && !await showConfirmPrompt(`${isoLabel(last.date)} 일정을 뺄까요?<br><span style="font-weight:500;color:#cbd5e1;">적어 둔 골프장·메모도 함께 사라집니다.</span>`, '빼기')) return;
    editTrip(t => { t.days = t.days.filter(d => d.date !== last.date); }, '✅ 마지막 날을 뺐습니다.');
    renderTripModal(); renderTripCard();
}
async function deleteTrip() {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    if (!await showConfirmPrompt(`<b>${escapeHtml(trip.title)}</b>을(를) 지울까요?<br><span style="font-weight:500;color:#cbd5e1;">일정·메모가 모두 사라집니다. 바로 뒤라면 ↩️ 되돌리기로 살릴 수 있습니다.</span>`, '지우기')) return;
    const id = trip.id;
    if (!findTrip(id)) return;
    saveState();
    appData.trips = (appData.trips || []).filter(t => !t || t.id !== id);
    syncToSupabase(appData);
    showToast('🗑️ 여행을 지웠습니다.');
    tripOpenId = (activeTrip() || allTrips()[0] || {}).id || null;
    tripEditing = tripOpenId ? null : 'new';
    renderTripModal(); renderTripCard();
}

// 국내 골프장 칸의 검색 목록. **브라우저의 `<datalist>`를 쓰지 말 것** — 아이폰은 그걸 목록으로
// 펼치지 않고 자판 위 추천 줄에만 한두 개 띄워서 '목록이 안 나온다'(사용자 제보).
// 일정 창의 골프장 검색과 같은 `searchCourses()`를 쓰고, 칸 바로 아래에 직접 그린다.
// 이름은 사용자가 친 글일 수도 있어(`customCourses`) onclick 문자열이 아니라 리스너로 붙인다.
function tripCourseSuggest(browse) {
    const box = document.getElementById('tripCourseResults');
    const input = document.getElementById('tripEdCourse');
    if (!box || !input || typeof searchCourses !== 'function') return;
    const { group, list } = searchCourses(browse ? '' : input.value);
    box.innerHTML = `<div class="course-group">${group}</div>` +
        (list.length ? '' : `<div class="course-empty">찾는 곳이 없으면 이름을 그대로 쓰면 됩니다.</div>`);
    list.forEach(name => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'course-item';
        b.innerHTML = `<span>${escapeHtml(name)}</span><span class="course-mark">${courseGeo(name) ? '🌤️' : ''}</span>`;
        // 누르는 순간 칸이 포커스를 잃어 목록이 먼저 닫히지 않게 한다.
        b.addEventListener('pointerdown', e => e.preventDefault());
        b.addEventListener('click', () => { input.value = name; box.style.display = 'none'; });
        box.appendChild(b);
    });
    box.style.display = 'block';
}
function tripCourseHide() {
    // 목록을 누르는 손가락이 먼저 닿도록 잠깐 기다렸다 닫는다.
    setTimeout(() => { const box = document.getElementById('tripCourseResults'); if (box) box.style.display = 'none'; }, 200);
}

function tripDayHtml(trip, d, i, today) {
    const isToday = d.date === today;
    const past = d.date < today;
    const dateId = d.date;
    const kind = tripKind(trip);
    if (tripEditing === dateId) {
        return `
        <div class="trip-day editing">
            <div class="trip-day-head"><span class="trip-day-no">${i + 1}일차</span> ${isoLabel(d.date)}</div>
            <label class="trip-field">⛳ 골프장<input type="text" id="tripEdCourse" maxlength="60" autocomplete="off" value="${escapeHtml(d.course)}"${kind === 'domestic' ? ' placeholder="이름을 치면 목록이 뜹니다" onfocus="this.select(); tripCourseSuggest(true)" oninput="tripCourseSuggest()" onblur="tripCourseHide()"' : ''}></label>
            ${kind === 'domestic' ? '<div id="tripCourseResults" class="course-results" style="display:none;"></div>' : ''}
            <label class="trip-field">📍 지역<input type="text" id="tripEdArea" maxlength="20" placeholder="예: 여수 · 지바" value="${escapeHtml(d.area)}"></label>
            <label class="trip-field">🕐 티오프<input type="text" id="tripEdTee" maxlength="20" placeholder="예: 오전 7:30" value="${escapeHtml(d.tee)}"></label>
            <label class="trip-field">🏨 숙소<input type="text" id="tripEdStay" maxlength="60" value="${escapeHtml(d.stay)}"></label>
            <label class="trip-field">📝 메모<textarea id="tripEdMemo" rows="2" maxlength="200">${escapeHtml(d.memo)}</textarea></label>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripDay('${dateId}')">저장</button>
            </div>
        </div>`;
    }
    const targets = mapTargets(d, kind);
    const wx = past ? '' : `<div class="trip-row trip-wx" id="tripWx-${dateId}">${tripWeatherHtml(d)}</div>`;
    const gora = d.gora && /^https:\/\//.test(d.gora.url || '') ? d.gora.url : '';
    return `
        <div class="trip-day${isToday ? ' today' : ''}${past ? ' past' : ''}">
            <div class="trip-day-head">
                <span class="trip-day-no">${i + 1}일차</span> ${isoLabel(d.date)}
                ${isToday ? '<span class="trip-today">오늘</span>' : ''}
            </div>
            <div class="trip-course">⛳ ${d.course ? escapeHtml(d.course) : '<span class="empty">골프장 미정</span>'}${d.area ? ` <span class="trip-area">${escapeHtml(d.area)}</span>` : ''}</div>
            <div class="trip-row"><span class="k">🕐 티오프</span><span class="v${d.tee ? '' : ' empty'}">${d.tee ? escapeHtml(d.tee) : '미정'}</span></div>
            <div class="trip-row"><span class="k">🏨 숙소</span><span class="v${d.stay ? '' : ' empty'}">${d.stay ? escapeHtml(d.stay) : '미정'}</span></div>
            ${d.memo ? `<div class="trip-memo">${escapeHtml(d.memo)}</div>` : ''}
            ${d.course ? wx : ''}
            ${kind === 'japan' && !past ? `<div class="trip-actions"><button type="button" class="trip-btn gora" onclick="openGora('${dateId}')">🔎 일본 골프장 찾기${d.course ? ' (바꾸기)' : ''}</button></div>` : ''}
            ${gora ? `<div class="trip-actions">
                <a class="trip-btn" href="${escapeHtml(gora)}" target="_blank" rel="noopener">🎫 GORA 예약 (원문)</a>
                <a class="trip-btn" href="${escapeHtml(translateUrl(gora))}" target="_blank" rel="noopener">🇰🇷 한국어로 보기</a>
            </div>` : ''}
            <div class="trip-actions">
                ${targets.map ? `<button type="button" class="trip-btn" onclick="openTripMap('map', '${dateId}')">🗺️ 지도</button>` : ''}
                ${targets.route ? `<button type="button" class="trip-btn" onclick="openTripMap('route', '${dateId}')">🚗 길찾기</button>` : ''}
                <button type="button" class="trip-btn ghost" onclick="editTripDay('${dateId}')">✏️ 고치기</button>
            </div>
        </div>`;
}

function renderTripModal() {
    const body = document.getElementById('tripBody');
    const title = document.getElementById('tripTitle');
    if (!body) return;
    const trip = findTrip(tripOpenId);
    if (tripEditing === 'new' || !trip) {
        if (!trip) tripOpenId = null;
        title.textContent = '🧳 여행';
        body.innerHTML = tripChipsHtml() + newTripHtml();
        return;
    }
    const days = tripDays(trip);
    const today = kstToday();
    title.textContent = `🧳 ${trip.title || '여행 일정'}`;

    const left = days.length ? isoDiff(today, days[0].date) : 0;
    const head = days.length ? `
        <div class="trip-summary">
            <div class="trip-summary-top"><b>${isoLabel(days[0].date)} ~ ${isoLabel(days[days.length - 1].date)}</b><button type="button" class="trip-gear" onclick="editTripSettings()" title="여행 고치기">⚙️</button></div>
            <div class="trip-summary-sub">${TRIP_KINDS[tripKind(trip)]} · ${days.length > 1 ? `${days.length - 1}박 ${days.length}일 · ` : ''}${days.filter(d => d.course).length}라운드${left > 0 ? ` · 출발까지 ${left}일` : ''} · 넷 모두 고칠 수 있어요</div>
        </div>` : '';
    const settings = tripEditing === 'settings' ? settingsHtml(trip) : '';

    const memo = tripEditing === 'memo' ? `
        <div class="trip-day editing">
            <div class="trip-day-head">📋 공통 메모</div>
            <label class="trip-field"><textarea id="tripEdTripMemo" rows="4" maxlength="500" placeholder="준비물, 정산 방법, 항공편 등">${escapeHtml(trip.memo)}</textarea></label>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripMemo()">저장</button>
            </div>
        </div>` : `
        <div class="trip-day">
            <div class="trip-day-head">📋 공통 메모</div>
            <div class="trip-memo${trip.memo ? '' : ' empty'}">${trip.memo ? escapeHtml(trip.memo) : '준비물·정산 방법·항공편 등을 적어 두세요.'}</div>
            <div class="trip-actions"><button type="button" class="trip-btn ghost" onclick="editTripMemo()">✏️ 고치기</button></div>
        </div>`;

    body.innerHTML = tripChipsHtml() + head + settings + days.map((d, i) => tripDayHtml(trip, d, i, today)).join('') + memo;
    days.forEach(d => { if (d.date >= today && d.course) loadTripWeather(d); });
}

function editTripDay(date) { tripEditing = date; renderTripModal(); }
function editTripMemo() { tripEditing = 'memo'; renderTripModal(); }
function editTripSettings() { tripEditing = tripEditing === 'settings' ? null : 'settings'; renderTripModal(); }
function cancelTripEdit() { tripEditing = null; renderTripModal(); }

function saveTripDay(date) {
    const val = id => (document.getElementById(id) || {}).value || '';
    const next = { course: val('tripEdCourse').trim(), area: val('tripEdArea').trim(), tee: val('tripEdTee').trim(), stay: val('tripEdStay').trim(), memo: val('tripEdMemo').trim() };
    const trip = findTrip(tripOpenId);
    const day = trip && tripDays(trip).find(d => d.date === date);
    tripEditing = null;
    if (!day) { showToast('⚠️ 그 날짜를 찾지 못했습니다. 다시 열어 주세요.'); renderTripModal(); return; }
    const changed = Object.keys(next).some(k => (day[k] || '') !== next[k]);
    if (changed) editTrip(t => {
        const target = t.days.find(d => d.date === date);
        if (!target) return false;
        // 골프장 이름을 손으로 바꾸면 GORA에서 받아 둔 위치·예약 주소는 옛 골프장 것이라 걷는다.
        if ((target.course || '') !== next.course) { delete target.lat; delete target.lon; delete target.gora; }
        Object.assign(target, next);
    }, `✅ ${isoLabel(date)} 일정을 저장했습니다.`);
    renderTripModal(); renderTripCard();
}

function saveTripMemo() {
    const text = ((document.getElementById('tripEdTripMemo') || {}).value || '').trim();
    const trip = findTrip(tripOpenId);
    tripEditing = null;
    if (trip && (trip.memo || '') !== text) editTrip(t => { t.memo = text; }, '✅ 공통 메모를 저장했습니다.');
    renderTripModal();
}

// ─── 날씨 ───
// 예보는 16일치뿐이라 그 안에 든 날만 묻는다. 같은 곳·같은 날은 10분간 다시 안 묻는다
// (공지 카드의 날씨와 같은 규칙 — `res.ok`를 보고 429면 잠시 쉰다). 시간대는 그곳 시간(auto)이다.
const tripWeather = {};
const tripWeatherBusy = {};

function tripWeatherHtml(d) {
    const geo = dayGeo(d);
    if (!geo) return `🌤️ 날씨: 골프장 위치를 몰라 예보를 못 봅니다`;
    const left = isoDiff(kstToday(), d.date);
    if (left > 15) return `🌤️ 날씨: 예보는 ${isoLabel(isoAdd(d.date, -15))}부터 나와요`;
    const hit = tripWeather[`${geo.lat},${geo.lon}|${d.date}`];
    return hit ? hit.html : `🌤️ 날씨 확인중...`;
}

async function loadTripWeather(d) {
    const geo = dayGeo(d);
    if (!geo || isoDiff(kstToday(), d.date) > 15) return;
    const key = `${geo.lat},${geo.lon}|${d.date}`;
    const hit = tripWeather[key];
    if ((hit && Date.now() - hit.at < WEATHER_TTL) || tripWeatherBusy[key]) return;
    if (Date.now() < weatherBlockedUntil) return;
    tripWeatherBusy[key] = true;
    const paint = html => { const el = document.getElementById('tripWx-' + d.date); if (el) el.innerHTML = html; };
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 429) weatherBlockedUntil = Date.now() + WEATHER_COOLDOWN;
            paint('🌤️ 날씨를 불러오지 못했습니다.');
            return;
        }
        const data = await res.json();
        const idx = data.daily && data.daily.time ? data.daily.time.indexOf(d.date) : -1;
        if (idx < 0) { paint('🌤️ 날씨를 불러오지 못했습니다.'); return; }
        const info = weatherIcon(data.daily.weathercode[idx]);
        const rain = data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[idx] : null;
        const html = `${info.i} ${info.d} · ${Math.round(data.daily.temperature_2m_min[idx])}°~${Math.round(data.daily.temperature_2m_max[idx])}°${rain != null ? ` · 강수 ${rain}%` : ''}`;
        tripWeather[key] = { html, at: Date.now() };
        paint(html);
    } catch (e) {
        paint('🌤️ 날씨를 불러오지 못했습니다.');
    } finally {
        delete tripWeatherBusy[key];
    }
}

// ═══ 일본 골프장 찾기 (라쿠텐 GORA) ═══════════════════════════════
// 흐름: 기준 위치(숙소·역 이름을 찾거나 지도를 눌러 고른다) → 범위·최대 금액 → GORA에 그날 예약 가능한
// 플랜을 묻는다 → 지도와 목록(가까운 순)에 펼친다 → `이 날로 정하기`가 그 날짜의 골프장으로 넣는다.
// **예약·결제는 앱이 못 한다** — 라쿠텐이 예약 API를 열어 두지 않았다. 그래서 그 골프장의 GORA 예약
// 페이지를 열어 주고(원문 / 구글 번역으로 한국어), 사람이 거기서 예약한다.
// 라쿠텐에 묻는 일은 Supabase 함수 `gora`가 한다(열쇠를 앱에 둘 수 없다 — 공개 저장소).
// 그 함수는 이름을 고른 칸만 넘기는 얇은 심부름꾼이라, 묻는 방법을 바꿀 땐 여기만 고치면 된다.

const GORA_RANGES = [20, 40, 60, 100];   // km (직선)
const GORA_PRICES = [0, 10000, 15000, 20000, 30000];   // 0 = 상관없음
const GORA_PAGES = 3;   // 한 번에 30곳씩, 최대 90곳까지 본다
const JP_PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];

let gora = { date: null, base: null, range: 40, price: 0, items: [], busy: false, map: null, layer: null, places: [] };

function translateUrl(url) {
    return `https://translate.google.com/translate?sl=ja&tl=ko&u=${encodeURIComponent(url)}`;
}

function openGora(date) {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    gora.date = date;
    gora.items = [];
    gora.places = [];
    gora.error = null; gora._searched = false;
    gora.base = trip.base && isFinite(trip.base.lat) ? { ...trip.base } : null;
    document.getElementById('goraModal').classList.add('active');
    renderGora();
    loadLeaflet().then(() => { drawGoraMap(); paintGoraMap(); setTimeout(() => gora.map && gora.map.invalidateSize(), 300); })
        .catch(() => { const m = document.getElementById('goraMap'); if (m) m.innerHTML = '<div class="trip-empty">지도를 불러오지 못했습니다.</div>'; });
}
function closeGora() {
    document.getElementById('goraModal').classList.remove('active');
}

// 지도는 한 번 만들어 두고 위(기준 위치)·아래(조건·결과)만 다시 그린다 — 지도까지 다시 만들면 보던 자리가 튄다.
function renderGora() {
    const top = document.getElementById('goraTop'), bottom = document.getElementById('goraBottom');
    if (!top || !bottom) return;
    const chip = (on, label, fn) => `<button type="button" class="trip-chip${on ? ' on' : ''}" onclick="${fn}">${label}</button>`;
    top.innerHTML = `
        <div class="gora-date">📅 ${gora.date ? isoLabel(gora.date) : ''}에 칠 곳</div>
        <div class="trip-field">📍 기준 위치 (숙소·역·지역)
            <div class="gora-search"><input type="text" id="goraPlace" maxlength="60" placeholder="예: 신주쿠, Narita, 東京駅" value="${gora.base ? escapeHtml(gora.base.name) : ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();findGoraPlace();}"><button type="button" class="trip-btn" onclick="findGoraPlace()">찾기</button></div>
        </div>
        <div id="goraPlaces"></div>
        <div class="gora-hint">${gora.base ? `기준: <b>${escapeHtml(gora.base.name)}</b> · 지도를 누르면 바꿀 수 있어요` : '이름으로 찾거나 아래 지도를 눌러 기준 위치를 고르세요.'}</div>`;
    bottom.innerHTML = `
        <div class="trip-field">범위 (직선거리)<div class="trip-chips">${GORA_RANGES.map(r => chip(gora.range === r, `${r}km <small>차로 ~${driveMinutes(r)}분</small>`, `setGoraRange(${r})`)).join('')}</div></div>
        <div class="trip-field">1인 최대 금액<div class="trip-chips">${GORA_PRICES.map(p => chip(gora.price === p, p ? `¥${p.toLocaleString()}` : '상관없음', `setGoraPrice(${p})`)).join('')}</div></div>
        <div class="trip-actions"><button type="button" class="trip-btn primary" onclick="searchGora()"${gora.busy ? ' disabled' : ''}>${gora.busy ? '찾는 중…' : '⛳ 그날 예약 가능한 골프장 찾기'}</button></div>
        <div id="goraResult"></div>`;
    renderGoraPlaces();
    renderGoraResult();
}

function setGoraRange(r) { gora.range = r; renderGora(); paintGoraMap(); }
function setGoraPrice(p) { gora.price = p; renderGora(); }

// 지도 그림은 Leaflet + OpenStreetMap 타일. 열쇠가 필요 없고, 처음 열 때만 받는다.
let leafletLoading = null;
function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
        document.head.appendChild(css);
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
        s.onload = () => resolve();
        s.onerror = () => { leafletLoading = null; reject(new Error('leaflet')); };
        document.head.appendChild(s);
    });
    return leafletLoading;
}

function drawGoraMap() {
    const box = document.getElementById('goraMap');
    if (!box || !window.L) return;
    if (!gora.map) {
        box.innerHTML = '';
        gora.map = L.map(box, { zoomControl: true, attributionControl: true }).setView([35.68, 139.76], 8);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' }).addTo(gora.map);
        gora.layer = L.layerGroup().addTo(gora.map);
        gora.map.on('click', e => setGoraBase({ name: `지도에서 고른 곳 (${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)})`, lat: e.latlng.lat, lon: e.latlng.lng }));
    }
}

function paintGoraMap() {
    if (!gora.map || !gora.layer) return;
    gora.layer.clearLayers();
    const pts = [];
    if (gora.base) {
        L.circle([gora.base.lat, gora.base.lon], { radius: gora.range * 1000, color: '#0f766e', weight: 1, fillOpacity: 0.05 }).addTo(gora.layer);
        L.marker([gora.base.lat, gora.base.lon], { icon: L.divIcon({ className: 'gora-pin base', html: '🏨', iconSize: [28, 28] }) }).addTo(gora.layer);
        pts.push([gora.base.lat, gora.base.lon]);
    }
    gora.items.forEach((it, i) => {
        if (!it.geo) return;
        const m = L.marker([it.geo.lat, it.geo.lon], { icon: L.divIcon({ className: 'gora-pin', html: `<b>${i + 1}</b>`, iconSize: [24, 24] }) }).addTo(gora.layer);
        m.on('click', () => { const row = document.getElementById('goraItem' + i); if (row) { row.scrollIntoView({ block: 'nearest' }); row.classList.add('flash'); setTimeout(() => row.classList.remove('flash'), 1200); } });
        pts.push([it.geo.lat, it.geo.lon]);
    });
    if (pts.length > 1) gora.map.fitBounds(pts, { padding: [24, 24], maxZoom: 12 });
    else if (pts.length === 1) gora.map.setView(pts[0], 10);
}

// 기준 위치는 OpenStreetMap의 이름 찾기(Nominatim)로 찾는다. 열쇠가 필요 없다(가끔만 쓰는 정도면 된다).
async function findGoraPlace() {
    const q = ((document.getElementById('goraPlace') || {}).value || '').trim();
    if (!q) { showToast('⚠️ 숙소나 지역 이름을 적어 주세요.'); return; }
    const box = document.getElementById('goraPlaces');
    if (box) box.innerHTML = '<div class="gora-hint">찾는 중…</div>';
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=jp&accept-language=ko&q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(res.status);
        const list = await res.json();
        gora.places = (Array.isArray(list) ? list : []).map(p => ({
            name: p.name || String(p.display_name || '').split(',')[0],
            full: p.display_name || '', lat: parseFloat(p.lat), lon: parseFloat(p.lon),
            pref: prefCode(p.address)
        })).filter(p => isFinite(p.lat) && isFinite(p.lon));
        if (!gora.places.length && box) { box.innerHTML = '<div class="gora-hint">못 찾았습니다. 영어·일본어로도 쳐 보거나 지도를 눌러 고르세요.</div>'; return; }
        renderGoraPlaces();
    } catch (e) {
        if (box) box.innerHTML = '<div class="gora-hint">위치 찾기에 실패했습니다. 지도를 눌러 고를 수도 있어요.</div>';
    }
}
function renderGoraPlaces() {
    const box = document.getElementById('goraPlaces');
    if (!box) return;
    box.innerHTML = gora.places.length ? `<div class="gora-places">${gora.places.map((p, i) => `<button type="button" class="gora-place" onclick="pickGoraPlace(${i})"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.full)}</small></button>`).join('')}</div>` : '';
}
function pickGoraPlace(i) {
    const p = gora.places[i];
    if (!p) return;
    gora.places = [];
    setGoraBase({ name: p.name, lat: p.lat, lon: p.lon, pref: p.pref });
}
// 기준 위치는 여행에 남긴다 — 다음에 열거나 남이 열어도 그대로 뜬다.
function setGoraBase(base) {
    gora.base = base;
    const trip = findTrip(tripOpenId);
    if (trip && !(trip.base && trip.base.lat === base.lat && trip.base.lon === base.lon)) {
        editTrip(t => { t.base = { name: base.name, lat: +base.lat.toFixed(5), lon: +base.lon.toFixed(5), ...(base.pref ? { pref: base.pref } : {}) }; });
    }
    renderGora();
    paintGoraMap();
}

function prefCode(addr) {
    const text = addr ? [addr.province, addr.state, addr.region, addr.city].filter(Boolean).join(' ') : '';
    const ko = { '홋카이도': 1, '아오모리': 2, '이와테': 3, '미야기': 4, '아키타': 5, '야마가타': 6, '후쿠시마': 7, '이바라키': 8, '도치기': 9, '군마': 10, '사이타마': 11, '지바': 12, '도쿄': 13, '가나가와': 14, '니가타': 15, '도야마': 16, '이시카와': 17, '후쿠이': 18, '야마나시': 19, '나가노': 20, '기후': 21, '시즈오카': 22, '아이치': 23, '미에': 24, '시가': 25, '교토': 26, '오사카': 27, '효고': 28, '나라': 29, '와카야마': 30, '돗토리': 31, '시마네': 32, '오카야마': 33, '히로시마': 34, '야마구치': 35, '도쿠시마': 36, '가가와': 37, '에히메': 38, '고치': 39, '후쿠오카': 40, '사가': 41, '나가사키': 42, '구마모토': 43, '오이타': 44, '미야자키': 45, '가고시마': 46, '오키나와': 47 };
    for (const [k, v] of Object.entries(ko)) if (text.includes(k)) return v;
    const i = JP_PREFS.findIndex(p => text.includes(p));
    return i >= 0 ? i + 1 : null;
}

async function goraCall(api, params) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ api, params })
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) return { error: 'no_function' };
    if (out.error === 'not_configured') return { error: 'not_configured' };
    const data = out.data || {};
    if (out.error || data.error || (out.status && out.status >= 400)) {
        // 라쿠텐이 준 답을 **통째로** 적는다 — 판마다 오류 칸 이름이 달라(`error`·`errors`·`message`…)
        // 몇 개만 골라 적었더니 `403` 숫자 하나만 남아 무엇이 틀렸는지 알 수 없었다.
        let detail = '';
        try { detail = JSON.stringify(data); } catch (e) { detail = String(data); }
        if (detail === '{}') detail = '';
        return { error: 'api', message: [out.status, out.message, out.error, detail.slice(0, 400)].filter(Boolean).join(' · ') };
    }
    const raw = data.Items || data.items || [];
    return { items: raw.map(x => x && x.Item ? x.Item : x).filter(Boolean), count: data.count, pageCount: data.pageCount };
}

// GORA 답에서 쓸 것만 골라 한 모양으로 맞춘다. 판(formatVersion)에 따라 감싸는 모양이 달라 둘 다 읽는다.
function goraItem(raw) {
    const lat = parseFloat(raw.latitude), lon = parseFloat(raw.longitude);
    const plans = (raw.planInfo || raw.plans || []).map(p => p && p.plan ? p.plan : p).filter(Boolean).map(p => {
        const call = Array.isArray(p.callInfo) ? p.callInfo[0] : (p.callInfo || {});
        return {
            name: p.planName || '', price: parseInt(p.price || p.basePrice, 10) || 0,
            time: p.startTimeZone || '', round: p.round || '', lunch: p.lunch, cart: p.cart, caddie: p.caddie,
            url: (call && (call.reservePageUrl || call.reservePageUrlMobile)) || p.planUrl || ''
        };
    }).sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
    const url = (plans.find(p => /^https:\/\//.test(p.url)) || {}).url || raw.reserveCalUrl || raw.golfCourseDetailUrl || raw.golfCourseUrl || '';
    return {
        id: raw.golfCourseId, name: raw.golfCourseName || raw.golfCourseAbbr || '(이름 없음)', kana: raw.golfCourseNameKana || '',
        address: raw.address || '', image: raw.golfCourseImageUrl || raw.golfCourseImageUrl1 || '',
        rating: parseFloat(raw.evaluation) || 0,
        geo: isFinite(lat) && isFinite(lon) && lat ? { lat, lon } : null,
        plans, url: /^https:\/\//.test(url) ? url : ''
    };
}

async function searchGora() {
    if (!gora.base) { showToast('⚠️ 먼저 기준 위치를 골라 주세요.'); return; }
    if (gora.busy) return;
    gora.busy = true; gora.items = []; gora.note = ''; gora.error = null; gora._searched = true;
    renderGora();
    const common = { playDate: gora.date, hits: 30, ...(gora.price ? { maxPrice: gora.price } : {}) };
    let found = [], first = null;
    try {
        // 1) 위치로 묻는다. 2) 답이 없거나 그 칸을 모르면 그 지역(현)으로 묻고 거리는 여기서 잰다.
        for (let page = 1; page <= GORA_PAGES; page++) {
            const r = await goraCall('plan', { ...common, latitude: gora.base.lat.toFixed(5), longitude: gora.base.lon.toFixed(5), searchRange: gora.range, page });
            if (page === 1) first = r;
            if (r.error) break;
            found = found.concat(r.items);
            if (r.items.length < 30 || (r.pageCount && page >= r.pageCount)) break;
        }
        if (first && (first.error === 'not_configured' || first.error === 'no_function')) { gora.error = first; return; }
        const pref = gora.base.pref || null;
        if (!found.length && pref) {
            for (let page = 1; page <= GORA_PAGES; page++) {
                const r = await goraCall('plan', { ...common, areaCode: pref, page });
                if (r.error) { if (!first || !first.error) first = r; break; }
                found = found.concat(r.items);
                if (r.items.length < 30 || (r.pageCount && page >= r.pageCount)) break;
            }
            gora.note = '지역 전체에서 찾아 거리로 걸렀습니다.';
        }
        if (!found.length && first && first.error) { gora.error = first; return; }
        const seen = new Set();
        gora.items = found.map(goraItem).filter(it => { const k = it.id || it.name; if (seen.has(k)) return false; seen.add(k); return true; })
            .map(it => ({ ...it, km: it.geo ? kmBetween(gora.base, it.geo) : null }))
            .filter(it => it.km === null || it.km <= gora.range * 1.05)
            .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
    } catch (e) {
        gora.error = { error: 'network', message: String(e && e.message || e) };
    } finally {
        gora.busy = false;
        renderGora();
        paintGoraMap();
    }
}

function renderGoraResult() {
    const box = document.getElementById('goraResult');
    if (!box) return;
    const e = gora.error;
    if (e) {
        box.innerHTML = e.error === 'not_configured' || e.error === 'no_function'
            ? `<div class="gora-setup"><b>아직 라쿠텐과 연결되지 않았습니다.</b><br>라쿠텐 앱 등록과 Supabase 설정이 한 번 필요합니다(설명서 <code>docs/일본골프장찾기.md</code>). 설정이 끝나면 이 단추가 바로 됩니다.</div>`
            : `<div class="gora-setup">라쿠텐에서 답을 받지 못했습니다.<br><small>${escapeHtml(e.message || e.error)}</small></div>`;
        return;
    }
    if (gora.busy) { box.innerHTML = '<div class="gora-hint">라쿠텐 GORA에 묻는 중…</div>'; return; }
    if (!gora.items.length) { box.innerHTML = gora.base && gora._searched ? '<div class="gora-hint">그날 예약 가능한 곳이 없습니다. 범위나 금액을 넓혀 보세요.</div>' : ''; return; }
    box.innerHTML = `<div class="gora-hint">${gora.items.length}곳 · 가까운 순${gora.note ? ' · ' + escapeHtml(gora.note) : ''}</div>` + gora.items.map((it, i) => {
        const low = it.plans.find(p => p.price);
        const times = [...new Set(it.plans.map(p => p.time).filter(Boolean))].slice(0, 3).join(', ');
        return `
        <div class="gora-item" id="goraItem${i}">
            <div class="gora-item-top">
                <span class="gora-no">${i + 1}</span>
                <div class="gora-item-name"><b>${escapeHtml(it.name)}</b>${it.kana ? `<small>${escapeHtml(it.kana)}</small>` : ''}</div>
            </div>
            <div class="gora-item-meta">
                ${it.km !== null ? `📍 직선 ${it.km.toFixed(0)}km · 차로 약 ${driveMinutes(it.km)}분` : '📍 거리 모름'}
                ${low ? ` · 💴 ¥${low.price.toLocaleString()}~` : ''}${it.plans.length ? ` · 플랜 ${it.plans.length}개` : ''}${it.rating ? ` · ⭐${it.rating.toFixed(1)}` : ''}
            </div>
            ${times ? `<div class="gora-item-meta">🕐 ${escapeHtml(times)}</div>` : ''}
            ${it.address ? `<div class="gora-item-meta addr">${escapeHtml(it.address)}</div>` : ''}
            <div class="trip-actions">
                ${it.url ? `<a class="trip-btn" href="${escapeHtml(it.url)}" target="_blank" rel="noopener">🎫 예약 (원문)</a><a class="trip-btn" href="${escapeHtml(translateUrl(it.url))}" target="_blank" rel="noopener">🇰🇷 한국어로</a>` : ''}
                <button type="button" class="trip-btn primary" onclick="pickGoraCourse(${i})">이 날로 정하기</button>
            </div>
        </div>`;
    }).join('');
}

function pickGoraCourse(i) {
    const it = gora.items[i];
    const date = gora.date;
    if (!it || !date) return;
    const area = (it.address.match(/^(.+?[都道府県])/) || [])[1] || '';
    const ok = editTrip(t => {
        const d = t.days.find(x => x.date === date);
        if (!d) return false;
        d.course = it.name;
        if (area && !d.area) d.area = area;
        if (it.geo) { d.lat = +it.geo.lat.toFixed(5); d.lon = +it.geo.lon.toFixed(5); } else { delete d.lat; delete d.lon; }
        d.gora = { id: it.id || null, url: it.url || '' };
    }, `✅ ${isoLabel(date)} 골프장을 정했습니다. 예약은 GORA에서 해 주세요.`);
    if (ok) { closeGora(); renderTripModal(); renderTripCard(); }
}
