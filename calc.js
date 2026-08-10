// calc.js - 정산 및 뱃지 핵심 로직 전체
function getGolferBadgesArray(g, overallMinAvg, overallMinScore) {
    let badges = [];
    const ranks = golferRankHistory[g] || [];
    const myStats = (typeof CUMULATIVE_STATS !== 'undefined') ? CUMULATIVE_STATS : {
        "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "김지명": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "신성호": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "박승수": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }
    };

    if (ranks.length >= 3 && ranks.slice(-3).every(r => r === 0)) badges.push({ html: `<div class="season-badge badge-eagle-3">🦅 독수리 3연속!</div>`, desc: "최근 3경기 연속 독수리 계급 달성" });
    else if (ranks.length >= 2 && ranks.slice(-2).every(r => r === 0)) badges.push({ html: `<div class="season-badge badge-eagle-2">🦅 독수리 2연속!</div>`, desc: "최근 2경기 연속 독수리 계급 달성" });

    if (overallMinAvg !== Infinity && golferAvgScores[g] === overallMinAvg) badges.push({ html: `<div class="season-badge badge-avg-1">🏆 평균타수 1위</div>`, desc: "리그 전체 참가자 중 평균 타수 1위" });
    if (overallMinScore !== Infinity && golferMinScores[g] === overallMinScore) badges.push({ html: `<div class="season-badge badge-best-score">🎯 최저타 ${overallMinScore}타</div>`, desc: "리그 전체 기록 중 가장 낮은 최저타 달성" });
    if (golferSingleMap[g]) badges.push({ html: `<div class="season-badge badge-single">🎯 싱글의 품격</div>`, desc: "단일 라운드 79타 이하 달성" });
    if (golferReboundMap[g]) badges.push({ html: `<div class="season-badge badge-rebound">🔥 극적 반전</div>`, desc: "직전 경기 대비 타수를 가장 많이 줄임" });
    if (golferPhoenixWins[g]) badges.push({ html: `<div class="season-badge badge-phoenix">🦅 불사조</div>`, desc: "상위 계급을 상대로 1:1 최다승 기록" });
    if (golferDonorMap[g]) badges.push({ html: `<div class="season-badge badge-donor">💸 기부왕</div>`, desc: "합산 정산 금액 손실 1위" });
    if (golferUptrendMap[g]) badges.push({ html: `<div class="season-badge badge-uptrend">📈 상승세</div>`, desc: "최근 경기 스코어가 지속적으로 줄어드는 중" });
    if (golferDowntrendMap[g]) badges.push({ html: `<div class="season-badge badge-downtrend">📉 하락세</div>`, desc: "최근 경기 스코어가 지속적으로 늘어나는 중" });
    if (golferFluctuationMap[g]) badges.push({ html: `<div class="season-badge badge-fluctuation">🎢 기복왕</div>`, desc: "라운드별 스코어 기복이 가장 큼" });
    if (golferRivalMap[g]) badges.push({ html: `<div class="season-badge badge-rival">⚔️ 영원의 라이벌</div>`, desc: "1:1 매치에서 가장 많은 무승부를 기록함" });

    if (myStats[g].holeInOne > 0) badges.push({ html: `<div class="season-badge badge-holeinone">👑 기적의 사나이</div>`, desc: "통산 홀인원 기록자" });
    if (myStats[g].eagle > 0) badges.push({ html: `<div class="season-badge badge-eagle-hit">🦅 이글 헌터</div>`, desc: "통산 이글 기록자" });
    if (golferMaxBirdie.includes(g)) badges.push({ html: `<div class="season-badge badge-birdie">🦋 버디 수집가</div>`, desc: "리그 내 누적 버디 횟수 1위" });
    if (golferMaxPar.includes(g)) badges.push({ html: `<div class="season-badge badge-par">🛡️ 철벽 방어</div>`, desc: "리그 내 누적 파 횟수 1위" });
    if (golferMaxDoublePar.includes(g)) badges.push({ html: `<div class="season-badge badge-bomb">💣 폭탄 처리반</div>`, desc: "리그 내 누적 양파 횟수 1위" });

    return badges.length > 0 ? badges : [{ html: `<div class="season-badge badge-rookie">🌱 루키</div>`, desc: "아직 획득한 뱃지가 없음" }];
}

function processAllRoundSettlements() {
    const totalRounds = appData.totalRounds;
    const totalRankProfit = {}; const roundRankProfit = {}; const globalTies = {};
    golferRankHistory = {}; golferSingleMap = {}; golferReboundMap = {}; golferPhoenixWins = {};
    golferDonorMap = {}; golferUptrendMap = {}; golferDowntrendMap = {}; golferFluctuationMap = {}; golferRivalMap = {}; 

    golfers.forEach(g => {
        totalRankProfit[g] = 0; roundRankProfit[g] = {}; golferRankHistory[g] = []; globalTies[g] = 0;
    });

    const myStats = (typeof CUMULATIVE_STATS !== 'undefined') ? CUMULATIVE_STATS : {
        "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "김지명": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 },
        "신성호": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "박승수": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }
    };

    let maxBirdie = 0, maxPar = 0, maxDPar = 0;
    golfers.forEach(g => {
        if (myStats[g].birdie > maxBirdie) maxBirdie = myStats[g].birdie;
        if (myStats[g].par > maxPar) maxPar = myStats[g].par;
        if (myStats[g].doublePar > maxDPar) maxDPar = myStats[g].doublePar;
    });
    golferMaxBirdie = golfers.filter(g => myStats[g].birdie === maxBirdie && maxBirdie > 0);
    golferMaxPar = golfers.filter(g => myStats[g].par === maxPar && maxPar > 0);
    golferMaxDoublePar = golfers.filter(g => myStats[g].doublePar === maxDPar && maxDPar > 0);

    golfers.forEach(g => {
        if (appData.scores[g]) appData.scores[g].forEach(s => { if (parseFloat(s) <= 79) golferSingleMap[g] = true; });
    });

    let maxDiff = -Infinity; let reboundGolfer = null;
    golfers.forEach(g => {
        const scores = appData.scores[g] || [];
        for (let i = 1; i < scores.length; i++) {
            const diff = parseFloat(scores[i-1]) - parseFloat(scores[i]);
            if (diff > maxDiff) { maxDiff = diff; reboundGolfer = g; }
        }
    });
    if (reboundGolfer && maxDiff > 0) golferReboundMap[reboundGolfer] = true;

    const historyList = document.getElementById('historyList');
    if (historyList) historyList.innerHTML = "";

    for (let r = 2; r < totalRounds; r++) {
        const handicapAvg = {}, currentScores = {}, matchResults = {}; let isComplete = true;
        golfers.forEach(g => {
            const s1 = parseFloat(appData.scores[g][r-2]), s2 = parseFloat(appData.scores[g][r-1]), sr = parseFloat(appData.scores[g][r]);
            if (isNaN(s1) || isNaN(s2) || isNaN(sr)) isComplete = false;
            handicapAvg[g] = Math.floor((s1+s2)/2); currentScores[g] = sr;
            matchResults[g] = { wins: 0, losses: 0, ties: 0, totalDiff: 0 };
        });

        if (!isComplete) continue;

        for (let i = 0; i < golfers.length; i++) {
            for (let j = i + 1; j < golfers.length; j++) {
                const g1 = golfers[i], g2 = golfers[j];
                const g1Adj = currentScores[g1] - (handicapAvg[g1] - handicapAvg[g2]);
                const g2Adj = currentScores[g2];
                if (g1Adj < g2Adj) { matchResults[g1].wins++; matchResults[g2].losses++; }
                else if (g1Adj > g2Adj) { matchResults[g1].losses++; matchResults[g2].wins++; }
                else {
                    if (handicapAvg[g1] < handicapAvg[g2]) { matchResults[g1].wins++; matchResults[g2].losses++; }
                    else if (handicapAvg[g2] < handicapAvg[g1]) { matchResults[g2].wins++; matchResults[g1].losses++; }
                    else { matchResults[g1].ties++; matchResults[g2].ties++; }
                }
            }
        }

        const sorted = [...golfers].sort((a, b) => matchResults[b].wins - matchResults[a].wins);
        sorted.forEach((name, idx) => {
            const profit = RANK_CONFIG[idx].penalty;
            totalRankProfit[name] += profit; roundRankProfit[name][r] = profit; golferRankHistory[name].push(idx);
            const row = document.querySelector(`tr[data-name="${name}"]`);
            if (row) row.querySelector('.rank-cell').innerHTML = `<span class="rank-badge ${RANK_CONFIG[idx].class}">${RANK_CONFIG[idx].icon} ${RANK_CONFIG[idx].name}</span>`;
        });

        if (historyList) {
            historyList.innerHTML += `<div class="history-item"><div class="history-header">⛳ ${r+1}차전 정산</div><div class="history-grid">${sorted.map((name, i) => `<div class="history-member"><span>${name}</span><span>${RANK_CONFIG[i].icon}</span></div>`).join('')}</div></div>`;
        }
    }
    cachedRoundRankProfit = roundRankProfit;
}
