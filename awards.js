// awards.js — 연말 시상 계산 (사용자 요청 — 2026 시즌부터)
//
// 시상은 **저장하지 않고** 그 시즌 기록(타수·홀 기록·계급·정산·미션)에서 그때그때 셈한다.
// 열리는 때는 season.js의 `seasonClosed(y)`가 정한다. 공로상만 관리자가 직접 지정한 값(`seasonSpecial`)이다.
//
// 대상(올해의 골퍼) — 계급 점수(독수리 3 · 매 2 · 학 1 · 참새 0)의 합. 미션 포인트는 넣지 않는다(사용자 결정).
// 동점이면 그 시즌 독수리를 가장 많이 한 사람이 앞서고(사용자 결정), 그것도 같으면 평균 타수가 낮은 쪽, 그래도 같으면 함께 받는다.
// 부문 수상은 동점이면 모두 받는다(공동).

const RANK_POINTS = [3, 2, 1, 0];
const AWARD_ORDER = ['avg', 'rave', 'eagle', 'birdie', 'mission', 'life', 'devote', 'donor', 'merit'];

// 그 시즌의 사람별 기록 — processAllRoundSettlements()가 채운 계급 이력과 기록을 시즌 차수만 걸러 읽는다.
function seasonStats(y) {
    const sm = seasonMap(), rounds = seasonRoundIdx(y), out = {};
    golfers.forEach(g => {
        const counts = [0, 0, 0, 0];
        let ranked = 0;
        (typeof rankedRoundsList !== 'undefined' ? rankedRoundsList : []).forEach((r, i) => {
            if (sm[r] !== y) return;
            const k = (golferRankHistory[g] || [])[i];
            if (k >= 0 && k < 4) { counts[k]++; ranked++; }
        });
        const rankPoints = counts.reduce((t, n, k) => t + n * RANK_POINTS[k], 0);

        const scored = [];   // [{ r, v }] — 그 시즌에 타수가 있는 차수
        rounds.forEach(r => {
            const v = parseFloat(appData.scores && appData.scores[g] ? appData.scores[g][r] : NaN);
            if (!isNaN(v) && v > 0) scored.push({ r, v });
        });
        const avg = scored.length ? scored.reduce((t, x) => t + x.v, 0) / scored.length : null;
        let min = null;
        scored.forEach(x => { if (min === null || x.v < min.v) min = x; });

        // 인생경기 — 그 시즌 자기 평균보다 가장 낮게 친 한 라운드(평균 − 최저타). 2경기 이상이어야 값이 생긴다.
        const peak = (min && scored.length > 1) ? Math.round((avg - min.v) * 100) / 100 : null;

        // 기부왕 — 그 시즌 계급·타수 정산에서 잃은 돈(사용자 요청 — 찬조는 헌신왕이 따로 있어 안 섞는다). 요약 카드 `합산`의 손실과 같은 셈이다:
        // 계급 정산은 그 차수 벌금 그대로, 타수 정산은 (남은−시작)에서 계급분을 뺀 값이 마이너스일 때만(남은 금액이 적히고 스코어가 들어온 차수).
        let rankLoss = 0, strokeLoss = 0;
        rounds.forEach(r => {
            const rp = (typeof cachedRoundRankProfit !== 'undefined' && cachedRoundRankProfit[g] && typeof cachedRoundRankProfit[g][r] === 'number') ? cachedRoundRankProfit[g][r] : 0;
            rankLoss += rp;
            const m = appData.roundMoney && appData.roundMoney[r] ? appData.roundMoney[r][g] : null;
            if (m && moneySettled(m) && roundScored(r)) {
                const pure = (m.end - m.start) - rp;
                if (pure < 0) strokeLoss += pure;
            }
        });
        const lost = -(rankLoss + strokeLoss);   // 정산에서 잃은 돈(양수)

        out[g] = {
            g, counts, ranked, rankPoints, scored, avg, min, peak, lost,
            holes: seasonHoleCounts(g, y),
            donation: donationOf(g, y),
            mission: missionSeasonGained(g, y)
        };
    });
    return out;
}

// 값(이름 → 숫자 | null)에서 1위를 가린다. dir: 'max'(클수록 좋음) · 'min'. 'max'는 0 이하면 수상자가 없다.
function awardLeaders(vals, dir) {
    const ok = golfers.filter(g => vals[g] !== null && vals[g] !== undefined && !isNaN(vals[g]));
    if (!ok.length) return { holders: [], best: null, rows: [], dir };
    const best = dir === 'max' ? Math.max(...ok.map(g => vals[g])) : Math.min(...ok.map(g => vals[g]));
    const rows = ok.slice().sort((a, b) => dir === 'max' ? vals[b] - vals[a] : vals[a] - vals[b]).map(g => ({ g, v: vals[g] }));
    if (dir === 'max' && !(best > 0)) return { holders: [], best, rows, dir };
    return { holders: ok.filter(g => vals[g] === best), best, rows, dir };
}

const awardWon = n => `${(Number(n) || 0).toLocaleString('ko-KR')}원`;

// 시상 결과 — { awards:[부문], grand:{...}, tally:{이름: 수상 수}, rankedRounds }
// 부문: { id, no, name, rule, holders:[이름], metric, rows:[{g, v, text}] , pending? }
function computeAwards(y) {
    const st = seasonStats(y);
    const vals = f => { const o = {}; golfers.forEach(g => { o[g] = f(st[g]); }); return o; };
    const awards = [];
    const add = (id, name, rule, lead, metricOf, rowText, unit) => {
        awards.push({
            id, name, rule, holders: lead.holders, unit: unit || '',
            metric: lead.holders.length ? metricOf(lead.holders) : '해당 없음',
            rows: lead.rows.map(r => ({ g: r.g, v: r.v, text: rowText(r.g, r.v) })),
            best: lead.best, dir: lead.dir
        });
    };

    add('avg', '평균 타수상', `${y}시즌 평균 타수 1위`, awardLeaders(vals(s => s.avg === null ? null : Math.round(s.avg * 100) / 100), 'min'),
        h => `시즌 평균 ${st[h[0]].avg.toFixed(1)}타`, (g, v) => `${v.toFixed(1)}타`, '타');
    add('rave', '라베상', `${y}시즌 라운드 최저타`, awardLeaders(vals(s => s.min ? s.min.v : null), 'min'),
        h => h.length === 1 ? `${st[h[0]].min.r + 1}차 ${st[h[0]].min.v}타 · 시즌 최저타` : `${st[h[0]].min.v}타 · 시즌 최저타 (공동)`,
        (g, v) => `${v}타`, '타');
    add('eagle', '독수리왕', `${y}시즌 계급 정산에서 독수리가 가장 많은 사람`, awardLeaders(vals(s => s.counts[0]), 'max'),
        h => `독수리 ${st[h[0]].counts[0]}회`, (g, v) => `${v}회`, '회');
    add('birdie', '버디왕', `${y}시즌 버디가 가장 많은 사람`, awardLeaders(vals(s => s.holes.birdie), 'max'),
        h => `버디 ${st[h[0]].holes.birdie}개${h.length > 1 ? ' (공동)' : ''}`, (g, v) => `${v}개`, '개');
    add('mission', '미션왕', `${y}시즌 미션 누적 획득 포인트 1위`, awardLeaders(vals(s => s.mission), 'max'),
        h => `누적 획득 ${st[h[0]].mission}점`, (g, v) => `${v}점`, '점');
    add('life', '인생경기상', `${y}시즌 평균보다 가장 낮게 친 라운드`, awardLeaders(vals(s => s.peak), 'max'),
        h => `${st[h[0]].min.r + 1}차 ${st[h[0]].min.v}타 · 시즌 평균(${st[h[0]].avg.toFixed(1)}타)보다 ${st[h[0]].peak.toFixed(1)}타 낮음`,
        (g, v) => `−${v.toFixed(1)}타`, '타');
    add('devote', '헌신왕', `${y}시즌 모임을 위해 찬조한 금액이 가장 큰 사람`, awardLeaders(vals(s => s.donation), 'max'),
        h => `찬조 ${awardWon(st[h[0]].donation)}`, (g, v) => awardWon(v), '원');
    add('donor', '기부왕', `${y}시즌 계급·타수 정산에서 돈을 가장 많이 잃은 사람`, awardLeaders(vals(s => s.lost), 'max'),
        h => awardWon(st[h[0]].lost), (g, v) => `−${awardWon(v)}`, '원');

    // 공로상 — 관리자가 직접 지정한다. 지정 전에는 수상자가 없다.
    const sp = (appData.seasonSpecial && appData.seasonSpecial[y]) || null;
    const meritHolders = sp && golfers.includes(sp.name) ? [sp.name] : [];
    awards.push({
        id: 'merit', name: '공로상', rule: 'JTFAG를 위해 공로한 바가 큰 사람', holders: meritHolders, unit: '',
        metric: meritHolders.length ? (sp.note || '관리자 지정') : '관리자 지정 전', rows: [], best: null, manual: true
    });

    // 대상 — 계급 점수 합, 동점이면 독수리가 많은 쪽, 그것도 같으면 평균 타수가 낮은 쪽, 그래도 같으면 함께
    const cmp = (a, b) => (st[b].rankPoints - st[a].rankPoints)
        || (st[b].counts[0] - st[a].counts[0])
        || ((st[a].avg === null ? Infinity : Math.round(st[a].avg * 100)) - (st[b].avg === null ? Infinity : Math.round(st[b].avg * 100)));
    const order = golfers.slice().sort(cmp);
    const topPts = Math.max(0, ...golfers.map(g => st[g].rankPoints));
    let gh = topPts > 0 ? order.filter(g => cmp(order[0], g) === 0) : [];
    const grand = {
        id: 'grand', name: '올해의 골퍼', rule: '계급 점수 합 · 동점이면 독수리를 가장 많이 한 사람', holders: gh,
        ranked: Math.max(0, ...golfers.map(g => st[g].ranked)),
        tieBroken: gh.length === 1 && golfers.filter(g => st[g].rankPoints === topPts).length > 1,
        // 동점을 무엇으로 가렸나 — 'eagle'(독수리 횟수) · 'avg'(독수리도 같아 평균 타수)
        tieBy: (() => { const t = golfers.filter(g => st[g].rankPoints === topPts); return t.filter(g => st[g].counts[0] === Math.max(...t.map(x => st[x].counts[0]))).length === 1 ? 'eagle' : 'avg'; })(),
        rows: order.map((g, i) => ({
            g, rank: i === 0 ? 1 : (cmp(order[i - 1], g) === 0 ? null : i + 1),
            points: st[g].rankPoints, eagle: st[g].counts[0], avg: st[g].avg, counts: st[g].counts
        }))
    };
    // 같은 등수 표시 — 앞 사람과 같으면 앞 사람 등수를 따른다
    grand.rows.forEach((r, i) => { if (r.rank === null) r.rank = grand.rows[i - 1].rank; });

    const tally = {};
    golfers.forEach(g => { tally[g] = 0; });
    awards.concat([grand]).forEach(a => a.holders.forEach(g => { tally[g]++; }));

    awards.forEach((a, i) => { a.no = String(i + 1).padStart(2, '0'); });
    return { year: y, awards, grand, tally, stats: st, rankedRounds: grand.ranked };
}

// 시상 결과가 열려 있는가 — 마무리된 시즌만 보인다. 아니면 안내 문구를 보여 준다(season.js).
function awardsOpen(y) { return seasonClosed(y); }

// 시상식을 처음 보여 줄 시즌 — 이 기기에서 아직 안 본, 마무리된 가장 이른 시즌(없으면 0)
// **관리자가 마지막 차수를 지정한 시즌만 저절로 뜬다**(사용자 요청 — 시상식은 경기 뒤 식사 자리에서 발표하므로 12월 31일이 지났다고 혼자 뜨면 안 된다).
// 날짜로만 마무리된 시즌은 트로피에서 다시 보기로만 연다.
function awardsUnseenYear() {
    const list = closedSeasons();
    for (const y of list) { if (seasonFinalRound(y) > 0 && !awardsSeen(y)) return y; }
    return 0;
}
function awardsSeen(y) { try { return !!localStorage.getItem(`jtfag_awards_seen_${y}`); } catch (e) { return true; } }
function markAwardsSeen(y) { try { localStorage.setItem(`jtfag_awards_seen_${y}`, '1'); } catch (e) {} }
