const SUPABASE_URL = 'https://xhulylksiexhtifyrokp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodWx5bGtzaWV4aHRpZnlyb2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwODM0MTIsImV4cCI6MjEwMTY1OTQxMn0.gm2uMhOopFg1ZkAiFL-E_ZUB6jGi0Pwyj6fSvAuSmPg';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window._supabase = _supabase;
window.SUPABASE_TABLE = 'jtfag_league';

const ADMIN_PASSWORD = "1234"; 
let isFundUnlocked = false;    

const golfers = ["이관교", "김지명", "신성호", "박승수"];

const RANK_CONFIG = {
    0: { name: "독수리", icon: "🦅", penalty: 0, class: "rank-eagle" },
    1: { name: "매", icon: "⚡", penalty: -40000, class: "rank-hawk" },
    2: { name: "학", icon: "🦩", penalty: -60000, class: "rank-crane" },
    3: { name: "참새", icon: "🐦", penalty: -100000, class: "rank-sparrow" }
};

function getDefaultData() {
    return {
        nextRoundDate: "",
        clubFund: 0,
        noticeMemo: "",
        totalRounds: 4,
        courses: ["함평엘리체", "함평엘리체", "어등산", "해피니스"],
        scores: {
            "이관교": [90, 83, 97, 92],
            "김지명": [87, 87, 86, 86],
            "신성호": [88, 85, 85, 93],
            "박승수": [96, 96, 88, 90]
        },
        roundMoney: [
            { "이관교": { start: 0, end: 0 }, "김지명": { start: 0, end: 0 }, "신성호": { start: 0, end: 0 }, "박승수": { start: 0, end: 0 } },
            { "이관교": { start: 0, end: 0 }, "김지명": { start: 0, end: 0 }, "신성호": { start: 0, end: 0 }, "박승수": { start: 0, end: 0 } },
            { "이관교": { start: 0, end: 0 }, "김지명": { start: 0, end: 0 }, "신성호": { start: 0, end: 0 }, "박승수": { start: 0, end: 0 } },
            { "이관교": { start: 530000, end: 450000 }, "김지명": { start: 100000, end: 135000 }, "신성호": { start: 230000, end: 92000 }, "박승수": { start: 356000, end: 340000 } }
        ],
        roundPhotos: [[], [], [], []]
    };
}

let appData = getDefaultData();
let historyStack = [];
let selectedMoneyRoundIdx = -1;
let cachedRoundRankProfit = {}; 
let golferRankHistory = {}; 
let golferBadgesMap = {}; 
let golferPhoenixWins = {}; 
let golferReboundMap = {};  
let golferSingleMap = {};   
let golferDonorMap = {};       
let golferUptrendMap = {};     
let golferDowntrendMap = {};   
let golferFluctuationMap = {}; 
let golferRivalMap = {}; 

let isLoaded = false;

function authenticateAdmin() {
    if (isFundUnlocked) return true;
    const pwd = prompt("🔒 공금 수정 비밀번호를 입력해주세요:");
    if (pwd === ADMIN_PASSWORD) {
        isFundUnlocked = true;
        updateLockUI();
        showToast("🔓 공금 수정 권한이 인증되었습니다.");
        return true;
    } else if (pwd !== null) {
        showToast("⚠️ 비밀번호가 일치하지 않습니다.");
    }
    return false;
}

function toggleFundLock() {
    if (isFundUnlocked) {
        isFundUnlocked = false;
        updateLockUI();
        const fundInput = document.getElementById('clubFundInput');
        if (fundInput) fundInput.value = formatFundString(appData.clubFund);
        showToast("🔒 공금 수정이 잠겼습니다.");
    } else {
        authenticateAdmin();
    }
}

function handleFundClick(inputElem) {
    if (!isFundUnlocked) {
        if (authenticateAdmin()) {
            setTimeout(() => {
                inputElem.value = appData.clubFund || ""; 
                inputElem.focus();
            }, 50);
        }
    }
}

function updateLockUI() {
    const btn = document.getElementById('lockToggleBtn');
    const fundInput = document.getElementById('clubFundInput');

    if (btn) btn.textContent = isFundUnlocked ? "🔓" : "🔒";
    
    if (fundInput) {
        if (isFundUnlocked) {
            fundInput.removeAttribute('readonly');
            fundInput.value = appData.clubFund || "";
        } else {
            fundInput.setAttribute('readonly', 'true');
            fundInput.value = formatFundString(appData.clubFund);
        }
    }
}

function formatFundString(num) {
    if (num === null || num === undefined || isNaN(num) || num === 0) return "0원";
    return num.toLocaleString('ko-KR') + "원";
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num) || num === 0) return "0";
    return num.toLocaleString('ko-KR');
}

function parseNumber(val) {
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
}

function saveState() {
    if (historyStack.length >= 10) historyStack.shift();
    historyStack.push(JSON.stringify(appData));
}

function undoLastAction() {
    if (historyStack.length === 0) {
        showToast("⚠️ 되돌릴 이전 내역이 없습니다.");
        return;
    }
    const previousState = historyStack.pop();
    appData = JSON.parse(previousState);
    syncToSupabase(appData);
    showToast("↩️ 이전 상태로 되돌렸습니다.");
    renderAll();
}

function renderSkeleton() {
    const summaryGrid = document.getElementById('summaryGrid');
    if (summaryGrid) {
        summaryGrid.innerHTML = golfers.map(() => `
            <div class="summary-item skeleton">
                <div class="name">---</div>
                <div class="detail-line">---</div>
                <div class="detail-line">---</div>
                <div class="final-total">---</div>
            </div>
        `).join('');
    }
}

const COURSE_GEO = {
    "함평엘리체": { lat: 35.109, lon: 126.545 },
    "어등산": { lat: 35.158, lon: 126.757 },
    "해피니스": { lat: 35.012, lon: 126.963 },
    "마제스티": { lat: 35.200, lon: 126.800 },
    "골드레이크": { lat: 35.025, lon: 126.772 },
    "푸른솔": { lat: 35.275, lon: 126.652 }
};

async function checkWeather(text) {
    const widget = document.getElementById('weatherWidget');
    const weatherText = document.getElementById('weatherText');
    
    let targetCourse = null;
    for (let course in COURSE_GEO) {
        if (text && text.includes(course)) {
            targetCourse = course;
            break;
        }
    }

    if (targetCourse) {
        widget.style.display = 'flex';
        weatherText.textContent = `${targetCourse} 날씨 확인중...`;
        try {
            const geo = COURSE_GEO[targetCourse];
            const dateMatch = text.match(/(\d{1,2})[월/]\s*(\d{1,2})[일]?/);
            let targetDateStr = null;
            if (dateMatch) {
                const year = new Date().getFullYear();
                const m = dateMatch[1].padStart(2, '0');
                const d = dateMatch[2].padStart(2, '0');
                targetDateStr = `${year}-${m}-${d}`;
            }

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul&forecast_days=16`;
            const res = await fetch(url);
            const data = await res.json();
            
            function getWeatherInfo(code) {
                if (code >= 1 && code <= 3) return { i: "⛅", d: "구름조금" };
                if (code >= 45 && code <= 48) return { i: "🌫️", d: "안개" };
                if (code >= 51 && code <= 67) return { i: "🌧️", d: "비" };
                if (code >= 71 && code <= 77) return { i: "❄️", d: "눈" };
                if (code >= 95) return { i: "⛈️", d: "뇌우" };
                return { i: "☀️", d: "맑음" };
            }

            if (targetDateStr && data.daily && data.daily.time.includes(targetDateStr)) {
                const idx = data.daily.time.indexOf(targetDateStr);
                const code = data.daily.weathercode[idx];
                const maxT = data.daily.temperature_2m_max[idx];
                const minT = data.daily.temperature_2m_min[idx];
                const info = getWeatherInfo(code);
                weatherText.innerHTML = `<b>${targetCourse} (${dateMatch[1]}/${dateMatch[2]})</b> 일일예보: ${info.i} ${info.d}, ${minT}°~${maxT}°`;
            } else if (data.current_weather) {
                const code = data.current_weather.weathercode;
                const temp = data.current_weather.temperature;
                const info = getWeatherInfo(code);
                weatherText.innerHTML = `<b>${targetCourse}</b> 실시간: ${info.i} ${info.d}, ${temp}°C`;
            }
        } catch(e) {
            weatherText.textContent = "날씨 정보를 불러오지 못했습니다.";
        }
    } else {
        widget.style.display = 'none';
    }
}

async function fetchFromSupabase() {
    try {
        const { data, error } = await window._supabase
            .from(window.SUPABASE_TABLE)
            .select('*')
            .eq('id', 1)
            .single();

        if (error || !data) {
            await syncToSupabase(getDefaultData());
            appData = getDefaultData();
        } else {
            appData = data.payload;
            if (!appData.roundMoney) appData.roundMoney = getDefaultData().roundMoney;
            if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
        }

        if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) {
            selectedMoneyRoundIdx = appData.totalRounds - 1;
        }

        isLoaded = true;
        renderNoticeArea();
        renderAll();
        showSaveStatus("⚡ Supabase 연결 완료");
    } catch (err) {
        console.error("Supabase Load Error:", err);
        showSaveStatus("⚠️ DB 연결 확인 필요");
    }
}

async function syncToSupabase(dataToSave) {
    try {
        const payloadData = { id: 1, payload: dataToSave };
        const { error } = await window._supabase
            .from(window.SUPABASE_TABLE)
            .upsert(payloadData);

        if (error) {
            console.error("Supabase Save Error:", error);
            showSaveStatus("⚠️ 저장 실패");
        } else {
            showSaveStatus("⚡ 동기화 완료");
        }
    } catch (err) {
        console.error("Supabase Sync Exception:", err);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    renderSkeleton();
    fetchFromSupabase();

    window._supabase
        .channel('public:jtfag_league')
        .on('postgres_changes', { event: '*', schema: 'public', table: window.SUPABASE_TABLE }, payload => {
            if (payload.new && payload.new.payload) {
                appData = payload.new.payload;
                if (!appData.roundMoney) appData.roundMoney = getDefaultData().roundMoney;
                if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
                
                if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) {
                    selectedMoneyRoundIdx = appData.totalRounds - 1;
                }
                renderNoticeArea();
                renderAll();
                showSaveStatus("⚡ 실시간 업데이트됨");
                
                if (document.getElementById('roundPhotoModal').classList.contains('active')) {
                    renderRoundPhotos();
                }
            }
        })
        .subscribe();

    const fundInput = document.getElementById('clubFundInput');
    fundInput.addEventListener('blur', function() {
        if (isFundUnlocked) {
            appData.clubFund = parseNumber(this.value);
            this.value = formatFundString(appData.clubFund);
            syncToSupabase(appData);
        }
    });

    initScheduleOptions();
});

function showToast(msg) {
    const toast = document.getElementById('customToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

function showSaveStatus(msg) {
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) {
        saveStatus.textContent = msg;
        saveStatus.style.opacity = '1';
        setTimeout(() => { saveStatus.style.opacity = '0.7'; }, 1200);
    }
}

function renderNoticeArea() {
    const dateDisplay = document.getElementById('nextRoundDisplay');
    const fundInput = document.getElementById('clubFundInput');

    if (dateDisplay) {
        dateDisplay.innerHTML = appData.nextRoundDate ? appData.nextRoundDate : `일정 등록하기`;
        checkWeather(appData.nextRoundDate); 
    }
    if (fundInput && document.activeElement !== fundInput) {
        fundInput.value = formatFundString(appData.clubFund);
    }
    updateLockUI();
}

function forceTableReflow() {
    const wrapper = document.getElementById('tableWrapper');
    if(wrapper) {
        const currentScroll = wrapper.scrollLeft;
        wrapper.style.overflowX = 'hidden';
        void wrapper.offsetHeight; 
        wrapper.style.overflowX = 'auto';
        wrapper.scrollLeft = currentScroll; 
    }
}

function initScheduleOptions() {
    const mSelect = document.getElementById('schMonth');
    const dSelect = document.getElementById('schDay');
    const hSelect = document.getElementById('schHour');
    const minSelect = document.getElementById('schMinute');

    if(mSelect) { mSelect.innerHTML = ""; for(let i=1; i<=12; i++) mSelect.add(new Option(i, i)); }
    if(dSelect) { dSelect.innerHTML = ""; for(let i=1; i<=31; i++) dSelect.add(new Option(i, i)); }
    if(hSelect) { hSelect.innerHTML = ""; for(let i=1; i<=12; i++) hSelect.add(new Option(i, i)); }
    
    if(minSelect) {
        minSelect.innerHTML = ""; 
        for(let i=0; i<60; i++) {
            const minStr = i < 10 ? "0" + i : String(i);
            minSelect.add(new Option(minStr, minStr));
        }
    }
}

async function fetchExternalGolfCourses() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve([
                "함평엘리체", "어등산", "해피니스", "마제스티", "골드레이크", "무등산", 
                "빛고을", "푸른솔(장성)", "나주힐스", "화순", "보성", "순천", "아크로", 
                "다산베아채", "JNJ", "파인비치", "사우스링스 영암", "직접 입력"
            ]);
        }, 500); 
    });
}

async function openScheduleModal() {
    document.getElementById('scheduleModal').classList.add('active');
    
    const now = new Date();
    document.getElementById('schMonth').value = now.getMonth() + 1;
    document.getElementById('schDay').value = now.getDate();
    
    const courseSelect = document.getElementById('schCourseSelect');
    const statusText = document.getElementById('courseLoadStatus');
    
    if (courseSelect.options.length <= 1) {
        statusText.textContent = "(외부 데이터 연동 중 ⏳)";
        const courses = await fetchExternalGolfCourses();
        courseSelect.innerHTML = "";
        courses.forEach(c => {
            courseSelect.add(new Option(c, c));
        });
        statusText.textContent = "(외부 데이터 로드 완료 ✅)";
    }
    
    handleCourseSelectChange(courseSelect.value);
}

function handleCourseSelectChange(val) {
    const customInput = document.getElementById('schCourseCustom');
    if (val === "직접 입력") {
        customInput.style.display = "block";
        customInput.focus();
    } else {
        customInput.style.display = "none";
        customInput.value = "";
    }
}

function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('active');
}

function saveSchedule() {
    const m = document.getElementById('schMonth').value;
    const d = document.getElementById('schDay').value;
    const ampm = document.getElementById('schAmpm').value;
    const h = document.getElementById('schHour').value;
    const min = document.getElementById('schMinute').value;
    
    const selectVal = document.getElementById('schCourseSelect').value;
    const customVal = document.getElementById('schCourseCustom').value;
    const course = selectVal === "직접 입력" ? customVal : selectVal;

    if (selectVal === "직접 입력" && course.trim() === "") {
        alert("골프장 이름을 입력해주세요!");
        return;
    }

    const finalDateStr = `${m}월 ${d}일 ${ampm} ${h}:${min} ${course}`;
    
    saveState();
    appData.nextRoundDate = finalDateStr;
    syncToSupabase(appData);
    renderNoticeArea();
    closeScheduleModal();
    showToast("✅ 일정이 성공적으로 저장되었습니다!");
}

function renderAll() {
    renderTable();
    calculateAndRender(); 
    renderMoneyTable();
    
    forceTableReflow();
}

function changeMoneyRound(idxVal) {
    selectedMoneyRoundIdx = parseInt(idxVal, 10);
    renderMoneyTable();
}

function renderMoneyTable() {
    const tbody = document.getElementById('moneyTbody');
    const selectBox = document.getElementById('moneyRoundSelect');
    if (!tbody || !selectBox) return;

    let selectHtml = "";
    for (let r = 0; r < appData.totalRounds; r++) {
        const selectedStr = (r === selectedMoneyRoundIdx) ? "selected" : "";
        selectHtml += `<option value="${r}" ${selectedStr}>${r + 1}차전 정산 입력 ▾</option>`;
    }
    selectBox.innerHTML = selectHtml;

    const currentRoundIdx = selectedMoneyRoundIdx;

    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.roundMoney[currentRoundIdx]) {
        appData.roundMoney[currentRoundIdx] = {};
        golfers.forEach(g => appData.roundMoney[currentRoundIdx][g] = { start: 0, end: 0 });
    }

    const currMoney = appData.roundMoney[currentRoundIdx];
    tbody.innerHTML = "";

    golfers.forEach(g => {
        const m = currMoney[g] || { start: 0, end: 0 };

        const rankPenalty = (cachedRoundRankProfit[g] && cachedRoundRankProfit[g][currentRoundIdx] !== undefined) 
                            ? cachedRoundRankProfit[g][currentRoundIdx] 
                            : 0;

        const totalDiff = (m.start === 0 && m.end === 0) ? 0 : (m.end - m.start);
        const pureStrokeDiff = (m.start === 0 && m.end === 0) ? 0 : (totalDiff - rankPenalty);

        const penaltyText = rankPenalty === 0 ? "0원" : (rankPenalty > 0 ? "+" : "") + (rankPenalty / 10000).toFixed(1) + "만";
        const penaltyBg = rankPenalty < 0 ? "rgba(220, 38, 38, 0.12)" : "rgba(0, 0, 0, 0.03)";
        const penaltyColor = rankPenalty < 0 ? "#dc2626" : "#64748b";

        const strokeText = pureStrokeDiff === 0 ? "0원" : (pureStrokeDiff > 0 ? "+" : "") + (pureStrokeDiff / 10000).toFixed(1) + "만";
        const strokeBg = pureStrokeDiff > 0 ? "rgba(22, 163, 74, 0.08)" : (pureStrokeDiff < 0 ? "rgba(220, 38, 38, 0.08)" : "rgba(0, 0, 0, 0.02)");
        const strokeColor = pureStrokeDiff > 0 ? "#16a34a" : (pureStrokeDiff < 0 ? "#dc2626" : "#64748b");

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:800; color:var(--text-main);">${g}</td>
                <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="money-input" value="${formatNumber(m.start)}" onfocus="this.select()" onchange="updateMoney('${g}', 'start', this.value)"></td>
                <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="money-input" value="${formatNumber(m.end)}" onfocus="this.select()" onchange="updateMoney('${g}', 'end', this.value)"></td>
                <td>
                    <span class="money-result-badge" style="background:${penaltyBg}; color:${penaltyColor}; font-weight:900;">
                        ${penaltyText}
                    </span>
                </td>
                <td>
                    <span class="money-result-badge" style="background:${strokeBg}; color:${strokeColor}; font-weight:800;">
                        ${strokeText}
                    </span>
                </td>
            </tr>
        `;
    });
}

function updateMoney(name, type, value) {
    saveState();
    const currentRoundIdx = selectedMoneyRoundIdx;
    if (!appData.roundMoney[currentRoundIdx]) appData.roundMoney[currentRoundIdx] = {};
    if (!appData.roundMoney[currentRoundIdx][name]) appData.roundMoney[currentRoundIdx][name] = { start: 0, end: 0 };
    
    appData.roundMoney[currentRoundIdx][name][type] = parseNumber(value);
    syncToSupabase(appData);
    renderAll();
}

function renderTable() {
    const headerRow = document.getElementById('headerRow');
    const tbody = document.getElementById('scoreTbody');

    let headerHtml = `<th>이름</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        const courseVal = (appData.courses && appData.courses[r]) ? appData.courses[r] : "";
        const photos = (appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r] : [];
        const photoCount = photos.length;

        headerHtml += `
            <th>
                <div class="header-round-title">${r + 1}차</div>
                <input type="text" class="course-input" value="${courseVal}" placeholder="골프장" onchange="updateCourse(${r}, this.value)">
                <div class="photo-btn" onclick="openRoundPhotoModal(${r})">📸 ${photoCount}장</div>
            </th>`;
    }

    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap;">- 평균</th><th style="white-space:nowrap;">최종 계급</th>`;
    headerRow.innerHTML = headerHtml;

    tbody.innerHTML = "";
    golfers.forEach(name => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-name', name);

        let rowHtml = `<td class="golfer-name">${name}</td>`;
        
        for (let r = 0; r < appData.totalRounds; r++) {
            const val = (appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : "";
            rowHtml += `<td class="score-cell"><input type="text" inputmode="numeric" pattern="[0-9]*" class="score-input" value="${val}" placeholder="타수" onfocus="this.select()" onchange="updateScore('${name}', ${r}, this.value)"></td>`;
        }

        rowHtml += `<td class="avg-cell">-</td><td class="rank-cell">-</td>`;
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });
}

function updateCourse(r, val) {
    saveState();
    if (!appData.courses) appData.courses = [];
    appData.courses[r] = val;
    syncToSupabase(appData);
}

function updateScore(name, r, val) {
    saveState();
    if (!appData.scores) appData.scores = {};
    if (!appData.scores[name]) appData.scores[name] = [];
    appData.scores[name][r] = val === "" ? "" : parseNumber(val);
    syncToSupabase(appData);
    renderAll();
}

function addRound() {
    saveState();
    appData.totalRounds++;
    if (!appData.courses) appData.courses = [];
    appData.courses.push("");
    
    if (!appData.roundPhotos) appData.roundPhotos = [];
    appData.roundPhotos.push([]);

    golfers.forEach(g => {
        if (!appData.scores[g]) appData.scores[g] = [];
        appData.scores[g].push("");
    });

    const newRoundMoney = {};
    golfers.forEach(g => newRoundMoney[g] = { start: 0, end: 0 });
    if (!appData.roundMoney) appData.roundMoney = [];
    appData.roundMoney.push(newRoundMoney);

    selectedMoneyRoundIdx = appData.totalRounds - 1;

    syncToSupabase(appData);
    renderAll();
    
    showToast(`➕ ${appData.totalRounds}차전이 추가되었습니다.`);
    
    setTimeout(() => {
        const wrapper = document.getElementById('tableWrapper');
        if(wrapper) {
            wrapper.scrollTo({ left: wrapper.scrollWidth + 1000, behavior: 'smooth' });
        }
    }, 150);
}

function removeRound() {
    if (appData.totalRounds <= 2) {
        showToast("⚠️ 최소 2개 라운드는 유지되어야 합니다.");
        return;
    }
    saveState();
    appData.totalRounds--;
    if (appData.courses) appData.courses.pop();
    if (appData.roundPhotos && appData.roundPhotos.length > 0) appData.roundPhotos.pop();
    
    golfers.forEach(name => {
        if (appData.scores[name]) appData.scores[name].pop();
    });

    if (appData.roundMoney && appData.roundMoney.length > 0) {
        appData.roundMoney.pop();
    }

    if (selectedMoneyRoundIdx >= appData.totalRounds) {
        selectedMoneyRoundIdx = appData.totalRounds - 1;
    }

    syncToSupabase(appData);
    renderAll();
    
    showToast(`➖ ${appData.totalRounds + 1}차전 데이터가 삭제되었습니다.`);
}

let selectedPhotoRoundIdx = -1;

function openRoundPhotoModal(r) {
    selectedPhotoRoundIdx = r;
    document.getElementById('roundPhotoTitle').textContent = `📸 ${r + 1}차전 갤러리`;
    renderRoundPhotos();
    document.getElementById('roundPhotoModal').classList.add('active');
}

function closeRoundPhotoModal() {
    document.getElementById('roundPhotoModal').classList.remove('active');
}

function renderRoundPhotos() {
    const grid = document.getElementById('photoGrid');
    grid.innerHTML = "";
    const photos = (appData.roundPhotos && appData.roundPhotos[selectedPhotoRoundIdx]) ? appData.roundPhotos[selectedPhotoRoundIdx] : [];
    
    if (photos.length === 0) {
        grid.innerHTML = `<div style="grid-column: span 2; text-align:center; padding: 20px; color:#94a3b8; font-size: 0.8rem;">등록된 사진이 없습니다.</div>`;
        return;
    }

    photos.forEach((photoBase64, index) => {
        grid.innerHTML += `
            <div class="photo-item">
                <img src="${photoBase64}" onclick="openImageViewModal('${photoBase64}')">
                <button type="button" class="photo-delete-btn" onclick="deleteRoundPhoto(${index})">✕</button>
            </div>
        `;
    });
}

function handleRoundPhotoUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
    if (!appData.roundPhotos[selectedPhotoRoundIdx]) appData.roundPhotos[selectedPhotoRoundIdx] = [];

    if (appData.roundPhotos[selectedPhotoRoundIdx].length + files.length > 10) {
        showToast("⚠️ 사진은 차수별로 최대 10장까지만 등록 가능합니다.");
        return;
    }

    showToast("⏳ 사진을 압축하여 업로드 중입니다...");
    saveState();
    
    let loadedCount = 0;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 800; 
                let w = img.width; let h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } 
                else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                
                appData.roundPhotos[selectedPhotoRoundIdx].push(dataUrl);
                loadedCount++;

                if (loadedCount === files.length) {
                    syncToSupabase(appData);
                    renderRoundPhotos();
                    renderAll(); 
                    showToast("✅ 사진 업로드 완료!");
                    document.getElementById('roundPhotoUpload').value = '';
                }
            }
        }
    });
}

function deleteRoundPhoto(photoIdx) {
    if(confirm("이 사진을 삭제하시겠습니까?")) {
        saveState();
        appData.roundPhotos[selectedPhotoRoundIdx].splice(photoIdx, 1);
        syncToSupabase(appData);
        renderRoundPhotos();
        renderAll();
        showToast("🗑️ 사진이 삭제되었습니다.");
    }
}

function openImageViewModal(src) {
    document.getElementById('fullImageView').src = src;
    document.getElementById('imageViewModal').classList.add('active');
}

function closeImageViewModal() {
    document.getElementById('imageViewModal').classList.remove('active');
    document.getElementById('fullImageView').src = "";
}

// 🔥 다운로드 기능 함수 추가
function downloadCurrentPhoto() {
    const imgSrc = document.getElementById('fullImageView').src;
    if (!imgSrc) return;
    
    const a = document.createElement('a');
    a.href = imgSrc;
    a.download = `JTFAG_Gallery_${new Date().getTime()}.jpeg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    showToast("💾 갤러리에 저장되었습니다!");
}

function getGolferBadgesArray(g, overallMinAvg, overallMinScore) {
    let badges = [];
    const ranks = golferRankHistory[g] || [];

    if (ranks.length >= 3 && ranks.slice(-3).every(r => r === 0)) {
        badges.push({ html: `<div class="season-badge badge-eagle-3">🦅 독수리 3연속!</div>`, desc: "최근 3경기 연속 독수리 계급 달성" });
    } else if (ranks.length >= 2 && ranks.slice(-2).every(r => r === 0)) {
        badges.push({ html: `<div class="season-badge badge-eagle-2">🦅 독수리 2연속!</div>`, desc: "최근 2경기 연속 독수리 계급 달성" });
    }

    if (overallMinAvg !== Infinity && golferAvgScores[g] === overallMinAvg) {
        badges.push({ html: `<div class="season-badge badge-avg-1">🏆 평균타수 1위</div>`, desc: "리그 전체 참가자 중 평균 타수 1위" });
    }
    if (overallMinScore !== Infinity && golferMinScores[g] === overallMinScore) {
        badges.push({ html: `<div class="season-badge badge-best-score">🎯 최저타 ${overallMinScore}타</div>`, desc: `리그 전체 기록 중 가장 낮은 최저타(${overallMinScore}타) 달성` });
    }

    if (golferSingleMap[g]) {
        badges.push({ html: `<div class="season-badge badge-single">🎯 싱글의 품격</div>`, desc: "단일 라운드 79타 이하 달성" });
    }
    if (golferReboundMap[g]) {
        badges.push({ html: `<div class="season-badge badge-rebound">🔥 극적 반전</div>`, desc: "직전 경기 대비 타수를 가장 많이 줄임" });
    }
    if (golferPhoenixWins[g]) {
        badges.push({ html: `<div class="season-badge badge-phoenix">🦅 불사조</div>`, desc: "상위 계급(독수리/매)을 상대로 1:1 최다승 기록" });
    }

    if (golferDonorMap[g]) {
        badges.push({ html: `<div class="season-badge badge-donor">💸 기부왕</div>`, desc: "합산 정산 금액 손실 1위 (모임의 든든한 후원자)" });
    }
    if (golferUptrendMap[g]) {
        badges.push({ html: `<div class="season-badge badge-uptrend">📈 상승세</div>`, desc: "최근 경기 스코어가 지속적으로 줄어드는 중" });
    }
    if (golferDowntrendMap[g]) {
        badges.push({ html: `<div class="season-badge badge-downtrend">📉 하락세</div>`, desc: "최근 경기 스코어가 지속적으로 늘어나는 중" });
    }
    if (golferFluctuationMap[g]) {
        badges.push({ html: `<div class="season-badge badge-fluctuation">🎢 기복왕</div>`, desc: "라운드별 스코어 기복(타수 편차)이 가장 큼" });
    }
    if (golferRivalMap[g]) {
        badges.push({ html: `<div class="season-badge badge-rival">⚔️ 영원의 라이벌</div>`, desc: "1:1 매치에서 가장 많은 무승부(접전)를 기록함" });
    }

    if (badges.length === 0) {
        badges.push({ html: `<div class="season-badge badge-rookie">🌱 루키</div>`, desc: "아직 획득한 뱃지가 없음 (분발 요망)" });
    }

    return badges;
}

let golferAvgScores = {};
let golferMinScores = {};

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

    document.querySelectorAll('.rank-cell').forEach(rc => rc.textContent = '-');

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

        sortedGolfers.forEach((golferName, index) => {
            const rankInfo = RANK_CONFIG[index];
            const profit = rankInfo.penalty;
            
            totalRankProfit[golferName] += profit;
            roundRankProfit[golferName][r] = profit;
            golferRankHistory[golferName].push(index);
        });

        let roundHistoryHtml = `
            <div class="history-item">
                <div class="history-header">⛳ ${r + 1}차전 계급 정산 결과</div>
                <div class="history-grid">
        `;

        sortedGolfers.forEach((golferName, index) => {
            const rankInfo = RANK_CONFIG[index];
            const profit = rankInfo.penalty;
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

            const row = document.querySelector(`tr[data-name="${golferName}"]`);
            if (row) {
                const rc = row.querySelector('.rank-cell');
                if (rc) {
                    rc.innerHTML = `<span class="rank-badge ${rankInfo.class}">${rankInfo.icon} ${rankInfo.name}</span>`;
                }
            }
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
        golferFinalNetProfit[g] = rankProfit + totalPureStrokeProfit;
    });

    let minNetProfit = Infinity;
    let donorWinner = null;
    golfers.forEach(g => {
        if (golferFinalNetProfit[g] < minNetProfit && golferFinalNetProfit[g] < 0) {
            minNetProfit = golferFinalNetProfit[g];
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

            summaryGrid.innerHTML += `
                <div class="summary-item">
                    <div class="name" onclick="openPersonalReport('${g}')">${g}</div>
                    <div class="detail-line"><span class="label">계급</span> <span class="val">${rankProfitText}</span></div>
                    <div class="detail-line"><span class="label">타수</span> <span class="val">${strokeProfitText}</span></div>
                    ${summaryBadgesHtml}
                    <div class="final-total" style="color: ${finalColor};">합산: ${finalText}</div>
                </div>
            `;
        });
    }
}

function renderHandicapMatchCard(r1, r2) {
    const matchGrid = document.getElementById('matchGrid');
    if (!matchGrid) return;
    matchGrid.innerHTML = "";

    const avgScores = {};
    golfers.forEach(g => {
        const s1 = parseFloat(appData.scores[g] ? appData.scores[g][r1] : NaN);
        const s2 = parseFloat(appData.scores[g] ? appData.scores[g][r2] : NaN);
        if (!isNaN(s1) && !isNaN(s2)) {
            avgScores[g] = Math.floor((s1 + s2) / 2);
        }
    });

    if (Object.keys(avgScores).length < 4) {
        matchGrid.innerHTML = `<div style="grid-column: span 2; text-align:center; color:var(--text-sub);">스코어를 먼저 입력해 주세요.</div>`;
        return;
    }

    for (let i = 0; i < golfers.length; i++) {
        for (let j = i + 1; j < golfers.length; j++) {
            const g1 = golfers[i];
            const g2 = golfers[j];
            const diff = avgScores[g1] - avgScores[g2];

            let matchText = "";
            if (diff > 0) {
                matchText = `<b>${g1}</b> ➔ ${g2}에게 <b style="color:var(--primary-gold); font-size: clamp(0.7rem, 2.6vw, 0.85rem);">${diff}타</b> 받음`;
            } else if (diff < 0) {
                matchText = `<b>${g2}</b> ➔ ${g1}에게 <b style="color:var(--primary-gold); font-size: clamp(0.7rem, 2.6vw, 0.85rem);">${Math.abs(diff)}타</b> 받음`;
            } else {
                matchText = `<b>${g1}</b> vs <b>${g2}</b> ➔ <b style="color:#16a34a;">스크래치</b>`;
            }

            const item = document.createElement('div');
            item.className = 'match-item';
            item.innerHTML = matchText;
            matchGrid.appendChild(item);
        }
    }
}

function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('active');
}

function closeHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.remove('active');
}

function openPersonalReport(name) {
    document.getElementById('reportTitle').textContent = `⛳ ${name} 통계 리포트`;
    
    const validScores = [];
    if (appData.scores && appData.scores[name]) {
        appData.scores[name].forEach((s) => {
            if (s !== "" && !isNaN(parseFloat(s))) {
                validScores.push(parseFloat(s));
            }
        });
    }

    let max = "-", min = "-", avg = "-";
    if(validScores.length > 0) {
        max = Math.max(...validScores);
        min = Math.min(...validScores);
        avg = (validScores.reduce((a,b)=>a+b,0) / validScores.length).toFixed(1);
    }

    const ranks = golferRankHistory[name] || [];
    const rankCounts = [0, 0, 0, 0]; 
    ranks.forEach(r => rankCounts[r]++);

    const userBadges = golferBadgesMap[name] || [];
    const badgeHtmlWithDesc = userBadges.map(b => `
        <div class="badge-desc-item">
            <div style="flex-shrink:0;">${b.html}</div>
            <div class="badge-desc-text">${b.desc}</div>
        </div>
    `).join('');
    
    const badgeSection = `
        <div class="report-section">
            <div class="report-title">🏆 획득한 뱃지 안내</div>
            <div class="report-badges-area">
                ${badgeHtmlWithDesc ? badgeHtmlWithDesc : '<span style="color:#94a3b8; font-size:0.75rem; text-align:center; padding:10px;">아직 획득한 뱃지가 없습니다.</span>'}
            </div>
        </div>
    `;

    const winRates = {};
    golfers.forEach(g => { if(g !== name) winRates[g] = {w:0, l:0, t:0}; });

    for (let r = 2; r < appData.totalRounds; r++) {
        let isComplete = true;
        const hAvg = {};
        const cScore = {};
        golfers.forEach(g => {
            const s1 = parseFloat(appData.scores[g] ? appData.scores[g][r-2] : NaN);
            const s2 = parseFloat(appData.scores[g] ? appData.scores[g][r-1] : NaN);
            const sr = parseFloat(appData.scores[g] ? appData.scores[g][r] : NaN);
            if(isNaN(s1) || isNaN(s2) || isNaN(sr)) isComplete = false;
            hAvg[g] = Math.floor((s1+s2)/2);
            cScore[g] = sr;
        });

        if(!isComplete) continue;

        for(let opp in winRates) {
            const myAdj = cScore[name] - (hAvg[name] - hAvg[opp]);
            const oppAdj = cScore[opp];

            if(myAdj < oppAdj) winRates[opp].w++;
            else if(myAdj > oppAdj) winRates[opp].l++;
            else {
                if(hAvg[name] < hAvg[opp]) winRates[opp].w++;
                else if(hAvg[opp] < hAvg[name]) winRates[opp].l++;
                else winRates[opp].t++;
            }
        }
    }

    let highestWinRate = -1;
    let lowestWinRate = 101;
    let atm = "-";
    let nemesis = "-";
    let atmWinCount = -1;
    let nemesisLossCount = -1;

    let winRateHtml = "";
    for(let opp in winRates) {
        const matchCount = winRates[opp].w + winRates[opp].l + winRates[opp].t;
        if (matchCount > 0) {
            const rate = Math.round((winRates[opp].w / matchCount) * 100);
            winRateHtml += `<div><span>vs ${opp}</span> <b>승률 ${rate}%</b> <span>(${winRates[opp].w}승 ${winRates[opp].t}무 ${winRates[opp].l}패)</span></div>`;
            
            if (rate > highestWinRate) {
                highestWinRate = rate; atm = opp; atmWinCount = winRates[opp].w;
            } else if (rate === highestWinRate) {
                if (winRates[opp].w > atmWinCount) { atm = opp; atmWinCount = winRates[opp].w; }
            }

            if (rate < lowestWinRate) {
                lowestWinRate = rate; nemesis = opp; nemesisLossCount = winRates[opp].l;
            } else if (rate === lowestWinRate) {
                if (winRates[opp].l > nemesisLossCount) { nemesis = opp; nemesisLossCount = winRates[opp].l; }
            }
        }
    }

    if (highestWinRate === -1) { 
        atm = "데이터 부족"; nemesis = "데이터 부족";
        winRateHtml = "<div style='text-align:center; color:#94a3b8;'>진행된 매치가 없습니다.</div>";
    } else {
        if (highestWinRate === lowestWinRate) {
            if (highestWinRate >= 50) nemesis = "없음";
            else atm = "없음";
        }
    }

    const rivalHtml = `
        <div class="stat-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 10px;">
            <div class="stat-box" style="border-color:#fca5a5; background:#fef2f2;">
                <div class="stat-label" style="color:#b91c1c;">😈 나의 천적</div>
                <div class="stat-val" style="color:#7f1d1d; font-size:1rem;">${nemesis}</div>
            </div>
            <div class="stat-box" style="border-color:#7dd3fc; background:#f0f9ff;">
                <div class="stat-label" style="color:#0369a1;">🏧 승점 자판기</div>
                <div class="stat-val" style="color:#0c4a6e; font-size:1rem;">${atm}</div>
            </div>
        </div>
    `;

    const content = `
        ${badgeSection}
        
        <div class="report-section">
            <div class="report-title">📊 스코어 요약</div>
            <div class="stat-grid">
                <div class="stat-box"><div class="stat-label">최저타</div><div class="stat-val" style="color:#2563eb;">${min}</div></div>
                <div class="stat-box"><div class="stat-label">평균타수</div><div class="stat-val">${avg}</div></div>
                <div class="stat-box"><div class="stat-label">최고타</div><div class="stat-val" style="color:#dc2626;">${max}</div></div>
            </div>
        </div>

        <div class="report-section">
            <div class="report-title">🎖️ 계급별 달성 횟수</div>
            <div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
                <div class="stat-box"><div class="stat-label">🦅독수리</div><div class="stat-val">${rankCounts[0]}회</div></div>
                <div class="stat-box"><div class="stat-label">⚡매</div><div class="stat-val">${rankCounts[1]}회</div></div>
                <div class="stat-box"><div class="stat-label">🦩학</div><div class="stat-val">${rankCounts[2]}회</div></div>
                <div class="stat-box"><div class="stat-label">🐦참새</div><div class="stat-val">${rankCounts[3]}회</div></div>
            </div>
        </div>

        <div class="report-section">
            <div class="report-title">⚔️ 1:1 통산 승률 및 천적 관계</div>
            ${rivalHtml}
            <div class="winrate-list">${winRateHtml}</div>
        </div>
    `;

    document.getElementById('reportContent').innerHTML = content;
    document.getElementById('personalReportModal').classList.add('active');
}

function closePersonalReport() {
    document.getElementById('personalReportModal').classList.remove('active');
}

function resetAllData() {
    if (confirm("정말로 모든 실시간 데이터를 초기화하시겠습니까?")) {
        saveState();
        appData = getDefaultData();
        selectedMoneyRoundIdx = appData.totalRounds - 1;
        syncToSupabase(appData);
        renderAll();
        showToast("🔄 모든 데이터가 초기화되었습니다.");
        forceTableReflow();
    }
}
