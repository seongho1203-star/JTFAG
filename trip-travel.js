// ◇ trip.js를 나눈 조각 — 여행 기본 정보(항공·렌트카·숙소) · 여행 경비 · 준비물 · 날씨
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
// ─── 여행 기본 정보 (여행 전체에 한 벌 · 예전 이름 `교통·숙소`) ───
// 사용자 요청 — `렌트카 사용 여부나 숙소, 항공 정보도 입력`. 날마다 다른 것(골프장·티오프·묵는 곳)은
// 날짜 칸에, 여행 내내 하나인 것(항공편·렌트카·숙소 예약번호)은 여기에 둔다.
// 숙소 이름은 날짜 칸의 `stay`가 원본이다 — 여기서는 그걸 묶어 보여 주기만 하고(`stayRuns()`),
// 예전에 있던 `숙소 정보`(stayInfo — 체크인 시각·연락처 따위)는 쓰임이 모호하다는 사용자 말로 걷어냈다.
// 키에서 빠졌으므로 다음 저장 때 옛 값도 함께 걷힌다. 되살리지 말 것.
// 사용자 요청(10/09) — 예약 칸 이름은 `예약번호` · 렌트 보험(`carIns`).
// 렌트카는 업체·차종·인수·반납이 각각 한 칸이다(사용자 요청 10/10 — 두 칸씩 묶여 있던 것을 다시 나눴다).
// 한때 인수·반납을 한 칸(`carPlace`)으로 합쳤었다 — 그 값은 읽을 때 `A / B`를 갈라 두 칸에 넣고, 다음 저장 때 걷힌다.
// 수하물은 포함·미포함 단추 + kg 칸이다(사용자 요청). 예전 자유 글 `bag`은 tripTravel()이 읽어 옮기고 다음 저장 때 걷힌다.
const TRAVEL_KEYS = ['flightOut', 'flightOutTime', 'flightBack', 'flightBackTime', 'bagIn', 'bagKg', 'flightRef', 'car', 'carCo', 'carModel', 'carPick', 'carDrop', 'carIns', 'carRef'];
const TRAVEL_BAG = { yes: '포함', no: '미포함' };   // 고르지 않으면 미정
const TRAVEL_CAR = { '': '미정', yes: '사용', no: '미사용' };
const TRAVEL_INS = { '': '미정', yes: '가입', no: '미가입' };
const DAY_BF = { '': '미정', yes: '포함', no: '불포함' };
// 라운드가 없는 날(day.golf = 'no') — 마지막 날 오전 비행기로 귀국하는 날처럼 골프장 자리가 비어도 `미정`이 아니다
// (사용자 제보 — 2박 3일인데 3일차 라운드가 필요 없는데 그대로 있다). 골프장·티오프는 걷고 라운드 수에서 빠진다.
const DAY_GOLF = { '': '있음', no: '없음' };
const noRound = d => !!(d && d.golf === 'no');   // 일자별 숙소의 조식 (day.bf)
function tripTravel(trip) {
    const t = trip && trip.travel && typeof trip.travel === 'object' ? trip.travel : {};
    const out = {};
    TRAVEL_KEYS.forEach(k => { out[k] = typeof t[k] === 'string' ? t[k] : ''; });
    if (!TRAVEL_CAR[out.car]) out.car = '';
    if (!TRAVEL_INS[out.carIns]) out.carIns = '';
    if (!TRAVEL_BAG[out.bagIn]) out.bagIn = '';
    out.bagKg = kgText(out.bagKg);
    // 출발 시각은 따로 적는다(사용자 요청). 예전에 편명 칸에 `KE781 08:30`처럼 함께 적은 것은 시각만 떼어 낸다.
    ['flightOut', 'flightBack'].forEach(k => {
        out[k + 'Time'] = timeText(out[k + 'Time']);
        const m = !out[k + 'Time'] && /(^|\s)(\d{1,2}):(\d{2})(?=\s|$)/.exec(out[k]);
        if (m && +m[2] < 24 && +m[3] < 60) {
            out[k + 'Time'] = `${m[2].padStart(2, '0')}:${m[3]}`;
            out[k] = (out[k].slice(0, m.index) + out[k].slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
        }
    });
    out.bagOld = '';
    if (!out.bagIn && !out.bagKg && typeof t.bag === 'string' && t.bag.trim()) {   // 예전 자유 글(`위탁 23kg 1개`)
        const m = /(\d+(?:\.\d+)?)\s*kg/i.exec(t.bag);
        if (m) { out.bagIn = 'yes'; out.bagKg = kgText(m[1]); }
        else if (/미포함|불포함|없음/.test(t.bag)) out.bagIn = 'no';
        else out.bagOld = t.bag.trim();
    }
    const place = typeof t.carPlace === 'string' ? t.carPlace.trim() : '';
    if (place && !out.carPick && !out.carDrop) {   // 한때 한 칸이던 인수·반납을 두 칸으로(합칠 때 `A / B`, 같으면 하나만 적었다)
        const parts = place.split(/\s+\/\s+/);
        out.carPick = parts[0];
        out.carDrop = parts.length > 1 ? parts.slice(1).join(' / ') : parts[0];
    }
    return out;
}
function timeText(v) { const m = /^(\d{2}):(\d{2})$/.exec(String(v || '')); return m && +m[1] < 24 && +m[2] < 60 ? m[0] : ''; }
function flightText(no, time) { return [no, time ? `${time} 출발` : ''].filter(Boolean).join(' · '); }
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
        const flightRow = (k, label, no, time) => `<div class="trip-field row trip-flight"><span>${label}</span><input type="text" id="tripTvFlight${k}" maxlength="30" autocomplete="off" aria-label="${label} 편명" value="${escapeHtml(no)}"><input type="time" id="tripTvFlight${k}Time" aria-label="${label} 출발 시각" value="${escapeHtml(time)}"></div>`;
        // 두 칸을 한 줄에 — 업체·차종, 인수·반납(사용자 요청 — 두 줄씩 먹었다). 키는 그대로 넷이다.
        const pair = (id1, l1, v1, id2, l2, v2) => `<div class="trip-field row trip-pair"><span>${l1}</span><input type="text" id="${id1}" maxlength="40" autocomplete="off" aria-label="${l1}" value="${escapeHtml(v1)}"><em>${l2}</em><input type="text" id="${id2}" maxlength="40" autocomplete="off" aria-label="${l2}" value="${escapeHtml(v2)}"></div>`;
        const f = (id, label, v, max = 60) => `<label class="trip-field row"><span>${label}</span><input type="text" id="${id}" maxlength="${max}" autocomplete="off" value="${escapeHtml(v)}"></label>`;
        return `
        <div class="trip-day editing" id="tripTravelCard">
            <div class="trip-day-head">🧭 여행 기본 정보</div>
            <div class="trip-sub">항공 <small class="trip-sub-note">편명 · 출발 시각</small></div>
            ${flightRow('Out', '출발편', t.flightOut, t.flightOutTime)}
            ${flightRow('Back', '복귀편', t.flightBack, t.flightBackTime)}
            <div class="trip-field row trip-bag"><span>수하물</span>${segHtml('tripTvBagIn', TRAVEL_BAG, t.bagIn, 'tripBagChanged()')}<input type="text" id="tripTvBagKg" inputmode="decimal" maxlength="5" autocomplete="off" aria-label="수하물 무게(kg)" value="${escapeHtml(t.bagKg)}"${t.bagIn === 'yes' ? '' : ' style="visibility:hidden;"'}><em${t.bagIn === 'yes' ? '' : ' style="visibility:hidden;"'}>kg</em></div>
            ${t.bagOld ? `<div class="trip-hint">기존 기재 내용: ${escapeHtml(t.bagOld)}</div>` : ''}
            ${f('tripTvFlightRef', '예약번호', t.flightRef, 40)}
            <div class="trip-sub trip-sub-row">렌트카
                <div class="trip-seg">${Object.entries(TRAVEL_CAR).map(([k, v]) => `<label><input type="radio" name="tripTvCar" value="${k}"${t.car === k ? ' checked' : ''} onchange="tripCarChanged()"><span>${v}</span></label>`).join('')}</div>
            </div>
            <div id="tripTvCarBox"${t.car === 'yes' ? '' : ' style="display:none;"'}>
                ${pair('tripTvCarCo', '업체', t.carCo, 'tripTvCarModel', '차종', t.carModel)}
                ${pair('tripTvCarPick', '인수', t.carPick, 'tripTvCarDrop', '반납', t.carDrop)}
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
    const outLine = flightText(t.flightOut, t.flightOutTime), backLine = flightText(t.flightBack, t.flightBackTime);
    const flight = (kind !== 'domestic' || outLine || backLine || t.flightRef || bagText(t)) ? `
            ${travelRow('출발편', outLine, '미정')}
            ${travelRow('복귀편', backLine, '미정')}
            ${bagText(t) ? travelRow('수하물', bagText(t), '') : ''}
            ${t.flightRef ? travelRow('예약번호', t.flightRef, '') : ''}` : '';
    const car = t.car === 'yes' ? `
            ${travelRow('렌트카', t.carCo || '사용', '')}
            ${t.carModel ? travelRow('차종', t.carModel, '') : ''}
            ${t.carPick ? travelRow('인수', t.carPick, '') : ''}
            ${t.carDrop ? travelRow('반납', t.carDrop, '') : ''}
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
        flightOut: val('tripTvFlightOut'), flightOutTime: timeText(val('tripTvFlightOutTime')),
        flightBack: val('tripTvFlightBack'), flightBackTime: timeText(val('tripTvFlightBackTime')), flightRef: val('tripTvFlightRef'),
        bagIn, bagKg: bagIn === 'yes' ? kgText(val('tripTvBagKg')) : '',   // 미포함이면 무게는 걷는다
        car,
        // 미사용이면 업체·예약번호는 걷는다 — 남겨 두면 마음을 바꿨을 때 옛 예약이 되살아난다
        carCo: car === 'yes' ? val('tripTvCarCo') : '', carModel: car === 'yes' ? val('tripTvCarModel') : '',
        carPick: car === 'yes' ? val('tripTvCarPick') : '', carDrop: car === 'yes' ? val('tripTvCarDrop') : '',
        carIns: car === 'yes' ? segVal('tripTvCarIns', TRAVEL_INS) : '', carRef: car === 'yes' ? val('tripTvCarRef') : ''
    };
    const stay = val('tripTvStay'), stayBf = segVal('tripTvStayBf', DAY_BF);
    const trip = findTrip(tripOpenId);
    tripEditing = null;
    if (!trip) { renderTripPage(); return; }
    const cur = tripTravel(trip);
    const old = trip.travel || {};
    // 예전 칸(한 칸이던 인수·반납 · 자유 글 수하물)이 남아 있으면 값이 같아도 한 번 저장해 새 칸으로 옮긴다
    const travelChanged = TRAVEL_KEYS.some(k => cur[k] !== next[k]) || old.carPlace !== undefined || (old.bag !== undefined && !cur.bagOld)
        || ['flightOut', 'flightBack'].some(k => typeof old[k] === 'string' && old[k] !== cur[k]);   // 편명 칸의 시각을 떼어 냈다
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
//   trip.bank = 송금 은행 · trip.account = 계좌번호 · trip.fund = [{title, amt, cur}] · trip.pack = [문자열]
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
// 한눈에 셋의 칸은 폭이 90px 남짓이라 `약 1,088,000원`이 잘렸다(사용자 제보). 만 단위로 줄여 적는다 — `약 108.8만원`.
const manText = (v, unit) => { v = Math.round(v); return v >= 10000 ? `${String(Math.round(v / 1000) / 10)}만${unit}` : `${formatNumber(v)}${unit}`; };
function shortMoney(m, ctx) {
    const cur = ctx && ctx.cur, fx = ctx && ctx.fx;
    if (m.f > 0 && fx && cur) return `약 ${manText(m.krw + m.f * fx / FX_CURS[cur].base, '원')}`;
    const parts = [];
    if (m.krw > 0 || !m.f) parts.push(manText(m.krw, '원'));
    if (m.f > 0) parts.push(manText(m.f, (FX_CURS[cur] || FX_CURS.JPY).name));
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
            <div class="trip-field row cost-bank"><span>은행</span><select id="costBank" onchange="costBankChanged()">${bankOptions(d.bank)}</select><input type="text" id="costBankEtc" maxlength="20" autocomplete="off" aria-label="은행명" value="${escapeHtml(TRIP_BANKS.includes(d.bank) ? '' : d.bank)}"${!d.bank || TRIP_BANKS.includes(d.bank) ? ' style="display:none;"' : ''}></div>
            <label class="trip-field row"><span>계좌번호</span><input type="text" id="costAccount" maxlength="40" inputmode="numeric" autocomplete="off" value="${escapeHtml(d.account)}"></label>
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
    const acct = tripAccountText(trip);
    const sendHtml = (send.krw || send.f) ? `
            <div class="trip-sub">송금 안내</div>
            <div class="cost-send">
                <div>${payer ? `총무 <b>${escapeHtml(payer)}</b>에게 ` : ''}1인 <b>${moneyText(send, s)}</b> 송금 <small>(결제 완료 항목)</small></div>
                ${acct ? `<div class="cost-account"><span>${escapeHtml(acct)}</span><button type="button" class="trip-link" onclick="copyTripAccount()">복사</button></div>` : ''}
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
        bank: typeof trip.bank === 'string' ? trip.bank : '', account: typeof trip.account === 'string' ? trip.account : '',
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
    costDraft.bank = val('costBank') === BANK_ETC ? val('costBankEtc') : val('costBank');
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
    const before = JSON.stringify([tripCosts(trip).map(c => [c.id, c.cat, c.title, c.amt, code(c.cur), c.unit, c.status]), tripFund(trip).map(f => [f.title, f.amt, code(f.cur)]), tripPeople(trip), oc, tripFx(trip), trip.payer || '', trip.bank || '', trip.account || '']);
    const after = JSON.stringify([items.map(c => [c.id, c.cat, c.title, c.amt, c.cur, c.unit, c.status]), fund.map(f => [f.title, f.amt, f.cur]), d.people, d.cur, d.cur ? d.fx : 0, d.payer, d.bank, d.account]);
    // 비교는 내가 만든 배열끼리다(payload의 키 순서와 무관하다).
    // 없앤 입금 표시(`paid`)가 남아 있으면 값이 같아도 한 번 저장해 걷어낸다.
    if (before !== after || trip.paid !== undefined) editTrip(t => {
        const set = (k, v, keep) => { if (keep) t[k] = v; else delete t[k]; };
        set('costs', items, items.length);
        set('fund', fund, fund.length);
        set('people', d.people, d.people !== golfers.length);
        // 기본 통화(일본=엔, 그 밖=원화만)와 같으면 안 적는다. '원화만'을 고르면 'KRW'로 적어 기본값을 누른다.
        set('curr', d.cur || 'KRW', d.cur !== curDefault(t));
        set('fx', d.fx, d.cur && d.fx > 0);
        set('payer', d.payer, d.payer);
        set('bank', d.bank, d.bank);
        set('account', d.account, d.account);
        delete t.paid;
    }, '✅ 여행 경비를 저장했습니다.');
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
// 송금 은행 — 손으로 치면 `국민 은행`·`kb`처럼 제각각이라 목록에서 고른다. 모임이 광주·전남이라 광주은행이 맨 앞이다.
// 목록에 없는 곳(증권사 등)은 `직접 입력`. 예전에 계좌 칸 한 줄에 `국민 123-…`로 적은 것은 그대로 보인다.
const TRIP_BANKS = ['광주은행', 'KB국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', '지역농축협', 'IBK기업은행',
    '카카오뱅크', '토스뱅크', '케이뱅크', 'SC제일은행', '한국씨티은행', '우체국', '새마을금고', '신협', '수협은행',
    '전북은행', '부산은행', '경남은행', 'iM뱅크(대구)', '제주은행', 'KDB산업은행'];
const BANK_ETC = '__etc';
function bankOptions(cur) {
    const etc = cur && !TRIP_BANKS.includes(cur);
    return `<option value="">선택</option>${TRIP_BANKS.map(b => `<option value="${b}"${b === cur ? ' selected' : ''}>${b}</option>`).join('')}<option value="${BANK_ETC}"${etc ? ' selected' : ''}>직접 입력</option>`;
}
function costBankChanged() {
    const sel = document.getElementById('costBank'), etc = document.getElementById('costBankEtc');
    if (!sel || !etc) return;
    const on = sel.value === BANK_ETC;
    etc.style.display = on ? '' : 'none';
    if (on) etc.focus(); else etc.value = '';
}
function tripAccountText(trip) { return [trip.bank, trip.account].filter(v => typeof v === 'string' && v.trim()).join(' ').trim(); }
async function copyTripAccount() {
    const trip = findTrip(tripOpenId);
    const text = trip ? tripAccountText(trip) : '';
    if (text && await copyText(text)) showToast('📋 계좌를 복사했습니다.');
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
            <div class="trip-field row"><span>라운드</span>${segHtml('tripEdGolf', DAY_GOLF, noRound(d) ? 'no' : '', 'tripGolfChanged()')}</div>
            <div id="tripEdGolfBox"${noRound(d) ? ' style="display:none;"' : ''}>
            <label class="trip-field row"><span>골프장</span><input type="text" id="tripEdCourse" maxlength="60" autocomplete="off" value="${escapeHtml(d.course)}"${kind === 'domestic' ? ' onfocus="this.select(); tripCourseSuggest(true)" oninput="tripCourseSuggest()" onblur="tripCourseHide()"' : ''}></label>
            ${kind === 'domestic' ? '<div id="tripCourseResults" class="course-results" style="display:none;"></div>' : ''}
            <label class="trip-field row"><span>티오프</span><input type="text" id="tripEdTee" maxlength="20" value="${escapeHtml(d.tee)}"></label>
            </div>
            <label class="trip-field row"><span>지역</span><input type="text" id="tripEdArea" maxlength="20" value="${escapeHtml(d.area)}"></label>
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
    const off = noRound(d);
    const back = off ? dayFlight(trip, d) : '';
    return `
        <div class="tl-detail">
            ${off ? (back ? `<div class="trip-row"><span class="k">복귀편</span><span class="v">${escapeHtml(back)}</span></div>` : '')
                : `<div class="trip-row"><span class="k">티오프</span><span class="v${d.tee ? '' : ' empty'}">${d.tee ? escapeHtml(d.tee) : '미정'}</span></div>`}
            ${!d.stay && homeDay(trip, d) ? '' : `<div class="trip-row"><span class="k">숙소</span><span class="v${d.stay ? '' : ' empty'}">${d.stay ? escapeHtml(d.stay) : '미정'}${d.stay && bfText(d.bf) ? ` <span class="trip-bf">· ${bfText(d.bf)}</span>` : ''}</span></div>`}
            ${d.course && !past ? `<div class="trip-row trip-wx"><span class="k">날씨</span><span class="v" id="tripWx-${dateId}">${tripWeatherHtml(d)}</span></div>` : ''}
            ${d.memo ? `<div class="trip-memo">${escapeHtml(d.memo)}</div>` : ''}
            ${kind === 'japan' && !past && !off ? `<div class="trip-actions"><button type="button" class="trip-btn gora" onclick="openGora('${dateId}')">🔎 일본 골프장 찾기${d.course ? ' (변경)' : ''}</button></div>` : ''}
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
    const rounds = days.filter(d => d.course && !noRound(d)).length;
    const kindName = TRIP_KINDS[tripKind(trip)].replace(/^\S+\s/, '');
    const pts = days.map(d => ({ label: d.area || d.course || (noRound(d) ? '이동' : '미정'), st: dayState(d.date, today) }))
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
    const sum = costSummary(trip);
    const costs = tripCosts(trip).length ? shortMoney(sum.total, sum) : '미입력';
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
        const off = noRound(d), back = off ? dayFlight(trip, d) : '';
        const sub = open ? '' : off ? ((back || d.stay) ? `<span class="tl-sub">${back ? `복귀편 ${escapeHtml(back)}` : `숙소 ${escapeHtml(d.stay)}`}</span>` : '')
            : `<span class="tl-sub">티오프 ${d.tee ? escapeHtml(d.tee) : '미정'}${!d.stay && homeDay(trip, d) ? '' : ` · 숙소 ${d.stay ? escapeHtml(d.stay) : '미정'}`}</span>`;
        return `
        <div class="tl-item ${st}${open ? ' open' : ''}">
            <div class="tl-rail"><span class="tl-no">${i + 1}</span>${last ? '' : `<span class="tl-bar${st === 'done' ? ' on' : ''}"></span>`}</div>
            <div class="tl-body">
                <button type="button" class="tl-sum" onclick="toggleTripDay('${d.date}')" aria-expanded="${open}">
                    <span class="tl-when">${isoLabel(d.date, true)}${d.area ? ` · ${escapeHtml(d.area)}` : ''}${st === 'now' ? ' <b class="tl-today">오늘</b>' : ''}</span>
                    <span class="tl-course${off ? ' off' : d.course ? '' : ' empty'}">${off ? (i === days.length - 1 ? '라운드 없음 · 귀가' : '라운드 없음') : d.course ? escapeHtml(d.course) : '골프장 미정'}</span>
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
// 여러 날 여행의 마지막 날은 귀가하는 날이라 숙소가 없는 게 정상이다 — `숙소 미정`을 적지 않는다(사용자 제보).
// 적어 둔 숙소가 있으면 그대로 보인다.
function homeDay(trip, d) { const days = tripDays(trip); return days.length > 1 && days[days.length - 1].date === d.date; }
// 라운드가 없는 마지막 날에는 복귀편을 함께 보인다(오전 비행기로 귀국하는 날이 대부분이다).
function dayFlight(trip, d) {
    const days = tripDays(trip);
    if (!days.length || days[days.length - 1].date !== d.date) return '';
    const t = tripTravel(trip);
    return flightText(t.flightBack, t.flightBackTime);
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
    if (typeof tripSection !== 'undefined' && tripSection === 'passport') { setTripBody(body, passportHtml()); return; }
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

    setTripBody(body, tripChipsHtml() + tripHeroHtml(trip, days, today) + tripTilesHtml(trip)
        + tripLineHtml(trip, days, today, openDate) + travelHtml(trip) + costHtml(trip) + packHtml(trip) + memo);
    days.forEach(d => { if (d.date === openDate && d.date >= today && d.course) loadTripWeather(d); });
}

function editTripDay(date) { tripEditing = date; renderTripPage(); }
function editTripMemo() { tripEditing = 'memo'; renderTripPage(); }
function editTripSettings() {
    const trip = findTrip(tripOpenId);
    if (!trip) return;
    closeTripSheet();
    if (tripEditing && tripEditing !== 'settings') { tripEditing = null; costDraft = null; renderTripPage(); }   // 적던 다른 칸은 접는다
    tripEditing = 'settings';
    const o = document.createElement('div');
    o.className = 'bdg-sheet-overlay trip-sheet-overlay';
    o.innerHTML = `<div class="bdg-sheet trip-sheet" role="dialog" aria-label="여행 수정"><div class="bdg-grip"></div>${settingsHtml(trip)}</div>`;
    o.addEventListener('click', e => { if (e.target === o) cancelTripEdit(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}
function cancelTripEdit() { closeTripSheet(); tripEditing = null; costDraft = null; renderTripPage(); }

function tripGolfChanged() {
    const box = document.getElementById('tripEdGolfBox');
    if (box) box.style.display = segVal('tripEdGolf', DAY_GOLF) === 'no' ? 'none' : '';
}
function saveTripDay(date) {
    const val = id => (document.getElementById(id) || {}).value || '';
    const golf = segVal('tripEdGolf', DAY_GOLF);
    // 라운드 없음이면 골프장·티오프는 걷는다(남기면 숨은 채로 라운드 수·알림에 섞인다).
    const next = { golf, course: golf ? '' : val('tripEdCourse').trim(), area: val('tripEdArea').trim(), tee: golf ? '' : val('tripEdTee').trim(), stay: val('tripEdStay').trim(), bf: segVal('tripEdBf', DAY_BF), memo: val('tripEdMemo').trim() };
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
        if (!target.golf) delete target.golf;
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

