// node tests/tab-new-info.js — 탭별 새 정보는 회원·기기별로 읽은 화면에만 반영한다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const store = new Map([['jtfag_my_name', '신성호']]);
const localStorage = {
    getItem: key => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value))
};
const state = {
    trips: [{ id: 'trip-one', title: '규슈 여행', days: [{ date: '2026-12-01', tee: '' }] }],
    badges: { 신성호: [{ key: 'l:firstBirdie' }], 이관교: [] },
    years: [], awards: {},
    stamps: [{ key: 'club-a', visits: [{ round: 1, date: '2026-10-01' }] }]
};
const buttons = new Map();
for (const selector of [
    '.page-tab[data-tab="badges"]', '.page-tab[data-tab="trip"]',
    '#badgePage .tc-seg button:first-child', '#badgePage .tc-seg button:last-child',
    '#tripSectionNav button:first-child', '#tripSectionNav button:last-child'
]) {
    const classes = new Set();
    const attributes = new Map();
    buttons.set(selector, {
        classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
        setAttribute: (name, value) => attributes.set(name, value),
        getAttribute: name => attributes.get(name)
    });
}
const app = { dataset: { page: 'home' } };
const document = {
    getElementById: id => id === 'appContainer' ? app : null,
    querySelector: selector => buttons.get(selector) || null
};
function makeContext() {
    const ctx = vm.createContext({
        document, localStorage, isLoaded: true, golfers: ['신성호', '이관교'],
        tripSection: 'schedule', badgeView: 'badges', badgeViewName: '신성호',
        allTrips: () => state.trips,
        collectBadges: owner => state.badges[owner],
        badgeKeysOf: sections => sections,
        closedSeasons: () => state.years,
        awardsOpen: () => true,
        computeAwards: year => state.awards[year],
        passportData: () => ({ groups: state.stamps })
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'ui-new-info.js'), 'utf8'), ctx);
    return ctx;
}
let ctx = makeContext();
const update = () => vm.runInContext('updateNewInfoIndicators()', ctx);
const unread = kind => vm.runInContext(`newInfoUnread.${kind}`, ctx);
const dot = selector => buttons.get(selector).classList.contains('has-new');
const tripTab = '.page-tab[data-tab="trip"]';
const badgeTab = '.page-tab[data-tab="badges"]';

update();
assert.equal(dot(tripTab), false, '처음 들어오면 지난 여행과 스탬프는 새 정보가 아니다');
assert.equal(dot(badgeTab), false, '기존 뱃지도 처음에는 새 정보가 아니다');
state.trips[0] = { days: [{ tee: '', date: '2026-12-01' }], title: '규슈 여행', id: 'trip-one' };
update();
assert.equal(dot(tripTab), false, '객체 키 순서가 바뀌어도 새 정보로 잘못 표시하지 않는다');

state.trips.push({ id: 'trip-two', title: '남도 여행', days: [{ date: '2027-01-01' }] });
update();
assert.equal(unread('trip'), true, '새 여행은 여행 탭에 표시한다');
assert.equal(dot('#tripSectionNav button:first-child'), true, '여행 일정 안쪽도 표시한다');
assert.match(buttons.get(tripTab).getAttribute('aria-label'), /새 정보/);

ctx = makeContext(); // 앱을 다시 열어도 기기의 확인 상태를 유지한다.
assert.equal(vm.runInContext('newInfoUnread.trip', ctx), false);
update();
assert.equal(unread('trip'), true);
app.dataset.page = 'trip';
ctx.tripSection = 'passport';
update();
assert.equal(unread('trip'), true, '스탬프만 확인하면 일정 표시는 유지한다');
ctx.tripSection = 'schedule';
update();
assert.equal(dot(tripTab), false, '일정 화면 확인 후 표시를 지운다');

ctx.tripSection = 'passport';
state.trips[0].days[0].tee = '10:30';
update();
assert.equal(unread('trip'), true, '여행 내용의 수정도 알려 준다');
ctx.tripSection = 'schedule';
update();
state.stamps.push({ key: 'club-b', visits: [{ round: 2, date: '2027-01-01' }] });
update();
assert.equal(unread('passport'), true, '새 스탬프는 여행 탭에 표시한다');
assert.equal(dot('#tripSectionNav button:last-child'), true);
ctx.tripSection = 'passport';
update();
assert.equal(unread('passport'), false);

app.dataset.page = 'home';
state.badges['신성호'].push({ key: 't:birdie:2' });
update();
assert.equal(unread('badges'), true);
app.dataset.page = 'badges';
ctx.badgeView = 'trophy';
update();
assert.equal(unread('badges'), true, '트로피 화면만 확인하면 새 뱃지는 남긴다');
ctx.badgeView = 'badges';
ctx.badgeViewName = '이관교';
update();
assert.equal(unread('badges'), true, '다른 사람의 뱃지를 볼 때는 내 알림을 지우지 않는다');
ctx.badgeViewName = '신성호';
update();
assert.equal(unread('badges'), false);

state.years.push(2026);
state.awards[2026] = { grand: { holders: ['신성호'] }, awards: [{ id: 'avg', holders: ['이관교'] }] };
update();
assert.equal(unread('trophy'), true, '시상 결과가 나오면 상단 뱃지와 내부 트로피에 표시한다');
assert.equal(dot(badgeTab), true);
assert.equal(dot('#badgePage .tc-seg button:last-child'), true);
ctx.badgeView = 'trophy';
update();
assert.equal(dot(badgeTab), false);

app.dataset.page = 'home';
localStorage.setItem('jtfag_my_name', '이관교');
update();
assert.equal(dot(badgeTab), false, '다른 회원은 기존 결과를 새 정보로 잘못 표시하지 않는다');
localStorage.setItem('jtfag_my_name', '신성호');
state.badges['신성호'].push({ key: 'l:half39' });
update();
assert.equal(dot(badgeTab), true);
store.delete('jtfag_my_name');
update();
assert.equal(dot(badgeTab), false, '이름을 해제하면 이전 회원의 표시를 지운다');
console.log('PASS: 처음 방문 · 새 여행/수정 · 스탬프 · 뱃지 · 트로피 · 화면별 확인 · 재접속 · 회원 구분');
