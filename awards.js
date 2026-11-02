// awards.js — 연말 시상 계산 (사용자 요청 — 2026 시즌부터)
//
// 시상은 **저장하지 않고** 그 시즌 기록(타수·홀 기록·계급·정산·미션)에서 그때그때 셈한다.
// 열리는 때는 season.js의 `seasonClosed(y)`가 정한다. 공로상만 관리자가 직접 지정한 값(`seasonSpecial`)이다.
//
// 대상(올해의 골퍼) — 계급 점수(독수리 3 · 매 2 · 학 1 · 참새 0)의 합. 미션 포인트는 넣지 않는다(사용자 결정).
// 동점이면 그 시즌 평균 타수가 낮은 쪽이 앞서고, 그래도 같으면 함께 받는다.
// 부문 수상은 동점이면 모두 받는다(공동).

const RANK_POINTS = [3, 2, 1, 0];
const AWARD_ORDER = ['avg', 'rave', 'eagle', 'birdie', 'mission', 'rebound', 'late', 'donor', 'merit'];

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

        // 극적 반전 — 시즌 안에서 바로 앞 차수보다 타수를 가장 많이 줄인 한 번
        let drop = null;
        for (let i = 1; i < scored.length; i++) {
            if (scored[i].r !== scored[i - 1].r + 1) continue;
            const d = scored[i - 1].v - scored[i].v;
            if (d > 0 && (drop === null || d > drop.diff)) drop = { diff: d, from: scored[i - 1], to: scored[i] };
        }

        // 뒷심 — 후반 9홀이 전반보다 좋았던 라운드 수(홀 기록이 있는 차수만)
        let late = 0;
        if (typeof halves === 'function') rounds.forEach(r => { const hv = halves(g, r); if (hv && hv[1] < hv[0]) late++; });

        out[g] = {
            g, counts, ranked, rankPoints, scored, avg, min, drop, late,
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

    add('avg', '평균 타수상', '그 시즌 평균 타수 1위', awardLeaders(vals(s => s.avg === null ? null : Math.round(s.avg * 100) / 100), 'min'),
        h => `시즌 평균 ${st[h[0]].avg.toFixed(1)}타`, (g, v) => `${v.toFixed(1)}타`, '타');
    add('rave', '라베상', '그 시즌 한 라운드 최저타', awardLeaders(vals(s => s.min ? s.min.v : null), 'min'),
        h => h.length === 1 ? `${st[h[0]].min.r + 1}차 ${st[h[0]].min.v}타 · 시즌 최저타` : `${st[h[0]].min.v}타 · 시즌 최저타 (공동)`,
        (g, v) => `${v}타`, '타');
    add('eagle', '독수리왕', '계급 정산에서 독수리가 가장 많은 사람', awardLeaders(vals(s => s.counts[0]), 'max'),
        h => `독수리 ${st[h[0]].counts[0]}회`, (g, v) => `${v}회`, '회');
    add('birdie', '버디왕', '그 시즌 버디가 가장 많은 사람', awardLeaders(vals(s => s.holes.birdie), 'max'),
        h => `버디 ${st[h[0]].holes.birdie}개${h.length > 1 ? ' (공동)' : ''}`, (g, v) => `${v}개`, '개');
    add('mission', '미션왕', '그 시즌 미션 누적 획득 포인트 1위', awardLeaders(vals(s => s.mission), 'max'),
        h => `누적 획득 ${st[h[0]].mission}점`, (g, v) => `${v}점`, '점');
    add('rebound', '극적 반전상', '바로 앞 차수보다 타수를 가장 많이 줄인 한 번', awardLeaders(vals(s => s.drop ? s.drop.diff : null), 'max'),
        h => { const d = st[h[0]].drop; return `${d.from.r + 1}차 ${d.from.v}타 → ${d.to.r + 1}차 ${d.to.v}타 (−${d.diff})`; },
        (g, v) => `−${v}타`, '타');
    add('late', '뒷심상', '후반 9홀이 전반보다 좋았던 라운드가 가장 많은 사람', awardLeaders(vals(s => s.late), 'max'),
        h => `후반이 더 좋았던 라운드 ${st[h[0]].late}회`, (g, v) => `${v}회`, '회');
    add('donor', '기부왕', '모임을 위해 찬조한 금액이 가장 큰 사람', awardLeaders(vals(s => s.donation), 'max'),
        h => `찬조 ${awardWon(st[h[0]].donation)}`, (g, v) => awardWon(v), '원');

    // 공로상 — 관리자가 직접 지정한다. 지정 전에는 수상자가 없다.
    const sp = (appData.seasonSpecial && appData.seasonSpecial[y]) || null;
    const meritHolders = sp && golfers.includes(sp.name) ? [sp.name] : [];
    awards.push({
        id: 'merit', name: '공로상', rule: '관리자가 직접 지정', holders: meritHolders, unit: '',
        metric: meritHolders.length ? (sp.note || '관리자 지정') : '관리자 지정 전', rows: [], best: null, manual: true
    });

    // 대상 — 계급 점수 합, 동점이면 평균 타수가 낮은 쪽, 그래도 같으면 함께
    const cmp = (a, b) => (st[b].rankPoints - st[a].rankPoints)
        || ((st[a].avg === null ? Infinity : Math.round(st[a].avg * 100)) - (st[b].avg === null ? Infinity : Math.round(st[b].avg * 100)));
    const order = golfers.slice().sort(cmp);
    const topPts = Math.max(0, ...golfers.map(g => st[g].rankPoints));
    let gh = topPts > 0 ? order.filter(g => cmp(order[0], g) === 0) : [];
    const grand = {
        id: 'grand', name: '올해의 골퍼', rule: '계급 점수 합 · 동점이면 평균 타수가 낮은 쪽', holders: gh,
        ranked: Math.max(0, ...golfers.map(g => st[g].ranked)),
        tieBroken: gh.length === 1 && golfers.filter(g => st[g].rankPoints === topPts).length > 1,
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
function awardsUnseenYear() {
    const list = closedSeasons();
    for (const y of list) { if (!awardsSeen(y)) return y; }
    return 0;
}
function awardsSeen(y) { try { return !!localStorage.getItem(`jtfag_awards_seen_${y}`); } catch (e) { return true; } }
function markAwardsSeen(y) { try { localStorage.setItem(`jtfag_awards_seen_${y}`, '1'); } catch (e) {} }
