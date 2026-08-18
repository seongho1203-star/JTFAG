// api.js - 데이터베이스 및 전역 상태 관리
const SUPABASE_URL = 'https://xhulylksiexhtifyrokp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodWx5bGtzaWV4aHRpZnlyb2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwODM0MTIsImV4cCI6MjEwMTY1OTQxMn0.gm2uMhOopFg1ZkAiFL-E_ZUB6jGi0Pwyj6fSvAuSmPg';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window._supabase = _supabase;
window.SUPABASE_TABLE = 'jtfag_league';

const ADMIN_PASSWORD = "1234";
let isFundUnlocked = false;
// 타수 칸은 기본이 잠김이다. 홀 기록(stats.js)에서 자동으로 채워지므로 손댈 일이 없고,
// 홀 기록이 없는 차수만 관리자가 잠시 열어 직접 넣을 수 있다.
let isScoreUnlocked = false;

const golfers = ["이관교", "김지명", "신성호", "박승수"];

// 🔥 독수리 이미지 최신 버전(IMG_8343)으로 교체 완료 🔥
const RANK_CONFIG = {
    0: { name: "독수리", icon: `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8343.png" style="height: 1.1em; vertical-align: middle;">`, penalty: 0, class: "rank-eagle" },
    1: { name: "매", icon: `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8331.png" style="height: 1.1em; vertical-align: middle;">`, penalty: -40000, class: "rank-hawk" },
    2: { name: "학", icon: `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8333.png" style="height: 1.1em; vertical-align: middle;">`, penalty: -60000, class: "rank-crane" },
    3: { name: "참새", icon: `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8335.png" style="height: 1.1em; vertical-align: middle;">`, penalty: -100000, class: "rank-sparrow" }
};

const COURSE_GEO = {
    "함평엘리체": { lat: 35.109, lon: 126.545 },
    "어등산": { lat: 35.158, lon: 126.757 },
    "해피니스": { lat: 35.012, lon: 126.963 },
    "골드레이크": { lat: 35.025, lon: 126.772 },
    "푸른솔": { lat: 35.275, lon: 126.652 }
};

// ─── 푸시 알림 ───
// 발송은 GitHub Actions가 매일 한 번 돌면서 처리한다 (.github/workflows/round-reminder.yml).
// 여기서는 브라우저 구독 정보를 push_subscriptions 테이블에 등록/해지만 한다.
const VAPID_PUBLIC_KEY = 'BB74vxit3DwG4BhbEbDICkkUCa0WgYX23D2TShNh0aZcqD67n3zYFW4pVFQtyN4DYUW08wypS0upbDMIQ2MrAbA';
const PUSH_TABLE = 'push_subscriptions';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('sw.js'); }
    catch (err) { console.error("서비스워커 등록 실패:", err); return null; }
}

async function getPushSubscription() {
    if (!pushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
}

// 구독을 만들고 Supabase에 저장한다. endpoint가 기본키라 같은 기기는 덮어쓴다.
async function subscribeToPush(userName) {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    const json = sub.toJSON();
    const { error } = await window._supabase.from(PUSH_TABLE).upsert({
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        name: userName || null
    }, { onConflict: 'endpoint' });

    // 서버에 못 남겼으면 브라우저 구독도 되돌린다. 안 그러면 버튼은 켜진 것처럼 보이는데
    // 발송 목록에는 없는 상태가 된다.
    if (error) {
        try { await sub.unsubscribe(); } catch (e) { /* 되돌리기 실패는 무시 */ }
        const detail = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' / ');
        throw new Error(detail || '알 수 없는 오류');
    }
    return sub;
}

// 지금 알림을 받고 있는 기기 목록. 한 사람이 폰·PC를 따로 구독했을 수 있어
// 사람 수가 아니라 기기 수로 나온다.
async function listPushSubscriptions() {
    const { data, error } = await window._supabase.from(PUSH_TABLE).select('*');
    if (error) throw new Error(error.message || '구독 목록을 불러오지 못했습니다.');
    return data || [];
}

// 목록에서 기기 하나를 지운다. 이 기기를 지울 때는 unsubscribeFromPush를 쓴다 —
// 브라우저 구독까지 함께 끊어야 알림 버튼이 켜진 채로 남지 않는다.
async function deletePushSubscription(endpoint) {
    const { error } = await window._supabase.from(PUSH_TABLE).delete().eq('endpoint', endpoint);
    if (error) throw new Error(error.message || '삭제하지 못했습니다.');
}

// endpoint 주소로 어느 브라우저인지 짐작한다. 정확한 기기명은 알 수 없다.
function pushEndpointLabel(endpoint) {
    const url = String(endpoint || '');
    if (url.includes('push.apple.com')) return '아이폰 · 아이패드 (홈 화면 앱)';
    if (url.includes('fcm.googleapis.com') || url.includes('android')) return '크롬 · 안드로이드';
    if (url.includes('mozilla')) return '파이어폭스';
    if (url.includes('windows.com') || url.includes('notify.windows')) return '윈도우 · 엣지';
    return '기타 브라우저';
}

async function unsubscribeFromPush() {
    const sub = await getPushSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const { error } = await window._supabase.from(PUSH_TABLE).delete().eq('endpoint', endpoint);
    if (error) console.error("구독 해지 기록 실패:", error);
}

// 알림 문구·시점 기본값. 관리자 메뉴에서 바꾸면 payload.notifySettings에 저장되고,
// 발송 스크립트(scripts/send-reminder.js)가 같은 기본값으로 대체한다.
// daysBefore는 배열이다 — [3, 0]이면 3일 전과 당일, 두 번 간다. 0이 당일이다.
// 예전 payload에는 숫자 하나(2)로 들어 있어, normalizeDaysBefore가 양쪽을 다 받는다.
const DEFAULT_NOTIFY_SETTINGS = {
    daysBefore: [2],
    title: '⛳ {디데이} 라운드입니다',
    body: '{일정}'
};

const NOTIFY_DAY_CHOICES = [0, 1, 2, 3, 5, 7];
const MAX_NOTIFY_DAYS = 4;

// 숫자 하나든 배열이든 받아서, 중복 없이 먼 날 → 가까운 날 순으로 돌려준다.
function normalizeDaysBefore(value) {
    const list = Array.isArray(value) ? value : [value];
    const out = [];
    list.forEach(function (x) {
        const n = parseInt(x, 10);
        if (Number.isFinite(n) && n >= 0 && n <= 30 && out.indexOf(n) === -1) out.push(n);
    });
    return out.sort(function (a, b) { return b - a; });
}

// {디데이} 자리표시자. 당일에 "0일 뒤"라고 나가는 걸 막으려고 둔 것이다.
function ddayLabel(days) {
    return days === 0 ? '오늘' : `${days}일 뒤`;
}

// 라운드 사진은 Storage 버킷에 올리고 payload에는 공개 URL만 저장한다.
// (예전에 등록된 사진은 payload 안에 base64로 들어 있어, 두 형태가 함께 존재할 수 있다)
const PHOTO_BUCKET = 'round-photos';
const MAX_PHOTOS_PER_ROUND = 30;

// 스코어카드 판독 요청 (📋 스코어 등록)
// 이 이름으로 접속한 기기에서만 버튼이 보인다. 로그인이 없어 보안 경계는 아니고,
// 다른 사람이 실수로 누르는 걸 막는 장치다 (관리자 비밀번호도 함께 물어본다).
const SCORE_OWNER = "신성호";
// payload에 남겨 두는 요청 개수. 오래된 것부터 지운다.
const MAX_SCORE_REQUESTS = 10;
// 판독용 사진은 갤러리 사진(800px/0.6)보다 크고 선명해야 숫자가 읽힌다.
const SCORECARD_MAX_PX = 1600;
const SCORECARD_QUALITY = 0.85;

function storagePathFromUrl(src) {
    const marker = '/object/public/' + PHOTO_BUCKET + '/';
    const idx = String(src).indexOf(marker);
    return idx === -1 ? null : decodeURIComponent(String(src).slice(idx + marker.length));
}

async function uploadPhotoBlob(blob, roundIdx) {
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `round${roundIdx + 1}/${Date.now()}_${rand}.jpg`;
    const { error } = await window._supabase.storage.from(PHOTO_BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return window._supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

// 사진을 지울 때 Storage 파일도 함께 정리한다. 실패해도 앱 동작은 막지 않는다.
async function deletePhotoFromStorage(src) {
    const path = storagePathFromUrl(src);
    if (!path) return;
    const { error } = await window._supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (error) console.error("Storage 삭제 실패:", error);
}

function getDefaultData() {
    return {
        nextRoundDate: "", clubFund: 0, noticeMemo: "", totalRounds: 4,
        notifySettings: { ...DEFAULT_NOTIFY_SETTINGS },
        courses: ["함평엘리체", "함평엘리체", "어등산", "해피니스"],
        scores: { "이관교": [90, 83, 97, 92], "김지명": [87, 87, 86, 86], "신성호": [88, 85, 85, 93], "박승수": [96, 96, 88, 90] },
        roundMoney: [
            { "이관교": { start: 0, end: 0 }, "김지명": { start: 0, end: 0 }, "신성호": { start: 0, end: 0 }, "박승수": { start: 0, end: 0 } },
            { "이관교": { start: 0, end: 0 }, "김지명": { start: 0, end: 0 }, "신성호": { start: 0, end: 0 }, "박승수": { start: 0, end: 0 } },
            { "이관교": { start: 0, end: 0 }, "김지명": { start: 0, end: 0 }, "신성호": { start: 0, end: 0 }, "박승수": { start: 0, end: 0 } },
            { "이관교": { start: 530000, end: 450000 }, "김지명": { start: 100000, end: 135000 }, "신성호": { start: 230000, end: 92000 }, "박승수": { start: 356000, end: 340000 } }
        ],
        roundPhotos: [[], [], [], []],
        scoreRequests: []
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
let golferMaxBirdie = [];
let golferMaxPar = [];
let golferMaxDoublePar = [];
// 파 종류별 강자. { 3: ["이관교"], 4: [...], 5: [...] } — 동률이면 함께 들어간다.
let golferParSpecialists = { 3: [], 4: [], 5: [] };
// 표본이 이보다 적은 파 종류는 우연에 휘둘려 판정하지 않는다 (차수 2개쯤이면 넘는다).
const MIN_PAR_TYPE_HOLES = 6;
let golferFinalNetProfitMap = {}; 
let isLoaded = false;
let golferAvgScores = {};
let golferMinScores = {};

function saveState() {
    if (historyStack.length >= 10) historyStack.shift();
    historyStack.push(JSON.stringify(appData));
}

async function fetchFromSupabase() {
    try {
        const { data, error } = await window._supabase.from(window.SUPABASE_TABLE).select('*').eq('id', 1).single();
        if (error || !data) {
            await syncToSupabase(getDefaultData());
            appData = getDefaultData();
        } else {
            appData = data.payload;
            if (!appData.roundMoney) appData.roundMoney = getDefaultData().roundMoney;
            if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
        }
        if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
        applyHoleScores();   // 홀 기록이 있는 차수의 타수를 채워 넣는다
        isLoaded = true;
        renderNoticeArea();
        renderAll();
        showSaveStatus("⚡ Supabase 연결 완료");
    } catch (err) {
        console.error("Load Error:", err);
        showSaveStatus("⚠️ DB 연결 확인 필요");
    }
}

async function syncToSupabase(dataToSave) {
    try {
        const payloadData = { id: 1, payload: dataToSave };
        const { error } = await window._supabase.from(window.SUPABASE_TABLE).upsert(payloadData);
        if (error) { console.error("Save Error:", error); showSaveStatus("⚠️ 저장 실패"); } 
        else { showSaveStatus("⚡ 동기화 완료"); }
    } catch (err) { console.error("Sync Exception:", err); }
}

async function checkWeather(text) {
    const widget = document.getElementById('weatherWidget');
    const weatherText = document.getElementById('weatherText');
    let targetCourse = null;
    for (let course in COURSE_GEO) { if (text && text.includes(course)) { targetCourse = course; break; } }

    if (targetCourse) {
        widget.style.display = 'flex'; weatherText.textContent = `${targetCourse} 날씨 확인중...`;
        try {
            const geo = COURSE_GEO[targetCourse];
            const dateMatch = text.match(/(\d{1,2})[월/]\s*(\d{1,2})[일]?/);
            let targetDateStr = null;
            if (dateMatch) {
                const year = new Date().getFullYear();
                targetDateStr = `${year}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`;
            }
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul&forecast_days=16`;
            const res = await fetch(url); const data = await res.json();
            
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
                const info = getWeatherInfo(data.daily.weathercode[idx]);
                weatherText.innerHTML = `<b>${targetCourse} (${dateMatch[1]}/${dateMatch[2]})</b> 일일예보: ${info.i} ${info.d}, ${data.daily.temperature_2m_min[idx]}°~${data.daily.temperature_2m_max[idx]}°`;
            } else if (data.current_weather) {
                const info = getWeatherInfo(data.current_weather.weathercode);
                weatherText.innerHTML = `<b>${targetCourse}</b> 실시간: ${info.i} ${info.d}, ${data.current_weather.temperature}°C`;
            }
        } catch(e) { weatherText.textContent = "날씨 정보를 불러오지 못했습니다."; }
    } else { widget.style.display = 'none'; }
}
