// node tests/season.js — 시즌(연도) 단위 리셋과 연말 시상 규칙 검증. 가상 시계·가상 기록만 쓰고 실제 서버·알림은 안 쓴다.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { make } = require('./prediction-passport');
const source = name => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));

const SCORES = {
    '김지명': [87,87,86,86,85,84,88,83,91,93,82,88,92,86],
    '박승수': [96,96,88,90,98,93,93,94,103,96,97,106,103,99],
    '신성호': [88,85,85,93,90,90,92,99,95,92,91,90,87,102],
    '이관교': [90,83,97,92,92,90,86,89,85,84,83,97,95,88]
};
function build() {
    const m = make();
    m.ctx.document.querySelector = () => null;
    m.ctx.document.querySelectorAll = () => [];
    ['calc.js', 'mission.js', 'awards.js'].forEach(f => vm.runInContext(source(f), m.ctx, { filename: f }));
    m.setNow('2026-11-02T12:00:00+09:00');
    m.ctx.S = SCORES;
    m.run(`appData.totalRounds=14;
        appData.scores=Object.fromEntries(golfers.map(g=>[g,S[g].slice()]));
        appData.roundMoney=Array.from({length:14},()=>Object.fromEntries(golfers.map(g=>[g,{start:100000,end:90000}])));
        appData.roundDates={};
        // 지난 시즌 기록의 홀 기록·미션은 이 시험이 보는 것이 아니다
        missionLog=()=>[];specialMissionLog=()=>[];`);
    return m;
}

const m = build(), run = m.run;

// 1) 시즌 소속 — 날짜가 없으면 앞 차수를 따른다(처음은 2026), 새 해의 날짜가 나오면 그 뒤는 모두 새 시즌
assert.equal(run('seasonMap().join()'), Array(14).fill(2026).join());
run("appData.totalRounds=16;golfers.forEach(g=>{appData.scores[g].push(90,90);appData.roundMoney.push(Object.fromEntries(golfers.map(x=>[x,{start:1,end:1}])),Object.fromEntries(golfers.map(x=>[x,{start:1,end:1}])))});appData.roundDates={15:'2027-03-01'}");
assert.equal(run('seasonMap().slice(12).join()'), '2026,2026,2027,2027', '16차는 날짜가 없어도 앞 차수(2027)를 따른다');
assert.equal(run('seasonOfRound(14)'), 2027);
assert.equal(run('seasonRoundIdx(2027).join()'), '14,15');

// 2) 마지막 차수 지정 — 그 번호까지는 그 시즌, 그 뒤는 날짜와 상관없이 다음 시즌
run("appData.roundDates={};appData.seasonFinal={2026:12}");
assert.equal(run('seasonMap().slice(10).join()'), '2026,2026,2027,2027,2027,2027');
run("appData.seasonFinal={2026:0}");   // 해제는 0
assert.equal(run('seasonMap().slice(12).join()'), '2026,2026,2026,2026');
run('appData.seasonFinal={};appData.totalRounds=14;golfers.forEach(g=>{appData.scores[g].length=14});appData.roundMoney.length=14');

// 3) 마무리 — 12월 31일 자정(한국 시각)이 지나면 열린다. 그 전에는 안내 문구
m.setNow('2026-12-31T23:59:00+09:00');
assert.equal(run('seasonClosed(2026)'), false);
assert.equal(run('currentSeason()'), 2026);
assert.match(run('seasonPendingText(2026)'), /결과 발표는 2026 시즌이 마무리된 후 발표됩니다/);
m.setNow('2027-01-01T00:00:00+09:00');
assert.equal(run('seasonClosed(2026)'), true);
assert.equal(run('seasonClosedWhy(2026)'), 'date');
assert.equal(run('currentSeason()'), 2027, '해가 바뀌면 지금 시즌은 2027');
assert.equal(run('closedSeasons().join()'), '2026');
assert.equal(run('seasonTabs().join()'), '2026,2027');
m.setNow('2026-11-02T12:00:00+09:00');
console.log('PASS: 시즌 소속(날짜 없으면 앞 차수 · 새 해 날짜 · 마지막 차수 지정/해제)과 12월 31일 마무리·안내 문구');

// 4) 마지막 차수 + 스코어 등록 + 정산 입력이 끝나야 열린다
run("appData.seasonFinal={2026:14};appData.roundMoney[13]=Object.fromEntries(golfers.map(g=>[g,{start:100000,end:0}]))");
assert.equal(run('seasonClosed(2026)'), false, '정산(남은 금액)이 비어 있으면 아직 안 열린다');
run("appData.roundMoney[13]['신성호'].end=110000");
assert.equal(run('seasonClosed(2026)'), false, '한 명이라도 비면 아직');
run("appData.roundMoney[13]=Object.fromEntries(golfers.map(g=>[g,{start:100000,end:110000}]))");
assert.equal(run('seasonClosed(2026)'), true);
assert.equal(run('seasonClosedWhy(2026)'), 'final');
assert.equal(run('currentSeason()'), 2027, '마지막 차수 정산이 끝나면 곧바로 새 시즌');
run("appData.scores['박승수'][13]=''");   // 스코어가 빠지면 다시 닫힘(확인 도장이 없을 때)
assert.equal(run('seasonClosed(2026)'), false);
run("appData.scores['박승수'][13]=99;appData.seasonFinal={}");
assert.equal(run('seasonClosed(2026)'), false);
console.log('PASS: 마지막 차수 지정 시 스코어 등록 + 네 명 정산 입력이 끝나야 마무리, 곧바로 새 시즌');

// 5) 마무리 확인 도장은 한 번만 적고(저장 1회), 나중에 조건이 깨져도 시즌이 다시 열리지 않는다
run("appData.seasonFinal={2026:14}");
m.saves.length = 0;
assert.equal(run('noteSeasonShut()'), true);
assert.deepEqual(plain(run('appData.seasonShut')), { 2026: '2026-11-02' });
assert.equal(m.saves.length, 1);
assert.equal(run('noteSeasonShut()'), false, '이미 적혀 있으면 헛저장이 없다');
assert.equal(m.saves.length, 1);
run("appData.roundMoney[13]=Object.fromEntries(golfers.map(g=>[g,{start:100000,end:0}]))");
assert.equal(run('seasonClosed(2026)'), true, '정산을 고쳐도 한 번 열린 시즌은 그대로');
run('appData.seasonShut={}');

// 6) 낡은 폰이 덮어써서 빠진 지정·도장은 앞 상태에서 되살린다(해제는 0이라 되살아나지 않는다)
run("appData.seasonFinal={};appData.seasonShut=undefined;appData.seasonSpecial=undefined");
m.ctx.PREV = { seasonFinal: { 2026: 14 }, seasonShut: { 2026: '2026-11-05' }, seasonSpecial: { 2026: { name: '신성호', note: '총무' } } };
assert.equal(run('mergeSeasonData(PREV)'), true);
assert.deepEqual(plain(run('[appData.seasonFinal, appData.seasonShut, appData.seasonSpecial]')), [{ 2026: 14 }, { 2026: '2026-11-05' }, { 2026: { name: '신성호', note: '총무' } }]);
run('appData.seasonFinal={2026:0}');
run('mergeSeasonData(PREV)');
assert.equal(run('appData.seasonFinal[2026]'), 0, '해제(0)를 낡은 값이 되돌리지 못한다');
run('appData.seasonFinal={};appData.seasonShut={};appData.seasonSpecial={}');
console.log('PASS: 마무리 도장 한 번만 · 합치기 되살림 · 해제 보존');

// 7) 시상 — 2026 실제 기록(14경기) 기준: 대상은 계급 점수 20 동점 → 평균 타수가 낮은 김지명
m.ctx.MISSION = { '이관교': 12, '김지명': 9, '신성호': 4, '박승수': 3 };
run("missionSeasonGained=(g)=>MISSION[g];appData.roundMoney[13]['이관교'].donate=150000;appData.seasonSpecial={2026:{name:'신성호',note:'총무 수고'}};processAllRoundSettlements()");
const aw = plain(run('computeAwards(2026)'));
const by = id => aw.awards.find(a => a.id === id);
assert.deepEqual(aw.grand.holders, ['김지명'], '대상 동점이면 평균 타수가 낮은 쪽');
assert.equal(aw.grand.tieBroken, true);
assert.deepEqual(aw.grand.rows.map(r => [r.g, r.points]), [['김지명', 20], ['이관교', 20], ['신성호', 17], ['박승수', 15]]);
assert.equal(aw.grand.ranked, 12);
assert.deepEqual(by('avg').holders, ['김지명']);
assert.match(by('avg').metric, /시즌 평균 87\.0타/);
assert.deepEqual(by('rave').holders, ['김지명']);
assert.match(by('rave').metric, /11차 82타/);
assert.deepEqual(by('eagle').holders, ['이관교']);
assert.deepEqual(by('mission').holders, ['이관교']);
assert.deepEqual(by('life').holders, ['박승수'], '인생경기상 = 평균보다 가장 낮게 친 한 라운드');
assert.match(by('life').metric, /3차 88타 · 시즌 평균\(96\.6타\)보다 8\.6타 낮음/);
assert.deepEqual(by('devote').holders, ['이관교'], '헌신왕 = 찬조 최다');
assert.match(by('devote').metric, /찬조 150,000원/);
console.log('기부왕', by('donor').holders, by('donor').metric, by('donor').rows.map(r => r.g + r.v).join(' '));
assert.deepEqual(by('donor').holders, ['박승수'], '기부왕 = 잃거나 쓴 돈(계급·타수 + 찬조) 최다');
assert.match(by('donor').metric, /^잃거나 쓴 돈 660,000원$/);
assert.equal(by('donor').rows.find(r => r.g === '이관교').v, 640000, '이관교 = 정산 손실 490,000 + 찬조 150,000');
assert.deepEqual(by('merit').holders, ['신성호']);
assert.equal(by('merit').metric, '총무 수고');
assert.equal(aw.awards.length, 9);
// 공로상을 안 정하면 수상자가 없다
run('appData.seasonSpecial={}');
assert.deepEqual(plain(run('computeAwards(2026)')).awards.find(a => a.id === 'merit').holders, []);
console.log('PASS: 대상(계급 점수·동점 시 평균 타수)과 부문 수상자 · 공동 수상 · 공로상 지정');

// 8) 시즌 리셋 — 2027 첫 라운드(15차)가 생기면 요약·찬조·계급 합이 새로 시작하고, 목표 타수는 이어진다
run("appData.totalRounds=15;appData.roundDates={15:'2027-03-01'};golfers.forEach((g,i)=>{appData.scores[g].push([88,86,90,95][i])});appData.roundMoney.push(Object.fromEntries(golfers.map(g=>[g,{start:100000,end:90000}])));appData.roundMoney[14]['박승수'].donate=20000;appData.seasonFinal={}");
m.setNow('2027-03-05T12:00:00+09:00');
assert.equal(run('currentSeason()'), 2027);
assert.equal(run("donationOf('이관교')"), 0, '올해 찬조는 0에서 다시');
assert.equal(run("donationOf('이관교', 2026)"), 150000, '지난 시즌 찬조는 그대로 보관');
assert.equal(run("donationOf('박승수')"), 20000);
run('processAllRoundSettlements()');
assert.equal(run("Object.keys(cachedRoundRankProfit['김지명']).length"), 13, '계급 이력은 차수 번호대로 이어진다');
const cur = plain(run('computeAwards(2027)'));
assert.equal(cur.stats['김지명'].ranked, 1);
assert.equal(cur.stats['김지명'].counts.reduce((a, b) => a + b, 0), 1, '2027 계급 횟수는 15차 하나');
assert.equal(plain(run('computeAwards(2026)')).grand.holders[0], '김지명', '2026 결과는 2027 기록에 안 흔들린다');
console.log('PASS: 새 시즌에 찬조·계급 횟수가 0에서 시작하고, 지난 시즌 시상은 그대로이며 차수 번호가 이어진다');

// 9) 이 기기에서 처음 보는 시상식만 한 번 띄운다
// 날짜(12/31)만 지난 시즌은 저절로 안 뜬다 — 시상식은 식사 자리에서 발표하므로 관리자가 마지막 차수를 지정해야 뜬다
run('appData.seasonFinal={}');
assert.equal(run('seasonClosed(2026)'), true);
assert.equal(run('awardsUnseenYear()'), 0, '마지막 차수 지정이 없으면 자동으로 안 뜸');
run('appData.seasonFinal={2026:14}');
assert.equal(run('awardsUnseenYear()'), 2026, '마지막 차수를 지정하면 뜸');
run('markAwardsSeen(2026)');
assert.equal(run('awardsUnseenYear()'), 0);
console.log('PASS: 시상식은 마지막 차수를 지정한 시즌만 · 기기당 한 번');
