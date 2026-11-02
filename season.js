// season.js — 시즌(연도) 단위 기록 관리 (사용자 요청 — 연말 시상식과 시즌 리셋)
//
// 시즌 = 한 해. 차수 번호는 시즌이 바뀌어도 그대로 이어지고(2027 첫 라운드가 15차여도 된다),
// 요약 카드의 계급·타수·찬조·합산, 계급 횟수, 시즌 타이틀 뱃지, 미션왕의 누적 획득만 새 시즌에 0에서 다시 시작한다.
// 보유 포인트·멀리건 사용권·라이프 베스트·평생 뱃지·스탬프·홀 기록·공금·내 목표 타수는 그대로 이어진다.
//
// 저장하는 값은 셋뿐이고 전부 더하기만 한다(낡은 폰이 덮어써도 mergeSeasonData가 되살린다):
//   payload.seasonFinal  = { "2026": 14 }            그 시즌의 마지막 차수(관리자 지정 · 0이면 해제)
//   payload.seasonShut   = { "2026": "2026-11-05" }  처음 '마무리됨'으로 확인한 날(한 번 적으면 안 바뀐다)
//   payload.seasonSpecial= { "2026": {name, note} }  공로상(관리자 지정)
// 시즌 소속·순위·시상 결과는 저장하지 않고 기록(차수 날짜·타수·정산)에서 그때그때 셈한다.

const SEASON_FIRST = 2026;

// 지금 시각 — 시험에서 `window.__NOW`(ISO 글)로 갈아 끼울 수 있다.
function seasonNow() { return window.__NOW ? new Date(window.__NOW) : new Date(); }
function kstTodayISO() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(seasonNow()); }
function kstYearNow() { return parseInt(kstTodayISO().slice(0, 4), 10); }

function seasonFinalMap() {
    const f = appData && appData.seasonFinal;
    return f && typeof f === 'object' ? f : {};
}

// 그 차수(1부터)의 날짜에서 읽은 연도 — 일정 날짜 → 홀 기록 날짜 → 홀 기록의 year 순. 없으면 null.
function seasonYearHint(no) {
    const rec = typeof ROUND_HOLES !== 'undefined' ? ROUND_HOLES[String(no)] : null;
    const d = ((appData && appData.roundDates) || {})[no] || (rec && rec.date) || '';
    const m = /^(\d{4})-/.exec(String(d));
    if (m) return parseInt(m[1], 10);
    if (rec && Number.isInteger(rec.year)) return rec.year;
    return null;
}

// 차수(0부터)마다 속한 시즌 — 날짜를 모르는 차수는 앞 차수를 따르고(시즌은 거꾸로 가지 않는다),
// 관리자가 지정한 마지막 차수(seasonFinal)가 있으면 그 번호까지는 그 시즌, 그 뒤는 다음 시즌 이후로 못박는다.
function seasonMap() {
    const n = (appData && appData.totalRounds) || 0;
    const fin = seasonFinalMap();
    const finYears = Object.keys(fin).map(Number).filter(y => Number(fin[y]) > 0).sort((a, b) => a - b);
    const out = [];
    let prev = SEASON_FIRST;
    for (let r = 0; r < n; r++) {
        let y = seasonYearHint(r + 1);
        if (y === null) y = prev;
        if (y < prev) y = prev;
        finYears.forEach(fy => {
            const last = Number(fin[fy]);
            if (r + 1 <= last) y = Math.min(y, fy);
            else y = Math.max(y, fy + 1);
        });
        if (y < prev) y = prev;
        out.push(y);
        prev = y;
    }
    return out;
}
function seasonOfRound(r) {
    const sm = seasonMap();
    return r >= 0 && r < sm.length ? sm[r] : currentSeasonQuick(sm);
}
function seasonRoundIdx(y) {
    const sm = seasonMap(), out = [];
    sm.forEach((s, r) => { if (s === y) out.push(r); });
    return out;
}

// 그 시즌이 마무리됐는가 — ① 다음 해 1월 1일(한국 시각)이 지났거나 ② 관리자가 마지막 차수를 정했고 그 차수의
// 스코어가 등록되고 네 명 정산 입력까지 끝났거나 ③ 한 번 마무리로 확인해 적어 둔 시즌이다.
function seasonFinalRound(y) { const v = Number(seasonFinalMap()[y]); return v > 0 ? v : 0; }
function seasonClosed(y) {
    if (appData && appData.seasonShut && appData.seasonShut[y]) return true;
    if (kstTodayISO() >= `${y + 1}-01-01`) return true;
    const last = seasonFinalRound(y);
    if (!last || last > ((appData && appData.totalRounds) || 0)) return false;
    const r = last - 1;
    return typeof roundScored === 'function' && roundScored(r) && roundMoneyDone(r);
}
// 시즌이 마무리된 까닭 — 안내 문구용. 'date' · 'final' · 'shut' · ''
function seasonClosedWhy(y) {
    if (!seasonClosed(y)) return '';
    if (kstTodayISO() >= `${y + 1}-01-01`) return 'date';
    return seasonFinalRound(y) ? 'final' : 'shut';
}

function currentSeasonQuick(sm) {
    let y = Math.max(SEASON_FIRST, kstYearNow(), sm && sm.length ? sm[sm.length - 1] : SEASON_FIRST);
    for (let i = 0; i < 20 && seasonClosed(y); i++) y++;
    return y;
}
// 지금 진행 중인 시즌 — 마무리된 시즌은 건너뛴다(마지막 차수 정산이 끝나면 곧바로 다음 시즌이다).
function currentSeason() { return currentSeasonQuick(seasonMap()); }
// 시상이 열린(=마무리된) 시즌 목록 — 오래된 것부터
function closedSeasons() {
    const out = [];
    for (let y = SEASON_FIRST; y < currentSeason(); y++) if (seasonClosed(y)) out.push(y);
    return out;
}
// 트로피 연도 탭 — 첫 시즌부터 지금 시즌까지
function seasonTabs() {
    const out = [];
    for (let y = SEASON_FIRST; y <= currentSeason(); y++) out.push(y);
    return out;
}

// 마무리로 처음 확인한 시즌은 한 번 적어 둔다(나중에 정산을 고쳐 조건이 깨져도 시상이 사라지지 않게).
// 값이 있으면 아무것도 안 한다 — 저장이 메아리로 되돌아와도 헛저장이 없다.
function noteSeasonShut() {
    if (!appData || !isLoaded || !leagueReadReady) return false;
    let changed = false;
    for (let y = SEASON_FIRST; y <= currentSeason(); y++) {
        if (!seasonClosed(y)) continue;
        if (appData.seasonShut && appData.seasonShut[y]) continue;
        if (!appData.seasonShut || typeof appData.seasonShut !== 'object') appData.seasonShut = {};
        appData.seasonShut[y] = kstTodayISO();
        changed = true;
    }
    if (changed) syncToSupabase(appData);
    return changed;
}

// 낡은 폰이 덮어써서 빠진 값을 앞 상태에서 되살린다 — 지정·확인한 값은 지우는 길이 없으므로(해제는 0으로 적는다) 합쳐도 늘 같은 값으로 모인다.
function mergeSeasonData(prev) {
    let changed = false;
    const copyMissing = (key, pick) => {
        const p = prev && prev[key];
        if (!p || typeof p !== 'object') return;
        Object.keys(p).forEach(y => {
            if (!appData[key] || typeof appData[key] !== 'object') appData[key] = {};
            if (appData[key][y] === undefined && pick(p[y])) { appData[key][y] = p[y]; changed = true; }
        });
    };
    copyMissing('seasonFinal', v => Number.isFinite(Number(v)));
    copyMissing('seasonShut', v => typeof v === 'string' && v);
    copyMissing('seasonSpecial', v => v && typeof v === 'object' && v.name);
    return changed;
}

// 안내 문구 — 시즌이 아직 안 끝났을 때(트로피 · 시상식 입구에서 쓴다)
function seasonPendingText(y) {
    const last = seasonFinalRound(y);
    return last
        ? `결과 발표는 ${y} 시즌이 마무리된 후 발표됩니다. (${last}차 정산 입력이 끝나면 자동으로 열립니다)`
        : `결과 발표는 ${y} 시즌이 마무리된 후 발표됩니다.`;
}
