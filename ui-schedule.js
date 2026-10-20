// ◇ ui.js를 나눈 조각 — 일정 창 · 골프장·코스 고르기 · 차수별 골프장 기억 · 일정 저장
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
function initScheduleOptions() {
    const mSelect = document.getElementById('schMonth'), dSelect = document.getElementById('schDay'), hSelect = document.getElementById('schHour'), minSelect = document.getElementById('schMinute');
    if(mSelect) { mSelect.innerHTML = ""; for(let i=1; i<=12; i++) mSelect.add(new Option(i, i)); }
    if(dSelect) { dSelect.innerHTML = ""; for(let i=1; i<=31; i++) dSelect.add(new Option(i, i)); }
    if(hSelect) { hSelect.innerHTML = ""; for(let i=1; i<=12; i++) hSelect.add(new Option(i, i)); }
    if(minSelect) { minSelect.innerHTML = ""; for(let i=0; i<60; i++) { const minStr = i < 10 ? "0" + i : String(i); minSelect.add(new Option(minStr, minStr)); } }
}

// 우리가 자주 가는 곳. 검색창이 비어 있을 때 이것부터 보여 준다.
// 이름은 전국 목록(courses.js)에 있는 것과 똑같이 맞춰 놓았다 — 그래야 좌표가 바로 붙어
// 날씨가 뜬다. 여기 없는 곳은 검색해서 고르거나 그냥 쳐 넣으면 되고,
// 쳐 넣은 곳은 payload.customCourses에 남아 다음부터 위에 뜬다.
const BASE_COURSES = ["함평엘리체CC", "어등산CC", "해피니스CC", "골드레이크CC", "무등산CC",
    "빛고을CC", "푸른솔GC 장성", "나주힐스컨트리클럽", "화순CC", "보성CC", "순천CC",
    "아크로 컨트리클럽", "다산베아채CC", "JNJ골프리조트", "파인비치골프링크스",
    "사우스링스 영암", "광주CC"];

const COURSE_RESULT_LIMIT = 40;

// 직접 친 골프장을 목록에 남긴다. 이미 있으면 맨 뒤로 올려 다음에 위에 뜨게 한다.
function rememberCourse(name) {
    const clean = String(name || '').trim();
    if (!clean || BASE_COURSES.includes(clean)) return;
    if (!appData.customCourses) appData.customCourses = [];
    const at = appData.customCourses.indexOf(clean);
    if (at !== -1) appData.customCourses.splice(at, 1);
    appData.customCourses.push(clean);
    while (appData.customCourses.length > MAX_CUSTOM_COURSES) appData.customCourses.shift();
}

// 검색어에 맞는 골프장을 고른다. 앞부터 맞는 것을 먼저 올린다.
// 띄어쓰기를 지우고 비교하므로 '사우스링스영암'으로도 '사우스링스 영암'이 걸린다.
function searchCourses(query) {
    const q = String(query || '').replace(/\s+/g, '').toLowerCase();
    const recent = (appData.customCourses || []).slice().reverse();
    const mine = [...recent, ...BASE_COURSES.filter(c => !recent.includes(c))];

    if (!q) return { group: '자주 이용하는 골프장', list: mine.slice(0, COURSE_RESULT_LIMIT) };

    const names = [...mine, ...allCourses().map(c => c.name)];
    const seen = new Set();
    const head = [], tail = [];
    names.forEach(name => {
        const key = name.replace(/\s+/g, '').toLowerCase();
        if (seen.has(key)) return;
        const at = key.indexOf(q);
        if (at === 0) { seen.add(key); head.push(name); }
        else if (at > 0) { seen.add(key); tail.push(name); }
    });
    return { group: '검색 결과', list: [...head, ...tail].slice(0, COURSE_RESULT_LIMIT) };
}

// browse가 참이면 검색창에 뭐가 적혀 있든 '자주 가는 곳'을 펼친다.
// 모달을 열면 지난번 골프장이 적혀 있는데, 그대로 걸러 버리면 그 한 줄만 남아
// 다른 곳을 고를 수가 없기 때문이다.
function renderCourseResults(browse) {
    const box = document.getElementById('courseResults');
    if (!box) return;
    const typed = browse ? '' : document.getElementById('schCourseSearch').value;
    const { group, list } = searchCourses(typed);

    let html = `<div class="course-group">${group}</div>`;
    if (!list.length) {
        html += `<div class="course-empty">검색 결과가 없으면 골프장명을 직접 입력하세요.</div>`;
    } else {
        html += list.map(name => {
            const geo = courseGeo(name);
            return `<button type="button" class="course-item" onclick="pickCourse(${JSON.stringify(name).replace(/"/g, '&quot;')})">` +
                `<span>${escapeHtml(name)}</span>` +
                `<span class="course-mark">${geo ? '🌤️' : ''}</span></button>`;
        }).join('');
    }
    box.innerHTML = html;
}

function pickCourse(name) {
    const search = document.getElementById('schCourseSearch');
    // 골프장을 바꿨으면 골라 둔 코스를 비운다 — 다른 골프장의 코스가 남아 있으면
    // 목록에도 없는 이름이 그대로 저장된다(어등산인데 마제스티가 붙는 식).
    if (search.value.trim() !== name) {
        const sub = document.getElementById('schSubCourse');
        if (sub) sub.value = '';
    }
    search.value = name;
    renderSubCourseChips();
    renderCourseResults();
    document.getElementById('courseResults').scrollTop = 0;
}

// 차수별 골프장 기억(payload.roundCourses). 키는 차수 번호(1부터), 값은 골프장 이름.
// 표의 `courses[]`와 따로 두는 이유: 차수를 지웠다 다시 만들어도 이름이 돌아와야 한다.
function roundCourseMap() {
    if (!appData.roundCourses || typeof appData.roundCourses !== 'object') appData.roundCourses = {};
    return appData.roundCourses;
}

/* ── 골프장 안의 9홀 코스 ─────────────────────────────────────────
   한 클럽에 코스가 여럿이다(함평엘리체 = 임페리얼 · 마제스티 · 펠리스).
   한 라운드는 그중 둘을 도는데, 그 조합이 `마제스티-펠리스`다.

   **코스는 `courses[]`에 넣지 않고 따로 기억한다.** 합쳐 넣으면
   `함평엘리체 (마제스티-펠리스)`가 통째로 골프장 이름이 되어,
   날씨 좌표를 못 찾고 골프장별 1:1 승률에서도 같은 클럽이 갈라진다.
   `courses[]`는 클럽 이름만, 코스는 여기에. 키는 차수 번호(1부터)로 `roundCourses`와 같다. */
function subCourseMap() {
    if (!appData.roundSubCourses || typeof appData.roundSubCourses !== 'object') appData.roundSubCourses = {};
    return appData.roundSubCourses;
}

/* 지난 차수의 코스는 **아무도 입력하지 않아도 이미 있다.**
   스코어카드 판독이 카드에 인쇄된 코스 이름을 `ROUND_HOLES[n].course`에 적어 왔다
   (`함평엘리체 (마제스티-펠리스)` · `어등-송정`). 앱이 그걸 안 읽고 있었을 뿐이다.
   그래서 골프장별 코스 정보를 어디서 받아 올 필요가 없다 — 사진이 원본이다.

   괄호가 있으면 그 안이 코스다. 없으면 `어등-송정`처럼 코스만 적힌 경우라
   **하이픈으로 이어진 것만** 코스로 본다(골프장 이름 하나만 적힌 걸 코스로 오해하지 않게). */
/* 스코어카드에 인쇄된 코스 글을 `{club, sub}`로 가른다. 표기가 제각각이라 셋을 받는다 —
   `함평엘리체 (마제스티-펠리스)`(괄호) · `JNJ 진-정` · `무등산 인왕봉-천왕봉`(클럽 이름 뒤 띄어쓰기) · `어등-송정`(코스만).
   **하이픈이 든 마지막 마디만 코스로 본다**(골프장 이름 하나만 적힌 걸 코스로 오해하지 않게).
   예전엔 `JNJ 진-정` 통째가 코스가 되어 칩에 `JNJ 진`·`정`이 뜨고 클럽 이름이 코스에 섞였다. */
function parseStatsCourse(text) {
    const t = String(text || '').trim();
    if (!t) return { club: '', sub: '' };
    const paren = t.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (paren) return { club: paren[1].trim(), sub: paren[2].trim() };
    const sp = t.lastIndexOf(' ');
    if (sp > 0 && t.slice(sp + 1).includes('-')) return { club: t.slice(0, sp).trim(), sub: t.slice(sp + 1).trim() };
    return t.includes('-') ? { club: '', sub: t } : { club: '', sub: '' };
}

function subCourseFromStats(roundIdx) {
    if (typeof ROUND_HOLES === 'undefined') return '';
    const rec = ROUND_HOLES[String(roundIdx + 1)];
    return parseStatsCourse(rec && rec.course).sub;
}

/* 사람이 일정에서 정한 값이 먼저다. 없으면 스코어카드에서 읽은 값을 쓴다.
   **읽은 값을 payload에 옮겨 적지 말 것** — stats.js가 이미 원본이라 두 곳이 되면
   어긋나고, 저장이 나가면 실시간 이벤트가 되돌아와 렌더가 또 돈다. 읽기만 한다. */
function subCourseOf(roundIdx) {          // roundIdx는 0부터
    const set = String(subCourseMap()[roundIdx + 1] || '').trim();
    return set || subCourseFromStats(roundIdx);
}

/* 표 머리의 코스 줄을 그 차수 값에 맞춘다. 코스가 없으면 줄을 아예 지운다.
   **renderTable()의 빠른 길(값만 갈아 끼우는 분기)에서도 반드시 부를 것** —
   빠뜨리면 일정에서 코스를 고쳐도 표는 새로고침 전까지 옛 코스를 붙들고 있다
   (정산 칸 잠금이 data-lock 없이 그랬던 것과 같은 자리다).
   사용자가 친 글이라 textContent로 넣는다. */
function paintSubCourse(r) {
    const input = document.getElementById(`course_input_${r}`);
    if (!input || !input.parentElement) return;
    const slot = input.parentElement;
    const name = subCourseOf(r);
    let line = slot.querySelector('.course-sub');
    if (!name) { if (line) line.remove(); return; }
    if (!line) { line = document.createElement('div'); line.className = 'course-sub'; slot.appendChild(line); }
    if (line.textContent !== name) line.textContent = name;
}

/* 그 클럽에서 전에 쓴 코스 이름들. `마제스티-펠리스`처럼 붙여 적은 것도 쪼개서 센다 —
   기록에서 뽑으므로 표에 없는 골프장이라도 한 번 쳐 넣으면 다음부터 목록에 오른다. */
function pastSubCourses(club) {
    const key = typeof clubKey === 'function' ? clubKey(club) : String(club || '').replace(/\s+/g, '');
    if (!key) return [];
    const clubs = roundCourseMap(), seen = new Set();
    const keyOf = v => typeof clubKey === 'function' ? clubKey(v) : String(v || '').replace(/\s+/g, '');
    // 차수를 하나씩 훑는다 — 일정에서 정한 것과 스코어카드에서 읽은 것을 같이 본다.
    // subCourseOf()가 그 우선순위를 이미 알고 있으므로 여기서 다시 가리지 않는다.
    // **골프장 이름은 clubKey로 견준다** — `무등산CC`(일정)와 `무등산`(스코어카드)이 같은 곳이다.
    for (let r = 0; r < (appData.totalRounds || 0); r++) {
        const c = keyOf(clubs[r + 1] || (appData.courses && appData.courses[r]));
        if (c !== key) continue;
        splitSubCourse(subCourseOf(r)).forEach(v => seen.add(v));
    }
    // 스코어카드에 클럽 이름이 함께 인쇄된 기록(`JNJ 진-정`)은 차수의 골프장 칸과 상관없이 그 클럽의 코스로 모은다 —
    // 코스 표에 없는 골프장도 스코어를 등록하는 순간 저절로 코스가 등록된다(사용자 요청).
    if (typeof ROUND_HOLES !== 'undefined') Object.keys(ROUND_HOLES).forEach(n => {
        const parsed = parseStatsCourse(ROUND_HOLES[n] && ROUND_HOLES[n].course);
        if (parsed.club && keyOf(parsed.club) === key) splitSubCourse(parsed.sub).forEach(v => seen.add(v));
    });
    return [...seen];
}

// `마제스티-펠리스` → ["마제스티", "펠리스"]. 전·후반 두 코스를 하이픈으로 잇는다.
function splitSubCourse(text) {
    return String(text || '').split('-').map(s => s.trim()).filter(Boolean);
}

/* 그 골프장에서 고를 수 있는 9홀 코스. 손으로 적어 둔 표(`CLUB_COURSES`)가 먼저 오고,
   거기 없는데 전에 쳐 넣은 이름이 있으면 뒤에 붙는다. 둘 다 없으면 빈 목록이다 —
   그때는 칩 줄이 통째로 숨고 직접 쳐 넣게 된다. */
function subCourseChoices(club) {
    const known = clubCourses(club);
    const past = pastSubCourses(club).filter(v => !known.includes(v));
    return [...known, ...past];
}

/* 코스는 눌러서 고른다. 한 라운드는 두 코스를 도니까 **누를 때마다 켜지고 꺼진다** —
   `마제스티` 누르고 `펠리스` 누르면 `마제스티-펠리스`가 된다. 다시 누르면 빠진다.
   고른 차례가 곧 전·후반 순서라 정렬하지 않는다. */
function renderSubCourseChips() {
    const box = document.getElementById('subCourseChips');
    const search = document.getElementById('schCourseSearch');
    const input = document.getElementById('schSubCourse');
    if (!box || !search || !input) return;

    const list = subCourseChoices(search.value.trim());
    const picked = splitSubCourse(input.value);
    box.innerHTML = '';
    // 코스 이름은 사용자가 친 글일 수 있다. onclick 문자열에 끼워 넣지 말 것 —
    // escapeHtml이 만든 &#39;는 속성값에서 다시 '로 풀려 그 자리에서 코드가 깨진다.
    // 요소를 만들어 리스너를 직접 걸면 따옴표가 들어 있어도 그대로 넘어간다.
    list.forEach(v => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const at = picked.indexOf(v);
        btn.className = 'sub-course-chip' + (at !== -1 ? ' on' : '');
        btn.textContent = v;
        // 몇 번째로 고른 코스인지 보여 준다 — 전반·후반이 뒤바뀌면 눈에 띄어야 한다.
        if (at !== -1) {
            const no = document.createElement('span');
            no.className = 'chip-no';
            no.textContent = at + 1;
            btn.appendChild(no);
        }
        btn.addEventListener('click', () => toggleSubCourse(v));
        box.appendChild(btn);
    });
    box.style.display = list.length ? '' : 'none';

    const hint = document.getElementById('subCourseHint');
    if (hint) hint.style.display = list.length ? 'none' : '';
}

function toggleSubCourse(name) {
    const input = document.getElementById('schSubCourse');
    if (!input) return;
    const picked = splitSubCourse(input.value);
    const at = picked.indexOf(name);
    if (at !== -1) picked.splice(at, 1); else picked.push(name);
    input.value = picked.join('-');
    renderSubCourseChips();
}

// 기억해 둔 이름을 표의 빈 골프장 칸에 채운다. 이미 적혀 있으면 건드리지 않는다.
// 접속할 때와 차수를 추가한 뒤에 부른다.
function applyRoundCourses() {
    const map = roundCourseMap();
    if (!appData.courses) appData.courses = [];
    let changed = false;
    for (let r = 0; r < appData.totalRounds; r++) {
        const remembered = map[r + 1];
        if (remembered && !String(appData.courses[r] || '').trim()) {
            appData.courses[r] = remembered;
            changed = true;
        }
    }
    return changed;
}

// 일정 모달의 차수 목록. 아직 없는 '다음 차수'까지 하나 더 보여 준다 —
// 5차까지 쳤으면 6차 일정을 미리 잡을 수 있어야 한다.
function renderScheduleRoundOptions(select, pick) {
    const map = roundCourseMap();
    select.innerHTML = "";
    for (let n = 1; n <= appData.totalRounds + 1; n++) {
        const isNew = n > appData.totalRounds;
        const course = map[n] || (appData.courses && appData.courses[n - 1]) || "";
        select.add(new Option(`${n}차${isNew ? ' (예정)' : ''}${course ? ` · ${course}` : ''}`, n));
    }
    select.value = String(pick);
}

// 표의 골프장 칸을 눌렀을 때. 그 차수를 미리 골라 둔 채로 일정 창을 연다.
function openScheduleForRound(r) {
    openScheduleModal(r + 1);
}

function openScheduleModal(pickRound) {
    document.getElementById('scheduleModal').classList.add('active');

    // 표에서 눌러 들어왔으면 그 차수, 아니면 지난번에 잡아 둔 차수,
    // 그것도 없으면 아직 안 친 다음 차수를 미리 고른다.
    const saved = parseInt(pickRound || appData.nextRoundNo, 10);
    const pick = (saved >= 1 && saved <= appData.totalRounds + 1) ? saved : appData.totalRounds + 1;
    renderScheduleRoundOptions(document.getElementById('schRound'), pick);
    // 그 차수에 잡아 둔 일정이 있으면 날짜·시각을 그대로 물려 온다(사용자 요청). 없으면 오늘 날짜.
    fillScheduleWhen(pick);

    // 고른 차수에 이미 정해진 곳이 있으면 그걸, 없으면 지난번에 고른 곳을 넣어 둔다.
    // (표에서 골프장 칸을 눌러 들어온 경우 그 차수의 이름이 그대로 떠야 한다.)
    const search = document.getElementById('schCourseSearch');
    search.value = roundCourseMap()[pick] || (appData.courses && appData.courses[pick - 1]) || lastScheduledCourse();

    // 그 차수의 코스도 같이 채운다 — 일정에서 정한 게 없으면 스코어카드에서 읽은 값이 온다.
    // 없으면 빈 칸으로 둔다. 지난 차수의 코스가 남아 있으면 다른 골프장인데 엉뚱한 게 딸려 들어간다.
    document.getElementById('schSubCourse').value = subCourseOf(pick - 1);
    renderSubCourseChips();

    const statusText = document.getElementById('courseLoadStatus');
    if (statusText) statusText.textContent = `전국 ${allCourses().length}곳에서 검색`;
    renderCourseResults(true);
}

/* 일정 창의 날짜·시각 칸 채우기. 고른 차수가 일정이 잡힌 차수(`nextRoundNo`)이고 문구
   (`10월 14일 오후 5:34 …` — saveSchedule()이 쓰는 모양)를 읽을 수 있으면 그 값으로, 아니면 오늘 날짜로.
   월·일은 연도가 있는 `nextRoundISO`를 먼저 본다. 시각을 못 읽으면 시각 칸은 건드리지 않는다. */
function scheduledWhen() {
    const m = String(appData.nextRoundDate || '').match(/(\d{1,2})월\s*(\d{1,2})일\s+(오전|오후)\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const iso = String(appData.nextRoundISO || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
    return { month: iso ? +iso[1] : +m[1], day: iso ? +iso[2] : +m[2], ampm: m[3], hour: +m[4], minute: m[5] };
}
function fillScheduleWhen(round) {
    const w = parseInt(appData.nextRoundNo, 10) === round ? scheduledWhen() : null;
    const now = new Date();
    document.getElementById('schMonth').value = w ? w.month : now.getMonth() + 1;
    document.getElementById('schDay').value = w ? w.day : now.getDate();
    if (!w) return;
    document.getElementById('schAmpm').value = w.ampm;
    document.getElementById('schHour').value = w.hour;
    document.getElementById('schMinute').value = w.minute;
}

/* 창을 열어 둔 채로 차수를 바꾸면 그 차수에 정해 둔 골프장·코스로 갈아 끼운다.
   **이미 정해진 게 있을 때만** 바꾼다 — 아직 아무것도 없는 차수로 옮겼는데
   치던 이름을 지워 버리면, 새 차수를 잡으려던 사람이 처음부터 다시 쳐야 한다. */
function onScheduleRoundChange() {
    const no = parseInt(document.getElementById('schRound').value, 10);
    if (!no) return;
    const club = roundCourseMap()[no] || (appData.courses && appData.courses[no - 1]) || '';
    const sub = subCourseOf(no - 1);
    if (parseInt(appData.nextRoundNo, 10) === no) fillScheduleWhen(no);
    if (club) {
        document.getElementById('schCourseSearch').value = club;
        document.getElementById('schSubCourse').value = sub;
        renderCourseResults(true);
    }
    renderSubCourseChips();
}

// 저장돼 있는 일정 문구("8월 20일 오전 7:30 무등산CC")의 끝에 골프장 이름이 붙어 있다.
// 9홀 코스를 정했으면 뒤에 괄호로 딸려 있다 — 그건 떼고 클럽 이름만 돌려준다.
// 안 떼면 다음 차수 일정을 열 때 검색칸에 "함평엘리체 (마제스티-펠리스)"가 들어앉아
// 그대로 저장되면 그게 통째로 골프장 이름이 된다.
function lastScheduledCourse() {
    const text = String(appData.nextRoundDate || '');
    const m = text.match(/\d{1,2}:\d{2}\s+(.+)$/);
    return m ? m[1].replace(/\s*\([^()]*\)\s*$/, '').trim() : '';
}

function closeScheduleModal() { document.getElementById('scheduleModal').classList.remove('active'); }

// 화면 문구에는 연도가 없다. 월/일만으로 실제 라운드 날짜(YYYY-MM-DD)를 정한다.
// 이미 한 달 넘게 지난 날짜를 고르면 내년으로 본다 — 12월에 1월 일정을 잡는 경우.
function resolveRoundDate(month, day) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    let year = now.getFullYear();
    const candidate = new Date(year, month - 1, day);
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    if (candidate < monthAgo) year += 1;
    return `${year}-${pad(month)}-${pad(day)}`;
}

function saveSchedule() {
    const search = document.getElementById('schCourseSearch');
    const course = search.value.trim();
    if (!course) { showToast("⚠️ 골프장을 선택하거나 직접 입력해 주세요."); search.focus(); return; }
    saveState();
    // 목록에 없어 직접 친 곳은 남겨 둔다. 다음부터는 검색창을 열면 맨 위에 뜬다.
    if (!courseGeo(course)) rememberCourse(course);
    const m = parseInt(document.getElementById('schMonth').value, 10);
    const d = parseInt(document.getElementById('schDay').value, 10);
    const ampm = document.getElementById('schAmpm').value;
    const hh = document.getElementById('schHour').value;
    const mm = document.getElementById('schMinute').value;
    // 코스는 클럽 이름 뒤에 괄호로 붙인다. courseFromText()가 문구 안에서
    // 클럽 이름을 찾아내므로 이렇게 적어도 날씨는 그대로 뜬다.
    const sub = (document.getElementById('schSubCourse').value || '').trim();
    appData.nextRoundDate = `${m}월 ${d}일 ${ampm} ${hh}:${mm} ${course}${sub ? ` (${sub})` : ''}`;
    // 표시용 문구에는 연도가 없어 알림이 연도를 알 수 없다. 별도로 남긴다.
    appData.nextRoundISO = resolveRoundDate(m, d);

    // 고른 차수에 골프장을 붙여 둔다 — 표의 골프장 칸을 따로 칠 필요가 없어진다.
    // 차수를 지웠다 다시 만들어도 roundCourses에 남아 있어 이름이 돌아온다.
    const roundNo = parseInt(document.getElementById('schRound').value, 10) || (appData.totalRounds + 1);
    appData.nextRoundNo = roundNo;
    delete appData.nextRoundSrc;   // 직접 저장했으니 여행에서 자동으로 올린 일정이 아니다
    if (!appData.roundDates) appData.roundDates = {};
    appData.roundDates[roundNo] = appData.nextRoundISO;
    roundCourseMap()[roundNo] = course;
    // 코스는 따로 둔다. courses[]에 합치면 골프장 이름이 되어 날씨와 승률 묶음이 깨진다.
    if (sub) subCourseMap()[roundNo] = sub; else delete subCourseMap()[roundNo];
    if (roundNo <= appData.totalRounds) {
        if (!appData.courses) appData.courses = [];
        appData.courses[roundNo - 1] = course;
    }
    // 새 일정이 '아직 없는 다음 차수'면 그 차수를 미리 만든다 — 경기 전에 시작 금액을 적을 수 있게.
    delete appData.autoRoundOff;
    const created = typeof ensureScheduledRound === 'function' && ensureScheduledRound(true);

    syncToSupabase(appData); renderNoticeArea(); renderAll(); closeScheduleModal();
    showToast(created
        ? `✅ ${roundNo}차 일정을 저장했습니다.\n${roundNo}차 정산을 미리 생성했습니다.`
        : roundNo <= appData.totalRounds
            ? `✅ ${roundNo}차 일정을 저장했습니다. 스코어표 골프장도 반영했습니다.`
            : `✅ ${roundNo}차 일정을 저장했습니다. 차수 생성 시 골프장이 자동 반영됩니다.`);
}

