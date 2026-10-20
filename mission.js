// 🎯 라운드 미션 — 세 번째 화면(미션 탭).
// 사용자 요청 — 돈내기 말고 게임처럼 즐길 거리. 시안 `JTFAG 라운드 미션 시안`을 보고 네 가지를 바꿔 정했다:
//   ① 미션 탭은 세 번째 자리 ② `미션 받기`를 누르면 무작위로 하나 ③ 미션 아홉 가지(아래 MISSION_DEFS)
//   ④ 포인트 5점마다 멀리건 사용권 1개.
//
// 저장하는 것은 둘뿐이다 — 누가 어느 차수에 무슨 미션을 받았나(`payload.missions`)와 멀리건을 언제 썼나
// (`payload.mulligans`). **성공·실패·포인트·사용권·뱃지는 전부 홀 기록(ROUND_HOLES)에서 그때그때 계산한다** —
// 판정을 저장하면 스코어카드를 다시 올렸을 때 어긋난다(뱃지 컬렉션과 같은 생각).
//
//   payload.missions  = { "10": { "신성호": { at, y: 2026, ms: [{ id: 'p3par2' }, { id: 'tPar6', who: '김지명' }] } } }
//   (라운드마다 본인 미션 1개 + 멤버 미션 1개 · 난이도 합 ★4 이하 — 사용자가 정했다. 미션이 하나이던 예전 판
//    `{ id, who?, at, y }`도 그대로 읽는다 — missionSlots())
//   payload.mulligans = { "신성호": [ { r: 10, t: 1760000000000 } ] }
//
// **다시 뽑기**(사용자 요청 — `포인트2점으로 한번만 다시 뽑을수있게`): 차수마다 한 번, 포인트 2점을 써서 다시 뽑는다.
// 처음 받은 미션을 고치지 않고 **`re`를 덧붙인다** — `{ id, at, y, re: { id, who?, at } }`. 판정은 `re`가 있으면 그것으로 한다.
// 덧붙이기만 하므로 아래 '더하기만 한다'는 전제가 그대로 산다(낡은 payload에 `re`가 없으면 합칠 때 되살린다).
//
// 두 값 모두 **더하기만 한다**(한 번 받은 미션은 못 바꾸고 · 쓴 사용권은 안 되돌린다). 그래서 낡은 폰이 payload를
// 통째로 덮어써도 `mergeMissionData()`가 합쳐서 되살린다 — 지우는 길이 없으니 합쳐도 언제나 같은 값으로 모인다.

const MISSION_LEVELS = {
    1: { stars: '★', name: '쉬움' },
    2: { stars: '★★', name: '보통' },
    3: { stars: '★★★', name: '어려움' }
};
const MULLIGAN_STEP = 5;   // 포인트 5점마다 멀리건 사용권 1개(사용자가 정했다)
const REDRAW_COST = 2;     // 다시 뽑기 — 포인트 2점 · 차수마다 1회(사용자가 정했다)
const MISSION_LV_MAX = 4;  // 라운드마다 받는 두 미션(본인 1 + 멤버 1)의 난이도 합 상한 — ★★★ + ★ 까지(사용자가 정했다)
const MISSION_LV_MIN = 3;  // 그 합의 하한 — ★ + ★은 너무 쉽다(사용자가 정했다). 조정된 별로 센다
// 미션 초기화 시각 — 이보다 먼저 받은 미션·쓴 멀리건은 없는 것으로 본다(사용자 요청 — 규칙을 바꿔 모두 다시 시작).
// **지우지 않고 무시한다** — 더하기만 하는 저장이라 지우면 낡은 폰이 되살리고 새 폰이 또 지우며 저장이 돈다.
// 다시 초기화하려면 이 값만 지금 시각으로 바꾼다.
const MISSION_RESET_AT = 1791681351211;   // 2026-10-11 10:15 KST
// 차수 초기화(관리자 메뉴 → `🎯 미션 차수 초기화` · `resetMissionRound()`) — `payload.missionResets = { "10": 시각 }`.
// 그 차수에서 이 시각보다 먼저 받은 미션은 없는 것으로 본다(지우지 않는다 — 위와 같은 까닭). 값은 더 커지기만 하고 합칠 때 큰 쪽을 쓴다.
function missionResetAt(round) {
    const m = appData && appData.missionResets;
    return Math.max(MISSION_RESET_AT, (m && Number(m[String(round)])) || 0);
}
const missionLive = (rec, round) => !!rec && typeof rec === 'object' && (Number(rec.at) || 0) >= (round === undefined ? MISSION_RESET_AT : missionResetAt(round));

// 셈 도우미 — h는 { par: 18홀 파, rel: 파 대비 타수 }
const mCount = (h, pred) => h.rel.reduce((n, v, i) => n + (pred(v, i) ? 1 : 0), 0);
const mRun = (h, pred) => { let run = 0, best = 0; h.rel.forEach((v, i) => { run = pred(v, i) ? run + 1 : 0; if (run > best) best = run; }); return best; };
const mHalf = (h, a) => h.par.slice(a, a + 9).reduce((t, p, i) => t + p + h.rel[a + i], 0);
const mGross = h => mHalf(h, 0) + mHalf(h, 9);
const mBirdie = h => mCount(h, v => v < 0);
const mStrokes = (h, pred) => h.rel.reduce((n, v, i) => n + (pred(v, i) ? h.par[i] + v : 0), 0);

// 특별미션은 뽑기와 관계없이 모든 멤버의 홀 기록으로 판정한다.
// 한 홀은 홀인원·이글·알바트로스 중 해당하는 한 항목에만 가산한다.
const SPECIAL_MISSION_DEFS = [
    { id: 'holeInOne', text: '홀인원', pts: 20, how: '한 홀을 1타로 마무리',
      count: h => mCount(h, (v, i) => h.par[i] + v === 1) },
    { id: 'albatross', text: '알바트로스', pts: 20, how: '한 홀에서 파보다 3타 적게 · 홀인원 제외',
      count: h => mCount(h, (v, i) => v === -3 && h.par[i] + v > 1) },
    { id: 'eagle', text: '이글', pts: 10, how: '한 홀에서 파보다 2타 적게 · 홀인원 제외',
      count: h => mCount(h, (v, i) => v === -2 && h.par[i] + v > 1) }
];

// 미션 목록(사용자가 정했다 — 처음 아홉에 열하나를 더했다). `w`는 뽑힐 무게 — 전반·후반 42타는 한 가지를 둘로 나눈 것이라 반씩.
// **`who: true`인 미션은 다른 멤버 한 사람이 대상이다**(사용자 요청 — `김지명 버디2개 이런것도`). 받을 때 대상도 무작위로 정해
// `rec.who`에 남기고, 글의 `{T}` 자리에 그 이름이 들어간다. 판정은 `judge(내 기록, 대상 기록)`이다.
// 대상이 그 차수에 기록이 없으면(불참) 판정하지 않는다. 겨루는 미션은 비기면 실패다.
// 난이도는 1~9차 실제 홀 기록으로 성공률을 재서 정했다(○○ 파 6개 64% · ○○ 89타 44% · ○○ 버디 2개 11% ·
// 후반 대결 44% · 타수 대결 49% · 버디 대결 26% · 버디 1개 56% · 파 8개 28% · 89타 44% · 마지막 3홀 28% · 파5 모두 보기 이하 19%).
// **'파'는 파 이하(버디 포함)로 센다** — 버디를 했다고 미션이 깨지면 이상하다.
// **'더블보기'·'트리플 보기'는 그 이상까지 센다**(트리플은 더블보기 이상에도 든다).
const MISSION_DEFS = [
    { id: 'par3', fair: true, lv: 1, w: 2, text: '파 3개 이상', how: '파 이하(버디 포함) 홀 3개 이상',
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
    { id: 'bogey4', fair: true, lv: 2, w: 2, text: '4홀 연속 보기 이하', how: '보기 이하 홀 4개 연속',
      judge: h => { const n = mRun(h, v => v <= 1); return { ok: n >= 4, got: `최대 ${n}홀 연속` }; } },
    { id: 'birdie3', fair: true, lv: 3, w: 2, text: '버디 3개', how: '버디 이하(이글 포함) 홀 3개 이상',
      judge: h => { const n = mCount(h, v => v < 0); return { ok: n >= 3, got: `버디 ${n}개` }; } },
    { id: 'parRun4', fair: true, lv: 3, w: 2, text: '4홀 연속 파', how: '파 이하(버디 포함) 홀 4개 연속',
      judge: h => { const n = mRun(h, v => v <= 0); return { ok: n >= 4, got: `최대 ${n}홀 연속` }; } },
    { id: 'p5par3', fair: true, lv: 3, w: 2, text: '파5에서 파 3개', how: '파5 홀에서 파 이하 3개 이상',
      judge: h => { const n = mCount(h, (v, i) => h.par[i] === 5 && v <= 0); return { ok: n >= 3, got: `파5 파 이하 ${n}개` }; } },
    // ── 추가분(본인) ──
    { id: 'birdie1', fair: true, lv: 1, w: 2, text: '버디 1개 이상', how: '버디 이하(이글 포함) 홀 1개 이상',
      judge: h => { const n = mBirdie(h); return { ok: n >= 1, got: `버디 ${n}개` }; } },
    { id: 'par8', lv: 2, w: 2, text: '파 8개 이상', how: '파 이하(버디 포함) 홀 8개 이상',
      judge: h => { const n = mCount(h, v => v <= 0); return { ok: n >= 8, got: `파 이하 ${n}개` }; } },
    { id: 'gross89', lv: 2, w: 2, text: '89타 이하', how: '18홀 합계 89타 이하',
      judge: h => { const n = mGross(h); return { ok: n <= 89, got: `${n}타` }; } },
    { id: 'last3', fair: true, lv: 2, w: 2, text: '마지막 3홀 보기 이하', how: '16·17·18번 홀 모두 보기 이하',
      judge: h => { const n = h.rel.slice(15).filter(v => v <= 1).length; return { ok: n === 3, got: `마지막 3홀 중 ${n}홀 보기 이하` }; } },
    { id: 'p5bogey', fair: true, lv: 3, w: 2, text: '파5 홀 모두 보기 이하', how: '파5 홀 전부 보기 이하',
      judge: h => { const all = mCount(h, (v, i) => h.par[i] === 5), n = mCount(h, (v, i) => h.par[i] === 5 && v <= 1); return { ok: all > 0 && n === all, got: `파5 ${all}홀 중 ${n}홀 보기 이하` }; } },
    // ── 추가분(본인 · 사용자 요청 — `다 넣어줘`). 1~9차 성공률(이관교·김지명·신성호·박승수) ──
    { id: 'opener', lv: 1, w: 2, text: '첫 홀 보기 이하', how: '1번 홀 보기 이하',   // 69% (78·100·56·44)
      judge: h => { const n = h.par[0] + h.rel[0]; return { ok: h.rel[0] <= 1, got: `1번 홀 ${n}타(파${h.par[0]})` }; } },
    { id: 'p4par3', lv: 1, w: 2, text: '파4에서 파 3개 이상', how: '파4 홀에서 파 이하 3개 이상',   // 67% (78·100·44·44)
      judge: h => { const n = mCount(h, (v, i) => h.par[i] === 4 && v <= 0); return { ok: n >= 3, got: `파4 파 이하 ${n}개` }; } },
    { id: 'bogeyRun6', lv: 1, w: 2, text: '6홀 연속 보기 이하', how: '보기 이하 홀 6개 연속',   // 72% (67·89·78·56)
      judge: h => { const n = mRun(h, v => v <= 1); return { ok: n >= 6, got: `최대 ${n}홀 연속` }; } },
    { id: 'halfPar2', lv: 1, w: 2, text: '전·후반 각각 파 2개 이상', how: '앞 9홀·뒤 9홀에서 각각 파 이하 2개 이상',   // 72% (89·100·67·33)
      judge: h => { const a = mCount(h, (v, i) => i < 9 && v <= 0), b = mCount(h, (v, i) => i >= 9 && v <= 0); return { ok: a >= 2 && b >= 2, got: `전반 파 ${a}개 · 후반 파 ${b}개` }; } },
    { id: 'noDblRun', lv: 2, w: 2, text: '더블보기 이상 연속 없음', how: '더블보기 이상 홀이 두 홀 연달아 나오지 않게',   // 50% (67·67·56·11)
      judge: h => { const n = mRun(h, v => v >= 2); return { ok: n <= 1, got: `더블보기 이상 최대 ${n}홀 연속` }; } },
    { id: 'backBetter', fair: true, lv: 2, w: 2, text: '후반 타수가 전반보다 적게', how: '뒤 9홀 합계가 앞 9홀 합계보다 적게(동타는 실패)',   // 50% (22·56·56·67)
      judge: h => { const a = mHalf(h, 0), b = mHalf(h, 9); return { ok: b < a, got: `전반 ${a}타 · 후반 ${b}타` }; } },
    { id: 'p3bogey', lv: 2, w: 2, text: '파3 홀 모두 보기 이하', how: '파3 홀 전부 보기 이하',   // 44% (44·67·44·22)
      judge: h => { const all = mCount(h, (v, i) => h.par[i] === 3), n = mCount(h, (v, i) => h.par[i] === 3 && v <= 1); return { ok: all > 0 && n === all, got: `파3 ${all}홀 중 ${n}홀 보기 이하` }; } },
    { id: 'parRun3', lv: 2, w: 2, text: '3홀 연속 파', how: '파 이하(버디 포함) 홀 3개 연속',   // 39% (44·44·56·11)
      judge: h => { const n = mRun(h, v => v <= 0); return { ok: n >= 3, got: `최대 ${n}홀 연속` }; } },
    { id: 'first3', fair: true, lv: 3, w: 2, text: '첫 3홀 모두 보기 이하', how: '1·2·3번 홀 모두 보기 이하',   // 28% (33·22·22·33)
      judge: h => { const n = h.rel.slice(0, 3).filter(v => v <= 1).length; return { ok: n === 3, got: `첫 3홀 중 ${n}홀 보기 이하` }; } },
    { id: 'bogeyRun9', fair: true, lv: 3, w: 2, text: '9홀 연속 보기 이하', how: '보기 이하 홀 9개 연속',   // 28% (22·44·22·22)
      judge: h => { const n = mRun(h, v => v <= 1); return { ok: n >= 9, got: `최대 ${n}홀 연속` }; } },
    { id: 'last3par2', fair: true, lv: 3, w: 2, text: '마지막 3홀 중 파 2개 이상', how: '16·17·18번 홀 중 파 이하 2개 이상',   // 28% (22·33·33·22)
      judge: h => { const n = h.rel.slice(15).filter(v => v <= 0).length; return { ok: n >= 2, got: `마지막 3홀 파 이하 ${n}개` }; } },
    { id: 'p5birdie', fair: true, lv: 3, w: 2, text: '파5에서 버디', how: '파5 홀에서 버디 이하 1개 이상',   // 17% (11·33·11·11)
      judge: h => { const n = mCount(h, (v, i) => h.par[i] === 5 && v < 0); return { ok: n >= 1, got: `파5 버디 ${n}개` }; } },
    // ── 선택한 추천 미션(개인 1·2·4·7·8·9). 1~10차 성공률로 기본 별을 정하고 수령 시 실력을 보정한다. ──
    { id: 'parSet', lv: 1, w: 2, text: '파 풀세트', how: '파3·파4·파5에서 각각 파 이하 1개 이상',   // 78%
      judge: h => { const ns = [3, 4, 5].map(p => mCount(h, (v, i) => h.par[i] === p && v <= 0)); return { ok: ns.every(n => n >= 1), got: `파3 ${ns[0]}개 · 파4 ${ns[1]}개 · 파5 ${ns[2]}개` }; } },
    { id: 'startFinish', lv: 3, w: 2, text: '좋은 시작과 마무리', how: '1·18번 홀 모두 보기 이하',   // 33%
      judge: h => { const a = h.rel[0], b = h.rel[17]; return { ok: a <= 1 && b <= 1, got: `1번 홀 ${h.par[0] + a}타 · 18번 홀 ${h.par[17] + b}타` }; } },
    { id: 'doubleClosing', lv: 3, w: 2, text: '더블 클로징', how: '9·18번 홀 모두 파 이하',   // 13%
      judge: h => { const a = h.rel[8], b = h.rel[17]; return { ok: a <= 0 && b <= 0, got: `9번 홀 ${h.par[8] + a}타 · 18번 홀 ${h.par[17] + b}타` }; } },
    { id: 'p4Defense', lv: 3, w: 2, text: '파4 방어', how: '파4에서 더블보기 이상 홀 1개 이하',   // 25%
      judge: h => { const n = mCount(h, (v, i) => h.par[i] === 4 && v >= 2); return { ok: n <= 1, got: `파4 더블보기 이상 ${n}개` }; } },
    { id: 'averageBreak', fair: true, average: true, lv: 3, w: 2, text: '내 평균 돌파', how: '수령 시 최근 5경기 평균(내림)보다 3타 이상 적게',   // 15%(5경기 평균 기준, 이전 3경기 기준 18%) · 이미 본인 평균 기준이므로 별 추가 보정 없음
      judge: (h, o, rec) => { const n = mGross(h), target = rec.avg - 3; return { ok: n <= target, got: `${n}타 · 기준 평균 ${rec.avg}타 · 목표 ${target}타 이하` }; } },
    { id: 'backRestart', lv: 2, w: 2, text: '후반 재출발', how: '10·11·12번 홀 모두 보기 이하',   // 48%
      judge: h => { const n = h.rel.slice(9, 12).filter(v => v <= 1).length; return { ok: n === 3, got: `10~12번 홀 중 ${n}홀 보기 이하` }; } },
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
      judge: (h, o) => { const a = mBirdie(h), b = mBirdie(o); return { ok: a > b, got: `버디 ${a}개 · {T} ${b}개` }; } },
    // ── 추가분(멤버 · 사용자 요청 — `멤버 미션이 난이도별로 더 많이 필요`). 1~9차 짝 108가지로 잰 성공률을 주석에 적는다 ──
    // 응원
    { id: 'tDbl5', lv: 1, w: 2, who: true, text: '{T} 더블보기 5개 이하', how: '대상 멤버가 더블보기 이상 홀 5개 이하',   // 69%
      judge: (h, o) => { const n = mCount(o, v => v >= 2); return { ok: n <= 5, got: `{T} 더블보기 이상 ${n}개` }; } },
    { id: 'tBirdie1', lv: 1, w: 2, who: true, text: '{T} 버디 1개 이상', how: '대상 멤버가 버디 이하(이글 포함) 홀 1개 이상',   // 56%
      judge: (h, o) => { const n = mBirdie(o); return { ok: n >= 1, got: `{T} 버디 ${n}개` }; } },
    { id: 'tPar8', lv: 3, w: 2, who: true, text: '{T} 파 8개 이상', how: '대상 멤버가 파 이하(버디 포함) 홀 8개 이상',   // 28%
      judge: (h, o) => { const n = mCount(o, v => v <= 0); return { ok: n >= 8, got: `{T} 파 이하 ${n}개` }; } },
    // 협동 — 둘이 함께 이룬다
    { id: 'duo95', lv: 1, w: 2, who: true, text: '{T}와 둘 다 95타 이하', how: '나와 대상 멤버 모두 18홀 합계 95타 이하',   // 67%
      judge: (h, o) => { const a = mGross(h), b = mGross(o); return { ok: a <= 95 && b <= 95, got: `${a}타 · {T} ${b}타` }; } },
    { id: 'duoPar2', lv: 1, w: 2, who: true, text: '{T}와 같은 홀 파 2번', how: '같은 홀에서 둘 다 파 이하인 홀 2개 이상',   // 61%
      judge: (h, o) => { const n = mCount(h, (v, i) => v <= 0 && o.rel[i] <= 0); return { ok: n >= 2, got: `{T}와 함께 파 ${n}번` }; } },
    { id: 'duo180', lv: 2, w: 2, who: true, text: '{T}와 합계 180타 이하', how: '나와 대상 멤버의 18홀 합계를 더해 180타 이하',   // 50%
      judge: (h, o) => { const a = mGross(h), b = mGross(o); return { ok: a + b <= 180, got: `합계 ${a + b}타 (${a} + {T} ${b})` }; } },
    { id: 'duoBirdie', lv: 3, w: 2, who: true, text: '{T}와 둘 다 버디 1개 이상', how: '나와 대상 멤버 모두 버디 이하 홀 1개 이상',   // 35%
      judge: (h, o) => { const a = mBirdie(h), b = mBirdie(o); return { ok: a >= 1 && b >= 1, got: `버디 ${a}개 · {T} ${b}개` }; } },
    // ── 선택한 추천 미션(협동 1·3·4·6·8·10) ──
    { id: 'duoRoles', lv: 1, w: 2, who: true, text: '{T}와 역할 분담', how: '나는 파3, 대상 멤버는 파5에서 각각 파 이하 1개 이상',   // 77%
      judge: (h, o) => { const a = mCount(h, (v, i) => h.par[i] === 3 && v <= 0), b = mCount(o, (v, i) => o.par[i] === 5 && v <= 0); return { ok: a >= 1 && b >= 1, got: `내 파3 파 이하 ${a}개 · {T} 파5 파 이하 ${b}개` }; } },
    { id: 'duoDefense', lv: 3, w: 2, who: true, text: '{T}와 동반 수비', how: '두 사람 모두 13~18번 홀에서 트리플 보기 이상 없이 마무리',   // 23%
      judge: (h, o) => { const a = h.rel.slice(12).filter(v => v >= 3).length, b = o.rel.slice(12).filter(v => v >= 3).length; return { ok: a === 0 && b === 0, got: `마지막 6홀 트리플 이상 ${a}개 · {T} ${b}개` }; } },
    { id: 'duoFinish', lv: 3, w: 2, who: true, text: '{T}와 동반 피니시', how: '두 사람 모두 18번 홀 보기 이하',   // 25%
      judge: (h, o) => { const a = h.par[17] + h.rel[17], b = o.par[17] + o.rel[17]; return { ok: h.rel[17] <= 1 && o.rel[17] <= 1, got: `18번 홀 ${a}타 · {T} ${b}타` }; } },
    { id: 'duoBirdie3', lv: 3, w: 2, who: true, text: '{T}와 버디 합작', how: '각자 버디 이하 1개 이상, 두 사람 합계 3개 이상',   // 10%
      judge: (h, o) => { const a = mBirdie(h), b = mBirdie(o); return { ok: a >= 1 && b >= 1 && a + b >= 3, got: `버디 ${a}개 · {T} ${b}개 · 합계 ${a + b}개` }; } },
    { id: 'duoClosingRoles', lv: 2, w: 2, who: true, text: '{T}와 마무리 분담', how: '나는 9번 홀, 대상 멤버는 18번 홀 보기 이하',   // 41%
      judge: (h, o) => { const a = h.par[8] + h.rel[8], b = o.par[17] + o.rel[17]; return { ok: h.rel[8] <= 1 && o.rel[17] <= 1, got: `내 9번 홀 ${a}타 · {T} 18번 홀 ${b}타` }; } },
    { id: 'duoShortPar', lv: 2, w: 2, who: true, text: '{T}와 숏홀 합작', how: '같은 파3 홀에서 두 사람 모두 파 이하 1번 이상',   // 53%
      judge: (h, o) => { const n = mCount(h, (v, i) => h.par[i] === 3 && v <= 0 && o.rel[i] <= 0); return { ok: n >= 1, got: `파3에서 {T}와 함께 파 이하 ${n}번` }; } },
    // 대결(비기면 실패)
    { id: 'vsHoles', lv: 2, w: 2, who: true, text: '{T}보다 이긴 홀 많이', how: '홀마다 타수를 견줘 이긴 홀이 진 홀보다 많게(같으면 실패)',   // 46%
      judge: (h, o) => { const w = mCount(h, (v, i) => v < o.rel[i]), l = mCount(h, (v, i) => v > o.rel[i]); return { ok: w > l, got: `이긴 홀 ${w} · 진 홀 ${l} ({T})` }; } },
    { id: 'vsDbl', lv: 2, w: 2, who: true, text: '{T}보다 더블보기 적게', how: '더블보기 이상 홀이 대상 멤버보다 적게(같으면 실패)',   // 46%
      judge: (h, o) => { const a = mCount(h, v => v >= 2), b = mCount(o, v => v >= 2); return { ok: a < b, got: `더블보기 이상 ${a}개 · {T} ${b}개` }; } },
    { id: 'vsPar', lv: 2, w: 2, who: true, text: '{T}보다 파 많이', how: '파 이하(버디 포함) 홀이 대상 멤버보다 많게(같으면 실패)',   // 45%
      judge: (h, o) => { const a = mCount(h, v => v <= 0), b = mCount(o, v => v <= 0); return { ok: a > b, got: `파 이하 ${a}개 · {T} ${b}개` }; } },
    { id: 'vsBy5', lv: 3, w: 2, who: true, text: '{T}보다 5타 이상 적게', how: '18홀 합계가 대상 멤버보다 5타 이상 적게',   // 31%
      judge: (h, o) => { const a = mGross(h), b = mGross(o); return { ok: a <= b - 5, got: `${a}타 · {T} ${b}타` }; } },
    { id: 'vsBoth', lv: 3, w: 2, who: true, text: '{T}에게 전·후반 모두 승리', how: '전반 9홀·후반 9홀 합계 모두 대상 멤버보다 적게(동타는 실패)',   // 23%
      judge: (h, o) => { const a1 = mHalf(h, 0), b1 = mHalf(o, 0), a2 = mHalf(h, 9), b2 = mHalf(o, 9); return { ok: a1 < b1 && a2 < b2, got: `전반 ${a1}·${b1} 후반 ${a2}·${b2} ({T})` }; } },
    // ── 선택한 추천 미션(경쟁 1·3·4·5·7) ──
    { id: 'vsLast6', lv: 2, w: 2, who: true, text: '{T}와 막판 6홀 승부', how: '13~18번 홀 합계가 대상 멤버보다 적게(동타는 실패)',   // 44%
      judge: (h, o) => { const a = mStrokes(h, (v, i) => i >= 12), b = mStrokes(o, (v, i) => i >= 12); return { ok: a < b, got: `마지막 6홀 ${a}타 · {T} ${b}타` }; } },
    { id: 'vsShort', lv: 2, w: 2, who: true, text: '{T}와 숏홀 승부', how: '파3 홀 타수 합계가 대상 멤버보다 적게(동타는 실패)',   // 44%
      judge: (h, o) => { const a = mStrokes(h, (v, i) => h.par[i] === 3), b = mStrokes(o, (v, i) => o.par[i] === 3); return { ok: a < b, got: `파3 합계 ${a}타 · {T} ${b}타` }; } },
    { id: 'vsMiddle', lv: 2, w: 2, who: true, text: '{T}와 미들홀 승부', how: '파4 홀 타수 합계가 대상 멤버보다 적게(동타는 실패)',   // 47%
      judge: (h, o) => { const a = mStrokes(h, (v, i) => h.par[i] === 4), b = mStrokes(o, (v, i) => o.par[i] === 4); return { ok: a < b, got: `파4 합계 ${a}타 · {T} ${b}타` }; } },
    { id: 'vsLong', lv: 2, w: 2, who: true, text: '{T}와 롱홀 승부', how: '파5 홀 타수 합계가 대상 멤버보다 적게(동타는 실패)',   // 45%
      judge: (h, o) => { const a = mStrokes(h, (v, i) => h.par[i] === 5), b = mStrokes(o, (v, i) => o.par[i] === 5); return { ok: a < b, got: `파5 합계 ${a}타 · {T} ${b}타` }; } },
    { id: 'vsWinRun3', lv: 2, w: 2, who: true, text: '{T}에게 3홀 연속 승리', how: '3홀 연속 대상 멤버보다 적은 타수(동타는 연속 중단)',   // 40%
      judge: (h, o) => { const n = mRun(h, (v, i) => h.par[i] + v < o.par[i] + o.rel[i]); return { ok: n >= 3, got: `{T}에게 최대 ${n}홀 연속 승리` }; } }
];
const MISSION_BY_ID = {};
MISSION_DEFS.forEach(d => { MISSION_BY_ID[d.id] = d; });

// ── 기록 읽기 ──────────────────────────────────────────────
function missionYearNow() {
    return parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()), 10);
}

// 저장된 한 사람·한 차수의 칸 목록. 지금 판은 `ms`(본인 미션 + 멤버 미션)이고,
// 미션이 하나이던 예전 판(`{ id, who? }`)은 한 칸짜리로 읽는다.
function missionSlots(rec) {
    if (!rec || typeof rec !== 'object') return [];
    if (Array.isArray(rec.ms)) return rec.ms.filter(m => m && typeof m === 'object');
    return rec.id ? [{ id: rec.id, who: rec.who }] : [];
}
// 같은 뽑기에서 나온 기록인가(합칠 때 `re`를 옮겨 붙여도 되는가)
function missionSameDraw(a, b) {
    return missionSlots(a).map(m => m.id).join(',') === missionSlots(b).map(m => m.id).join(',');
}

// 판정에 쓰는 미션들 — 다시 뽑은 칸(`re.i`)은 `re`의 미션이다(`redrawn`).
// 대상 멤버가 있는 미션은 그 이름이 우리 넷 중 하나(본인 제외)여야 한다.
function missionEntry(round, g) {
    const all = appData && appData.missions;
    const rec = all && all[String(round)] && all[String(round)][g];
    if (!missionLive(rec, round)) return null;
    const slots = missionSlots(rec);
    if (!slots.length) return null;
    const re = rec.re && MISSION_BY_ID[rec.re.id] ? rec.re : null;
    const reIdx = re ? (Number.isInteger(re.i) ? re.i : 0) : -1;
    const items = [];
    slots.forEach((m, i) => {
        const src = i === reIdx ? re : m;
        const def = MISSION_BY_ID[src.id];
        if (!def) return;
        if (def.who && !(golfers.includes(src.who) && src.who !== g)) return;
        // 받을 때 실력으로 조정한 별(`lv`)이 같이 적혀 있다 — 그 값이 곧 난이도·포인트다(받는 순간 고정).
        // 조정이 생기기 전에 받은 미션은 `lv`가 없어 기본 별을 쓴다.
        const lv = Number.isInteger(src.lv) && src.lv >= 1 && src.lv <= 3 ? src.lv : def.lv;
        const item = { i, def, lv, who: def.who ? src.who : undefined, redrawn: i === reIdx };
        // 평균 돌파의 기준도 수령 시 고정한다 — 경기 후 새 평균을 쓰면 목표가 바뀐다.
        if (def.average) item.avg = Number.isInteger(src.avg) && src.avg > 0 ? src.avg : null;
        items.push(item);
    });
    return items.length ? { at: rec.at, y: rec.y, items, redrawn: reIdx >= 0 } : null;
}

// 화면에 적는 미션 글 — `{T}` 자리에 대상 멤버 이름(모르면 ○○)
function missionText(def, rec) {
    const text = def.text.replace('{T}', rec && rec.who ? rec.who : '○○');
    return def.average && rec && Number.isInteger(rec.avg) && rec.avg > 0 ? `${text} (${rec.avg - 3}타 이하)` : text;
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

function specialMissionYear(round) {
    const rec = ROUND_HOLES[String(round)] || {};
    if (Number.isInteger(rec.year)) return rec.year;
    const entries = Object.values((appData.missions || {})[String(round)] || {});
    const dated = entries.find(e => e && Number.isInteger(e.y));
    // 연도 필드 도입 전의 기존 홀 기록(1~10차)은 2026년 기록이다.
    return dated ? dated.y : 2026;
}

function specialMissionLog(g) {
    if (typeof ROUND_HOLES === 'undefined') return [];
    return Object.keys(ROUND_HOLES).map(Number).filter(r => r > 0 && r <= appData.totalRounds).sort((a, b) => a - b).flatMap(round => {
        const h = missionHoles(round, g);
        if (!h || !h.par.every((p, i) => Number.isInteger(p) && Number.isInteger(h.rel[i]) && p + h.rel[i] >= 1)) return [];
        const y = specialMissionYear(round);
        return SPECIAL_MISSION_DEFS.flatMap(def => {
            const count = def.count(h);
            return count ? [{ round, g, y, id: def.id, text: def.text, count, pts: def.pts * count }] : [];
        });
    });
}

function specialMissionPoints(g, year, throughRound = Infinity) {
    return specialMissionLog(g).filter(x => x.round <= throughRound && (!year || x.y === year)).reduce((sum, x) => sum + x.pts, 0);
}

// 판정 — state: 'wait'(아직 홀 기록 없음) · 'none'(그 차수에 기록이 없음 = 불참) · 'ok' · 'fail'. 미션 하나마다 한 줄.
function missionResults(round, g) {
    const e = missionEntry(round, g);
    if (!e) return [];
    return e.items.map(it => {
        const def = it.def;
        const base = { round, g, i: it.i, def, lv: it.lv, who: it.who, y: e.y, redrawn: it.redrawn, text: missionText(def, it) };
        if (!roundHasHoles(round)) return { ...base, state: 'wait' };
        const h = missionHoles(round, g);
        if (!h) return { ...base, state: 'none' };
        if (def.average && !it.avg) return { ...base, state: 'none', got: '기준 평균 없음' };
        let o = null;
        if (def.who) {
            o = missionHoles(round, it.who);
            if (!o) return { ...base, state: 'none', got: `${it.who} 기록 없음` };
        }
        const r = def.judge(h, o, it);
        return { ...base, state: r.ok ? 'ok' : 'fail', ok: r.ok, got: r.got.replace('{T}', it.who || '') };
    });
}
const missionJudged = x => x.state === 'ok' || x.state === 'fail';

// 한 사람·한 차수 요약 — 판정된 미션 수 · 성공 수 · 얻은 포인트. 판정된 것이 없으면 null.
function missionRoundSum(round, g) {
    const xs = missionResults(round, g).filter(missionJudged);
    if (!xs.length) return null;
    const ok = xs.filter(x => x.ok);
    return { round, n: xs.length, okN: ok.length, pts: ok.reduce((t, x) => t + x.lv, 0), all: ok.length === xs.length, none: ok.length === 0, xs };
}

function missionRounds() {
    return Object.keys((appData && appData.missions) || {}).map(Number).filter(n => n > 0).sort((a, b) => a - b);
}

// 한 사람의 판정이 끝난 미션(성공·실패)을 차수 순서대로 — 미션 하나가 한 칸
function missionLog(g) {
    return missionRounds().flatMap(r => missionResults(r, g).filter(missionJudged));
}

// 다시 뽑기에 쓴 횟수(그해 것만 셀 수 있다)
function missionRedraws(g, year, throughRound = Infinity) {
    return missionRounds().filter(r => { const e = missionEntry(r, g); return r <= throughRound && e && e.redrawn && (!year || e.y === year); }).length;
}
// 라운드 예측(prediction.js)은 숨겨 두고 포인트 연결도 끊었다(사용자 결정 — 멀리건이 너무 많이 나온다는 동반자 의견).
// 코드·기록은 지우지 않았다. true로 바꾸면 화면과 포인트 합산이 함께 되살아난다.
let PREDICTION_ENABLED = false;
// 포인트 = 미션 성공 + 특별미션 − 다시 뽑기(+ 예측 적중은 PREDICTION_ENABLED일 때만). 시즌 순위·사용권·다시 뽑기가 모두 이 값을 쓴다.
function missionPoints(g, year, throughRound = Infinity) {
    const won = missionLog(g).filter(x => x.ok && x.round <= throughRound && (!year || x.y === year)).reduce((t, x) => t + x.lv, 0);
    const predicted = PREDICTION_ENABLED && typeof predictionPoints === 'function' ? predictionPoints(g, year, throughRound) : 0;
    return Math.max(0, won + specialMissionPoints(g, year, throughRound) + predicted - missionRedraws(g, year, throughRound) * REDRAW_COST);
}
function missionSeasonPoints(g) { return missionPoints(g, missionYearNow()); }

// 지금 다시 뽑을 수 있는가 — 받은 미션이 있고 · 이번 라운드에 아직 안 다시 뽑았고 · 포인트 2점이 있고 ·
// 2점을 써도 이미 쓴 멀리건 사용권보다 받은 사용권이 적어지지 않을 때.
function redrawCheck(g, round) {
    const e = missionEntry(round, g);
    if (!e) return { ok: false };
    if (e.redrawn) return { ok: false, done: true, why: 'ℹ️ 이번 라운드는 이미 다시 뽑았습니다.' };
    const pts = missionPoints(g);
    if (pts < REDRAW_COST) return { ok: false, why: `⚠️ 포인트가 부족합니다. 다시 뽑기에는 ${REDRAW_COST}점이 필요합니다(보유 ${pts}점).`, pts };
    if (Math.floor((pts - REDRAW_COST) / MULLIGAN_STEP) < mulliganUses(g).length) {
        return { ok: false, why: '⚠️ 이미 사용한 멀리건 사용권 때문에 포인트를 사용할 수 없습니다.', pts };
    }
    return { ok: true, pts };
}

// 멀리건 — 받은 개수는 통산 포인트에서 셈하고(해가 바뀌어도 남는다), 쓴 개수만 저장한다.
function mulliganUses(g) {
    const list = appData && appData.mulligans && appData.mulligans[g];
    return Array.isArray(list) ? list.filter(u => u && typeof u.t === 'number' && u.t >= MISSION_RESET_AT) : [];
}
// 멀리건은 라운드(차수)마다 한 번만 쓴다(사용자 요청). 쓰는 차수는 일정에 잡힌 다음 라운드, 없으면 마지막 차수다.
function mulliganRound() {
    const t = missionTarget();
    return t ? t.round : (appData.totalRounds || 0);
}
function mulliganUsedIn(g, round) {
    return mulliganUses(g).some(u => u.r === round);
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
// 그 차수에 성공한 미션 수(미션 수집가는 하나하나 센다)
function missionOkAt(g, round) {
    const s = missionRoundSum(round, g);
    return s ? s.okN : 0;
}
// n라운드 연달아 '모두 성공'(또는 '모두 실패')한 첫 차수 — 미션을 받은 라운드끼리 센다. 반만 성공하면 둘 다 끊긴다.
function missionRunRound(g, ok, n) {
    let run = 0;
    for (const r of missionRounds()) {
        const s = missionRoundSum(r, g);
        if (!s) continue;
        run = (ok ? s.all : s.none) ? run + 1 : 0;
        if (run >= n) return r - 1;
    }
    return -1;
}
// 넷 모두 미션을 받아 다 성공한 첫 차수
function missionAllClear() {
    for (const r of missionRounds()) {
        if (golfers.every(g => { const s = missionRoundSum(r, g); return s && s.all; })) return r - 1;
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
        if (!missionLive(rec, r) || !missionSlots(rec).some(m => MISSION_BY_ID[m.id]) || !golfers.includes(g)) return;
        if (!appData.missions || typeof appData.missions !== 'object') appData.missions = {};
        if (!appData.missions[r]) appData.missions[r] = {};
        const cur = appData.missions[r][g];
        if (!missionLive(cur, r)) { appData.missions[r][g] = rec; changed = true; }
        else if (rec.re && !cur.re && missionSameDraw(cur, rec) && MISSION_BY_ID[rec.re.id]) { cur.re = rec.re; changed = true; }
    };
    const addUse = (g, u) => {
        if (!u || typeof u.t !== 'number' || u.t < MISSION_RESET_AT || !golfers.includes(g)) return;
        if (!appData.mulligans || typeof appData.mulligans !== 'object') appData.mulligans = {};
        if (!Array.isArray(appData.mulligans[g])) appData.mulligans[g] = [];
        if (!appData.mulligans[g].some(x => x && x.t === u.t)) { appData.mulligans[g].push(u); changed = true; }
    };
    // 차수 초기화 표시를 먼저 합친다(큰 쪽) — 그래야 아래에서 초기화 전 미션을 되살리지 않는다.
    const pr = (prev && prev.missionResets) || {};
    Object.keys(pr).forEach(r => {
        const v = Number(pr[r]) || 0;
        if (!appData.missionResets || typeof appData.missionResets !== 'object') appData.missionResets = {};
        if (v > (Number(appData.missionResets[r]) || 0)) { appData.missionResets[r] = v; changed = true; }
    });
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

function missionRand(n) {
    try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296 * n; }
    catch (e) { return Math.random() * n; }
}
function pickWeighted(list) {
    if (!list.length) return null;
    let x = missionRand(list.reduce((t, d) => t + d.w, 0));
    for (const d of list) { if ((x -= d.w) < 0) return d; }
    return list[list.length - 1];
}
// ── 멤버 미션 난이도 보정(사용자 요청 — 박승수를 이기는 것과 김지명을 이기는 것이 같은 ★이면 형평이 안 맞는다) ──
// 받을 때 대상 멤버의 실력을 보고 별을 ±1 조정하고, 그 별로 본인 미션을 골라 합 MISSION_LV_MAX 이하를 맞춘다.
// 실력은 내 목표 타수와 같은 잣대 — 넷 다 타수가 있는 가장 최근 연속 다섯 차수의 평균(내림)이다. 없으면 조정하지 않는다.
const MISSION_ADJ_STEP = 4;   // 4타 이상 차이면 ±1 — 폭은 ±1까지(사용자 요청 — ±2는 너무 커 조합이 줄었다)
// 실력은 내 목표 타수와 같은 잣대 — 핸디캡과 같이 최근 5경기 평균이다(calc.js의 `HANDICAP_ROUNDS`와 같은 값 · 사용자 결정).
// 값을 직접 적은 것은 시험이 calc.js 없이 이 파일만 읽기 때문이다.
const MISSION_SKILL_ROUNDS = 5;
function missionSkill() {
    for (let r = (appData.totalRounds || 0) - 1; r >= MISSION_SKILL_ROUNDS - 1; r--) {
        const avg = handicapAverageAt(r, MISSION_SKILL_ROUNDS);
        if (avg) return avg;
    }
    return null;
}
// 멤버 미션의 종류 — 대결(○○보다) · 협동(○○와 함께) · 응원(○○가 해낸다)
function missionKind(def) {
    return /^vs/.test(def.id) ? '대결' : (/^duo/.test(def.id) ? '협동' : '응원');
}
// 조정 폭(+는 어려워짐). x = 어려운 쪽으로 잰 타수 차이
function missionAdjust(def, me, who, skill) {
    if (def.fair || !skill || !(skill[me] > 0) || (def.who && !(skill[who] > 0))) return 0;
    const avg = golfers.reduce((t, g) => t + skill[g], 0) / golfers.length;
    const kind = def.who ? missionKind(def) : '본인';
    // 대결은 나와 대상의 차이 · 응원은 대상과 넷 평균의 차이 · 협동은 두 사람 평균과 넷 평균의 차이.
    // 평균과의 차이는 둘 사이 차이의 절반 크기라 두 배로 견준다(같은 잣대가 되게).
    // 본인 미션은 내 평균과 넷 평균의 차이 × 2(못 칠수록 어렵다). 실력과 무관한 미션(`fair`)은 조정하지 않는다.
    const x = kind === '본인' ? (skill[me] - avg) * 2
        : kind === '대결' ? skill[me] - skill[who]
        : kind === '협동' ? ((skill[me] + skill[who]) / 2 - avg) * 2
        : (skill[who] - avg) * 2;
    const a = Math.abs(x);
    const n = a >= MISSION_ADJ_STEP ? 1 : 0;
    return x < 0 ? -n : n;
}
const missionLvOf = (def, adj) => Math.min(3, Math.max(1, def.lv + adj));
// 멤버 미션 후보 — 미션 × 대상 멤버마다 조정된 별을 붙여, 별이 budget 이하인 것만
function memberChoices(me, budget, skipId, low = 1) {
    const skill = missionSkill();
    const out = [];
    MISSION_DEFS.filter(d => d.who && d.id !== skipId).forEach(def => golfers.filter(g => g !== me).forEach(who => {
        const lv = missionLvOf(def, missionAdjust(def, me, who, skill));
        if (lv <= budget && lv >= low) out.push({ def, who, lv, w: def.w });
    }));
    return out;
}
// 본인 미션 후보 — 내 실력으로 조정한 별을 붙여, 남은 미션(keepLv)과 합쳐 MISSION_LV_MIN~MAX인 것만
function selfChoices(me, keepLv, skipId) {
    const skill = missionSkill();
    return MISSION_DEFS.filter(d => !d.who && d.id !== skipId && (!d.average || (skill && skill[me] > 0)))
        .map(def => ({ def, lv: missionLvOf(def, missionAdjust(def, me, null, skill)), w: def.w, ...(def.average ? { avg: skill[me] } : {}) }))
        .filter(c => c.lv + keepLv <= MISSION_LV_MAX && c.lv + keepLv >= MISSION_LV_MIN);
}
// 받기 — 멤버 미션과 대상을 먼저 정하고(조정된 별), 남은 별 안에서 본인 미션을 고른다.
// 멤버 쪽 무게에 '들어갈 수 있는 본인 미션 무게의 합'을 곱해, 가능한 짝 전체에서 고르게 뽑은 것과 같게 한다.
function pickMissionPair(me) {
    const sum = list => list.reduce((t, d) => t + d.w, 0);
    const b = pickWeighted(memberChoices(me, MISSION_LV_MAX - 1).map(c => ({ ...c, w: c.w * sum(selfChoices(me, c.lv)) })).filter(c => c.w > 0));
    if (!b) return null;
    const a = pickWeighted(selfChoices(me, b.lv));
    return a ? { a, b } : null;
}

// 룰렛처럼 미션 이름이 세로로 빠르게 흘러가다 점점 느려지며, 진짜 뽑힌 미션 위에서 멈춘다(사용자 요청 — `롤렛처럼`).
// 칸마다 이름 띠(reel)를 깔고 transform만 움직인다 — 띠의 맨 끝이 실제 결과라 멈춘 자리가 곧 뽑힌 미션이다.
// 빠르게 출발해 끝에서 아주 느리게 닿도록 곡선을 잡았고(`ROLL_EASE`), 두 번째 칸은 조금 더 늦게 멈춘다.
// finals[k] = { text, who } — 칸마다 멈출 글자와, 띠를 채울 후보의 종류(멤버 미션인지).
const ROLL_EASE = 'cubic-bezier(0.08, 0.72, 0.12, 1)';
const ROLL_MS = 3200;          // 첫 칸이 멈출 때까지
const ROLL_STAGGER = 700;      // 다음 칸마다 더 걸리는 시간
const ROLL_ITEMS = 26;         // 띠에 늘어놓는 이름 수 — 많을수록 처음이 빠르게 보인다
function rollMission(boxIds, btnId, busyText, finish, finals, ms = ROLL_MS) {
    const boxes = boxIds.map(id => document.getElementById(id));
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const done = () => {
        if (missionRoll) { clearTimeout(missionRoll.timer); missionRoll.timers.forEach(clearTimeout); }
        missionRoll = null;
        missionLanded = Date.now();
        missionLastHtml = '';
        renderMissionPage();
        finish();
    };
    if (!boxes.every(Boolean) || !boxes.length || reduce || !finals || finals.length !== boxes.length) { done(); return; }
    const btn = btnId && document.getElementById(btnId);
    if (btn) { btn.disabled = true; btn.textContent = busyText; }
    missionRoll = { timer: 0, timers: [] };
    const strips = boxes.map((box, k) => {
        // 칸의 높이를 한 줄로 못박는다 — 뽑는 동안 아래 글이 밀리지 않게
        const h = Math.max(28, Math.round(box.getBoundingClientRect().height));
        const pool = MISSION_DEFS.filter(d => !!d.who === !!finals[k].who).map(d => missionText(d, null));
        const items = [];
        let last = '';
        for (let j = 0; j < ROLL_ITEMS - 1; j++) {      // 같은 글이 잇달아 나오지 않게 고른다
            let t;
            do { t = pool[Math.floor(Math.random() * pool.length)]; } while (t === last && pool.length > 1);
            items.push(t); last = t;
        }
        items.push(finals[k].text);
        items.push(pool[Math.floor(Math.random() * pool.length)]);   // 멈춘 줄 아래로 비치는 다음 이름
        // 창은 한 줄보다 조금 크게 열어 위아래 이름이 살짝 비치게 하고, 넘친 만큼 음수 여백으로 돌려 아래 글이 안 밀리게 한다
        const win = Math.round(h * 1.5), pad = Math.round((win - h) / 2);
        box.classList.add('reel-host');
        box.innerHTML = '<span class="reel-strip" style="line-height:' + h + 'px;transform:translateY(' + pad + 'px)">' + items.map(t => '<span class="reel-it" style="height:' + h + 'px">' + escapeHtml(t) + '</span>').join('') + '</span>';
        box.style.height = win + 'px';
        box.style.margin = -pad + 'px 0';
        return { strip: box.firstChild, h, pad, dur: ms + k * ROLL_STAGGER };
    });
    // 한 프레임 뒤에 transition을 건다 — 처음 자리가 먼저 그려져야 움직임이 시작된다
    requestAnimationFrame(() => requestAnimationFrame(() => {
        strips.forEach(o => {
            o.strip.style.transition = 'transform ' + o.dur + 'ms ' + ROLL_EASE;
            o.strip.style.transform = 'translateY(' + (o.pad - (ROLL_ITEMS - 1) * o.h) + 'px)';
        });
    }));
    // 칸마다 멈추는 순간 짧게 진동한다(되는 기기만)
    strips.forEach(o => missionRoll.timers.push(setTimeout(() => { try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) { /* 진동이 안 되는 기기는 그냥 넘어간다 */ } }, o.dur)));
    // 멈춘 뒤 잠깐 결과를 보여 주고 화면을 다시 그린다
    const longest = Math.max(...strips.map(o => o.dur));
    missionRoll.timer = setTimeout(done, longest + 500);
}

let missionRoll = null;      // 뽑는 중이면 { timer, timers } — 그동안은 화면을 다시 그리지 않는다
let missionLanded = 0;       // 막 뽑힌 미션에 한 번만 붙이는 연출 시각

// 미션 받기 — 본인 미션 + 멤버 미션 두 개를 한 번에. 한 번 받으면 못 바꾼다(다시 뽑기 1회만).
// **되돌리기(saveState)를 일부러 안 건다** — 되돌리기로 미션을 지웠다 다시 뽑을 수 있으면 무작위의 뜻이 없어진다.
function drawMission() {
    if (missionRoll) return;
    const me = localStorage.getItem('jtfag_my_name');
    if (!me || !golfers.includes(me)) { showToast('⚠️ 이름을 먼저 설정해야 미션을 받을 수 있습니다.'); return; }
    const t = missionTarget();
    if (!t) { showToast('⚠️ 다음 라운드 일정이 등록되어야 미션을 받을 수 있습니다.'); return; }
    if (missionEntry(t.round, me)) { showToast('ℹ️ 이번 라운드 미션은 이미 받았습니다.'); return; }
    const p = pickMissionPair(me);
    if (!p) return;
    const rec = { at: Date.now(), y: t.year, ms: [{ id: p.a.def.id, lv: p.a.lv }, { id: p.b.def.id, who: p.b.who, lv: p.b.lv }] };
    if (p.a.def.average) rec.ms[0].avg = p.a.avg;
    if (!appData.missions || typeof appData.missions !== 'object') appData.missions = {};
    if (!appData.missions[t.round]) appData.missions[t.round] = {};
    appData.missions[t.round][me] = rec;
    writeMine(m => { m.missions[t.round] = rec; });
    syncToSupabase(appData);
    rollMission(['msnRoll0', 'msnRoll1'], 'msnDrawBtn', '미션 뽑는 중…', () =>
        showToast(`🎯 ${t.round}차 미션 · ${missionText(p.a.def, rec.ms[0])} · ${missionText(p.b.def, rec.ms[1])} (최대 ${p.a.lv + p.b.lv}점)`),
        [{ text: missionText(p.a.def, rec.ms[0]), who: false }, { text: missionText(p.b.def, rec.ms[1]), who: true }]);
}

// 다시 뽑기 — 포인트 2점 · 라운드마다 1회 · 두 미션 중 하나만. 처음 기록은 그대로 두고 `re: {i, id, who?, at}`를 덧붙인다.
async function redrawMission(i) {
    if (missionRoll) return;
    const me = localStorage.getItem('jtfag_my_name');
    const t = missionTarget();
    if (!me || !golfers.includes(me) || !t) return;
    const c = redrawCheck(me, t.round);
    if (!c.ok) { if (c.why) showToast(c.why); return; }
    const e = missionEntry(t.round, me);
    const cur = e && e.items.find(x => x.i === i);
    if (!cur) return;
    const ok = await showConfirmPrompt(`<b>포인트 ${REDRAW_COST}점</b>을 사용해 이 미션을 다시 뽑습니다.<br><span style="font-size:0.8rem;color:#6b7075;font-weight:600">${t.round}차 라운드 · 라운드당 1회 · 취소할 수 없습니다.<br>현재 미션: ${escapeHtml(missionText(cur.def, cur))}<br>보유 포인트 ${c.pts}점 → ${c.pts - REDRAW_COST}점</span>`, '다시 뽑기', '#2b5394');
    if (!ok) return;
    // 확인창이 떠 있는 사이 남의 저장이 들어왔을 수 있어 지금 값으로 다시 본다
    const c2 = redrawCheck(me, t.round);
    if (!c2.ok) { if (c2.why) showToast(c2.why); return; }
    const raw = appData.missions && appData.missions[t.round] && appData.missions[t.round][me];
    if (!raw) return;
    // 다시 뽑기도 같은 규칙 — 같은 종류에서 지금 것을 빼고, 남은 미션의 별과 합쳐 MISSION_LV_MIN 이상 · MAX 이하(멤버 미션은 조정된 별로)
    const keep = missionEntry(t.round, me).items.filter(x => x.i !== i).reduce((s, x) => s + x.lv, 0);
    const pick = cur.def.who ? pickWeighted(memberChoices(me, MISSION_LV_MAX - keep, cur.def.id, MISSION_LV_MIN - keep))
        : pickWeighted(selfChoices(me, keep, cur.def.id));
    if (!pick) { showToast('⚠️ 다시 뽑을 수 있는 미션이 없습니다.'); return; }
    const def = pick.def;
    const re = { i, id: def.id, at: Date.now() };
    re.lv = pick.lv;
    if (def.average) re.avg = pick.avg;
    if (def.who) re.who = pick.who;
    raw.re = re;
    writeMine(m => { m.missions[t.round] = raw; });
    syncToSupabase(appData);
    rollMission(['msnRoll' + i], 'msnRedraw' + i, '다시 뽑는 중…', () =>
        showToast(`🎯 미션을 다시 뽑았습니다 · ${missionText(def, re)} (포인트 ${REDRAW_COST}점 사용)`),
        [{ text: missionText(def, re), who: !!def.who }], 2400);
}

// 관리자 메뉴 → `🎯 미션 차수 초기화`(사용자 요청 — `미션도 관리자모드에서 차수 리셋기능`). 고른 차수의 미션(다시 뽑기 포함)을
// 없는 것으로 돌려 넷 다 다시 받을 수 있게 한다. 기록을 지우지 않고 `missionResets[차수]`에 시각을 적는다.
// **시각은 지금이 아니라 그 차수 기록 중 가장 늦은 것 + 1이다** — 폰마다 시계가 어긋나 있어, 지금 시각으로 적으면
// 시계가 느린 폰에서 바로 다시 받은 미션이 초기화 전 것으로 잘못 걸린다. 멀리건 사용권은 건드리지 않는다.
let msnResetPick = null;
async function resetMissionRound() {
    const rounds = missionRounds().filter(r => golfers.some(g => missionEntry(r, g)));
    if (!rounds.length) { showToast('ℹ️ 초기화할 미션이 없습니다.'); return; }
    msnResetPick = rounds[rounds.length - 1];
    const who = r => golfers.filter(g => missionEntry(r, g));
    const opts = rounds.slice().reverse().map(r => `<option value="${r}">${r}차 · ${who(r).length}명</option>`).join('');
    const ok = await showConfirmPrompt(`<b>미션 차수 초기화</b><br>
        <select onchange="msnResetPick = Number(this.value)" style="margin:10px 0 8px; width:100%; padding:8px; border-radius:8px; border:1px solid #d8dbd2; font-size:0.9rem; font-weight:700; background:#fff;">${opts}</select>
        <span style="font-size:0.78rem;color:#6b7075;font-weight:600">그 차수에 받은 미션(다시 뽑기 포함)이 없는 것으로 처리되고, 포인트도 다시 계산됩니다. 일정이 잡힌 차수라면 다시 받을 수 있습니다. 취소할 수 없습니다.</span>`, '초기화', '#dc2626');
    if (!ok) return;
    const r = msnResetPick;
    if (!rounds.includes(r)) return;
    const all = appData.missions && appData.missions[String(r)] || {};
    let at = 0;
    Object.keys(all).forEach(g => { const rec = all[g]; if (rec) { at = Math.max(at, Number(rec.at) || 0, (rec.re && Number(rec.re.at)) || 0); } });
    if (!appData.missionResets || typeof appData.missionResets !== 'object') appData.missionResets = {};
    appData.missionResets[String(r)] = at + 1;
    syncToSupabase(appData);
    if (typeof renderMissionPage === 'function') renderMissionPage();
    showToast(`🎯 ${r}차 미션을 초기화했습니다.`);
}

async function useMulligan() {
    const me = localStorage.getItem('jtfag_my_name');
    if (!me || !golfers.includes(me)) { showToast('⚠️ 이름을 먼저 설정해야 합니다.'); return; }
    const round = mulliganRound();
    if (mulliganUsedIn(me, round)) { showToast(`ℹ️ ${round}차 라운드에서는 이미 멀리건을 사용했습니다. 라운드당 1회만 사용할 수 있습니다.`); return; }
    const info = mulliganInfo(me);
    if (info.left <= 0) { showToast(`⚠️ 사용 가능한 멀리건이 없습니다. 다음 사용권까지 ${info.toNext}점 남았습니다.`); return; }
    const ok = await showConfirmPrompt(`<b>멀리건 사용권 1개</b>를 사용합니다.<br><span style="font-size:0.8rem;color:#6b7075;font-weight:600">${round}차 라운드 · 라운드당 1회 · 사용 후 취소할 수 없습니다.<br>보유 ${info.left}개 → ${info.left - 1}개<br>동반자에게 사용 알림이 전송됩니다.</span>`, '사용', '#2b5394');
    if (!ok) return;
    // 확인창이 떠 있는 사이 남의 저장이 들어왔을 수 있어 지금 값으로 다시 본다
    if (localStorage.getItem('jtfag_my_name') !== me) { showToast('⚠️ 본인 이름을 다시 확인해 주세요.'); return; }
    if (mulliganUsedIn(me, round)) { showToast(`ℹ️ ${round}차 라운드에서는 이미 멀리건을 사용했습니다.`); return; }
    if (mulliganInfo(me).left <= 0) { showToast('⚠️ 사용 가능한 멀리건이 없습니다.'); return; }
    const use = { r: round, t: Date.now() };
    if (!appData.mulligans || typeof appData.mulligans !== 'object') appData.mulligans = {};
    if (!Array.isArray(appData.mulligans[me])) appData.mulligans[me] = [];
    appData.mulligans[me].push(use);
    writeMine(m => { m.mulligans.push(use); });
    // 동반자 알림 — 앱에는 발송 열쇠가 없으므로 스코어 판독과 같은 줄을 탄다(api.js의 kickScorecardWorkflow →
    // scripts/read-scorecard.js가 action '멀리건'을 보고 나머지 셋에게 보낸다). 스코어카드 목록에는 안 보인다.
    const now = new Date(use.t);
    if (!Array.isArray(appData.scoreRequests)) appData.scoreRequests = [];
    appData.scoreRequests.push({
        id: `${use.t}-${Math.random().toString(36).slice(2, 8)}`,
        action: '멀리건',
        round,
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        by: me,
        left: mulliganInfo(me).left,
        status: '대기',
        note: ''
    });
    if (typeof pruneScoreRequests === 'function') pruneScoreRequests();
    renderMissionPage();
    // 깨우기 전에 저장이 닿아야 한다 — 함수가 DB의 '대기'를 보고 움직인다.
    if (!(await syncToSupabase(appData))) {
        showToast('⚠️ 멀리건 사용 기록 저장에 실패했습니다. 서버 연결 상태를 확인해 주세요.', 5000);
        return;
    }
    showToast(`⛳ 멀리건 사용권을 사용했습니다. 남은 사용권 ${mulliganInfo(me).left}개`);
    if (typeof kickScorecardWorkflow === 'function' && !(await kickScorecardWorkflow())) {
        // 방금 다른 요청으로 깨운 직후면(20초) 건너뛴다 — 한 번만 더 깨운다(대기가 없으면 함수가 그냥 돌아간다)
        setTimeout(() => { kickScorecardWorkflow(); }, 25000);
    }
}

// ── 미션 화면 ─────────────────────────────────────────────
let missionViewName = null;   // 기록을 보는 사람(처음엔 이 기기 주인)
let missionLastHtml = '';

// 미션 설명 — 끝 괄호(`(동타는 실패)`)는 안 쪼개지게 묶는다. 받은 미션 카드에서는 그 괄호를 다음 줄로 내린다(사용자 요청).
function msnHowHtml(how, br) {
    return escapeHtml(how).replace(/\s*\(([^)]*)\)$/, (m, t) => `${br ? '<br>' : ' '}<i>(${t})</i>`);
}
function msnStars(lv) { return `<span class="msn-stars" aria-label="${MISSION_LEVELS[lv].name}">${MISSION_LEVELS[lv].stars}</span>`; }
const MSN_TARGET_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.9"/></svg>';

function msnStateHtml(x) {
    if (!x) return '<span class="msn-state off">미수령</span>';
    if (x.state === 'ok') return `<span class="msn-state ok">성공 +${x.lv}</span>`;
    if (x.state === 'fail') return '<span class="msn-state fail">실패</span>';
    if (x.state === 'none') return '<span class="msn-state off">기록 없음</span>';
    return `<span class="msn-pts">+${x.lv}</span>`;
}
// 실력 보정 줄 — 조정된 멤버 미션에만(`기본 ★★ · 실력 보정 −1`)
function msnAdjHtml(x) {
    if (x.lv === x.def.lv) return '';
    const d = x.lv - x.def.lv;
    return `<div class="adj">기본 ${MISSION_LEVELS[x.def.lv].stars} · 실력 보정 ${d > 0 ? '+' : '−'}${Math.abs(d)}</div>`;
}

const MSN_PAIR_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c.6-3 2.8-4.6 5.5-4.6S13.4 16 14 19M13 15c.9-.4 1.9-.6 3-.6 2.7 0 4.9 1.6 5.5 4.6"/></svg>';
const MSN_KIND = ['본인 미션', '멤버 미션'];

function missionTargetCard(me) {
    const t = missionTarget();
    if (!t) {
        return `<div class="msn-card"><div class="msn-head"><span>라운드 미션</span></div>
            <div class="msn-empty">다음 라운드 일정이 등록되면 미션을 받을 수 있습니다.<br><span>홈의 <b>다음 라운드</b>에서 일정을 등록합니다.</span></div></div>`;
    }
    const dday = t.days === 0 ? 'D-DAY' : `D-${t.days}`;
    const mine = me && golfers.includes(me) ? missionEntry(t.round, me) : null;
    let mineHtml;
    if (!me || !golfers.includes(me)) {
        mineHtml = '<div class="msn-empty">이름을 설정한 기기에서 미션을 받을 수 있습니다.</div>';
    } else if (!mine) {
        mineHtml = `<div class="msn-draw">
            <div class="msn-roll"><span class="msn-ic">${MSN_TARGET_ICON}</span><span class="msn-roll-text" id="msnRoll0">본인 미션</span></div>
            <div class="msn-roll"><span class="msn-ic other">${MSN_PAIR_ICON}</span><span class="msn-roll-text" id="msnRoll1">멤버 미션</span></div>
            <button type="button" class="msn-draw-btn" id="msnDrawBtn" onclick="drawMission()">미션 받기</button>
            <div class="msn-note">본인 미션 1개 + 멤버 미션 1개 · 난이도 합 ★${MISSION_LV_MIN}~${MISSION_LV_MAX}개로 무작위 · 난이도는 실력에 따라 보정 · 포인트 ${REDRAW_COST}점으로 1개 다시 뽑기(1회)</div>
        </div>`;
    } else {
        const pop = Date.now() - missionLanded < 1500 ? ' pop' : '';
        const rc = redrawCheck(me, t.round);
        const sum = mine.items.reduce((s, x) => s + x.lv, 0);
        mineHtml = `<div class="msn-pair">${mine.items.map(x => `<div class="msn-mine${pop}${x.def.who ? ' other' : ''}">
            <span class="msn-ic${x.def.who ? ' other' : ''}">${x.def.who ? MSN_PAIR_ICON : MSN_TARGET_ICON}</span>
            <div class="msn-mine-body"><div class="k">${MSN_KIND[x.def.who ? 1 : 0]}${x.redrawn ? ' <em>다시 뽑음</em>' : ''}</div><div class="t" id="msnRoll${x.i}">${escapeHtml(missionText(x.def, x))}</div><div class="h">${msnHowHtml(x.def.how, true)}</div>${msnAdjHtml(x)}</div>
            <div class="msn-mine-side">${msnStars(x.lv)}<span class="msn-pts">+${x.lv}점</span>${mine.redrawn ? '' : `<button type="button" class="msn-redo" id="msnRedraw${x.i}"${rc.ok ? '' : ' disabled'} onclick="redrawMission(${x.i})">다시 뽑기</button>`}</div>
        </div>`).join('')}</div>
        <div class="msn-pair-sum"><span>난이도 합 ★${sum} · 최대 +${sum}점</span><span>${mine.redrawn ? '다시 뽑기 사용함' : (rc.ok ? `다시 뽑기 ${REDRAW_COST}점 · 1회 · 보유 ${rc.pts}점` : `다시 뽑기 ${REDRAW_COST}점 필요 · 보유 ${rc.pts || 0}점`)}</span></div>`;
    }
    const others = golfers.filter(g => g !== me).map(g => {
        const e = missionEntry(t.round, g);
        if (!e) return `<div class="msn-row"><span class="n">${escapeHtml(g)}</span><span class="m off">아직 받지 않음</span><span class="r"></span></div>`;
        const sum = e.items.reduce((s, x) => s + x.lv, 0);
        return `<div class="msn-row"><span class="n">${escapeHtml(g)}</span>
            <span class="m">${e.items.map(x => `<span class="ml">${escapeHtml(missionText(x.def, x))} ${msnStars(x.lv)}</span>`).join('')}</span>
            <span class="r"><span class="msn-pts">+${sum}</span></span></div>`;
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
    const people = golfers.map(g => ({ g, xs: missionResults(r, g) })).filter(p => p.xs.length);
    if (!people.length) return '';
    const okN = people.filter(p => p.xs.some(x => x.ok)).length;
    return `<div class="msn-card">
        <div class="msn-head"><span>${r}차 미션 결과</span><span class="msn-sub">${okN}명 성공</span></div>
        ${people.map(p => {
            const s = missionRoundSum(r, p.g);
            return `<div class="msn-res-p">
            <div class="msn-res-head"><b>${escapeHtml(p.g)}</b><span>${s ? `${s.n}개 중 ${s.okN}개 성공${s.pts ? ` · +${s.pts}점` : ''}` : '판정 없음'}</span></div>
            ${p.xs.map(x => `<div class="msn-res ${x.state}">
                <span class="mk">${x.state === 'ok' ? '✓' : (x.state === 'fail' ? '✕' : '–')}</span>
                <div class="b"><div class="n"><span>${escapeHtml(x.text)}</span></div>
                <div class="g">${x.got ? escapeHtml(x.got) : '홀 기록 없음'}</div></div>
                ${msnStateHtml(x)}</div>`).join('')}</div>`;
        }).join('')}
    </div>`;
}

function specialMissionCard(me) {
    const year = missionYearNow();
    const log = golfers.includes(me) ? specialMissionLog(me).filter(x => x.y === year) : [];
    const recent = log.slice().reverse().slice(0, 5);
    return `<div class="msn-card">
        <div class="msn-head"><span>특별미션</span><span class="msn-sub">홀 기록 자동 판정</span></div>
        ${SPECIAL_MISSION_DEFS.map(d => {
            const count = log.filter(x => x.id === d.id).reduce((sum, x) => sum + x.count, 0);
            return `<div class="msn-special"><div><b>${escapeHtml(d.text)}</b><small>${escapeHtml(d.how)}${count ? ` · 시즌 ${count}회 달성` : ''}</small></div><span class="msn-pts">+${d.pts}점</span></div>`;
        }).join('')}
        ${golfers.includes(me) ? `<div class="msn-special-total">${escapeHtml(me)} · 특별미션 ${specialMissionPoints(me, year)}점</div>` : ''}
        ${recent.map(x => `<div class="msn-special-log"><span>${x.round}차 · ${escapeHtml(x.text)}${x.count > 1 ? ` ${x.count}회` : ''}</span><b>+${x.pts}점</b></div>`).join('')}
        <div class="msn-foot">미션 수령 없이 모든 멤버에게 적용되며, 기존 홀 기록도 포함합니다. 달성 횟수만큼 미션 포인트에 합산됩니다. 동일 홀의 홀인원·이글·알바트로스는 중복 지급하지 않습니다.</div>
    </div>`;
}

function missionPointCards(me) {
    const rows = golfers.map(g => ({ g, p: missionSeasonPoints(g), m: mulliganInfo(g) }));
    const selected = golfers.includes(missionViewName) ? missionViewName : (golfers.includes(me) ? me : golfers[0]);
    return `<div class="msn-card msn-points-card">
        <div class="msn-head"><span>미션 포인트</span></div>
        <div class="bdg-people msn-point-people">${rows.map(x => {
            return `<button type="button" class="bdg-person msn-point-person${x.g === selected ? ' on' : ''}" aria-pressed="${x.g === selected}"${x.g === me ? ` aria-haspopup="dialog" aria-label="${escapeHtml(x.g)} 미션 포인트 · 멀리건 사용"` : ''} onclick="selectMissionPointPerson('${x.g}')">
                <span class="bdg-pname">${escapeHtml(x.g)}</span>
                <span class="msn-point-value">${x.p}<small>점</small></span>
                <span class="msn-point-ticket">사용권 ${x.m.left}장</span>
            </button>`;
        }).join('')}</div>
    </div>`;
}

// 본인 포인트 카드에서만 여는 멀리건 창. 사용 규칙·저장·동반자 알림은 useMulligan()을 그대로 쓴다.
let missionMulliganPopup = null;
let missionMulliganBusy = false;
function mulliganPopupBody(me) {
    const m = mulliganInfo(me);
    const pct = Math.round((MULLIGAN_STEP - m.toNext) / MULLIGAN_STEP * 100);
    const uses = golfers.flatMap(g => mulliganUses(g).map(u => ({ g, u }))).sort((a, b) => b.u.t - a.u.t).slice(0, 5);
    const fmt = t => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
    return `<p class="msn-mulligan-rule">포인트 ${MULLIGAN_STEP}점마다 1장 · 라운드당 1회</p>
        <div class="msn-mul">
            <div class="msn-ticket"><span class="big">${m.left}</span><span class="lb">장 보유</span></div>
            <div class="msn-mul-body">
                <div class="msn-mul-line">다음 사용권까지 <b>${m.toNext}점</b></div>
                <div class="msn-mul-bar"><i style="width:${pct}%"></i></div>
                <div class="msn-mul-sub">통산 ${m.pts}점 · 받은 사용권 ${m.earned}장 · 사용 ${m.used}장${missionRedraws(me) ? ` · 다시 뽑기 ${missionRedraws(me)}회(−${missionRedraws(me) * REDRAW_COST}점)` : ''}</div>
            </div>
        </div>
        ${uses.length ? `<div class="msn-uses"><div class="lb">최근 사용</div>${uses.map(x => `<div class="msn-use"><span>${escapeHtml(x.g)}</span><span>${x.u.r ? x.u.r + '차' : ''} · ${fmt(x.u.t)}</span></div>`).join('')}</div>` : ''}`;
}
function closeMulliganPopup() {
    if (!missionMulliganPopup) return;
    const { element, owner } = missionMulliganPopup;
    missionMulliganPopup = null;
    element.classList.remove('show');
    setTimeout(() => element.remove(), 260);
    const card = document.querySelector('.msn-point-person[aria-haspopup="dialog"]');
    if (localStorage.getItem('jtfag_my_name') === owner && card) card.focus();
}
function refreshMulliganPopup() {
    const popup = missionMulliganPopup;
    if (!popup) return;
    if (popup.owner !== localStorage.getItem('jtfag_my_name') || !golfers.includes(popup.owner)) { closeMulliganPopup(); return; }
    const html = mulliganPopupBody(popup.owner);
    if (html !== popup.html) { popup.html = html; popup.body.innerHTML = html; }
    const round = mulliganRound();
    const usedNow = round > 0 && mulliganUsedIn(popup.owner, round);
    const empty = mulliganInfo(popup.owner).left <= 0;
    popup.useButton.disabled = missionMulliganBusy || empty || usedNow;
    popup.useButton.textContent = missionMulliganBusy ? '처리 중…' : usedNow ? `${round}차 사용 완료` : empty ? '사용권 없음' : '멀리건 사용';
}
function openMulliganPopup(name) {
    if (name !== localStorage.getItem('jtfag_my_name') || !golfers.includes(name)) return;
    if (missionMulliganPopup) { refreshMulliganPopup(); return; }
    const element = document.createElement('div');
    element.className = 'msn-mulligan-overlay';
    element.innerHTML = `<section class="msn-mulligan-sheet" role="dialog" aria-modal="true" aria-labelledby="msnMulliganTitle">
        <div class="msn-mulligan-head"><div><p>${escapeHtml(name)}</p><h2 id="msnMulliganTitle">멀리건 사용권</h2></div><button type="button" class="msn-mulligan-close" aria-label="닫기" onclick="closeMulliganPopup()">×</button></div>
        <div class="msn-mulligan-content"></div>
        <div class="msn-mulligan-actions"><button type="button" class="msn-use-btn" onclick="useMulliganFromPopup()">멀리건 사용</button></div>
    </section>`;
    missionMulliganPopup = { element, owner: name, body: element.querySelector('.msn-mulligan-content'), useButton: element.querySelector('.msn-use-btn'), html: '' };
    element.addEventListener('click', e => { if (e.target === element) closeMulliganPopup(); });
    element.addEventListener('keydown', e => {
        if (missionMulliganBusy) return;
        if (e.key === 'Escape') { e.preventDefault(); closeMulliganPopup(); }
        if (e.key === 'Tab') {
            const buttons = [...element.querySelectorAll('button:not(:disabled)')];
            const next = e.shiftKey ? buttons[buttons.length - 1] : buttons[0];
            const edge = e.shiftKey ? buttons[0] : buttons[buttons.length - 1];
            if (document.activeElement === edge) { e.preventDefault(); next.focus(); }
        }
    });
    document.body.appendChild(element);
    refreshMulliganPopup();
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (missionMulliganPopup && missionMulliganPopup.element === element) element.classList.add('show');
    }));
    element.querySelector('.msn-mulligan-close').focus({ preventScroll: true });
}
async function useMulliganFromPopup() {
    const popup = missionMulliganPopup;
    if (!popup || missionMulliganBusy) return;
    if (popup.owner !== localStorage.getItem('jtfag_my_name')) { closeMulliganPopup(); return; }
    missionMulliganBusy = true;
    refreshMulliganPopup();
    try { await useMulligan(); }
    finally {
        missionMulliganBusy = false;
        refreshMulliganPopup();
        if (missionMulliganPopup) missionMulliganPopup.element.querySelector('.msn-mulligan-close').focus();
    }
}
function selectMissionPointPerson(name) {
    selectMissionPerson(name);
    if (name === localStorage.getItem('jtfag_my_name')) openMulliganPopup(name);
}

// 접었다 펴는 카드(사용자 요청 — 기록이 쌓이면 화면이 길어진다).
// 미션 기록과 목록은 앱을 열 때마다 접혀 있고, 이번 실행 동안만 펼친 상태를 기억한다.
const MSN_FOLD_DEFAULT = { hist: false, list: false };  // true = 펼침
const MSN_FOLD_MEMORY = { hist: true, list: true };     // 이번 실행 동안만 펼친 상태를 기억한다
const MSN_HIST_SHOWN = 5;                                // 기록은 최근 다섯 개까지 펴고 나머지는 `이전 기록 더 보기`
let missionHistAll = false;
const msnFoldNow = {};
function missionFold(key) {
    if (MSN_FOLD_MEMORY[key]) return typeof msnFoldNow[key] === 'boolean' ? msnFoldNow[key] : MSN_FOLD_DEFAULT[key];
    try { const m = JSON.parse(localStorage.getItem('jtfag_msn_fold') || '{}'); if (typeof m[key] === 'boolean') return m[key]; } catch (e) {}
    return MSN_FOLD_DEFAULT[key];
}
function toggleMissionFold(key) {
    if (MSN_FOLD_MEMORY[key]) { msnFoldNow[key] = !missionFold(key); renderMissionPage(); return; }
    let m = {};
    try { m = JSON.parse(localStorage.getItem('jtfag_msn_fold') || '{}') || {}; } catch (e) {}
    m[key] = !missionFold(key);
    try { localStorage.setItem('jtfag_msn_fold', JSON.stringify(m)); } catch (e) {}
    renderMissionPage();
}
function showAllMissionHistory() { missionHistAll = true; renderMissionPage(); }
const MSN_CHEVRON = '<svg class="msn-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
function msnFoldHead(key, title, sub) {
    const open = missionFold(key);
    return `<button type="button" class="msn-head msn-fold${open ? ' open' : ''}" aria-expanded="${open}" onclick="toggleMissionFold('${key}')"><span>${title}</span><span class="msn-sub">${sub}${MSN_CHEVRON}</span></button>`;
}

function missionHistoryCard(me) {
    if (!missionViewName || !golfers.includes(missionViewName)) missionViewName = golfers.includes(me) ? me : golfers[0];
    const g = missionViewName;
    const rounds = missionRounds().filter(r => missionEntry(r, g)).reverse();
    const log = missionLog(g);
    const okN = log.filter(x => x.ok).length;
    const head = msnFoldHead('hist', '미션 기록', log.length ? `${log.length}개 중 ${okN}개 성공` : '');
    if (!missionFold('hist')) return `<div class="msn-card folded">${head}</div>`;
    const shown = missionHistAll ? rounds : rounds.slice(0, MSN_HIST_SHOWN);
    const more = rounds.length - shown.length;
    return `<div class="msn-card">
        ${head}
        <div class="msn-people">${golfers.map(n => `<button type="button" class="${n === g ? 'on' : ''}" onclick="selectMissionPerson('${n}')">${escapeHtml(n)}</button>`).join('')}</div>
        ${rounds.length ? `<div class="msn-hist">${shown.map(r => missionResults(r, g).map((x, k) => `<div class="msn-h${k ? ' cont' : ''}">
            <span class="rd">${k ? '' : r + '차'}</span>
            <span class="tx">${escapeHtml(x.text)} ${msnStars(x.lv)}${x.got ? `<small>${escapeHtml(x.got)}</small>` : ''}</span>
            ${msnStateHtml(x)}</div>`).join('')).join('')}</div>${more > 0 ? `<button type="button" class="msn-more" onclick="showAllMissionHistory()">이전 기록 ${more}라운드 더 보기</button>` : ''}` : '<div class="msn-empty">아직 받은 미션이 없습니다.</div>'}
    </div>`;
}

function missionListCard() {
    const self = MISSION_DEFS.filter(d => !d.who), other = MISSION_DEFS.filter(d => d.who);
    const head = msnFoldHead('list', '미션 목록', `본인 ${self.length} · 멤버 ${other.length}`);
    if (!missionFold('list')) return `<div class="msn-card folded">${head}</div>`;
    const group = (title, sub, list) => `<div class="msn-lv">
            <div class="msn-lv-head">${title} <span class="msn-sub">${sub}</span></div>
            ${[1, 2, 3].map(lv => list.filter(d => d.lv === lv).map(d => `<div class="msn-lv-item"><b>${msnStars(d.lv)} ${escapeHtml(missionText(d, null))}</b><span>${msnHowHtml(d.how)}${d.fair ? ' <em class="msn-fix">보정 없음</em>' : ''}</span></div>`).join('')).join('')}
        </div>`;
    return `<div class="msn-card">
        ${head}
        ${group('본인 미션', '내 기록으로 판정', self)}
        ${group('멤버 미션', '○○ = 무작위로 정해지는 다른 멤버', other)}
        <div class="msn-foot">라운드마다 본인 미션 1개와 멤버 미션 1개를 받으며, 두 미션의 난이도 합은 ★${MISSION_LV_MIN}~${MISSION_LV_MAX}개입니다(예: ★★★ + ★ · ★★ + ★ · ★★ + ★★). 성공한 미션의 별 수만큼 포인트를 얻습니다. '파'는 파 이하(버디 포함), '더블보기'·'트리플 보기'는 그 이상까지 셉니다. 대결 미션은 동률이면 실패이며, 협동 미션은 나와 대상 멤버가 함께 달성해야 합니다. 목록의 별은 기본 난이도이며, 받을 때 최근 5경기 평균 타수로 실력을 보아 조정합니다 — 본인 미션은 나, 대결은 나와 대상 멤버의 차이, 응원은 대상 멤버, 협동은 두 사람의 평균을 넷의 평균과 견주어 ${MISSION_ADJ_STEP}타 이상 차이 나면 ±1(★1~★3). '보정 없음' 미션은 실력과 관계없이 기본 별 그대로입니다. 조정된 별은 받는 순간 고정되며 그만큼 포인트를 얻습니다. 본인 또는 대상 멤버의 기록이 없는 라운드(불참)는 판정하지 않습니다. 받은 미션 중 1개를 포인트 ${REDRAW_COST}점을 사용해 라운드마다 1회 다시 뽑을 수 있습니다.</div>
    </div>`;
}

function renderMissionPage() {
    const box = document.getElementById('missionPage');
    if (!box || typeof golfers === 'undefined' || missionRoll) return;
    const me = localStorage.getItem('jtfag_my_name');
    const html = missionPointCards(me) + (PREDICTION_ENABLED ? '<div id="predictionHost"></div>' : '') + missionTargetCard(me) + missionLastResultCard() + specialMissionCard(me) + missionHistoryCard(me) + missionListCard();
    // 같으면 갈아 끼우지 않는다 — 남의 저장마다 renderAll이 돈다
    if (html !== missionLastHtml) { missionLastHtml = html; box.innerHTML = html; }
    if (PREDICTION_ENABLED && typeof renderPredictionCard === 'function') renderPredictionCard();
    refreshMulliganPopup();
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
    const judged = missionRounds().filter(r => roundHasHoles(r) && golfers.some(g => missionRoundSum(r, g)));
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
    const rows = golfers.map(g => missionRoundSum(r, g) && { g, s: missionRoundSum(r, g) }).filter(Boolean);
    rows.sort((a, b) => (b.s.pts - a.s.pts) || (b.s.okN - a.s.okN));
    const okN = rows.filter(x => x.s.okN > 0).length;
    const STEP = 0.35;
    // 이 차수로 멀리건 사용권이 늘어난 사람
    const before = g => Math.floor(missionPoints(g, undefined, r - 1) / MULLIGAN_STEP);
    const after = g => Math.floor(missionPoints(g, undefined, r) / MULLIGAN_STEP);
    const gained = golfers.map(g => ({ g, n: after(g) - before(g) })).filter(x => x.n > 0);
    const kings = missionKings();
    const tail = 0.5 + rows.length * STEP;
    const o = document.createElement('div');
    o.className = 'reveal-overlay msn-poster';
    o.innerHTML = `
        <div class="mp-num" aria-hidden="true">${String(r).padStart(2, '0')}</div>
        <div class="mp-ey">MISSION RESULT</div>
        <div class="mp-title">${r}차전<br>미션 결과</div>
        <div class="mp-rows">${rows.map((x, i) => `<div class="mp-row${x.s.okN ? '' : ' fail'}" style="animation-delay:${0.5 + i * STEP}s">
            <span class="mk">${x.s.okN}/${x.s.n}</span>
            <div class="b"><div class="n">${escapeHtml(x.g)}</div>${x.s.xs.map(m => `<div class="m${m.ok ? ' ok' : ''}">${m.ok ? '✓' : '✕'} ${escapeHtml(m.text)} · <b>${escapeHtml(m.got)}</b></div>`).join('')}</div>
            <span class="p">${x.s.pts ? '+' + x.s.pts : '실패'}</span></div>`).join('')}</div>
        <div class="mp-sum" style="animation-delay:${tail}s">
            <span><b>${okN}명 성공</b>${kings.length ? ` · 미션 포인트 1위 <b>${kings.map(escapeHtml).join(', ')} ${missionSeasonPoints(kings[0])}점</b>` : ''}</span>
            ${gained.map(x => `<span class="mp-gain">🎟️ <b>${escapeHtml(x.g)}</b> 멀리건 사용권 +${x.n}</span>`).join('')}
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
