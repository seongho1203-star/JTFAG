// node tests/mulligan-popup.js — 실제 미션 함수 + 가상 DOM·저장 응답. 서버 쓰기·알림 없음.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { make } = require('./prediction-passport');
const tick = () => new Promise(setImmediate);

function setup() {
    const m = make(), doc = m.ctx.document, children = [], confirms = [], kicks = [], frames = [];
    m.ctx.requestAnimationFrame = fn => frames.push(fn);
    const page = {innerHTML: ''};
    const ownCard = {focus() { doc.activeElement = this; }};
    // 입력칸이 없는 팝업에 필요한 DOM만 모의한다.
    class Element {
        constructor() {
            this.html = ''; this.nodes = []; this.events = {}; this.disabled = false;
            this.classList = {
                add: value => { this.className += ' ' + value; },
                remove: value => { this.className = this.className.split(' ').filter(x => x !== value).join(' '); }
            };
        }
        set innerHTML(html) {
            this.html = html;
            this.nodes = [...html.matchAll(/<(button|div)\b([^>]*)>/g)].map(match => {
                const node = new Element();
                node.tag = match[1];
                node.className = (match[2].match(/class="([^"]*)"/) || [,''])[1];
                node.onclickCode = (match[2].match(/onclick="([^"]*)"/) || [,''])[1];
                return node;
            });
        }
        get innerHTML() { return this.html; }
        querySelector(selector) { return this.nodes.find(n => n.className.split(' ').includes(selector.slice(1))) || null; }
        querySelectorAll() { return this.nodes.filter(n => n.tag === 'button' && !n.disabled); }
        addEventListener(type, fn) { this.events[type] = fn; }
        focus() { doc.activeElement = this; }
        remove() { const index = children.indexOf(this); if (index >= 0) children.splice(index, 1); }
    }
    Object.assign(doc, {
        getElementById: id => id === 'missionPage' ? page : id === 'predictionHost' ? m.host : null,
        querySelector: () => ownCard,
        createElement: () => new Element(),
        body: {appendChild: el => children.push(el)}
    });
    m.ctx.showConfirmPrompt = (...args) => new Promise(resolve => confirms.push({args, resolve}));
    m.ctx.kickScorecardWorkflow = async () => { kicks.push('notify'); return true; };
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../mission.js'), 'utf8'), m.ctx);
    m.run("missionPointsRaw=g=>g==='신성호'?10:0; missionTarget=()=>({round:11,days:0}); appData.mulligans={};");
    return {...m, page, children, confirms, kicks, ownCard,
        frame() { frames.splice(0).forEach(fn => fn()); },
        finishClose() { m.timers.splice(0).forEach(timer => timer.f()); }
    };
}
function popup(m) { return m.run('missionMulliganPopup'); }
function click(m, button) { return m.run(button.onclickCode); }
function key(m, value, shiftKey = false) {
    let prevented = false;
    popup(m).element.events.keydown({key:value,shiftKey,preventDefault() { prevented = true; }});
    return prevented;
}

async function main() {
    const m = setup(), run = m.run;
    run('renderMissionPage()');
    assert.doesNotMatch(m.page.innerHTML, /class="msn-mul"|class="msn-use-btn"|>멀리건 사용권</, '별도 멀리건 카드 없음');
    assert.equal((m.page.innerHTML.match(/aria-haspopup="dialog"/g) || []).length, 1, '본인 카드만 팝업 안내');
    run("selectMissionPointPerson('이관교')");
    assert.equal(run('missionViewName'), '이관교');
    assert.equal(m.children.length, 0, '다른 멤버는 기록 선택만');
    run("openMulliganPopup('박승수')");
    assert.equal(m.children.length, 0, '타인의 팝업 직접 호출도 차단');
    run("selectMissionPointPerson('신성호')");
    let p = popup(m);
    assert.equal(m.children.length, 1);
    assert.doesNotMatch(p.element.className, /\bshow\b/);
    m.frame(); m.frame();
    assert.match(p.element.className, /\bshow\b/, '초기 프레임 후 열림 상태로 전환');
    assert.match(p.element.innerHTML, /role="dialog" aria-modal="true"/);
    assert.match(p.element.innerHTML, /<p>신성호<\/p>/);
    assert.match(p.body.innerHTML, /class="big">2<\/span>/);
    assert.equal(p.useButton.disabled, false);
    run("selectMissionPointPerson('신성호')");
    assert.equal(m.children.length, 1, '반복 클릭으로 창이 쌓이지 않음');
    const close = p.element.querySelector('.msn-mulligan-close');
    assert.equal(m.ctx.document.activeElement, close);
    assert.equal(key(m, 'Tab', true), true);
    assert.equal(m.ctx.document.activeElement, p.useButton);
    assert.equal(key(m, 'Tab'), true);
    assert.equal(m.ctx.document.activeElement, close);

    // 취소·중복 클릭: 사용 기록이나 저장 요청이 생기지 않아야 한다.
    let action = click(m, p.useButton);
    assert.equal(p.useButton.disabled, true);
    await run('useMulliganFromPopup()');
    assert.equal(m.confirms.length, 1);
    m.confirms[0].resolve(false); await action;
    assert.equal(run("mulliganUses('신성호').length"), 0);
    assert.equal(m.saves.length, 0);
    assert.equal(p.useButton.disabled, false);

    // 확인 후 기존 사용·저장 경로를 실행하고, 서버 확인 후에만 알림을 시작한다.
    action = click(m, p.useButton);
    m.confirms[1].resolve(true); await tick();
    assert.equal(run("mulliganUses('신성호').length"), 1);
    assert.equal(run("mulliganInfo('신성호').left"), 1);
    assert.match(p.body.innerHTML, /class="big">1<\/span>/);
    assert.equal(m.saves.length, 1);
    assert.equal(m.kicks.length, 0);
    assert.equal(m.toasts.some(t => t.includes('사용권을 사용했습니다')), false);
    m.saves[0].resolve(true); await action;
    assert.equal(p.useButton.disabled, true);
    assert.equal(p.useButton.textContent, '11차 사용 완료');
    assert.equal(m.kicks.length, 1);
    assert.equal(run("appData.scoreRequests.filter(x=>x.action==='멀리건' && x.by==='신성호').length"), 1);
    await run('useMulliganFromPopup()');
    assert.equal(m.confirms.length, 2, '이미 사용한 라운드는 재확인·재차감 없음');
    assert.equal(m.saves.length, 1);

    // 닫기·배경·Escape, 다시 열 때 최신 사용 현황.
    click(m, close);
    assert.equal(popup(m), null);
    assert.equal(m.children.length, 1, '닫힘 전환이 끝나기 전까지 창 유지');
    assert.doesNotMatch(p.element.className, /\bshow\b/);
    m.finishClose();
    assert.equal(m.children.length, 0);
    assert.equal(m.ctx.document.activeElement, m.ownCard);
    run("selectMissionPointPerson('신성호')");
    assert.equal(popup(m).useButton.textContent, '11차 사용 완료');
    popup(m).element.events.click({target: popup(m).useButton});
    assert.equal(m.children.length, 1, '창 내부 클릭은 닫지 않음');
    popup(m).element.events.click({target: popup(m).element});
    m.frame(); m.frame();
    assert.doesNotMatch(m.children[0].className, /\bshow\b/, '닫은 창은 대기 중인 열림 프레임으로 다시 표시되지 않음');
    m.finishClose();
    assert.equal(m.children.length, 0);
    run("selectMissionPointPerson('신성호')");
    key(m, 'Escape'); m.finishClose(); assert.equal(m.children.length, 0);

    // 실시간 갱신·사용권 없음·이름 변경을 열린 창에 반영한다.
    const live = setup();
    live.run("selectMissionPointPerson('신성호');missionPoints=()=>0;renderMissionPage()");
    assert.equal(popup(live).useButton.disabled, true);
    assert.equal(popup(live).useButton.textContent, '사용권 없음');
    assert.match(popup(live).body.innerHTML, /다음 사용권까지 <b>5점/);
    live.run('missionPoints=()=>10;renderMissionPage()');
    assert.equal(popup(live).useButton.disabled, false);
    live.store.set('jtfag_my_name', '이관교');
    live.run('renderMissionPage()');
    live.finishClose();
    assert.equal(live.children.length, 0, '본인 이름이 바뀌면 기존 창 닫기');
    assert.equal(live.saves.length, 0);

    const changed = setup();
    changed.run("selectMissionPointPerson('신성호')");
    const pending = changed.run('useMulliganFromPopup()');
    changed.store.set('jtfag_my_name', '이관교');
    changed.confirms[0].resolve(true); await pending;
    assert.equal(changed.run("mulliganUses('신성호').length + mulliganUses('이관교').length"), 0, '확인 도중 이름 변경 시 사용 차단');
    assert.equal(changed.saves.length, 0);
    assert.equal(changed.kicks.length, 0);
    changed.finishClose();
    assert.equal(changed.children.length, 0);
    console.log('PASS: 본인 카드만 멀리건 팝업, 타인은 기록 선택, 기존 별도 카드 삭제');
    console.log('PASS: 사용·취소·중복 클릭·라운드당 1회, 저장 확인 후 알림, 실시간 잔여 장수 갱신');
    console.log('PASS: 닫기·배경·Escape·포커스 복귀, 사용권 없음·이름 변경 시 사용 차단');
}
main().catch(error => {console.error(error);process.exitCode = 1;});
