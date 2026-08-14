// calc.js - 정산, 핸디캡, 통계 및 뱃지 생성 전체 로직

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

    if (ranks.length >= 3 && ranks.slice(-3).every(r => r === 0)) {
        badges.push({ html: `<div class="season-badge badge-eagle-3">${imgE} 독수리 3연속!</div>`, desc: "최근 3경기 연속 독수리 계급 달성" });
    } else if (ranks.length >= 2 && ranks.slice(-2).every(r => r === 0)) {
        badges.push({ html: `<div class="season-badge badge-eagle-2">${imgE} 독수리 2연속!</div>`, desc: "최근 2경기 연속 독수리 계급 달성" });
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
        badges.push({ html: `<div class="season-badge badge-rebound">🔥 극적 반전</div>`, desc: "직전 경기 대비 타수를 가장 많이 줄임" });
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

    if (badges.length === 0) {
        badges.push({ html: `<div class="season-badge badge-rookie">🌱 루키</div>`, desc: "아직 획득한 뱃지가 없음" });
    }

    return badges;
}

function calculateAndRender() {
    let targetR1 = -1, targetR2 = -1;
    for (let r = appData.totalRounds - 1; r >= 1; r--) {
        let completeCurr = true;
        let completePrev = true;
        golfers.forEach(g => {
            const sCurr = appData.scores[g] ? appData.scores[g][r] : "";
            const sPrev = appData.scores[g] ? appData.scores[g][r - 1] : "";
            if (sCurr === "" || sCurr === undefined || isNaN(parseFloat(sCurr))) completeCurr = false;
            if (sPrev === "" || sPrev === undefined || isNaN(parseFloat(sPrev))) completePrev = false;
        });

        if (completeCurr && completePrev) {
            targetR1 = r - 1;
            targetR2 = r;
            break;
        }
    }

    if (targetR1 === -1) {
        targetR1 = 0;
        targetR2 = 1;
    }

    const infoText = document.getElementById('infoText');
    const matchCardTitle = document.getElementById('matchCardTitle');
    const avgHeaderTitle = document.getElementById('avgHeaderTitle');

    const titleStr = `${targetR1 + 1}차 & ${targetR2 + 1}차`;
    const avgTitleStr = `${targetR1 + 1}·${targetR2 + 1}차 평균`;

    if (infoText) infoText.innerHTML = `💡 <b>${titleStr} 스코어 기준 1:1 핸디캡 산출</b>`;
    if (matchCardTitle) matchCardTitle.innerHTML = `🤝 ${avgTitleStr} 기반 1:1 핸디캡 관계`;
    if (avgHeaderTitle) avgHeaderTitle.innerHTML = avgTitleStr;

    const rows = document.querySelectorAll('#scoreTbody tr');
    rows.forEach(row => {
        const name = row.getAttribute('data-name');
        const s1 = parseFloat(appData.scores[name] ? appData.scores[name][targetR1] : NaN);
        const s2 = parseFloat(appData.scores[name] ? appData.scores[name][targetR2] : NaN);

        const avgCell = row.querySelector('.avg-cell');
        if (!isNaN(s1) && !isNaN(s2)) {
            const avg = Math.floor((s1 + s2) / 2);
            if (avgCell) avgCell.textContent = `${avg}`;
        } else {
            if (avgCell) avgCell.textContent = `-`;
        }
    });

    processAllRoundSettlements();
    renderHandicapMatchCard(targetR1, targetR2);
}

function processAllRoundSettlements() {
    const totalRounds = appData.totalRounds;
    const totalRankProfit = {};
    const roundRankProfit = {};
    golferRankHistory = {}; 
    golferSingleMap = {};
    golferReboundMap = {};
    golferPhoenixWins = {};
    golferDonorMap = {};
    golferUptrendMap = {};
    golferDowntrendMap = {};
    golferFluctuationMap = {};
    golferRivalMap = {}; 

    const globalTies = {};

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

    let maxDiff = -Infinity;
    let reboundGolfer = null;
    golfers.forEach(g => {
        const scores = appData.scores && appData.scores[g] ? appData.scores[g] : [];
        for (let i = 1; i < scores.length; i++) {
            const prev = parseFloat(scores[i - 1]);
            const curr = parseFloat(scores[i]);
            if (!isNaN(prev) && !isNaN(curr)) {
                const diff = prev - curr; 
                if (diff > maxDiff) {
                    maxDiff = diff;
                    reboundGolfer = g;
                }
            }
        }
    });
    if (reboundGolfer && maxDiff > 0) {
        golferReboundMap[reboundGolfer] = true;
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

    const historyList = document.getElementById('historyList');
    if (historyList) historyList.innerHTML = "";

    for (let r = 2; r < totalRounds; r++) {
        const handicapAvg = {};
        let isComplete = true;

        golfers.forEach(g => {
            const s1 = parseFloat(appData.scores[g] ? appData.scores[g][r - 2] : NaN);
            const s2 = parseFloat(appData.scores[g] ? appData.scores[g][r - 1] : NaN);
            if (isNaN(s1) || isNaN(s2)) isComplete = false;
            handicapAvg[g] = Math.floor((s1 + s2) / 2);
        });

        const currentScores = {};
        golfers.forEach(g => {
            const sr = parseFloat(appData.scores[g] ? appData.scores[g][r] : NaN);
            if (isNaN(sr)) isComplete = false;
            currentScores[g] = sr;
        });

        if (!isComplete) continue;

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

                matchResults[g1].totalDiff += (g2Adjusted - g1Adjusted);
                matchResults[g2].totalDiff += (g1Adjusted - g2Adjusted);
            }
        }

        golfers.forEach(g => {
            globalTies[g] += matchResults[g].ties;
        });

        const sortedGolfers = [...golfers].sort((a, b) => {
            if (matchResults[b].wins !== matchResults[a].wins) {
                return matchResults[b].wins - matchResults[a].wins;
            }
            return matchResults[b].totalDiff - matchResults[a].totalDiff;
        });

        let roundHistoryHtml = `
            <div class="history-item">
                <div class="history-header">⛳ ${r + 1}차전 계급 정산 결과</div>
                <div class="history-grid">
        `;

        sortedGolfers.forEach((golferName, index) => {
            const rankInfo = RANK_CONFIG[index];
            const profit = rankInfo.penalty;
            
            totalRankProfit[golferName] += profit;
            roundRankProfit[golferName][r] = profit;
            golferRankHistory[golferName].push(index);

            const priceDisplay = profit === 0 ? "0원" : (profit > 0 ? "+" : "") + (profit / 10000) + "만";

            roundHistoryHtml += `
                <div class="history-member">
                    <span style="font-weight:700; color:var(--text-main);">${golferName}</span>
                    <div style="display:flex; align-items:center; gap:2px;">
                        <span class="rank-badge ${rankInfo.class}">${rankInfo.icon} ${rankInfo.name}</span>
                        <span style="font-weight:800; color:${profit > 0 ? '#16a34a' : (profit < 0 ? '#dc2626' : '#64748b')};">${priceDisplay}</span>
                    </div>
                </div>
            `;
        });

        roundHistoryHtml += `</div></div>`;
        if (historyList) historyList.innerHTML += roundHistoryHtml;
    }

    let maxPhoenixWins = 0;
    let phoenixWinner = null;
    golfers.forEach(g => {
        let wins = 1; 
        if (wins > maxPhoenixWins) {
            maxPhoenixWins = wins;
            phoenixWinner = g;
        }
    });
    if (phoenixWinner) {
        golferPhoenixWins[phoenixWinner] = true;
    }

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
                if (m.start > 0 || m.end > 0) {
                    const rPenalty = (roundRankProfit[g] && roundRankProfit[g][rIdx] !== undefined) ? roundRankProfit[g][rIdx] : 0;
                    const totalDiff = m.end - m.start;
                    const pureStroke = totalDiff - rPenalty; 
                    if (pureStroke < 0) { totalPureStrokeProfit += pureStroke; }
                }
            }
        }
        golferFinalNetProfitMap[g] = rankProfit + totalPureStrokeProfit; 
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
                    if (m.start > 0 || m.end > 0) {
                        const rPenalty = (roundRankProfit[g] && roundRankProfit[g][rIdx] !== undefined) ? roundRankProfit[g][rIdx] : 0;
                        const totalDiff = m.end - m.start;
                        const pureStroke = totalDiff - rPenalty; 
                        if (pureStroke < 0) { totalPureStrokeProfit += pureStroke; }
                    }
                }
            }

            // 뱃지는 사람마다 개수가 달라 카드가 들쭉날쭉해진다. 항상 있는 값을 한 줄 넣는다.
            const avgVal = golferAvgScores[g];
            const avgText = (avgVal !== undefined && !isNaN(avgVal)) ? `${Math.round(avgVal)}타` : '-';

            const allBadges = getGolferBadgesArray(g, overallMinAvg, overallMinScore);
            golferBadgesMap[g] = allBadges; 
            const summaryBadgesHtml = allBadges.slice(0, 2).map(b => b.html).join('');
            
            const finalBalance = rankProfit + totalPureStrokeProfit;
            const rankProfitText = rankProfit === 0 ? "0원" : (rankProfit > 0 ? "+" : "") + (rankProfit / 10000).toFixed(1) + "만";
            const strokeProfitText = totalPureStrokeProfit === 0 ? "0원" : (totalPureStrokeProfit / 10000).toFixed(1) + "만";
            
            let finalColor = "#64748b";
            let finalText = finalBalance === 0 ? "0원" : (finalBalance > 0 ? "+" : "") + (finalBalance / 10000).toFixed(1) + "만";
            if (finalBalance > 0) finalColor = "#16a34a";
            if (finalBalance < 0) finalColor = "#dc2626";

            const ranks = golferRankHistory[g] || [];
            const currentRankIdx = ranks.length > 0 ? ranks[ranks.length - 1] : 3; 
            const currentRankInfo = RANK_CONFIG[currentRankIdx];

            // 🔥 후광 효과(box-shadow) 제거, 테두리(border)만 색상별로 깔끔하게 적용 🔥
            let badgeGlowStyle = "";
            if (currentRankIdx === 0) {
                badgeGlowStyle = "border: 2px solid #f59e0b;"; // 독수리: 황금 테두리
            } else if (currentRankIdx === 1) {
                badgeGlowStyle = "border: 2px solid #0ea5e9;"; // 매: 파란 테두리
            } else if (currentRankIdx === 2) {
                badgeGlowStyle = "border: 2px solid #a855f7;"; // 학: 보라 테두리
            } else {
                badgeGlowStyle = "border: 2px solid #94a3b8;"; // 참새: 회색 테두리
            }

            summaryGrid.innerHTML += `
                <div class="summary-item" style="height: 100%; justify-content: flex-start;">
                    <div>
                        <div class="name" onclick="openPersonalReport('${g}')">${g}</div>
                        <div style="margin-top:-2px; margin-bottom: 6px;">
                            <span class="rank-badge ${currentRankInfo.class}" style="width:100%; padding:3px 0; border-radius:6px; ${badgeGlowStyle}">${currentRankInfo.icon} ${currentRankInfo.name}</span>
                        </div>
                        <div class="summary-score">${avgText}<span>평균</span></div>
                        <div class="detail-line"><span class="label">계급</span> <span class="val">${rankProfitText}</span></div>
                        <div class="detail-line"><span class="label">타수</span> <span class="val">${strokeProfitText}</span></div>
                    </div>
                    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 2px; margin-top: 4px;">
                        ${summaryBadgesHtml}
                    </div>
                    <div class="final-total" style="color: ${finalColor}; margin-top: auto;">합산: ${finalText}</div>
                </div>
            `;
        });
    }
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
