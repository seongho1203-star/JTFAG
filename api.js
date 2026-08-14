// api.js - 데이터베이스 및 전역 상태 관리
const SUPABASE_URL = 'https://xhulylksiexhtifyrokp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhodWx5bGtzaWV4aHRpZnlyb2twIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwODM0MTIsImV4cCI6MjEwMTY1OTQxMn0.gm2uMhOopFg1ZkAiFL-E_ZUB6jGi0Pwyj6fSvAuSmPg';
const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window._supabase = _supabase;
window.SUPABASE_TABLE = 'jtfag_league';

const ADMIN_PASSWORD = "1234"; 
let isFundUnlocked = false;    

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
const DEFAULT_NOTIFY_SETTINGS = {
    daysBefore: 2,
    title: '⛳ {남은일수}일 뒤 라운드입니다',
    body: '{일정}'
};

// 라운드 사진은 Storage 버킷에 올리고 payload에는 공개 URL만 저장한다.
// (예전에 등록된 사진은 payload 안에 base64로 들어 있어, 두 형태가 함께 존재할 수 있다)
const PHOTO_BUCKET = 'round-photos';
const MAX_PHOTOS_PER_ROUND = 30;

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
let golferMaxBirdie = [];
let golferMaxPar = [];
let golferMaxDoublePar = [];
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
