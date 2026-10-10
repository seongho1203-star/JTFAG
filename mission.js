// 🎯 라운드 미션 — 세 번째 화면(미션 탭).
// 사용자 요청 — 돈내기 말고 게임처럼 즐길 거리. 시안 `JTFAG 라운드 미션 시안`을 보고 네 가지를 바꿔 정했다:
//   ① 미션 탭은 세 번째 자리 ② `미션 받기`를 누르면 무작위로 하나 ③ 미션 아홉 가지(아래 MISSION_DEFS)
//   ④ 포인트 5점마다 멀리건 사용권 1개.
//
// 저장하는 것은 둘뿐이다 — 누가 어느 차수에 무슨 미션을 받았나(`payload.missions`)와 멀리건을 언제 썼나
// (`payload.mulligans`). **성공·실패·포인트·사용권·뱃지는 전부 홀 기록(ROUND_HOLES)에서 그때그때 계산한다** —
// 판정을 저장하면 스코어카드를 다시 올렸을 때 어긋난다(뱃지 컬렉션과 같은 생각).
//
//   payload.missions  = { "10": { "신성호": { id: 'p3par2', at: 1760000000000, y: 2026 } } }
//   payload.mulligans = { "신성호": [ { r: 10, t: 1760000000000 } ] }
//
// 두 값 모두 **더하기만 한다**(한 번 받은 미션은 못 바꾸고 · 쓴 사용권은 안 되돌린다). 그래서 낡은 폰이 payload를
// 통째로 덮어써도 `mergeMissionData()`가 합쳐서 되살린다 — 지우는 길이 없으니 합쳐도 언제나 같은 값으로 모인다.

const MISSION_LEVELS = {
    1: { stars: '★', name: '쉬움' },
    2: { stars: '★★', name: '보통' },
    3: { stars: '★★★', name: '어려움' }
};
const MULLIGAN_STEP = 5;   // 포인트 5점마다 멀리건 사용권 1개(사용자가 정했다)

// 셈 도우미 — h는 { par: 18홀 파, rel: 파 대비 타수 }
const mCount = (h, pred) => h.rel.reduce((n, v, i) => n + (pred(v, i) ? 1 : 0), 0);
const mRun = (h, pred) => { let run = 0, best = 0; h.rel.forEach((v, i) => { run = pred(v, i) ? run + 1 : 0; if (run > best) best = run; }); return best; };
const mHalf = (h, a) => h.par.slice(a, a + 9).reduce((t, p, i) => t + p + h.rel[a + i], 0);
const mGross = h => mHalf(h, 0) + mHalf(h, 9);
const mBirdie = h => mCount(h, v => v < 0);

// 미션 목록(사용자가 정했다 — 처음 아홉에 열하나를 더했다). `w`는 뽑힐 무게 — 전반·후반 42타는 한 가지를 둘로 나눈 것이라 반씩.
// **`who: true`인 미션은 다른 멤버 한 사람이 대상이다**(사용자 요청 — `김지명 버디2개 이런것도`). 받을 때 대상도 무작위로 정해
// `rec.who`에 남기고, 글의 `{T}` 자리에 그 이름이 들어간다. 판정은 `judge(내 기록, 대상 기록)`이다.
// 대상이 그 차수에 기록이 없으면(불참) 판정하지 않는다. 겨루는 미션은 비기면 실패다.
// 난이도는 1~9차 실제 홀 기록으로 성공률을 재서 정했다(○○ 파 6개 64% · ○○ 89타 44% · ○○ 버디 2개 11% ·
// 후반 대결 44% · 타수 대결 49% · 버디 대결 26% · 버디 1개 56% · 파 8개 28% · 89타 44% · 마지막 3홀 28% · 파5 모두 보기 이하 19%).
// **'파'는 파 이하(버디 포함)로 센다** — 버디를 했다고 미션이 깨지면 이상하다.
// **'더블보기'·'트리플 보기'는 그 이상까지 센다**(트리플은 더블보기 이상에도 든다).
const MISSION_DEFS = [
    { id: 'par3', lv: 1, w: 2, text: '파 3개 이상', how: '파 이하(버디 포함) 홀 3개 이상',
      judge: h => { const n = mCount(h, v => v <= 0); return { ok: n >= 3, got: `파 이하 ${n}개` }; } },
    { id: 'noTriple', lv: 1, w: 2, text: '트리플 보기 없이', how: '트리플 보기 이상 홀 없이 18홀 마무리',
      judge: h => { const n = mCount(h, v => v >= 3); return { ok: n === 0, got: `트리플 이상 ${n}개` }; } },
    { id: 'dbl4', lv: 1, w: 2, text: '더블보기 4개 이하', how: '더블보기 이상 홀 4개 이하',
      judge: h => { const n = mCount(h, v => v >= 2); return { ok: n <= 4, got: `더블보기 이상 ${n}개` }; } },
    { id: 'p3par2', lv: 2, w: 2, text: '파3에서 파 2개', how: '파3 홀에서 파 이하 2개 이상',
      judge: h => { const n = mCount(h, (v, i) => h.par[i] === 3 && v <= 0); return { ok: n >= 2, got: `파3 파 이하 ${n}개` }; } },
    { id: 'front42', lv: 2, w: 1, text: '전반 42타 이하', how: '앞 9홀 합계 42타 이하',
      judge: h => { const n = mHalf(h, 0); return { ok: n <= 42, got: `전반 ${n}타` }; } },
    { id: 'back42', lv: 2, w: 1, text: '후반 42타 이하', how: '뒤 9홀 합계 42타 이하',
      judge: h => { const n = mHalf(h, 9); return { ok: n <= 42, got: `후반 ${n}타` }; } },
    { id: 'bogey4', lv: 2, w: 2, text: '4홀 연속 보기 이하', how: '보기 이하 홀 4개 연속',
      judge: h => { const n = mRun(h, v => v <= 1); return { ok: n >= 4, got: `최대 ${n}홀 연속` }; } },
    { id: 'birdie3', lv: 3, w: 2, text: '버디 3개', how: '버디 이하(이글 포함) 홀 3개 이상',
      judge: h => { const n = mCount(h, v => v < 0); return { ok: n >= 3, got: `버디 ${n}개` }; } },
    { id: 'parRun4', lv: 3, w: 2, text: '4홀 연속 파', how: '파 이하(버디 포함) 홀 4개 연속',
      judge: h => { const n = mRun(h, v => v <= 0); return { ok: n >= 4, got: `최대 ${n}홀 연속` }; } },
    { id: 'p5par3', lv: 3, w: 2, text: '파5에서 파 3개', how: '파5 홀에서 파 이하 3개 이상',
      judge: h => { const n = mCount(h, (v, i) => h.par[i] === 5 && v <= 0); return { ok: n >= 3, got: `파5 파 이하 ${n}개` }; } },
    // ── 추가분(본인) ──
    { id: 'birdie1', lv: 1, w: 2, text: '버디 1개 이상', how: '버디 이하(이글 포함) 홀 1개 이상',
      judge: h => { const n = mBirdie(h); return { ok: n >= 1, got: `버디 ${n}개` }; } },
    { id: 'par8', lv: 2, w: 2, text: '파 8개 이상', how: '파 이하(버디 포함) 홀 8개 이상',
      judge: h => { const n = mCount(h, v => v <= 0); return { ok: n >= 8, got: `파 이하 ${n}개` }; } },
    { id: 'gross89', lv: 2, w: 2, text: '89타 이하', how: '18홀 합계 89타 이하',
      judge: h => { const n = mGross(h); return { ok: n <= 89, got: `${n}타` }; } },
    { id: 'last3', lv: 2, w: 2, text: '마지막 3홀 보기 이하', how: '16·17·18번 홀 모두 보기 이하',
      judge: h => { const n = h.rel.slice(15).filter(v => v <= 1).length; return { ok: n === 3, got: `마지막 3홀 중 ${n}홀 보기 이하` }; } },
    { id: 'p5bogey', lv: 3, w: 2, text: '파5 홀 모두 보기 이하', how: '파5 홀 전부 보기 이하',
      judge: h => { const all = mCount(h, (v, i) => h.par[i] === 5), n = mCount(h, (v, i) => h.par[i] === 5 && v <= 1); return { ok: all > 0 && n === all, got: `파5 ${all}홀 중 ${n}홀 보기 이하` }; } },
    // ── 다른 멤버가 대상(응원) ──
    { id: 'tPar6', lv: 1, w: 2, who: true, text: '{T} 파 6개 이상', how: '대상 멤버가 파 이하(버디 포함) 홀 6개 이상',
      judge: (h, o) => { const n = mCount(o, v => v <= 0); return { ok: n >= 6, got: `{T} 파 이하 ${n}개` }; } },
    { id: 'tGross89', lv: 2, w: 2, who: true, text: '{T} 89타 이하', how: '대상 멤버가 18홀 합계 89타 이하',
      judge: (h, o) => { const n = mGross(o); return { ok: n <= 89, got: `{T} ${n}타` }; } },
    { id: 'tBirdie2', lv: 3, w: 2, who: true, text: '{T} 버디 2개 이상', how: '대상 멤버가 버디 이하(이글 포함) 홀 2개 이상',
      judge: (h, o) => { const n = mBirdie(o); return { ok: n >= 2, got: `{T} 버디 ${n}개` }; } },
    // ── 다른 멤버와 대결(비기면 실패) ──
    { id: 'vsBack', lv: 1, w: 2, who: true, text: '{T}보다 후반 타수 적게', how: '뒤 9홀 합계가 대상 멤버보다 적게(동타는 실패)',
      judge: (h, o) => { const a = mHalf(h, 9), b = mHalf(o, 9); return { ok: a < b, got: `후반 ${a}타 · {T} ${b}타` }; } },
    { id: 'vsGross', lv: 2, w: 2, who: true, text: '{T}보다 적은 타수', how: '18홀 합계가 대상 멤버보다 적게(동타는 실패)',
      judge: (h, o) => { const a = mGross(h), b = mGross(o); return { ok: a < b, got: `${a}타 · {T} ${b}타` }; } },
    { id: 'vsBirdie', lv: 3, w: 2, who: true, text: '{T}보다 버디 많이', how: '버디 개수가 대상 멤버보다 많게(같으면 실패)',
      judge: (h, o) => { const a = mBirdie(h), b = mBirdie(o); return { ok: a > b, got: `버디 ${a}개 · {T} ${b}개` }; } }
];
const MISSION_BY_ID = {};
MISSION_DEFS.forEach(d => { MISSION_BY_ID[d.id] = d; });

// ── 기록 읽기 ──────────────────────────────────────────────
function missionYearNow() {
    return parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()), 10);
}

function missionRec(round, g) {
    const all = appData && appData.missions;
    const rec = all && all[String(round)] && all[String(round)][g];
    if (!rec || !MISSION_BY_ID[rec.id]) return null;
    // 대상 멤버가 있는 미션은 그 이름이 우리 넷 중 하나(본인 제외)여야 한다
    if (MISSION_BY_ID[rec.id].who && !(golfers.includes(rec.who) && rec.who !== g)) return null;
    return rec;
}

// 화면에 적는 미션 글 — `{T}` 자리에 대상 멤버 이름(모르면 ○○)
function missionText(def, rec) {
    return def.text.replace('{T}', rec && rec.who ? rec.who : '○○');
}

// 그 차수의 18홀 기록. 없으면 null.
function missionHoles(round, g) {
    if (typeof ROUND_HOLES === 'undefined') return null;
    const rec = ROUND_HOLES[String(round)];
    if (!rec || !Array.isArray(rec.par) || rec.par.length !== 18 || !rec.rel) return null;
    const rel = rec.rel[g];
    return Array.isArray(rel) && rel.length === 18 ? { par: rec.par, rel } : null;
}
function roundHasHoles(round) {
    return typeof ROUND_HOLES !== 'undefined' && !!ROUND_HOLES[String(round)];
}

// 판정 — state: 'wait'(아직 홀 기록 없음) · 'none'(그 차수에 기록이 없음 = 불참) · 'ok' · 'fail'
function missionResult(round, g) {
    const rec = missionRec(round, g);
    if (!rec) return null;
    const def = MISSION_BY_ID[rec.id];
    const base = { round, g, rec, def, text: missionText(def, rec) };
    if (!roundHasHoles(round)) return { ...base, state: 'wait' };
    const h = missionHoles(round, g);
    if (!h) return { ...base, state: 'none' };
    let o = null;
    if (def.who) {
        o = missionHoles(round, rec.who);
        if (!o) return { ...base, state: 'none', got: `${rec.who} 기록 없음` };
    }
    const r = def.judge(h, o);
    return { ...base, state: r.ok ? 'ok' : 'fail', ok: r.ok, got: r.got.replace('{T}', rec.who || '') };
}

function missionRounds() {
    return Object.keys((appData && appData.missions) || {}).map(Number).filter(n => n > 0).sort((a, b) => a - b);
}

// 한 사람의 판정이 끝난 미션(성공·실패)을 차수 순서대로
function missionLog(g) {
    return missionRounds().map(r => missionResult(r, g)).filter(x => x && (x.state === 'ok' || x.state === 'fail'));
}

function missionPoints(g, year) {
    return missionLog(g).filter(x => x.ok && (!year || x.rec.y === year)).reduce((t, x) => t + x.def.lv, 0);
}
function missionSeasonPoints(g) { return missionPoints(g, missionYearNow()); }

// 멀리건 — 받은 개수는 통산 포인트에서 셈하고(해가 바뀌어도 남는다), 쓴 개수만 저장한다.
function mulliganUses(g) {
    const list = appData && appData.mulligans && appData.mulligans[g];
    return Array.isArray(list) ? list.filter(u => u && typeof u.t === 'number') : [];
}
function mulliganInfo(g) {
    const pts = missionPoints(g);
    const earned = Math.floor(pts / MULLIGAN_STEP);
    const used = mulliganUses(g).length;
    return { pts, earned, used, left: Math.max(0, earned - used), toNext: MULLIGAN_STEP - (pts % MULLIGAN_STEP) };
}

// 미션왕 — 올해 포인트 1위(0점이면 없음 · 같으면 함께)
function missionKings() {
    if (typeof golfers === 'undefined') return [];
    const pts = golfers.map(g => missionSeasonPoints(g));
    const top = Math.max(0, ...pts);
    return top > 0 ? golfers.filter((g, i) => pts[i] === top) : [];
}

// 지금 미션을 받을 수 있는 차수 — 일정에 잡힌 다음 라운드(`nextRoundNo`)가 아직 안 지났고 홀 기록도 없을 때.
function missionTarget() {
    const n = parseInt(appData && appData.nextRoundNo, 10);
    const days = typeof daysUntilNextRound === 'function' ? daysUntilNextRound() : null;
    if (!(n > 0) || days === null || days < 0 || roundHasHoles(n)) return null;
    const iso = appData.nextRoundISO || '';
    return { round: n, days, year: parseInt(iso.slice(0, 4), 10) || missionYearNow() };
}

// ── 뱃지(badges.js의 BADGE_GROUPS)가 쓰는 값 — 돌려주는 차수는 0부터(뱃지 규칙) ──
function missionFirst(g, pred) {
    const hit = missionLog(g).find(pred);
    return hit ? hit.round - 1 : -1;
}
function missionOkAt(g, round) {
    const x = missionResult(round, g);
    return !!x && x.state === 'ok';
}
// n번 연달아 성공(또는 실패)한 첫 차수 — 미션을 받은 라운드끼리 센다
function missionRunRound(g, ok, n) {
    let run = 0;
    for (const x of missionLog(g)) {
        run = x.ok === ok ? run + 1 : 0;
        if (run >= n) return x.round - 1;
    }
    return -1;
}
// 넷 모두 미션을 받아 다 성공한 첫 차수
function missionAllClear() {
    for (const r of missionRounds()) {
        if (golfers.every(g => missionOkAt(g, r))) return r - 1;
    }
    return -1;
}

// ── 저장 ─────────────────────────────────────────────────
// 내가 받은 미션·쓴 사용권은 이 기기에도 적어 둔다 — 저장이 서버에 닿기 전에 앱을 닫았거나
// 낡은 폰이 덮어썼을 때 다음 접속에서 되살린다(정산 금액의 jtfag_money_guard와 같은 생각).
const MISSION_MINE_KEY = 'jtfag_mission_mine';

function readMine() {
    try {
        const m = JSON.parse(localStorage.getItem(MISSION_MINE_KEY) || 'null');
        return m && typeof m === 'object' ? m : null;
    } catch (e) { return null; }
}
function writeMine(fn) {
    const me = localStorage.getItem('jtfag_my_name');
    let m = readMine();
    if (!m || m.name !== me) m = { name: me, missions: {}, mulligans: [] };
    fn(m);
    try { localStorage.setItem(MISSION_MINE_KEY, JSON.stringify(m)); } catch (e) {}
}

// 들어온 payload에 빠진 미션·사용권을 앞 상태(prev)와 이 기기 기록에서 채운다. 채웠으면 true(=한 번 더 저장).
function mergeMissionData(prev) {
    let changed = false;
    const addMission = (r, g, rec) => {
        if (!rec || !MISSION_BY_ID[rec.id] || !golfers.includes(g)) return;
        if (!appData.missions || typeof appData.missions !== 'object') appData.missions = {};
        if (!appData.missions[r]) appData.missions[r] = {};
        if (!appData.missions[r][g]) { appData.missions[r][g] = rec; changed = true; }
    };
    const addUse = (g, u) => {
        if (!u || typeof u.t !== 'number' || !golfers.includes(g)) return;
        if (!appData.mulligans || typeof appData.mulligans !== 'object') appData.mulligans = {};
        if (!Array.isArray(appData.mulligans[g])) appData.mulligans[g] = [];
        if (!appData.mulligans[g].some(x => x && x.t === u.t)) { appData.mulligans[g].push(u); changed = true; }
    };
    const pm = (prev && prev.missions) || {};
    Object.keys(pm).forEach(r => Object.keys(pm[r] || {}).forEach(g => addMission(r, g, pm[r][g])));
    const pu = (prev && prev.mulligans) || {};
    Object.keys(pu).forEach(g => (Array.isArray(pu[g]) ? pu[g] : []).forEach(u => addUse(g, u)));
    const mine = readMine();
    if (mine && mine.name) {
        Object.keys(mine.missions || {}).forEach(r => addMission(r, mine.name, mine.missions[r]));
        (mine.mulligans || []).forEach(u => addUse(mine.name, u));
    }
    if (changed && appData.mulligans) Object.keys(appData.mulligans).forEach(g => appData.mulligans[g].sort((a, b) => a.t - b.t));
    return changed;
}

function pickMission() {
    const total = MISSION_DEFS.reduce((t, d) => t + d.w, 0);
    let x;
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); x = a[0] / 4294967296 * total; }
    catch (e) { x = Math.random() * total; }
    for (const d of MISSION_DEFS) { if ((x -= d.w) < 0) return d; }
    return MISSION_DEFS[MISSION_DEFS.length - 1];
}

let missionRoll = null;      // 뽑는 중이면 { until, timer } — 그동안은 화면을 다시 그리지 않는다
let missionLanded = 0;       // 막 뽑힌 미션에 한 번만 붙이는 연출 시각

// 미션 받기 — 한 번 받으면 못 바꾼다. **되돌리기(saveState)를 일부러 안 건다** —
// 되돌리기로 미션을 지웠다 다시 뽑을 수 있으면 무작위의 뜻이 없어진다(undoLastAction도 미션은 그대로 둔다).
function drawMission() {
    if (missionRoll) return;
    const me = localStorage.getItem('jtfag_my_name');
    if (!me || !golfers.includes(me)) { showToast('⚠️ 이름을 먼저 설정해야 미션을 받을 수 있습니다.'); return; }
    const t = missionTarget();
    if (!t) { showToast('⚠️ 다음 라운드 일정이 등록되어야 미션을 받을 수 있습니다.'); return; }
    if (missionRec(t.round, me)) { showToast('ℹ️ 이번 라운드 미션은 이미 받았습니다.'); return; }
    const def = pickMission();
    const rec = { id: def.id, at: Date.now(), y: t.year };
    if (def.who) {
        const others = golfers.filter(g => g !== me);
        let k = 0;
        try { const a = new Uint32Array(1); crypto.getRandomValues(a); k = a[0] % others.length; } catch (e) { k = Math.floor(Math.random() * others.length); }
        rec.who = others[k];
    }
    if (!appData.missions || typeof appData.missions !== 'object') appData.missions = {};
    if (!appData.missions[t.round]) appData.missions[t.round] = {};
    appData.missions[t.round][me] = rec;
    writeMine(m => { m.missions[t.round] = rec; });
    syncToSupabase(appData);

    // 슬롯처럼 미션 이름이 몇 번 바뀌다 멈춘다 — 글자만 바꾸므로 그리기 비용이 없다.
    const box = document.getElementById('msnRollText');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finish = () => {
        if (missionRoll) clearInterval(missionRoll.timer);
        missionRoll = null;
        missionLanded = Date.now();
        missionLastHtml = '';
        renderMissionPage();
        showToast(`🎯 ${t.round}차 미션 · ${missionText(def, rec)} (${MISSION_LEVELS[def.lv].stars} ${def.lv}점)`);
    };
    if (!box || reduce) { finish(); return; }
    let i = 0;
    const btn = document.getElementById('msnDrawBtn');
    if (btn) { btn.disabled = true; btn.textContent = '미션 뽑는 중…'; }
    box.classList.add('rolling');
    missionRoll = { timer: setInterval(() => { box.textContent = missionText(MISSION_DEFS[(i++ * 7 + 3) % MISSION_DEFS.length], null); }, 85) };
    setTimeout(finish, 1300);
}

async function useMulligan() {
    const me = localStorage.getItem('jtfag_my_name');
    if (!me || !golfers.includes(me)) { showToast('⚠️ 이름을 먼저 설정해야 합니다.'); return; }
    const info = mulliganInfo(me);
    if (info.left <= 0) { showToast(`⚠️ 사용 가능한 멀리건이 없습니다. 다음 사용권까지 ${info.toNext}점 남았습니다.`); return; }
    const t = missionTarget();
    const round = t ? t.round : (appData.totalRounds || 0);
    const ok = await showConfirmPrompt(`<b>멀리건 사용권 1개</b>를 사용합니다.<br><span style="font-size:0.8rem;color:#6b7075;font-weight:600">${round}차 라운드 · 사용 후 취소할 수 없습니다.<br>보유 ${info.left}개 → ${info.left - 1}개</span>`, '사용', '#2b5394');
    if (!ok) return;
    // 확인창이 떠 있는 사이 남의 저장이 들어왔을 수 있어 지금 값으로 다시 본다
    if (mulliganInfo(me).left <= 0) { showToast('⚠️ 사용 가능한 멀리건이 없습니다.'); return; }
    const use = { r: round, t: Date.now() };
    if (!appData.mulligans || typeof appData.mulligans !== 'object') appData.mulligans = {};
    if (!Array.isArray(appData.mulligans[me])) appData.mulligans[me] = [];
    appData.mulligans[me].push(use);
    writeMine(m => { m.mulligans.push(use); });
    syncToSupabase(appData);
    renderMissionPage();
    showToast(`⛳ 멀리건 사용권을 사용했습니다. 남은 사용권 ${mulliganInfo(me).left}개`);
}

// ── 미션 화면 ─────────────────────────────────────────────
let missionViewName = null;   // 기록을 보는 사람(처음엔 이 기기 주인)
let missionLastHtml = '';

function msnStars(lv) { return `<span class="msn-stars" aria-label="${MISSION_LEVELS[lv].name}">${MISSION_LEVELS[lv].stars}</span>`; }
const MSN_TARGET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.9"/></svg>';

function msnStateHtml(x) {
    if (!x) return '<span class="msn-state off">미수령</span>';
    if (x.state === 'ok') return `<span class="msn-state ok">성공 +${x.def.lv}</span>`;
    if (x.state === 'fail') return '<span class="msn-state fail">실패</span>';
    if (x.state === 'none') return '<span class="msn-state off">기록 없음</span>';
    return `<span class="msn-pts">+${x.def.lv}</span>`;
}

function missionTargetCard(me) {
    const t = missionTarget();
    if (!t) {
        return `<div class="msn-card"><div class="msn-head"><span>라운드 미션</span></div>
            <div class="msn-empty">다음 라운드 일정이 등록되면 미션을 받을 수 있습니다.<br><span>홈의 <b>다음 라운드</b>에서 일정을 등록합니다.</span></div></div>`;
    }
    const dday = t.days === 0 ? 'D-DAY' : `D-${t.days}`;
    const mine = me && golfers.includes(me) ? missionRec(t.round, me) : null;
    let mineHtml;
    if (!me || !golfers.includes(me)) {
        mineHtml = '<div class="msn-empty">이름을 설정한 기기에서 미션을 받을 수 있습니다.</div>';
    } else if (!mine) {
        mineHtml = `<div class="msn-draw">
            <div class="msn-roll"><span class="msn-ic">${MSN_TARGET_ICON}</span><span class="msn-roll-text" id="msnRollText">어떤 미션이 나올까요?</span></div>
            <button type="button" class="msn-draw-btn" id="msnDrawBtn" onclick="drawMission()">미션 받기</button>
            <div class="msn-note">미션 목록 중 하나가 무작위로 정해집니다 · 한 번 받으면 변경할 수 없습니다</div>
        </div>`;
    } else {
        const d = MISSION_BY_ID[mine.id];
        const pop = Date.now() - missionLanded < 1500 ? ' pop' : '';
        mineHtml = `<div class="msn-mine${pop}">
            <span class="msn-ic">${MSN_TARGET_ICON}</span>
            <div class="msn-mine-body"><div class="k">내 미션</div><div class="t">${escapeHtml(missionText(d, mine))}</div><div class="h">${escapeHtml(d.how)}</div></div>
            <div class="msn-mine-side">${msnStars(d.lv)}<span class="msn-pts">+${d.lv}점</span></div>
        </div>`;
    }
    const others = golfers.filter(g => g !== me).map(g => {
        const rec = missionRec(t.round, g);
        const d = rec && MISSION_BY_ID[rec.id];
        return `<div class="msn-row"><span class="n">${escapeHtml(g)}</span>
            <span class="m${d ? '' : ' off'}">${d ? escapeHtml(missionText(d, rec)) : '아직 받지 않음'}</span>
            <span class="r">${d ? `${msnStars(d.lv)}<span class="msn-pts">+${d.lv}</span>` : ''}</span></div>`;
    }).join('');
    return `<div class="msn-card">
        <div class="msn-head"><span>${t.round}차 라운드 미션</span><span class="msn-dday">${dday}</span></div>
        ${mineHtml}
        <div class="msn-others">${others}</div>
        <div class="msn-foot">스코어카드가 등록되면 홀 기록으로 자동 판정합니다.</div>
    </div>`;
}

function missionLastResultCard() {
    const judged = missionRounds().filter(r => roundHasHoles(r));
    if (!judged.length) return '';
    const r = judged[judged.length - 1];
    const rows = golfers.map(g => missionResult(r, g)).filter(Boolean);
    if (!rows.length) return '';
    const okN = rows.filter(x => x.state === 'ok').length;
    return `<div class="msn-card">
        <div class="msn-head"><span>${r}차 미션 결과</span><span class="msn-sub">${okN}명 성공</span></div>
        ${rows.map(x => `<div class="msn-res ${x.state}">
            <span class="mk">${x.state === 'ok' ? '✓' : (x.state === 'fail' ? '✕' : '–')}</span>
            <div class="b"><div class="n">${escapeHtml(x.g)} <span>${escapeHtml(x.text)}</span></div>
            <div class="g">${x.got ? escapeHtml(x.got) : '홀 기록 없음'}</div></div>
            ${msnStateHtml(x)}</div>`).join('')}
    </div>`;
}

function missionRankCard(me) {
    const year = missionYearNow();
    const rows = golfers.map(g => ({ g, p: missionSeasonPoints(g), m: mulliganInfo(g) }));
    const sorted = rows.slice().sort((a, b) => b.p - a.p);
    const top = Math.max(1, sorted[0] ? sorted[0].p : 1);
    const kings = missionKings();
    return `<div class="msn-card">
        <div class="msn-head"><span>미션 포인트</span><span class="msn-sub">${year} 시즌</span></div>
        <div class="msn-rank">${sorted.map(x => {
            const place = sorted.findIndex(y => y.p === x.p) + 1;
            return `<div class="msn-rk${x.g === me ? ' me' : ''}">
                <span class="no${place === 1 && x.p > 0 ? ' first' : ''}">${place}</span>
                <span class="nm">${escapeHtml(x.g)}${kings.includes(x.g) ? '<em>미션왕</em>' : ''}</span>
                <span class="bar"><i style="width:${Math.round(x.p / top * 100)}%"></i></span>
                <span class="v">${x.p}<small>점</small></span>
                <span class="tk" title="멀리건 사용권">${x.m.left}<small>장</small></span>
            </div>`;
        }).join('')}</div>
        <div class="msn-legend"><span>점 = 올해 미션 포인트</span><span>장 = 남은 멀리건 사용권</span></div>
    </div>`;
}

function missionMulliganCard(me) {
    if (!me || !golfers.includes(me)) return '';
    const m = mulliganInfo(me);
    const pct = Math.round((MULLIGAN_STEP - m.toNext) / MULLIGAN_STEP * 100);
    const uses = golfers.flatMap(g => mulliganUses(g).map(u => ({ g, u }))).sort((a, b) => b.u.t - a.u.t).slice(0, 5);
    const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
    return `<div class="msn-card">
        <div class="msn-head"><span>멀리건 사용권</span><span class="msn-sub">포인트 ${MULLIGAN_STEP}점마다 1장</span></div>
        <div class="msn-mul">
            <div class="msn-ticket"><span class="big">${m.left}</span><span class="lb">장 보유</span></div>
            <div class="msn-mul-body">
                <div class="msn-mul-line">다음 사용권까지 <b>${m.toNext}점</b></div>
                <div class="msn-mul-bar"><i style="width:${pct}%"></i></div>
                <div class="msn-mul-sub">통산 ${m.pts}점 · 받은 사용권 ${m.earned}장 · 사용 ${m.used}장</div>
            </div>
        </div>
        <button type="button" class="msn-use-btn"${m.left > 0 ? '' : ' disabled'} onclick="useMulligan()">멀리건 사용</button>
        ${uses.length ? `<div class="msn-uses"><div class="lb">최근 사용</div>${uses.map(x => `<div class="msn-use"><span>${escapeHtml(x.g)}</span><span>${x.u.r ? x.u.r + '차' : ''} · ${fmt(x.u.t)}</span></div>`).join('')}</div>` : ''}
    </div>`;
}

function missionHistoryCard(me) {
    if (!missionViewName || !golfers.includes(missionViewName)) missionViewName = golfers.includes(me) ? me : golfers[0];
    const g = missionViewName;
    const list = missionRounds().map(r => missionResult(r, g)).filter(Boolean).reverse();
    const log = missionLog(g);
    const okN = log.filter(x => x.ok).length;
    return `<div class="msn-card">
        <div class="msn-head"><span>미션 기록</span><span class="msn-sub">${log.length ? `${log.length}회 중 ${okN}회 성공` : ''}</span></div>
        <div class="msn-people">${golfers.map(n => `<button type="button" class="${n === g ? 'on' : ''}" onclick="selectMissionPerson('${n}')">${escapeHtml(n)}</button>`).join('')}</div>
        ${list.length ? `<div class="msn-hist">${list.map(x => `<div class="msn-h">
            <span class="rd">${x.round}차</span>
            <span class="tx">${escapeHtml(x.text)} ${msnStars(x.def.lv)}${x.got ? `<small>${escapeHtml(x.got)}</small>` : ''}</span>
            ${msnStateHtml(x)}</div>`).join('')}</div>` : '<div class="msn-empty">아직 받은 미션이 없습니다.</div>'}
    </div>`;
}

function missionListCard() {
    return `<div class="msn-card">
        <div class="msn-head"><span>미션 목록</span><span class="msn-sub">무작위 · 난이도만큼 포인트</span></div>
        ${[1, 2, 3].map(lv => `<div class="msn-lv">
            <div class="msn-lv-head">${msnStars(lv)} ${MISSION_LEVELS[lv].name} <span class="msn-pts">${lv}점</span></div>
            ${MISSION_DEFS.filter(d => d.lv === lv).map(d => `<div class="msn-lv-item"><b>${escapeHtml(missionText(d, null))}</b><span>${escapeHtml(d.how)}</span></div>`).join('')}
        </div>`).join('')}
        <div class="msn-foot">'파'는 파 이하(버디 포함), '더블보기'·'트리플 보기'는 그 이상까지 셉니다. ○○는 미션을 받을 때 무작위로 정해지는 다른 멤버이며, 대결 미션은 동률이면 실패입니다. 본인 또는 대상 멤버의 기록이 없는 라운드(불참)는 판정하지 않습니다.</div>
    </div>`;
}

function renderMissionPage() {
    const box = document.getElementById('missionPage');
    if (!box || typeof golfers === 'undefined' || missionRoll) return;
    const me = localStorage.getItem('jtfag_my_name');
    const html = missionTargetCard(me) + missionLastResultCard() + missionRankCard(me) + missionMulliganCard(me) + missionHistoryCard(me) + missionListCard();
    // 같으면 갈아 끼우지 않는다 — 남의 저장마다 renderAll이 돈다
    if (html === missionLastHtml) return;
    missionLastHtml = html;
    box.innerHTML = html;
}

function selectMissionPerson(name) {
    if (!golfers.includes(name)) return;
    missionViewName = name;
    renderMissionPage();
}

// ── 결과 발표 ─────────────────────────────────────────────
// 스코어카드가 판독되어 미션이 판정된 차수가 새로 생기면 한 번 띄운다(기기마다 · `jtfag_mission_seen`).
// 처음 보는 기기는 조용히 기억만 한다(계급 결과 발표와 같은 규칙). 클래스 `reveal-overlay`를 같이 달아
// 다른 연출(카운트업·계급 변동·뱃지 획득)이 이 창이 닫힐 때까지 기다리게 한다.
function checkMissionReveal() {
    if (typeof isLoaded !== 'undefined' && !isLoaded) return;
    if (typeof entranceBlocked === 'function' && entranceBlocked()) return;
    if (document.querySelector('.reveal-overlay, .celebrate-overlay, .bdg-unlock')) return;
    const judged = missionRounds().filter(r => roundHasHoles(r) && golfers.some(g => { const x = missionResult(r, g); return x && (x.state === 'ok' || x.state === 'fail'); }));
    if (!judged.length) return;
    const r = judged[judged.length - 1];
    const key = 'jtfag_mission_seen';
    const seen = parseInt(localStorage.getItem(key), 10);
    if (seen === r) return;
    try { localStorage.setItem(key, String(r)); } catch (e) {}
    if (!Number.isFinite(seen)) return;
    revealMissionResult(r);
}

function revealMissionResult(r) {
    const rows = golfers.map(g => missionResult(r, g)).filter(x => x && (x.state === 'ok' || x.state === 'fail'));
    rows.sort((a, b) => (b.ok - a.ok) || (b.def.lv - a.def.lv));
    const okN = rows.filter(x => x.ok).length;
    const STEP = 0.35;
    // 이 차수로 멀리건 사용권이 늘어난 사람
    const before = g => Math.floor(missionLog(g).filter(x => x.round < r && x.ok).reduce((t, x) => t + x.def.lv, 0) / MULLIGAN_STEP);
    const after = g => Math.floor(missionLog(g).filter(x => x.round <= r && x.ok).reduce((t, x) => t + x.def.lv, 0) / MULLIGAN_STEP);
    const gained = golfers.filter(g => after(g) > before(g));
    const kings = missionKings();
    const tail = 0.5 + rows.length * STEP;
    const o = document.createElement('div');
    o.className = 'reveal-overlay msn-poster';
    o.innerHTML = `
        <div class="mp-num" aria-hidden="true">${String(r).padStart(2, '0')}</div>
        <div class="mp-ey">MISSION RESULT</div>
        <div class="mp-title">${r}차전<br>미션 결과</div>
        <div class="mp-rows">${rows.map((x, i) => `<div class="mp-row${x.ok ? '' : ' fail'}" style="animation-delay:${0.5 + i * STEP}s">
            <span class="mk">${x.ok ? '✓' : '✕'}</span>
            <div class="b"><div class="n">${escapeHtml(x.g)}</div><div class="m">${escapeHtml(x.text)} · <b>${escapeHtml(x.got)}</b></div></div>
            <span class="p">${x.ok ? '+' + x.def.lv : '실패'}</span></div>`).join('')}</div>
        <div class="mp-sum" style="animation-delay:${tail}s">
            <span><b>${okN}명 성공</b>${kings.length ? ` · 미션 포인트 1위 <b>${kings.map(escapeHtml).join(', ')} ${missionSeasonPoints(kings[0])}점</b>` : ''}</span>
            ${gained.map(g => `<span class="mp-gain">🎟️ <b>${escapeHtml(g)}</b> 멀리건 사용권 +1</span>`).join('')}
        </div>
        <div class="mp-tap" style="animation-delay:${tail + 0.5}s">화면을 누르면 넘어갑니다</div>`;
    document.body.appendChild(o);
    requestAnimationFrame(() => o.classList.add('on'));
    const timer = okN && typeof dropConfetti === 'function' ? setTimeout(() => dropConfetti(o, 40, ['#e8c66a', '#ffffff', '#9fb9e6', '#fde68a']), tail * 1000) : null;
    o.onclick = () => {
        clearTimeout(timer);
        o.classList.remove('on');
        setTimeout(() => { o.remove(); if (typeof afterRevealEffects === 'function') afterRevealEffects(); }, 300);
    };
}
