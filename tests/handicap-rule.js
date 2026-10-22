// node tests/handicap-rule.js — 11차부터: 내 목표 타수(5경기 평균) · 보정타수 순위 · 계급벌금 2/3/4/6만 · 라베 갱신 지급.
// 1~10차 정산은 그대로인지도 함께 본다. 실제 서버 요청 없음.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const src = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));

const el = () => ({ innerHTML: '', textContent: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null, appendChild() {} });
const ctx = {
    console, Intl, Math, Date, Set, Map, JSON, Number, parseFloat, isNaN,
    localStorage: { getItem: () => null, setItem() {} },
    document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, createElement: el, addEventListener() {}, body: el() },
    window: {}, supabase: { createClient: () => ({ channel: () => ({ on() { return this; }, subscribe() {} }) }) },
    showToast() {}, renderHandicapMatchCard() {}, computeParSpecialists() {}, escapeHtml: s => String(s),
    setTimeout() {}, clearTimeout() {}, requestAnimationFrame() {}, navigator: {},
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['stats.js', 'api.js']) vm.runInContext(src(f), ctx, { filename: f });
vm.runInContext(src('calc.js'), ctx, { filename: 'calc.js' });
const run = code => vm.runInContext(code, ctx);

const G = plain(run('golfers'));
// 1~10차는 실제 기록, 11·12차는 가상 기록
const real = {};
G.forEach(g => { real[g] = run(`ROUND_HOLES ? Array.from({length:10},(_,i)=>String(grossFromHoles(i+1,${JSON.stringify(g)})||'')) : []`); });
function setup(extra) {
    const scores = {};
    G.forEach(g => scores[g] = [...real[g], ...extra[g].map(String)]);
    ctx.__sc = scores; ctx.__n = 10 + extra[G[0]].length;
    run('appData.scores = __sc; appData.totalRounds = __n; appData.roundMoney = []; calculateAndRender = calculateAndRender;');
}
// 1) 핸디캡 경기 수 — 10차까지는 2경기, 11차부터 5경기
assert.equal(run('handicapCountFor(9)'), 2);
assert.equal(run('handicapCountFor(10)'), 5);
assert.equal(run('HANDICAP_ROUNDS'), 5);

// 2) 11차 가상 기록: 목표 타수 = 6~10차 평균(내림), 보정타수 순서로 계급
const extra = { 이관교: [84], 김지명: [88], 신성호: [97], 박승수: [95] };
setup(extra);
run('processAllRoundSettlements()');
const avg = {}; G.forEach(g => { const a = real[g].slice(5, 10).map(Number); avg[g] = Math.floor(a.reduce((x, y) => x + y, 0) / 5); });
const info = plain(run('roundNetInfo[10]'));
G.forEach(g => { assert.equal(info[g].target, avg[g], g + ' 목표 타수는 6~10차 5경기 평균'); assert.equal(info[g].net, extra[g][0] - avg[g]); });
const order = [...G].sort((a, b) => (info[a].net - info[b].net) || (info[a].target - info[b].target));
const hist = plain(run('golferRankHistory'));
order.forEach((g, i) => assert.equal(hist[g].slice(-1)[0], i, `${g} 계급 ${i}`));
// 3) 계급벌금 — 11차는 2/3/4/6만, 10차는 예전 0/4/6/10만
const pen = plain(run('cachedRoundRankProfit'));
order.forEach((g, i) => assert.equal(pen[g][10], [-20000, -30000, -40000, -60000][i]));
G.forEach(g => assert.ok([0, -40000, -60000, -100000].includes(pen[g][9]), '10차는 예전 금액'));
assert.equal(G.reduce((t, g) => t + pen[g][10], 0), -150000);
assert.equal(run('rankPenaltyAt(9,3)'), -100000);
assert.equal(run('rankPenaltyAt(10,3)'), -60000);

// 4) 승수 순위와 보정타수 순위가 같다(1:1 맞대결 결과와 어긋나지 않는다) — 여러 가상 기록으로 확인
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let k = 0; k < 200; k++) {
    const ex = {}; G.forEach(g => ex[g] = [80 + Math.floor(rnd() * 25)]);
    setup(ex); run('processAllRoundSettlements()');
    const d = plain(run('h2hRoundData(10)'));
    const wins = g => G.filter(o => o !== g && run(`h2hOutcome(h2hRoundData(10), ${JSON.stringify(g)}, ${JSON.stringify(o)}).res`) === 'w').length;
    const byWins = [...G].sort((a, b) => wins(b) - wins(a));
    const h = plain(run('golferRankHistory'));
    const seq = [...G].sort((a, b) => h[a].slice(-1)[0] - h[b].slice(-1)[0]);
    // 동률(승수 같음)은 순서가 갈릴 수 있으므로 승수 열이 같은지만 본다
    assert.deepEqual(seq.map(wins), byWins.map(wins), '승수 순서와 보정타수 순서 불일치 ' + JSON.stringify(ex));
}

// 5) 라베 — 11차부터 종전 최저타(1~직전 차수)를 깬 타수 1타당 1만원
const best = {}; G.forEach(g => best[g] = Math.min(...real[g].map(Number).filter(x => x > 0)));
const ex2 = {}; G.forEach(g => ex2[g] = [best[g] + 3, best[g] - 2]);          // 11차 갱신 없음 · 12차 2타 단축
ex2[G[1]] = [best[G[1]] - 1, best[G[1]] - 1];                                    // 11차 1타 단축, 12차는 같은 타수(갱신 아님)
setup(ex2); run('processAllRoundSettlements()');
const rave = plain(run('raveAwards'));
assert.ok(!rave.some(a => a.round + 1 < 11), '10차 이전 갱신은 지급하지 않는다');
G.forEach(g => {
    if (g === G[1]) {
        assert.deepEqual(rave.filter(a => a.name === g).map(a => [a.round, a.score, a.prev, a.pay]), [[10, best[g] - 1, best[g], 10000]]);
    } else {
        assert.deepEqual(rave.filter(a => a.name === g).map(a => [a.round, a.score, a.prev, a.pay]), [[11, best[g] - 2, best[g], 20000]]);
    }
});
// 6) 라베 지급 인원
assert.deepEqual(rave.filter(a => a.round === 11).map(a => [a.payers, a.total]), [[3, 60000], [3, 60000], [3, 60000]], '동반자 셋이 각자 낸다');

// 7) 미션 실력 보정도 같은 5경기 평균(내 목표 타수와 같은 잣대)
try { vm.runInContext(src('mission.js'), ctx, { filename: 'mission.js' }); } catch (e) { console.log('mission.js 로드 건너뜀:', e.message); }
if (run('typeof missionSkill') === 'function') {
    setup({ 이관교: [], 김지명: [], 신성호: [], 박승수: [] });
    const sk = plain(run('missionSkill()'));
    G.forEach(g => assert.equal(sk[g], avg[g], g + ' 미션 실력 = 6~10차 5경기 평균'));
    assert.equal(run('MISSION_SKILL_ROUNDS'), run('HANDICAP_ROUNDS'));
}
console.log('handicap-rule: ok' + (run('typeof missionSkill') === 'function' ? ' (미션 포함)' : ''));
