// calc.js - 정산, 핸디캡, 통계 및 뱃지 생성 전체 로직

// 계급이 매겨진 마지막 차수(0부터). 결과 발표 연출이 읽는다. -1이면 아직 없다.
let lastRankedRound = -1;

// 합산 금액 문구. 카운트업 연출(ui.js)이 중간 숫자를 만들 때도 같은 규칙을 써야
// 끝났을 때 값이 어긋나지 않는다.
function formatFinalBalance(v) {
    if (v === 0) return "0원";
    return (v > 0 ? "+" : "") + (v / 10000).toFixed(1) + "만";
}

// 홈의 합산 금액은 기본으로 접혀 있고(●●●●), 누르면 네 칸이 함께 펼쳐진다(사용자 요청). 앱을 열 때마다 접힌 채로 시작한다.
let summaryTotalsShown = false;
const SUMMARY_MASK = '●●●●';
function toggleSummaryTotals() {
    summaryTotalsShown = !summaryTotalsShown;
    document.querySelectorAll('.summary-item .final-box').forEach(box => {
        box.setAttribute('aria-expanded', String(summaryTotalsShown));
        const total = box.querySelector('.final-total'), label = box.querySelector('.final-label');
        if (label) label.textContent = summaryTotalsShown ? '합산 ▴' : '합산 ▾';
        if (!total) return;
        total.classList.toggle('masked', !summaryTotalsShown);
        total.style.color = summaryTotalsShown ? (total.dataset.color || '') : '';
        total.textContent = summaryTotalsShown ? formatFinalBalance(parseFloat(total.dataset.final) || 0) : SUMMARY_MASK;
    });
    if (summaryTotalsShown && typeof runFinalCountUp === 'function') runFinalCountUp();
}

// 그 차수의 정산이 끝났는가 — 남은 금액이 적혀야 끝난 것이다(사용자 요청 — 시작 금액만 적었을 때
// 통합 정산 요약 합산에 `-30만`처럼 바로 반영되어 동반자들이 오해했다).
// 시작 금액만 있으면 아직 게임 중이라 요약·표의 타수정산·니어 잔액에서 모두 빼 둔다.
// 남은 금액 0원은 '아직 안 적음'과 구별할 수 없어 같은 것으로 본다(다 잃는 일은 사실상 없다).
function moneySettled(m) { return !!m && (Number(m.end) || 0) > 0; }

// 그 차수의 스코어가 들어왔는가 — 넷 다 타수가 있는 마지막 차수까지를 끝난 것으로 본다(사용자 요청 —
// 10차 스코어 등록 전인데 정산이 먼저 반영되어 혼동됐다). 그 뒤의 차수는 `스코어 입력 대기`라
// 요약 합산·표의 계급정산·타수정산·니어 잔액에서 모두 빠진다. 계급은 이 타수로 매겨지므로 곧 '계급정산 확정'이다.
// 마지막 차수까지로 보는 것은, 예전 차수에 한 사람 타수가 비어 있어도 그 차수 정산이 사라지지 않게 하려는 것이다.
function lastScoredRound() {
    const sc = (appData && appData.scores) || {};
    for (let r = (appData.totalRounds || 0) - 1; r >= 0; r--) {
        if (golfers.every(g => { const v = parseFloat(sc[g] ? sc[g][r] : NaN); return !isNaN(v) && v > 0; })) return r;
    }
    return -1;
}
function roundScored(r) { return r <= lastScoredRound(); }

// 그 차수의 금액을 네 명 모두 적었는가(남은 금액 기준 — moneySettled와 같은 잣대).
// 스코어가 들어왔는데 이게 거짓이면 '정산 입력 중'이라, 새 차수가 생겨도 차수 선택을 그 차수에 둔다(사용자 요청).
function roundMoneyDone(r) {
    const row = appData && appData.roundMoney && appData.roundMoney[r];
    return !!row && golfers.every(g => moneySettled(row[g]));
}
function roundMoneyPending(r) { return r >= 0 && roundScored(r) && !roundMoneyDone(r); }
// 앱을 처음 열 때 고를 차수 — 마지막 차수가 아직 시작 전이고 바로 앞 차수 금액이 덜 적혔으면 그 앞 차수에 머문다.
function defaultMoneyRound() {
    const n = (appData && appData.totalRounds) || 0, last = n - 1;
    if (n < 2) return Math.max(last, 0);
    const row = (appData.roundMoney && appData.roundMoney[last]) || {};
    const started = golfers.some(g => { const m = row[g]; return m && ((Number(m.start) || 0) || (Number(m.end) || 0) || (Number(m.donate) || 0)); });
    return (!started && roundMoneyPending(last - 1)) ? last - 1 : last;
}

// 찬조 합계 — 모임을 위해 그 사람이 쓴 돈. `roundMoney[차수][이름].donate`에 있다.
// 정산에서 나온 값이 아니라 따로 적은 값이라, 합산에서 그만큼 **뺀다**
// (-50만인 사람이 5만을 찬조하면 -55만). 예전 payload에는 키가 없으므로 없으면 0.
function donationOf(name) {
    if (!appData.roundMoney) return 0;
    let sum = 0;
    for (let r = 0; r < (appData.totalRounds || 0); r++) {
        const m = appData.roundMoney[r] && appData.roundMoney[r][name];
        sum += Number(m && m.donate) || 0;
    }
    return sum;
}

// 파3·파4·파5 각각에서 파 대비 평균이 가장 좋은 사람을 가린다.
// ROUND_HOLES(stats.js)의 홀 단위 기록이 있어야 하고, 없으면 아무도 뽑지 않는다.
function computeParSpecialists() {
    golferParSpecialists = { 3: [], 4: [], 5: [] };
    if (typeof ROUND_HOLES === 'undefined') return;

    const sums = {};   // sums[파][이름] = { 합, 홀수 }
    [3, 4, 5].forEach(p => { sums[p] = {}; golfers.forEach(g => sums[p][g] = { total: 0, holes: 0 }); });

    Object.keys(ROUND_HOLES).forEach(round => {
        const par = ROUND_HOLES[round].par, rel = ROUND_HOLES[round].rel;
        if (!par || !rel) return;
        golfers.forEach(g => {
            if (!Array.isArray(rel[g])) return;
            rel[g].forEach((x, i) => {
                const p = par[i];
                if (!sums[p] || typeof x !== 'number') return;
                sums[p][g].total += x;
                sums[p][g].holes++;
            });
        });
    });

    [3, 4, 5].forEach(p => {
        // 표본이 모자란 사람은 비교에서 뺀다. 아무도 안 남으면 그 파 종류는 수상자가 없다.
        const eligible = golfers.filter(g => sums[p][g].holes >= MIN_PAR_TYPE_HOLES);
        if (eligible.length < 2) return;
        const avgOf = g => sums[p][g].total / sums[p][g].holes;
        const best = Math.min(...eligible.map(avgOf));
        golferParSpecialists[p] = eligible.filter(g => avgOf(g) === best);
    });
}

// 뒤에서부터 독수리(계급 0)가 몇 번 연속인지 센다.
// 3연속에서 멈추지 않는다 — 4연속, 5연속이면 뱃지 숫자가 그대로 따라 올라간다.
function eagleStreak(ranks) {
    let n = 0;
    for (let i = ranks.length - 1; i >= 0 && ranks[i] === 0; i--) n++;
    return n;
}

// 요약 카드 뱃지의 등급 — 얼마나 이루기 어려운가로 나눴다. 놀리는 뱃지는 따로(불명예).
// 독수리 연속(badge-eagle-2/3)은 원래 색이 따로 있어 여기 넣지 않는다. 루키는 회색 그대로.
const SUMMARY_BADGE_TONE = {
    'badge-avg-1': 'gold', 'badge-best-score': 'gold', 'badge-single': 'gold', 'badge-holeinone': 'gold', 'badge-eagle-hit': 'gold',
    'badge-birdie': 'silver', 'badge-par': 'silver', 'badge-par3': 'silver', 'badge-par4': 'silver', 'badge-par5': 'silver', 'badge-phoenix': 'silver',
    'badge-rebound': 'bronze', 'badge-uptrend': 'bronze', 'badge-rival': 'bronze',
    'badge-mission-king': 'title',
    'badge-donor': 'tease', 'badge-downtrend': 'tease', 'badge-fluctuation': 'tease', 'badge-bomb': 'tease'
};

function getGolferBadgesArray(g, overallMinAvg, overallMinScore) {
    let badges = [];
    const ranks = golferRankHistory[g] || [];
    
    const imgE = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8343.png" style="height: 1.1em; vertical-align: middle;">`;

    const myStats = (typeof CUMULATIVE_STATS !== 'undefined') ? CUMULATIVE_STATS : {
        "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "김지명": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "신성호": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "박승수": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }
    };

    const streak = eagleStreak(ranks);
    if (streak >= 3) {
        // 연속수가 늘수록 뱃지도 등급이 올라간다 — 3연속 금, 4연속 불꽃, 5연속부터 전설.
        // 숫자만 바뀌고 모양이 그대로면 3연속이나 10연속이나 똑같아 보인다.
        const tier = streak >= 5 ? ' eagle-t5' : (streak >= 4 ? ' eagle-t4' : '');
        const mark = streak >= 5 ? ' 👑' : (streak >= 4 ? ' 🔥' : '');
        // 눌러서 축포를 다시 볼 수 있게 해 둔다. 축하는 여러 번 받을수록 좋다.
        badges.push({ html: `<div class="season-badge badge-eagle-3${tier}" style="cursor:pointer;" onclick="event.stopPropagation(); celebrateEagleStreak('${g}', ${streak})">${imgE} 독수리 ${streak}연속!${mark}</div>`, desc: `${streak}경기 연속 독수리 계급 달성` });
    } else if (streak === 2) {
        badges.push({ html: `<div class="season-badge badge-eagle-2">${imgE} 독수리 2연속!</div>`, desc: "최근 2경기 연속 독수리 계급 달성" });
    }

    // 미션왕(mission.js) — 올해 미션 포인트 1위. 요약 카드는 두 칸만 보이므로 독수리 연속 바로 뒤에 둔다.
    if (typeof missionKings === 'function' && missionKings().includes(g)) {
        badges.push({ html: `<div class="season-badge badge-mission-king">🎯 미션왕</div>`, desc: "올해 미션 포인트 1위" });
    }
    if (overallMinAvg !== Infinity && golferAvgScores[g] === overallMinAvg) {
        badges.push({ html: `<div class="season-badge badge-avg-1">🏆 평균타수 1위</div>`, desc: "리그 전체 참가자 중 평균 타수 1위" });
    }
    if (overallMinScore !== Infinity && golferMinScores[g] === overallMinScore) {
        badges.push({ html: `<div class="season-badge badge-best-score">🎯 최저타 ${overallMinScore}타</div>`, desc: "리그 전체 기록 중 가장 낮은 최저타 달성" });
    }

    if (golferSingleMap[g]) {
        badges.push({ html: `<div class="season-badge badge-single">🎯 싱글의 품격</div>`, desc: "단일 라운드 79타 이하 달성" });
    }
    if (golferReboundMap[g]) {
        badges.push({ html: `<div class="season-badge badge-rebound">🔥 극적 반전</div>`, desc: "이번 차수에 직전 차수보다 타수를 가장 많이 줄임" });
    }
    if (golferPhoenixWins[g]) {
        badges.push({ html: `<div class="season-badge badge-phoenix">${imgE} 불사조</div>`, desc: "상위 계급을 상대로 1:1 최다승 기록" });
    }
    if (golferDonorMap[g]) {
        badges.push({ html: `<div class="season-badge badge-donor">💸 기부왕</div>`, desc: "합산 정산 금액 손실 1위" });
    }
    if (golferUptrendMap[g]) {
        badges.push({ html: `<div class="season-badge badge-uptrend">📈 상승세</div>`, desc: "최근 경기 스코어가 지속적으로 줄어드는 중" });
    }
    if (golferDowntrendMap[g]) {
        badges.push({ html: `<div class="season-badge badge-downtrend">📉 하락세</div>`, desc: "최근 경기 스코어가 지속적으로 늘어나는 중" });
    }
    if (golferFluctuationMap[g]) {
        badges.push({ html: `<div class="season-badge badge-fluctuation">🎢 기복왕</div>`, desc: "라운드별 스코어 기복이 가장 큼" });
    }
    if (golferRivalMap[g]) {
        badges.push({ html: `<div class="season-badge badge-rival">⚔️ 영원의 라이벌</div>`, desc: "1:1 매치에서 가장 많은 무승부를 기록함" });
    }

    if (myStats[g].holeInOne > 0) {
        badges.push({ html: `<div class="season-badge badge-holeinone">👑 기적의 사나이</div>`, desc: "통산 홀인원 기록자" });
    }
    if (myStats[g].eagle > 0) {
        badges.push({ html: `<div class="season-badge badge-eagle-hit">${imgE} 이글 헌터</div>`, desc: "통산 이글 기록자" });
    }
    if (golferMaxBirdie.includes(g)) {
        badges.push({ html: `<div class="season-badge badge-birdie">🦋 버디 수집가</div>`, desc: "리그 내 누적 버디 횟수 1위" });
    }
    if (golferMaxPar.includes(g)) {
        badges.push({ html: `<div class="season-badge badge-par">🛡️ 철벽 방어</div>`, desc: "리그 내 누적 파 횟수 1위" });
    }
    if (golferMaxDoublePar.includes(g)) {
        badges.push({ html: `<div class="season-badge badge-bomb">💣 폭탄 처리반</div>`, desc: "리그 내 누적 양파 횟수 1위" });
    }

    if (golferParSpecialists[3].includes(g)) {
        badges.push({ html: `<div class="season-badge badge-par3">🎯 숏홀 스나이퍼</div>`, desc: "파3 홀 파 대비 평균 1위" });
    }
    if (golferParSpecialists[4].includes(g)) {
        badges.push({ html: `<div class="season-badge badge-par4">🎪 파4 지배자</div>`, desc: "파4 홀 파 대비 평균 1위" });
    }
    if (golferParSpecialists[5].includes(g)) {
        badges.push({ html: `<div class="season-badge badge-par5">💪 롱홀 헌터</div>`, desc: "파5 홀 파 대비 평균 1위" });
    }

    if (badges.length === 0) {
        badges.push({ html: `<div class="season-badge badge-rookie">🌱 루키</div>`, desc: "아직 획득한 뱃지가 없음" });
    }

    // 등급 색(골드·실버·브론즈·불명예)을 붙인다 — 사용자 요청. 색은 style.css의 `.tone-*`.
    badges.forEach(b => {
        const m = b.html.match(/class="season-badge (badge-[\w-]+)/);
        const tone = m && SUMMARY_BADGE_TONE[m[1]];
        if (tone) b.html = b.html.replace('class="season-badge ', `class="season-badge tone-${tone} `);
    });
    return badges;
}

// 내 목표 타수 = 직전 5경기 평균(내림). 11차부터 적용한다(사용자 결정 — 3경기 → 5경기).
// 규칙 변경 전 확정된 1~10차 정산은 직전 2경기 기준을 그대로 유지한다.
const HANDICAP_ROUNDS = 5;
const LEGACY_HANDICAP_ROUNDS = 2;
const HANDICAP_RULE_FROM_ROUND = 11;  // 1부터 시작하는 차수 — 이 차수부터 5경기 평균 · 보정타수 순위 · 새 계급벌금

// r(0부터)차수의 핸디캡을 낼 때 쓰는 경기 수
function handicapCountFor(r) { return r + 1 < HANDICAP_RULE_FROM_ROUND ? LEGACY_HANDICAP_ROUNDS : HANDICAP_ROUNDS; }

// 이어진 차수는 `6~10차`로, 아니면 `6·8·9차`로 적는다.
function roundRangeText(rounds) {
    if (!rounds.length) return '';
    const nos = rounds.map(r => r + 1);
    const run = nos.every((n, i) => i === 0 || n === nos[i - 1] + 1);
    return (run && nos.length > 2 ? `${nos[0]}~${nos[nos.length - 1]}` : nos.join('·')) + '차';
}

// 현재 목표 타수는 직전 다섯 경기, 과거 정산은 해당 차수에 적용된 경기 수로 평균을 낸다.
function handicapAverageAt(end, count = HANDICAP_ROUNDS) {
    if (end < count - 1) return null;
    const averages = {};
    for (const g of golfers) {
        let sum = 0;
        for (let r = end - count + 1; r <= end; r++) {
            const score = parseFloat((appData.scores[g] || [])[r]);
            if (!Number.isFinite(score) || score <= 0) return null;
            sum += score;
        }
        averages[g] = Math.floor(sum / count);
    }
    return averages;
}

function latestHandicapRounds() {
    for (let r = appData.totalRounds - 1; r >= HANDICAP_ROUNDS - 1; r--) {
        if (handicapAverageAt(r)) return Array.from({ length: HANDICAP_ROUNDS }, (_, i) => r - HANDICAP_ROUNDS + 1 + i);
    }
    return [];
}

function calculateAndRender() {
    const targetRounds = latestHandicapRounds();
    const averages = targetRounds.length ? handicapAverageAt(targetRounds[targetRounds.length - 1]) : null;

    const infoText = document.getElementById('infoText');
    const matchCardTitle = document.getElementById('matchCardTitle');

    const roundStr = roundRangeText(targetRounds);
    const titleStr = roundStr ? `최근 ${HANDICAP_ROUNDS}경기(${roundStr})` : `최근 ${HANDICAP_ROUNDS}경기`;
    const avgTitleStr = roundStr ? `${roundStr} 평균` : `최근 ${HANDICAP_ROUNDS}경기 평균`;

    if (infoText) infoText.innerHTML = `💡 <b>${HANDICAP_ROUNDS}경기 평균</b> = 내 목표 타수`;   // 저장 상태 칩과 한 줄에 들어가게 짧게 적는다(범위는 홈 카드·표 머리에 있다)
    if (matchCardTitle) matchCardTitle.textContent = avgTitleStr;

    processAllRoundSettlements();
    renderHandicapMatchCard(targetRounds);
    renderRoundCards();   // 계급·보정타수가 채워진 뒤에 그려야 한다
}

/* 라베(개인 최저타) 갱신 — 11차부터 종전 개인 최저타(1~직전 차수 전체)보다 줄인 타수 1타당 1만원을 동반자(나머지 셋)가 각자 준다 — 공금에서 나가지 않는다.
   pay = 동반자 한 사람이 낼 금액, total = 받는 사람이 받을 합계.
   **저장하지 않고 기록(appData.scores)에서 그때그때 셈한다** — 타수를 고치면 지급 내역도 따라온다.
   종전 기록이 없는 첫 경기·타수가 비었거나 0 이하인 칸은 건너뛴다. 같은 타수는 갱신이 아니다. */
function computeRaveAwards() {
    const out = [];
    golfers.forEach(g => {
        const sc = (appData.scores && appData.scores[g]) || [];
        let best = Infinity;
        for (let r = 0; r < (appData.totalRounds || 0); r++) {
            const v = parseFloat(sc[r]);
            if (!Number.isFinite(v) || v <= 0) continue;
            if (r + 1 >= RAVE_FROM_ROUND && best !== Infinity && v < best) {
                const pay = (best - v) * RAVE_PAY_PER_STROKE;
                const payers = golfers.length - 1;
                out.push({ round: r, name: g, score: v, prev: best, pay, payers, total: pay * payers });
            }
            if (v < best) best = v;
        }
    });
    return out;
}

function processAllRoundSettlements() {
    const totalRounds = appData.totalRounds;
    const totalRankProfit = {};
    const roundRankProfit = {};
    golferRankHistory = {}; 
    rankedRoundsList = [];
    roundNetInfo = {};
    raveAwards = computeRaveAwards();
    golferSingleMap = {};
    golferReboundMap = {};
    golferPhoenixWins = {};
    golferDonorMap = {};
    golferUptrendMap = {};
    golferDowntrendMap = {};
    golferFluctuationMap = {};
    golferRivalMap = {}; 

    const globalTies = {};
    // 불사조 — 직전 차수에 나보다 높은 계급이던 사람을 그 차수 1:1에서 이긴 횟수(하극상).
    const upsetWins = {};

    golfers.forEach(g => {
        totalRankProfit[g] = 0;
        roundRankProfit[g] = {};
        golferRankHistory[g] = [];
        golferSingleMap[g] = false;
        golferDonorMap[g] = false;
        golferUptrendMap[g] = false;
        golferDowntrendMap[g] = false;
        golferFluctuationMap[g] = false;
        golferRivalMap[g] = false;
        globalTies[g] = 0;
        upsetWins[g] = 0;
    });

    const myStats = (typeof CUMULATIVE_STATS !== 'undefined') ? CUMULATIVE_STATS : {
        "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "김지명": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "신성호": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "박승수": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }
    };

    let maxBirdie = 0;
    let maxPar = 0;
    let maxDPar = 0;

    golfers.forEach(g => {
        if (myStats[g].birdie > maxBirdie) { maxBirdie = myStats[g].birdie; }
        if (myStats[g].par > maxPar) { maxPar = myStats[g].par; }
        if (myStats[g].doublePar > maxDPar) { maxDPar = myStats[g].doublePar; }
    });

    golferMaxBirdie = golfers.filter(g => myStats[g].birdie === maxBirdie && maxBirdie > 0);
    golferMaxPar = golfers.filter(g => myStats[g].par === maxPar && maxPar > 0);
    golferMaxDoublePar = golfers.filter(g => myStats[g].doublePar === maxDPar && maxDPar > 0);

    computeParSpecialists();

    golfers.forEach(g => {
        if (appData.scores && appData.scores[g]) {
            appData.scores[g].forEach(s => {
                const num = parseFloat(s);
                if (!isNaN(num) && num > 0 && num <= 79) {
                    golferSingleMap[g] = true;
                }
            });
        }
    });

    // 극적 반전 — 이번 차수(넷 다 타수가 있는 마지막 차수)에 직전 차수보다 타수를 가장 많이 줄인 사람.
    // 사용자 요청으로 '기록 전체에서 한 번'이 아니라 이번 차수 기준이다. 같으면 함께 받고, 아무도 안 줄였으면 없다.
    const scoreAt = (g, r) => parseFloat(appData.scores && appData.scores[g] ? appData.scores[g][r] : NaN);
    let latestRound = -1;
    for (let r = (appData.totalRounds || 0) - 1; r >= 1; r--) {
        if (golfers.every(g => !isNaN(scoreAt(g, r)))) { latestRound = r; break; }
    }
    golferReboundDiff = {};
    if (latestRound >= 1) {
        golfers.forEach(g => {
            const prev = scoreAt(g, latestRound - 1), curr = scoreAt(g, latestRound);
            if (!isNaN(prev) && !isNaN(curr)) golferReboundDiff[g] = prev - curr;
        });
        const best = Math.max(0, ...Object.values(golferReboundDiff));
        if (best > 0) golfers.forEach(g => { if (golferReboundDiff[g] === best) golferReboundMap[g] = true; });
    }

    const golferFluctuationRange = {};
    golfers.forEach(g => {
        const validScores = (appData.scores && appData.scores[g]) 
            ? appData.scores[g].filter(s => s !== "" && s !== null && !isNaN(parseFloat(s))).map(s => parseFloat(s))
            : [];

        if (validScores.length >= 2) {
            const len = validScores.length;
            const last = validScores[len - 1];
            const prev1 = validScores[len - 2];
            
            if (len >= 3) {
                const prev2 = validScores[len - 3];
                if (prev2 > prev1 && prev1 > last) golferUptrendMap[g] = true; 
                if (prev2 < prev1 && prev1 < last) golferDowntrendMap[g] = true; 
            } else {
                if (prev1 > last + 2) golferUptrendMap[g] = true;
                if (prev1 < last - 2) golferDowntrendMap[g] = true;
            }

            const maxS = Math.max(...validScores);
            const minS = Math.min(...validScores);
            golferFluctuationRange[g] = maxS - minS;
        }
    });

    let maxRange = -1;
    let fluctuationWinner = null;
    golfers.forEach(g => {
        if ((golferFluctuationRange[g] || 0) > maxRange && (golferFluctuationRange[g] || 0) >= 6) {
            maxRange = golferFluctuationRange[g];
            fluctuationWinner = g;
        }
    });
    if (fluctuationWinner) {
        golferFluctuationMap[fluctuationWinner] = true;
    }

    for (let r = 2; r < totalRounds; r++) {
        const data = h2hRoundData(r);
        if (!data) continue;
        const handicapAvg = data.hAvg, currentScores = data.cScore;

        const matchResults = {};
        golfers.forEach(g => matchResults[g] = { wins: 0, losses: 0, ties: 0, totalDiff: 0 });

        for (let i = 0; i < golfers.length; i++) {
            for (let j = i + 1; j < golfers.length; j++) {
                const g1 = golfers[i];
                const g2 = golfers[j];

                const g1Avg = handicapAvg[g1];
                const g2Avg = handicapAvg[g2];
                const g1Score = currentScores[g1];
                const g2Score = currentScores[g2];

                const g1Adjusted = g1Score - (g1Avg - g2Avg);
                const g2Adjusted = g2Score;

                let winner = null;
                if (g1Adjusted < g2Adjusted) { matchResults[g1].wins++; matchResults[g2].losses++; winner = g1; } 
                else if (g1Adjusted > g2Adjusted) { matchResults[g1].losses++; matchResults[g2].wins++; winner = g2; } 
                else {
                    if (g1Avg < g2Avg) { matchResults[g1].wins++; matchResults[g2].losses++; winner = g1; }
                    else if (g2Avg < g1Avg) { matchResults[g2].wins++; matchResults[g1].losses++; winner = g2; }
                    else { matchResults[g1].ties++; matchResults[g2].ties++; }
                }

                // 직전 계급(이번 차수를 넣기 전 마지막 값)이 상대보다 낮았는데 이겼으면 하극상 1승.
                // 첫 계급 차수는 직전 계급이 없어 세지 않는다. 계급 숫자는 0(독수리)이 가장 높다.
                if (winner) {
                    const loser = winner === g1 ? g2 : g1;
                    const wPrev = golferRankHistory[winner].slice(-1)[0];
                    const lPrev = golferRankHistory[loser].slice(-1)[0];
                    if (wPrev !== undefined && lPrev !== undefined && wPrev > lPrev) upsetWins[winner]++;
                }

                matchResults[g1].totalDiff += (g2Adjusted - g1Adjusted);
                matchResults[g2].totalDiff += (g1Adjusted - g2Adjusted);
            }
        }

        golfers.forEach(g => {
            globalTies[g] += matchResults[g].ties;
        });

        // 11차부터는 내 목표 타수와의 싸움이다 — 오늘 타수 − 내 목표 타수(보정타수)가 낮은 순서,
        // 같으면 목표 타수가 낮은(잘 치는) 사람이 앞이다. 위 1:1 맞대결의 승수 순위와 결과가 같지만
        // (차이만큼 타수를 깎아 견주는 것이 곧 보정타수 비교다) 화면과 설명을 한 줄로 하려고 직접 낸다.
        // 그전 차수는 예전처럼 승수 → 타수 합 순서로 그대로 둔다.
        const useNet = r + 1 >= HANDICAP_RULE_FROM_ROUND;
        const netOf = g => currentScores[g] - handicapAvg[g];
        if (useNet) {
            roundNetInfo[r] = {};
            golfers.forEach(g => { roundNetInfo[r][g] = { score: currentScores[g], target: handicapAvg[g], net: netOf(g) }; });
        }
        const sortedGolfers = [...golfers].sort((a, b) => {
            if (useNet) return (netOf(a) - netOf(b)) || (handicapAvg[a] - handicapAvg[b]);
            if (matchResults[b].wins !== matchResults[a].wins) {
                return matchResults[b].wins - matchResults[a].wins;
            }
            return matchResults[b].totalDiff - matchResults[a].totalDiff;
        });

        sortedGolfers.forEach((golferName, index) => {
            const rankInfo = RANK_CONFIG[index];
            const profit = rankPenaltyAt(r, index);
            
            totalRankProfit[golferName] += profit;
            roundRankProfit[golferName][r] = profit;
            golferRankHistory[golferName].push(index);
            // 계급이 매겨진 마지막 차수. 결과 발표 연출(ui.js)이 이 차수를 보여 준다.
            // 타수가 덜 채워진 차수는 건너뛰므로 totalRounds - 1과 다를 수 있다.
            lastRankedRound = r;
        });

        rankedRoundsList.push(r);
    }

    // 불사조 — 하극상 승수가 가장 많은 사람(같으면 함께). 예전엔 승수가 1로 박혀 있어 늘 첫 사람에게 갔다.
    const maxUpset = Math.max(0, ...golfers.map(g => upsetWins[g]));
    if (maxUpset > 0) golfers.forEach(g => { if (upsetWins[g] === maxUpset) golferPhoenixWins[g] = true; });
    golferUpsetWins = upsetWins;

    let maxTies = 0;
    golfers.forEach(g => {
        if (globalTies[g] > maxTies) maxTies = globalTies[g];
    });
    if (maxTies > 0) {
        golfers.forEach(g => {
            if (globalTies[g] === maxTies) {
                golferRivalMap[g] = true;
            }
        });
    }

    cachedRoundRankProfit = roundRankProfit;

    let overallMinScore = Infinity;
    let overallMinAvg = Infinity;
    golferAvgScores = {};
    golferMinScores = {};
    golferBadgesMap = {}; 

    const golferFinalNetProfit = {};

    golfers.forEach(g => {
        const validScores = (appData.scores && appData.scores[g]) 
            ? appData.scores[g].filter(s => s !== "" && s !== null && !isNaN(parseFloat(s))).map(s => parseFloat(s))
            : [];

        if (validScores.length > 0) {
            const userMin = Math.min(...validScores);
            golferMinScores[g] = userMin;
            if (userMin < overallMinScore) { overallMinScore = userMin; }

            const sum = validScores.reduce((acc, curr) => acc + curr, 0);
            const userAvg = sum / validScores.length;
            golferAvgScores[g] = userAvg;
            if (userAvg < overallMinAvg) { overallMinAvg = userAvg; }
        } else {
            golferMinScores[g] = null;
            golferAvgScores[g] = null;
        }
    });

    golfers.forEach(g => {
        const rankProfit = totalRankProfit[g] || 0; 
        let totalPureStrokeProfit = 0; 

        if (appData.roundMoney) {
            for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
                const rMoney = appData.roundMoney[rIdx];
                if (!rMoney) continue;

                const m = rMoney[g] || { start: 0, end: 0 };
                if (moneySettled(m) && roundScored(rIdx)) {
                    const rPenalty = (roundRankProfit[g] && roundRankProfit[g][rIdx] !== undefined) ? roundRankProfit[g][rIdx] : 0;
                    const totalDiff = m.end - m.start;
                    const pureStroke = totalDiff - rPenalty; 
                    if (pureStroke < 0) { totalPureStrokeProfit += pureStroke; }
                }
            }
        }
        golferFinalNetProfitMap[g] = rankProfit + totalPureStrokeProfit - donationOf(g);
    });

    let minNetProfit = Infinity;
    let donorWinner = null;
    golfers.forEach(g => {
        if (golferFinalNetProfitMap[g] < minNetProfit && golferFinalNetProfitMap[g] < 0) {
            minNetProfit = golferFinalNetProfitMap[g];
            donorWinner = g;
        }
    });
    if (donorWinner) {
        golferDonorMap[donorWinner] = true;
    }

    const summaryGrid = document.getElementById('summaryGrid');
    if (summaryGrid) {
        summaryGrid.innerHTML = "";
        golfers.forEach(g => {
            const rankProfit = totalRankProfit[g] || 0; 
            let totalPureStrokeProfit = 0; 

            if (appData.roundMoney) {
                for (let rIdx = 0; rIdx < totalRounds; rIdx++) {
                    const rMoney = appData.roundMoney[rIdx];
                    if (!rMoney) continue;

                    const m = rMoney[g] || { start: 0, end: 0 };
                    if (moneySettled(m) && roundScored(rIdx)) {
                        const rPenalty = (roundRankProfit[g] && roundRankProfit[g][rIdx] !== undefined) ? roundRankProfit[g][rIdx] : 0;
                        const totalDiff = m.end - m.start;
                        const pureStroke = totalDiff - rPenalty; 
                        if (pureStroke < 0) { totalPureStrokeProfit += pureStroke; }
                    }
                }
            }

            const allBadges = getGolferBadgesArray(g, overallMinAvg, overallMinScore);
            golferBadgesMap[g] = allBadges; 
            const summaryBadgesHtml = allBadges.slice(0, 2).map(b => b.html).join('');
            
            // 찬조는 정산에서 나온 값이 아니라 따로 적은 돈이라 여기서 뺀다.
            const donation = donationOf(g);
            const finalBalance = rankProfit + totalPureStrokeProfit - donation;
            const rankProfitText = rankProfit === 0 ? "0원" : (rankProfit > 0 ? "+" : "") + (rankProfit / 10000).toFixed(1) + "만";
            const strokeProfitText = totalPureStrokeProfit === 0 ? "0원" : (totalPureStrokeProfit / 10000).toFixed(1) + "만";
            const donationText = donation === 0 ? "0원" : "-" + (donation / 10000).toFixed(1) + "만";
            
            let finalColor = "#6b7075";
            let finalText = formatFinalBalance(finalBalance);
            if (finalBalance > 0) finalColor = "#1f6b45";
            if (finalBalance < 0) finalColor = "#c0392b";

            const ranks = golferRankHistory[g] || [];
            const currentRankIdx = ranks.length > 0 ? ranks[ranks.length - 1] : 3; 
            const currentRankInfo = RANK_CONFIG[currentRankIdx];

            summaryGrid.innerHTML += `
                <div class="summary-item">
                    <div class="name" onclick="openPersonalReport('${g}')">${g}</div>
                    <div class="sum-rank"><span class="rank-badge ${currentRankInfo.class}">${currentRankInfo.icon}<span class="rank-name">${currentRankInfo.name}</span></span></div>
                    <div class="sum-details">
                        <div class="detail-line"><span class="label">계급</span> <span class="val">${rankProfitText}</span></div>
                        <div class="detail-line"><span class="label">타수</span> <span class="val">${strokeProfitText}</span></div>
                        <div class="detail-line"><span class="label">찬조</span> <span class="val${donation ? ' donate' : ''}">${donationText}</span></div>
                    </div>
                    <div class="sum-badges">${summaryBadgesHtml}</div>
                    <div class="final-box" role="button" tabindex="0" aria-expanded="${summaryTotalsShown}" aria-label="합산 금액 ${summaryTotalsShown ? '접기' : '펼치기'}" onclick="toggleSummaryTotals()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleSummaryTotals();}">
                        <div class="final-label">${summaryTotalsShown ? '합산 ▴' : '합산 ▾'}</div>
                        <div class="final-total${summaryTotalsShown ? '' : ' masked'}" data-final="${finalBalance}" data-color="${finalColor}"${summaryTotalsShown ? ` style="color: ${finalColor};"` : ''}>${summaryTotalsShown ? finalText : SUMMARY_MASK}</div>
                    </div>
                </div>
            `;
        });

        if (typeof equalizeSummaryBadges === 'function') equalizeSummaryBadges();
        rememberCurrentRanks();
    }
}

// 지금 계급을 payload에 남긴다. 알림 발송기(scripts/send-reminder.js)가 읽어
// "학등급 신성호님"처럼 사람마다 다른 문구를 만든다.
// 계급 계산은 여기(calc.js) 한 곳에만 두려고, 결과만 저장하고 발송기는 읽기만 한다.
// 값이 달라졌을 때만 저장한다 — 매 렌더마다 쓰면 4명이 서로 덮어쓴다.
function rememberCurrentRanks() {
    const now = {};
    golfers.forEach(g => {
        const ranks = golferRankHistory[g] || [];
        if (ranks.length === 0) return;
        const info = RANK_CONFIG[ranks[ranks.length - 1]];
        if (info) now[g] = info.name;
    });
    if (Object.keys(now).length === 0) return;

    // 값을 키마다 비교한다. JSON.stringify로 견주면 안 된다 —
    // payload는 Postgres의 jsonb라 키 순서가 보존되지 않는다(길이 → 바이트순으로 다시 정렬된다).
    // 내용이 같아도 문자열이 달라져서 매번 '바뀌었다'로 보고 저장하고,
    // 그 저장이 실시간 이벤트로 되돌아와 다시 렌더 → 다시 저장으로 끝없이 돈다.
    // (그 여파로 renderNoticeArea가 계속 돌아 날씨칸이 '확인중'과 예보를 오갔다.)
    const saved = appData.currentRanks || {};
    const same = Object.keys(now).length === Object.keys(saved).length
        && Object.keys(now).every(g => saved[g] === now[g]);
    if (same) return;

    appData.currentRanks = now;
    syncToSupabase(appData);
}

// ROUND_HOLES(stats.js)를 이용한 홀별 분석. 개인 리포트의 '분석' 탭이 사용한다.
// 홀 기록이 있는 차수만 대상이라, 개수만 등록된 차수는 자동으로 빠진다.
function getHoleAnalysis(name) {
    if (typeof ROUND_HOLES === 'undefined') return null;
    const rounds = Object.keys(ROUND_HOLES).filter(r => ROUND_HOLES[r].rel && ROUND_HOLES[r].rel[name]);
    if (rounds.length === 0) return null;

    const byPar = { 3: [], 4: [], 5: [] };
    let front = 0, back = 0;
    rounds.forEach(r => {
        const par = ROUND_HOLES[r].par, rel = ROUND_HOLES[r].rel[name];
        rel.forEach((x, i) => { if (byPar[par[i]]) byPar[par[i]].push(x); });
        front += rel.slice(0, 9).reduce((a, b) => a + b, 0);
        back += rel.slice(9).reduce((a, b) => a + b, 0);
    });

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return {
        roundCount: rounds.length,
        rounds: rounds.slice().sort((a, b) => Number(a) - Number(b)),
        par3: avg(byPar[3]), par4: avg(byPar[4]), par5: avg(byPar[5]),
        front: front, back: back
    };
}

/* ── 1:1 승률 ─────────────────────────────────────────────────
   핸디캡을 씌운 맞대결이다. 1~10차는 기존 직전 두 차수, 11차부터 직전 다섯 차수의 평균으로 핸디캡을 내고,
   그 차이만큼 내 타수를 깎아 상대의 그 차수 타수와 견준다(적을수록 이긴다).
   같으면 핸디캡이 낮은 쪽(잘 치는 쪽)이 이긴 것으로 본다.

   **통산 승률과 골프장별 승률이 이 함수를 같이 쓴다.** 규칙이 두 군데가 되면
   같은 경기를 두고 숫자가 어긋난다. 계산은 여기 한 곳에만 둘 것.

   **골프장별로 볼 때도 핸디캡 산출에 쓰는 직전 차수들은 골프장을 안 가린다** —
   핸디캡은 '요즘 얼마나 치는가'이지 그 골프장 실력이 아니기 때문이다.
   덕분에 골프장별 승패를 다 더하면 통산 승패와 정확히 맞는다. */
function headToHead(name, rounds) {
    const rec = {};
    golfers.forEach(g => { if (g !== name) rec[g] = { w: 0, l: 0, t: 0 }; });
    for (const r of rounds) {
        const d = h2hRoundData(r);
        if (!d) continue;
        for (const opp in rec) rec[opp][h2hOutcome(d, name, opp).res]++;
    }
    return rec;
}

/* 해당 차수의 규칙으로 핸디캡(평균 · 내림)과 타수를 낸다. 과거 정산·맞대결은 함께 보존한다. */
function h2hRoundData(r) {
    const count = handicapCountFor(r);
    const hAvg = handicapAverageAt(r - 1, count), cScore = {};
    if (!hAvg) return null;
    for (const g of golfers) {
        const s = appData.scores[g] || [];
        const sr = parseFloat(s[r]);
        if (!Number.isFinite(sr) || sr <= 0) return null;
        cScore[g] = sr;
    }
    return { hAvg, cScore };
}

/* 그 차수에서 name과 opp의 승부. 차이만큼 내 타수를 깎아 견주고, 같으면 핸디캡이 낮은 쪽이 이긴다. */
function h2hOutcome(d, name, opp) {
    const give = d.hAvg[name] - d.hAvg[opp];    // 양수면 내가 받는다
    const mine = d.cScore[name] - give, theirs = d.cScore[opp];
    let res;
    if (mine < theirs) res = 'w';
    else if (mine > theirs) res = 'l';
    else if (d.hAvg[name] < d.hAvg[opp]) res = 'w';
    else if (d.hAvg[opp] < d.hAvg[name]) res = 'l';
    else res = 't';
    return { res, give, tieBreak: mine === theirs && res !== 't' };
}

/* 홈 1:1 카드의 상세 창 몫 — 차수마다 두 사람 타수·핸디캡·결과. 승패 셈은 위 headToHead와 같은 함수를 쓴다. */
function headToHeadGames(name, opp, rounds) {
    const out = [];
    for (const r of rounds) {
        const d = h2hRoundData(r);
        if (!d) continue;
        const o = h2hOutcome(d, name, opp);
        out.push({ r, my: d.cScore[name], opp: d.cScore[opp], myH: d.hAvg[name], oppH: d.hAvg[opp], ...o });
    }
    return out;
}

function allRoundIdx() {
    return Array.from({ length: appData.totalRounds }, (_, i) => i);
}

/* 골프장 이름 → 그 골프장에서 치른 차수 목록.
   띄어쓰기만 다른 이름은 같은 곳으로 본다 — `courseGeo()`·골프장 검색과 같은 규칙이다.
   보여 줄 이름은 **처음 나온 표기**를 쓴다.

   주의: 같은 클럽이라도 표에 적힌 이름이 다르면 다른 곳으로 갈린다
   (`함평엘리체`와 `마제스티-펠리스`처럼). 이름을 임의로 묶으면 엉뚱한 곳끼리
   합쳐질 수 있어 적힌 대로 둔다 — 합치려면 표의 이름을 맞추는 게 맞다. */
function roundsByCourse() {
    const map = new Map();                      // 공백 없앤 이름 → {label, rounds}
    for (let r = 0; r < appData.totalRounds; r++) {
        const raw = ((appData.courses || [])[r] || '').trim();
        if (!raw) continue;
        const key = raw.replace(/\s+/g, '');
        if (!map.has(key)) map.set(key, { label: raw, rounds: [] });
        map.get(key).rounds.push(r);
    }
    return [...map.values()];
}
