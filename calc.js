// calc.js - 정산 및 통계 핵심 로직
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

function calculateAndRender() {
    let targetR1 = -1, targetR2 = -1;
    for (let r = appData.totalRounds - 1; r >= 1; r--) {
        let complete = true;
        golfers.forEach(g => {
            const sCurr = appData.scores[g] ? appData.scores[g][r] : "";
            const sPrev = appData.scores[g] ? appData.scores[g][r - 1] : "";
            if (sCurr === "" || sPrev === "" || isNaN(parseFloat(sCurr))) complete = false;
        });
        if (complete) { targetR1 = r - 1; targetR2 = r; break; }
    }
    if (targetR1 === -1) { targetR1 = 0; targetR2 = 1; }

    document.getElementById('infoText').innerHTML = `💡 <b>${targetR1 + 1}차 & ${targetR2 + 1}차 스코어</b> 기준 1:1 핸디캡 산출`;
    document.getElementById('matchCardTitle').innerHTML = `🤝 ${targetR1 + 1}·${targetR2 + 1}차 평균 핸디캡`;

    document.querySelectorAll('#scoreTbody tr').forEach(row => {
        const name = row.getAttribute('data-name');
        const s1 = parseFloat(appData.scores[name][targetR1]), s2 = parseFloat(appData.scores[name][targetR2]);
        const avg = Math.floor((s1 + s2) / 2);
        row.querySelector('.avg-cell').textContent = isNaN(avg) ? "-" : avg;
    });

    processAllRoundSettlements();
    renderHandicapMatchCard(targetR1, targetR2);
}

function processAllRoundSettlements() {
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

    // 단일 라운드 뱃지 및 트렌드 분석 로직
    golfers.forEach(g => {
        if (appData.scores[g]) appData.scores[g].forEach(s => { if (parseFloat(s) <= 79) golferSingleMap[g] = true; });
    });

    let maxDiff = -Infinity; let reboundGolfer = null;
    golfers.forEach(g => {
        const scores = appData.scores[g] || [];
        for (let i = 1; i < scores.length; i++) {
            const diff = parseFloat(scores[i - 1]) - parseFloat(scores[i]);
            if (diff > maxDiff) { maxDiff = diff; reboundGolfer = g; }
        }
    });
    if (reboundGolfer && maxDiff > 0) golferReboundMap[reboundGolfer] = true;

    // 히스토리 및 순위 정산
    for (let r = 2; r < appData.totalRounds; r++) {
        const handicapAvg = {}, currentScores = {}, matchResults = {};
        let isComplete = true;
        golfers.forEach(g => {
            const s1 = parseFloat(appData.scores[g][r - 2]), s2 = parseFloat(appData.scores[g][r - 1]), sr = parseFloat(appData.scores[g][r]);
            if (isNaN(s1) || isNaN(s2) || isNaN(sr)) isComplete = false;
            handicapAvg[g] = Math.floor((s1 + s2) / 2); currentScores[g] = sr;
            matchResults[g] = { wins: 0, losses: 0, ties: 0, totalDiff: 0 };
        });

        if (!isComplete) continue;

        for (let i = 0; i < golfers.length; i++) {
            for (let j = i + 1; j < golfers.length; j++) {
                const g1 = golfers[i], g2 = golfers[j];
                const g1Adjusted = currentScores[g1] - (handicapAvg[g1] - handicapAvg[g2]);
                const g2Adjusted = currentScores[g2];
                if (g1Adjusted < g2Adjusted) { matchResults[g1].wins++; matchResults[g2].losses++; }
                else if (g1Adjusted > g2Adjusted) { matchResults[g1].losses++; matchResults[g2].wins++; }
                else {
                    if (handicapAvg[g1] < handicapAvg[g2]) { matchResults[g1].wins++; matchResults[g2].losses++; }
                    else if (handicapAvg[g2] < handicapAvg[g1]) { matchResults[g2].wins++; matchResults[g1].losses++; }
                    else { matchResults[g1].ties++; matchResults[g2].ties++; }
                }
            }
        }

        const sortedGolfers = [...golfers].sort((a, b) => matchResults[b].wins - matchResults[a].wins);
        sortedGolfers.forEach((name, index) => {
            const profit = RANK_CONFIG[index].penalty;
            totalRankProfit[name] += profit; roundRankProfit[name][r] = profit; golferRankHistory[name].push(index);
            const row = document.querySelector(`tr[data-name="${name}"]`);
            if (row) row.querySelector('.rank-cell').innerHTML = `<span class="rank-badge ${RANK_CONFIG[index].class}">${RANK_CONFIG[index].icon} ${RANK_CONFIG[index].name}</span>`;
        });
    }

    cachedRoundRankProfit = roundRankProfit;

    // 요약 계산
    golferAvgScores = {}; golferMinScores = {};
    golfers.forEach(g => {
        const valid = (appData.scores[g] || []).filter(s => s !== "" && !isNaN(parseFloat(s))).map(parseFloat);
        if (valid.length > 0) {
            golferMinScores[g] = Math.min(...valid);
            golferAvgScores[g] = valid.reduce((a, b) => a + b, 0) / valid.length;
        }
    });

    // 정산 반영
    golfers.forEach(g => {
        const rankProfit = totalRankProfit[g] || 0;
        let strokeProfit = 0;
        appData.roundMoney.forEach((r, idx) => {
            if (r[g]) {
                const penalty = (roundRankProfit[g] && roundRankProfit[g][idx] !== undefined) ? roundRankProfit[g][idx] : 0;
                const strokeDiff = (r[g].end - r[g].start) - penalty;
                if (strokeDiff < 0) strokeProfit += strokeDiff;
            }
        });
        golferFinalNetProfitMap[g] = rankProfit + strokeProfit;
        if (golferFinalNetProfitMap[g] < 0 && golferFinalNetProfitMap[g] === Math.min(...Object.values(golferFinalNetProfitMap))) golferDonorMap[g] = true;
    });

    // 화면 반영 (렌더링)
    const summaryGrid = document.getElementById('summaryGrid');
    summaryGrid.innerHTML = golfers.map(g => {
        const badges = getGolferBadgesArray(g, Math.min(...Object.values(golferAvgScores)), Math.min(...Object.values(golferMinScores)));
        golferBadgesMap[g] = badges;
        const bal = golferFinalNetProfitMap[g];
        return `
            <div class="summary-item">
                <div class="name" onclick="openPersonalReport('${g}')">${g}</div>
                <div class="detail-line"><span class="label">계급</span> <span class="val">${(totalRankProfit[g] / 10000).toFixed(1)}만</span></div>
                <div class="final-total" style="color: ${bal > 0 ? '#16a34a' : (bal < 0 ? '#dc2626' : '#64748b')};">합산: ${(bal / 10000).toFixed(1)}만</div>
            </div>`;
    }).join('');
}

function renderHandicapMatchCard(r1, r2) {
    const grid = document.getElementById('matchGrid'); grid.innerHTML = "";
    const avg = {}; golfers.forEach(g => avg[g] = Math.floor((parseFloat(appData.scores[g][r1]) + parseFloat(appData.scores[g][r2])) / 2));
    for (let i = 0; i < golfers.length; i++) {
        for (let j = i + 1; j < golfers.length; j++) {
            const diff = avg[golfers[i]] - avg[golfers[j]];
            grid.innerHTML += `<div class="match-item"><b>${diff > 0 ? golfers[i] : golfers[j]}</b> ➔ ${diff > 0 ? golfers[j] : golfers[i]}에게 <b style="color:var(--primary-gold);">${Math.abs(diff)}타</b> 받음</div>`;
        }
    }
}
