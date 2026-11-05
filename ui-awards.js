// ◇ ui-awards.js — 연말 시상식 화면: 시즌 알약 · 트로피 · 시상식 연출 · 관리자 지정(마지막 차수·공로상)
// ◇ 계산은 season.js(시즌)와 awards.js(시상)가 한다. 여기는 그리고 여닫기만 한다. 아무것도 저장하지 않는다(관리자 지정만 예외).

// ── 시즌 알약 ────────────────────────────────────────────
function seasonPillHtml() { return `<span class="season-pill">${currentSeason()} 시즌</span>`; }

// ── 뱃지 탭의 `뱃지 | 트로피` 전환 ─────────────────────────
let badgeView = 'badges';     // 'badges' | 'trophy'
let trophyYear = 0;           // 0이면 자동(마무리된 가장 최근 시즌, 없으면 지금 시즌)
let trophyName = '';

function badgeViewSegHtml() {
    return `<div class="passport-tabs tc-seg" role="tablist" aria-label="뱃지 화면 전환">
        <button type="button" role="tab" aria-selected="${badgeView === 'badges'}" class="${badgeView === 'badges' ? 'on' : ''}" onclick="setBadgeView('badges')">뱃지</button>
        <button type="button" role="tab" aria-selected="${badgeView === 'trophy'}" class="${badgeView === 'trophy' ? 'on' : ''}" onclick="setBadgeView('trophy')">트로피</button>
    </div>`;
}
function setBadgeView(v) {
    badgeView = v === 'trophy' ? 'trophy' : 'badges';
    badgeLastHtml = '';
    renderBadgePage();
}
function selectTrophyYear(y) { trophyYear = y; badgeLastHtml = ''; renderBadgePage(); }
function selectTrophyPerson(n) { if (golfers.includes(n)) { trophyName = n; badgeLastHtml = ''; renderBadgePage(); } }

function trophyYearNow() {
    const tabs = seasonTabs();
    if (trophyYear && tabs.includes(trophyYear)) return trophyYear;
    const closed = closedSeasons();
    return closed.length ? closed[closed.length - 1] : currentSeason();
}

// 시상 부문별 그림 — 부문마다 모양과 색이 다르다(사용자 요청 — 모두 같은 과녁이라 구별이 안 됐다).
// c = 어두운 시상식 바탕에서 쓰는 밝은 색, d = 흰 바탕 트로피 칸에서 쓰는 진한 색. 선 그림(viewBox 64)이고 그림문자는 안 쓴다.
const AW_SET = {
    avg: { c: '#e7c46a', d: '#b8860b', p: '<circle cx="28" cy="36" r="19"/><circle cx="28" cy="36" r="11"/><circle cx="28" cy="36" r="3" fill="currentColor"/><path d="M29.5 34.5L53 11M44 10h10v10"/>' },
    rave: { c: '#6cc4ff', d: '#1f7fc4', p: '<path d="M20 55V9"/><path d="M20 11l26 9.5L20 31z" fill="currentColor" fill-opacity=".28"/><path d="M10 55h22"/><ellipse cx="47" cy="55" rx="8" ry="2.6"/><circle cx="47" cy="46.5" r="4"/>' },
    eagle: { c: '#ffa94d', d: '#d9770a', p: '<path d="M12 56C9 40 15 23 30 15c8-4 18-4 22 3 5 1 9 6 8 13-1 5-6 7-9 4l-4-4c-3 6-8 10-9 18-.4 2-.5 4-.5 8z" fill="currentColor" fill-opacity=".25"/><path d="M51 18c6 1 10 7 8 14-1 4-6 5-8 2"/><path d="M36 19l11 3.5"/><circle cx="42" cy="24" r="2.4" fill="currentColor"/><path d="M19 54c0-9 3-15 9-20M26 56c0-7 3-12 8-16"/>' },
    birdie: { c: '#5fd6a8', d: '#1f9d72', p: '<path d="M30 29C10 9 5 21 17 34C7 36 13 54 30 39ZM34 29C54 9 59 21 47 34C57 36 51 54 34 39Z" fill="currentColor" fill-opacity=".22"/><ellipse cx="32" cy="33" rx="2.5" ry="12" fill="currentColor"/><path d="M31 23c-1-7-4-12-8-10M33 23c1-7 4-12 8-10M8 55h48"/><circle cx="23" cy="13" r="1.4" fill="currentColor"/><circle cx="41" cy="13" r="1.4" fill="currentColor"/>' },
    mission: { c: '#b196ff', d: '#6d4fd6', p: '<path d="M32 7l19 7v15c0 13-8 21-19 27-11-6-19-14-19-27V14z" fill="currentColor" fill-opacity=".2"/><path d="M32 20l3.6 7.4 8.1 1.1-5.9 5.6 1.5 8L32 38.2l-7.3 3.9 1.5-8-5.9-5.6 8.1-1.1z" fill="currentColor"/>' },
    life: { c: '#ff7b6b', d: '#d94a38', p: '<path d="M37 5L15 36h15l-4 23 23-33H34z" fill="currentColor" fill-opacity=".25"/><path d="M52 8v8M48 12h8M12 14v6M9 17h6"/>' },
    devote: { c: '#ff8fb8', d: '#d6457f', p: '<path d="M32 55S9 41 9 25c0-7 5-12 12-12 5 0 9 3 11 7 2-4 6-7 11-7 7 0 12 5 12 12 0 16-23 30-23 30z" fill="currentColor" fill-opacity=".22"/><path d="M24 28c0-3 2-5 5-5"/>' },
    donor: { c: '#9be26b', d: '#5a9b2a', p: '<circle cx="32" cy="32" r="23" fill="currentColor" fill-opacity=".16"/><path d="M19 21l6.5 22L32 29l6.5 14L45 21M16 30h32M16 36h32"/>' },
    merit: { c: '#dfe5f2', d: '#6b7587', p: '<path d="M22 6l9 17M42 6l-9 17"/><circle cx="32" cy="39" r="15" fill="currentColor" fill-opacity=".16"/><path d="M32 30l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="currentColor"/>' },
    grand: { c: '#e7c46a', d: '#b8860b', p: '<path d="M8 46l6-26 14 14 4-20 4 20 14-14 6 26z" fill="currentColor" fill-opacity=".3"/><rect x="10" y="50" width="44" height="6" rx="2" fill="currentColor"/>' }
};
function awSvg(id, size, extra) {
    const art = typeof achievementArt === 'function' ? achievementArt('trophy', id, size) : '';
    if (art) return art;
    const d = AW_SET[id] || AW_SET.avg;
    return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="${extra || 3}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d.p}</svg>`;
}
// 시상식 장 위쪽의 큰 엠블럼 — 부문 색 테두리 + 옅은 방사 바탕(정지 그림 · transform/opacity만 한 번 움직인다)
function awEmblem(id) {
    const d = AW_SET[id] || AW_SET.avg;
    return `<span class="aw-emblem illustrated" style="--c:${d.c}">${awSvg(id, 112)}</span>`;
}
// 트로피 칸 머리의 작은 그림 — 받은 상은 부문 색, 못 받은 상은 칸의 회색 그대로
function awMini(id, got) {
    const d = AW_SET[id] || AW_SET.avg;
    return `<span class="tc-ico"${got ? ` style="color:${d.d}"` : ''}>${awSvg(id, 92, 3.4)}</span>`;
}

function trophyCaseHtml() {
    const y = trophyYearNow();
    const me = localStorage.getItem('jtfag_my_name');
    if (!trophyName || !golfers.includes(trophyName)) trophyName = golfers.includes(me) ? me : golfers[0];
    const g = trophyName;
    const open = awardsOpen(y);
    const tabs = seasonTabs().map(t => `<button type="button" class="${t === y ? 'on' : ''}" onclick="selectTrophyYear(${t})">${t}</button>`).join('');
    const bar = `<div class="tc-bar"><div class="tc-years" role="tablist" aria-label="시즌">${tabs}</div>
        ${open ? `<button type="button" class="tc-replay" onclick="openAwardsCeremony(${y}, true)">시상식 다시 보기</button>` : ''}</div>`;

    if (!open) {
        const cards = golfers.map(n => `<button type="button" class="bdg-person${n === g ? ' on' : ''}" onclick="selectTrophyPerson('${n}')"><span class="bdg-pname">${escapeHtml(n)}</span><span class="bdg-pcount">수상 0</span></button>`).join('');
        return `${bar}
            <div class="bdg-people">${cards}</div>
            <div class="tc-wait">
                <div class="tc-wait-t">${y} 시즌 시상식</div>
                <div class="tc-wait-s">${escapeHtml(seasonPendingText(y))}</div>
            </div>
            <div class="tc-grid">${[['grand', '올해의 골퍼']].concat(AWARD_ORDER.map(id => [id, { avg: '평균 타수상', rave: '라베상', eagle: '독수리왕', birdie: '버디왕', mission: '미션왕', life: '인생경기상', devote: '헌신왕', donor: '기부왕', merit: '공로상' }[id]])).map(([id, nm]) =>
                `<div class="tc-cell no"><div class="tc-cell-h">${awMini(id, false)}<span>${nm}</span></div><div class="tc-cell-n">발표 전</div></div>`).join('')}</div>`;
    }

    const aw = computeAwards(y);
    const st = aw.stats[g];
    const cards = golfers.map(n => `<button type="button" class="bdg-person${n === g ? ' on' : ''}" onclick="selectTrophyPerson('${n}')"><span class="bdg-pname">${escapeHtml(n)}</span><span class="bdg-pcount">수상 ${aw.tally[n]}</span></button>`).join('');
    const stat = [
        ['평균', st.avg === null ? '-' : st.avg.toFixed(1)],
        ['베스트', st.min ? st.min.v : '-'],
        ['버디', st.holes.birdie],
        ['독수리', `${st.counts[0]}회`]
    ].map(([k, v]) => `<div class="tc-stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const cell = (id, name, holders, gotNote, manual) => {
        const got = holders.includes(g);
        const note = got ? gotNote : (holders.length ? `시즌 1위 ${holders.map(escapeHtml).join('·')}` : (manual ? '관리자 지정 전' : '해당 없음'));
        return `<div class="tc-cell ${got ? 'got' : 'no'}"><div class="tc-cell-h">${awMini(id, got)}<span>${name}</span></div><div class="tc-cell-n">${note}</div></div>`;
    };
    const grandNote = aw.grand.rows.find(r => r.g === g);
    const cells = [cell('grand', '올해의 골퍼', aw.grand.holders, `계급 점수 ${grandNote ? grandNote.points : 0}점`)]
        .concat(aw.awards.map(a => cell(a.id, escapeHtml(a.name), a.holders, escapeHtml(a.metric) + (a.holders.length > 1 && !/공동/.test(a.metric) ? ' · 공동' : ''), a.manual))).join('');
    return `${bar}
        <div class="bdg-people">${cards}</div>
        <div class="bdg-card tc-stats">${stat}</div>
        <div class="tc-grid">${cells}</div>
        <div class="bdg-foot">획득한 상은 금색, 아직 받지 못한 상은 점선으로 보입니다. 지난 시즌 트로피는 연도 탭에 영구 보관됩니다.</div>`;
}

// ── 시상식 연출 ─────────────────────────────────────────────
// 입장 → 부문별 발표(수상자가 있는 부문만) → 대상. 화면을 누르면 다음으로 넘어가고, 기기마다 시즌당 한 번만 저절로 뜬다.
// 마무리된 시즌이 아니면 열리지 않는다(재생 단추도 트로피에서 마무리된 시즌에만 보인다).
let awardsCeremony = null;

const AW_CROWN = (typeof achievementArt === 'function' && achievementArt('trophy', 'grand', 112)) || `<svg width="84" height="84" viewBox="0 0 64 64" fill="#e7c46a" stroke="#e7c46a" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M8 46l6-26 14 14 4-20 4 20 14-14 6 26z"/><rect x="10" y="50" width="44" height="6" rx="2"/></svg>`;
const AW_CUP = (typeof achievementArt === 'function' && achievementArt('trophy', 'grand', 96)) || `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#e7c46a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10h24v14a12 12 0 0 1-24 0V10z"/><path d="M20 14H10v4a10 10 0 0 0 10 10M44 14h10v4a10 10 0 0 1-10 10"/><path d="M32 36v10M22 54h20M26 46h12v8H26z"/></svg>`;

function awardsSlides(y) {
    const aw = computeAwards(y);
    const shown = aw.awards.filter(a => a.holders.length);
    const total = shown.length + (aw.grand.holders.length ? 1 : 0);
    const dots = i => Array.from({ length: total }, (_, k) => `<span class="aw-dot${k <= i ? ' on' : ''}"></span>`).join('');
    const slides = [];
    const n = seasonRoundIdx(y).length;
    slides.push(`<div class="aw-intro">
        <div class="aw-eyebrow">JTFAG · SEASON AWARDS</div>
        <div class="aw-cup">${AW_CUP}</div>
        <div class="aw-year">${y}</div>
        <div class="aw-han aw-big">연말 시상식</div>
        <div class="aw-lead">${n}경기 · 네 명 · 한 시즌<br>올 한 해의 주인공을 발표합니다</div>
        <div class="aw-chips"><span>시상 부문 ${total}개</span><span>${y}.01 ~ ${y}.12</span></div>
        <button type="button" class="aw-go" data-next="1">시상식 입장</button>
        <div class="aw-foot">새 시즌(${y + 1})은 계급·타수 금액·시즌 타이틀이 0에서 다시 시작합니다</div>
    </div>`);
    shown.forEach((a, i) => {
        const rows = a.rows.filter(r => a.dir === 'max' ? r.v > 0 : true);
        const bar = r => { const w = a.dir === 'max' ? (a.best > 0 ? r.v / a.best : 0) : (r.v > 0 ? a.best / r.v : 0); return Math.max(6, Math.round(w * 100)); };
        slides.push(`<div class="aw-slide aw-pend">
            <div class="aw-top"><span class="aw-eyebrow">AWARD ${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span><span class="aw-dots">${dots(i)}</span></div>
            <div class="aw-title">${awEmblem(a.id)}<div class="aw-han aw-name">${escapeHtml(a.name)}</div><div class="aw-rule">${escapeHtml(a.rule)}</div></div>
            <div class="aw-win"><div class="aw-eyebrow">WINNER</div>
                <div class="aw-han aw-who${a.holders.length > 1 ? ' multi' : ''}">${a.holders.map(escapeHtml).join(' · ')}</div>
                <div class="aw-metric">${escapeHtml(a.metric)}</div></div>
            ${rows.length ? `<div class="aw-rows">${rows.map(r => `<div class="aw-row${a.holders.includes(r.g) ? ' top' : ''}">
                <span class="aw-rn">${escapeHtml(r.g)}</span><span class="aw-bar"><i style="width:${bar(r)}%"></i></span><span class="aw-rv">${escapeHtml(r.text)}</span></div>`).join('')}</div>` : ''}
            <div class="aw-tap"><span class="aw-tap-a">화면을 누르면 수상자가 발표됩니다</span><span class="aw-tap-b">화면을 누르면 다음 발표로 넘어갑니다</span></div>
        </div>`);
    });
    if (aw.grand.holders.length) {
        const top = aw.grand.rows.find(r => aw.grand.holders.includes(r.g));
        slides.push(`<div class="aw-grand aw-pend">
            <div class="aw-eyebrow">GRAND PRIZE · ${y}</div>
            <div class="aw-crown">${AW_CROWN}</div>
            <div class="aw-gwho"><div class="aw-glead">올해의 골퍼</div>
                <div class="aw-han aw-gname${aw.grand.holders.length > 1 ? ' multi' : ''}">${aw.grand.holders.map(escapeHtml).join(' · ')}</div>
                <div class="aw-gsub">계급 점수 <b>${top.points}</b>점 · 독수리 ${top.eagle}회</div></div>
            <div class="aw-table">
                <div class="aw-trow head"><span class="c1">순위</span><span class="c2"></span><span class="c3">독수리</span><span class="c4">계급 점수</span></div>
                ${aw.grand.rows.map(r => `<div class="aw-trow${aw.grand.holders.includes(r.g) ? ' top' : ''}"><span class="c1">${r.rank}</span><span class="c2">${escapeHtml(r.g)}</span><span class="c3">${r.eagle}회</span><span class="c4">${r.points}</span></div>`).join('')}
            </div>
            <div class="aw-notes">
                <div><b>계급 점수</b> 독수리 3점 · 매 2점 · 학 1점 · 참새 0점 (${aw.grand.ranked}경기)</div>
                <div><b>동점</b> ${aw.grand.tieBroken ? (aw.grand.tieBy === 'eagle' ? `계급 점수가 같아 독수리를 가장 많이 한 사람(${top.eagle}회)이 앞섭니다` : `계급 점수와 독수리 횟수가 같아 평균 타수(${top.avg === null ? '-' : top.avg.toFixed(1) + '타'})가 낮은 쪽이 앞섭니다`) : '독수리를 가장 많이 한 사람이 앞섭니다'}</div>
            </div>
            <div class="aw-tap aw-tap-grand"><span class="aw-tap-a">화면을 누르면 올해의 골퍼가 발표됩니다</span></div>
            <button type="button" class="aw-go gold" data-case="1">트로피 보기</button>
        </div>`);
    }
    return slides;
}

// 시상식 글꼴(Black Han Sans · Cinzel)이 다 도착한 뒤에 첫 장을 그린다 — 안 그러면 처음 볼 때 폰 기본 글꼴(얇음)로 그려졌다가
// 글꼴이 오는 순간 굵게 바뀐다(사용자 제보 — `글자가 얇아졌다 두꺼워지는 현상`). 구글 글꼴 CSS가 붙기 전에는 `document.fonts.load()`가
// 빈 손으로 곧바로 끝나므로 CSS(`#g3Fonts`)가 붙을 때까지 먼저 기다린다. 못 받아도 `ms`가 지나면 그냥 그린다(오프라인).
function awardsFontsReady(ms = 3000) {
    if (typeof loadEagleFonts === 'function') loadEagleFonts();
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const link = document.getElementById('g3Fonts');
    const sheet = new Promise(res => {
        if (!link || link.sheet) return res();
        link.addEventListener('load', res); link.addEventListener('error', res);
    });
    const ready = sheet.then(() => Promise.all([
        document.fonts.load('400 1em "Black Han Sans"', '연말시상식 평균타수상 라베상 올해의골퍼 김지명 이관교 신성호 박승수'),
        document.fonts.load('600 1em "Cinzel"', 'JTFAG SEASON AWARDS GRAND PRIZE WINNER 0123456789')
    ])).catch(() => {});
    return Promise.race([ready, new Promise(res => setTimeout(res, ms))]);
}

function openAwardsCeremony(y, replay, force) {
    if ((!force && !awardsOpen(y)) || document.querySelector('.aw-host')) return;
    const slides = awardsSlides(y);
    if (!slides.length) return;
    if (!force) markAwardsSeen(y);
    const o = document.createElement('div');
    o.className = 'reveal-overlay aw-host';
    o.innerHTML = `<div class="aw-stage" id="awStage"></div><button type="button" class="aw-skip" data-skip="1">건너뛰기</button>`;
    document.body.appendChild(o);
    awardsCeremony = { y, i: 0, slides, o, ready: false, pending: false };
    const last = slides.length - 1;
    const confetti = () => {
        if (typeof dropConfetti === 'function' && slides.length > 1) setTimeout(() => dropConfetti(o, 60, ['#e7c46a', '#ffffff', '#9fb9e6', '#fde68a']), 500);
    };
    const show = i => {
        const c = awardsCeremony; if (!c) return;
        c.i = i;
        const st = o.querySelector('#awStage');
        st.innerHTML = `<div class="aw-pane">${slides[i]}</div>`;
        // 부문 장은 두 번 누른다 — 첫 터치에 부문 이름만, 한 번 더 누르면 수상자(대상도 같다).
        c.pending = !!st.querySelector('.aw-pend');
        o.querySelector('.aw-skip').style.display = i === last ? 'none' : '';
        if (i === last && !c.pending) confetti();
    };
    const reveal = () => {
        const c = awardsCeremony; if (!c) return;
        const root = o.querySelector('.aw-pend');
        c.pending = false;
        if (root) root.classList.remove('aw-pend');
        if (c.i === last) confetti();
    };
    const close = (toCase) => {
        o.classList.remove('on');
        awardsCeremony = null;
        setTimeout(() => {
            o.remove();
            if (toCase) { trophyYear = y; setBadgeView('trophy'); if (typeof showPage === 'function') showPage('badges'); }
            if (!replay && typeof afterRevealEffects === 'function') afterRevealEffects();
        }, 300);
    };
    o.onclick = e => {
        const c = awardsCeremony; if (!c) return;
        const t = e.target.closest('button');
        if (t && t.dataset.skip) return close(false);
        if (!c.ready) return;                       // 글꼴을 기다리는 동안은 넘기지 않는다
        if (c.pending) return reveal();             // 발표 전이면 어느 단추를 눌러도 먼저 발표
        if (t && t.dataset.case) return close(true);
        if (t && !t.dataset.next) return;
        if (c.i < last) show(c.i + 1);
    };
    requestAnimationFrame(() => o.classList.add('on'));
    awardsFontsReady().then(() => {
        if (!awardsCeremony || awardsCeremony.o !== o) return;   // 그 사이 건너뛰었다
        awardsCeremony.ready = true;
        show(0);
    });
}

// 접속·갱신마다 부른다 — 이 기기에서 아직 안 본, 마무리된 시즌이 있으면 한 번 띄운다(입장 인사말·결과 발표 뒤).
function checkAwardsCeremony() {
    if (typeof isLoaded !== 'undefined' && !isLoaded) return;
    if (typeof entranceBlocked === 'function' && entranceBlocked()) return;
    if (document.querySelector('.reveal-overlay, .celebrate-overlay, .bdg-unlock')) return;
    const y = awardsUnseenYear();
    if (!y) return;
    openAwardsCeremony(y, false);
}

// ── 관리자 지정 — 시즌 마지막 차수 · 공로상 ─────────────────────
let seasonPick = { last: 0, year: 0, name: '', note: '' };

async function openSeasonFinalPrompt() {
    const y = currentSeason();
    const total = appData.totalRounds || 0;
    const cur = seasonFinalRound(y);
    const opts = ['<option value="0">지정 안 함 (12월 31일까지)</option>']
        .concat(Array.from({ length: total }, (_, i) => total - i).map(n => `<option value="${n}"${n === cur ? ' selected' : ''}>${n}차</option>`)).join('');
    seasonPick.last = cur;
    const ok = await showConfirmPrompt(`<b>${y} 시즌 마지막 차수</b><br>
        <select onchange="seasonPick.last = Number(this.value)" style="margin:10px 0 8px; width:100%; padding:8px; border-radius:8px; border:1px solid #d8dbd2; font-size:0.9rem; font-weight:700; background:#fff;">${opts}</select>
        <span style="font-size:0.78rem;color:#6b7075;font-weight:600">그 차수의 스코어가 등록되고 네 명의 정산 입력이 끝나면 시상식이 자동으로 열리고 새 시즌이 시작됩니다. 공로상은 이 지정 전에 먼저 정해 두세요. 그 뒤 차수는 다음 시즌으로 셉니다. 이미 스코어와 정산 입력이 끝난 차수를 지정하면 곧바로 시상식이 열리고 되돌릴 수 없습니다. 지정하지 않으면 ${y}년 12월 31일이 지나야 열립니다.</span>`, '저장', '#2b5394');
    if (!ok) return;
    const n = seasonPick.last;
    if (n === cur) return;
    if (!appData.seasonFinal || typeof appData.seasonFinal !== 'object') appData.seasonFinal = {};
    appData.seasonFinal[y] = n;   // 해제는 0으로 적는다(합칠 때 되살아나지 않게)
    syncToSupabase(appData);
    renderAll();
    showToast(n ? `🏁 ${y} 시즌 마지막 차수를 ${n}차로 지정했습니다.` : `🏁 ${y} 시즌 마지막 차수 지정을 해제했습니다.`);
}

async function openSeasonMeritPrompt() {
    // 공로상은 어느 시즌 것인지 고른다 — 마지막 차수 정산이 끝나 시즌이 막 넘어간 뒤에도 방금 끝난 시즌 것을 지정해야 하기 때문이다.
    const years = seasonTabs();
    const closed = closedSeasons();
    seasonPick.year = closed.length ? closed[closed.length - 1] : years[years.length - 1];
    const cur = (appData.seasonSpecial && appData.seasonSpecial[seasonPick.year]) || {};
    seasonPick.name = golfers.includes(cur.name) ? cur.name : '';
    seasonPick.note = cur.note || '';
    const yearOpts = years.slice().reverse().map(t => `<option value="${t}"${t === seasonPick.year ? ' selected' : ''}>${t} 시즌</option>`).join('');
    const opts = ['<option value="">지정 안 함</option>'].concat(golfers.map(g => `<option value="${g}"${g === seasonPick.name ? ' selected' : ''}>${escapeHtml(g)}</option>`)).join('');
    const ok = await showConfirmPrompt(`<b>공로상 지정</b><br>
        <select onchange="seasonPick.year = Number(this.value)" aria-label="시즌" style="margin:10px 0 6px; width:100%; padding:8px; border-radius:8px; border:1px solid #d8dbd2; font-size:0.9rem; font-weight:700; background:#fff;">${yearOpts}</select>
        <select onchange="seasonPick.name = this.value" aria-label="수상자" style="margin:0 0 6px; width:100%; padding:8px; border-radius:8px; border:1px solid #d8dbd2; font-size:0.9rem; font-weight:700; background:#fff;">${opts}</select>
        <input type="text" maxlength="30" value="${escapeHtml(seasonPick.note)}" oninput="seasonPick.note = this.value" aria-label="공로 내용" style="margin:0 0 8px; width:100%; box-sizing:border-box; padding:8px; border-radius:8px; border:1px solid #d8dbd2; font-size:0.9rem; font-weight:700; background:#fff;">
        <span style="font-size:0.78rem;color:#6b7075;font-weight:600">모임에 기여한 사람 한 명을 직접 지정합니다. 시즌, 수상자, 공로 내용(예: 총무 수고) 순서로 고릅니다. 시상식과 트로피에 그대로 나옵니다.</span>`, '저장', '#2b5394');
    if (!ok) return;
    const y = seasonPick.year;
    if (!appData.seasonSpecial || typeof appData.seasonSpecial !== 'object') appData.seasonSpecial = {};
    appData.seasonSpecial[y] = seasonPick.name ? { name: seasonPick.name, note: seasonPick.note.trim() } : { name: '', note: '' };
    syncToSupabase(appData);
    renderAll();
    showToast(seasonPick.name ? `🏅 ${y} 공로상을 ${seasonPick.name}님으로 지정했습니다.` : `🏅 ${y} 공로상 지정을 해제했습니다.`);
}

// 관리자 메뉴 → `🎬 시상식 미리보기` — 시즌이 안 끝났어도 지금 기록으로 한 번 훑어본다. 아무것도 저장하지 않는다(기기 기록도 안 건드린다).
function previewAwardsCeremony() {
    closeAdminModal();
    openAwardsCeremony(currentSeason(), true, true);
}

