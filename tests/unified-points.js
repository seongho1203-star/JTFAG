// node tests/unified-points.js — 통합 포인트·사용권·상단 카드·정산 불변 검증. 실제 서버 요청 없음.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { make, event, setEvent, newHoles } = require('./prediction-passport');
const source = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const m = make(), run = m.run;
vm.runInContext(source('mission.js'), m.ctx);
newHoles(m);
run(`missionLog=g=>g==='신성호'?[{ok:true,round:10,y:2026,lv:4},{ok:true,round:12,y:2027,lv:3}]:[];
    specialMissionLog=g=>g==='신성호'?[{round:9,y:2026,pts:10}]:[];
    missionRounds=()=>[10];missionEntry=(r,g)=>g==='신성호'?{redrawn:true,y:2026}:null;`);
const previous = run("missionPoints('신성호')");
assert.equal(previous, 15); // 일반 7 + 특별 10 - 다시 뽑기 2
setEvent(m, event(m));
assert.equal(run("predictionPoints('신성호')"), 6);
assert.equal(run("predictionPoints('신성호',2026)"), 6);
assert.equal(run("predictionPoints('신성호',2027)"), 0);
assert.equal(run("predictionPoints('신성호',undefined,10)"), 0);
assert.equal(run("missionPoints('신성호')"), previous + 6);
assert.equal(run("missionSeasonPoints('신성호')"), 18);
assert.equal(run("missionPoints('신성호',2027)"), 3);
assert.equal(run("missionPoints('신성호',undefined,10)"), 12);
assert.equal(run("missionPoints('신성호',undefined,11)"), 18);
assert.deepEqual(plain(run("mulliganInfo('신성호')")), {pts:21,earned:4,used:0,left:4,toNext:4});
run("appData.mulligans={'신성호':[{t:Date.now(),r:10}]}");
assert.equal(run("mulliganInfo('신성호').left"), 3);
assert.equal(run("redrawCheck('신성호',11).done"), true);
assert.deepEqual(plain(run('missionKings()')), ['신성호']);

// 등록 수정본을 여러 번 받아도 최신본 한 개만 합산한다.
m.ctx.edit = event(m, {id:'p_edit_00002',at:event(m).at+100,first:'박승수',birdies:0});
run('appData.predictions[edit.id]=edit');
assert.equal(run("predictionPoints('신성호')"), 2);
assert.equal(run("missionPoints('신성호')"), previous + 2);
run("missionLog=()=>[];specialMissionLog=()=>[];missionEntry=()=>({redrawn:true,y:2026})");
assert.equal(run("missionPoints('신성호')"), 0, '다시 뽑기 비용을 통합한 점수에서 차감');
run('missionEntry=()=>({redrawn:false,y:2026})');
assert.equal(run("missionPoints('신성호')"), 2);
assert.equal(run("redrawCheck('신성호',11).ok"), false, '이미 사용한 사용권을 예측 점수로 우회하지 않음');
run('appData.mulligans={}');
assert.equal(run("redrawCheck('신성호',11).ok"), true, '예측으로 얻은 점수를 다시 뽑기에 사용');

// 카드 디자인과 배치: 4명·고정 순서·선택 표시, 순위와 기존 표·별도 예측 순위 제거.
let html = run("missionPointCards('신성호')");
assert.equal((html.match(/class="bdg-person msn-point-person/g) || []).length, 4);
assert.doesNotMatch(html, /bdg-place|\d위|msn-point-title/);
const memberOrder = [...html.matchAll(/class="bdg-pname">([^<]+)</g)].map(x => x[1]);
assert.deepEqual(memberOrder, plain(run('golfers')), '포인트와 무관하게 멤버 순서를 유지');
assert.match(html, /msn-point-person on" aria-pressed="true" aria-haspopup="dialog"[^>]+onclick="selectMissionPointPerson\('신성호'\)/);
assert.match(html, /msn-point-value">2<small>점/);
assert.doesNotMatch(html, /class="msn-rk|class="msn-rank/);
const box = {innerHTML:''};
m.ctx.document.getElementById = id => id === 'missionPage' ? box : id === 'predictionHost' ? m.host : null;
for (const name of ['missionTargetCard','missionLastResultCard','specialMissionCard','missionHistoryCard','missionListCard']) m.ctx[name] = () => `<div data-test="${name}"></div>`;
run('renderMissionPage()');
assert.equal((box.innerHTML.match(/>미션 포인트</g) || []).length, 1);
assert.ok(box.innerHTML.indexOf('msn-points-card') < box.innerHTML.indexOf('predictionHost'));
assert.ok(box.innerHTML.indexOf('msn-points-card') < box.innerHTML.indexOf('missionTargetCard'));
assert.doesNotMatch(box.innerHTML, /멀리건 사용권|msn-use-btn|msn-mul"/, '기존 별도 멀리건 카드 제거');
run("selectMissionPerson('이관교')");
assert.match(box.innerHTML, /msn-point-person on" aria-pressed="true" onclick="selectMissionPointPerson\('이관교'\)/);
run('togglePrediction()');
assert.match(m.host.innerHTML, /미션 포인트에 합산/);
assert.doesNotMatch(m.host.innerHTML, /예측 전용|예측 포인트 순위/);
run('appData.predictions={}');
html = run("missionPointCards('신성호')");
assert.doesNotMatch(html, /bdg-place|\d위|msn-point-title/);
console.log('PASS: 미션·특별미션·예측 통합, 연도·차수별 합산, 수정 중복 방지·다시 뽑기 비용');
console.log('PASS: 통합 포인트로 사용권·다시 뽑기·미션왕 계산, 최상단 4인 카드·고정 순서·순위 숨김');

// 실제 기록의 금액·계급 정산은 예측 점수 유무에 영향을 받지 않는다.
const c = make();
vm.runInContext(source('calc.js'), c.ctx);
vm.runInContext(source('mission.js'), c.ctx);
c.ctx.document.querySelector = () => null;
c.ctx.document.querySelectorAll = () => [];
newHoles(c);
c.run(`appData.scores=Object.fromEntries(golfers.map(g=>[g,Array.from({length:11},(_,i)=>grossFromHoles(i+1,g))]));processAllRoundSettlements()`);
const snapshot = () => plain(c.run('({profit:cachedRoundRankProfit,net:golferFinalNetProfitMap,ranks:golferRankHistory,money:appData.roundMoney})'));
const financial = snapshot();
setEvent(c, event(c));
c.run('processAllRoundSettlements()');
assert.deepEqual(snapshot(), financial);
console.log('PASS: 예측 적중 점수가 기존 계급·금액 정산과 원본 정산 입력값에 영향 없음');
