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
    const overlays = [], frames = [];
    const document = {activeElement: null};
    class Element {
        constructor(tag = 'div', attributes = '') {
            this.tag = tag; this.nodes = []; this.events = {}; this._html = ''; this.style = {};
            this.id = (attributes.match(/\bid="([^"]*)"/) || [,''])[1];
            this.className = (attributes.match(/\bclass="([^"]*)"/) || [,''])[1];
            this.value = (attributes.match(/\bvalue="([^"]*)"/) || [,''])[1];
            this.disabled = /\bdisabled(?:\s|$)/.test(attributes);
            this.classList = {
                add: name => { this.className += ' ' + name; },
                remove: name => { this.className = this.className.split(' ').filter(x => x !== name).join(' '); }
            };
        }
        set innerHTML(html) {
            this._html = html;
            this.nodes = [...html.matchAll(/<(button|input|div|summary|section|h2)\b([^>]*)>/g)].map(x => new Element(x[1], x[2]));
        }
        get innerHTML() { return this._html; }
        all() { return this.nodes.flatMap(n => [n, ...n.all()]); }
        querySelectorAll(selector) {
            return this.all().filter(node => selector.split(',').some(part => {
                const s = part.trim().replace(':not(:disabled)', '');
                if (part.includes(':not(:disabled)') && node.disabled) return false;
                return s.startsWith('.') ? node.className.split(' ').includes(s.slice(1)) : s.startsWith('#') ? node.id === s.slice(1) : node.tag === s;
            }));
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        addEventListener(type, fn) { this.events[type] = fn; }
        focus() { document.activeElement = this; }
        blur() { if (document.activeElement === this) document.activeElement = null; }
        remove() { const i = overlays.indexOf(this); if (i >= 0) overlays.splice(i, 1); }
    }
    Object.assign(document, {
        createElement: () => new Element(),
        body: {appendChild: element => overlays.push(element)},
        getElementById: id => id === 'predictionHost' ? host : overlays.flatMap(el => el.all()).find(el => el.id === id) || null,
        querySelector: selector => overlays.map(el => el.querySelector(selector)).find(Boolean) || null
    });
    class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    const ctx = { console, Intl, Math, Date: Clock, Set, Map,
        localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, String(v)) },
        document, requestAnimationFrame: fn => frames.push(fn),
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
    return { ctx, run, store, host, toasts, saves, timers, overlays,
        frame: () => frames.splice(0).forEach(fn => fn()), setNow: n => { now = Date.parse(n); } };
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
    assert.match(m.host.innerHTML, /class="pred-participate"[^>]*>참여하기</);
    assert.doesNotMatch(m.host.innerHTML, /🔮|pred-form|msn-fold|pred-history|predictionBirdies/);
    const compact = m.host.innerHTML;
    r(m.host.innerHTML.match(/onclick="([^"]+)"/)[1]);
    const popup = r('predictionPopup');
    assert.match(popup.element.innerHTML, /role="dialog" aria-modal="true"/);
    assert.match(popup.body.innerHTML, /predictionBirdies/);
    assert.equal(m.host.innerHTML, compact, '입력 팝업을 열어도 본문 길이 유지');
    r('openPredictionPopup()'); assert.equal(m.overlays.length, 1, '중복 팝업 없음');
    m.frame(); m.frame(); assert.match(popup.element.className, /\bshow\b/);
    const input = m.ctx.document.getElementById('predictionBirdies'); input.focus();
    r("predictionDraft.birdies='0';renderPredictionCard()");
    assert.equal(m.ctx.document.getElementById('predictionBirdies'), input, '숫자 입력 중 실시간 렌더가 입력칸을 교체하지 않음');
    r("pickPrediction('first','신성호');pickPrediction('eagle','신성호')");
    assert.equal(r('predictionDraft.birdies'), '0');
    const saving = r('savePrediction()'); await tick();
    assert.equal(m.saves.length, 1);
    assert.equal(m.toasts.some(x => x.startsWith('✅')), false);
    assert.equal(m.store.has('jtfag_prediction_mine_v1'), false);
    r('closePredictionPopup()');
    assert.equal(r('predictionPopup'), popup, '저장 응답 대기 중에는 입력창 유지');
    await r('savePrediction()'); assert.equal(m.saves.length, 1, '중복 저장 차단');
    m.saves[0].resolve(true); await saving;
    assert.equal(r("predictionLatest(11,'신성호').birdies"), 0);
    assert.equal(m.toasts.some(x => x.startsWith('✅')), true);
    assert.ok(m.store.has('jtfag_prediction_mine_v1'));
    assert.equal(r('predictionPopup'), null, '저장 성공 후 팝업 닫기');
    assert.match(m.host.innerHTML, />수정하기</);
    assert.doesNotMatch(m.host.innerHTML, /pred-form|pred-person|predictionBirdies/);
    const original = plain(r("predictionLatest(11,'신성호')"));
    r("editPrediction(11);predictionDraft.birdies='3'");
    const failed = r('savePrediction()'); await tick(); m.saves[1].resolve(false); await failed;
    assert.equal(r("predictionLatest(11,'신성호').birdies"), 0, 'failed edit preserves last saved version');
    assert.equal(Object.keys(plain(r('appData.predictions'))).length, 1);
    assert.ok(r('predictionPopup'), '저장 실패 시 입력창 유지');
    assert.equal(r('predictionDraft.birdies'), '3');
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
    r('renderPredictionCard()');
    assert.doesNotMatch(r('predictionPopup.body.innerHTML'), /id="predictionBirdies"/);
    assert.match(m.host.innerHTML, />결과보기</);
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
    empty.run('openPredictionPopup()');
    assert.match(empty.run('predictionPopup.body.innerHTML'), /이관교<\/b><span>참여 완료 · 마감 후 공개/);
    assert.doesNotMatch(empty.host.innerHTML, /pred-person|pred-form/);
    empty.setNow('2026-10-26T07:00:00+09:00'); empty.run('renderPredictionCard()');
    assert.doesNotMatch(empty.run('predictionPopup.body.innerHTML'), /참여 완료 · 마감 후 공개|predictionBirdies/);
    assert.equal(empty.run(`predictionYear({deadline:Date.parse('2026-12-31T16:00:00Z')})`), 2027);
    console.log('PASS: 예측 세 항목·각 2점, 첫 버디 공동 정답·버디 없음·정확한 총개수·기존 독수리 이력 판정');
    console.log('PASS: 마감·시간 변환·늦은 수정 차단, 편집 중복 점수 방지, 저장 완료 대기·실패 복구·낡은 자료 병합');
    const cancelled = make();
    cancelled.run('openPredictionPopup()');
    cancelled.run("predictionDraft.birdies='4';cancelPrediction()");
    assert.equal(cancelled.run('predictionPopup'), null);
    assert.equal(cancelled.run('predictionDraft'), null);
    assert.equal(cancelled.saves.length, 0);
    cancelled.run('openPredictionPopup()');
    cancelled.run('predictionPopup.element').events.keydown({key:'Escape',preventDefault() {}});
    assert.equal(cancelled.run('predictionPopup'), null);
    cancelled.run('openPredictionPopup()');
    const backdrop = cancelled.run('predictionPopup.element');
    backdrop.events.click({target:backdrop});
    assert.equal(cancelled.run('predictionPopup'), null);
    cancelled.run('openPredictionPopup()');
    cancelled.store.set('jtfag_my_name','이관교'); cancelled.run('renderPredictionCard()');
    assert.equal(cancelled.run('predictionPopup'), null, '이름 변경 시 이전 사람 입력창 닫기');
    assert.equal(cancelled.saves.length, 0);
    const keyboard = make(), viewportEvents = new Map();
    keyboard.ctx.innerHeight = 800;
    keyboard.ctx.visualViewport = {
        height: 800, offsetTop: 0,
        addEventListener: (event, fn) => viewportEvents.set(event, fn),
        removeEventListener: event => viewportEvents.delete(event)
    };
    keyboard.run('openPredictionPopup()');
    keyboard.ctx.visualViewport.height = 460; viewportEvents.get('resize')();
    assert.equal(keyboard.run('predictionPopup.element.style.paddingBottom'), '340px');
    assert.equal(keyboard.run("predictionPopup.element.querySelector('.pred-sheet').style.maxHeight"), '404px');
    keyboard.run('closePredictionPopup()');
    assert.equal(viewportEvents.size, 0, '창을 닫으면 키보드 감지 이벤트도 정리');
    console.log('PASS: 이모티콘 없는 참여 버튼·입력 팝업, 본문 길이 유지·취소·닫기·이름 변경 차단');

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
    const collection = q('passportHtml()');
    q('openPassport(0)');
    assert.equal(q('passportHtml()'), collection, '팝업을 열어도 도장 모음을 유지');
    html = q('passportPopup.body.innerHTML'); assert.match(html, /멤버별 개인 최고 기록/); assert.match(html, /방문 이력/);
    const detail = q('passportPopup');
    assert.match(detail.element.innerHTML, /role="dialog" aria-modal="true"/);
    assert.equal(detail.title.textContent, data.groups[0].name);
    p.frame(); p.frame(); assert.match(detail.element.className, /\bshow\b/);
    q('openPassport(0)'); assert.equal(q('passportPopup.element'), detail.element, '중복 팝업 없음');
    const closedTo = {focus() { this.focused = true; }};
    const originalGet = p.ctx.document.getElementById;
    p.ctx.document.getElementById = id => id === 'passportStamp-' + detail.key ? closedTo : originalGet(id);
    q('closePassportDetail()');
    assert.equal(q('passportPopup'), null);
    assert.equal(closedTo.focused, true, '선택한 도장으로 포커스 복귀');
    assert.doesNotMatch(detail.element.className, /\bshow\b/);
    q('openPassport(0)');
    const background = q('passportPopup.element');
    background.events.click({target:background}); assert.equal(q('passportPopup'), null);
    q('openPassport(0)');
    q('passportPopup.element').events.keydown({key:'Escape',preventDefault() {}}); assert.equal(q('passportPopup'), null);
    q('closePassportDetail();checkPassportStamps()'); assert.equal(p.toasts.length, 0, 'first device load is quiet');
    q("appData.roundCourses[10]='새로운골프장CC';checkPassportStamps()");
    assert.equal(p.toasts.length, 1); assert.match(p.toasts[0], /새로운골프장/);
    q('checkPassportStamps()'); assert.equal(p.toasts.length, 1, 'stamp notification deduplicates');
    assert.ok(JSON.parse(p.store.get('jtfag_passport_new_v1')).includes('새로운골프장'));
    q('passportHtml();openPassport(0)');
    assert.ok(!JSON.parse(p.store.get('jtfag_passport_new_v1')).includes('새로운골프장'), 'NEW clears after opening the stamp');
    // 갱신으로 목록 순서가 바뀌어도 열어 둔 골프장 키를 유지하고, 삭제되면 닫는다.
    const openedKey = q('passportPopup.key');
    newHoles(p);
    q("appData.totalRounds=11;appData.roundCourses[11]='나중방문CC';passportHtml()");
    assert.equal(q('passportPopup.key'), openedKey);
    assert.equal(q('passportGroupsShown.findIndex(g=>g.key===passportPopup.key)'), 1, '새 도장이 앞에 추가되어도 기존 골프장 유지');
    q("appData.roundCourses[10]='나중방문CC';passportHtml()");
    assert.equal(q('passportPopup'), null, '선택한 골프장이 사라지면 창 닫기');
    q("appData.roundCourses[10]='<script>bad</script>CC'");
    html = q('passportHtml()'); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
    q("appData.roundCourses={};appData.courses=[];ROUND_HOLES['1'].course='어등-송정'");
    assert.equal(q('passportCourse(1)'), '', 'sub-course alone is not a club');
    const before = q('passportData().rounds'); q("ROUND_HOLES['2'].rel['신성호'].pop()");
    assert.equal(q('passportData().rounds'), before - 1, 'partial scorecards do not earn stamps');
    console.log('PASS: 완료 라운드만 도장·별칭 병합·클럽 구분·실제 홀 기록의 개인 최고타·입력값 불변');
    console.log('PASS: 예정 방문 분리·날짜 없는 기록·상세 화면·신규 알림 중복 방지·사용자 문구 HTML 이스케이프');
    const linked = make(), tripsOpened = [];
    const trip = {id:'visited',title:'JNJ 여행',days:[{date:'2026-10-14',course:'JNJ골프리조트'}]};
    linked.ctx.allTrips = () => [trip]; linked.ctx.findTrip = id => id === trip.id ? trip : null;
    linked.ctx.switchTrip = id => tripsOpened.push(id);
    linked.run("appData.totalRounds=10;appData.roundCourses={10:'JNJ골프리조트'};appData.roundDates={10:'2026-10-14'};tripSection='passport';passportHtml();openPassport(passportGroupsShown.findIndex(g=>g.key==='jnj'))");
    assert.match(linked.run('passportPopup.body.innerHTML'), /JNJ 여행/);
    linked.run('openPassportTrip(0)');
    assert.equal(linked.run('passportPopup'), null);
    assert.equal(linked.run('tripSection'), 'schedule');
    assert.deepEqual(tripsOpened, ['visited']);
    console.log('PASS: 도장 상세 팝업·모음 유지·닫기·포커스 복귀·신규 표시 해제, 재정렬·삭제 갱신·관련 여행 이동');
}
if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; });
module.exports = { make, event, setEvent, newHoles };
