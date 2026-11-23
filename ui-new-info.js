// 상단 탭의 새 정보 표시. 서버의 기록은 모두에게 같지만 읽은 위치는 기기·회원마다 다르다.
// 처음 방문한 기기에서는 기존 기록을 기준으로만 남겨 과거 기록에 NEW를 붙이지 않는다.
const NEW_INFO_KEY = 'jtfag_tab_info_v1_';
const newInfoUnread = { trip: false, passport: false, badges: false, trophy: false };

function newInfoStable(value) {
    if (Array.isArray(value)) return value.map(newInfoStable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map(key => [key, newInfoStable(value[key])]));
    }
    return value;
}

function newInfoSnapshots(me) {
    const trip = allTrips().slice().sort((a, b) => a.id.localeCompare(b.id));
    const badgeKeys = badgeKeysOf(collectBadges(me)).map(item => item.key).sort();
    const trophy = closedSeasons().filter(awardsOpen).map(year => {
        const result = computeAwards(year);
        return [year, result.grand.holders.slice().sort(), result.awards.map(award => [award.id, award.holders.slice().sort()])];
    });
    const passport = passportData().groups.map(group => [group.key,
        group.visits.map(visit => [visit.round, visit.date, visit.id, visit.tripId])]).sort((a, b) => a[0].localeCompare(b[0]));
    return {
        trip: JSON.stringify(newInfoStable(trip)),
        passport: JSON.stringify(passport),
        badges: JSON.stringify(badgeKeys),
        trophy: JSON.stringify(trophy)
    };
}

function newInfoViewing(kind, me) {
    const page = document.getElementById('appContainer')?.dataset.page;
    if (kind === 'trip') return page === 'trip' && tripSection === 'schedule';
    if (kind === 'passport') return page === 'trip' && tripSection === 'passport';
    if (kind === 'badges') return page === 'badges' && badgeView === 'badges' && (!badgeViewName || badgeViewName === me);
    return page === 'badges' && badgeView === 'trophy';
}

function paintNewInfoIndicators() {
    for (const [tab, newItems] of [
        ['badges', ['badges', 'trophy']],
        ['trip', ['trip', 'passport']]
    ]) {
        const button = document.querySelector(`.page-tab[data-tab="${tab}"]`);
        if (!button) continue;
        const active = newItems.filter(kind => newInfoUnread[kind]);
        button.classList.toggle('has-new', active.length > 0);
        button.setAttribute('aria-label', active.length ? `${tab === 'badges' ? '뱃지' : '여행'} · 새 정보 있음` : (tab === 'badges' ? '뱃지' : '여행'));
    }
    for (const [selector, kind] of [
        ['#badgePage .tc-seg button:first-child', 'badges'],
        ['#badgePage .tc-seg button:last-child', 'trophy'],
        ['#tripSectionNav button:first-child', 'trip'],
        ['#tripSectionNav button:last-child', 'passport']
    ]) {
        const button = document.querySelector(selector);
        if (!button) continue;
        button.classList.toggle('has-new', newInfoUnread[kind]);
        const label = { badges: '뱃지', trophy: '트로피', trip: '여행 일정', passport: '스탬프' }[kind];
        button.setAttribute('aria-label', label + (newInfoUnread[kind] ? ' · 새 정보 있음' : ''));
    }
}

function updateNewInfoIndicators() {
    if (!isLoaded) return;
    const me = localStorage.getItem('jtfag_my_name');
    if (!me || !golfers.includes(me)) {
        Object.keys(newInfoUnread).forEach(kind => { newInfoUnread[kind] = false; });
        paintNewInfoIndicators();
        return;
    }
    const snapshots = newInfoSnapshots(me);
    for (const [kind, snapshot] of Object.entries(snapshots)) {
        const key = NEW_INFO_KEY + me + '_' + kind;
        try {
            const old = localStorage.getItem(key);
            const viewed = newInfoViewing(kind, me);
            newInfoUnread[kind] = old !== null && old !== snapshot && !viewed;
            if (old === null || viewed) localStorage.setItem(key, snapshot);
        } catch (err) { newInfoUnread[kind] = false; }
    }
    paintNewInfoIndicators();
}
