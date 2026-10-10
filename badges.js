// badges.js - 뱃지 컬렉션 (홈 · 정산·스코어 옆 세 번째 화면)
//
// 사용자 요청 — `개인별로 뱃지획득한것들을 보여주는거야. 게임처럼` · 시안은 claude.ai 아티팩트 `JTFAG 뱃지 컬렉션 시안`.
// 요약 카드의 뱃지(calc.js의 getGolferBadgesArray)는 "지금 1위인 사람"에게 잠깐 붙는 표시라 모으는 맛이 없었다.
// 여기서는 **못 딴 뱃지도 회색으로 보여** 목표가 생기게 한다.
//
// 종류가 셋이다.
//   life  — 평생 뱃지. 한 번 달성하면 사라지지 않는다. 몇 차에 땄는지 기록에서 거슬러 센다.
//   tier  — 누적 단계. 브론즈·실버·골드 세 단계로 올라간다.
//   title — 시즌 타이틀. 지금 1위인 사람이 보유하고 순위가 바뀌면 넘어간다(calc.js가 낸 값을 읽기만 한다).
//
// **전부 기록에서 계산한다 — payload에 새로 저장하는 값이 없다.** 홀 기록(ROUND_STATS) · 타수(appData.scores) ·
// 계급 이력(golferRankHistory + rankedRoundsList)만 본다. 차수를 지웠다 되살려도 저절로 맞는다.
// 이 기기에서 이미 본 뱃지(획득 연출용)만 localStorage(`jtfag_badges_seen_{이름}`)에 둔다.

const BADGE_TIERS = {
    // c: 흰 바탕 위 색 · f: 옅은 칠 · d: 어두운 획득 연출 위 색(흰 바탕 색은 어두운 바탕에서 안 읽힌다)
    bronze: { name: '브론즈', c: '#a8692f', f: '#f6ece2', d: '#d79a62' },
    silver: { name: '실버',   c: '#64717f', f: '#edf0f3', d: '#c8d1db' },
    gold:   { name: '골드',   c: '#a87808', f: '#fbf1d6', d: '#e8c66a' },
    legend: { name: '전설',   c: '#6d4bc4', f: '#efe9fb', d: '#b49cf0' },
    title:  { name: '타이틀', c: '#2b5394', f: '#eaf0f8', d: '#9fb9e6' },
    tease:  { name: '불명예', c: '#b4472f', f: '#fbece8', d: '#f08b7a' }
};
const BADGE_STEP_TIERS = ['bronze', 'silver', 'gold'];

// 선 그림(24 칸). 그림문자는 기기마다 모양이 달라 쓰지 않는다(머리말 단추와 같은 이유).
const BADGE_ICONS = {
    flag: 'M4 22V4M4 4h11l-1.5 4L15 12H4',
    eagle: 'M2 13c3-4 7-5 10-2 3-3 7-2 10 2-4-1-7 0-10 4-3-4-6-5-10-4z',
    target: 'M12 3a9 9 0 1 0 .01 0M12 7a5 5 0 1 0 .01 0M12 11a1 1 0 1 0 .01 0',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    double: 'M8 3l1.4 4L13 8.5 9.4 10 8 14l-1.4-4L3 8.5 6.6 7zM17 11l1 2.8 2.8 1-2.8 1L17 19l-1-3.2-2.8-1 2.8-1z',
    crown: 'M3 19h18M4 19L3 8l5 4 4-7 4 7 5-4-1 11',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
    up: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    down: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8',
    flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 2 3 4',
    bars: 'M4 20V10M10 20V4M16 20v-7M3 20h18',
    check: 'M12 3a9 9 0 1 0 .01 0M8 12l3 3 5-6',
    coin: 'M12 3a9 9 0 1 0 .01 0M9 9h4.5a2 2 0 0 1 0 4H9M9 9v8',
    long: 'M5 19L19 5M9 5h10v10',
    wave: 'M2 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0',
    swords: 'M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2',
    rebound: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
    bomb: 'M11 21a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM15 8l3-3M18 5l2 1M18 5l1-2',
    bird: 'M16 7h.01M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.3-2.3L2 20M20 7l2 .5-2 .5M10 18v3M14 17.8V21',
    hundred: 'M4 7v10M8 9a2 2 0 0 1 4 0v6a2 2 0 0 1-4 0zM15 9a2 2 0 0 1 4 0v6a2 2 0 0 1-4 0z',
    onion: 'M12 3c-1 3-6 6-6 11a6 6 0 0 0 12 0c0-5-5-8-6-11zM12 9c-1 2-2 4-2 7M12 9c1 2 2 4 2 7',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
    tick: 'M5 12l5 5 9-10'
};

// ── 기록 읽기 ──────────────────────────────────────────────
function badgeRounds() { return (typeof appData !== 'undefined' && appData.totalRounds) || 0; }
function badgeGross(g, r) {
    const v = parseFloat(appData.scores && appData.scores[g] ? appData.scores[g][r] : NaN);
    return (isNaN(v) || v <= 0) ? null : v;
}
function badgeStat(g, r) {   // r은 0부터. ROUND_STATS의 키는 차수 번호(1부터)다.
    if (typeof ROUND_STATS === 'undefined') return null;
    const rec = ROUND_STATS[String(r + 1)];
    return rec && rec[g] ? rec[g] : null;
}
// 계급 이력과 그 계급이 매겨진 차수(0부터). 타수가 덜 찬 차수는 계급이 없어 둘의 길이가 같다.
function badgeRankRows(g) {
    const ranks = (typeof golferRankHistory !== 'undefined' && golferRankHistory[g]) || [];
    const rounds = (typeof rankedRoundsList !== 'undefined') ? rankedRoundsList : [];
    return ranks.map((rank, i) => ({ rank, round: rounds[i] }));
}
function firstRound(g, pred) {
    for (let r = 0; r < badgeRounds(); r++) if (pred(r)) return r;
    return -1;
}
// 계급이 n번 연달아 `rank`였던 첫 차수
function rankRunRound(g, rank, n) {
    let run = 0;
    for (const row of badgeRankRows(g)) {
        run = row.rank === rank ? run + 1 : 0;
        if (run >= n) return row.round;
    }
    return -1;
}
function minOf(map) {
    const vals = golfers.map(g => map[g]).filter(v => typeof v === 'number');
    return vals.length ? Math.min(...vals) : null;
}

// ── 뱃지 목록 ─────────────────────────────────────────────
// 시즌 타이틀은 calc.js의 calculateAndRender()가 채운 값을 읽기만 한다 — 규칙이 두 군데가 되면
// 요약 카드와 컬렉션이 어긋난다.
const BADGE_GROUPS = [
    { id: 'life', title: '평생 기록', sub: '한 번 달성하면 영원히 남습니다', badges: [
        { id: 'firstBirdie', kind: 'life', tier: 'bronze', icon: 'sparkle', name: '첫 버디', cond: '버디 1회', desc: '라운드에서 처음으로 버디 기록',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.birdie > 0; }) },
        { id: 'multiBirdie', kind: 'life', tier: 'silver', icon: 'double', name: '멀티 버디', cond: '한 라운드 버디 2개', desc: '한 라운드에서 버디 2개 이상 기록',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.birdie + s.eagle >= 2; }) },
        { id: 'break89', kind: 'life', tier: 'silver', icon: 'flag', name: '89타 돌파', cond: '89타 이하', desc: '한 라운드 89타 이하 기록',
          first: g => firstRound(g, r => { const v = badgeGross(g, r); return v !== null && v <= 89; }) },
        { id: 'noOnion', kind: 'life', tier: 'silver', icon: 'check', name: '무양파 라운드', cond: '양파 없는 라운드', desc: '18홀 동안 양파(파의 2배 이상) 없이 마무리',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.doublePar === 0; }) },
        { id: 'parTen', kind: 'life', tier: 'gold', icon: 'shield', name: '파 행진', cond: '한 라운드 파 10개', desc: '한 라운드에서 파 10개 이상 기록',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.par >= 10; }) },
        { id: 'single', kind: 'life', tier: 'gold', icon: 'target', name: '싱글의 품격', cond: '79타 이하', desc: '한 라운드 79타 이하 기록',
          first: g => firstRound(g, r => { const v = badgeGross(g, r); return v !== null && v <= 79; }) },
        { id: 'eagleShot', kind: 'life', tier: 'gold', icon: 'eagle', name: '이글 헌터', cond: '이글 1회', desc: '홀에서 파보다 2타 적게 마무리',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.eagle > 0; }) },
        { id: 'holeInOne', kind: 'life', tier: 'legend', icon: 'crown', name: '기적의 사나이', cond: '홀인원', desc: '한 번에 홀컵에 넣은 기록',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.holeInOne > 0; }) }
    ]},
    { id: 'rank', title: '계급', sub: '독수리 계급 달성 기록', badges: [
        { id: 'eagle1', kind: 'life', tier: 'bronze', icon: 'eagle', name: '독수리 등극', cond: '독수리 1회', desc: '계급 정산에서 처음으로 독수리 달성', first: g => rankRunRound(g, 0, 1) },
        { id: 'eagle2', kind: 'life', tier: 'silver', icon: 'eagle', name: '독수리 2연속', cond: '2경기 연속', desc: '2경기 연속 독수리 계급 달성', first: g => rankRunRound(g, 0, 2) },
        { id: 'eagle3', kind: 'life', tier: 'gold', icon: 'eagle', name: '독수리 3연속', cond: '3경기 연속', desc: '3경기 연속 독수리 계급 달성', first: g => rankRunRound(g, 0, 3) },
        { id: 'eagle5', kind: 'life', tier: 'legend', icon: 'crown', name: '독수리 5연속', cond: '전설', desc: '5경기 연속 독수리 계급 달성', first: g => rankRunRound(g, 0, 5) }
    ]},
    { id: 'tier', title: '누적 단계', sub: '브론즈 · 실버 · 골드로 올라갑니다', badges: [
        { id: 'birdies', kind: 'tier', icon: 'sparkle', name: '버디 수집가', unit: '버디', steps: [3, 10, 30], desc: '통산 버디 개수',
          inc: (g, r) => { const s = badgeStat(g, r); return s ? s.birdie : 0; } },
        { id: 'pars', kind: 'tier', icon: 'shield', name: '철벽 방어', unit: '파', steps: [30, 50, 100], desc: '통산 파 개수',
          inc: (g, r) => { const s = badgeStat(g, r); return s ? s.par : 0; } },
        { id: 'attend', kind: 'tier', icon: 'calendar', name: '개근상', unit: '경기', steps: [10, 20, 30], desc: '참가한 라운드 수',
          inc: (g, r) => badgeGross(g, r) !== null ? 1 : 0 },
        { id: 'eagles', kind: 'tier', icon: 'trophy', name: '독수리 단골', unit: '번', steps: [3, 5, 10], desc: '통산 독수리 계급 횟수',
          inc: (g, r) => badgeRankRows(g).filter(x => x.round === r && x.rank === 0).length }
    ]},
    { id: 'title', title: '시즌 타이틀', sub: '지금 1위만 보유 · 빼앗길 수 있습니다', badges: [
        { id: 'avg1', kind: 'title', icon: 'bars', name: '평균타수 1위', desc: '평균 타수가 가장 낮은 사람',
          holders: () => { const m = minOf(golferAvgScores); return m === null ? [] : golfers.filter(g => golferAvgScores[g] === m); } },
        { id: 'best', kind: 'title', icon: 'trophy', name: '최저타', desc: '전체 기록 중 가장 낮은 타수 보유',
          holders: () => { const m = minOf(golferMinScores); return m === null ? [] : golfers.filter(g => golferMinScores[g] === m); } },
        { id: 'birdie1', kind: 'title', icon: 'sparkle', name: '버디 1위', desc: '통산 버디 개수 1위', holders: () => golferMaxBirdie.slice() },
        { id: 'par1', kind: 'title', icon: 'shield', name: '파 1위', desc: '통산 파 개수 1위', holders: () => golferMaxPar.slice() },
        { id: 'par3', kind: 'title', icon: 'target', name: '숏홀 스나이퍼', desc: '파3 홀 파 대비 평균 1위', holders: () => (golferParSpecialists[3] || []).slice() },
        { id: 'par4', kind: 'title', icon: 'flag', name: '파4 지배자', desc: '파4 홀 파 대비 평균 1위', holders: () => (golferParSpecialists[4] || []).slice() },
        { id: 'par5', kind: 'title', icon: 'long', name: '롱홀 헌터', desc: '파5 홀 파 대비 평균 1위', holders: () => (golferParSpecialists[5] || []).slice() },
        { id: 'uptrend', kind: 'title', icon: 'up', name: '상승세', desc: '최근 경기 타수가 계속 줄어드는 중', holders: () => golfers.filter(g => golferUptrendMap[g]) },
        { id: 'rebound', kind: 'title', icon: 'rebound', name: '극적 반전', desc: '직전 경기 대비 타수를 가장 많이 줄임', holders: () => golfers.filter(g => golferReboundMap[g]) },
        { id: 'rival', kind: 'title', icon: 'swords', name: '영원의 라이벌', desc: '1:1 매치 무승부 최다', holders: () => golfers.filter(g => golferRivalMap[g]) }
    ]},
    // 놀리는 뱃지 — 사용자 요청으로 넣었다. 색을 따로(`tease`) 두어 자랑 뱃지와 갈라 보이게 한다.
    { id: 'tease', title: '불명예 뱃지', sub: '받고 싶지 않지만 모이는 뱃지', badges: [
        { id: 'donor', kind: 'title', tier: 'tease', icon: 'coin', name: '기부왕', desc: '합산 정산 금액 손실 1위', holders: () => golfers.filter(g => golferDonorMap[g]) },
        { id: 'bombSquad', kind: 'title', tier: 'tease', icon: 'bomb', name: '폭탄 처리반', desc: '통산 양파 개수 1위', holders: () => golferMaxDoublePar.slice() },
        { id: 'downtrend', kind: 'title', tier: 'tease', icon: 'down', name: '하락세', desc: '최근 경기 타수가 계속 늘어나는 중', holders: () => golfers.filter(g => golferDowntrendMap[g]) },
        { id: 'swing', kind: 'title', tier: 'tease', icon: 'wave', name: '기복왕', desc: '라운드별 타수 기복 최대', holders: () => golfers.filter(g => golferFluctuationMap[g]) },
        { id: 'sparrow1', kind: 'life', tier: 'tease', icon: 'bird', name: '참새 추락', cond: '참새 1회', desc: '계급 정산에서 처음으로 참새', first: g => rankRunRound(g, 3, 1) },
        { id: 'sparrow2', kind: 'life', tier: 'tease', icon: 'bird', name: '참새 2연속', cond: '2경기 연속', desc: '2경기 연속 참새 계급', first: g => rankRunRound(g, 3, 2) },
        { id: 'club100', kind: 'life', tier: 'tease', icon: 'hundred', name: '100타 클럽', cond: '100타 이상', desc: '한 라운드 100타 이상 기록',
          first: g => firstRound(g, r => { const v = badgeGross(g, r); return v !== null && v >= 100; }) },
        { id: 'onionHat', kind: 'life', tier: 'tease', icon: 'onion', name: '양파 해트트릭', cond: '한 라운드 양파 3개', desc: '한 라운드에서 양파 3개 이상',
          first: g => firstRound(g, r => { const s = badgeStat(g, r); return !!s && s.doublePar >= 3; }) }
    ]}
];

// ── 한 사람의 상태 ─────────────────────────────────────────
// 반환: { def, earned, round(0부터·평생/단계), level(단계 0~3), value, next, holders(타이틀) }
function badgeState(def, g, titleCache) {
    if (def.kind === 'life') {
        const round = def.first(g);
        return { def, earned: round >= 0, round };
    }
    if (def.kind === 'tier') {
        let sum = 0, level = 0;
        const reached = [];
        for (let r = 0; r < badgeRounds(); r++) {
            sum += def.inc(g, r) || 0;
            while (level < def.steps.length && sum >= def.steps[level]) { reached[level] = r; level++; }
        }
        return { def, earned: level > 0, level, value: sum, next: def.steps[level] || null, round: level > 0 ? reached[level - 1] : -1, reached };
    }
    const holders = titleCache[def.id] || [];
    return { def, earned: holders.includes(g), holders };
}

function badgeTitleCache() {
    const cache = {};
    BADGE_GROUPS.forEach(gr => gr.badges.forEach(d => { if (d.kind === 'title') { try { cache[d.id] = d.holders() || []; } catch (e) { cache[d.id] = []; } } }));
    return cache;
}

function collectBadges(g, titleCache) {
    titleCache = titleCache || badgeTitleCache();
    return BADGE_GROUPS.map(gr => ({ group: gr, items: gr.badges.map(d => badgeState(d, g, titleCache)) }));
}

// 획득 연출이 견주는 열쇠 — 단계는 단계마다 따로 센다(실버에 오르면 그때 또 뜬다).
function badgeKeysOf(sections) {
    const keys = [];
    sections.forEach(sec => sec.items.forEach(s => {
        if (!s.earned) return;
        if (s.def.kind === 'tier') { for (let l = 1; l <= s.level; l++) keys.push({ key: `t:${s.def.id}:${l}`, state: s, level: l }); }
        else keys.push({ key: (s.def.kind === 'title' ? 'h:' : 'l:') + s.def.id, state: s, level: 0 });
    }));
    return keys;
}

function badgeTierOf(s, level) {
    const d = s.def;
    if (d.kind === 'tier') {
        const l = level !== undefined ? level : s.level;
        return BADGE_TIERS[BADGE_STEP_TIERS[Math.max(0, l - 1)]];
    }
    return BADGE_TIERS[d.tier || 'title'];
}

function badgeIcon(name, size, color, width) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width || 1.9}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${BADGE_ICONS[name] || ''}"/></svg>`;
}

// ── 뱃지 화면 ─────────────────────────────────────────────
let badgeViewName = null;     // 지금 보는 사람. 처음엔 이 기기 주인
let badgeLastHtml = '';

function badgeLatestRound() {
    for (let r = badgeRounds() - 1; r >= 0; r--) if (golfers.some(g => badgeGross(g, r) !== null)) return r;
    return -1;
}

function badgeSubText(s) {
    const d = s.def;
    if (d.kind === 'life') return s.earned ? `${s.round + 1}차 획득` : d.cond;
    if (d.kind === 'tier') {
        if (!s.earned) return `${s.value}/${d.steps[0]}${d.unit === '경기' ? '경기' : ''}`;
        const t = BADGE_TIERS[BADGE_STEP_TIERS[s.level - 1]].name;
        return s.next ? `${t} · ${s.value}/${s.next}` : `${t} 완성`;
    }
    if (s.earned) return s.holders.length > 1 ? '공동 보유' : '보유 중';
    if (!s.holders.length) return '보유자 없음';
    return `${s.holders[0]}${s.holders.length > 1 ? ' 외' : ''} 보유`;
}

function badgeTileHtml(s, latest) {
    const d = s.def;
    const t = badgeTierOf(s);
    const locked = !s.earned;
    const isNew = !locked && d.kind !== 'title' && s.round === latest && latest >= 0;
    const prog = d.kind === 'tier' && (locked || s.next);
    const target = d.kind === 'tier' ? (locked ? d.steps[0] : s.next) : 0;
    const pct = prog ? Math.min(100, Math.round(s.value / target * 100)) : 0;
    return `<button type="button" class="bdg-tile${locked ? ' locked' : ''}" onclick="openBadgeDetail('${d.id}')" aria-label="${escapeHtml(d.name)} ${locked ? '미획득' : '획득'}">
        <span class="bdg-medal" style="--bc:${t.c};--bf:${t.f}">
            ${badgeIcon(d.icon, 26, locked ? '#b4b8bd' : t.c)}
            ${locked ? `<span class="bdg-lock">${badgeIcon('lock', 11, '#9aa0a8', 2.4)}</span>` : ''}
            ${isNew ? '<span class="bdg-new">NEW</span>' : ''}
        </span>
        <span class="bdg-name">${escapeHtml(d.name)}</span>
        <span class="bdg-sub" style="${locked ? '' : `color:${t.c}`}">${escapeHtml(badgeSubText(s))}</span>
        ${prog ? `<span class="bdg-bar"><span style="width:${pct}%;background:${locked ? '#b4b8bd' : t.c}"></span></span>` : ''}
    </button>`;
}

// 남은 비율이 가장 작은 단계 하나 — "다음 목표"
function badgeNextGoal(sections) {
    let best = null;
    sections.forEach(sec => sec.items.forEach(s => {
        if (s.def.kind !== 'tier') return;
        const target = s.earned ? s.next : s.def.steps[0];
        if (!target) return;
        const left = target - s.value;
        const ratio = left / target;
        if (!best || ratio < best.ratio) best = { s, target, left, ratio };
    }));
    return best;
}

function rankImageSrc(rankIdx) {
    const info = RANK_CONFIG[rankIdx];
    const m = info && String(info.icon).match(/src="([^"]+)"/);
    return m ? m[1] : '';
}

// 수집 개수 · 순위에는 **불명예 뱃지를 안 센다** — 세면 못 치는 사람이 수집 1위가 된다(헤드리스로 실제로 그랬다).
// 불명예는 그 묶음 머리에 따로 센다.
function badgeCount(sections) {
    let got = 0, total = 0;
    sections.forEach(sec => { if (sec.group.id === 'tease') return; sec.items.forEach(s => { total++; if (s.earned) got++; }); });
    return { got, total };
}

function renderBadgePage() {
    const box = document.getElementById('badgePage');
    if (!box || typeof golfers === 'undefined') return;
    const titleCache = badgeTitleCache();
    const all = {};
    golfers.forEach(g => { all[g] = collectBadges(g, titleCache); });
    const me = localStorage.getItem('jtfag_my_name');
    if (!badgeViewName || !golfers.includes(badgeViewName)) badgeViewName = golfers.includes(me) ? me : golfers[0];
    const g = badgeViewName;
    const sections = all[g];
    const latest = badgeLatestRound();

    // 사람 칸 — 수집 순위를 겸한다(같은 개수는 같은 등수)
    const counts = golfers.map(n => ({ n, c: badgeCount(all[n]).got }));
    const sorted = counts.slice().sort((a, b) => b.c - a.c);
    const chips = sorted.map(x => {
        const place = sorted.findIndex(y => y.c === x.c) + 1;
        return `<button type="button" class="bdg-person${x.n === g ? ' on' : ''}" onclick="selectBadgePerson('${x.n}')">
            <span class="bdg-place">${place}위</span><span class="bdg-pname">${escapeHtml(x.n)}</span><span class="bdg-pcount">${x.c}개</span>
        </button>`;
    }).join('');

    const { got, total } = badgeCount(sections);
    const pct = total ? Math.round(got / total * 100) : 0;
    const ranks = golferRankHistory[g] || [];
    const rankIdx = ranks.length ? ranks[ranks.length - 1] : -1;
    const played = (appData.scores && appData.scores[g] || []).filter(v => !isNaN(parseFloat(v))).length;
    const rankLine = rankIdx >= 0 ? `${RANK_CONFIG[rankIdx].name}등급 · ${played}경기 참가` : `${played}경기 참가`;
    const img = rankIdx >= 0 ? rankImageSrc(rankIdx) : '';
    const goal = badgeNextGoal(sections);
    const goalHtml = goal ? (() => {
        const d = goal.s.def;
        const nextTier = BADGE_TIERS[BADGE_STEP_TIERS[goal.s.earned ? goal.s.level : 0]].name;
        return `<button type="button" class="bdg-goal" onclick="openBadgeDetail('${d.id}')">
            ${badgeIcon('target', 18, '#2b5394', 2)}
            <span class="bdg-goal-text">다음 목표 · <b>${escapeHtml(d.name)} ${nextTier}</b> — ${d.unit} <b class="hl">${goal.left}${d.unit === '경기' ? '' : '개'}</b> 남음</span>
            <span class="bdg-goal-num">${goal.s.value}/${goal.target}</span>
        </button>`;
    })() : '';

    const secHtml = sections.map(sec => {
        const c = sec.items.filter(s => s.earned).length;
        return `<div class="bdg-card bdg-sec${sec.group.id === 'tease' ? ' tease' : ''}">
            <div class="bdg-sec-head"><div><div class="bdg-sec-title">${sec.group.title}</div><div class="bdg-sec-sub">${sec.group.sub}</div></div>
            <div class="bdg-sec-count">${c} / ${sec.items.length}</div></div>
            <div class="bdg-grid">${sec.items.map(s => badgeTileHtml(s, latest)).join('')}</div>
        </div>`;
    }).join('');

    const html = `
        <div class="bdg-people">${chips}</div>
        <div class="bdg-card bdg-me">
            <div class="bdg-me-row">
                <span class="bdg-avatar">${img ? `<img src="${img}" alt="">` : badgeIcon('eagle', 26, '#2b5394')}</span>
                <div class="bdg-me-name"><div class="nm">${escapeHtml(g)}</div><div class="sub">${rankLine}</div></div>
                <div class="bdg-me-count"><div class="big">${got}<span> / ${total}</span></div><div class="sub">수집 ${pct}%</div></div>
            </div>
            <div class="bdg-me-bar"><span style="width:${pct}%"></span></div>
            ${goalHtml}
        </div>
        ${secHtml}
        <div class="bdg-foot">평생 뱃지는 한 번 획득하면 사라지지 않습니다. 시즌 타이틀은 지금 1위인 사람이 보유하며, 순위가 바뀌면 다른 사람에게 넘어갑니다.</div>`;
    // 같으면 갈아 끼우지 않는다 — 남의 저장마다 renderAll이 돌아 누르던 칸이 사라지면 안 된다.
    if (html === badgeLastHtml) return;
    badgeLastHtml = html;
    box.innerHTML = html;
}

function selectBadgePerson(name) {
    if (!golfers.includes(name)) return;
    badgeViewName = name;
    renderBadgePage();
}

// ── 뱃지 상세(아래에서 올라오는 창) ─────────────────────────
function closeBadgeDetail() {
    const o = document.querySelector('.bdg-sheet-overlay');
    if (!o) return;
    o.classList.remove('show');
    setTimeout(() => o.remove(), 220);
}

function openBadgeDetail(id) {
    let def = null;
    BADGE_GROUPS.forEach(gr => gr.badges.forEach(d => { if (d.id === id) def = d; }));
    if (!def) return;
    closeBadgeDetail();
    const titleCache = badgeTitleCache();
    const g = badgeViewName;
    const s = badgeState(def, g, titleCache);
    const t = badgeTierOf(s);
    const locked = !s.earned;

    let body = '';
    if (def.kind === 'tier') {
        body = `<div class="bdg-ladder">${def.steps.map((n, i) => {
            const tier = BADGE_TIERS[BADGE_STEP_TIERS[i]];
            const done = s.level > i;
            const current = s.level === i;
            const pct = Math.min(100, Math.round(s.value / n * 100));
            return `<div class="bdg-step${done ? ' done' : ''}${!done && !current ? ' later' : ''}">
                <span class="bdg-step-dot" style="--bc:${tier.c}">${done ? badgeIcon('tick', 16, '#ffffff', 2.6) : (i + 1)}</span>
                <div class="bdg-step-body">
                    <div class="bdg-step-top"><span>${tier.name} · ${def.unit} ${n}${def.unit === '경기' ? '' : '개'}</span>${current ? `<b>${s.value} / ${n}</b>` : ''}</div>
                    ${done ? `<div class="bdg-step-sub">${s.reached[i] + 1}차에 획득</div>` : ''}
                    ${current ? `<div class="bdg-step-bar"><span style="width:${pct}%"></span></div><div class="bdg-step-sub hl">${def.unit} ${n - s.value}${def.unit === '경기' ? '' : '개'} 남음</div>` : ''}
                </div>
            </div>`;
        }).join('')}</div>`;
    } else if (def.kind === 'life') {
        body = `<div class="bdg-fact">${locked ? `획득 조건 · <b>${escapeHtml(def.cond)}</b>` : `<b>${s.round + 1}차</b>에 획득`}</div>`;
    } else {
        body = `<div class="bdg-fact">${s.holders.length ? `현재 보유 · <b>${s.holders.map(escapeHtml).join(', ')}</b>` : '현재 보유자가 없습니다'}</div>`;
    }

    const members = golfers.map(n => {
        const ms = badgeState(def, n, titleCache);
        let line = '';
        if (def.kind === 'tier') line = ms.earned ? `<b style="color:${BADGE_TIERS[BADGE_STEP_TIERS[ms.level - 1]].c}">${BADGE_TIERS[BADGE_STEP_TIERS[ms.level - 1]].name}</b>` : '<b class="off">미획득</b>';
        else if (def.kind === 'life') line = ms.earned ? `<b style="color:${t.c}">${ms.round + 1}차 획득</b>` : '<b class="off">미획득</b>';
        else line = ms.earned ? `<b style="color:${t.c}">보유 중</b>` : '<b class="off">-</b>';
        const extra = def.kind === 'tier' ? `<span>${def.unit} ${ms.value}</span>` : '';
        return `<div class="bdg-member${n === g ? ' me' : ''}"><span class="nm">${escapeHtml(n)}</span>${line}${extra}</div>`;
    }).join('');

    const label = def.kind === 'tier' ? (s.earned ? BADGE_TIERS[BADGE_STEP_TIERS[s.level - 1]].name : '미획득') : (locked ? '미획득' : t.name);
    const o = document.createElement('div');
    o.className = 'bdg-sheet-overlay';
    o.innerHTML = `<div class="bdg-sheet" role="dialog" aria-label="${escapeHtml(def.name)}">
        <div class="bdg-grip"></div>
        <div class="bdg-big">
            <span class="bdg-medal big${locked ? ' locked' : ''}" style="--bc:${t.c};--bf:${t.f}">${badgeIcon(def.icon, 48, locked ? '#b4b8bd' : t.c, 1.7)}</span>
            <div class="bdg-big-name"><span>${escapeHtml(def.name)}</span><em style="color:${locked ? '#8a9097' : t.c};background:${locked ? '#f1f1ef' : t.f}">${label}</em></div>
            <div class="bdg-big-desc">${escapeHtml(def.desc)}</div>
            <div class="bdg-big-who">${escapeHtml(g)}님 기준</div>
        </div>
        ${body}
        <div class="bdg-members-title">멤버 현황</div>
        <div class="bdg-members">${members}</div>
        <button type="button" class="bdg-close" onclick="closeBadgeDetail()">닫기</button>
    </div>`;
    o.addEventListener('click', e => { if (e.target === o) closeBadgeDetail(); });
    document.body.appendChild(o);
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}

// ── 획득 연출 ─────────────────────────────────────────────
// 사용자 요청 — 획득할 때마다 띄운다. 이 기기 주인(jtfag_my_name)의 뱃지만 본다.
// **처음 보는 기기는 지금 가진 것을 조용히 기억만 한다** — 예전에 딴 것까지 한꺼번에 쏟아지면 연출이 아니라 방해다.
// 평생·단계 뱃지는 한번 본 것으로 남기고(차수를 지웠다 되살려도 다시 안 뜬다),
// 타이틀은 지금 안 가진 것을 기억에서 뺀다 — 빼앗겼다 되찾으면 다시 뜬다.
let badgeUnlockRetry = null;

function badgeSeenKey(name) { return 'jtfag_badges_seen_' + name; }

function checkBadgeUnlocks() {
    if (typeof isLoaded !== 'undefined' && !isLoaded) return;
    const me = localStorage.getItem('jtfag_my_name');
    if (!me || !golfers.includes(me)) return;
    if (typeof entranceBlocked === 'function' && entranceBlocked()) return;
    // 다른 연출(결과 발표·독수리 축포)이 끝난 뒤에 띄운다
    if (document.querySelector('.reveal-overlay, .celebrate-overlay, .greet-overlay, .bdg-unlock')) {
        clearTimeout(badgeUnlockRetry);
        badgeUnlockRetry = setTimeout(checkBadgeUnlocks, 1500);
        return;
    }
    const keys = badgeKeysOf(collectBadges(me));
    let seen;
    try { seen = JSON.parse(localStorage.getItem(badgeSeenKey(me)) || 'null'); } catch (e) { seen = null; }
    if (!Array.isArray(seen)) {
        try { localStorage.setItem(badgeSeenKey(me), JSON.stringify(keys.map(k => k.key))); } catch (e) {}
        return;
    }
    const nowSet = new Set(keys.map(k => k.key));
    const kept = seen.filter(k => !k.startsWith('h:') || nowSet.has(k));
    const seenSet = new Set(kept);
    const fresh = keys.filter(k => !seenSet.has(k.key));
    if (kept.length !== seen.length) { try { localStorage.setItem(badgeSeenKey(me), JSON.stringify(kept)); } catch (e) {} }
    if (fresh.length) showBadgeUnlock(me, fresh);
}

function markBadgeSeen(me, key) {
    let seen;
    try { seen = JSON.parse(localStorage.getItem(badgeSeenKey(me)) || '[]'); } catch (e) { seen = []; }
    if (!Array.isArray(seen)) seen = [];
    if (!seen.includes(key)) seen.push(key);
    try { localStorage.setItem(badgeSeenKey(me), JSON.stringify(seen)); } catch (e) {}
}

function showBadgeUnlock(me, queue) {
    let i = 0;
    const o = document.createElement('div');
    o.className = 'bdg-unlock';
    document.body.appendChild(o);
    let timer = null;
    const close = () => {
        clearTimeout(timer);
        o.classList.remove('show');
        setTimeout(() => o.remove(), 300);
    };
    const paint = () => {
        const k = queue[i];
        markBadgeSeen(me, k.key);
        const s = k.state, d = s.def;
        const tier = badgeTierOf(s, k.level || undefined);
        const tease = d.tier === 'tease';
        let what = '획득', line = d.desc, when = '';
        if (d.kind === 'tier') { what = `${tier.name} 달성`; line = `통산 ${d.unit} ${d.steps[k.level - 1]}${d.unit === '경기' ? '' : '개'} 달성`; when = `${s.reached[k.level - 1] + 1}차 라운드에서 획득`; }
        else if (d.kind === 'life') when = `${s.round + 1}차 라운드에서 획득`;
        else what = tease ? '떠안음' : '타이틀 획득';
        const stars = d.kind === 'tier' ? `<div class="bdg-u-stars">${[1, 2, 3].map(n => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="${n <= k.level ? tier.d : 'none'}" stroke="${n <= k.level ? tier.d : '#4a515c'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`).join('')}</div>` : '';
        o.innerHTML = `<div class="bdg-u-rings"><span></span><span></span><span></span></div>
            <div class="bdg-u-body${tease ? ' tease' : ''}">
                <div class="bdg-u-kicker">${tease ? '불명예 뱃지' : 'NEW BADGE'}</div>
                <div class="bdg-u-medal" style="--bc:${tier.d}">${badgeIcon(d.icon, 70, '#eef1f5', 1.6)}</div>
                ${stars}
                <div class="bdg-u-name">${escapeHtml(d.name)}</div>
                <div class="bdg-u-what" style="color:${tier.d}">${what}</div>
                <div class="bdg-u-line">${escapeHtml(line)}<br>${escapeHtml(me)}님${when ? ' · ' + escapeHtml(when) : ''}</div>
            </div>
            <div class="bdg-u-foot">
                <button type="button" class="bdg-u-btn">컬렉션 보기</button>
                <div class="bdg-u-hint">${queue.length > 1 ? `${i + 1} / ${queue.length} · ` : ''}화면을 누르면 넘어갑니다</div>
            </div>`;
        o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop');
        o.querySelector('.bdg-u-btn').addEventListener('click', e => {
            e.stopPropagation();
            // 남은 것도 본 것으로 친다 — 컬렉션에서 다 보인다
            for (let j = i + 1; j < queue.length; j++) markBadgeSeen(me, queue[j].key);
            close();
            badgeViewName = me;
            renderBadgePage();
            if (typeof slideToPage === 'function') slideToPage('badges');
        });
        clearTimeout(timer);
        timer = setTimeout(next, 5500);
    };
    const next = () => { i++; if (i >= queue.length) close(); else paint(); };
    o.addEventListener('click', next);
    paint();
    requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add('show')));
}
