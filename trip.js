// trip.js - 여행 일정 (넷이 같이 가는 골프 여행)
//
// 값은 payload.trips에 둔다 — 여행 하나가 `{id, title, days:[{date, course, area, tee, stay, memo}], memo}`.
// 고치는 차례는 다른 곳과 같다: saveState() → appData 수정 → syncToSupabase(appData).
// **고칠 때는 순번이 아니라 id·날짜로 다시 찾는다** — 창이 떠 있는 사이 남의 저장이 들어오면
// appData가 통째로 바뀌어 순번이 밀릴 수 있다(공금 로그·사진에서 겪은 그 자리다).

const TRIP_SEED = {
    id: 'trip-2026-10-namdo',
    title: '10월 남도 골프 여행',
    days: [
        { date: '2026-10-26', course: '디오션CC', area: '여수', tee: '', stay: '', memo: '' },
        { date: '2026-10-27', course: '여수경도골프앤리조트CC', area: '여수', tee: '', stay: '', memo: '' },
        { date: '2026-10-28', course: '사우스케이프오너스클럽', area: '남해', tee: '', stay: '', memo: '' },
        { date: '2026-10-29', course: '아난티 남해 골프클럽', area: '남해', tee: '', stay: '', memo: '라운드 후 집으로 복귀 🏠' }
    ],
    memo: ''
};

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

function tripDays(trip) {
    return (trip && Array.isArray(trip.days) ? trip.days : []).filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
        .slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// 아직 안 끝난 여행 중 가장 가까운 것. 끝난 여행은 카드에서 빠진다.
function activeTrip() {
    const today = kstToday();
    const list = (Array.isArray(appData.trips) ? appData.trips : [])
        .map(t => ({ t, days: tripDays(t) }))
        .filter(x => x.days.length && x.days[x.days.length - 1].date >= today)
        .sort((a, b) => a.days[0].date < b.days[0].date ? -1 : 1);
    return list.length ? list[0].t : null;
}

let tripOpenId = null;
let tripEditing = null;   // 'memo' 또는 고치는 중인 날짜. 고치는 동안은 다시 그리지 않는다(적던 글이 날아간다).

function renderTripCard() {
    const card = document.getElementById('tripCard');
    if (!card) return;
    const trip = activeTrip();
    if (!trip) { card.style.display = 'none'; return; }
    const days = tripDays(trip);
    const today = kstToday();
    const left = isoDiff(today, days[0].date);
    const nowDay = days.findIndex(d => d.date === today);

    let badge;
    if (left > 0) badge = `<span class="dday-badge ${left <= 3 ? 'dday-soon' : 'dday-far'}">D-${left}</span>`;
    else badge = `<span class="dday-badge dday-today">여행 중</span>`;

    let sub;
    if (nowDay >= 0) {
        const d = days[nowDay];
        sub = `<b>${nowDay + 1}일차</b> · 오늘 ⛳ ${escapeHtml(d.course)}${d.tee ? ' · ' + escapeHtml(d.tee) : ''}`;
    } else {
        sub = days.map(d => escapeHtml(d.area || d.course)).join(' → ') + ' → 🏠';
    }

    card.style.display = 'block';
    card.innerHTML = `
        <div class="trip-card-top">
            <span class="trip-card-title">🧳 ${escapeHtml(trip.title || '여행')}</span>
            ${badge}
        </div>
        <div class="trip-card-when">${isoLabel(days[0].date, true)} ~ ${isoLabel(days[days.length - 1].date, true)} · ${days.length}라운드</div>
        <div class="trip-card-sub">${sub}</div>
        <div class="trip-card-more">일정 보기 ›</div>`;
    card.onclick = () => openTripModal(trip.id);
}

function findTrip(id) {
    return (Array.isArray(appData.trips) ? appData.trips : []).find(t => t && t.id === id) || null;
}

function openTripModal(id) {
    tripOpenId = id;
    tripEditing = null;
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

// ─── 지도·길찾기 ───
// **`<a target="_blank">`로 열지 않는다.** 폰은 새 창을 열고 그 주소를 카카오맵 앱에 넘기는데,
// 넘겨준 뒤 **빈 창이 남아** 돌아오면 그것부터 닫아야 했다(사용자 제보). 그래서 앱 주소
// (`kakaomap://`)로 곧바로 앱을 연다 — 새 창이 안 생기므로 돌아오면 일정 창 그대로다.
// 앱이 없으면: 안드로이드는 `intent:`의 `browser_fallback_url`이 웹 지도로 보내 주고,
// 아이폰은 1.5초 안에 앱으로 안 넘어가면 웹 지도를 연다. PC는 처음부터 웹 지도다.
function mapLinks(course) {
    const name = String(course || '').trim();
    const geo = courseGeo(name);
    const n = encodeURIComponent(name);
    if (geo) return {
        map: `https://map.kakao.com/link/map/${n},${geo.lat},${geo.lon}`,
        route: `https://map.kakao.com/link/to/${n},${geo.lat},${geo.lon}`,
        mapApp: `look?p=${geo.lat},${geo.lon}`,
        routeApp: `route?ep=${geo.lat},${geo.lon}&by=CAR`
    };
    return { map: `https://map.kakao.com/link/search/${n}`, route: null, mapApp: `search?q=${n}`, routeApp: null };
}

function tripGo(url) { location.href = url; }   // 시험에서 갈아 끼울 수 있게 한 곳으로 모은다

function openTripMap(kind, date) {
    const trip = findTrip(tripOpenId);
    const day = trip && tripDays(trip).find(d => d.date === date);
    if (!day) return;
    const links = mapLinks(day.course);
    const web = kind === 'route' ? links.route : links.map;
    const app = kind === 'route' ? links.routeApp : links.mapApp;
    if (!web) return;
    const touch = navigator.maxTouchPoints > 0;
    if (!touch || !app) { window.open(web, '_blank', 'noopener'); return; }
    if (/Android/i.test(navigator.userAgent)) {
        tripGo(`intent://${app}#Intent;scheme=kakaomap;package=net.daum.android.map;S.browser_fallback_url=${encodeURIComponent(web)};end`);
        return;
    }
    let left = false;
    const away = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', away);
    setTimeout(() => {
        document.removeEventListener('visibilitychange', away);
        window.removeEventListener('pagehide', away);
        if (!left && !document.hidden) tripGo(web);   // 앱이 없다 — 웹 지도로
    }, 1500);
    tripGo(`kakaomap://${app}`);
}

function tripDayHtml(trip, d, i, today) {
    const isToday = d.date === today;
    const past = d.date < today;
    const dateId = d.date;
    if (tripEditing === dateId) {
        return `
        <div class="trip-day editing">
            <div class="trip-day-head"><span class="trip-day-no">${i + 1}일차</span> ${isoLabel(d.date)}</div>
            <label class="trip-field">⛳ 골프장<input type="text" id="tripEdCourse" maxlength="40" value="${escapeHtml(d.course)}"></label>
            <label class="trip-field">🕐 티오프<input type="text" id="tripEdTee" maxlength="20" placeholder="예: 오전 7:30" value="${escapeHtml(d.tee)}"></label>
            <label class="trip-field">🏨 숙소<input type="text" id="tripEdStay" maxlength="40" value="${escapeHtml(d.stay)}"></label>
            <label class="trip-field">📝 메모<textarea id="tripEdMemo" rows="2" maxlength="200">${escapeHtml(d.memo)}</textarea></label>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripDay('${dateId}')">저장</button>
            </div>
        </div>`;
    }
    const links = mapLinks(d.course);
    const wx = past ? '' : `<div class="trip-row trip-wx" id="tripWx-${dateId}">${tripWeatherHtml(d)}</div>`;
    return `
        <div class="trip-day${isToday ? ' today' : ''}${past ? ' past' : ''}">
            <div class="trip-day-head">
                <span class="trip-day-no">${i + 1}일차</span> ${isoLabel(d.date)}
                ${isToday ? '<span class="trip-today">오늘</span>' : ''}
            </div>
            <div class="trip-course">⛳ ${escapeHtml(d.course || '골프장 미정')}${d.area ? ` <span class="trip-area">${escapeHtml(d.area)}</span>` : ''}</div>
            <div class="trip-row"><span class="k">🕐 티오프</span><span class="v${d.tee ? '' : ' empty'}">${d.tee ? escapeHtml(d.tee) : '미정'}</span></div>
            <div class="trip-row"><span class="k">🏨 숙소</span><span class="v${d.stay ? '' : ' empty'}">${d.stay ? escapeHtml(d.stay) : '미정'}</span></div>
            ${d.memo ? `<div class="trip-memo">${escapeHtml(d.memo)}</div>` : ''}
            ${wx}
            <div class="trip-actions">
                <button type="button" class="trip-btn" onclick="openTripMap('map', '${dateId}')">🗺️ 지도</button>
                ${links.route ? `<button type="button" class="trip-btn" onclick="openTripMap('route', '${dateId}')">🚗 길찾기</button>` : ''}
                <button type="button" class="trip-btn ghost" onclick="editTripDay('${dateId}')">✏️ 고치기</button>
            </div>
        </div>`;
}

function renderTripModal() {
    const body = document.getElementById('tripBody');
    const title = document.getElementById('tripTitle');
    const trip = findTrip(tripOpenId);
    if (!body) return;
    if (!trip) { title.textContent = '🧳 여행 일정'; body.innerHTML = `<div class="trip-empty">여행 일정이 없습니다.</div>`; return; }
    const days = tripDays(trip);
    const today = kstToday();
    title.textContent = `🧳 ${trip.title || '여행 일정'}`;

    const left = days.length ? isoDiff(today, days[0].date) : 0;
    const head = days.length ? `
        <div class="trip-summary">
            <div><b>${isoLabel(days[0].date)} ~ ${isoLabel(days[days.length - 1].date)}</b></div>
            <div class="trip-summary-sub">${days.length > 1 ? `${days.length - 1}박 ${days.length}일 · ` : ''}${days.length}라운드${left > 0 ? ` · 출발까지 ${left}일` : ''} · 넷 모두 고칠 수 있어요</div>
        </div>` : '';

    const memo = tripEditing === 'memo' ? `
        <div class="trip-day editing">
            <div class="trip-day-head">📋 공통 메모</div>
            <label class="trip-field"><textarea id="tripEdTripMemo" rows="4" maxlength="500" placeholder="준비물, 정산 방법 등">${escapeHtml(trip.memo)}</textarea></label>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripMemo()">저장</button>
            </div>
        </div>` : `
        <div class="trip-day">
            <div class="trip-day-head">📋 공통 메모</div>
            <div class="trip-memo${trip.memo ? '' : ' empty'}">${trip.memo ? escapeHtml(trip.memo) : '준비물·정산 방법 등을 적어 두세요.'}</div>
            <div class="trip-actions"><button type="button" class="trip-btn ghost" onclick="editTripMemo()">✏️ 고치기</button></div>
        </div>`;

    body.innerHTML = head + days.map((d, i) => tripDayHtml(trip, d, i, today)).join('') + memo;
    days.forEach(d => { if (d.date >= today) loadTripWeather(d); });
}

function editTripDay(date) { tripEditing = date; renderTripModal(); }
function editTripMemo() { tripEditing = 'memo'; renderTripModal(); }
function cancelTripEdit() { tripEditing = null; renderTripModal(); }

function saveTripDay(date) {
    const val = id => (document.getElementById(id) || {}).value || '';
    const next = { course: val('tripEdCourse').trim(), tee: val('tripEdTee').trim(), stay: val('tripEdStay').trim(), memo: val('tripEdMemo').trim() };
    const trip = findTrip(tripOpenId);
    const day = trip && tripDays(trip).find(d => d.date === date);
    if (!day) { showToast('⚠️ 그 날짜를 찾지 못했습니다. 다시 열어 주세요.'); cancelTripEdit(); return; }
    const changed = Object.keys(next).some(k => (day[k] || '') !== next[k]);
    tripEditing = null;
    if (changed) {
        saveState();
        // saveState가 사본을 뜬 뒤라, 지금 appData에서 다시 찾아 고친다.
        const t = findTrip(tripOpenId);
        const target = t && t.days.find(d => d.date === date);
        Object.assign(target, next);
        syncToSupabase(appData);
        showToast(`✅ ${isoLabel(date)} 일정을 저장했습니다.`);
    }
    renderTripModal();
    renderTripCard();
}

function saveTripMemo() {
    const text = ((document.getElementById('tripEdTripMemo') || {}).value || '').trim();
    const trip = findTrip(tripOpenId);
    tripEditing = null;
    if (trip && (trip.memo || '') !== text) {
        saveState();
        findTrip(tripOpenId).memo = text;
        syncToSupabase(appData);
        showToast('✅ 공통 메모를 저장했습니다.');
    }
    renderTripModal();
}

// ─── 날씨 ───
// 예보는 16일치뿐이라 그 안에 든 날만 묻는다. 같은 곳·같은 날은 10분간 다시 안 묻는다
// (공지 카드의 날씨와 같은 규칙 — `res.ok`를 보고 429면 잠시 쉰다).
const tripWeather = {};
const tripWeatherBusy = {};

function tripWeatherHtml(d) {
    const geo = courseGeo(d.course);
    if (!geo) return `🌤️ 날씨: 골프장 위치를 몰라 예보를 못 봅니다`;
    const left = isoDiff(kstToday(), d.date);
    if (left > 15) return `🌤️ 날씨: 예보는 ${isoLabel(isoAdd(d.date, -15))}부터 나와요`;
    const hit = tripWeather[`${geo.lat},${geo.lon}|${d.date}`];
    return hit ? hit.html : `🌤️ 날씨 확인중...`;
}

async function loadTripWeather(d) {
    const geo = courseGeo(d.course);
    if (!geo || isoDiff(kstToday(), d.date) > 15) return;
    const key = `${geo.lat},${geo.lon}|${d.date}`;
    const hit = tripWeather[key];
    if ((hit && Date.now() - hit.at < WEATHER_TTL) || tripWeatherBusy[key]) return;
    if (Date.now() < weatherBlockedUntil) return;
    tripWeatherBusy[key] = true;
    const paint = html => { const el = document.getElementById('tripWx-' + d.date); if (el) el.innerHTML = html; };
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=16`;
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
