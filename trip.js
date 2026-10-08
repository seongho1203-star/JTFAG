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
// 여행 알림은 라운드 알림 설정(관리자 메뉴 → 알림 설정)을 같이 쓴다.
// 보내는 것은 scripts/send-reminder.js의 remindTrips — 규칙을 바꾸면 이 문구도 함께 고칠 것.
function tripNotifyText() {
    const days = normalizeDaysBefore((appData.notifySettings || {}).daysBefore);
    const list = days.length ? days : DEFAULT_NOTIFY_SETTINGS.daysBefore;
    const before = list.filter(n => n > 0).map(n => `${n}일 전`);
    const parts = [];
    if (before.length) parts.push(`출발 ${before.join('·')}`);
    if (list.includes(0)) parts.push('여행 중 매일');
    return `🔔 알림: ${parts.join(' · ')} 아침`;
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
    // 다가오는(진행 중 포함) 여행을 출발이 이른 순으로 앞에, 끝난 여행은 그 뒤에 최근 것부터(사용자 제보 —
    // 늦은 날짜 여행이 앞에 서 있었다). 끝난 것까지 이른 순으로 두면 쌓일수록 다가오는 여행이 오른쪽으로 밀려난다.
    const today = kstToday();
    const first = x => (x.days[0] || {}).date || '9999-99-99';
    const done = x => x.days.length > 0 && x.days[x.days.length - 1].date < today;
    const list = allTrips().map(t => ({ t, days: tripDays(t) }))
        .sort((a, b) => done(a) !== done(b) ? (done(a) ? 1 : -1)
            : done(a) ? (first(a) < first(b) ? 1 : first(a) > first(b) ? -1 : 0)
            : (first(a) < first(b) ? -1 : first(a) > first(b) ? 1 : 0));
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
    const end = isoAdd(start, 2);
    return `
        <div class="trip-day editing">
            <div class="trip-day-head">🧳 새 여행 만들기</div>
            <label class="trip-field">여행 이름<input type="text" id="tripNewTitle" maxlength="30"></label>
            <div class="trip-field">어디로?
                <div class="trip-kind-row">${Object.entries(TRIP_KINDS).map(([k, v], i) => `<label class="trip-kind"><input type="radio" name="tripNewKind" value="${k}"${i === 0 ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
            </div>
            <div class="trip-two">
                <label class="trip-field">첫날<input type="date" id="tripNewStart" value="${start}" onchange="tripDatesChanged('start')"></label>
                <label class="trip-field">마지막날<input type="date" id="tripNewEnd" value="${end}" min="${start}" max="${isoAdd(start, TRIP_MAX_DAYS - 1)}" onchange="tripDatesChanged('end')"></label>
            </div>
            <div class="trip-hint" id="tripNewSpan">${tripSpanText(start, end)}</div>
            <div class="trip-hint">날짜마다 골프장·티오프·숙소는 만든 뒤 <b>✏️ 입력</b>으로 적습니다. 일본이면 날마다 <b>🔎 일본 골프장 찾기</b>가 생깁니다.</div>
            <div class="trip-actions">
                ${tripOpenId ? `<button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>` : ''}
                <button type="button" class="trip-btn primary" onclick="createTrip()">만들기</button>
            </div>
        </div>`;
}

// 두 날짜 사이 날수(같은 날이면 0). 한국 날짜 글자(YYYY-MM-DD)끼리 견준다 — 기기 시간대와 무관하다.
function isoDiff(a, b) { return Math.round((Date.UTC(...b.split('-').map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...a.split('-').map((x, i) => i === 1 ? x - 1 : +x))) / 864e5); }
function tripSpanText(start, end) {
    if (!ISO_RE.test(start) || !ISO_RE.test(end)) return '';
    const n = isoDiff(start, end) + 1;
    return n >= 1 ? `${n - 1}박 ${n}일 · ${isoLabel(start, true)} ~ ${isoLabel(end, true)}` : '';
}
// 첫날을 옮기면 마지막날이 따라간다(날수 그대로). 마지막날은 첫날 앞으로도, 14일 넘게도 못 간다.
// 새 여행(`tripNew…`)과 여행 고치기(`tripSet…`)가 같이 쓴다.
function tripDatesChanged(which, pre = 'tripNew') {
    const s = document.getElementById(pre + 'Start'), e = document.getElementById(pre + 'End');
    if (!s || !e || !ISO_RE.test(s.value)) return;
    if (which === 'start') {
        const keep = ISO_RE.test(e.dataset.prevStart || '') && ISO_RE.test(e.value) ? isoDiff(e.dataset.prevStart, e.value) : 2;
        e.value = isoAdd(s.value, Math.min(TRIP_MAX_DAYS - 1, Math.max(0, keep)));
    }
    if (!ISO_RE.test(e.value) || e.value < s.value) e.value = s.value;
    if (isoDiff(s.value, e.value) > TRIP_MAX_DAYS - 1) e.value = isoAdd(s.value, TRIP_MAX_DAYS - 1);
    e.min = s.value; e.max = isoAdd(s.value, TRIP_MAX_DAYS - 1);
    e.dataset.prevStart = s.value;
    const span = document.getElementById(pre + 'Span');
    if (span) span.textContent = tripSpanText(s.value, e.value);
}

function createTrip() {
    const title = (document.getElementById('tripNewTitle').value || '').trim();
    const start = document.getElementById('tripNewStart').value;
    const end = document.getElementById('tripNewEnd').value;
    const kindEl = document.querySelector('input[name="tripNewKind"]:checked');
    const kind = kindEl && TRIP_KINDS[kindEl.value] ? kindEl.value : 'domestic';
    if (!title) { showToast('⚠️ 여행 이름을 적어 주세요.'); return; }
    if (!ISO_RE.test(start)) { showToast('⚠️ 첫날을 골라 주세요.'); return; }
    if (!ISO_RE.test(end)) { showToast('⚠️ 마지막날을 골라 주세요.'); return; }
    if (end < start) { showToast('⚠️ 마지막날이 첫날보다 앞입니다.'); return; }
    const n = isoDiff(start, end) + 1;
    if (n > TRIP_MAX_DAYS) { showToast(`⚠️ 여행은 ${TRIP_MAX_DAYS}일까지 만들 수 있어요.`); return; }
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
    const start = days.length ? days[0].date : isoAdd(kstToday(), 14);
    const end = days.length ? days[days.length - 1].date : start;
    return `
        <div class="trip-day editing">
            <div class="trip-day-head">⚙️ 여행 고치기</div>
            <label class="trip-field">여행 이름<input type="text" id="tripSetTitle" maxlength="30" value="${escapeHtml(trip.title)}"></label>
            <div class="trip-field">어디로?
                <div class="trip-kind-row">${Object.entries(TRIP_KINDS).map(([k, v]) => `<label class="trip-kind"><input type="radio" name="tripSetKind" value="${k}"${tripKind(trip) === k ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
            </div>
            <div class="trip-two">
                <label class="trip-field">첫날<input type="date" id="tripSetStart" value="${start}" onchange="tripDatesChanged('start', 'tripSet')"></label>
                <label class="trip-field">마지막날<input type="date" id="tripSetEnd" value="${end}" min="${start}" max="${isoAdd(start, TRIP_MAX_DAYS - 1)}" data-prev-start="${start}" onchange="tripDatesChanged('end', 'tripSet')"></label>
            </div>
            <div class="trip-hint" id="tripSetSpan">${tripSpanText(start, end)}</div>
            <div class="trip-hint">날짜를 옮기면 날마다 적어 둔 골프장·티오프·숙소는 <b>1일차부터 차례대로</b> 따라갑니다.</div>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripSettings()">저장</button>
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

const dayFilled = d => !!(d && (d.course || d.tee || d.stay || d.memo || d.area));
// 날짜를 바꾸면 날마다 적어 둔 것은 **순서대로** 새 날짜에 붙는다(1일차 → 새 1일차). 여행을 미루는 일이 대부분이라
// 그게 맞고, 끝을 늘리거나 줄이는 것도 같은 규칙으로 된다. 줄어서 빠지는 날에 적어 둔 게 있으면 한 번 더 묻는다.
async function saveTripSettings() {
    const title = (document.getElementById('tripSetTitle').value || '').trim();
    const kindEl = document.querySelector('input[name="tripSetKind"]:checked');
    const kind = kindEl && TRIP_KINDS[kindEl.value] ? kindEl.value : 'domestic';
    const start = (document.getElementById('tripSetStart') || {}).value || '';
    const end = (document.getElementById('tripSetEnd') || {}).value || '';
    if (!title) { showToast('⚠️ 여행 이름을 적어 주세요.'); return; }
    if (!ISO_RE.test(start) || !ISO_RE.test(end)) { showToast('⚠️ 첫날과 마지막날을 골라 주세요.'); return; }
    if (end < start) { showToast('⚠️ 마지막날이 첫날보다 앞입니다.'); return; }
    const n = isoDiff(start, end) + 1;
    if (n > TRIP_MAX_DAYS) { showToast(`⚠️ 여행은 ${TRIP_MAX_DAYS}일까지 만들 수 있어요.`); return; }
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    const old = tripDays(trip);
    const datesChanged = !old.length || old[0].date !== start || old.length !== n;
    const dropped = old.slice(n).filter(dayFilled);
    if (datesChanged && dropped.length && !await showConfirmPrompt(`날짜가 줄어 <b>${dropped.map(d => `${old.indexOf(d) + 1}일차`).join(', ')}</b> 일정이 빠집니다.<br><span style="font-weight:500;color:#cbd5e1;">적어 둔 골프장·메모도 함께 사라집니다.</span>`, '바꾸기')) return;
    if (trip.title !== title || tripKind(trip) !== kind || datesChanged) {
        editTrip(t => {
            t.title = title; t.kind = kind;
            if (datesChanged) {
                const cur = tripDays(t);   // 묻는 사이 남이 고쳤을 수 있어 지금 것을 다시 읽는다
                t.days = Array.from({ length: n }, (_, i) => ({ ...(cur[i] || { course: '', area: '', tee: '', stay: '', memo: '' }), date: isoAdd(start, i) }));
            }
        }, datesChanged ? `✅ ${tripSpanText(start, end)}로 바꿨습니다.` : '✅ 저장했습니다.');
    }
    tripEditing = null; renderTripModal(); renderTripCard();
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
            <label class="trip-field">⛳ 골프장<input type="text" id="tripEdCourse" maxlength="60" autocomplete="off" value="${escapeHtml(d.course)}"${kind === 'domestic' ? ' onfocus="this.select(); tripCourseSuggest(true)" oninput="tripCourseSuggest()" onblur="tripCourseHide()"' : ''}></label>
            ${kind === 'domestic' ? '<div id="tripCourseResults" class="course-results" style="display:none;"></div>' : ''}
            <label class="trip-field">📍 지역<input type="text" id="tripEdArea" maxlength="20" value="${escapeHtml(d.area)}"></label>
            <label class="trip-field">🕐 티오프<input type="text" id="tripEdTee" maxlength="20" value="${escapeHtml(d.tee)}"></label>
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
    const gora = d.gora ? goraUrl(d.gora.url) || (d.course ? goraSearchUrl(d.gora.ja || d.course) : '') : '';
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
                <a class="trip-btn" href="${escapeHtml(gora)}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">🎫 GORA에서 예약</a>
            </div>` : ''}
            <div class="trip-actions">
                ${targets.map ? `<button type="button" class="trip-btn" onclick="openTripMap('map', '${dateId}')">🗺️ 지도</button>` : ''}
                ${targets.route ? `<button type="button" class="trip-btn" onclick="openTripMap('route', '${dateId}')">🚗 길찾기</button>` : ''}
                <button type="button" class="trip-btn ghost" onclick="editTripDay('${dateId}')">✏️ 입력</button>
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
            <div class="trip-summary-sub">${tripNotifyText()}</div>
        </div>` : '';
    const settings = tripEditing === 'settings' ? settingsHtml(trip) : '';

    const memo = tripEditing === 'memo' ? `
        <div class="trip-day editing">
            <div class="trip-day-head">📋 공통 메모</div>
            <label class="trip-field"><textarea id="tripEdTripMemo" rows="4" maxlength="500">${escapeHtml(trip.memo)}</textarea></label>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripMemo()">저장</button>
            </div>
        </div>` : `
        <div class="trip-day">
            <div class="trip-day-head">📋 공통 메모</div>
            <div class="trip-memo${trip.memo ? '' : ' empty'}">${trip.memo ? escapeHtml(trip.memo) : '준비물·정산 방법·항공편 등을 적어 두세요.'}</div>
            <div class="trip-actions"><button type="button" class="trip-btn ghost" onclick="editTripMemo()">✏️ 입력</button></div>
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
// 플랜을 묻는다 → 지도와 목록(가까운 순)에 펼친다 → `날짜 선택 완료`가 그 날짜의 골프장으로 넣는다.
// **예약·결제는 앱이 못 한다** — 라쿠텐이 예약 API를 열어 두지 않았다. 그래서 그 골프장의 GORA 예약
// 페이지를 열어 주고(원문 / 구글 번역으로 한국어), 사람이 거기서 예약한다.
// 라쿠텐에 묻는 일은 Supabase 함수 `gora`가 한다(열쇠를 앱에 둘 수 없다 — 공개 저장소).
// 그 함수는 이름을 고른 칸만 넘기는 얇은 심부름꾼이라, 묻는 방법을 바꿀 땐 여기만 고치면 된다.

const GORA_RANGES = [20, 40, 60, 100];   // km (직선)
const GORA_PRICES = [0, 10000, 15000, 20000, 30000];   // 0 = 상관없음
const GORA_PAGES = 3;   // 한 번에 30곳씩, 최대 90곳까지 본다
const JP_PREFS_KO = ['홋카이도', '아오모리', '이와테', '미야기', '아키타', '야마가타', '후쿠시마', '이바라키', '도치기', '군마', '사이타마', '지바', '도쿄', '가나가와', '니가타', '도야마', '이시카와', '후쿠이', '야마나시', '나가노', '기후', '시즈오카', '아이치', '미에', '시가', '교토', '오사카', '효고', '나라', '와카야마', '돗토리', '시마네', '오카야마', '히로시마', '야마구치', '도쿠시마', '가가와', '에히메', '고치', '후쿠오카', '사가', '나가사키', '구마모토', '오이타', '미야자키', '가고시마', '오키나와'];
const JP_PREFS = ['北海道', '青森', '岩手', '宮城', '秋田', '山形', '福島', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '富山', '石川', '福井', '山梨', '長野', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '岡山', '広島', '山口', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '沖縄'];

let gora = { date: null, base: null, range: 40, price: 0, items: [], all: [], busy: false, map: null, layer: null, places: [], raw: {}, opts: goraLoadOpts(), time: '' };

// ─── 세부 조건 ───
// 라쿠텐에 묻는 칸 이름을 확신할 수 없어(문서가 막혀 있다) **받은 플랜을 앱이 거른다.** 그래서 조건을 바꿔도
// 다시 묻지 않고 그 자리에서 목록이 바뀐다. 플랜마다 `lunch`·`playerNumMin`·`assu2sum`이 온다.
const GORA_OPTS = [
    { key: 'two', label: '👥 2인 가능', tag: '2인', test: p => p.two },
    { key: 'lunch', label: '🍱 점심 포함', tag: '점심', test: p => p.lunch },
    { key: 'no9', label: '⛳ 9홀 제외', tag: '', test: p => !p.half }
];
// 9홀(하프) 플랜 · 9홀짜리 골프장. 라쿠텐에 정해진 칸이 없어 이름과 `round` 값으로 가린다.
// `ハーフ` 하나만으로 보지 말 것 — 18홀 플랜에도 `ハーフ休憩`(9홀 끝나고 쉬는 시간)·`ハーフ後`가 흔히 붙는다.
const HALF_RE = /ハーフ(ラウンド|プレー|プレイ|のみ|プラン|コース|R)|(^|[^0-9０-９])(9|９)\s*(H|Ｈ|ホール|holes?)|0\.5\s*R|9홀|하프/i;
function goraHalf(p) {
    const r = p.round;
    if (typeof r === 'number' && r > 0 && r < 1) return true;
    if (typeof r === 'string' && (/^\s*ハーフ|0\.5/.test(r) || /^\s*(9|９)\s*(H|ホール)?\s*$/i.test(r))) return true;
    return HALF_RE.test(String(p.planName || ''));
}
function goraNine(raw) {
    const n = parseInt(raw.holeCount ?? raw.holes ?? raw.hole, 10);
    if (n === 9) return true;
    return /(^|[^0-9０-９])(9|９)\s*(H|Ｈ|ホール)|ショートコース|ハーフコース/i.test(String(raw.golfCourseName || ''));
}
// 외국인(한국인)을 안 받는 골프장 — 라쿠텐에 따로 칸이 없어 **답에 적힌 글**에서 찾는다(플랜·골프장 검색 답 통째로).
// 적혀 있는 것만 잡히므로 '확실히 받는다'는 뜻이 아니다. 화면에도 그렇게 적는다.
const FOREIGN_NO = /外国(人|籍)[^。\n"]{0,30}?(不可|お断り|ご遠慮|受け?付け?(でき|致しかね|いたしかね|不可)|NG|できません)|日本人(の方)?(のみ|限定)|日本国籍|日本語(が|を)?[^。\n"]{0,10}?(話せ|理解|できる|可能な)[^。\n"]{0,6}?方(のみ|限定|に限)|Japanese (speakers?|residents?|nationals?) only|no foreign/i;
const FOREIGN_OK = /外国(人|籍)[^。\n"]{0,10}?(歓迎|OK|可能|大歓迎|ウェルカム)|インバウンド|English (OK|available|menu|speaking)|foreigners? welcome|訪日/i;
function goraForeign(raw) {
    let t = '';
    try { t = JSON.stringify(raw); } catch (e) { return ''; }
    return FOREIGN_NO.test(t) ? 'no' : FOREIGN_OK.test(t) ? 'yes' : '';
}
const GORA_FOREIGN = { key: 'foreign', label: '🇰🇷 외국인 제한 없는 곳' };
const GORA_TIMES = [['', '상관없음'], ['am', '🌅 오전 (~11시)'], ['pm', '🌇 오후 (11시~)']];
function goraLoadOpts() { try { const o = JSON.parse(localStorage.getItem('jtfag_gora_opts') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function goraFlag(v) {
    if (v === undefined || v === null || v === '') return undefined;
    if (v === true || v === 1 || v === '1' || v === 'true') return true;
    if (v === false || v === 0 || v === '0' || v === 'false') return false;
    return !!v;
}
function goraHour(v) {
    const m = String(v ?? '').match(/\d+/);
    const h = m ? parseInt(m[0], 10) : NaN;
    return h >= 4 && h <= 19 ? h : undefined;
}
// 플랜 이름에 자주 나오는 말만 한글로 바꾼다(나머지는 일본어 그대로 — 예약 화면과 맞춰 보는 데 쓴다).
const PLAN_WORDS = [['割増無し', '할증 없음'], ['割増なし', '할증 없음'], ['割増無', '할증 없음'], ['割増', '할증'], ['期間限定', '기간 한정'], ['時間限定', '시간 한정'], ['枠限定', '수량 한정'],
    ['イチオシ', '추천'], ['タイムサービス', '타임 서비스'], ['レギュラー', '레귤러'], ['キャンペーン', '캠페인'], ['昼補助', '점심 지원'], ['補助', '지원'], ['料金', '요금'],
    ['乗用', '승용'], ['保証', '확약'], ['先着', '선착순'], ['休日', '휴일'], ['祝日', '공휴일'], ['朝食', '아침 식사'], ['無料', '무료'], ['送迎', '송영'], ['込み', ' 포함'], ['コンペ', '단체 경기'],
    ['2サム保証', '2인 확약'], ['２サム保証', '2인 확약'], ['2サム', '2인'], ['昼食付き', '점심 포함'], ['昼食付', '점심 포함'], ['昼食', '점심'], ['乗用カート', '카트'], ['カート付', '카트 포함'],
    ['キャディ付き', '캐디 포함'], ['キャディ付', '캐디 포함'], ['キャディ', '캐디'], ['セルフ', '셀프'], ['スループレー', '스루 플레이'], ['ハーフラウンド', '9홀 라운드'], ['ハーフプレー', '9홀 플레이'], ['ハーフ休憩あり', '9홀 후 휴식'], ['ハーフ休憩', '9홀 후 휴식'], ['休憩', '휴식'], ['ハーフ', '하프'], ['1ドリンク', '음료 1잔'], ['ドリンク', '음료'],
    ['平日', '평일'], ['土日祝', '주말·공휴일'], ['土日', '주말'], ['早朝', '이른 아침'], ['午前', '오전'], ['午後', '오후'], ['薄暮', '해질녘'], ['限定', '한정'], ['割引', '할인'], ['特典', '혜택'],
    ['お得', '알뜰'], ['プラン', '플랜'], ['ポイント', '포인트'], ['付き', ' 포함'], ['付', ' 포함']];
function koPlan(name) {
    let s = String(name || '').normalize('NFKC');
    for (const [ja, ko] of PLAN_WORDS) s = s.split(ja.normalize('NFKC')).join(ko);
    return s.replace(/【/g, '[').replace(/】/g, '] ').replace(/\s+/g, ' ').trim();
}
// ─── 플랜 이름 기계 번역 ───
// koPlan()은 흔한 말만 바꿔 한자가 반쯤 남는다(사용자 제보 — `일부만 한글`). 그래서 찾은 뒤에
// 구글 번역(키가 필요 없는 공개 주소)으로 일본어 원문을 통째로 옮겨 갈아 끼운다.
// 못 받으면(막혔거나 끊김) koPlan() 결과가 그대로 남는다 — 번역은 덤이라 실패해도 알리지 않는다.
// 한 번 옮긴 것은 이 폰에 기억한다(`jtfag_gora_tr`) — 같은 골프장을 다시 찾으면 곧바로 한글이다.
const GORA_TR_KEY = 'jtfag_gora_tr', GORA_TR_MAX = 600, GORA_TR_CHUNK = 500;
let goraTr = (() => { try { return JSON.parse(localStorage.getItem(GORA_TR_KEY)) || {}; } catch (e) { return {}; } })();
const planKey = name => String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
// 골프 말은 번역기가 엉뚱하게 옮겨서(2サム → 2섬) 보내기 전에 먼저 바꿔 둔다.
const PLAN_PRE = [[/[2２]サム保証/g, '2인 확약'], [/[2２]サム/g, '2인'], [/(\d)サム/g, '$1인'], [/(\d)B(?![a-zA-Z])/g, '$1인'],
    [/ハーフ休憩(あり)?/g, '9홀 후 휴식'], [/スループレ[ーイ]/g, '스루 플레이'], [/コンペ/g, '단체 경기'], [/割増(無し|なし|無)/g, '할증 없음'], [/セルフ/g, '셀프']];
function goraPlanKo(name) {
    const k = planKey(name);
    return goraTr[k] || koPlan(name);
}
const JA_LEFT = /[぀-ヿ]/;   // 가나가 남았으면 덜 옮긴 것
async function goraTranslateBatch(list) {
    const src = list.map(k => PLAN_PRE.reduce((t, [re, ko]) => t.replace(re, ko), k).replace(/\n/g, ' '));
    const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=ja&tl=ko&dt=t&q=' + encodeURIComponent(src.join('\n')));
    if (!res.ok) throw new Error('번역 ' + res.status);
    const data = await res.json();
    const out = (Array.isArray(data && data[0]) ? data[0] : []).map(seg => (seg && seg[0]) || '').join('').split('\n').map(t => t.trim());
    if (out.length !== list.length) throw new Error('번역 줄 수가 다름');
    return out;
}
async function goraTranslatePlans(seq) {
    // 보이는 플랜부터(골프장마다 셋), 그다음 나머지 — 조건을 바꾸면 다른 플랜이 보이므로 다 옮겨 둔다.
    const order = [...gora.items.flatMap(it => (it.fit || it.plans).slice(0, 3)), ...gora.all.flatMap(it => it.plans)];
    const want = [...new Set(order.map(p => planKey(p.name)))].filter(k => k && !goraTr[k] && /[぀-ヿ一-鿿]/.test(k)).slice(0, 200);
    let done = 0;
    for (let i = 0; i < want.length;) {
        const chunk = [];
        let len = 0;
        while (i < want.length && (chunk.length === 0 || len + want[i].length < GORA_TR_CHUNK)) { len += want[i].length + 1; chunk.push(want[i++]); }
        let got = null;
        try { got = await goraTranslateBatch(chunk); }
        catch (e) {
            if (/줄 수/.test(e.message)) {   // 묶음이 어긋나면 하나씩 다시
                got = [];
                for (const k of chunk) { try { got.push((await goraTranslateBatch([k]))[0]); } catch (e2) { got.push(''); } }
            } else { console.warn('[GORA] 플랜 번역 실패:', e.message); break; }
        }
        if (seq !== gora.seq) return;   // 그사이 새로 찾았으면 버린다
        chunk.forEach((k, j) => {
            let t = got[j] || '';
            if (!t) return;
            if (JA_LEFT.test(t)) t = koPlan(t);
            goraTr[k] = t.replace(/【/g, '[').replace(/】/g, '] ').replace(/\s+/g, ' ').trim();
            done++;
        });
        if (done) renderGoraResult();
    }
    if (!done) return;
    const keys = Object.keys(goraTr);
    if (keys.length > GORA_TR_MAX) keys.slice(0, keys.length - GORA_TR_MAX).forEach(k => delete goraTr[k]);
    try { localStorage.setItem(GORA_TR_KEY, JSON.stringify(goraTr)); } catch (e) {}
}
function goraPlanTags(p) {
    return [p.hour !== undefined ? `${p.hour}시대` : '', p.half ? '9홀' : '', p.two ? '2인' : '', p.lunch ? '점심' : ''].filter(Boolean);
}
// 켜 둔 조건으로 gora.all → gora.items. 라쿠텐 답에 그 칸이 아예 없으면 거르지 않고 알린다(다 지워 버리면 고장으로 보인다).
function goraApply() {
    const plans = gora.all.flatMap(it => it.plans);
    const active = GORA_OPTS.filter(o => gora.opts[o.key]);
    const usable = active.filter(o => plans.some(p => o.test(p) !== undefined));
    const missing = active.filter(o => !usable.includes(o)).map(o => o.label.replace(/^\S+\s/, ''));
    const timeOk = !gora.time || plans.some(p => p.hour !== undefined);
    if (gora.time && !timeOk) missing.push('시간대');
    const fits = p => usable.every(o => o.test(p) === true)
        && (!gora.time || !timeOk || (p.hour !== undefined && (gora.time === 'am' ? p.hour < 11 : p.hour >= 11)));
    const filtering = usable.length || (gora.time && timeOk);
    gora.items = gora.all.map(it => ({ ...it, fit: filtering ? it.plans.filter(fits) : it.plans }))
        .filter(it => !filtering || it.fit.length)
        .filter(it => !gora.opts.foreign || it.foreign !== 'no')
        .filter(it => !gora.opts.no9 || !it.nine);
    gora.fnote = missing.length ? `라쿠텐 답에 '${missing.join(', ')}' 정보가 없어 그 조건으로는 거르지 못했습니다` : '';
    gora.hidden = gora.all.length - gora.items.length;
}
function toggleGoraOpt(key) {
    gora.opts[key] = !gora.opts[key];
    try { localStorage.setItem('jtfag_gora_opts', JSON.stringify(gora.opts)); } catch (e) {}
    goraRefilter();
}
function setGoraTime(t) { gora.time = t; goraRefilter(); }
function goraRefilter() {
    if (gora.all.length) goraApply();
    renderGora();
    paintGoraMap();
}

function openGora(date) {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    gora.date = date; gora.seq = (gora.seq || 0) + 1;
    gora.items = []; gora.all = [];
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
            <div class="gora-search"><input type="text" id="goraPlace" maxlength="60" value="${gora.base ? escapeHtml(gora.base.name) : ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();findGoraPlace();}"><button type="button" class="trip-btn" onclick="findGoraPlace()">찾기</button></div>
        </div>
        <div id="goraPlaces"></div>
        <div class="gora-hint">${gora.base ? `기준: <b>${escapeHtml(gora.base.name)}</b> · 지도의 빈 곳을 눌러 바꿀 수 있어요` : '이름으로 찾거나 아래 지도를 눌러 기준 위치를 고르세요.'}</div>`;
    bottom.innerHTML = `
        <div class="trip-field">범위 (직선거리)<div class="trip-chips">${GORA_RANGES.map(r => chip(gora.range === r, `${r}km <small>차로 ~${driveMinutes(r)}분</small>`, `setGoraRange(${r})`)).join('')}</div></div>
        <div class="trip-field">1인 최대 금액<div class="trip-chips">${GORA_PRICES.map(p => chip(gora.price === p, p ? `¥${p.toLocaleString()}` : '상관없음', `setGoraPrice(${p})`)).join('')}</div></div>
        <div class="trip-field">조건 <small class="gora-sub">여러 개 고를 수 있어요 · 찾은 뒤에 바꿔도 바로 걸러져요</small><div class="trip-chips">${[...GORA_OPTS, GORA_FOREIGN].map(o => chip(!!gora.opts[o.key], o.label, `toggleGoraOpt('${o.key}')`)).join('')}</div>${gora.opts.foreign ? '<div class="gora-hint">라쿠텐에 \'외국인 불가\'처럼 적힌 곳만 뺍니다. 안 적힌 곳도 예약 화면의 안내를 한 번 보세요.</div>' : ''}</div>
        <div class="trip-field">시작 시간<div class="trip-chips">${GORA_TIMES.map(([v, l]) => chip(gora.time === v, l, `setGoraTime('${v}')`)).join('')}</div></div>
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
        gora.map.on('click', onGoraMapClick);
    }
}

function paintGoraMap() {
    if (!gora.map || !gora.layer) return;
    gora.layer.clearLayers();
    gora.markers = [];
    const pts = [];
    if (gora.base) {
        L.circle([gora.base.lat, gora.base.lon], { radius: gora.range * 1000, color: '#0f766e', weight: 1, fillOpacity: 0.05 }).addTo(gora.layer);
        // 숙소는 눌리지 않게 하고 골프장 번호 밑에 깐다 — 가까운 골프장 번호를 가려 눌리지 않았다.
        L.marker([gora.base.lat, gora.base.lon], { icon: L.divIcon({ className: 'gora-pin base', html: '🏨', iconSize: [28, 28] }), interactive: false, zIndexOffset: -1000 }).addTo(gora.layer);
        pts.push([gora.base.lat, gora.base.lon]);
    }
    gora.items.forEach((it, i) => {
        if (!it.geo) return;
        const m = L.marker([it.geo.lat, it.geo.lon], { icon: L.divIcon({ className: 'gora-pin', html: `<b>${i + 1}</b>`, iconSize: [24, 24] }) }).addTo(gora.layer);
        m.bindTooltip(escapeHtml(`${i + 1}. ${it.ko || it.name}`), { direction: 'top', offset: [0, -10] });
        m.on('click', ev => { if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent); goraJumpTo(i); });
        gora.markers[i] = m;
        pts.push([it.geo.lat, it.geo.lon]);
    });
    if (pts.length > 1) gora.map.fitBounds(pts, { padding: [24, 24], maxZoom: 12 });
    else if (pts.length === 1) gora.map.setView(pts[0], 10);
}

// 지도를 누르면 — 번호 가까이(손가락 크기 안)면 그 골프장으로 간다. 번호는 24px라 손가락이 살짝 빗나가면
// 지도 누르기로 잡혀 **기준 위치가 그 자리로 옮겨졌다**(사용자 제보). 그래서 빈 곳을 눌러도 곧바로 바꾸지 않고
// `여기를 기준 위치로` 단추를 띄워 한 번 더 누르게 한다. 기준 위치가 아직 없을 때만 바로 정한다.
const GORA_PIN_REACH = 32;   // px — 이 안이면 번호를 누른 것으로 본다
function onGoraMapClick(e) {
    let best = null;
    (gora.markers || []).forEach((m, i) => {
        if (!m) return;
        const d = gora.map.latLngToContainerPoint(m.getLatLng()).distanceTo(e.containerPoint);
        if (d <= GORA_PIN_REACH && (!best || d < best.d)) best = { i, d };
    });
    if (best) { goraJumpTo(best.i); return; }
    const lat = +e.latlng.lat.toFixed(5), lon = +e.latlng.lng.toFixed(5);
    if (!gora.base) { goraBaseHere(lat, lon); return; }
    L.popup({ className: 'gora-here-pop', offset: [0, -4] }).setLatLng(e.latlng)
        .setContent(`<button type="button" class="gora-here" onclick="goraBaseHere(${lat}, ${lon})">📍 여기를 기준 위치로</button>`)
        .openOn(gora.map);
}
function goraBaseHere(lat, lon) {
    if (gora.map) gora.map.closePopup();
    setGoraBase({ name: `지도에서 고른 곳 (${lat.toFixed(3)}, ${lon.toFixed(3)})`, lat, lon });
}
// 지도의 번호 → 목록의 그 골프장을 화면 맨 위로 올리고 반짝인다(사용자 요청).
function goraJumpTo(i) {
    const row = document.getElementById('goraItem' + i);
    if (!row) return;
    row.scrollIntoView({ block: 'start' });
    row.classList.remove('flash');
    void row.offsetWidth;
    row.classList.add('flash');
    clearTimeout(row._flash);
    row._flash = setTimeout(() => row.classList.remove('flash'), 2200);
}
// 목록의 번호 → 지도로 올라가 그 핀을 가운데 두고 이름을 띄운다.
function goraShowOnMap(i) {
    const m = gora.markers && gora.markers[i];
    const box = document.getElementById('goraMap');
    if (!m || !gora.map || !box) return;
    box.scrollIntoView({ block: 'start' });
    gora.map.setView(m.getLatLng(), Math.max(gora.map.getZoom(), 11));
    m.openTooltip();
}
// GORA 예약 페이지는 아이폰이면 **사파리로** 바로 연다. 새 창(target=_blank)으로 열면 앱 안 브라우저가 떠
// 번역이 없고, 사파리 단추를 한 번 더 눌러야 했다(사용자 제보). `x-safari-https://`는 iOS 17부터 사파리를 직접 연다.
function openGoraLink(url) {
    if (!IS_IOS || !/^https:\/\//.test(url)) return true;   // 그 밖은 링크 그대로(새 탭)
    let left = false;
    const away = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', away);
    setTimeout(() => {
        document.removeEventListener('visibilitychange', away);
        if (!left && !document.hidden) window.open(url, '_blank', 'noopener');   // 옛 iOS — 예전처럼 연다
    }, 1500);
    tripGo('x-safari-' + url);
    return false;
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
    for (let i = 0; i < JP_PREFS_KO.length; i++) if (text.includes(JP_PREFS_KO[i])) return i + 1;
    const i = JP_PREFS.findIndex(p => text.includes(p));
    return i >= 0 ? i + 1 : null;
}

// 현청 소재지 좌표(현 번호 = 배열 순번 + 1). 기준 위치에서 범위 안에 드는 현을 고를 때만 쓴다.
const JP_PREF_CENTER = [[43.06,141.35],[40.82,140.74],[39.70,141.15],[38.27,140.87],[39.72,140.10],[38.24,140.36],[37.75,140.47],[36.34,140.45],[36.57,139.88],[36.39,139.06],[35.86,139.65],[35.61,140.12],[35.69,139.69],[35.45,139.64],[37.90,139.02],[36.70,137.21],[36.59,136.63],[36.07,136.22],[35.66,138.57],[36.65,138.18],[35.39,136.72],[34.98,138.38],[35.18,136.91],[34.73,136.51],[35.00,135.87],[35.02,135.76],[34.69,135.52],[34.69,135.18],[34.69,135.83],[34.23,135.17],[35.50,134.24],[35.47,133.05],[34.66,133.93],[34.40,132.46],[34.19,131.47],[34.07,134.56],[34.34,134.04],[33.84,132.77],[33.56,133.53],[33.61,130.42],[33.25,130.30],[32.74,129.87],[32.79,130.74],[33.24,131.61],[31.91,131.42],[31.56,130.56],[26.21,127.68]];
const GORA_GAP = 400;            // 라쿠텐 한도(초당 1회 남짓)를 넘지 않게 요청 사이를 띄운다
const GORA_GEO_TTL = 30 * 86400000;   // 골프장 위치는 한 달 동안 이 폰에 기억한다
let goraLast = 0;

async function goraCall(api, params, tries = 2) {
    const wait = goraLast + GORA_GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    goraLast = Date.now();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gora`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ api, params })
    });
    const out = await res.json().catch(() => ({}));
    if (res.status === 404) return { error: 'no_function' };
    if (out.error === 'not_configured') return { error: 'not_configured' };
    const data = out.data || {};
    if (out.status === 429 && tries > 0) {   // 너무 빨리 물었다 — 잠깐 쉬고 다시
        await new Promise(r => setTimeout(r, 1500));
        return goraCall(api, params, tries - 1);
    }
    if (out.error || data.error || (out.status && out.status >= 400)) {
        // 라쿠텐이 준 답을 **통째로** 적는다 — 판마다 오류 칸 이름이 달라(`error`·`errors`·`message`…)
        // 몇 개만 골라 적었더니 `403` 숫자 하나만 남아 무엇이 틀렸는지 알 수 없었다.
        let detail = '';
        try { detail = JSON.stringify(data); } catch (e) { detail = String(data); }
        if (detail === '{}') detail = '';
        return { error: 'api', message: [out.status, out.message, out.error, detail.slice(0, 400)].filter(Boolean).join(' · ') };
    }
    const raw = data.Items || data.items || [];
    const items = raw.map(x => x && x.Item ? x.Item : x).filter(Boolean);
    if (items[0] && !gora.raw[api]) gora.raw[api] = items[0];   // 문제를 알릴 때 보여 줄 원본 한 건
    return { items, count: data.count, pageCount: data.pageCount };
}

// 위도·경도를 도(°)로 맞춘다. 라쿠텐은 API에 따라 초(″) 단위로 주기도 해서, 180을 넘으면 초로 본다.
function goraDeg(v) {
    const n = parseFloat(v);
    if (!isFinite(n) || !n) return null;
    return Math.abs(n) > 180 ? n / 3600 : n;
}
function goraGeoOf(raw) {
    const lat = goraDeg(raw.latitude), lon = goraDeg(raw.longitude);
    return lat !== null && lon !== null ? { lat, lon } : null;
}
// 예약 주소. `gr.g.rakuten.co.jp`(라쿠텐 안쪽 주소)는 폰에서 안 열려(사용자 제보) 건너뛴다.
// 그 안쪽 주소가 가야 할 곳을 쿼리에 싣고 있으면 그것을 꺼내 쓴다. 라쿠텐 주소의 http는 https로 올린다
// (아이폰에서 사파리로 바로 여는 길(openGoraLink)이 https만 받는다).
const GR_INNER = /\/\/gr\.g\.rakuten\.co\.jp/;
function goraUnwrap(u) {
    if (typeof u !== 'string' || !/^https?:\/\//.test(u)) return '';
    if (GR_INNER.test(u)) {
        try {
            for (const v of new URL(u).searchParams.values()) if (/^https?:\/\//.test(v) && !GR_INNER.test(v)) return goraUnwrap(v);
        } catch (e) { /* 모양이 틀린 주소는 버린다 */ }
        return '';
    }
    return u.replace(/^http:\/\/([\w.-]*rakuten\.co\.jp)/, 'https://$1');
}
function goraUrl(...cands) {
    for (const u of cands) { const v = goraUnwrap(u); if (v) return v; }
    return '';
}
// 마지막 그물 — 이름으로 GORA를 찾는 검색 주소는 늘 열린다.
function goraSearchUrl(name) {
    return `https://www.google.com/search?q=${encodeURIComponent('楽天GORA ' + name)}`;
}

// ─── 일본 이름을 한글로 ───
// 라쿠텐은 골프장 이름을 한자로 주고, 읽는 법(가나)을 따로 준다(`golfCourseNameKana`).
// 가나를 외래어 표기법대로 한글로 옮기고, 골프장 이름에 늘 붙는 말(カントリークラブ 따위)은 뜻으로 바꾼다.
// 원문 일본어는 아래 작은 글씨로 남긴다 — GORA 사이트와 맞춰 볼 때 쓴다.
const KANA_KO = (() => {
    const t = {};
    // '가|카' — 앞엣것은 낱말 첫머리, 뒤엣것은 가운데·끝 (외래어 표기법)
    const rows = 'ア아 イ이 ウ우 エ에 オ오 カ가|카 キ기|키 ク구|쿠 ケ게|케 コ고|코 サ사 シ시 ス스 セ세 ソ소 タ다|타 チ지|치 ツ쓰 テ데|테 ト도|토 ナ나 ニ니 ヌ누 ネ네 ノ노 ハ하 ヒ히 フ후 ヘ헤 ホ호 マ마 ミ미 ム무 メ메 モ모 ヤ야 ユ유 ヨ요 ラ라 リ리 ル루 レ레 ロ로 ワ와 ヰ이 ヱ에 ヲ오 ガ가 ギ기 グ구 ゲ게 ゴ고 ザ자 ジ지 ズ즈 ゼ제 ゾ조 ダ다 ヂ지 ヅ즈 デ데 ド도 バ바 ビ비 ブ부 ベ베 ボ보 パ파 ピ피 プ푸 ペ페 ポ포 ヴ부 ァ아 ィ이 ゥ우 ェ에 ォ오 ャ야 ュ유 ョ요 ヮ와 '
        + 'キャ갸|캬 キュ규|큐 キョ교|쿄 シャ샤 シュ슈 ショ쇼 シェ셰 チャ자|차 チュ주|추 チョ조|초 チェ제|체 ニャ냐 ニュ뉴 ニョ뇨 ヒャ햐 ヒュ휴 ヒョ효 ミャ먀 ミュ뮤 ミョ묘 リャ랴 リュ류 リョ료 ギャ갸 ギュ규 ギョ교 ジャ자 ジュ주 ジョ조 ジェ제 ビャ뱌 ビュ뷰 ビョ뵤 ピャ퍄 ピュ퓨 ピョ표 '
        + 'ファ파 フィ피 フェ페 フォ포 ティ티 ディ디 トゥ투 ドゥ두 ウィ위 ウェ웨 ウォ워 ヴァ바 ヴィ비 ヴェ베 ヴォ보 テュ튜 デュ듀 フュ퓨';
    rows.split(' ').filter(Boolean).forEach(x => { const k = x.match(/^[ァ-ヿ]+/)[0]; t[k] = x.slice(k.length).split('|'); });
    return t;
})();
// 이름에 늘 붙는 말. 긴 것부터 맞춘다.
const GOLF_WORDS = [
    ['カントリークラブ', '컨트리클럽'], ['カンツリークラブ', '컨트리클럽'], ['カントリー倶楽部', '컨트리클럽'], ['カンツリー倶楽部', '컨트리클럽'],
    ['ゴルフクラブ', '골프클럽'], ['ゴルフ倶楽部', '골프클럽'], ['ゴルフコース', '골프코스'], ['ゴルフリンクス', '골프링크스'],
    ['ゴルフジョウ', '골프장'], ['ゴルフジヨウ', '골프장'], ['ゴルフ場', '골프장'], ['ゴルフパーク', '골프파크'], ['ゴルフリゾート', '골프리조트'],
    ['インターナショナル', '인터내셔널'], ['カントリー', '컨트리'], ['カンツリー', '컨트리'], ['ゴルフ', '골프'], ['クラブ', '클럽'], ['倶楽部', '클럽'], ['俱楽部', '클럽'],
    ['リゾート', '리조트'], ['ホテル', '호텔'], ['コース', '코스'], ['リンクス', '링크스'], ['スプリングス', '스프링스'], ['ヒルズ', '힐스'],
    ['パーク', '파크'], ['レイクス', '레이크스'], ['レイク', '레이크'], ['ガーデン', '가든'], ['ヴィレッジ', '빌리지'], ['ビレッジ', '빌리지'],
    ['ロイヤル', '로열'], ['クラシック', '클래식'], ['グランド', '그랜드'], ['オーシャン', '오션'], ['シーサイド', '시사이드'], ['バレー', '밸리'], ['ヴァレー', '밸리'], ['フォレスト', '포레스트'],
    ['ゴルフ', '골프']
];
function kanaToKo(run) {
    let out = '', prevVowel = '';
    for (let i = 0; i < run.length;) {
        const two = KANA_KO[run.slice(i, i + 2)] && run.slice(i, i + 2);
        const k = two || run[i];
        i += k.length;
        if (k === 'ー') continue;   // 장음은 적지 않는다
        if (k === 'ン' || k === 'ッ') {   // 받침 ㄴ · ㅅ
            const c = out.charCodeAt(out.length - 1);
            if (c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 === 0) out = out.slice(0, -1) + String.fromCharCode(c + (k === 'ン' ? 4 : 19));
            else if (k === 'ン') out += '응';
            continue;
        }
        const ko = KANA_KO[k];
        if (!ko) { out += k; prevVowel = ''; continue; }
        const syl = ko[out ? 1 : 0] || ko[0];
        const jung = (syl.charCodeAt(0) - 0xAC00) % 588 / 28 | 0;
        // 오+우 · 같은 모음이 겹치면 장음이라 적지 않는다 (とうきょう → 도쿄)
        if (out && k === 'ウ' && [8, 12, 13, 17].includes(prevVowel)) continue;
        out += syl;
        prevVowel = jung;
    }
    return out;
}
// 가나(또는 이름)를 한글로. 한자가 남으면 못 옮긴 것이라 ''를 돌려준다.
function koName(src) {
    let s = String(src || '').normalize('NFKC').replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[・･]/g, ' ');
    if (!s.trim()) return '';
    s = s.replace(/^\s*ザ\s+/, '더 ');
    for (const [ja, ko] of GOLF_WORDS) s = s.split(ja).join(` ${ko} `);
    s = s.replace(/[ァ-ヺー]+/g, run => kanaToKo(run));
    s = s.replace(/[（(]\s*/g, ' (').replace(/\s*[）)]/g, ')').replace(/\s+/g, ' ').trim();
    return /[぀-ヿ㐀-鿿]/.test(s) ? '' : s;
}
// 주소 앞의 현 이름을 한글로 (福岡県糸島市… → 후쿠오카현 糸島市…). 시·정 이름은 읽는 법이 없어 그대로 둔다.
function koAddress(addr) {
    const a = String(addr || '');
    const i = JP_PREFS.findIndex(p => a.startsWith(p));
    if (i < 0) return a;
    const rest = a.slice(JP_PREFS[i].length);
    const suf = rest[0] === '県' ? '현' : rest[0] === '府' ? '부' : rest[0] === '都' ? '도' : '';
    const ko = JP_PREFS_KO[i] + suf;
    return (ko + ' ' + rest.replace(/^[県府都]/, '')).trim();
}
function koPref(addr) {
    const i = JP_PREFS.findIndex(p => String(addr || '').startsWith(p));
    if (i < 0) return '';
    const r = String(addr)[JP_PREFS[i].length];
    return JP_PREFS_KO[i] + (r === '県' ? '현' : r === '府' ? '부' : r === '都' ? '도' : '');
}

// GORA 플랜 검색 답 한 건을 한 모양으로 맞춘다. 판(formatVersion)에 따라 감싸는 모양이 달라 둘 다 읽는다.
function goraItem(raw) {
    const plans = (raw.planInfo || raw.plans || []).map(p => p && p.plan ? p.plan : p).filter(Boolean).map(p => {
        const call = Array.isArray(p.callInfo) ? p.callInfo[0] : (p.callInfo || {});
        return {
            name: p.planName || '', price: parseInt(p.price || p.basePrice, 10) || 0,
            time: p.startTimeZone || '', hour: goraHour(p.startTimeZone),
            two: (() => { const a = goraFlag(p.assu2sum); const n = parseInt(p.playerNumMin, 10); return a || (isFinite(n) ? n <= 2 : a); })(),
            lunch: goraFlag(p.lunch), half: goraHalf(p),
            url: goraUrl(call && call.reservePageUrlPC, call && call.reservePageUrl, call && call.reservePageUrlMobile, p.planUrl)
        };
    }).sort((a, b) => (a.price || 1e9) - (b.price || 1e9));
    return {
        id: raw.golfCourseId, name: raw.golfCourseName || raw.golfCourseAbbr || '(이름 없음)', kana: raw.golfCourseNameKana || '',
        address: raw.address || '', rating: parseFloat(raw.evaluation) || 0,
        geo: goraGeoOf(raw), foreign: goraForeign(raw), nine: goraNine(raw),
        plans, url: goraUrl(raw.reserveCalUrl, raw.golfCourseDetailUrl, ...plans.map(p => p.url))
    };
}

// 현(pref) 하나의 골프장 위치표 — 플랜 검색 답에는 위치가 없어서, 골프장 검색으로 따로 받아 이 폰에 한 달 기억한다.
async function goraCourseGeo(pref, tick) {
    const key = 'jtfag_gora_geo3_' + pref;   // 2 — 읽는 법(k) · 3 — 외국인 제한(f)까지 담는다
    try { localStorage.removeItem('jtfag_gora_geo_' + pref); localStorage.removeItem('jtfag_gora_geo2_' + pref); } catch (e) {}
    try {
        const c = JSON.parse(localStorage.getItem(key) || 'null');
        if (c && Date.now() - c.at < GORA_GEO_TTL && c.map && Object.keys(c.map).length) return c.map;
    } catch (e) {}
    const map = {};
    for (let page = 1; page <= 10; page++) {
        tick();
        const r = await goraCall('course', { areaCode: pref, hits: 30, page });
        if (r.error) break;
        r.items.forEach(raw => {
            if (!raw.golfCourseId) return;
            const g = goraGeoOf(raw);
            map[raw.golfCourseId] = { g: g ? [+g.lat.toFixed(5), +g.lon.toFixed(5)] : null, a: raw.address || '', u: goraUrl(raw.reserveCalUrl, raw.golfCourseDetailUrl), k: raw.golfCourseNameKana || '', f: goraForeign(raw) };
        });
        if (r.items.length < 30 || (r.pageCount && page >= r.pageCount)) break;
    }
    if (Object.keys(map).length) { try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), map })); } catch (e) {} }
    return map;
}

async function basePref(base) {
    if (base.pref) return base.pref;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=8&accept-language=ko&lat=${base.lat}&lon=${base.lon}`);
        if (res.ok) { const j = await res.json(); const p = prefCode(j.address); if (p) { base.pref = p; return p; } }
    } catch (e) {}
    // 못 찾으면 가장 가까운 현청 소재지로 본다.
    let best = null;
    JP_PREF_CENTER.forEach(([lat, lon], i) => { const km = kmBetween(base, { lat, lon }); if (!best || km < best.km) best = { km, p: i + 1 }; });
    return best ? best.p : null;
}

// 위치로 묻는 칸을 라쿠텐이 무시해서(후쿠오카 기준인데 간토 골프장이 나왔다) **현 단위로 묻고 거리는 앱이 잰다.**
// 범위 안에 드는 이웃 현까지 많아야 셋을 묻는다.
async function searchGora() {
    if (!gora.base) { showToast('⚠️ 먼저 기준 위치를 골라 주세요.'); return; }
    if (gora.busy) return;
    gora.busy = true; gora.seq = (gora.seq || 0) + 1; gora.items = []; gora.all = []; gora.note = ''; gora.error = null; gora._searched = true; gora.raw = {};
    gora.progress = 0;
    renderGora();
    const tick = () => { gora.progress++; const el = document.getElementById('goraProgress'); if (el) el.textContent = `라쿠텐 GORA에 묻는 중… (${gora.progress})`; };
    try {
        const home = await basePref(gora.base);
        if (!home) { gora.error = { error: 'api', message: '기준 위치가 어느 현인지 알 수 없습니다. 지도에서 다시 골라 주세요.' }; return; }
        const prefs = [home, ...JP_PREF_CENTER.map(([lat, lon], i) => ({ p: i + 1, km: kmBetween(gora.base, { lat, lon }) }))
            .filter(x => x.p !== home && x.km <= gora.range + 50).sort((a, b) => a.km - b.km).map(x => x.p)].slice(0, 3);
        const common = { playDate: gora.date, hits: 30, ...(gora.price ? { maxPrice: gora.price } : {}) };
        let found = [], firstErr = null;
        for (const pref of prefs) {
            for (let page = 1; page <= GORA_PAGES; page++) {
                tick();
                const r = await goraCall('plan', { ...common, areaCode: pref, page });
                if (r.error) { firstErr = firstErr || r; break; }
                found = found.concat(r.items.map(x => ({ raw: x, pref })));
                if (r.items.length < 30 || (r.pageCount && page >= r.pageCount)) break;
            }
            if (firstErr && (firstErr.error === 'not_configured' || firstErr.error === 'no_function')) { gora.error = firstErr; return; }
        }
        if (!found.length && firstErr) { gora.error = firstErr; return; }
        const geoBy = {};
        for (const pref of [...new Set(found.map(f => f.pref))]) geoBy[pref] = await goraCourseGeo(pref, tick);
        const seen = new Set();
        gora.items = found.map(({ raw, pref }) => {
            const it = goraItem(raw);
            const g = (geoBy[pref] || {})[raw.golfCourseId];
            if (g) {
                if (!it.geo && g.g) it.geo = { lat: g.g[0], lon: g.g[1] };
                if (!it.address) it.address = g.a;
                it.url = goraUrl(g.u, it.url);
                if (!it.kana) it.kana = g.k || '';
                if (g.f === 'no' || (!it.foreign && g.f)) it.foreign = g.f;
            }
            it.ko = koName(it.kana) || koName(it.name);
            if (!it.url) it.url = goraSearchUrl(it.name);
            return it;
        }).filter(it => { const k = it.id || it.name; if (seen.has(k)) return false; seen.add(k); return true; })
            .map(it => ({ ...it, km: it.geo ? kmBetween(gora.base, it.geo) : null }))
            .filter(it => it.km === null ? true : it.km <= gora.range * 1.05)
            .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9));
        const unknown = gora.items.filter(it => it.km === null).length;
        if (unknown) gora.note = `위치를 모르는 ${unknown}곳은 맨 아래에 둡니다`;
        gora.all = gora.items;
        goraApply();
    } catch (e) {
        gora.error = { error: 'network', message: String(e && e.message || e) };
    } finally {
        gora.busy = false;
        renderGora();
        paintGoraMap();
    }
    if (gora.all.length) goraTranslatePlans(gora.seq);
}

function toggleGoraRaw() {
    const el = document.getElementById('goraRaw');
    if (!el) return;
    if (el.style.display === 'block') { el.style.display = 'none'; return; }
    let txt = '';
    try { txt = JSON.stringify(gora.raw, null, 1).slice(0, 2500); } catch (e) { txt = String(e); }
    el.textContent = txt || '(아직 받은 답이 없습니다)';
    el.style.display = 'block';
}

function renderGoraResult() {
    const box = document.getElementById('goraResult');
    if (!box) return;
    const e = gora.error;
    const rawLink = `<div class="gora-raw-row"><button type="button" class="gora-raw-btn" onclick="toggleGoraRaw()">🔧 라쿠텐 원본 답 보기 (문제 알릴 때)</button><pre id="goraRaw" class="gora-raw"></pre></div>`;
    if (e) {
        box.innerHTML = (e.error === 'not_configured' || e.error === 'no_function'
            ? `<div class="gora-setup"><b>아직 라쿠텐과 연결되지 않았습니다.</b><br>라쿠텐 앱 등록과 Supabase 설정이 한 번 필요합니다(설명서 <code>docs/일본골프장찾기.md</code>). 설정이 끝나면 이 단추가 바로 됩니다.</div>`
            : `<div class="gora-setup">라쿠텐에서 답을 받지 못했습니다.<br><small>${escapeHtml(e.message || e.error)}</small></div>`) + rawLink;
        return;
    }
    if (gora.busy) { box.innerHTML = `<div class="gora-hint" id="goraProgress">라쿠텐 GORA에 묻는 중…</div><div class="gora-hint">처음 찾는 지역은 골프장 위치까지 받느라 10~20초 걸립니다.</div>`; return; }
    if (!gora.items.length && gora.all.length) { box.innerHTML = `<div class="gora-hint">조건에 맞는 곳이 없습니다 — 찾은 ${gora.all.length}곳이 모두 조건 때문에 빠졌어요. 위의 조건을 줄여 보세요.</div>${gora.fnote ? `<div class="gora-hint">${escapeHtml(gora.fnote)}</div>` : ''}` + rawLink; return; }
    if (!gora.items.length) { box.innerHTML = gora.base && gora._searched ? '<div class="gora-hint">그날 예약 가능한 곳이 없습니다. 범위나 금액을 넓혀 보세요. (예약은 보통 두세 달 앞까지 열립니다)</div>' + rawLink : ''; return; }
    box.innerHTML = `<div class="gora-hint">${gora.items.length}곳 · 가까운 순${gora.hidden ? ` · 조건에 안 맞는 ${gora.hidden}곳은 뺐어요` : ''}${gora.note ? ' · ' + escapeHtml(gora.note) : ''}</div>
        ${gora.fnote ? `<div class="gora-hint warn">${escapeHtml(gora.fnote)}</div>` : ''}
        <div class="gora-tip">💡 지도의 번호를 누르면 그 골프장으로, 목록의 번호를 누르면 지도로 갑니다.<br>예약 페이지는 ${IS_IOS ? '<b>사파리</b>로 열립니다. 주소창 왼쪽 <b>가가</b> → <b>번역 → 한국어</b>' : '일본어입니다. 브라우저 메뉴의 <b>번역 → 한국어</b>'}를 누르면 한국어로 보입니다.</div>` + gora.items.map((it, i) => {
        const plans = it.fit || it.plans;
        const low = plans.find(p => p.price);
        const shown = plans.slice(0, 3);
        return `
        <div class="gora-item" id="goraItem${i}">
            <div class="gora-item-top">
                <button type="button" class="gora-no"${it.geo ? ` onclick="goraShowOnMap(${i})" title="지도에서 보기"` : ' disabled'}>${i + 1}</button>
                <div class="gora-item-name"><b>${escapeHtml(it.ko || it.name)}</b>${it.ko ? `<small>${escapeHtml(it.name)}</small>` : ''}${it.foreign === 'no' ? '<span class="gora-tag no">⚠️ 외국인 제한 문구 있음</span>' : it.foreign === 'yes' ? '<span class="gora-tag">🌏 외국인 환영</span>' : ''}</div>
            </div>
            <div class="gora-item-meta">
                ${it.km !== null ? `📍 직선 ${it.km.toFixed(0)}km · 차로 약 ${driveMinutes(it.km)}분` : '📍 거리 모름'}
                ${low ? ` · 💴 ¥${low.price.toLocaleString()}~` : ''}${plans.length ? ` · 플랜 ${plans.length}개` : ''}${it.rating ? ` · ⭐${it.rating.toFixed(1)}` : ''}
            </div>
            ${shown.length ? `<div class="gora-plans">${shown.map(p => goraPlanHtml(p, it)).join('')}${plans.length > shown.length ? `<a class="gora-plan more" href="${escapeHtml(it.url || goraSearchUrl(it.name))}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">외 ${plans.length - shown.length}개 플랜 — GORA에서 보기 ›</a>` : ''}</div>` : ''}
            ${it.address ? `<div class="gora-item-meta addr">${escapeHtml(koAddress(it.address))}</div>` : ''}
            <div class="trip-actions">
                <a class="trip-btn" href="${escapeHtml(it.url)}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">🎫 GORA에서 예약</a>
                <button type="button" class="trip-btn primary" onclick="pickGoraCourse(${i})">날짜 선택 완료</button>
            </div>
        </div>`;
    }).join('') + rawLink;
}

// 플랜 한 줄을 누르면 그 날짜·그 플랜의 GORA 예약 페이지로 간다(사용자 요청).
// 주소는 라쿠텐 플랜 검색 답의 callInfo(그날 그 플랜)에서 온다 — 없으면 골프장 예약 달력으로 물러난다.
function goraPlanHtml(p, it) {
    const url = p.url || it.url || goraSearchUrl(it.name);
    return `<a class="gora-plan" href="${escapeHtml(url)}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">`
        + `<span class="gora-plan-price">${p.price ? '¥' + p.price.toLocaleString() : ''}</span>`
        + goraPlanTags(p).map(t => `<span class="gora-tag">${escapeHtml(t)}</span>`).join('')
        + `<span class="gora-plan-go">${p.url ? '이 플랜 예약' : '예약 달력'} ›</span>`
        + `<small>${escapeHtml(goraPlanKo(p.name))}</small></a>`;
}

function pickGoraCourse(i) {
    const it = gora.items[i];
    const date = gora.date;
    if (!it || !date) return;
    const area = koPref(it.address) || (it.address.match(/^(.+?[都道府県])/) || [])[1] || '';
    const ok = editTrip(t => {
        const d = t.days.find(x => x.date === date);
        if (!d) return false;
        d.course = it.ko || it.name;
        if (area && !d.area) d.area = area;
        if (it.geo) { d.lat = +it.geo.lat.toFixed(5); d.lon = +it.geo.lon.toFixed(5); } else { delete d.lat; delete d.lon; }
        d.gora = { id: it.id || null, url: /google\.com\/search/.test(it.url) ? '' : (it.url || ''), ...(it.ko ? { ja: it.name } : {}) };
    }, `✅ ${isoLabel(date)} 골프장을 정했습니다. 예약은 GORA에서 해 주세요.`);
    if (ok) { closeGora(); renderTripModal(); renderTripCard(); }
}
