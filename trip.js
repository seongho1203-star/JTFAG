// trip.js - 여행 일정 (넷이 같이 가는 골프 여행) + 일본 골프장 찾기(라쿠텐 GORA)
//
// 값은 payload.trips에 둔다 — 여행 하나가
//   {id, title, kind:'domestic'|'japan'|'abroad', base:{name,lat,lon}?, memo,
//    days:[{date, course, area, tee, stay, memo, lat?, lon?, gora?:{id,url}}],
//    travel?:{flightOut, flightBack, flightRef, car:'yes'|'no', carCo, carPick, carDrop, carRef},
//    costs?, fund?, people?, fx?, payer?, account?, paid?, pack? — 여행 경비·준비물(아래 '여행 경비' 꼭지)}
//   travel은 여행 전체에 한 벌(항공·렌트카·숙소 예약) — 적은 칸만 남고, 다 비우면 키째 지운다.
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

const TRIP_KINDS = { domestic: '🇰🇷 국내', japan: '🇯🇵 일본', abroad: '🌏 기타 해외' };
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
    if (list.includes(0)) parts.push('여행 기간 중 매일');
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

// ─── 여행 탭 ───
// 예전엔 홈의 🧳 카드를 누르면 창이 떴다. 이제 네 번째 탭(맨 끝 — 자주 쓰는 탭이 아니다)이 그 자리다(사용자 요청).
// 처음 열면 가장 가까운 다가오는 여행을 보여 준다. 없으면 빈 안내와 `＋ 새 여행 등록`이다.
let tripDayOpen = null;   // 일정 줄기에서 펼친 날짜. null = 아직 안 고름(여행 중이면 오늘을 편다) · '' = 다 접음

// 남이 고쳐서 렌더가 돌 때 — 내가 안 고치는 중이면 다시 그린다(고치는 중이면 적던 글이 날아간다).
// 손가락으로 미는 중이거나 미끄러지는 중(관성)이면 다시 그리지 않고 멈춘 뒤로 미룬다.
// 미는 도중에 통째로 갈아 끼우면 손가락 아래 요소가 사라져 **아이폰이 그 스크롤을 놓는다** —
// '위아래로 스크롤이 안 될 때가 있다'(사용자 제보)의 정체였다. 남의 저장·접속 때 다시 읽기마다 이 함수가 돈다.
let tripTouching = false, tripScrollAt = 0, tripRefreshTimer = 0;
function tripBusyScrolling() { return tripTouching || Date.now() - tripScrollAt < 400; }
// 창이 맨 위·맨 아래에 닿아 있을 때 그쪽으로 밀면 **아이폰이 그 손짓을 창 밖(잠가 둔 뒤 화면)에 넘긴다** —
// 뒤는 붙박여 있어 아무것도 안 움직이고, 같은 손짓으로 반대쪽으로 되밀어도 창이 꿈쩍 안 한다
// ('스크롤하다가 멈춘다' · 사용자 제보). 손을 대는 순간 끝에서 1px 떼어 두면 늘 창이 그 손짓을 받는다.
// 지금은 GORA 창만 쓴다(여행은 창이 아니라 탭이 되었다).
function keepOffEdges(el) {
    const max = el.scrollHeight - el.clientHeight;
    if (max < 3) return;                       // 넘치지 않는 창은 굴릴 것이 없다
    if (el.scrollTop <= 0) el.scrollTop = 1;
    else if (el.scrollTop >= max) el.scrollTop = max - 1;
}
function watchModalScroll(el) {
    if (!el || el._edgeWatched) return;
    el._edgeWatched = true;
    el.addEventListener('touchstart', () => keepOffEdges(el), { passive: true });
}
// 여행 탭은 화면(body)이 굴러가므로 문서 전체의 손짓을 본다.
let tripScrollWatched = false;
function watchTripScroll() {
    if (tripScrollWatched) return;
    tripScrollWatched = true;
    document.addEventListener('touchstart', () => { tripTouching = true; }, { passive: true });
    const up = () => { tripTouching = false; tripScrollAt = Date.now(); };
    document.addEventListener('touchend', up, { passive: true });
    document.addEventListener('touchcancel', up, { passive: true });
    window.addEventListener('scroll', () => { tripScrollAt = Date.now(); }, { passive: true });
}
function refreshTripPage() {
    if (tripEditing) return;
    clearTimeout(tripRefreshTimer);
    if (tripBusyScrolling()) { tripRefreshTimer = setTimeout(refreshTripPage, 450); return; }
    renderTripPage();
}
// 같은 내용이면 갈아 끼우지 않는다 — 다시 그릴 일이 없는데 DOM을 바꾸면 스크롤만 끊긴다.
function setTripBody(body, html) {
    watchTripScroll();
    if (body._html === html) return;
    body.innerHTML = html;
    body._html = html;
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
            // 길찾기는 앱을 고르게 한다(사용자 요청 — 티맵·카카오맵·네이버 지도). routeApps()가 앱별 주소를 만든다.
            route: { web: `https://map.kakao.com/link/to/${n},${geo.lat},${geo.lon}`, app: `kakaomap://route?ep=${geo.lat},${geo.lon}&by=CAR`, intent: `route?ep=${geo.lat},${geo.lon}&by=CAR`,
                     pick: { name, lat: geo.lat, lon: geo.lon } }
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
    if (t.pick) { showRoutePicker(t); return; }
    if (android) {
        tripGo(`intent://${t.intent}#Intent;scheme=kakaomap;package=net.daum.android.map;S.browser_fallback_url=${encodeURIComponent(t.web)};end`);
        return;
    }
    tryTripApp(t.app, t.web);
}
// 아이폰은 앱이 없으면 아무 일도 안 일어난다 — 1.5초 안에 앱으로 안 넘어가면 웹 지도로 연다.
function tryTripApp(app, web) {
    let left = false;
    const away = () => { if (document.hidden) left = true; };
    document.addEventListener('visibilitychange', away);
    window.addEventListener('pagehide', away);
    setTimeout(() => {
        document.removeEventListener('visibilitychange', away);
        window.removeEventListener('pagehide', away);
        if (!left && !document.hidden) tripGo(web);
    }, 1500);
    tripGo(app);
}

// ─── 길찾기 앱 고르기 ───
// 웹 페이지는 폰에 어떤 앱이 깔려 있는지 알 수 없다(브라우저가 막아 둔다). 그래서 셋을 늘 보여 주고
// 고르게 한다. 깔려 있지 않은 앱을 고르면 카카오맵 웹 길찾기로 물러난다. 지난번에 고른 앱이 맨 위에 온다.
const ROUTE_APP_KEY = 'jtfag_route_app';
function routeApps(p) {
    const n = encodeURIComponent(p.name), web = `https://map.kakao.com/link/to/${n},${p.lat},${p.lon}`;
    const fb = `;S.browser_fallback_url=${encodeURIComponent(web)};end`;
    return [
        { id: 'tmap', label: '티맵', mark: 'T', ios: `tmap://route?goalname=${n}&goalx=${p.lon}&goaly=${p.lat}`,
          android: `intent://route?goalname=${n}&goalx=${p.lon}&goaly=${p.lat}#Intent;scheme=tmap;package=com.skt.tmap.ku${fb}` },
        { id: 'kakao', label: '카카오맵', mark: 'K', ios: `kakaomap://route?ep=${p.lat},${p.lon}&by=CAR`,
          android: `intent://route?ep=${p.lat},${p.lon}&by=CAR#Intent;scheme=kakaomap;package=net.daum.android.map${fb}` },
        { id: 'naver', label: '네이버 지도', mark: 'N', ios: `nmap://route/car?dlat=${p.lat}&dlng=${p.lon}&dname=${n}&appname=jtfag`,
          android: `intent://route/car?dlat=${p.lat}&dlng=${p.lon}&dname=${n}&appname=jtfag#Intent;scheme=nmap;package=com.nhn.android.nmap${fb}` }
    ].map(a => ({ ...a, web }));
}
let routePickTarget = null;
function showRoutePicker(t) {
    closeRoutePicker();
    routePickTarget = t;
    let last = '';
    try { last = localStorage.getItem(ROUTE_APP_KEY) || ''; } catch (e) {}
    const apps = routeApps(t.pick).sort((a, b) => (b.id === last) - (a.id === last));
    const el = document.createElement('div');
    el.id = 'routePicker';
    el.className = 'route-picker';
    el.onclick = e => { if (e.target === el) closeRoutePicker(); };
    // 생김새는 아이폰 동작 시트를 따른다 — 카드 하나에 앱 줄을 선으로 가르고 취소는 따로 아래 카드(사용자 요청 — `너무 안예뻐`).
    // 앱 표시는 그림문자가 아니라 앱 색의 둥근 네모 글자표다(🟡🟢는 기기마다 모양이 달랐다).
    el.innerHTML = `<div class="route-sheet">
        <div class="route-card">
            <div class="route-head"><div class="route-kicker">길찾기</div><div class="route-title">${escapeHtml(t.pick.name || '목적지')}</div></div>
            ${apps.map(a => `<button type="button" class="route-app" onclick="pickRouteApp('${a.id}')"><span class="route-mark ${a.id}">${a.mark}</span><span class="route-name">${a.label}</span>${a.id === last ? '<small>최근 사용</small>' : ''}<span class="route-chev">›</span></button>`).join('')}
            <div class="route-note">설치되지 않은 앱은 카카오맵 웹으로 연결됩니다</div>
        </div>
        <button type="button" class="route-cancel" onclick="closeRoutePicker()">취소</button>
    </div>`;
    document.body.appendChild(el);
}
function closeRoutePicker() {
    const el = document.getElementById('routePicker');
    if (el) el.remove();
}
function pickRouteApp(id) {
    const t = routePickTarget;
    closeRoutePicker();
    if (!t) return;
    const a = routeApps(t.pick).find(x => x.id === id);
    if (!a) return;
    try { localStorage.setItem(ROUTE_APP_KEY, id); } catch (e) {}
    if (/Android/i.test(navigator.userAgent)) tripGo(a.android);
    else tryTripApp(a.ios, a.web);
}

// ─── 여행 탭 화면 ───
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
function switchTrip(id) { tripOpenId = id; tripEditing = null; tripDayOpen = null; renderTripPage(); }
function startNewTrip() { tripEditing = 'new'; renderTripPage(); }

function newTripHtml() {
    const start = isoAdd(kstToday(), 14);
    const end = isoAdd(start, 2);
    return `
        <div class="trip-day editing">
            <div class="trip-day-head">🧳 새 여행 등록</div>
            <label class="trip-field">여행명<input type="text" id="tripNewTitle" maxlength="30"></label>
            <div class="trip-field">여행 구분
                <div class="trip-kind-row">${Object.entries(TRIP_KINDS).map(([k, v], i) => `<label class="trip-kind"><input type="radio" name="tripNewKind" value="${k}"${i === 0 ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
            </div>
            <div class="trip-two">
                <label class="trip-field">출발일<input type="date" id="tripNewStart" value="${start}" onchange="tripDatesChanged('start')"></label>
                <label class="trip-field">종료일<input type="date" id="tripNewEnd" value="${end}" min="${start}" max="${isoAdd(start, TRIP_MAX_DAYS - 1)}" onchange="tripDatesChanged('end')"></label>
            </div>
            <div class="trip-hint" id="tripNewSpan">${tripSpanText(start, end)}</div>
            <div class="trip-hint">일자별 골프장·티오프·숙소는 등록 후 <b>입력</b>에서, 항공·렌트카는 <b>🧭 여행 기본 정보</b>에서 입력합니다. 일본 여행은 일자별로 <b>🔎 일본 골프장 찾기</b>가 제공됩니다.</div>
            <div class="trip-actions">
                ${tripOpenId ? `<button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>` : ''}
                <button type="button" class="trip-btn primary" onclick="createTrip()">등록</button>
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
    if (!title) { showToast('⚠️ 여행명을 입력해 주세요.'); return; }
    if (!ISO_RE.test(start)) { showToast('⚠️ 출발일을 선택해 주세요.'); return; }
    if (!ISO_RE.test(end)) { showToast('⚠️ 종료일을 선택해 주세요.'); return; }
    if (end < start) { showToast('⚠️ 종료일이 출발일보다 빠릅니다.'); return; }
    const n = isoDiff(start, end) + 1;
    if (n > TRIP_MAX_DAYS) { showToast(`⚠️ 여행은 ${TRIP_MAX_DAYS}일까지 등록할 수 있습니다.`); return; }
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
    showToast(`✅ ${title}을(를) 등록했습니다.`);
    renderTripPage();
}

function settingsHtml(trip) {
    const days = tripDays(trip);
    const start = days.length ? days[0].date : isoAdd(kstToday(), 14);
    const end = days.length ? days[days.length - 1].date : start;
    return `
        <div class="trip-day editing">
            <div class="trip-day-head">⚙️ 여행 수정</div>
            <label class="trip-field">여행명<input type="text" id="tripSetTitle" maxlength="30" value="${escapeHtml(trip.title)}"></label>
            <div class="trip-field">여행 구분
                <div class="trip-kind-row">${Object.entries(TRIP_KINDS).map(([k, v]) => `<label class="trip-kind"><input type="radio" name="tripSetKind" value="${k}"${tripKind(trip) === k ? ' checked' : ''}><span>${v}</span></label>`).join('')}</div>
            </div>
            <div class="trip-two">
                <label class="trip-field">출발일<input type="date" id="tripSetStart" value="${start}" onchange="tripDatesChanged('start', 'tripSet')"></label>
                <label class="trip-field">종료일<input type="date" id="tripSetEnd" value="${end}" min="${start}" max="${isoAdd(start, TRIP_MAX_DAYS - 1)}" data-prev-start="${start}" onchange="tripDatesChanged('end', 'tripSet')"></label>
            </div>
            <div class="trip-hint" id="tripSetSpan">${tripSpanText(start, end)}</div>
            <div class="trip-hint">일정을 변경하면 일자별 골프장·티오프·숙소 정보는 <b>1일차부터 순서대로</b> 이동합니다.</div>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripSettings()">저장</button>
            </div>
            <div class="trip-actions"><button type="button" class="trip-btn danger" onclick="deleteTrip()">🗑️ 여행 삭제</button></div>
        </div>`;
}

// 고치는 동안 들어온 남의 저장을 덮지 않게, 늘 지금 appData에서 다시 찾아 고친다.
function editTrip(mutate, msg) {
    if (!findTrip(tripOpenId)) { showToast('⚠️ 해당 여행을 찾을 수 없습니다. 다시 열어 주세요.'); tripEditing = null; renderTripPage(); return false; }
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
    if (!title) { showToast('⚠️ 여행명을 입력해 주세요.'); return; }
    if (!ISO_RE.test(start) || !ISO_RE.test(end)) { showToast('⚠️ 출발일과 종료일을 선택해 주세요.'); return; }
    if (end < start) { showToast('⚠️ 종료일이 출발일보다 빠릅니다.'); return; }
    const n = isoDiff(start, end) + 1;
    if (n > TRIP_MAX_DAYS) { showToast(`⚠️ 여행은 ${TRIP_MAX_DAYS}일까지 등록할 수 있습니다.`); return; }
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    const old = tripDays(trip);
    const datesChanged = !old.length || old[0].date !== start || old.length !== n;
    const dropped = old.slice(n).filter(dayFilled);
    if (datesChanged && dropped.length && !await showConfirmPrompt(`일정이 단축되어 <b>${dropped.map(d => `${old.indexOf(d) + 1}일차`).join(', ')}</b> 일정이 삭제됩니다.<br><span style="font-weight:500;color:#6b7075;">입력된 골프장·메모도 함께 삭제됩니다.</span>`, '변경')) return;
    if (trip.title !== title || tripKind(trip) !== kind || datesChanged) {
        editTrip(t => {
            t.title = title; t.kind = kind;
            if (datesChanged) {
                const cur = tripDays(t);   // 묻는 사이 남이 고쳤을 수 있어 지금 것을 다시 읽는다
                t.days = Array.from({ length: n }, (_, i) => ({ ...(cur[i] || { course: '', area: '', tee: '', stay: '', memo: '' }), date: isoAdd(start, i) }));
            }
        }, datesChanged ? `✅ ${tripSpanText(start, end)}(으)로 변경했습니다.` : '✅ 저장했습니다.');
    }
    tripEditing = null; renderTripPage();
}
async function deleteTrip() {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    if (!await showConfirmPrompt(`<b>${escapeHtml(trip.title)}</b>을(를) 삭제할까요?<br><span style="font-weight:500;color:#6b7075;">일정·메모가 모두 삭제됩니다. 직후에는 ↩️ 되돌리기로 복구할 수 있습니다.</span>`, '삭제')) return;
    const id = trip.id;
    if (!findTrip(id)) return;
    saveState();
    appData.trips = (appData.trips || []).filter(t => !t || t.id !== id);
    syncToSupabase(appData);
    showToast('🗑️ 여행을 삭제했습니다.');
    tripOpenId = (activeTrip() || allTrips()[0] || {}).id || null;
    tripEditing = null;
    renderTripPage();
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
        (list.length ? '' : `<div class="course-empty">검색 결과가 없으면 골프장명을 직접 입력하세요.</div>`);
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

// ─── 여행 기본 정보 (여행 전체에 한 벌 · 예전 이름 `교통·숙소`) ───
// 사용자 요청 — `렌트카 사용 여부나 숙소, 항공 정보도 입력`. 날마다 다른 것(골프장·티오프·묵는 곳)은
// 날짜 칸에, 여행 내내 하나인 것(항공편·렌트카·숙소 예약번호)은 여기에 둔다.
// 숙소 이름은 날짜 칸의 `stay`가 원본이다 — 여기서는 그걸 묶어 보여 주기만 하고(`stayRuns()`),
// 예전에 있던 `숙소 정보`(stayInfo — 체크인 시각·연락처 따위)는 쓰임이 모호하다는 사용자 말로 걷어냈다.
// 키에서 빠졌으므로 다음 저장 때 옛 값도 함께 걷힌다. 되살리지 말 것.
// 사용자 요청(10/09) — 예약 칸 이름은 `예약번호` · 렌트 인수·반납은 한 칸(`carPlace`) · 렌트 보험(`carIns`) ·
// 항공 수하물(`bag`). 예전의 `carPick`/`carDrop`은 읽을 때 한 칸으로 합쳐 보이고, 다음 저장 때 `carPlace`로 옮겨진다.
// 수하물은 포함·미포함 단추 + kg 칸이다(사용자 요청). 예전 자유 글 `bag`은 tripTravel()이 읽어 옮기고 다음 저장 때 걷힌다.
const TRAVEL_KEYS = ['flightOut', 'flightBack', 'bagIn', 'bagKg', 'flightRef', 'car', 'carCo', 'carPlace', 'carIns', 'carRef'];
const TRAVEL_BAG = { yes: '포함', no: '미포함' };   // 고르지 않으면 미정
const TRAVEL_CAR = { '': '미정', yes: '사용', no: '미사용' };
const TRAVEL_INS = { '': '미정', yes: '가입', no: '미가입' };
const DAY_BF = { '': '미정', yes: '포함', no: '불포함' };   // 일자별 숙소의 조식 (day.bf)
function tripTravel(trip) {
    const t = trip && trip.travel && typeof trip.travel === 'object' ? trip.travel : {};
    const out = {};
    TRAVEL_KEYS.forEach(k => { out[k] = typeof t[k] === 'string' ? t[k] : ''; });
    if (!TRAVEL_CAR[out.car]) out.car = '';
    if (!TRAVEL_INS[out.carIns]) out.carIns = '';
    if (!TRAVEL_BAG[out.bagIn]) out.bagIn = '';
    out.bagKg = kgText(out.bagKg);
    out.bagOld = '';
    if (!out.bagIn && !out.bagKg && typeof t.bag === 'string' && t.bag.trim()) {   // 예전 자유 글(`위탁 23kg 1개`)
        const m = /(\d+(?:\.\d+)?)\s*kg/i.exec(t.bag);
        if (m) { out.bagIn = 'yes'; out.bagKg = kgText(m[1]); }
        else if (/미포함|불포함|없음/.test(t.bag)) out.bagIn = 'no';
        else out.bagOld = t.bag.trim();
    }
    if (!out.carPlace) {   // 예전 두 칸(인수·반납)을 한 칸으로
        const pick = typeof t.carPick === 'string' ? t.carPick.trim() : '', drop = typeof t.carDrop === 'string' ? t.carDrop.trim() : '';
        out.carPlace = pick && drop ? (pick === drop ? pick : `${pick} / ${drop}`) : (pick || drop);
    }
    return out;
}
function kgText(v) { const m = /\d+(?:\.\d)?/.exec(String(v || '')); return m && parseFloat(m[0]) > 0 && parseFloat(m[0]) < 1000 ? m[0] : ''; }
function bagText(t) { return t.bagIn === 'yes' ? `포함${t.bagKg ? ` · ${t.bagKg}kg` : ''}` : t.bagIn === 'no' ? '미포함' : t.bagOld; }
function bfText(bf) { return bf === 'yes' ? '조식 포함' : bf === 'no' ? '조식 불포함' : ''; }
function segHtml(name, map, cur, onchange) {
    return `<div class="trip-seg">${Object.entries(map).map(([k, v]) => `<label><input type="radio" name="${name}" value="${k}"${cur === k ? ' checked' : ''}${onchange ? ` onchange="${onchange}"` : ''}><span>${v}</span></label>`).join('')}</div>`;
}
function segVal(name, map) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el && map[el.value] !== undefined ? el.value : '';
}
// 숙박하는 날 — 마지막 날은 귀가하는 날이라 뺀다(하루짜리 여행은 그날). 기본 정보의 `전 일정 숙소`가 이 날들에 들어간다.
function stayNights(trip) { const days = tripDays(trip); return days.length > 1 ? days.slice(0, -1) : days; }
// 숙박일 숙소가 모두 같으면 그 이름과 조식 — 기본 정보 입력 칸을 미리 채운다. 다르거나 비었으면 빈칸.
function commonStay(trip) {
    const n = stayNights(trip);
    const name = n.length ? (n[0].stay || '').trim() : '';
    const bf = n.length && DAY_BF[n[0].bf] ? n[0].bf : '';
    return name && n.every(d => (d.stay || '').trim() === name && (DAY_BF[d.bf] ? d.bf : '') === bf) ? { name, bf } : { name: '', bf: '' };
}
// 같은 숙소가 이어지는 날을 한 줄로 묶는다 — `1~2일차 디오션 리조트`
function stayRuns(trip) {
    const days = tripDays(trip), runs = [];
    days.forEach((d, i) => {
        const name = (d.stay || '').trim();
        if (!name) return;
        const bf = DAY_BF[d.bf] ? d.bf : '';
        const last = runs[runs.length - 1];
        if (last && last.name === name && last.bf === bf && last.to === i - 1) last.to = i;
        else runs.push({ name, bf, from: i, to: i });
    });
    return runs.map(r => `${r.from === r.to ? r.from + 1 : `${r.from + 1}~${r.to + 1}`}일차 ${r.name}${r.bf ? ' · ' + bfText(r.bf) : ''}`);
}
function travelRow(k, v, empty) {
    return `<div class="trip-row"><span class="k">${k}</span><span class="v${v ? '' : ' empty'}">${v ? escapeHtml(v) : empty}</span></div>`;
}
function travelHtml(trip) {
    const t = tripTravel(trip);
    const kind = tripKind(trip);
    if (tripEditing === 'travel') {
        const cs = commonStay(trip);
        const nights = stayNights(trip);
        const stayLabel = nights.length > 1 ? `1~${nights.length}일차` : '1일차';
        const f = (id, label, v, max = 60) => `<label class="trip-field row"><span>${label}</span><input type="text" id="${id}" maxlength="${max}" autocomplete="off" value="${escapeHtml(v)}"></label>`;
        return `
        <div class="trip-day editing" id="tripTravelCard">
            <div class="trip-day-head">🧭 여행 기본 정보</div>
            <div class="trip-sub">항공 <small class="trip-sub-note">편명·출발 시각</small></div>
            ${f('tripTvFlightOut', '출발편', t.flightOut)}
            ${f('tripTvFlightBack', '복귀편', t.flightBack)}
            <div class="trip-field row trip-bag"><span>수하물</span>${segHtml('tripTvBagIn', TRAVEL_BAG, t.bagIn, 'tripBagChanged()')}<input type="text" id="tripTvBagKg" inputmode="decimal" maxlength="5" autocomplete="off" aria-label="수하물 무게(kg)" value="${escapeHtml(t.bagKg)}"${t.bagIn === 'yes' ? '' : ' style="visibility:hidden;"'}><em${t.bagIn === 'yes' ? '' : ' style="visibility:hidden;"'}>kg</em></div>
            ${t.bagOld ? `<div class="trip-hint">기존 기재 내용: ${escapeHtml(t.bagOld)}</div>` : ''}
            ${f('tripTvFlightRef', '예약번호', t.flightRef, 40)}
            <div class="trip-sub trip-sub-row">렌트카
                <div class="trip-seg">${Object.entries(TRAVEL_CAR).map(([k, v]) => `<label><input type="radio" name="tripTvCar" value="${k}"${t.car === k ? ' checked' : ''} onchange="tripCarChanged()"><span>${v}</span></label>`).join('')}</div>
            </div>
            <div id="tripTvCarBox"${t.car === 'yes' ? '' : ' style="display:none;"'}>
                ${f('tripTvCarCo', '업체·차종', t.carCo)}
                ${f('tripTvCarPlace', '인수·반납', t.carPlace, 80)}
                <div class="trip-field row"><span>보험</span>${segHtml('tripTvCarIns', TRAVEL_INS, t.carIns)}</div>
                ${f('tripTvCarRef', '예약번호', t.carRef, 40)}
            </div>
            <div class="trip-sub">숙소 <small class="trip-sub-note">전 일정 동일 시</small></div>
            <label class="trip-field row"><span>숙소명</span><input type="text" id="tripTvStay" maxlength="60" autocomplete="off" value="${escapeHtml(cs.name)}"></label>
            <div class="trip-field row"><span>조식</span>${segHtml('tripTvStayBf', DAY_BF, cs.bf)}</div>
            <div class="trip-hint">입력하면 숙박일(${stayLabel})의 숙소가 모두 같은 숙소로 저장됩니다. 일자별로 다르면 비워 두고 일자별 <b>입력</b>에서 기재합니다.</div>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripTravel()">저장</button>
            </div>
        </div>`;
    }
    // 국내 여행은 비행기를 안 타는 일이 많아, 적은 게 없으면 항공 줄을 아예 안 보인다(제주라면 적으면 나온다).
    const flight = (kind !== 'domestic' || t.flightOut || t.flightBack || t.flightRef || bagText(t)) ? `
            ${travelRow('출발편', t.flightOut, '미정')}
            ${travelRow('복귀편', t.flightBack, '미정')}
            ${bagText(t) ? travelRow('수하물', bagText(t), '') : ''}
            ${t.flightRef ? travelRow('예약번호', t.flightRef, '') : ''}` : '';
    const car = t.car === 'yes' ? `
            ${travelRow('렌트카', t.carCo || '사용', '')}
            ${t.carPlace ? travelRow('인수·반납', t.carPlace, '') : ''}
            ${travelRow('보험', t.carIns ? TRAVEL_INS[t.carIns] : '', '미정')}
            ${t.carRef ? travelRow('예약번호', t.carRef, '') : ''}` : travelRow('렌트카', t.car === 'no' ? '미사용' : '', '미정');
    const runs = stayRuns(trip);
    const stay = runs.length ? runs.map((r, i) => travelRow(i ? '' : '숙소', r, '')).join('') : travelRow('숙소', '', '일자별 숙소를 입력하면 이곳에 표시됩니다');
    return `
        <div class="trip-day trip-travel" id="tripTravelCard">
            <div class="trip-day-head">🧭 여행 기본 정보</div>
            ${flight}
            ${car}
            ${stay}
            <div class="trip-actions light"><button type="button" class="trip-link" onclick="editTripTravel()">입력</button></div>
        </div>`;
}
function tripCarChanged() {
    const el = document.querySelector('input[name="tripTvCar"]:checked');
    const box = document.getElementById('tripTvCarBox');
    if (box) box.style.display = el && el.value === 'yes' ? '' : 'none';
}
function tripBagChanged() {
    const on = segVal('tripTvBagIn', TRAVEL_BAG) === 'yes';
    document.querySelectorAll('.trip-bag input[type="text"], .trip-bag em').forEach(el => { el.style.visibility = on ? '' : 'hidden'; });
    if (on) { const kg = document.getElementById('tripTvBagKg'); if (kg && !kg.value) kg.focus(); }
}
function editTripTravel() { tripEditing = 'travel'; renderTripPage(); }
function saveTripTravel() {
    const val = id => ((document.getElementById(id) || {}).value || '').trim();
    const carEl = document.querySelector('input[name="tripTvCar"]:checked');
    const car = carEl && TRAVEL_CAR[carEl.value] !== undefined ? carEl.value : '';
    const bagIn = segVal('tripTvBagIn', TRAVEL_BAG);
    const next = {
        flightOut: val('tripTvFlightOut'), flightBack: val('tripTvFlightBack'), flightRef: val('tripTvFlightRef'),
        bagIn, bagKg: bagIn === 'yes' ? kgText(val('tripTvBagKg')) : '',   // 미포함이면 무게는 걷는다
        car,
        // 미사용이면 업체·예약번호는 걷는다 — 남겨 두면 마음을 바꿨을 때 옛 예약이 되살아난다
        carCo: car === 'yes' ? val('tripTvCarCo') : '', carPlace: car === 'yes' ? val('tripTvCarPlace') : '',
        carIns: car === 'yes' ? segVal('tripTvCarIns', TRAVEL_INS) : '', carRef: car === 'yes' ? val('tripTvCarRef') : ''
    };
    const stay = val('tripTvStay'), stayBf = segVal('tripTvStayBf', DAY_BF);
    const trip = findTrip(tripOpenId);
    tripEditing = null;
    if (!trip) { renderTripPage(); return; }
    const cur = tripTravel(trip);
    const old = trip.travel || {};
    // 예전 칸(인수·반납 두 칸 · 자유 글 수하물)이 남아 있으면 값이 같아도 한 번 저장해 새 칸으로 옮긴다
    const travelChanged = TRAVEL_KEYS.some(k => cur[k] !== next[k]) || old.carPick || old.carDrop || (old.bag !== undefined && !cur.bagOld);
    // 전 일정 숙소 — 적었으면 숙박일 모두에 넣는다. 원래 같은 숙소였는데 비웠으면 숙박일 숙소를 지운다.
    // 날마다 달라서 빈칸으로 열렸고 그대로 두었으면 일자별 숙소는 건드리지 않는다.
    const cs = commonStay(trip);
    const nightDates = stayNights(trip).map(d => d.date);
    const stayChanged = stay ? (stay !== cs.name || stayBf !== cs.bf) : !!cs.name;
    if (travelChanged || stayChanged) editTrip(t => {
        if (travelChanged) {
            const clean = {};
            TRAVEL_KEYS.forEach(k => { if (next[k]) clean[k] = next[k]; });
            if (Object.keys(clean).length) t.travel = clean; else delete t.travel;
        }
        if (stayChanged) (t.days || []).forEach(d => {
            if (!d || !nightDates.includes(d.date)) return;
            d.stay = stay;
            if (stay && stayBf) d.bf = stayBf; else delete d.bf;
        });
    }, '✅ 여행 기본 정보를 저장했습니다.');
    renderTripPage();
}

// ─── 여행 경비 · 준비물 ───
// 사용자 요청 — 일본 여행은 총무(사용자)가 항공·렌트카·숙소·골프장을 모두 예약·선결제하고, 그 내용을
// 카톡에 손으로 길게 적어 공유했다(`일일이 다 적어서 카톡으로 공유했는데 힘들었어`).
// 그래서 ① 항목을 적으면 1인 분담금·결제 상태·송금 현황이 저절로 계산되어 보이고 ② 준비물 목록을 둔다.
// 동반자도 앱을 같이 쓰므로 카톡에 옮길 글은 만들지 않는다(한때 넣었다가 사용자 요청으로 뺐다).
//   trip.costs  = [{id, cat, title, amt, cur:'KRW'|현지 통화 코드, unit:'person'|'total', status:'paid'|'local'|'plan'}]
//   trip.people = 인원(분담 기준, 기본 4) · trip.curr = 현지 통화(JPY·USD… / 'KRW'=원화만) · trip.fx = 현지 통화 기준 단위당 원
//   trip.payer = 총무 이름
//   trip.account = 송금 계좌 · trip.paid = {이름: true} · trip.fund = [{title, amt, cur}] · trip.pack = [문자열]
// **금액은 원과 현지 통화를 섞어 적는다** — 일본 현지 결제(그린피·식사)는 엔으로, 선결제는 원으로 정해진다.
// 현지 통화는 여행마다 하나다(`tripCur()` — 정하지 않았으면 일본 여행은 엔, 나머지는 원화만). 국내 여행은 원화만이라
// 통화·환율 칸이 아예 안 나온다(사용자 제보 — `국내여행인경우도있고 다른 나라일경우도있는데 엔으로만 표시`).
// 안에서는 항목의 통화를 'KRW'/'F'(현지 통화)로만 다루고, 저장할 때 'F'를 그 여행의 통화 코드로 적는다.
// 환율은 자동으로 받지 않는다 — 카드사·환전소마다 달라 총무가 실제로 바꾼 값을 적는 편이 정산과 맞는다.
const COST_CATS = { air: '항공', stay: '숙소', car: '렌트카', golf: '그린피', meal: '식사', move: '교통', etc: '기타' };
const COST_STATUS = { paid: '결제 완료', local: '현지 결제', plan: '예약 예정' };
const COST_UNITS = { person: '1인', total: '전체' };
// base = 환율을 적는 단위(100엔 = 920원처럼 단위가 작은 통화는 100).
const FX_CURS = { JPY: { name: '엔', base: 100 }, USD: { name: '달러', base: 1 }, EUR: { name: '유로', base: 1 }, CNY: { name: '위안', base: 1 },
    TWD: { name: '대만달러', base: 1 }, THB: { name: '바트', base: 1 }, VND: { name: '동', base: 100 }, PHP: { name: '페소', base: 1 } };
const curDefault = trip => tripKind(trip) === 'japan' ? 'JPY' : '';
function tripCur(trip) { const c = trip && trip.curr; return c === 'KRW' ? '' : FX_CURS[c] ? c : curDefault(trip); }
const PACK_JAPAN = ['여권(유효기간 6개월 이상)', '국제운전면허증', '110V 변환 어댑터', '개인 상비약', '골프용품', '엔화·해외 결제 카드'];
const PACK_DOMESTIC = ['골프용품', '개인 상비약', '신분증'];

const costNum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(n) && n > 0 ? n : 0; };
function tripPeople(trip) { const n = parseInt(trip && trip.people, 10); return n >= 1 && n <= 20 ? n : golfers.length; }
function tripFx(trip) { const n = costNum(trip && trip.fx); return tripCur(trip) && n > 0 && n < 100000 ? n : 0; }
function tripCosts(trip) {
    return (Array.isArray(trip && trip.costs) ? trip.costs : []).filter(c => c && typeof c === 'object').map(c => ({
        id: ID_RE.test(c.id || '') ? c.id : '',
        cat: COST_CATS[c.cat] ? c.cat : 'etc',
        title: typeof c.title === 'string' ? c.title : '',
        amt: costNum(c.amt),
        cur: c.cur && c.cur !== 'KRW' && tripCur(trip) ? 'F' : 'KRW',
        unit: COST_UNITS[c.unit] ? c.unit : 'person',
        status: COST_STATUS[c.status] ? c.status : 'paid'
    }));
}
function tripFund(trip) {
    return (Array.isArray(trip && trip.fund) ? trip.fund : []).filter(f => f && typeof f === 'object').map(f => ({
        title: typeof f.title === 'string' ? f.title : '', amt: costNum(f.amt), cur: f.cur !== 'KRW' && tripCur(trip) ? 'F' : 'KRW'
    }));
}
function tripPack(trip) { return (Array.isArray(trip && trip.pack) ? trip.pack : []).filter(s => typeof s === 'string' && s.trim()); }

// 1인 몫 — {krw, f}(f = 현지 통화). 전체 금액은 인원으로 나눈다.
function costShare(c, people) {
    const v = c.unit === 'total' ? c.amt / people : c.amt;
    return c.cur === 'F' ? { krw: 0, f: v } : { krw: v, f: 0 };
}
const wonText = v => `${formatNumber(Math.round(v))}원`;
const fText = (v, cur) => `${formatNumber(Math.round(v))}${(FX_CURS[cur] || FX_CURS.JPY).name}`;
const amtText = (v, isF, cur) => isF ? fText(v, cur) : wonText(v);
// 원·현지 통화가 섞이면 환율이 있을 때 원으로 합쳐 `약`을 붙이고, 없으면 둘을 나란히 적는다.
// ctx = {cur, fx} — costSummary()가 돌려주는 것을 그대로 넘긴다.
function moneyText(m, ctx) {
    const cur = ctx && ctx.cur, fx = ctx && ctx.fx;
    if (m.f > 0 && fx && cur) return `약 ${wonText(m.krw + m.f * fx / FX_CURS[cur].base)}`;
    const parts = [];
    if (m.krw > 0 || !m.f) parts.push(wonText(m.krw));
    if (m.f > 0) parts.push(fText(m.f, cur));
    return parts.join(' + ');
}
function costSummary(trip) {
    const people = tripPeople(trip), fx = tripFx(trip), cur = tripCur(trip);
    const add = (a, b) => ({ krw: a.krw + b.krw, f: a.f + b.f });
    const zero = () => ({ krw: 0, f: 0 });
    const total = zero(), byStatus = { paid: zero(), local: zero(), plan: zero() }, byCat = {};
    tripCosts(trip).forEach(c => {
        const s = costShare(c, people);
        Object.assign(total, add(total, s));
        byStatus[c.status] = add(byStatus[c.status], s);
        byCat[c.cat] = add(byCat[c.cat] || zero(), s);
    });
    return { people, fx, cur, total, byStatus, byCat };
}

// 내역 앞에 구분을 붙이되, 내역이 이미 그 말로 시작하면 두 번 적지 않는다(`그린피 그린피 54홀`).
function costLabel(c) { const cat = COST_CATS[c.cat]; return !c.title ? cat : c.title.startsWith(cat) ? c.title : `${cat} ${c.title}`; }
let costDraft = null;   // 입력하는 동안의 사본 — 항목을 늘리고 줄여도 적던 값이 안 날아간다
const costOpt = (map, cur) => Object.entries(map).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v}</option>`).join('');
// 현지 통화가 없는 여행(국내·원화만)이면 통화 칸을 아예 안 그린다.
function curSelect(cls, cur, v) { return cur ? `<select class="${cls}">${costOpt({ KRW: '원', F: FX_CURS[cur].name }, v)}</select>` : ''; }
function costEditRow(c, i, cur) {
    const opt = costOpt;
    return `
        <div class="cost-edit" data-i="${i}">
            <div class="cost-edit-line">
                <select class="cost-cat">${opt(COST_CATS, c.cat)}</select>
                <input type="text" class="cost-title" maxlength="40" autocomplete="off" value="${escapeHtml(c.title)}" aria-label="내역">
                <button type="button" class="cost-x" onclick="removeCostRow(${i})" aria-label="항목 삭제">✕</button>
            </div>
            <div class="cost-edit-line">
                <input type="text" class="cost-amt" inputmode="numeric" autocomplete="off" value="${c.amt ? formatNumber(c.amt) : ''}" onblur="costAmtTidy(this)" aria-label="금액">
                ${curSelect('cost-cur', cur, c.cur)}
                <select class="cost-unit">${opt(COST_UNITS, c.unit)}</select>
                <select class="cost-status">${opt(COST_STATUS, c.status)}</select>
            </div>
        </div>`;
}
function fundEditRow(f, i, cur) {
    return `
        <div class="cost-edit-line fund-edit" data-i="${i}">
            <input type="text" class="fund-title" maxlength="30" autocomplete="off" value="${escapeHtml(f.title)}" aria-label="공금 내역">
            <input type="text" class="fund-amt" inputmode="numeric" autocomplete="off" value="${f.amt ? formatNumber(f.amt) : ''}" onblur="costAmtTidy(this)" aria-label="금액">
            ${curSelect('fund-cur', cur, f.cur)}
            <button type="button" class="cost-x" onclick="removeFundRow(${i})" aria-label="공금 항목 삭제">✕</button>
        </div>`;
}
function costAmtTidy(el) { const n = costNum(el.value); el.value = n ? formatNumber(n) : ''; }

function costHtml(trip) {
    if (tripEditing === 'costs' && costDraft) {
        const d = costDraft;
        return `
        <div class="trip-day editing" id="tripCostCard">
            <div class="trip-day-head">💰 여행 경비</div>
            <div class="cost-head">
                <label class="cost-head-item">인원 <input type="number" id="costPeople" class="cost-num" min="1" max="20" inputmode="numeric" value="${d.people}"> 명</label>
                <label class="cost-head-item">현지 통화 <select id="costCur" onchange="costCurChanged()">${costOpt({ '': '원화만', ...Object.fromEntries(Object.entries(FX_CURS).map(([k, v]) => [k, `${v.name}(${k})`])) }, d.cur)}</select></label>
            </div>
            ${d.cur ? `<div class="cost-head">
                <label class="cost-head-item">환율 ${FX_CURS[d.cur].base === 100 ? '100' : '1'}${FX_CURS[d.cur].name} = <input type="text" id="costFx" class="cost-num wide" inputmode="decimal" autocomplete="off" value="${d.fx || ''}" aria-label="환율"> 원</label>
            </div>` : ''}
            <div class="trip-sub">경비 항목 <small class="trip-sub-note">구분 · 내역 / 금액 · ${d.cur ? '통화 · ' : ''}기준 · 상태</small></div>
            <div id="costRows">${d.items.map((c, i) => costEditRow(c, i, d.cur)).join('')}</div>
            <button type="button" class="trip-btn cost-add" onclick="addCostRow()">＋ 항목 추가</button>
            <div class="trip-hint"><b>1인</b>은 1인 금액, <b>전체</b>는 총액을 입력하면 인원수로 나눕니다.</div>
            <div class="trip-sub">현지 공금 <small class="trip-sub-note">남은 잔액·찬조</small></div>
            <div id="fundRows">${d.fund.map((f, i) => fundEditRow(f, i, d.cur)).join('')}</div>
            <button type="button" class="trip-btn cost-add" onclick="addFundRow()">＋ 공금 항목 추가</button>
            <div class="trip-sub">송금 안내</div>
            <label class="trip-field row"><span>총무</span><select id="costPayer"><option value="">미지정</option>${golfers.map(n => `<option value="${escapeHtml(n)}"${n === d.payer ? ' selected' : ''}>${escapeHtml(n)}</option>`).join('')}</select></label>
            <label class="trip-field row"><span>계좌</span><input type="text" id="costAccount" maxlength="60" autocomplete="off" value="${escapeHtml(d.account)}"></label>
            <div class="trip-hint">동반자는 <b>결제 완료</b> 항목의 1인 금액을 총무에게 송금합니다. 앱 데이터는 주소를 아는 사람이 열람할 수 있으므로 계좌 정보는 필요한 만큼만 입력합니다.</div>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripCosts()">저장</button>
            </div>
        </div>`;
    }
    const items = tripCosts(trip);
    const fund = tripFund(trip).filter(f => f.title || f.amt);
    const s = costSummary(trip);
    if (!items.length && !fund.length) return `
        <div class="trip-day" id="tripCostCard">
            <div class="trip-day-head">💰 여행 경비</div>
            <div class="trip-memo empty">항공·숙소·렌트카·그린피 등의 금액을 입력하면 1인 분담금과 결제 현황이 자동으로 계산됩니다.</div>
            <div class="trip-actions light"><button type="button" class="trip-link" onclick="editTripCosts()">입력</button></div>
        </div>`;
    const statusRow = Object.entries(COST_STATUS).filter(([k]) => s.byStatus[k].krw || s.byStatus[k].f)
        .map(([k, v]) => `<div class="cost-stat ${k}"><span>${v}</span><b>${moneyText(s.byStatus[k], s)}</b></div>`).join('');
    const rows = items.map(c => {
        const share = costShare(c, s.people);
        const detail = c.unit === 'total' ? `전체 ${amtText(c.amt, c.cur === 'F', s.cur)} ÷ ${s.people}명` : '';
        return `
            <div class="cost-row">
                <span class="cost-cat-tag">${COST_CATS[c.cat]}</span>
                <span class="cost-main"><span class="cost-name">${c.title ? escapeHtml(c.title) : COST_CATS[c.cat]}</span>${detail ? `<span class="cost-detail">${detail}</span>` : ''}</span>
                <span class="cost-right"><b>${moneyText(share, { cur: s.cur })}</b><span class="cost-badge ${c.status}">${COST_STATUS[c.status]}</span></span>
            </div>`;
    }).join('');
    const fundSum = fund.reduce((a, f) => f.cur === 'F' ? { krw: a.krw, f: a.f + f.amt } : { krw: a.krw + f.amt, f: a.f }, { krw: 0, f: 0 });
    const fundHtml = fund.length ? `
            <div class="trip-sub">현지 공금</div>
            ${fund.map(f => `<div class="cost-fund-row"><span>${escapeHtml(f.title) || '공금'}</span><b>${amtText(f.amt, f.cur === 'F', s.cur)}</b></div>`).join('')}
            ${fund.length > 1 ? `<div class="cost-fund-row"><span>합계</span><b>${moneyText(fundSum, { cur: s.cur })}</b></div>` : ''}` : '';
    const send = s.byStatus.paid;
    const payer = golfers.includes(trip.payer) ? trip.payer : '';
    const paid = trip.paid && typeof trip.paid === 'object' ? trip.paid : {};
    const mates = golfers.filter(n => n !== payer);
    const sendHtml = (send.krw || send.f) ? `
            <div class="trip-sub">송금 안내</div>
            <div class="cost-send">
                <div>${payer ? `총무 <b>${escapeHtml(payer)}</b>에게 ` : ''}1인 <b>${moneyText(send, s)}</b> 송금 <small>(결제 완료 항목)</small></div>
                ${trip.account ? `<div class="cost-account"><span>${escapeHtml(trip.account)}</span><button type="button" class="trip-link" onclick="copyTripAccount()">복사</button></div>` : ''}
                <div class="cost-paid">${mates.map(n => `<button type="button" class="cost-paid-chip${paid[n] ? ' on' : ''}" onclick="toggleTripPaid('${escapeHtml(n)}')">${escapeHtml(n)} <small>${paid[n] ? '입금 완료' : '입금 대기'}</small></button>`).join('')}</div>
            </div>` : '';
    return `
        <div class="trip-day trip-cost" id="tripCostCard">
            <div class="trip-day-head">💰 여행 경비</div>
            <div class="cost-total">
                <span class="cost-total-k">1인 예상 총액</span>
                <span class="cost-total-v">${moneyText(s.total, s)}</span>
                <span class="cost-total-sub">인원 ${s.people}명${s.fx ? ` · ${FX_CURS[s.cur].base === 100 ? '100' : '1'}${FX_CURS[s.cur].name} = ${formatNumber(s.fx)}원` : ''}</span>
            </div>
            ${statusRow ? `<div class="cost-stats">${statusRow}</div>` : ''}
            <div class="cost-list">${rows}</div>
            ${fundHtml}
            ${sendHtml}
            <div class="trip-actions light"><button type="button" class="trip-link" onclick="editTripCosts()">입력</button></div>
        </div>`;
}
function editTripCosts() {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    const items = tripCosts(trip);
    const fund = tripFund(trip);
    costDraft = {
        people: tripPeople(trip), cur: tripCur(trip), fx: tripFx(trip), payer: golfers.includes(trip.payer) ? trip.payer : '',
        account: typeof trip.account === 'string' ? trip.account : '',
        items: items.length ? items : [{ id: '', cat: 'air', title: '', amt: 0, cur: 'KRW', unit: 'person', status: 'paid' }],
        fund
    };
    tripEditing = 'costs';
    renderTripPage();
    const card = document.getElementById('tripCostCard');
    if (card) card.scrollIntoView({ block: 'start' });
}
// 화면의 칸을 사본으로 읽어 온다 — 줄을 더하거나 뺄 때·저장할 때 같은 길을 쓴다.
function readCostForm() {
    if (!costDraft) return null;
    const val = id => ((document.getElementById(id) || {}).value || '').trim();
    costDraft.people = Math.min(20, Math.max(1, parseInt(val('costPeople'), 10) || golfers.length));
    if (document.getElementById('costCur')) costDraft.cur = FX_CURS[val('costCur')] ? val('costCur') : '';
    if (document.getElementById('costFx')) costDraft.fx = costNum(val('costFx'));
    costDraft.payer = golfers.includes(val('costPayer')) ? val('costPayer') : '';
    costDraft.account = val('costAccount');
    costDraft.items = [...document.querySelectorAll('#costRows .cost-edit')].map(el => {
        const q = s => el.querySelector(s).value;
        const prev = costDraft.items[+el.dataset.i] || {};
        const curEl = el.querySelector('.cost-cur');
        return { id: prev.id || '', cat: q('.cost-cat'), title: q('.cost-title').trim(), amt: costNum(q('.cost-amt')), cur: curEl ? curEl.value : 'KRW', unit: q('.cost-unit'), status: q('.cost-status') };
    });
    costDraft.fund = [...document.querySelectorAll('#fundRows .fund-edit')].map(el => ({
        title: el.querySelector('.fund-title').value.trim(), amt: costNum(el.querySelector('.fund-amt').value), cur: el.querySelector('.fund-cur') ? el.querySelector('.fund-cur').value : 'KRW'
    }));
    return costDraft;
}
function addCostRow() {
    const d = readCostForm(); if (!d) return;
    const last = d.items[d.items.length - 1];
    d.items.push({ id: '', cat: 'etc', title: '', amt: 0, cur: last ? last.cur : 'KRW', unit: 'person', status: last ? last.status : 'paid' });
    renderTripPage();
    const rows = document.querySelectorAll('#costRows .cost-title');
    if (rows.length) rows[rows.length - 1].focus();
}
function removeCostRow(i) { const d = readCostForm(); if (!d) return; d.items.splice(i, 1); renderTripPage(); }
function addFundRow() {
    const d = readCostForm(); if (!d) return;
    d.fund.push({ title: '', amt: 0, cur: d.cur ? 'F' : 'KRW' });
    renderTripPage();
    const rows = document.querySelectorAll('#fundRows .fund-title');
    if (rows.length) rows[rows.length - 1].focus();
}
// 현지 통화를 바꾸면 통화·환율 칸이 생기거나 사라지므로 다시 그린다(적던 값은 사본에 먼저 담는다).
function costCurChanged() { const d = readCostForm(); if (!d) return; if (!d.cur) d.fx = 0; renderTripPage(); }
function removeFundRow(i) { const d = readCostForm(); if (!d) return; d.fund.splice(i, 1); renderTripPage(); }
function saveTripCosts() {
    const d = readCostForm();
    if (!d) return;
    const items = d.items.filter(c => c.title || c.amt).map((c, i) => ({
        id: c.id || `c${Date.now().toString(36)}${i}`, cat: COST_CATS[c.cat] ? c.cat : 'etc', title: c.title, amt: c.amt,
        cur: d.cur && c.cur === 'F' ? d.cur : 'KRW', unit: COST_UNITS[c.unit] ? c.unit : 'person', status: COST_STATUS[c.status] ? c.status : 'paid'
    }));
    const fund = d.fund.filter(f => f.title || f.amt).map(f => ({ title: f.title, amt: f.amt, cur: d.cur && f.cur === 'F' ? d.cur : 'KRW' }));
    const trip = findTrip(tripOpenId);
    costDraft = null;
    tripEditing = null;
    if (!trip) { renderTripPage(); return; }
    const oc = tripCur(trip), code = x => x === 'F' ? oc : x;
    const before = JSON.stringify([tripCosts(trip).map(c => [c.id, c.cat, c.title, c.amt, code(c.cur), c.unit, c.status]), tripFund(trip).map(f => [f.title, f.amt, code(f.cur)]), tripPeople(trip), oc, tripFx(trip), trip.payer || '', trip.account || '']);
    const after = JSON.stringify([items.map(c => [c.id, c.cat, c.title, c.amt, c.cur, c.unit, c.status]), fund.map(f => [f.title, f.amt, f.cur]), d.people, d.cur, d.cur ? d.fx : 0, d.payer, d.account]);
    // 비교는 내가 만든 배열끼리다(payload의 키 순서와 무관하다).
    if (before !== after) editTrip(t => {
        const set = (k, v, keep) => { if (keep) t[k] = v; else delete t[k]; };
        set('costs', items, items.length);
        set('fund', fund, fund.length);
        set('people', d.people, d.people !== golfers.length);
        // 기본 통화(일본=엔, 그 밖=원화만)와 같으면 안 적는다. '원화만'을 고르면 'KRW'로 적어 기본값을 누른다.
        set('curr', d.cur || 'KRW', d.cur !== curDefault(t));
        set('fx', d.fx, d.cur && d.fx > 0);
        set('payer', d.payer, d.payer);
        set('account', d.account, d.account);
    }, '✅ 여행 경비를 저장했습니다.');
    renderTripPage();
}
function toggleTripPaid(name) {
    if (!golfers.includes(name)) return;
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    const on = !(trip.paid && trip.paid[name]);
    editTrip(t => {
        const p = t.paid && typeof t.paid === 'object' ? { ...t.paid } : {};
        if (on) p[name] = true; else delete p[name];
        if (Object.keys(p).length) t.paid = p; else delete t.paid;
    }, on ? `✅ ${name} 입금 완료로 표시했습니다.` : `↩️ ${name} 입금 대기로 되돌렸습니다.`);
    renderTripPage();
}
async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e) { return false; }
}
async function copyTripAccount() {
    const trip = findTrip(tripOpenId);
    if (trip && trip.account && await copyText(trip.account)) showToast('📋 계좌를 복사했습니다.');
}

// 준비물 — 줄마다 하나. 일본 여행이면 기본 목록을 한 번에 넣을 수 있다.
function packHtml(trip) {
    const list = tripPack(trip);
    if (tripEditing === 'pack') return `
        <div class="trip-day editing" id="tripPackCard">
            <div class="trip-day-head">🧳 준비물</div>
            <label class="trip-field"><textarea id="tripEdPack" rows="6" maxlength="600" aria-label="준비물 (한 줄에 하나)">${escapeHtml(list.join('\n'))}</textarea></label>
            <div class="trip-hint">한 줄에 한 항목씩 입력합니다. 담당자가 있으면 <b>국제운전면허증 (신성호·박승수)</b>처럼 함께 적습니다.</div>
            <div class="trip-actions"><button type="button" class="trip-btn" onclick="fillTripPack()">기본 항목 추가</button></div>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripPack()">저장</button>
            </div>
        </div>`;
    return `
        <div class="trip-day" id="tripPackCard">
            <div class="trip-day-head">🧳 준비물</div>
            ${list.length ? `<ul class="trip-pack">${list.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : '<div class="trip-memo empty">여권·국제운전면허증·변환 어댑터 등 준비물을 입력합니다.</div>'}
            <div class="trip-actions light"><button type="button" class="trip-link" onclick="editTripPack()">입력</button></div>
        </div>`;
}
function editTripPack() { tripEditing = 'pack'; renderTripPage(); }
function fillTripPack() {
    const ta = document.getElementById('tripEdPack');
    const trip = findTrip(tripOpenId);
    if (!ta || !trip) return;
    const have = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
    const add = (tripKind(trip) === 'domestic' ? PACK_DOMESTIC : PACK_JAPAN).filter(s => !have.includes(s));
    ta.value = have.concat(add).join('\n');
}
function saveTripPack() {
    const list = ((document.getElementById('tripEdPack') || {}).value || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40);
    const trip = findTrip(tripOpenId);
    tripEditing = null;
    if (trip && tripPack(trip).join('\n') !== list.join('\n')) editTrip(t => { if (list.length) t.pack = list; else delete t.pack; }, '✅ 준비물을 저장했습니다.');
    renderTripPage();
}


// 고치는 중인 날의 입력 칸 — 일정 줄기 안, 그날 자리에 그대로 선다.
function tripDayEditHtml(trip, d, i) {
    const dateId = d.date;
    const kind = tripKind(trip);
    return `
        <div class="trip-day editing">
            <div class="trip-day-head"><span class="trip-day-no">${i + 1}일차</span> ${isoLabel(d.date)}</div>
            <label class="trip-field row"><span>골프장</span><input type="text" id="tripEdCourse" maxlength="60" autocomplete="off" value="${escapeHtml(d.course)}"${kind === 'domestic' ? ' onfocus="this.select(); tripCourseSuggest(true)" oninput="tripCourseSuggest()" onblur="tripCourseHide()"' : ''}></label>
            ${kind === 'domestic' ? '<div id="tripCourseResults" class="course-results" style="display:none;"></div>' : ''}
            <label class="trip-field row"><span>지역</span><input type="text" id="tripEdArea" maxlength="20" value="${escapeHtml(d.area)}"></label>
            <label class="trip-field row"><span>티오프</span><input type="text" id="tripEdTee" maxlength="20" value="${escapeHtml(d.tee)}"></label>
            <label class="trip-field row"><span>숙소</span><input type="text" id="tripEdStay" maxlength="60" value="${escapeHtml(d.stay)}"></label>
            <div class="trip-field row"><span>조식</span>${segHtml('tripEdBf', DAY_BF, DAY_BF[d.bf] ? d.bf : '')}</div>
            <label class="trip-field row"><span>메모</span><textarea id="tripEdMemo" rows="2" maxlength="200">${escapeHtml(d.memo)}</textarea></label>
            <div class="trip-actions">
                <button type="button" class="trip-btn ghost" onclick="cancelTripEdit()">취소</button>
                <button type="button" class="trip-btn primary" onclick="saveTripDay('${dateId}')">저장</button>
            </div>
        </div>`;
}

// 펼친 날의 자세한 내용 — 티오프·숙소·메모·날씨와 지도·길찾기·입력.
function tripDayDetailHtml(trip, d, past) {
    const dateId = d.date;
    const kind = tripKind(trip);
    const targets = mapTargets(d, kind);
    const gora = d.gora ? goraUrl(d.gora.url) || (d.course ? goraSearchUrl(d.gora.ja || d.course) : '') : '';
    return `
        <div class="tl-detail">
            <div class="trip-row"><span class="k">티오프</span><span class="v${d.tee ? '' : ' empty'}">${d.tee ? escapeHtml(d.tee) : '미정'}</span></div>
            <div class="trip-row"><span class="k">숙소</span><span class="v${d.stay ? '' : ' empty'}">${d.stay ? escapeHtml(d.stay) : '미정'}${d.stay && bfText(d.bf) ? ` <span class="trip-bf">· ${bfText(d.bf)}</span>` : ''}</span></div>
            ${d.course && !past ? `<div class="trip-row trip-wx"><span class="k">날씨</span><span class="v" id="tripWx-${dateId}">${tripWeatherHtml(d)}</span></div>` : ''}
            ${d.memo ? `<div class="trip-memo">${escapeHtml(d.memo)}</div>` : ''}
            ${kind === 'japan' && !past ? `<div class="trip-actions"><button type="button" class="trip-btn gora" onclick="openGora('${dateId}')">🔎 일본 골프장 찾기${d.course ? ' (변경)' : ''}</button></div>` : ''}
            ${gora ? `<div class="trip-actions">
                <a class="trip-btn" href="${escapeHtml(gora)}" target="_blank" rel="noopener" onclick="return openGoraLink(this.href)">🎫 GORA에서 예약</a>
            </div>` : ''}
            <div class="trip-actions light">
                ${targets.map ? `<button type="button" class="trip-link" onclick="openTripMap('map', '${dateId}')">지도</button>` : ''}
                ${targets.route ? `<button type="button" class="trip-link" onclick="openTripMap('route', '${dateId}')">길찾기</button>` : ''}
                <button type="button" class="trip-link" onclick="editTripDay('${dateId}')">입력</button>
            </div>
        </div>`;
}

// 날마다 지났는지·오늘인지·아직인지. 표지의 점과 일정 줄기의 번호가 같은 잣대를 쓴다.
const dayState = (date, today) => date < today ? 'done' : date === today ? 'now' : 'next';

// 표지 — 여행명 · D-day · 날짜, 그리고 경로 점. 점은 **진행에 맞춰 색이 다르다**(사용자 요청 —
// `진행중인 느낌`): 지난 날은 꽉 찬 흰 점, 오늘은 노란 점(둘레 빛 + `오늘`), 아직은 속이 빈 점.
// 점 사이 줄도 지나온 만큼만 진하다. 마지막 `귀가`는 여행이 끝난 다음 날부터 지난 점이 된다.
function tripHeroHtml(trip, days, today) {
    const first = days[0].date, last = days[days.length - 1].date;
    const left = isoDiff(today, first);
    const nowIdx = days.findIndex(d => d.date === today);
    const ended = last < today;
    const big = ended ? '완료' : left > 0 ? `D-${left}` : `${nowIdx + 1}일차`;
    const rounds = days.filter(d => d.course).length;
    const kindName = TRIP_KINDS[tripKind(trip)].replace(/^\S+\s/, '');
    const pts = days.map(d => ({ label: d.area || d.course || '미정', st: dayState(d.date, today) }))
        .concat([{ label: '귀가', st: ended ? 'done' : 'next', home: true }]);
    const reached = i => pts[i].st !== 'next';   // 이 점까지 왔는가 — 그 앞 줄이 진해진다
    const route = pts.map((p, i) => `
            <div class="hero-pt ${p.st}${p.home ? ' home' : ''}">
                ${i > 0 ? `<span class="hero-line l${reached(i) ? ' on' : ''}"></span>` : ''}
                ${i < pts.length - 1 ? `<span class="hero-line r${reached(i + 1) ? ' on' : ''}"></span>` : ''}
                <span class="hero-dot"></span>
                <span class="hero-lbl">${escapeHtml(p.label)}</span>
                ${p.st === 'now' ? '<span class="hero-today">오늘</span>' : ''}
            </div>`).join('');
    return `
        <div class="trip-hero">
            <div class="hero-top">
                <span class="hero-meta">${kindName} · ${days.length > 1 ? `${days.length - 1}박 ${days.length}일 · ` : ''}${rounds}라운드</span>
                <button type="button" class="hero-gear" onclick="editTripSettings()" aria-label="여행 수정">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </button>
            </div>
            <div class="hero-mid">
                <div class="hero-title">${escapeHtml(trip.title || '여행')}</div>
                <div class="hero-big${left > 0 ? '' : ' small'}">${big}</div>
            </div>
            <div class="hero-when">${isoLabel(first, true)} ~ ${isoLabel(last, true)}${nowIdx >= 0 ? ' · 여행 중' : ''}</div>
            <div class="hero-route" style="grid-template-columns: repeat(${pts.length}, minmax(0, 1fr));">${route}
            </div>
        </div>`;
}

// 한눈에 셋 — 누르면 아래 그 카드로 내려간다.
function tripTilesHtml(trip) {
    const t = tripTravel(trip);
    const car = t.car === 'yes' ? '사용' : t.car === 'no' ? '미사용' : '미정';
    const costs = tripCosts(trip).length ? moneyText(costSummary(trip).total, costSummary(trip)) : '미입력';
    const pack = tripPack(trip).length;
    const tile = (k, v, id) => `<button type="button" class="trip-tile" onclick="tripJump('${id}')"><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></button>`;
    return `<div class="trip-tiles">${tile('렌트카', car, 'tripTravelCard')}${tile('1인 경비', costs, 'tripCostCard')}${tile('준비물', pack ? `${pack}가지` : '미입력', 'tripPackCard')}</div>`;
}
// 붙박인 위 막대 밑으로 숨지 않게 그만큼 띄워서 내린다.
function tripJump(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const bar = document.getElementById('topBar');
    const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 10;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

// 일정 줄기 — 날마다 한 줄(번호 · 날짜·지역 · 골프장 · 티오프·숙소). 누르면 그 자리에서 펼친다.
function tripLineHtml(trip, days, today, openDate) {
    const rows = days.map((d, i) => {
        if (tripEditing === d.date) return `<div class="tl-item editing">${tripDayEditHtml(trip, d, i)}</div>`;
        const st = dayState(d.date, today);
        const open = openDate === d.date;
        const last = i === days.length - 1;
        const sub = open ? '' : `<span class="tl-sub">티오프 ${d.tee ? escapeHtml(d.tee) : '미정'} · 숙소 ${d.stay ? escapeHtml(d.stay) : '미정'}</span>`;
        return `
        <div class="tl-item ${st}${open ? ' open' : ''}">
            <div class="tl-rail"><span class="tl-no">${i + 1}</span>${last ? '' : `<span class="tl-bar${st === 'done' ? ' on' : ''}"></span>`}</div>
            <div class="tl-body">
                <button type="button" class="tl-sum" onclick="toggleTripDay('${d.date}')" aria-expanded="${open}">
                    <span class="tl-when">${isoLabel(d.date, true)}${d.area ? ` · ${escapeHtml(d.area)}` : ''}${st === 'now' ? ' <b class="tl-today">오늘</b>' : ''}</span>
                    <span class="tl-course${d.course ? '' : ' empty'}">${d.course ? escapeHtml(d.course) : '골프장 미정'}</span>
                    ${sub}
                    <svg class="tl-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                ${open ? tripDayDetailHtml(trip, d, st === 'done') : ''}
            </div>
        </div>`;
    }).join('');
    return `
        <div class="trip-day trip-line">
            <div class="trip-line-head"><span class="card-label">일정</span><span class="trip-line-hint">날짜를 누르면 펼쳐집니다</span></div>
            ${rows}
            <div class="trip-line-note">${tripNotifyText()}</div>
        </div>`;
}
function tripOpenDate(days) {
    const today = kstToday();
    return tripDayOpen !== null ? tripDayOpen : (days.some(d => d.date === today) ? today : '');
}
function toggleTripDay(date) {
    const trip = findTrip(tripOpenId);
    tripDayOpen = tripOpenDate(tripDays(trip)) === date ? '' : date;
    renderTripPage();
}

function renderTripPage() {
    const body = document.getElementById('tripPage');
    if (!body) return;
    let trip = findTrip(tripOpenId);
    if (!trip && tripEditing !== 'new') { trip = activeTrip(); tripOpenId = trip ? trip.id : null; }
    if (tripEditing === 'new') {
        setTripBody(body, tripChipsHtml() + newTripHtml());
        return;
    }
    const days = tripDays(trip);
    if (!trip || !days.length) {
        // 다가오는 여행이 없다 — 지난 여행 칩과 `새 여행 등록` 문만 남긴다.
        setTripBody(body, (allTrips().length ? tripChipsHtml() : '') + `
            <div class="trip-empty">
                <div class="trip-empty-title">다가오는 여행이 없습니다</div>
                <div class="trip-empty-sub">여행을 등록하면 일정·골프장·숙소·경비를 이곳에서 함께 봅니다.</div>
                <button type="button" class="trip-btn primary" onclick="startNewTrip()">＋ 새 여행 등록</button>
            </div>`);
        return;
    }
    const today = kstToday();
    const openDate = tripOpenDate(days);
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
            <div class="trip-memo${trip.memo ? '' : ' empty'}">${trip.memo ? escapeHtml(trip.memo) : '준비물·정산 방법 등을 입력하세요.'}</div>
            <div class="trip-actions light"><button type="button" class="trip-link" onclick="editTripMemo()">입력</button></div>
        </div>`;

    setTripBody(body, tripChipsHtml() + tripHeroHtml(trip, days, today) + settings + tripTilesHtml(trip)
        + tripLineHtml(trip, days, today, openDate) + travelHtml(trip) + costHtml(trip) + packHtml(trip) + memo);
    days.forEach(d => { if (d.date === openDate && d.date >= today && d.course) loadTripWeather(d); });
}

function editTripDay(date) { tripEditing = date; renderTripPage(); }
function editTripMemo() { tripEditing = 'memo'; renderTripPage(); }
function editTripSettings() { tripEditing = tripEditing === 'settings' ? null : 'settings'; renderTripPage(); }
function cancelTripEdit() { tripEditing = null; costDraft = null; renderTripPage(); }

function saveTripDay(date) {
    const val = id => (document.getElementById(id) || {}).value || '';
    const next = { course: val('tripEdCourse').trim(), area: val('tripEdArea').trim(), tee: val('tripEdTee').trim(), stay: val('tripEdStay').trim(), bf: segVal('tripEdBf', DAY_BF), memo: val('tripEdMemo').trim() };
    const trip = findTrip(tripOpenId);
    const day = trip && tripDays(trip).find(d => d.date === date);
    tripEditing = null;
    if (!day) { showToast('⚠️ 해당 일자를 찾을 수 없습니다. 다시 열어 주세요.'); renderTripPage(); return; }
    const changed = Object.keys(next).some(k => (day[k] || '') !== next[k]);
    if (changed) editTrip(t => {
        const target = t.days.find(d => d.date === date);
        if (!target) return false;
        // 골프장 이름을 손으로 바꾸면 GORA에서 받아 둔 위치·예약 주소는 옛 골프장 것이라 걷는다.
        if ((target.course || '') !== next.course) { delete target.lat; delete target.lon; delete target.gora; }
        Object.assign(target, next);
        if (!target.bf) delete target.bf;   // 미정이면 키째 지운다(예전 일정과 같은 모양)
    }, `✅ ${isoLabel(date)} 일정을 저장했습니다.`);
    renderTripPage();
}

function saveTripMemo() {
    const text = ((document.getElementById('tripEdTripMemo') || {}).value || '').trim();
    const trip = findTrip(tripOpenId);
    tripEditing = null;
    if (trip && (trip.memo || '') !== text) editTrip(t => { t.memo = text; }, '✅ 공통 메모를 저장했습니다.');
    renderTripPage();
}

// ─── 날씨 ───
// 예보는 16일치뿐이라 그 안에 든 날만 묻는다. 같은 곳·같은 날은 10분간 다시 안 묻는다
// (공지 카드의 날씨와 같은 규칙 — `res.ok`를 보고 429면 잠시 쉰다). 시간대는 그곳 시간(auto)이다.
const tripWeather = {};
const tripWeatherBusy = {};

function tripWeatherHtml(d) {
    const geo = dayGeo(d);
    if (!geo) return `골프장 위치 정보가 없어 예보를 조회할 수 없습니다`;
    const left = isoDiff(kstToday(), d.date);
    if (left > 15) return `예보는 ${isoLabel(isoAdd(d.date, -15))}부터 조회됩니다`;
    const hit = tripWeather[`${geo.lat},${geo.lon}|${d.date}`];
    return hit ? hit.html : `조회 중...`;
}

async function loadTripWeather(d) {
    const geo = dayGeo(d);
    if (!geo || isoDiff(kstToday(), d.date) > 15) return;
    const key = `${geo.lat},${geo.lon}|${d.date}`;
    const hit = tripWeather[key];
    if ((hit && Date.now() - hit.at < WEATHER_TTL) || tripWeatherBusy[key]) return;
    if (Date.now() < weatherBlockedUntil) return;
    tripWeatherBusy[key] = true;
    // 미는 중·미끄러지는 중이면 멈춘 뒤에 칠한다(창을 다시 그리는 것과 같은 규칙).
    const paint = html => {
        if (tripBusyScrolling()) { setTimeout(() => paint(html), 450); return; }
        const el = document.getElementById('tripWx-' + d.date);
        if (el && el.innerHTML !== html) el.innerHTML = html;
    };
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 429) weatherBlockedUntil = Date.now() + WEATHER_COOLDOWN;
            paint('조회하지 못했습니다');
            return;
        }
        const data = await res.json();
        const idx = data.daily && data.daily.time ? data.daily.time.indexOf(d.date) : -1;
        if (idx < 0) { paint('조회하지 못했습니다'); return; }
        const info = weatherIcon(data.daily.weathercode[idx]);
        const rain = data.daily.precipitation_probability_max ? data.daily.precipitation_probability_max[idx] : null;
        const html = `${info.i} ${info.d} · ${Math.round(data.daily.temperature_2m_min[idx])}°~${Math.round(data.daily.temperature_2m_max[idx])}°${rain != null ? ` · 강수 ${rain}%` : ''}`;
        tripWeather[key] = { html, at: Date.now() };
        paint(html);
    } catch (e) {
        paint('조회하지 못했습니다');
    } finally {
        delete tripWeatherBusy[key];
    }
}

// ═══ 일본 골프장 찾기 (라쿠텐 GORA) ═══════════════════════════════
// 흐름: 기준 위치(숙소·역 이름을 찾거나 지도를 눌러 고른다) → 범위·최대 금액 → GORA에 그날 예약 가능한
// 플랜을 묻는다 → 지도와 목록(가까운 순)에 펼친다 → `예약 완료`가 그 날짜의 골프장으로 넣는다.
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
const GORA_TIMES = [['', '전체'], ['am', '🌅 오전 (~11시)'], ['pm', '🌇 오후 (11시~)']];
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
// ─── 플랜 이름 한글화 ───
// 사용자 제보 — `[평일][時間指定]휴식有☆점심지원 포함`처럼 반쯤 일본어로 남았다(`번역이 이렇게가 최선인거야??`).
// 기계 번역(아래)은 폰에서 안 받아지는 때가 있고, 받아져도 골프 말을 엉뚱하게 옮긴다(昼補助 → `낮 보조`, 2サム → `2 샘`).
// 그래서 **사전이 주인이다** — GORA 플랜 이름은 정해진 말을 이어 붙인 것이라 사전만으로 거의 다 한글이 된다.
// 사전으로도 일본어가 남는 이름만 기계 번역에 보낸다(그때도 사전을 먼저 거친 글을 보낸다).
// 긴 말부터 바꾼다(`昼食付き`가 `昼食`보다 먼저) — 순서를 손으로 맞추지 않게 길이로 정렬한다.
const PLAN_WORDS = Object.entries({
    // 요일·시간대
    '平日': '평일', '土日祝日': '주말·공휴일', '土日祝': '주말·공휴일', '土日': '주말', '土曜': '토요일', '日曜': '일요일', '祝日': '공휴일', '休日': '휴일',
    '月曜': '월요일', '火曜': '화요일', '水曜': '수요일', '木曜': '목요일', '金曜': '금요일', '月火水木金': '평일',
    '早朝': '이른 아침', '午前': '오전', '午後': '오후', '薄暮': '해질녘', 'トワイライト': '트와일라잇', 'アフタヌーン': '오후', 'モーニング': '모닝',
    '朝イチ': '첫 티', '朝一': '첫 티', '時間指定': '시간 지정', '時間限定': '시간 한정', 'スタート': '출발',
    // 진행
    'スループレー': '스루 플레이', 'スループレイ': '스루 플레이', 'スルー': '스루 플레이',
    'ハーフ休憩あり': '9홀 후 휴식', 'ハーフ休憩有り': '9홀 후 휴식', 'ハーフ休憩有': '9홀 후 휴식', 'ハーフ休憩': '9홀 후 휴식',
    '休憩あり': '휴식 있음', '休憩有り': '휴식 있음', '休憩有': '휴식 있음', '休憩なし': '휴식 없음', '休憩無し': '휴식 없음', '休憩無': '휴식 없음', '休憩': '휴식',
    'ハーフラウンド': '9홀 라운드', 'ハーフプレー': '9홀 플레이', 'ハーフ': '하프', '1.5ラウンド': '27홀', 'ラウンド': '라운드', 'ホール': '홀',
    // 인원
    '2サム保証': '2인 확약', '2サム確約': '2인 확약', '2サム可': '2인 가능', '2サム': '2인', '3サム': '3인', '2B割増無し': '2인 할증 없음', '2B割増なし': '2인 할증 없음',
    '2B': '2인', '3B': '3인', '4B': '4인', 'お一人様': '1인', 'おひとり様': '1인', 'ひとり予約': '1인 예약', '一人予約': '1인 예약', '1人予約': '1인 예약',
    '名様': '명', '名': '명', '組限定': '팀 한정', '組': '팀', '女性': '여성', 'レディース': '여성', 'シニア': '시니어', 'ジュニア': '주니어', '学生': '학생',
    // 식사·음료
    '昼食付き': '점심 포함', '昼食付': '점심 포함', '昼食込み': '점심 포함', '昼食込': '점심 포함', '昼食券': '점심 식권', '昼食': '점심', '昼補助': '점심 지원', '昼': '점심',
    'ランチ付き': '점심 포함', 'ランチ付': '점심 포함', 'ランチ': '점심', '食事付き': '식사 포함', '食事付': '식사 포함', '食事': '식사', '朝食': '아침 식사',
    '1ドリンク': '음료 1잔', 'ワンドリンク': '음료 1잔', 'ドリンク': '음료', '飲み放題': '음료 무제한', '補助': '지원',
    // 카트·캐디·시설
    '乗用カート': '승용 카트', 'リモコンカート': '리모컨 카트', 'カート付き': '카트 포함', 'カート付': '카트 포함', 'カート': '카트', 'GPSナビ': 'GPS 내비', 'ナビ': '내비', '乗用': '승용',
    'キャディ付き': '캐디 포함', 'キャディ付': '캐디 포함', 'キャディー': '캐디', 'キャディ': '캐디', 'セルフ': '셀프', '練習ボール': '연습공', '練習場': '연습장', '送迎': '송영',
    // 요금·할인
    '割増無し': '할증 없음', '割増なし': '할증 없음', '割増無': '할증 없음', '割増': '할증', '割引': '할인', '直前割': '직전 할인', '早割': '얼리버드', '早期予約': '조기 예약',
    '期間限定': '기간 한정', '枠限定': '수량 한정', '数量限定': '수량 한정', '限定': '한정', '料金': '요금', '税込': '세금 포함', '円': '엔', '無料': '무료', 'サービス': '서비스',
    'ポイント': '포인트', '倍': '배', '特典': '혜택', 'プレゼント': '선물', 'お得': '알뜰', 'おトク': '알뜰', 'オトク': '알뜰', 'イチオシ': '추천', 'オススメ': '추천', 'おすすめ': '추천', '人気': '인기',
    'キャンペーン': '캠페인', 'タイムセール': '타임 세일', 'タイムサービス': '타임 서비스', 'セール': '세일', 'レギュラー': '레귤러', 'スタンダード': '스탠다드', 'プレミアム': '프리미엄',
    // 그 밖
    '保証': '확약', '確約': '확약', '先着': '선착순', '当日': '당일', '予約': '예약', 'コンペ': '단체 경기', 'プラン': '플랜', 'ゴルフ': '골프', '記念': '기념', 'オープン': '오픈',
    '選べる': '선택 가능', '指定': '지정', '以上': '이상', '以降': '이후', 'まで': '까지', '迄': '까지', 'のみ': '만',
    'プレー': '플레이', 'プレイ': '플레이', '楽天': '라쿠텐', 'シーズン': '시즌', '時': '시', '分': '분', 'OK': ' 가능', '可': ' 가능',
    '春': '봄', '夏': '여름', '秋': '가을', '冬': '겨울', '紅葉': '단풍', '新': '새', '込み': ' 포함', '込': ' 포함', '付き': ' 포함', '付': ' 포함',
    'あり': ' 있음', '有り': ' 있음', '有': ' 있음', 'なし': ' 없음', '無し': ' 없음', '無': ' 없음', 'の': ' '
}).map(([ja, ko]) => [ja.normalize('NFKC'), ko]).sort((a, b) => b[0].length - a[0].length);
// 숫자 뒤에 붙는 말(3,980엔 · 2명 · 5배 · 14시)만 붙여 쓰고, 나머지는 앞뒤를 띄워 낱말이 붙지 않게 한다(`이른 아침스루` → `이른 아침 스루`).
const PLAN_SUFFIX = new Set(['엔', '명', '배', '시', '분', '팀', '홀']);
const JA_LEFT = /[぀-ヿ一-鿿]/;   // 가나·한자가 남았으면 덜 옮긴 것
function planTidy(s) {
    return String(s || '')
        .replace(/[【［\[]\s*/g, '[').replace(/\s*[】］\]]/g, '] ')
        .replace(/[「」『』]/g, '').replace(/\s*[☆★◆◇■□●○◎♪♡♥※]+\s*/g, ' · ').replace(/[！!]+/g, ' ')
        .replace(/[〜～]/g, '~').replace(/\s*[・･]\s*/g, ' · ').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s+/g, ' ').replace(/^\s*·\s*|\s*·\s*$/g, '').replace(/\]\s*·\s*/g, '] ').trim();
}
function koPlan(name) {
    let s = String(name || '').normalize('NFKC');
    for (const [ja, ko] of PLAN_WORDS) s = s.split(ja).join(PLAN_SUFFIX.has(ko) ? ko : ` ${ko} `);
    return planTidy(s);
}
// ─── 플랜 이름 기계 번역 (사전으로 다 못 옮긴 것만) ───
// 구글 번역 공개 주소(열쇠가 필요 없다)에 **사전을 거친 글**을 보낸다. 못 받으면(막혔거나 끊김) 사전 결과가 그대로 남는다 —
// 번역은 덤이라 실패해도 알리지 않는다. 옮긴 것은 이 폰에 기억한다(`jtfag_gora_tr2` — 사전이 바뀌어 옛 `jtfag_gora_tr`는 버린다).
const GORA_TR_KEY = 'jtfag_gora_tr2', GORA_TR_MAX = 600, GORA_TR_CHUNK = 500;
try { localStorage.removeItem('jtfag_gora_tr'); } catch (e) {}
let goraTr = (() => { try { return JSON.parse(localStorage.getItem(GORA_TR_KEY)) || {}; } catch (e) { return {}; } })();
const planKey = name => String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
function goraPlanKo(name) {
    const k = planKey(name);
    return goraTr[k] || koPlan(name);
}
async function goraTranslateBatch(list) {
    const src = list.map(k => koPlan(k).replace(/\n/g, ' '));
    const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=' + encodeURIComponent(src.join('\n')));
    if (!res.ok) throw new Error('번역 ' + res.status);
    const data = await res.json();
    const out = (Array.isArray(data && data[0]) ? data[0] : []).map(seg => (seg && seg[0]) || '').join('').split('\n').map(t => t.trim());
    if (out.length !== list.length) throw new Error('번역 줄 수가 다름');
    return out;
}
async function goraTranslatePlans(seq) {
    // 보이는 플랜부터(골프장마다 셋), 그다음 나머지 — 조건을 바꾸면 다른 플랜이 보이므로 다 옮겨 둔다.
    const order = [...gora.items.flatMap(it => (it.fit || it.plans).slice(0, 3)), ...gora.all.flatMap(it => it.plans)];
    const want = [...new Set(order.map(p => planKey(p.name)))].filter(k => k && !goraTr[k] && JA_LEFT.test(koPlan(k))).slice(0, 200);
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
            const t = got[j] ? planTidy(koPlan(got[j])) : '';
            if (!t) return;
            goraTr[k] = t;
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
    gora.fnote = missing.length ? `라쿠텐 응답에 '${missing.join(', ')}' 정보가 없어 해당 조건은 적용되지 않았습니다` : '';
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
    watchModalScroll(document.querySelector('#goraModal .modal-body'));
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
        <div class="gora-date">📅 ${gora.date ? isoLabel(gora.date) : ''} 라운드 골프장</div>
        <div class="trip-field">📍 기준 위치 (숙소·역·지역)
            <div class="gora-search"><input type="text" id="goraPlace" maxlength="60" value="${gora.base ? escapeHtml(gora.base.name) : ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();findGoraPlace();}"><button type="button" class="trip-btn" onclick="findGoraPlace()">찾기</button></div>
        </div>
        <div id="goraPlaces"></div>
        <div class="gora-hint">${gora.base ? `기준: <b>${escapeHtml(gora.base.name)}</b> · 지도의 빈 곳을 눌러 변경할 수 있습니다` : '명칭으로 검색하거나 아래 지도를 눌러 기준 위치를 지정하세요.'}</div>`;
    bottom.innerHTML = `
        <div class="trip-field">범위 (직선거리)<div class="trip-chips">${GORA_RANGES.map(r => chip(gora.range === r, `${r}km <small>차로 ~${driveMinutes(r)}분</small>`, `setGoraRange(${r})`)).join('')}</div></div>
        <div class="trip-field">1인 최대 금액<div class="trip-chips">${GORA_PRICES.map(p => chip(gora.price === p, p ? `¥${p.toLocaleString()}` : '전체', `setGoraPrice(${p})`)).join('')}</div></div>
        <div class="trip-field">조건 <small class="gora-sub">복수 선택 가능 · 검색 후 변경해도 즉시 적용됩니다</small><div class="trip-chips">${[...GORA_OPTS, GORA_FOREIGN].map(o => chip(!!gora.opts[o.key], o.label, `toggleGoraOpt('${o.key}')`)).join('')}</div>${gora.opts.foreign ? '<div class="gora-hint">라쿠텐에 \'외국인 불가\' 등으로 명시된 곳만 제외합니다. 명시되지 않은 곳도 예약 화면의 안내를 확인하세요.</div>' : ''}</div>
        <div class="trip-field">시작 시간<div class="trip-chips">${GORA_TIMES.map(([v, l]) => chip(gora.time === v, l, `setGoraTime('${v}')`)).join('')}</div></div>
        <div class="trip-actions"><button type="button" class="trip-btn primary" onclick="searchGora()"${gora.busy ? ' disabled' : ''}>${gora.busy ? '검색 중…' : '⛳ 해당일 예약 가능 골프장 검색'}</button></div>
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
        // 번호를 누르면 이름이 뜨고, 그 이름을 누르면 목록의 그 골프장으로 간다(사용자 요청).
        // 예전엔 이름이 툴팁이라 눌리지 않아, 이름을 누르면 지도 누르기로 잡혀 `여기를 기준 위치로`가 떴다.
        // 팝업은 누른 것이 지도로 번지지 않는다(Leaflet이 막아 준다).
        m.bindPopup(`<button type="button" class="gora-pin-pop" onclick="goraJumpTo(${i})"><b>${i + 1}. ${escapeHtml(it.ko || it.name)}</b><small>목록에서 보기 ›</small></button>`,
            { className: 'gora-here-pop', offset: [0, -8], closeButton: false, autoPanPadding: [12, 12] });
        m.on('click', ev => { if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent); });
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
    if (best) { gora.markers[best.i].openPopup(); return; }
    const lat = +e.latlng.lat.toFixed(5), lon = +e.latlng.lng.toFixed(5);
    if (!gora.base) { goraBaseHere(lat, lon); return; }
    L.popup({ className: 'gora-here-pop', offset: [0, -4] }).setLatLng(e.latlng)
        .setContent(`<button type="button" class="gora-here" onclick="goraBaseHere(${lat}, ${lon})">📍 여기를 기준 위치로</button>`)
        .openOn(gora.map);
}
function goraBaseHere(lat, lon) {
    if (gora.map) gora.map.closePopup();
    setGoraBase({ name: `지도 지정 위치 (${lat.toFixed(3)}, ${lon.toFixed(3)})`, lat, lon });
}
// 지도의 번호 → 목록의 그 골프장을 화면 맨 위로 올리고 반짝인다(사용자 요청).
function goraJumpTo(i) {
    const row = document.getElementById('goraItem' + i);
    if (!row) return;
    if (gora.map) gora.map.closePopup();
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
    m.openPopup();
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
    if (!q) { showToast('⚠️ 숙소 또는 지역명을 입력해 주세요.'); return; }
    const box = document.getElementById('goraPlaces');
    if (box) box.innerHTML = '<div class="gora-hint">검색 중…</div>';
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=jp&accept-language=ko&q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(res.status);
        const list = await res.json();
        gora.places = (Array.isArray(list) ? list : []).map(p => ({
            name: p.name || String(p.display_name || '').split(',')[0],
            full: p.display_name || '', lat: parseFloat(p.lat), lon: parseFloat(p.lon),
            pref: prefCode(p.address)
        })).filter(p => isFinite(p.lat) && isFinite(p.lon));
        if (!gora.places.length && box) { box.innerHTML = '<div class="gora-hint">검색 결과가 없습니다. 영어·일본어로 검색하거나 지도에서 지정하세요.</div>'; return; }
        renderGoraPlaces();
    } catch (e) {
        if (box) box.innerHTML = '<div class="gora-hint">위치 검색에 실패했습니다. 지도에서 직접 지정할 수 있습니다.</div>';
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
    if (!gora.base) { showToast('⚠️ 먼저 기준 위치를 지정해 주세요.'); return; }
    if (gora.busy) return;
    gora.busy = true; gora.seq = (gora.seq || 0) + 1; gora.items = []; gora.all = []; gora.note = ''; gora.error = null; gora._searched = true; gora.raw = {};
    gora.progress = 0;
    renderGora();
    const tick = () => { gora.progress++; const el = document.getElementById('goraProgress'); if (el) el.textContent = `라쿠텐 GORA 조회 중… (${gora.progress})`; };
    try {
        const home = await basePref(gora.base);
        if (!home) { gora.error = { error: 'api', message: '기준 위치의 현(県)을 확인할 수 없습니다. 지도에서 다시 지정해 주세요.' }; return; }
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
        if (unknown) gora.note = `위치 정보가 없는 ${unknown}곳은 하단에 표시합니다`;
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
    el.textContent = txt || '(수신된 응답이 없습니다)';
    el.style.display = 'block';
}

function renderGoraResult() {
    const box = document.getElementById('goraResult');
    if (!box) return;
    const e = gora.error;
    const rawLink = `<div class="gora-raw-row"><button type="button" class="gora-raw-btn" onclick="toggleGoraRaw()">🔧 라쿠텐 원본 응답 보기 (오류 확인용)</button><pre id="goraRaw" class="gora-raw"></pre></div>`;
    if (e) {
        box.innerHTML = (e.error === 'not_configured' || e.error === 'no_function'
            ? `<div class="gora-setup"><b>아직 라쿠텐과 연결되지 않았습니다.</b><br>라쿠텐 앱 등록과 Supabase 설정이 필요합니다(설명서 <code>docs/일본골프장찾기.md</code>). 설정 완료 후 바로 사용할 수 있습니다.</div>`
            : `<div class="gora-setup">라쿠텐 응답을 받지 못했습니다.<br><small>${escapeHtml(e.message || e.error)}</small></div>`) + rawLink;
        return;
    }
    if (gora.busy) { box.innerHTML = `<div class="gora-hint" id="goraProgress">라쿠텐 GORA 조회 중…</div><div class="gora-hint">처음 조회하는 지역은 골프장 위치 정보 수신으로 10~20초 소요됩니다.</div>`; return; }
    if (!gora.items.length && gora.all.length) { box.innerHTML = `<div class="gora-hint">조건에 맞는 골프장이 없습니다. 검색된 ${gora.all.length}곳이 모두 조건에서 제외되었습니다. 조건을 완화해 보세요.</div>${gora.fnote ? `<div class="gora-hint">${escapeHtml(gora.fnote)}</div>` : ''}` + rawLink; return; }
    if (!gora.items.length) { box.innerHTML = gora.base && gora._searched ? '<div class="gora-hint">해당일 예약 가능한 골프장이 없습니다. 범위나 금액 조건을 넓혀 보세요. (예약은 통상 2~3개월 전부터 가능합니다)</div>' + rawLink : ''; return; }
    box.innerHTML = `<div class="gora-hint">${gora.items.length}곳 · 거리순${gora.hidden ? ` · 조건 미충족 ${gora.hidden}곳 제외` : ''}${gora.note ? ' · ' + escapeHtml(gora.note) : ''}</div>
        ${gora.fnote ? `<div class="gora-hint warn">${escapeHtml(gora.fnote)}</div>` : ''}
        <div class="gora-tip">💡 지도의 번호를 누르면 해당 골프장 목록으로, 목록의 번호를 누르면 지도 위치로 이동합니다.<br>예약 페이지는 ${IS_IOS ? '<b>사파리</b>로 열립니다. 주소창 왼쪽 <b>가가</b> → <b>번역 → 한국어</b>' : '일본어입니다. 브라우저 메뉴의 <b>번역 → 한국어</b>'}를 선택하면 한국어로 표시됩니다.</div>` + gora.items.map((it, i) => {
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
                <button type="button" class="trip-btn primary" onclick="pickGoraCourse(${i})">예약 완료</button>
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
    }, `✅ ${isoLabel(date)} 골프장을 지정했습니다. 예약은 GORA에서 진행해 주세요.`);
    if (ok) { closeGora(); renderTripPage(); }
}
