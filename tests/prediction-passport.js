// node tests/prediction-passport.js — 가상 시각·저장 응답, 외부 요청·실제 저장 없음.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const src = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
const tick = () => new Promise(setImmediate);
function make() {
    let now = Date.parse('2026-10-26T06:00:00+09:00');
    const store = new Map([['jtfag_my_name', '신성호']]), toasts = [], saves = [], timers = [];
    const host = { innerHTML: '', _html: '' };
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const ctx = { console, Intl, Math, Date: Clock, Set, Map,
        localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)) },
        document: { activeElement: null, getElementById: id => id === 'predictionHost' ? host : null },
        setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {},
        supabase: { createClient: () => ({}) },
        showToast: msg => toasts.push(msg),
        syncToSupabase: data => new Promise(resolve => saves.push({ data: plain(data), resolve })),
        escapeHtml: value => String(value == null ? '' : value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x])),
        tripEditing: null, renderTripPage() {}, refreshTripPage() {}, switchTrip() {}, findTrip: () => null,
        allTrips: () => [], tripDays: t => t.days || [], noRound: d => d.golf === 'no',
        kstToday: () => '2026-10-26', subCourseOf: () => '',
        MSN_CHEVRON: '<svg></svg>' };
    ctx.window = ctx; vm.createContext(ctx);
    const run = code => vm.runInContext(code, ctx);
    ['stats.js', 'api.js', 'prediction.js', 'passport.js'].forEach(name => run(src(name)));
    ctx.syncToSupabase = data => new Promise(resolve => saves.push({ data: plain(data), resolve }));
    run(`appData={...getDefaultData(),totalRounds:11,nextRoundNo:11,nextRoundISO:'2026-10-26',nextRoundDate:'10월 26일 오전 7:00 디오션CC',roundCourses:{11:'디오션CC'},scores:Object.fromEntries(golfers.map(g=>[g,Array(11).fill('')]))};leagueReadReady=true;isLoaded=true;`);
    return { ctx, run, store, host, toasts, saves, timers, setNow: n => { now = Date.parse(n); } };
}
function event(m, changes = {}) {
    return { id: 'p_test_00001', round: 11, player: '신성호', first: '신성호', eagle: '신성호', birdies: 3,
        at: Date.parse('2026-10-26T06:00:00+09:00'), deadline: Date.parse('2026-10-26T07:00:00+09:00'), course: '디오션CC', ...changes };
}
function setEvent(m, e) { m.ctx.fixture = e; m.run('appData.predictions = {[fixture.id]: fixture}'); }
function newHoles(m) {
    m.run(`ROUND_HOLES['11']={par:Array(18).fill(4),rel:Object.fromEntries(golfers.map(g=>[g,Array(18).fill(0)]))};
        ROUND_HOLES['11'].rel['신성호'][1]=-1;ROUND_HOLES['11'].rel['김지명'][1]=-1;ROUND_HOLES['11'].rel['이관교'][12]=-1;
        rankedRoundsList=[10];golferRankHistory=Object.fromEntries(golfers.map(g=>[g,[g==='신성호'?0:1]]));`);
}
async function main() {
    const m = make(), r = m.run;
    assert.equal(r('predictionSchedule().deadline'), Date.parse('2026-10-26T07:00:00+09:00'));
    r("appData.nextRoundDate='10월 26일 오후 12:00 디오션CC'");
    assert.equal(r('predictionSchedule().deadline'), Date.parse('2026-10-26T12:00:00+09:00'));
    r("appData.nextRoundDate='10월 26일 오전 12:00 디오션CC'");
    assert.equal(r('predictionSchedule().deadline'), Date.parse('2026-10-26T00:00:00+09:00'));
    r("appData.nextRoundDate='시간 미정'"); assert.equal(r('predictionSchedule()'), null);
    r("appData.nextRoundDate='10월 26일 오전 7:00 디오션CC';renderPredictionCard()");
    assert.match(m.host.innerHTML, /aria-expanded="false"/);
    assert.doesNotMatch(m.host.innerHTML, /pred-start/);
    r('togglePrediction();editPrediction(11)');
    r("predictionDraft.first='신성호';predictionDraft.eagle='신성호';predictionDraft.birdies='0'");
    const saving = r('savePrediction()'); await tick();
    assert.equal(m.saves.length, 1);
    assert.equal(m.toasts.some(x => x.startsWith('✅')), false);
    assert.equal(m.store.has('jtfag_prediction_mine_v1'), false);
    m.saves[0].resolve(true); await saving;
    assert.equal(r("predictionLatest(11,'신성호').birdies"), 0);
    assert.equal(m.toasts.some(x => x.startsWith('✅')), true);
    assert.ok(m.store.has('jtfag_prediction_mine_v1'));
    const original = plain(r("predictionLatest(11,'신성호')"));
    r("editPrediction(11);predictionDraft.birdies='3'");
    const failed = r('savePrediction()'); await tick(); m.saves[1].resolve(false); await failed;
    assert.equal(r("predictionLatest(11,'신성호').birdies"), 0, 'failed edit preserves last saved version');
    assert.equal(Object.keys(plain(r('appData.predictions'))).length, 1);
    r("predictionDraft.birdies='-1'"); await r('savePrediction()');
    r("predictionDraft.birdies='1.5'"); await r('savePrediction()');
    r("predictionDraft.birdies='73'"); await r('savePrediction()');
    assert.equal(m.saves.length, 2);
    r("predictionDraft.birdies='3';leagueReadReady=false"); await r('savePrediction()');
    assert.equal(m.saves.length, 2); r('leagueReadReady=true');
    m.setNow('2026-10-26T07:00:00+09:00'); await r('savePrediction()');
    assert.equal(m.saves.length, 2, 'deadline is exclusive');
    r("appData.nextRoundDate='10月 26일 오후 3:00 디오션CC'");
    assert.equal(r('predictionSchedule().deadline'), original.deadline, 'postponing cannot reopen an existing prediction');
    r('renderPredictionCard()'); assert.doesNotMatch(m.host.innerHTML, /id="predictionBirdies"/);
    assert.equal(r('predictionAnswers(11)'), null);
    newHoles(m);
    assert.deepEqual(plain(r('predictionAnswers(11)')), { first:['김지명','신성호'], firstHole:2, birdies:3, eagle:['신성호'] });
    setEvent(m, event(m));
    assert.equal(r("predictionResult(predictionLatest(11,'신성호')).points"), 6);
    assert.equal(r('predictionRanks(2026).find(x=>x.player==="신성호").points'), 6);
    m.ctx.newer = event(m, { id:'p_test_00002', at:original.at + 100, birdies:0 });
    r('appData.predictions[newer.id]=newer');
    assert.equal(r('predictionRanks(2026).find(x=>x.player==="신성호").points'), 4, 'editing counts latest only');
    r("ROUND_HOLES['11'].rel['신성호'][1]=0;ROUND_HOLES['11'].rel['김지명'][1]=0;ROUND_HOLES['11'].rel['이관교'][12]=0");
    assert.deepEqual(plain(r('predictionAnswers(11).first')), ['none']);
    m.ctx.none = event(m, { first:'none', birdies:0 }); setEvent(m, m.ctx.none);
    assert.equal(r("predictionResult(predictionLatest(11,'신성호')).points"), 6);
    r("ROUND_HOLES['11'].rel['이관교'][0]=-2"); assert.equal(r('predictionAnswers(11).birdies'), 0, 'eagle is not a birdie');
    r("ROUND_HOLES['11'].rel['박승수'].pop()"); assert.equal(r('predictionAnswers(11)'), null);
    const empty = make(); empty.store.set('jtfag_prediction_mine_v1', JSON.stringify({[original.id]: original}));
    assert.equal(empty.run('mergePredictionData(null)'), true);
    assert.equal(empty.run('mergePredictionData(null)'), false, 'merge converges');
    empty.ctx.prev = { predictions: { p_other_00001: event(empty, {id:'p_other_00001',player:'이관교'}) } };
    assert.equal(empty.run('mergePredictionData(prev)'), true);
    assert.equal(Object.keys(empty.run('appData.predictions')).length, 2);
    empty.ctx.bad = { predictions: { invalid: event(empty, {at:original.deadline}) } };
    assert.equal(empty.run('mergePredictionData(bad)'), false);
    empty.run('togglePrediction()');
    assert.match(empty.host.innerHTML, /이관교<\/b><span>참여 완료 · 마감 후 공개/);
    empty.setNow('2026-10-26T07:00:00+09:00'); empty.run('renderPredictionCard()');
    assert.doesNotMatch(empty.host.innerHTML, /참여 완료 · 마감 후 공개/);
    assert.equal(empty.run(`predictionYear({deadline:Date.parse('2026-12-31T16:00:00Z')})`), 2027);
    console.log('PASS: 예측 세 항목·각 2점, 첫 버디 공동 정답·버디 없음·정확한 총개수·기존 독수리 이력 판정');
    console.log('PASS: 마감·시간 변환·늦은 수정 차단, 편집 중복 점수 방지, 저장 완료 대기·실패 복구·낡은 자료 병합');

    const calc = make();
    calc.ctx.document.querySelector = () => null;
    calc.ctx.document.querySelectorAll = () => [];
    vm.runInContext(src('calc.js'), calc.ctx);
    calc.run(`appData.totalRounds=10;appData.scores=Object.fromEntries(golfers.map(g=>[g,Array.from({length:10},(_,i)=>grossFromHoles(i+1,g))]));processAllRoundSettlements()`);
    for (let round = 3; round <= 10; round++) {
        assert.deepEqual(plain(calc.run(`predictionAnswers(${round}).eagle`)), plain(calc.run(`golfers.filter(g=>cachedRoundRankProfit[g][${round - 1}]===0)`)));
    }
    console.log('PASS: 실제 3~10차 계급 정산의 독수리와 예측 정답 일치');

    const p = make(), q = p.run;
    q(`appData.totalRounds=10; appData.roundCourses={1:'함평엘리체CC',2:'함평 다이너스티',3:'어등산CC',4:'골프존카운티무등산CC',5:'무등산CC',6:'화순CC',7:'화순엘리체CC',8:'골드레이크CC',9:'어등산CC',10:'JNJ골프리조트'};
      appData.scores=Object.fromEntries(golfers.map(g=>[g,Array(10).fill('999')]));`);
    const snapshot = q('JSON.stringify(appData)');
    const data = plain(q('passportData()'));
    assert.equal(data.rounds, 10); assert.equal(data.groups.length, 7);
    assert.equal(data.groups.find(g => g.key === '함평엘리체').visits.length, 2);
    assert.equal(data.groups.find(g => g.key === '무등산').visits.length, 2);
    assert.ok(data.groups.find(g=>g.key==='화순')); assert.ok(data.groups.find(g=>g.key==='화순엘리체'));
    const g = data.groups.find(g=>g.key==='함평엘리체');
    for (const name of q('golfers')) assert.equal(g.best[name], Math.min(q(`grossFromHoles(1,${JSON.stringify(name)})`),q(`grossFromHoles(2,${JSON.stringify(name)})`)));
    assert.equal(q('JSON.stringify(appData)'), snapshot, 'passport derives without mutating data');
    assert.equal(q('passportRoundDate(1)'), '');
    q("appData.roundDates={1:'2026-01-03'}"); assert.equal(q('passportRoundDate(1)'), '2026-01-03');
    p.ctx.allTrips = () => [{id:'future',title:'예정 여행',days:[{date:'2026-10-27',course:'새 골프장CC'},{date:'2026-10-28',course:'무등산CC'},{date:'2026-10-29',course:'라운드없음CC',golf:'no'}]}];
    let html = q('passportHtml()'); assert.match(html, /새 골프장CC/); assert.doesNotMatch(html, /라운드없음CC/);
    assert.equal(q('passportData().groups.length'), 7, 'scheduled courses never earn stamps');
    q('openPassport(0)'); html = q('passportHtml()'); assert.match(html, /멤버별 개인 최고 기록/); assert.match(html, /방문 이력/);
    q('closePassportDetail();checkPassportStamps()'); assert.equal(p.toasts.length, 0, 'first device load is quiet');
    q("appData.roundCourses[10]='새로운골프장CC';checkPassportStamps()");
    assert.equal(p.toasts.length, 1); assert.match(p.toasts[0], /새로운골프장/);
    q('checkPassportStamps()'); assert.equal(p.toasts.length, 1, 'stamp notification deduplicates');
    assert.ok(JSON.parse(p.store.get('jtfag_passport_new_v1')).includes('새로운골프장'));
    q('passportHtml();openPassport(0)');
    assert.ok(!JSON.parse(p.store.get('jtfag_passport_new_v1')).includes('새로운골프장'), 'NEW clears after opening the stamp');
    q("appData.roundCourses[10]='<script>bad</script>CC';passportSelected=''");
    html = q('passportHtml()'); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
    q("appData.roundCourses={};appData.courses=[];ROUND_HOLES['1'].course='어등-송정'");
    assert.equal(q('passportCourse(1)'), '', 'sub-course alone is not a club');
    const before = q('passportData().rounds'); q("ROUND_HOLES['2'].rel['신성호'].pop()");
    assert.equal(q('passportData().rounds'), before - 1, 'partial scorecards do not earn stamps');
    console.log('PASS: 완료 라운드만 도장·별칭 병합·클럽 구분·실제 홀 기록의 개인 최고타·입력값 불변');
    console.log('PASS: 예정 방문 분리·날짜 없는 기록·상세 화면·신규 알림 중복 방지·사용자 문구 HTML 이스케이프');
}
if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; });
module.exports = { make, event, setEvent, newHoles };
