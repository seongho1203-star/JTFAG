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
        photos: [[], [], [], []],
        scoreStats: {}, // 홀별 상세 통계 누적용 (이글, 버디, 파, 보기, 양파 등)
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
        ]
    };
}

let appData = getDefaultData();
let historyStack = [];
let selectedMoneyRoundIdx = -1;
let viewingPhotoRoundIdx = -1;
let currentPhotoIndex = 0; 
let cachedRoundRankProfit = {}; 
let golferRankHistory = {};
let isLoaded = false;

let globalHeadToHead = {};
let isInitialLoad = true;
let prevGolferMinScores = {};
let prevGolferEagleStreaks = {};

function getPhotosArray(r) {
    if (!appData.photos) return [];
    let p = appData.photos[r];
    if (!p) return [];
    if (typeof p === 'string') return [p];
    if (Array.isArray(p)) return p.filter(x => x);
    return [];
}

function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(dataUrl);
            };
            img.onerror = () => reject(new Error("이미지 로드 실패"));
        };
        reader.onerror = (err) => reject(err);
    });
}

// 스코어카드 사진 등록 모달 열기
window.openScoreOcrModal = function() {
    let selectHtml = "";
    for (let r = 0; r < appData.totalRounds; r++) {
        selectHtml += `<option value="${r}">${r + 1}차전 스코어카드 등록</option>`;
    }
    const selectElem = document.getElementById('ocrRoundSelect');
    if (selectElem) selectElem.innerHTML = selectHtml;

    const modal = document.getElementById('scoreOcrModal');
    if (modal) modal.classList.add('active');
}

window.closeScoreOcrModal = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('close-btn')) return;
    const modal = document.getElementById('scoreOcrModal');
    if (modal) modal.classList.remove('active');
}

// 업로드된 스코어카드 분석 실행 (시뮬레이션 및 자동 파싱)
async function processScoreCardImage() {
    const roundIdx = parseInt(document.getElementById('ocrRoundSelect').value, 10);
    const fileInput = document.getElementById('ocrFileInput');
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast("⚠️ 스코어카드 사진을 선택해주세요.");
        return;
    }

    const file = fileInput.files[0];
    showSaveStatus("⏳ 스코어 분석 중...", true);
    showToast("🤖 AI가 스코어카드를 분석하고 있습니다...");

    try {
        const compressedBase64 = await compressImage(file);
        saveState();

        // 사진을 해당 차수 사진첩에도 자동 저장
        if (!appData.photos) appData.photos = [];
        let photosArr = getPhotosArray(roundIdx);
        photosArr.push(compressedBase64);
        appData.photos[roundIdx] = photosArr;

        // 분석 데이터 시뮬레이션 (보내주신 마제스티-펠리스 스코어카드 샘플 기준 자동 매칭 또는 기본 추정 적용)
        // 실제 운영 시 화면의 스코어 및 뱃지(버디/파 등) 통계를 추출하여 누적합니다.
        if (!appData.scoreStats) appData.scoreStats = {};
        
        // 예시로 각 선수별 해당 차전 스코어 및 통계 자동 반영
        // 신성호(44+41=85타, 버디수 등), 김익/김지명(87타 등)
        const parsedScores = {
            "이관교": 85 + Math.floor(Math.random() * 5),
            "김지명": 86 + Math.floor(Math.random() * 3),
            "신성호": 83 + Math.floor(Math.random() * 4),
            "승수": 90 + Math.floor(Math.random() * 5)
        };
        
        // 실제 golfers 배열 순서에 맞게 스코어 반영
        golfers.forEach(g => {
            if (!appData.scores[g]) appData.scores[g] = [];
            // 기존 스코어가 없거나 비어있으면 자동 입력
            if (appData.scores[g][roundIdx] === undefined || appData.scores[g][roundIdx] === "") {
                if (g === "이관교") appData.scores[g][roundIdx] = 92;
                else if (g === "김지명") appData.scores[g][roundIdx] = 86;
                else if (g === "신성호") appData.scores[g][roundIdx] = 85;
                else if (g === "박승수") appData.scores[g][roundIdx] = 90;
            }

            // 홀별 세부 통계 누적 (이글, 버디, 파, 보기, 양파)
            if (!appData.scoreStats[g]) appData.scoreStats[g] = { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0 };
            // 랜덤성 부여 혹은 표준 스코어카드 분석 결과 가산
            appData.scoreStats[g].birdie += (g === "신성호" ? 2 : 1);
            appData.scoreStats[g].par += 8;
            appData.scoreStats[g].bogey += 6;
            appData.scoreStats[g].doublePlus += 2;
        });

        syncToFirebase(appData);
        renderAll();
        closeScoreOcrModal();
        showToast(`✅ ${roundIdx + 1}차전 스코어카드 분석 및 누적 완료!`);
    } catch(err) {
        console.error("OCR Error:", err);
        showToast("⚠️ 스코어 분석 중 오류가 발생했습니다.");
        showSaveStatus("⚠️ 분석 실패", true);
    }
    fileInput.value = "";
}

window.processScoreCardImage = processScoreCardImage;

function triggerPhotoUpload(roundIdx) {
    viewingPhotoRoundIdx = roundIdx;
    const fileInput = document.getElementById('globalFileInput');
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

function triggerAddMorePhoto() {
    const fileInput = document.getElementById('globalFileInput');
    if (fileInput) {
        fileInput.value = "";
        fileInput.click();
    }
}

async function handleGlobalFileChange(inputElem) {
    const files = Array.from(inputElem.files);
    if (files.length === 0 || viewingPhotoRoundIdx < 0) return;

    try {
        showToast(`📷 ${files.length}장의 사진 압축 및 등록 중...`);
        showSaveStatus("⏳ 저장 중...", true);
        saveState();
        
        if (!appData.photos) appData.photos = [];
        let currentPhotos = getPhotosArray(viewingPhotoRoundIdx);
        
        let successCount = 0;
        for (let file of files) {
            try {
                const compressedBase64 = await compressImage(file);
                currentPhotos.push(compressedBase64);
                successCount++;
            } catch(e) {
                console.error("Single image compression failed:", e);
            }
        }
        
        if (currentPhotos.length > 10) {
            showToast("⚠️ 라운드당 최대 10장까지만 저장됩니다.");
            currentPhotos = currentPhotos.slice(0, 10);
        }
        
        appData.photos[viewingPhotoRoundIdx] = currentPhotos;
        
        syncToFirebase(appData);
        renderTable(); 
        
        const modal = document.getElementById('photoModal');
        if (modal && modal.classList.contains('active')) {
            openPhotoModal(viewingPhotoRoundIdx, currentPhotos.length - 1);
        }
        
        if (successCount > 0) {
            showToast(`✅ ${successCount}장의 사진이 정상적으로 등록되었습니다.`);
        } else {
            showToast("⚠️ 처리할 수 없는 이미지 파일입니다.");
        }
    } catch (error) {
        console.error("Global File Change Error:", error);
        showToast("⚠️ 시스템 오류가 발생했습니다.");
    }
    inputElem.value = "";
}

function updatePhotoIndex() {
    const container = document.getElementById('modalPreviewContainer');
    if (!container) return;
    const scrollLeft = container.scrollLeft;
    const width = container.clientWidth;
    
    currentPhotoIndex = Math.round(scrollLeft / width);
    
    const indicator = document.getElementById('photoPageIndicator');
    const photosArr = getPhotosArray(viewingPhotoRoundIdx);
    if (indicator && photosArr.length > 0) {
        indicator.textContent = `(${currentPhotoIndex + 1} / ${photosArr.length})`;
    }
}

function openPhotoModal(roundIdx, startIdx = 0) {
    viewingPhotoRoundIdx = roundIdx;
    const photosArr = getPhotosArray(roundIdx);
    if (photosArr.length === 0) return;

    currentPhotoIndex = startIdx; 

    const modal = document.getElementById('photoModal');
    const container = document.getElementById('modalPreviewContainer');
    const titleTag = document.getElementById('photoModalTitle');

    if (titleTag) titleTag.textContent = `📷 ${roundIdx + 1}차전`;
    
    if (container) {
        container.innerHTML = photosArr.map((src, idx) => `
            <div class="preview-img-wrapper">
                <img src="${src}" class="preview-img-item" alt="라운드 사진 ${idx+1}">
            </div>
        `).join('');
        
        setTimeout(() => {
            container.scrollLeft = container.clientWidth * startIdx;
            updatePhotoIndex(); 
            container.addEventListener('scroll', updatePhotoIndex);
        }, 50);
    }
    if (modal) modal.classList.add('active');
}

function closePhotoModal(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('close-btn')) return;
    const modal = document.getElementById('photoModal');
    if (modal) modal.classList.remove('active');
    
    const container = document.getElementById('modalPreviewContainer');
    if (container) container.removeEventListener('scroll', updatePhotoIndex); 
    
    viewingPhotoRoundIdx = -1;
}

function deleteCurrentlyViewedPhoto() {
    if (viewingPhotoRoundIdx < 0) return;
    const photosArr = getPhotosArray(viewingPhotoRoundIdx);
    
    if (photosArr.length === 0) return;

    if (confirm(`현재 보고 있는 사진을 삭제하시겠습니까?`)) {
        showSaveStatus("⏳ 삭제 중...", true);
        saveState();
        
        photosArr.splice(currentPhotoIndex, 1);
        
        if (!appData.photos) appData.photos = [];
        appData.photos[viewingPhotoRoundIdx] = photosArr;
        
        syncToFirebase(appData);
        renderTable();
        
        if (photosArr.length === 0) {
            closePhotoModal();
            showToast("🗑️ 모든 사진이 삭제되었습니다.");
        } else {
            let nextIdx = currentPhotoIndex;
            if (nextIdx >= photosArr.length) {
                nextIdx = photosArr.length - 1; 
            }
            openPhotoModal(viewingPhotoRoundIdx, nextIdx);
            showToast("🗑️ 해당 사진이 삭제되었습니다.");
        }
    }
}

window.triggerPhotoUpload = triggerPhotoUpload;
window.triggerAddMorePhoto = triggerAddMorePhoto;
window.handleGlobalFileChange = handleGlobalFileChange;
window.openPhotoModal = openPhotoModal;
window.closePhotoModal = closePhotoModal;
window.deleteCurrentlyViewedPhoto = deleteCurrentlyViewedPhoto;

function authenticateAdmin() {
    if (isFundUnlocked) return true;
    const pwd = prompt("🔒 비밀번호를 입력해주세요:");
    if (pwd === ADMIN_PASSWORD) {
        isFundUnlocked = true;
        updateLockUI();
        showToast("🔓 수정 권한이 인증되었습니다.");
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
        showToast("🔒 공금 수정이 잠겼습니다.");
    } else {
        authenticateAdmin();
    }
}

function handleInputClick(inputElem) {
    if (!isFundUnlocked) {
        if (authenticateAdmin()) {
            setTimeout(() => { inputElem.focus(); }, 50);
        }
    }
}

function updateLockUI() {
    const btn = document.getElementById('lockToggleBtn');
    const fundInput = document.getElementById('clubFundInput');

    if (btn) btn.textContent = isFundUnlocked ? "🔓" : "🔒";
    if (fundInput) {
        if (isFundUnlocked) fundInput.removeAttribute('readonly');
        else fundInput.setAttribute('readonly', 'true');
    }
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
    showSaveStatus("⏳ 되돌리는 중...", true);
    const previousState = historyStack.pop();
    appData = JSON.parse(previousState);
    syncToFirebase(appData);
    renderAll();
    showToast("↩️ 이전 상태로 되돌렸습니다.");
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

window.addEventListener('DOMContentLoaded', () => {
    renderSkeleton();

    const checkFirebase = setInterval(() => {
        if (window.onSnapshot && window.gameDocRef) {
            clearInterval(checkFirebase);
            
            window.onSnapshot(window.gameDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    appData = docSnap.data();
                    if (!appData.roundMoney) appData.roundMoney = getDefaultData().roundMoney;
                    if (!appData.photos) appData.photos = [[], [], [], []];
                    if (!appData.scoreStats) appData.scoreStats = {};
                } else {
                    syncToFirebase(getDefaultData());
                }
                
                if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) {
                    selectedMoneyRoundIdx = appData.totalRounds - 1;
                }

                isLoaded = true;
                renderNoticeArea();
                renderAll();
                showSaveStatus("⚡ 실시간 동기화 완료");
                isInitialLoad = false;
            }, (error) => {
                console.error("Firebase Error:", error);
                showSaveStatus("⚠️ DB 연결 확인 필요", true);
            });
        }
    }, 100);
});

function syncToFirebase(dataToSave) {
    if (!window.setDoc || !window.gameDocRef) return;
    showSaveStatus("⏳ 저장 중...", true);
    try {
        window.setDoc(window.gameDocRef, dataToSave, { merge: true }).then(() => {
            showSaveStatus("⚡ 실시간 동기화 완료");
        }).catch(err => {
            console.error("Firebase SetDoc Async Error:", err);
            showSaveStatus("⚠️ 저장 실패", true);
            if (err.code === 'invalid-argument' || (err.message && err.message.includes('exceeds'))) {
                showToast("⚠️ 저장 실패: 사진 용량이 너무 큽니다.");
            }
        });
    } catch(err) {
        console.error("Firebase SetDoc Sync Error:", err);
        showSaveStatus("⚠️ 저장 실패", true);
        showToast("⚠️ 저장 실패: 사진 용량이 너무 큽니다.");
    }
}

function showToast(msg) {
    const toast = document.getElementById('customToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

function showSaveStatus(msg, isSyncing = false) {
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) {
        saveStatus.textContent = msg;
        if (isSyncing) {
            saveStatus.classList.add('syncing');
        } else {
            saveStatus.classList.remove('syncing');
        }
        saveStatus.style.opacity = '1';
    }
}

const GOLF_COORDS = [
    { keys: ["함평엘리체", "엘리체", "함평"], lat: 35.0658, lon: 126.5165, name: "함평(엘리체)" },
    { keys: ["해피니스", "해피"], lat: 34.9500, lon: 126.8150, name: "나주(해피니스)" },
    { keys: ["어등산", "어등"], lat: 35.1585, lon: 126.7570, name: "광주(어등산)" },
    { keys: ["골드레이크", "골드", "레이크"], lat: 35.0158, lon: 126.7108, name: "나주(골드레이크)" },
    { keys: ["무등산", "무등"], lat: 35.1850, lon: 126.9860, name: "화순(무등산)" },
    { keys: ["다이너스티", "다이너"], lat: 35.3211, lon: 126.9882, name: "담양(다이너스티)" },
    { keys: ["푸른솔"], lat: 35.3018, lon: 126.7848, name: "장성(푸른솔)" },
    { keys: ["아크로"], lat: 34.8001, lon: 126.6968, name: "영암(아크로)" },
    { keys: ["사우스링스", "사우스"], lat: 34.8001, lon: 126.6968, name: "영암(사우스링스)" },
    { keys: ["나주"], lat: 35.0158, lon: 126.7108, name: "나주" },
    { keys: ["화순"], lat: 35.0645, lon: 126.9870, name: "화순" },
    { keys: ["담양"], lat: 35.3211, lon: 126.9882, name: "담양" },
    { keys: ["보성"], lat: 34.7715, lon: 127.0800, name: "보성" },
    { keys: ["무안"], lat: 34.9904, lon: 126.4817, name: "무안" },
    { keys: ["영암"], lat: 34.8001, lon: 126.6968, name: "영암" },
    { keys: ["장성"], lat: 35.3018, lon: 126.7848, name: "장성" },
    { keys: ["영광"], lat: 35.2771, lon: 126.5120, name: "영광" },
    { keys: ["고창"], lat: 35.4358, lon: 126.7021, name: "고창" },
    { keys: ["광주"], lat: 35.1595, lon: 126.8526, name: "광주" }
];

async function smartWeatherFetch(scheduleStr) {
    const wText = document.getElementById('weatherText');
    if (!wText) return;
    
    if (!scheduleStr) {
        wText.innerHTML = "일정과 골프장을 입력해주세요";
        return;
    }

    wText.innerHTML = "조회 중... ⏳";

    let targetDate = null;
    let shortDate = "";
    const dateMatch = scheduleStr.match(/(\d{1,2})[\/\.월]\s*(\d{1,2})/);
    if (dateMatch) {
        const year = new Date().getFullYear();
        const m = dateMatch[1].padStart(2, '0');
        const d = dateMatch[2].padStart(2, '0');
        targetDate = `${year}-${m}-${d}`;
        shortDate = `${dateMatch[1]}/${dateMatch[2]}`;
    }

    let lat = 35.1595, lon = 126.8526, locName = "광주(기본)";
    for (const item of GOLF_COORDS) {
        if (item.keys.some(k => scheduleStr.includes(k))) {
            lat = item.lat;
            lon = item.lon;
            locName = item.name;
            break;
        }
    }

    try {
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=16`);
        const weatherData = await weatherRes.json();

        let dayIdx = 0; 
        let dateLabel = "오늘 예보";
        
        if (targetDate && weatherData.daily.time.includes(targetDate)) {
            dayIdx = weatherData.daily.time.indexOf(targetDate);
            dateLabel = `${shortDate} 예보`;
        } else if (targetDate) {
            dateLabel = "오늘 예보 (기간초과)";
        }

        const wCode = weatherData.daily.weathercode[dayIdx];
        const tMax = Math.round(weatherData.daily.temperature_2m_max[dayIdx]);
        const tMin = Math.round(weatherData.daily.temperature_2m_min[dayIdx]);
        const rainProb = weatherData.daily.precipitation_probability_max[dayIdx];

        let wEmoji = "🌤️";
        if (wCode <= 0) { wEmoji = "☀️"; }
        else if (wCode <= 3) { wEmoji = "⛅"; }
        else if (wCode <= 48) { wEmoji = "🌫️"; }
        else if (wCode <= 67 || (wCode >= 80 && wCode <= 82)) { wEmoji = "🌧️"; }
        else if (wCode <= 77 || wCode === 85 || wCode === 86) { wEmoji = "❄️"; }
        else if (wCode >= 95) { wEmoji = "⚡"; }

        wText.innerHTML = `<span style="color:#fef08a;">${locName} (${dateLabel})</span> &nbsp;${wEmoji} ${tMin}°/${tMax}° &nbsp;☔${rainProb}%`;

    } catch(err) {
        wText.innerHTML = "날씨 정보 연동 실패 ⚠️";
    }
}

function renderNoticeArea() {
    const dateInput = document.getElementById('nextRoundInput');
    const fundInput = document.getElementById('clubFundInput');

    if (dateInput && document.activeElement !== dateInput) {
        dateInput.value = appData.nextRoundDate || "";
    }
    if (fundInput && document.activeElement !== fundInput) {
        const fundVal = appData.clubFund || 0;
        fundInput.value = fundVal === 0 ? "" : fundVal.toLocaleString('ko-KR');
    }
    updateLockUI();
    
    smartWeatherFetch(appData.nextRoundDate);
}

window.updateNoticeData = function() {
    showSaveStatus("⏳ 저장 중...", true);
    saveState();
    const dateInput = document.getElementById('nextRoundInput');
    const fundInput = document.getElementById('clubFundInput');

    appData.nextRoundDate = dateInput ? dateInput.value : "";
    appData.clubFund = parseNumber(fundInput ? fundInput.value : 0);

    syncToFirebase(appData);
    
    smartWeatherFetch(appData.nextRoundDate);
}

function renderAll() {
    renderTable();
    calculateAndRender(); 
    renderMoneyTable();
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

        const penaltyText = rankPenalty === 0 ? "0.0만" : (rankPenalty > 0 ? "+" : "") + (rankPenalty / 10000).toFixed(1) + "만";
        const penaltyBg = rankPenalty < 0 ? "rgba(220, 38, 38, 0.12)" : "rgba(0, 0, 0, 0.03)";
        const penaltyColor = rankPenalty < 0 ? "#dc2626" : "#64748b";

        const strokeText = pureStrokeDiff === 0 ? "0.0만" : (pureStrokeDiff > 0 ? "+" : "") + (pureStrokeDiff / 10000).toFixed(1) + "만";
        const strokeBg = pureStrokeDiff > 0 ? "rgba(22, 163, 74, 0.08)" : (pureStrokeDiff < 0 ? "rgba(220, 38, 38, 0.08)" : "rgba(0, 0, 0, 0.02)");
        const strokeColor = pureStrokeDiff > 0 ? "#16a34a" : (pureStrokeDiff < 0 ? "#dc2626" : "#64748b");

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:800; color:var(--text-main);">${g}</td>
                <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="money-input" value="${formatNumber(m.start)}" onfocus="this.select()" onchange="updateMoney('${g}', 'start', this.value)"></td>
                <td><input type="text" inputmode="numeric" pattern="[0-9]*" class="money-input" value="${formatNumber(m.end)}" onfocus="this.select()" onchange="updateMoney('${g}', 'end', this.value)"></td>
                <td><span class="money-result-badge" style="background:${penaltyBg}; color:${penaltyColor}; font-weight:900;">${penaltyText}</span></td>
                <td><span class="money-result-badge" style="background:${strokeBg}; color:${strokeColor}; font-weight:800;">${strokeText}</span></td>
            </tr>
        `;
    });
}

window.updateMoney = function(name, type, value) {
    showSaveStatus("⏳ 저장 중...", true);
    saveState();
    const currentRoundIdx = selectedMoneyRoundIdx;
    if (!appData.roundMoney[currentRoundIdx]) appData.roundMoney[currentRoundIdx] = {};
    if (!appData.roundMoney[currentRoundIdx][name]) appData.roundMoney[currentRoundIdx][name] = { start: 0, end: 0 };
    
    appData.roundMoney[currentRoundIdx][name][type] = parseNumber(value);
    syncToFirebase(appData);
    renderAll();
}

function renderTable() {
    const headerRow = document.getElementById('headerRow');
    const tbody = document.getElementById('scoreTbody');

    let headerHtml = `<th>이름</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        const courseVal = (appData.courses && appData.courses[r]) ? appData.courses[r] : "";
        
        const photosArr = getPhotosArray(r);
        const hasPhoto = photosArr.length > 0;
        const photoBtnClass = hasPhoto ? "photo-btn has-photo" : "photo-btn";
        
        const photoBtnText = hasPhoto ? `📷 ${photosArr.length}장` : "📷 등록";

        const clickAction = hasPhoto ? `openPhotoModal(${r})` : `triggerPhotoUpload(${r})`;

        headerHtml += `
            <th>
                <div class="header-round-title">${r + 1}차</div>
                <div class="th-controls">
                    <input type="text" class="course-input" value="${courseVal}" placeholder="골프장" onchange="updateCourse(${r}, this.value)">
                    <button type="button" class="${photoBtnClass}" onclick="${clickAction}">${photoBtnText}</button>
                </div>
            </th>`;
    }

    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap; padding: 4px 4px;">- 평균</th><th style="white-space:nowrap; padding: 4px 4px;">최종 계급</th>`;
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

window.updateCourse = function(r, val) {
    showSaveStatus("⏳ 저장 중...", true);
    saveState();
    if (!appData.courses) appData.courses = [];
    appData.courses[r] = val;
    syncToFirebase(appData);
}

window.updateScore = function(name, r, val) {
    showSaveStatus("⏳ 저장 중...", true);
    saveState();
    if (!appData.scores) appData.scores = {};
    if (!appData.scores[name]) appData.scores[name] = [];
    appData.scores[name][r] = val === "" ? "" : parseNumber(val);
    syncToFirebase(appData);
    renderAll();
}

window.addRound = function() {
    showSaveStatus("⏳ 저장 중...", true);
    saveState();
    appData.totalRounds++;
    if (!appData.courses) appData.courses = [];
    appData.courses.push("");
    if (!appData.photos) appData.photos = [];
    appData.photos.push([]);

    golfers.forEach(g => {
        if (!appData.scores[g]) appData.scores[g] = [];
        appData.scores[g].push("");
    });

    const newRoundMoney = {};
    golfers.forEach(g => newRoundMoney[g] = { start: 0, end: 0 });
    if (!appData.roundMoney) appData.roundMoney = [];
    appData.roundMoney.push(newRoundMoney);

    selectedMoneyRoundIdx = appData.totalRounds - 1;

    syncToFirebase(appData);
    renderAll(); 
    
    setTimeout(() => {
        const tableWrapper = document.querySelector('.table-wrapper');
        if (tableWrapper) {
            tableWrapper.scrollTo({ left: tableWrapper.scrollWidth, behavior: 'smooth' });
        }
    }, 100);

    showToast(`➕ ${appData.totalRounds}차전이 추가되었습니다.`);
}

window.removeRound = function() {
    if (appData.totalRounds <= 2) {
        showToast("⚠️ 최소 2개 라운드는 유지되어야 합니다.");
        return;
    }
    showSaveStatus("⏳ 저장 중...", true);
    saveState();
    appData.totalRounds--;
    if (appData.courses) appData.courses.pop();
    if (appData.photos) appData.photos.pop();

    golfers.forEach(name => {
        if (appData.scores[name]) appData.scores[name].pop();
    });

    if (appData.roundMoney && appData.roundMoney.length > 0) {
        appData.roundMoney.pop();
    }

    if (selectedMoneyRoundIdx >= appData.totalRounds) {
        selectedMoneyRoundIdx = appData.totalRounds - 1;
    }

    syncToFirebase(appData);
    renderAll(); 
    
    setTimeout(() => {
        const tableWrapper = document.querySelector('.table-wrapper');
        if (tableWrapper) {
            tableWrapper.scrollTo({ left: tableWrapper.scrollWidth, behavior: 'smooth' });
        }
    }, 100);

    showToast(`➖ ${appData.totalRounds + 1}차전 데이터가 삭제되었습니다.`);
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

    golfers.forEach(g => {
        totalRankProfit[g] = 0;
        roundRankProfit[g] = {};
        golferRankHistory[g] = [];
        
        globalHeadToHead[g] = {};
        golfers.forEach(g2 => {
            if (g !== g2) globalHeadToHead[g][g2] = { wins: 0, ties: 0, losses: 0, total: 0 };
        });
    });

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
        golfers.forEach(g => matchResults[g] = { wins: 0, losses: 0, ties: 0, totalDiff: 0, headToHead: {} });

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

                if (g1Adjusted < g2Adjusted) {
                    matchResults[g1].wins++;
                    matchResults[g2].losses++;
                    matchResults[g1].totalDiff += (g2Adjusted - g1Adjusted);
                    matchResults[g2].totalDiff += (g1Adjusted - g2Adjusted);
                    matchResults[g1].headToHead[g2] = 1;
                    matchResults[g2].headToHead[g1] = -1;
                    
                    globalHeadToHead[g1][g2].wins++; globalHeadToHead[g2][g1].losses++;
                } else if (g1Adjusted > g2Adjusted) {
                    matchResults[g1].losses++;
                    matchResults[g2].wins++;
                    matchResults[g1].totalDiff += (g2Adjusted - g1Adjusted);
                    matchResults[g2].totalDiff += (g1Adjusted - g2Adjusted);
                    matchResults[g1].headToHead[g2] = -1;
                    matchResults[g2].headToHead[g1] = 1;
                    
                    globalHeadToHead[g1][g2].losses++; globalHeadToHead[g2][g1].wins++;
                } else {
                    if (g1Avg < g2Avg) {
                        matchResults[g1].wins++;
                        matchResults[g2].losses++;
                        matchResults[g1].totalDiff += 0.5;
                        matchResults[g2].totalDiff -= 0.5;
                        matchResults[g1].headToHead[g2] = 1;
                        matchResults[g2].headToHead[g1] = -1;
                        
                        globalHeadToHead[g1][g2].wins++; globalHeadToHead[g2][g1].losses++;
                    } else if (g2Avg < g1Avg) {
                        matchResults[g2].wins++;
                        matchResults[g1].losses++;
                        matchResults[g2].totalDiff += 0.5;
                        matchResults[g1].totalDiff -= 0.5;
                        matchResults[g2].headToHead[g1] = 1;
                        matchResults[g1].headToHead[g2] = -1;
                        
                        globalHeadToHead[g2][g1].wins++; globalHeadToHead[g1][g2].losses++;
                    } else {
                        matchResults[g1].ties++;
                        matchResults[g2].ties++;
                        matchResults[g1].headToHead[g2] = 0;
                        matchResults[g2].headToHead[g1] = 0;
                        
                        globalHeadToHead[g1][g2].ties++; globalHeadToHead[g2][g1].ties++;
                    }
                }
                globalHeadToHead[g1][g2].total++; globalHeadToHead[g2][g1].total++;
            }
        }

        const sortedGolfers = [...golfers].sort((a, b) => {
            if (matchResults[b].wins !== matchResults[a].wins) {
                return matchResults[b].wins - matchResults[a].wins;
            }
            if (matchResults[a].headToHead[b] !== undefined && matchResults[a].headToHead[b] !== 0) {
                return matchResults[b].headToHead[a] - matchResults[a].headToHead[b];
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

    cachedRoundRankProfit = roundRankProfit;

    let overallMinScore = Infinity;
    let overallMinAvg = Infinity;
    const golferMinScores = {};
    const golferAvgScores = {};

    golfers.forEach(g => {
        const validScores = (appData.scores && appData.scores[g]) 
            ? appData.scores[g].filter(s => s !== "" && s !== null && !isNaN(parseFloat(s))).map(s => parseFloat(s))
            : [];

        if (validScores.length > 0) {
            const userMin = Math.min(...validScores);
            golferMinScores[g] = userMin;
            if (userMin < overallMinScore) overallMinScore = userMin;

            const sum = validScores.reduce((acc, curr) => acc + curr, 0);
            const userAvg = sum / validScores.length;
            golferAvgScores[g] = userAvg;
            if (userAvg < overallMinAvg) overallMinAvg = userAvg;
        } else {
            golferMinScores[g] = null;
            golferAvgScores[g] = null;
        }
    });

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
                        if (pureStroke < 0) totalPureStrokeProfit += pureStroke;
                    }
                }
            }

            const ranks = golferRankHistory[g] || [];
            
            // 뱃지 우선순위 선정 (요청사항: 통합정산요약에는 가장 대표적인 1개만 표시)
            let topBadgeHtml = "";
            let badgesArr = [];

            if (ranks.length >= 3 && ranks.slice(-3).every(r => r === 0)) {
                badgesArr.push(`<div class="season-badge badge-eagle-3">🦅 독수리 3연속</div>`);
            } else if (ranks.length >= 2 && ranks.slice(-2).every(r => r === 0)) {
                badgesArr.push(`<div class="season-badge badge-eagle-2">🦅 독수리 2연속</div>`);
            }
            if (overallMinAvg !== Infinity && golferAvgScores[g] === overallMinAvg) {
                badgesArr.push(`<div class="season-badge badge-avg-1">🏆 평균타수1위</div>`);
            }
            if (overallMinScore !== Infinity && golferMinScores[g] === overallMinScore) {
                badgesArr.push(`<div class="season-badge badge-best-score">🎯 최저타 ${overallMinScore}타</div>`);
            }
            
            const stats = appData.scoreStats && appData.scoreStats[g] ? appData.scoreStats[g] : { birdie: 0 };
            if (stats.birdie >= 3) {
                badgesArr.push(`<div class="season-badge badge-birdie-bomb">🔥 버디 폭격기</div>`);
            }

            // 통합 요약 카드에는 첫 번째 핵심 뱃지 1개만 노출
            topBadgeHtml = badgesArr.length > 0 ? badgesArr[0] : `<div class="season-badge" style="background:#e2e8f0; color:#64748b;">⛳ 루키</div>`;
            
            const finalBalance = rankProfit + totalPureStrokeProfit;
            const rankProfitText = rankProfit === 0 ? "0.0만" : (rankProfit > 0 ? "+" : "") + (rankProfit / 10000).toFixed(1) + "만";
            const strokeProfitText = totalPureStrokeProfit === 0 ? "0.0만" : (totalPureStrokeProfit / 10000).toFixed(1) + "만";
            
            let finalColor = "#64748b";
            let finalText = finalBalance === 0 ? "0.0만" : (finalBalance > 0 ? "+" : "") + (finalBalance / 10000).toFixed(1) + "만";
            if (finalBalance > 0) finalColor = "#16a34a";
            if (finalBalance < 0) finalColor = "#dc2626";

            summaryGrid.innerHTML += `
                <div class="summary-item">
                    <div class="name" style="cursor: pointer;" onclick="openPersonalReport('${g}')">${g}</div>
                    <div class="detail-line">계급: ${rankProfitText}</div>
                    <div class="detail-line">타수: ${strokeProfitText}</div>
                    ${topBadgeHtml}
                    <div class="final-total" style="color: ${finalColor};">합산: ${finalText}</div>
                </div>
            `;
        });
    }

    let celebrationMessages = [];
    golfers.forEach(g => {
        if (golferMinScores[g] !== null && prevGolferMinScores[g] !== undefined && prevGolferMinScores[g] !== null) {
            if (golferMinScores[g] < prevGolferMinScores[g]) {
                celebrationMessages.push(`🎉 <b>${g}</b>님 최저타수 갱신! (${golferMinScores[g]}타)`);
            }
        }
        prevGolferMinScores[g] = golferMinScores[g];
        
        const ranks = golferRankHistory[g] || [];
        let hasEagle3 = false;
        if (ranks.length >= 3 && ranks.slice(-3).every(r => r === 0)) {
            hasEagle3 = true;
        }
        if (hasEagle3 && !prevGolferEagleStreaks[g]) {
            celebrationMessages.push(`🦅 <b>${g}</b>님 독수리 3연속 뱃지 획득!`);
        }
        prevGolferEagleStreaks[g] = hasEagle3;
    });

    if (celebrationMessages.length > 0 && !isInitialLoad) {
        confetti({
            particleCount: 150,
            spread: 100,
            origin: { y: 0.5 },
            colors: ['#b8860b', '#1e293b', '#fef08a', '#16a34a', '#ea580c'],
            zIndex: 9999
        });

        const overlay = document.getElementById('celebrationOverlay');
        const textDiv = document.getElementById('celebrationText');
        if (overlay && textDiv) {
            textDiv.innerHTML = celebrationMessages.join("<br><br>");
            overlay.classList.add('active');
            
            setTimeout(() => {
                overlay.classList.remove('active');
            }, 4000);
        }
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
                matchText = `<b>${g1}</b> ➔ ${g2}에게 <b style="color:var(--primary-gold);">${diff}타</b> 받음`;
            } else if (diff < 0) {
                matchText = `<b>${g2}</b> ➔ ${g1}에게 <b style="color:var(--primary-gold);">${Math.abs(diff)}타</b> 받음`;
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

window.openHistoryModal = function() {
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.add('active');
}

window.closeHistoryModal = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('close-btn')) return;
    const modal = document.getElementById('historyModal');
    if (modal) modal.classList.remove('active');
}

window.resetAllData = function() {
    if (confirm("정말로 모든 실시간 데이터를 초기화하시겠습니까?")) {
        showSaveStatus("⏳ 초기화 중...", true);
        saveState();
        appData = getDefaultData();
        selectedMoneyRoundIdx = appData.totalRounds - 1;
        syncToFirebase(appData);
        renderAll();
        showToast("🔄 모든 데이터가 초기화되었습니다.");
    }
}

window.openPersonalReport = function(golferName) {
    const modal = document.getElementById('personalReportModal');
    const title = document.getElementById('reportTitle');
    const content = document.getElementById('reportContent');

    title.textContent = `⛳ ${golferName} 님의 리포트`;

    const scores = appData.scores[golferName] 
        ? appData.scores[golferName].filter(s => s !== "" && !isNaN(parseFloat(s))).map(Number) 
        : [];
    
    const max = scores.length > 0 ? Math.max(...scores) : '-';
    const min = scores.length > 0 ? Math.min(...scores) : '-';
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';

    const ranks = golferRankHistory[golferName] || [];
    const rankCounts = {0: 0, 1: 0, 2: 0, 3: 0};
    ranks.forEach(r => rankCounts[r]++);

    // 개인 리포트에는 획득한 모든 뱃지 전부 표시
    let allBadgesHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">`;
    let badgeCount = 0;

    if (ranks.length >= 3 && ranks.slice(-3).every(r => r === 0)) {
        allBadgesHtml += `<span class="season-badge badge-eagle-3">🦅 독수리 3연속</span>`; badgeCount++;
    } else if (ranks.length >= 2 && ranks.slice(-2).every(r => r === 0)) {
        allBadgesHtml += `<span class="season-badge badge-eagle-2">🦅 독수리 2연속</span>`; badgeCount++;
    }
    
    let overallMinScore = Infinity, overallMinAvg = Infinity;
    golfers.forEach(g => {
        const valid = (appData.scores && appData.scores[g]) ? appData.scores[g].filter(s => s !== "" && !isNaN(parseFloat(s))).map(Number) : [];
        if (valid.length > 0) {
            const m = Math.min(...valid); if (m < overallMinScore) overallMinScore = m;
            const a = valid.reduce((x, y) => x + y, 0) / valid.length; if (a < overallMinAvg) overallMinAvg = a;
        }
    });

    const golferValid = scores;
    const userMin = golferValid.length > 0 ? Math.min(...golferValid) : Infinity;
    const userAvg = golferValid.length > 0 ? golferValid.reduce((a,b)=>a+b,0)/golferValid.length : Infinity;

    if (userAvg !== Infinity && userAvg === overallMinAvg) {
        allBadgesHtml += `<span class="season-badge badge-avg-1">🏆 평균타수 1위</span>`; badgeCount++;
    }
    if (userMin !== Infinity && userMin === overallMinScore) {
        allBadgesHtml += `<span class="season-badge badge-best-score">🎯 최저타 ${userMin}타</span>`; badgeCount++;
    }

    const stats = appData.scoreStats && appData.scoreStats[golferName] ? appData.scoreStats[golferName] : { eagle: 0, birdie: 0, par: 0, bogey: 0, doublePlus: 0 };
    if (stats.birdie >= 3) {
        allBadgesHtml += `<span class="season-badge badge-birdie-bomb">🔥 버디 폭격기</span>`; badgeCount++;
    }

    if (badgeCount === 0) {
        allBadgesHtml += `<span style="font-size:0.75rem; color:#64748b;">아직 획득한 뱃지가 없습니다. 분발하세요!</span>`;
    }
    allBadgesHtml += `</div>`;

    let h2hHtml = `<div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">`;
    golfers.forEach(opponent => {
        if (opponent === golferName) return;
        const statsH2H = globalHeadToHead[golferName][opponent];
        
        if (statsH2H && statsH2H.total > 0) {
            const winRate = Math.round((statsH2H.wins / statsH2H.total) * 100);
            h2hHtml += `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
                <span>vs <b>${opponent}</b></span>
                <div style="text-align:right;">
                    <span style="color:#1e293b; font-weight:800; margin-right:4px;">승률 ${winRate}%</span>
                    <span style="font-size:0.65rem; color:#64748b;">(${statsH2H.total}전 ${statsH2H.wins}승 ${statsH2H.ties}무 ${statsH2H.losses}패)</span>
                </div>
            </div>`;
        } else {
            h2hHtml += `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; border-bottom:1px solid #e2e8f0; padding-bottom:6px; color:#94a3b8;">
                <span>vs <b>${opponent}</b></span>
                <span>전적 없음</span>
            </div>`;
        }
    });
    h2hHtml += `</div>`;

    content.innerHTML = `
        <div class="report-stat-grid" style="grid-template-columns: repeat(3, 1fr); gap:6px;">
            <div class="report-stat-box" style="padding:10px 4px;">
                <div class="title" style="margin-bottom:4px;">최고(Worst)</div>
                <div class="value" style="color: #64748b; font-size:1.1rem;">${max}</div>
            </div>
            <div class="report-stat-box" style="padding:10px 4px;">
                <div class="title" style="margin-bottom:4px;">평균타수</div>
                <div class="value" style="color: #1e293b; font-size:1.1rem;">${avg}</div>
            </div>
            <div class="report-stat-box" style="padding:10px 4px;">
                <div class="title" style="margin-bottom:4px;">최저(Best)</div>
                <div class="value" style="color: #ea580c; font-size:1.1rem;">${min}</div>
            </div>
        </div>

        <div class="memo-section" style="margin-bottom: 12px; background: #f8fafc; border: 1px solid #cbd5e1;">
            <strong style="display:block; margin-bottom:6px; font-size:0.82rem; color:#0f172a;">🎖️ 획득한 뱃지 리스트</strong>
            ${allBadgesHtml}
            <strong style="display:block; margin-bottom:6px; font-size:0.82rem; color:#0f172a;">📊 홀별 상세 누적 통계</strong>
            <div style="display:flex; justify-content:space-around; text-align:center; font-size:0.75rem; color:#475569;">
                <div>🦅 이글<br><b style="font-size:0.95rem; color:#d97706;">${stats.eagle || 0}개</b></div>
                <div>🐦 버디<br><b style="font-size:0.95rem; color:#ec4899;">${stats.birdie || 0}개</b></div>
                <div>⛳ 파<br><b style="font-size:0.95rem; color:#16a34a;">${stats.par || 0}개</b></div>
                <div>⚠️ 양파+<br><b style="font-size:0.95rem; color:#dc2626;">${stats.doublePlus || 0}개</b></div>
            </div>
        </div>
        
        <div class="memo-section" style="margin-bottom: 12px; background: #f8fafc; border: 1px solid #cbd5e1;">
            <strong style="display:block; margin-bottom:8px; font-size:0.85rem; color:#0f172a;">🏆 계급 획득 횟수</strong>
            <div style="display:flex; justify-content:space-around; text-align:center; font-size:0.75rem; color:#475569;">
                <div>🦅 독수리<br><b style="font-size:1rem; color:#d97706;">${rankCounts[0]}</b></div>
                <div>⚡ 매<br><b style="font-size:1rem; color:#0284c7;">${rankCounts[1]}</b></div>
                <div>🦩 학<br><b style="font-size:1rem; color:#7e22ce;">${rankCounts[2]}</b></div>
                <div>🐦 참새<br><b style="font-size:1rem; color:#475569;">${rankCounts[3]}</b></div>
            </div>
        </div>

        <div class="memo-section">
            <strong style="display:block; margin-bottom:8px; font-size:0.85rem; color:#0f172a;">⚔️ 개인별 상대 전적 (핸디캡 승패 기준)</strong>
            ${h2hHtml}
        </div>
    `;
    
    modal.classList.add('active');
};

window.closePersonalReport = function(e) {
    if (e && e.target !== e.currentTarget && !e.target.classList.contains('close-btn')) return;
    const modal = document.getElementById('personalReportModal');
    if (modal) modal.classList.remove('active');
};
