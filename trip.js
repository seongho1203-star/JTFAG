// ◇ trip.js를 나눈 조각 — 여행 탭 화면(표지·한눈에 셋·일정 줄기) · 위치 · 지도·길찾기 · 일자별 입력
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
// trip.js - 여행 일정 (넷이 같이 가는 골프 여행) + 일본 골프장 찾기(라쿠텐 GORA)
//
// 값은 payload.trips에 둔다 — 여행 하나가
//   {id, title, kind:'domestic'|'japan'|'abroad', base:{name,lat,lon}?, memo,
//    days:[{date, course, area, tee, stay, memo, lat?, lon?, gora?:{id,url}}],
//    travel?:{flightOut, flightBack, bagIn, bagKg, flightRef, car:'yes'|'no', carCo, carModel, carPick, carDrop, carIns, carRef},
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
    return `🔔 알림: ${parts.join(' · ')} 아침 · 여행 기간의 라운드 알림은 여행 알림으로 대체`;
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
    if (typeof tripSectionHtml === 'function') html = tripSectionHtml() + html;
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
            <div class="trip-sheet-head">여행 수정</div>
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
            <div class="trip-actions trip-sheet-danger"><button type="button" class="trip-btn danger" onclick="deleteTrip()">🗑️ 여행 삭제</button></div>`;
}
// 여행 수정은 아래에서 올라오는 창이다(사용자 제보 — 표지 ⚙️를 누르면 표지와 한눈에 셋 사이에 카드가 끼어들어 어색했다).
// 뱃지 상세 창과 같은 틀(`.bdg-sheet`)이고, body 바로 아래 화면 전체라 watchOverlays()가 뒤를 잠근다.
// 닫히는 중인 창의 칸 id를 바로 걷는다 — 곧바로 다시 열면 같은 id가 둘이 되어 옛 칸을 읽는다.
function closeTripSheet() {
    document.querySelectorAll('.trip-sheet-overlay').forEach(o => {
        o.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
        o.classList.remove('show', 'trip-sheet-overlay');
        setTimeout(() => o.remove(), 240);
    });
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

const dayFilled = d => !!(d && (d.course || d.tee || d.stay || d.memo || d.area || d.golf));
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
    closeTripSheet(); tripEditing = null; renderTripPage();
}
async function deleteTrip() {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    if (!await showConfirmPrompt(`<b>${escapeHtml(trip.title)}</b>을(를) 삭제할까요?<br><span style="font-weight:500;color:#6b7075;">일정·메모가 모두 삭제됩니다. 직후에는 ↩️ 되돌리기로 복구할 수 있습니다.</span>`, '삭제')) return;
    const id = trip.id;
    if (!findTrip(id)) return;
    closeTripSheet();
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

