/* ─────────────────────────────────────────────────────────────────
   정산 금액 · 네 폰 동시 입력 검증 (CLAUDE.md '정산 금액은 따로 저장한다')

   진짜 앱 화면 넷을 띄워 Node 쪽 DB 하나를 나눠 쓰게 한다. 요청마다 무작위 지연을 줘
   저장이 DB에 닿는 순서를 섞고, 실시간은 DB에 들어간 순서대로 화면마다 따로 늦춰 뿌린다.
   한 화면에서 남의 폰을 흉내만 내는 테스트로는 이 문제를 못 잡았다 — 금액을 고치면 이걸 돌릴 것.

   실행 (저장소에 패키지 매니저가 없어 playwright-core를 따로 받는다. 브라우저는 이미 깔려 있다):
     cd /tmp && npm i playwright-core
     (저장소 루트에서) python3 -m http.server 8971 &
     NODE_PATH=/tmp/node_modules node tests/money-multi.js table     # jtfag_money 테이블이 있을 때 → 전부 ✅
     NODE_PATH=/tmp/node_modules node tests/money-multi.js payload   # 테이블이 없을 때 → 제보된 증상이 재현된다
   ───────────────────────────────────────────────────────────────── */
const { chromium } = require('playwright-core');
const fs = require('fs');
const CHROME = (() => {
  const base = '/opt/pw-browsers';
  const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  return `${base}/${dir}/chrome-linux/chrome`;
})();
const SQ = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAOUlEQVR42u3NMQEAAAgDoC251a3gLzSgmXBpVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVfUEHlYQAAFHz3PLAAAAAElFTkSuQmCC', 'base64');
const MODE = process.argv[2] || 'table';
const ok = (b, m) => { console.log(' ', b ? '✅' : '❌', m); if (!b) process.exitCode = 1; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GOLFERS = ['이관교', '김지명', '신성호', '박승수'];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));

const SEED = {
  nextRoundDate: '10월 3일 오후 5:21 무등산CC', nextRoundISO: '2026-10-03', clubFund: 79000, noticeMemo: '', totalRounds: 6,
  courses: ['함평엘리체', '함평엘리체', '어등산', '해피니스', '마제스티-펠리스', '무등산'],
  scores: { '이관교': [90, 83, 97, 92, 92, ''], '김지명': [87, 87, 86, 86, 85, ''], '신성호': [88, 85, 85, 93, 90, ''], '박승수': [96, 96, 88, 90, 98, ''] },
  roundMoney: [0, 1, 2, 3, 4, 5].map(r => Object.fromEntries(GOLFERS.map((g, i) => [g, r < 5 ? { start: 100000 * (i + 1), end: 100000 * (i + 1) + 10000 * (r + 1) } : { start: 0, end: 0 }]))),
  roundPhotos: [[], [], [], [], [], []]
};
const jsonb = v => Array.isArray(v) ? v.map(jsonb) : (v && typeof v === 'object')
  ? Object.fromEntries(Object.keys(v).sort((a, b) => a.length !== b.length ? a.length - b.length : (a < b ? -1 : 1)).map(k => [k, jsonb(v[k])])) : v;

const db = { league: JSON.parse(JSON.stringify(SEED)), money: new Map(), moneyExists: MODE === 'table', moneyWrites: 0, leagueWrites: 0 };
const pages = [];
let lat = [20, 160];                                     // 요청 지연 (ms)
let rtLat = [10, 120];                                   // 실시간 지연 (ms)

function broadcast(table, ev) {
  for (const pg of pages) {
    pg.__q = (pg.__q || Promise.resolve()).then(async () => {
      await sleep(rnd(...rtLat));
      await pg.evaluate(([t, e]) => window.__rtEmit && window.__rtEmit(t, e), [table, ev]).catch(() => {});
    });
  }
}

async function dbCall(op, table, rows, opts) {
  await sleep(rnd(...lat));
  let out;
  if (table === 'jtfag_money') {
    if (!db.moneyExists) out = { data: null, error: { message: 'relation "public.jtfag_money" does not exist', code: '42P01' } };
    else if (op === 'select') out = { data: [...db.money.values()].map(r => ({ ...r })), error: null };
    else if (op === 'upsert') {
      const list = Array.isArray(rows) ? rows : [rows];
      if (list.some(r => !GOLFERS.includes(r.name) || !['start', 'end', 'donate'].includes(r.field))) out = { error: { message: 'new row violates row-level security policy' } };
      else {
        for (const r of list) {
          const k = `${r.round}|${r.name}|${r.field}`;
          if (db.money.has(k) && opts && opts.ignoreDuplicates) continue;
          const row = { ...(db.money.get(k) || {}), ...r };
          db.money.set(k, row); db.moneyWrites++;
          broadcast('jtfag_money', { eventType: 'UPDATE', new: { ...row } });
        }
        out = { data: null, error: null };
      }
    }
  } else {
    if (op === 'selectOne') out = { data: { id: 1, payload: jsonb(JSON.parse(JSON.stringify(db.league))) }, error: null };
    else if (op === 'upsert') {
      db.league = JSON.parse(JSON.stringify(rows.payload)); db.leagueWrites++;
      broadcast('jtfag_league', { new: { payload: jsonb(JSON.parse(JSON.stringify(db.league))) } });
      out = { error: null };
    }
  }
  await sleep(rnd(...lat));
  return out;
}

const STUB = `
window.__saved = []; window.__rt = [];
window.supabase = { createClient: () => ({
  from: (table) => ({
    select: () => ({
      eq: () => ({ single: () => window.__dbCall('selectOne', table) }),
      then: (res, rej) => window.__dbCall('select', table).then(res, rej)
    }),
    upsert: (rows, opts) => {
      if (table !== 'jtfag_money') window.__saved.push(JSON.parse(JSON.stringify(rows)));
      return window.__dbCall('upsert', table, rows, opts || {});
    }
  }),
  channel: () => { const ch = { on(ev, cfg, fn) { window.__rt.push({ table: cfg.table, fn }); return ch; }, subscribe() { return ch; } }; return ch; },
  storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'x' } }), remove: async () => ({ error: null }) }) }
})};
window.__rtEmit = (table, ev) => window.__rt.filter(h => h.table === table).forEach(h => { try { h.fn(ev); } catch (e) { console.error('RT', e); } });
`;

async function openPhone(browser, name) {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  p.on('pageerror', e => console.log(`PAGEERROR[${name}]`, e.message));
  await p.exposeFunction('__dbCall', (op, table, rows, opts) => dbCall(op, table, rows, opts));
  await p.route('**/@supabase/supabase-js**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB }));
  await p.route('**/rank-icon/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: SQ }));
  await p.route('**/api.open-meteo.com/**', r => r.abort());
  await p.route('**/functions/v1/**', r => r.abort());
  await p.route('**/Sound/**', r => r.abort());
  await p.addInitScript(n => { localStorage.setItem('jtfag_my_name', n); }, name);   // 결과 발표 기록이 없으면 처음 보는 기기라 발표 창을 안 띄운다
  p.__name = name;
  pages.push(p);
  await p.goto('http://localhost:8971/index.html', { waitUntil: 'domcontentloaded' });
  return p;
}

async function settle(p) {
  await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '확인'); if (x) x.click(); });
  await sleep(300);
  await p.evaluate(() => { document.querySelectorAll('.celebrate-overlay, .reveal-overlay').forEach(o => o.remove()); });
}

const R = 5;  // 지금 정산하는 차수(0부터) = 6차
const view = p => p.evaluate(r => {
  const m = (appData.roundMoney[r]) || {};
  return Object.fromEntries(golfers.map(g => [g, { start: Number((m[g] || {}).start) || 0, end: Number((m[g] || {}).end) || 0, donate: Number((m[g] || {}).donate) || 0 }]));
}, R);
const truth = () => {
  if (db.moneyExists) {
    const o = Object.fromEntries(GOLFERS.map(g => [g, { start: 0, end: 0, donate: 0 }]));
    // 테이블에 없는 칸은 payload 값 (옛 기록)
    GOLFERS.forEach(g => ['start', 'end', 'donate'].forEach(f => {
      const row = db.money.get(`${R}|${g}|${f}`);
      o[g][f] = row ? Number(row.value) : (Number(((db.league.roundMoney[R] || {})[g] || {})[f]) || 0);
    }));
    return o;
  }
  const m = db.league.roundMoney[R] || {};
  return Object.fromEntries(GOLFERS.map(g => [g, { start: Number((m[g] || {}).start) || 0, end: Number((m[g] || {}).end) || 0, donate: Number((m[g] || {}).donate) || 0 }]));
};
const same = (a, b) => GOLFERS.every(g => ['start', 'end', 'donate'].every(f => a[g][f] === b[g][f]));
const fmt = o => GOLFERS.map(g => `${g.slice(0, 2)} ${o[g].start}/${o[g].end}${o[g].donate ? '+' + o[g].donate : ''}`).join(' · ');

async function typeOwn(p, field, v, blur = true) {
  await p.evaluate(r => { if (selectedMoneyRoundIdx !== r) changeMoneyRound(r); }, R);
  const sel = `#money_${field}_${p.__name}`;
  await p.click(sel);
  await p.keyboard.press('Control+A');
  await p.keyboard.type(String(v));
  if (blur) await p.evaluate(() => document.activeElement.blur());
}

async function converged(label, expect, waitMs = 2500) {
  await sleep(waitMs);
  const t = truth();
  const views = await Promise.all(pages.map(view));
  console.log(`   DB      : ${fmt(t)}`);
  views.forEach((v, i) => { if (!same(v, t)) console.log(`   ${pages[i].__name} 화면: ${fmt(v)}`); });
  ok(views.every(v => same(v, t)), `${label}: 네 화면이 모두 DB와 같다`);
  if (expect) {
    const miss = [];
    Object.entries(expect).forEach(([g, fields]) => Object.entries(fields).forEach(([f, v]) => { if (t[g][f] !== v) miss.push(`${g}.${f}=${t[g][f]} (기대 ${v})`); }));
    ok(miss.length === 0, `${label}: 적은 금액이 하나도 안 사라졌다` + (miss.length ? '  → ' + miss.join(', ') : ''));
  }
  return t;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  console.log(`════ 모드: ${MODE === 'table' ? '금액 테이블 있음 (분리 저장)' : '테이블 없음 (예전 payload 방식)'} ════`);
  const phones = await Promise.all(GOLFERS.map(n => openPhone(browser, n)));
  await sleep(7000);
  await Promise.all(phones.map(settle));
  const [이관교, 김지명, 신성호, 박승수] = phones;
  const mode = await Promise.all(phones.map(p => p.evaluate(() => moneyMode)));
  ok(mode.every(m => m === MODE), `네 화면 모두 '${MODE}' 모드로 떴다 (${mode.join(',')})`);

  if (MODE === 'table') {
    console.log('\n── 처음 접속: payload에 있던 지난 금액이 테이블로 옮겨진다 ──');
    const moved = [...db.money.values()].filter(r => r.rev === 'migrate').length;
    console.log(`   옮겨진 칸 ${moved}개 (지난 5개 차수 × 4명 × 시작·남은 = 40)`);
    ok(moved === 40, '지난 금액 40칸이 빠짐없이 옮겨졌다 (같은 칸을 넷이 동시에 옮겨도 한 번씩만)');
    const r0 = await 신성호.evaluate(() => appData.roundMoney[0]['김지명']);
    ok(r0.start === 200000 && r0.end === 210000, '지난 차수 금액이 그대로 보인다');
  }

  console.log('\n── 경기 시작: 넷이 같은 순간에 시작 금액 ──');
  await Promise.all([typeOwn(이관교, 'start', 100000), typeOwn(김지명, 'start', 200000), typeOwn(신성호, 'start', 300000), typeOwn(박승수, 'start', 400000)]);
  const want1 = { '이관교': { start: 100000 }, '김지명': { start: 200000 }, '신성호': { start: 300000 }, '박승수': { start: 400000 } };
  await converged('시작 금액', want1);

  console.log('\n── 경기 끝: 넷이 같은 순간에 남은 금액 + 찬조 ──');
  await Promise.all([typeOwn(이관교, 'end', 150000), typeOwn(김지명, 'end', 260000), typeOwn(신성호, 'end', 250000), typeOwn(박승수, 'end', 340000)]);
  await Promise.all([typeOwn(이관교, 'donate', 10000), typeOwn(박승수, 'donate', 30000)]);
  const want2 = { '이관교': { start: 100000, end: 150000, donate: 10000 }, '김지명': { start: 200000, end: 260000 }, '신성호': { start: 300000, end: 250000 }, '박승수': { start: 400000, end: 340000, donate: 30000 } };
  await converged('남은 금액', want2);

  console.log('\n── 한 사람이 같은 칸을 연달아 고친다 (요청이 뒤섞여 닿는다) ──');
  for (const v of [111000, 222000, 333000, 444000]) await typeOwn(김지명, 'end', v);
  want2['김지명'].end = 444000;
  await converged('연달아 고치기', want2);

  console.log('\n── 고치는 동시에 남들도 각자 고친다 ──');
  await Promise.all([
    (async () => { for (const v of [151000, 152000, 153000]) await typeOwn(이관교, 'end', v); })(),
    (async () => { for (const v of [301000, 302000]) await typeOwn(신성호, 'start', v); })(),
    typeOwn(박승수, 'end', 345000),
  ]);
  Object.assign(want2['이관교'], { end: 153000 }); Object.assign(want2['신성호'], { start: 302000 }); Object.assign(want2['박승수'], { end: 345000 });
  await converged('동시에 고치기', want2);

  console.log('\n── 실시간을 놓친 낡은 폰이 다른 걸 저장한다 (금액은 다 0인 낡은 payload) ──');
  const stale = JSON.parse(JSON.stringify(SEED));
  stale.clubFund = 12345; stale._rev = { by: 'old-phone', n: 1 };
  await dbCall('upsert', 'jtfag_league', { id: 1, payload: stale });
  const t3 = await converged('낡은 폰 저장 뒤', MODE === 'table' ? want2 : null);
  if (MODE === 'table') {
    ok((await 신성호.evaluate(() => appData.clubFund)) === 12345, '낡은 폰이 고친 다른 값(공금)은 그대로 들어온다');
  } else {
    console.log('   ↑ 테이블이 없으면 낡은 폰 하나가 넷의 금액을 지운다 (예전 방식의 한계 · 테이블을 만들면 사라진다)');
  }

  if (MODE === 'table') {
    console.log('\n── 예전 코드가 떠 있는 폰이 금액을 payload로만 쓴다 ──');
    const old = JSON.parse(JSON.stringify(db.league));
    GOLFERS.forEach(g => { old.roundMoney[R][g] = { start: 0, end: 0 }; });
    old._rev = { by: 'old-code', n: 2 };
    await dbCall('upsert', 'jtfag_league', { id: 1, payload: old });
    await converged('예전 코드 폰 저장 뒤', want2);

    console.log('\n── 적고 있는 도중에 남의 저장이 들어온다 ──');
    await 신성호.evaluate(r => { if (selectedMoneyRoundIdx !== r) changeMoneyRound(r); }, R);
    await 신성호.click('#money_end_신성호'); await 신성호.keyboard.press('Control+A'); await 신성호.keyboard.type('2580');
    await typeOwn(박승수, 'end', 346000);
    await sleep(900);
    const mid = await 신성호.evaluate(() => ({ v: document.getElementById('money_end_신성호').value, f: document.activeElement.id }));
    ok(mid.v === '2580' && mid.f === 'money_end_신성호', `치던 글자와 커서가 그대로 (${mid.v})`);
    await 신성호.keyboard.type('00'); await 신성호.evaluate(() => document.activeElement.blur());
    Object.assign(want2['신성호'], { end: 258000 }); Object.assign(want2['박승수'], { end: 346000 });
    await converged('적는 도중 남의 저장', want2);

    console.log('\n── 되돌리기: 내 칸만 되돌리고 남이 그 뒤에 적은 건 안 건드린다 ──');
    await typeOwn(이관교, 'start', 199000);          // 이관교가 고치고
    await sleep(400);
    await typeOwn(김지명, 'start', 205000);          // 그 뒤에 김지명이 고친다
    await sleep(700);
    await 이관교.evaluate(() => undoLastAction());   // 이관교가 되돌리기
    Object.assign(want2['이관교'], { start: 100000 }); Object.assign(want2['김지명'], { start: 205000 });
    await converged('되돌리기', want2);

    console.log('\n── 관리자 전체 열기로 둘이 같은 칸을 동시에 고친다 ──');
    await 김지명.evaluate(() => { isMoneyUnlocked = true; renderMoneyTable(); });
    await Promise.all([
      typeOwn(박승수, 'start', 410000),
      (async () => {
        await 김지명.evaluate(r => { if (selectedMoneyRoundIdx !== r) changeMoneyRound(r); }, R);
        await 김지명.click('#money_start_박승수'); await 김지명.keyboard.press('Control+A'); await 김지명.keyboard.type('420000');
        await 김지명.evaluate(() => document.activeElement.blur());
      })()
    ]);
    const t5 = await converged('같은 칸 동시 수정');
    ok([410000, 420000].includes(t5['박승수'].start), `둘 중 나중에 닿은 값으로 모두 맞춰진다 (${t5['박승수'].start})`);
    want2['박승수'].start = t5['박승수'].start;
    await 김지명.evaluate(() => { isMoneyUnlocked = false; renderMoneyTable(); });

    console.log('\n── 차수를 지웠다 되돌리면 금액이 돌아오고, 새로 만들면 비어 있다 ──');
    await 신성호.evaluate(() => { removeRound(); });
    await sleep(300);
    await 신성호.evaluate(() => { const x = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '지우기'); if (x) x.click(); });
    await sleep(1500);
    ok((await 김지명.evaluate(() => appData.totalRounds)) === 5, '6차가 지워졌다 (모든 화면)');
    await 신성호.evaluate(() => undoLastAction());
    await sleep(1500);
    await converged('지웠다 되돌린 뒤', want2);
    await 신성호.evaluate(() => { removeRound(); });
    await sleep(300);
    await 신성호.evaluate(() => { const x = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === '지우기'); if (x) x.click(); });
    await sleep(1200);
    await 신성호.evaluate(() => addRound());
    await sleep(2000);
    const fresh = await converged('지우고 새로 만든 뒤');
    ok(GOLFERS.every(g => !fresh[g].start && !fresh[g].end && !fresh[g].donate), '새로 만든 6차는 금액이 비어 있다 (옛 금액이 안 되살아난다)');

    const diag = await 신성호.evaluate(() => ({ seen: localStorage.getItem('jtfag_result_seen'), last: lastRankedRound, overlay: !!document.querySelector('.reveal-overlay'), total: appData.totalRounds }));
    console.log('   (결과 발표 진단)', JSON.stringify(diag));
    await Promise.all(phones.map(settle));
    console.log('\n── 저장이 실패하면 숨기지 않는다 ──');
    db.moneyExists = false;   // 그 순간 테이블이 응답 안 하는 상황
    lat = [5, 20];
    await typeOwn(신성호, 'start', 999000);
    await sleep(17000);       // 다시 시도를 다 쓴다 (1+2+4+8초)
    const fail = await 신성호.evaluate(() => ({ toast: document.getElementById('customToast').textContent, v: appData.roundMoney[5]['신성호'].start }));
    console.log('   ', JSON.stringify(fail));
    ok(/저장에 실패/.test(fail.toast), '끝내 못 보내면 실패를 분명히 알린다');
    ok(fail.v !== 999000, '저장 안 된 값을 저장된 것처럼 보여 주지 않는다 (DB 값으로 되돌린다)');
    db.moneyExists = true; lat = [20, 160];
  }

  console.log('\n── 가만히 두면 아무것도 안 나간다 ──');
  const w0 = { m: db.moneyWrites, l: db.leagueWrites };
  await sleep(4000);
  ok(db.moneyWrites === w0.m && db.leagueWrites === w0.l, `4초 동안 저장 ${db.moneyWrites - w0.m + db.leagueWrites - w0.l}회 (헛도는 저장 없음)`);

  await browser.close();
})();
