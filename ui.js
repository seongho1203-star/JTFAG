// ui.js - 화면 렌더링 및 사용자 이벤트 처리

const SOUND_CONFIG = {
    0: "https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/sign/Sound/Eagle.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kYTIzZmVlMC04YTM4LTQ2NDYtYTVlNy0yZThhNjU4NTlmZWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJTb3VuZC9FYWdsZS5tcDMiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg2NTM2ODY5LCJleHAiOjE4MTgwNzI4Njl9.W7A8HA7pleL5xtO1-TE-R8PiyuP8vNFV5wm0KTYnx08"
};

function parseNumber(val) { if (!val) return 0; const cleaned = String(val).replace(/[^0-9.-]/g, ''); return parseFloat(cleaned) || 0; }
function formatNumber(num) { if (num === null || num === undefined || isNaN(num) || num === 0) return "0"; return num.toLocaleString('ko-KR'); }
function formatFundString(num) { if (num === null || num === undefined || isNaN(num) || num === 0) return "0원"; return num.toLocaleString('ko-KR') + "원"; }

window.addEventListener('DOMContentLoaded', () => {
    renderSkeleton();
    fetchFromSupabase();
    window._supabase.channel('public:jtfag_league').on('postgres_changes', { event: '*', schema: 'public', table: window.SUPABASE_TABLE }, payload => {
        if (payload.new && payload.new.payload) {
            appData = payload.new.payload;
            if (!appData.roundMoney) appData.roundMoney = getDefaultData().roundMoney;
            if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
            if (!appData.fundLogs) appData.fundLogs = [];
            if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
            renderNoticeArea(); renderAll(); showSaveStatus("⚡ 실시간 업데이트됨");
            if (document.getElementById('roundPhotoModal').classList.contains('active')) renderRoundPhotos();
        }
    }).subscribe();

    initScheduleOptions();
    registerServiceWorker().then(() => updateAlarmUI());
    setTimeout(renderInstallBanner, 2500);   // iOS는 이벤트가 없으므로 직접 띄운다

    const fundLogModal = document.createElement('div');
    fundLogModal.id = 'fundLogModal';
    fundLogModal.className = 'modal-overlay';
    fundLogModal.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:9999; display:flex; justify-content:center; align-items:center; opacity:0; pointer-events:none; transition:opacity 0.3s;";
    fundLogModal.innerHTML = `
        <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; width:85%; max-width:320px; max-height:70vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.5); transform:scale(0.9); transition:transform 0.3s;">
            <h3 style="margin-top:0; margin-bottom:15px; color:#d4af37; font-size:1rem; text-align:center;">📜 공금 수정 로그</h3>
            <div id="fundLogContent" style="font-size:0.8rem; color:#94a3b8; text-align:left; margin-bottom:20px;"></div>
            <button type="button" onclick="closeFundLogModal()" style="width:100%; padding:10px; background:#334155; border:none; border-radius:6px; color:#fff; font-weight:700; cursor:pointer;">닫기</button>
        </div>
    `;
    document.body.appendChild(fundLogModal);
    
    window.openFundLogModal = () => {
        const content = document.getElementById('fundLogContent');
        if (!appData.fundLogs || appData.fundLogs.length === 0) {
            content.innerHTML = "<div style='text-align:center; padding:20px;'>기록된 수정 내역이 없습니다.</div>";
        } else {
            content.innerHTML = appData.fundLogs.slice().reverse().map(log => 
                `<div style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size:0.75rem; color:#64748b; margin-bottom:4px;">${log.time} - <span style="color:#fef08a; font-weight:700;">${log.name}</span> 변경</div>
                    <div style="color:#e2e8f0; font-size:0.85rem;">${formatNumber(log.before)}원 ➔ <b style="color:#16a34a;">${formatNumber(log.after)}원</b></div>
                 </div>`
            ).join('');
        }
        fundLogModal.style.opacity = "1";
        fundLogModal.style.pointerEvents = "auto";
        fundLogModal.querySelector('div').style.transform = "scale(1)";
    };
    
    window.closeFundLogModal = () => {
        fundLogModal.style.opacity = "0";
        fundLogModal.style.pointerEvents = "none";
        fundLogModal.querySelector('div').style.transform = "scale(0.9)";
    };

});

function showPasswordPrompt(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        
        const box = document.createElement('div');
        box.style.cssText = "background:#1e293b; border:1px solid #d4af37; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.6); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#f8fafc; font-size:0.9rem; margin-bottom:15px; font-weight:700; word-break:keep-all; line-height:1.4;";
        
        const inputEl = document.createElement('input');
        inputEl.type = "password";      
        inputEl.inputMode = "numeric";  
        inputEl.pattern = "[0-9]*";
        inputEl.style.cssText = "width:100%; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#fef08a; font-size:1.2rem; text-align:center; margin-bottom:15px; letter-spacing:6px; box-sizing:border-box; outline:none;";
        
        const btnRow = document.createElement('div');
        btnRow.style.cssText = "display:flex; gap:8px;";
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer;";
        
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = "확인";
        confirmBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#d4af37; color:#0f172a; font-size:0.85rem; font-weight:800; cursor:pointer;";
        
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        
        box.appendChild(msgEl);
        box.appendChild(inputEl);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1)";
            inputEl.focus();
        }, 10);
        
        function cleanup(value) {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(value); }, 200);
        }
        
        cancelBtn.onclick = () => cleanup(null);
        confirmBtn.onclick = () => cleanup(inputEl.value);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') cleanup(inputEl.value);
        });
    });
}

function showNameSelectionPrompt(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        
        const box = document.createElement('div');
        box.style.cssText = "background:#1e293b; border:1px solid #d4af37; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.8); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#f8fafc; font-size:0.95rem; margin-bottom:15px; font-weight:800; word-break:keep-all; line-height:1.4;";
        
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = "display:flex; flex-direction:column; gap:8px; margin-bottom:15px;";
        
        box.appendChild(msgEl);
        box.appendChild(btnContainer);

        function cleanup(value) {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(value); }, 200);
        }

        golfers.forEach(name => {
            const btn = document.createElement('button');
            btn.textContent = name;
            btn.style.cssText = "width:100%; padding:10px; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#fef08a; font-size:0.95rem; font-weight:700; cursor:pointer; transition:background 0.2s;";
            btn.onclick = () => cleanup(name);
            btnContainer.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "다음에 하기";
        cancelBtn.style.cssText = "width:100%; padding:10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer;";
        cancelBtn.onclick = () => cleanup(null);
        
        box.appendChild(cancelBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1)";
        }, 10);
    });
}

// confirmLabel / accent를 주면 확인 버튼의 문구와 색이 바뀐다. 없으면 삭제용(빨강).
function showConfirmPrompt(message, confirmLabel, accent) {
    const color = accent || "#ef4444";
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";

        const box = document.createElement('div');
        box.style.cssText = `background:#1e293b; border:1px solid ${color}; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.6); transform:scale(0.9); transition:transform 0.2s; text-align:center;`;
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#f8fafc; font-size:0.9rem; margin-bottom:15px; font-weight:700; word-break:keep-all; line-height:1.5;";
        
        const btnRow = document.createElement('div');
        btnRow.style.cssText = "display:flex; gap:8px;";
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer;";
        
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = confirmLabel || "삭제";
        confirmBtn.style.cssText = `flex:1; padding:10px; border-radius:6px; border:none; background:${color}; color:#fff; font-size:0.85rem; font-weight:800; cursor:pointer;`;
        
        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(confirmBtn);
        
        box.appendChild(msgEl);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        
        setTimeout(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1)";
        }, 10);
        
        function cleanup(value) {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(value); }, 200);
        }
        
        cancelBtn.onclick = () => cleanup(false);
        confirmBtn.onclick = () => cleanup(true);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
}

async function authenticateAdmin() {
    if (isFundUnlocked) return true;
    const correctPwd = appData.adminPassword || (typeof ADMIN_PASSWORD !== 'undefined' ? ADMIN_PASSWORD : "1234");
    const pwd = await showPasswordPrompt("🔒 시스템 관리 비밀번호를<br>입력해주세요");
    
    if (pwd === null) return false; 
    if (pwd === correctPwd) { 
        isFundUnlocked = true; 
        updateLockUI(); 
        showToast("🔓 관리자 권한이 활성화되었습니다."); 
        return true; 
    } else { 
        showToast("⚠️ 비밀번호가 일치하지 않습니다."); 
        return false; 
    }
}

async function changeAdminPassword() {
    const correctPwd = appData.adminPassword || (typeof ADMIN_PASSWORD !== 'undefined' ? ADMIN_PASSWORD : "1234");
    const oldPwd = await showPasswordPrompt("현재 사용 중인<br>비밀번호를 입력해주세요");
    
    if (oldPwd === null) return;
    if (oldPwd === correctPwd) {
        const newPwd = await showPasswordPrompt("새로운 비밀번호를 입력해주세요<br><span style='font-size:0.75rem; font-weight:400; color:#94a3b8;'>(이 비번으로 모두가 시스템을 관리합니다)</span>");
        if (newPwd !== null && newPwd.trim() !== "") {
            saveState();
            appData.adminPassword = newPwd.trim();
            syncToSupabase(appData);
            showToast("🔑 비밀번호가 성공적으로 변경되었습니다.");
        } else if (newPwd !== null) {
            showToast("⚠️ 비밀번호는 공백일 수 없습니다.");
        }
    } else {
        showToast("⚠️ 현재 비밀번호가 일치하지 않습니다.");
    }
}


// 숫자 입력을 받는 공용 창. 취소하면 null을 반환한다.
function showInputPrompt(message, initial) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        const box = document.createElement('div');
        box.style.cssText = "background:#1e293b; border:1px solid #d4af37; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.6); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#f8fafc; font-size:0.9rem; margin-bottom:12px; font-weight:800; word-break:keep-all;";
        const input = document.createElement('input');
        input.type = "text"; input.inputMode = "numeric"; input.value = (initial === undefined || initial === null) ? "" : initial;
        input.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #475569; background:#0f172a; color:#fff; font-size:1rem; font-weight:800; text-align:center; outline:none; margin-bottom:12px; font-family:inherit;";
        const row = document.createElement('div'); row.style.cssText = "display:flex; gap:8px;";
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer; font-family:inherit;";
        const okBtn = document.createElement('button');
        okBtn.textContent = "저장";
        okBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#d4af37; color:#1e293b; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit;";
        row.appendChild(cancelBtn); row.appendChild(okBtn);
        box.appendChild(msgEl); box.appendChild(input); box.appendChild(row);
        overlay.appendChild(box); document.body.appendChild(overlay);
        setTimeout(() => { overlay.style.opacity = "1"; box.style.transform = "scale(1)"; input.focus(); input.select(); }, 10);

        function cleanup(value) {
            overlay.style.opacity = "0"; box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(value); }, 200);
        }
        cancelBtn.onclick = () => cleanup(null);
        okBtn.onclick = () => cleanup(input.value);
        input.onkeydown = (e) => { if (e.key === 'Enter') cleanup(input.value); };
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
    });
}

// 공금 수정. 화면의 표시칸은 손댈 수 없고 이 경로로만 바뀐다.
async function editClubFund() {
    const before = appData.clubFund || 0;
    const entered = await showInputPrompt("💰 남은 공금 잔액", before);
    if (entered === null) return;
    const after = parseNumber(entered);
    if (after === before) { showToast("변경 사항이 없습니다."); return; }

    saveState();
    if (!appData.fundLogs) appData.fundLogs = [];
    const now = new Date();
    appData.fundLogs.push({
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        name: localStorage.getItem('jtfag_my_name') || "알 수 없음",
        before: before, after: after
    });
    while (appData.fundLogs.length > 50) appData.fundLogs.shift();

    appData.clubFund = after;
    syncToSupabase(appData); renderNoticeArea(); renderAll();
    showToast(`💰 공금이 ${formatFundString(after)}으로 변경되었습니다.`);
}

// 공금은 화면에서 직접 고칠 수 없다. 관리자 메뉴의 '공금 수정'으로만 바뀐다.
function updateLockUI() {
    const fundDisplay = document.getElementById('clubFundInput');
    if (fundDisplay) fundDisplay.textContent = formatFundString(appData.clubFund);
}

function undoLastAction() {
    if (historyStack.length === 0) { showToast("⚠️ 되돌릴 이전 내역이 없습니다."); return; }
    appData = JSON.parse(historyStack.pop()); syncToSupabase(appData); showToast("↩️ 이전 상태로 되돌렸습니다."); renderAll();
}

function renderSkeleton() {
    const summaryGrid = document.getElementById('summaryGrid');
    if (summaryGrid) { summaryGrid.innerHTML = golfers.map(() => `<div class="summary-item skeleton"><div class="name">---</div><div class="detail-line">---</div><div class="detail-line">---</div><div class="final-total">---</div></div>`).join(''); }
}

let toastTimer = null;
function showToast(msg, ms) {
    const toast = document.getElementById('customToast'); if (!toast) return;
    toast.textContent = msg; toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms || 2200);
}

function showSaveStatus(msg) {
    const saveStatus = document.getElementById('saveStatus'); if (saveStatus) { saveStatus.textContent = msg; saveStatus.style.opacity = '1'; setTimeout(() => { saveStatus.style.opacity = '0.7'; }, 1200); }
}

function renderNoticeArea() {
    const dateDisplay = document.getElementById('nextRoundDisplay');
    if (dateDisplay) { dateDisplay.innerHTML = appData.nextRoundDate ? appData.nextRoundDate : `일정 등록하기`; checkWeather(appData.nextRoundDate); }
    updateLockUI();
}

function forceTableReflow() {
    const wrapper = document.getElementById('tableWrapper');
    if(wrapper) { const currentScroll = wrapper.scrollLeft; wrapper.style.overflowX = 'hidden'; void wrapper.offsetHeight; wrapper.style.overflowX = 'auto'; wrapper.scrollLeft = currentScroll; }
}

function initScheduleOptions() {
    const mSelect = document.getElementById('schMonth'), dSelect = document.getElementById('schDay'), hSelect = document.getElementById('schHour'), minSelect = document.getElementById('schMinute');
    if(mSelect) { mSelect.innerHTML = ""; for(let i=1; i<=12; i++) mSelect.add(new Option(i, i)); }
    if(dSelect) { dSelect.innerHTML = ""; for(let i=1; i<=31; i++) dSelect.add(new Option(i, i)); }
    if(hSelect) { hSelect.innerHTML = ""; for(let i=1; i<=12; i++) hSelect.add(new Option(i, i)); }
    if(minSelect) { minSelect.innerHTML = ""; for(let i=0; i<60; i++) { const minStr = i < 10 ? "0" + i : String(i); minSelect.add(new Option(minStr, minStr)); } }
}

async function fetchExternalGolfCourses() { return new Promise(resolve => { setTimeout(() => { resolve(["함평엘리체", "어등산", "해피니스", "골드레이크", "무등산", "빛고을", "푸른솔(장성)", "나주힐스", "화순", "보성", "순천", "아크로", "다산베아채", "JNJ", "파인비치", "사우스링스 영암", "직접 입력"]); }, 500); }); }

async function openScheduleModal() {
    document.getElementById('scheduleModal').classList.add('active');
    const now = new Date(); document.getElementById('schMonth').value = now.getMonth() + 1; document.getElementById('schDay').value = now.getDate();
    const courseSelect = document.getElementById('schCourseSelect'); const statusText = document.getElementById('courseLoadStatus');
    if (courseSelect.options.length <= 1) {
        statusText.textContent = "(외부 데이터 연동 중 ⏳)"; const courses = await fetchExternalGolfCourses(); courseSelect.innerHTML = "";
        courses.forEach(c => { courseSelect.add(new Option(c, c)); }); statusText.textContent = "(외부 데이터 로드 완료 ✅)";
    }
    handleCourseSelectChange(courseSelect.value);
}

function handleCourseSelectChange(val) {
    const customInput = document.getElementById('schCourseCustom');
    if (val === "직접 입력") { customInput.style.display = "block"; customInput.focus(); } else { customInput.style.display = "none"; customInput.value = ""; }
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
    const course = document.getElementById('schCourseSelect').value === "직접 입력" ? document.getElementById('schCourseCustom').value : document.getElementById('schCourseSelect').value;
    if (document.getElementById('schCourseSelect').value === "직접 입력" && course.trim() === "") { showToast("⚠️ 골프장 이름을 입력해주세요!"); document.getElementById('schCourseCustom').focus(); return; }
    saveState();
    const m = parseInt(document.getElementById('schMonth').value, 10);
    const d = parseInt(document.getElementById('schDay').value, 10);
    const ampm = document.getElementById('schAmpm').value;
    const hh = document.getElementById('schHour').value;
    const mm = document.getElementById('schMinute').value;
    appData.nextRoundDate = `${m}월 ${d}일 ${ampm} ${hh}:${mm} ${course}`;
    // 표시용 문구에는 연도가 없어 알림이 연도를 알 수 없다. 별도로 남긴다.
    appData.nextRoundISO = resolveRoundDate(m, d);
    syncToSupabase(appData); renderNoticeArea(); closeScheduleModal(); showToast("✅ 일정이 성공적으로 저장되었습니다!");
}

function renderAll() { 
    renderTable(); 
    calculateAndRender(); 
    renderMoneyTable(); 
    forceTableReflow(); 
    renderStorageUsage(); 
    checkAndGreetUser(); 
}

function renderStorageUsage() {
    const storageInfo = document.getElementById('storageInfoDisplay');
    if (!storageInfo) return;

    const jsonString = JSON.stringify(appData);
    const bytes = new Blob([jsonString]).size;
    
    const maxBytes = 5 * 1024 * 1024; 
    
    const kb = (bytes / 1024).toFixed(1);
    const mb = (bytes / (1024 * 1024)).toFixed(2);
    
    let displaySize = bytes > 1024 * 1024 ? `${mb} MB` : `${kb} KB`;
    let percent = (bytes / maxBytes) * 100;
    if (percent > 100) percent = 100;

    let statusColor = "#16a34a"; 
    let statusIcon = "🟢";
    let statusText = "원활";

    if (percent > 85) {
        statusColor = "#dc2626"; 
        statusIcon = "🔴";
        statusText = "위험 (사진 삭제 권장)";
    } else if (percent > 60) {
        statusColor = "#eab308"; 
        statusIcon = "🟡";
        statusText = "주의 (사진 누적됨)";
    }

    storageInfo.innerHTML = `
        <div class="storage-line">
            <span>💾 데이터 용량</span>
            <span style="color:${statusColor}; font-weight:800;">${statusIcon} ${displaySize} / 5.0 MB · ${statusText}</span>
        </div>
        <div class="storage-bar"><span style="width:${Math.max(percent, 1)}%; background:${statusColor};"></span></div>`;
}

function changeMoneyRound(idxVal) { selectedMoneyRoundIdx = parseInt(idxVal, 10); closeRoundPickerModal(); renderMoneyTable(); }

function openRoundPickerModal() { renderRoundPicker(); document.getElementById('roundPickerModal').classList.add('active'); }
function closeRoundPickerModal() { const m = document.getElementById('roundPickerModal'); if (m) m.classList.remove('active'); }

function renderRoundPicker() {
    const grid = document.getElementById('roundPickerGrid');
    if (!grid) return;
    let html = "";
    for (let r = 0; r < appData.totalRounds; r++) {
        const course = (appData.courses && appData.courses[r]) ? appData.courses[r] : "미정";
        const isSel = (r === selectedMoneyRoundIdx);
        html += `<button type="button" class="round-picker-item${isSel ? ' selected' : ''}" onclick="changeMoneyRound(${r})">
            <span class="rp-title">${isSel ? '✓ ' : ''}${r + 1}차전</span>
            <span class="rp-course">${course}</span>
        </button>`;
    }
    grid.innerHTML = html;
}

function renderMoneyTable() {
    const tbody = document.getElementById('moneyTbody');
    const roundBtn = document.getElementById('moneyRoundBtn');

    if (!tbody || !roundBtn) return;

    // 카드 제목이 이미 '차수별 정산'이라 버튼은 차수만 밝힌다.
    const btnLabel = `${selectedMoneyRoundIdx + 1}차전 ▾`;
    if (roundBtn.textContent !== btnLabel) roundBtn.textContent = btnLabel;

    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.roundMoney[selectedMoneyRoundIdx]) {
        appData.roundMoney[selectedMoneyRoundIdx] = {};
        golfers.forEach(g => appData.roundMoney[selectedMoneyRoundIdx][g] = { start: 0, end: 0 });
    }

    if (tbody.children.length === golfers.length && tbody.getAttribute('data-round') === String(selectedMoneyRoundIdx)) {
        golfers.forEach(g => {
            const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
            const sInput = document.getElementById(`money_start_${g}`);
            const eInput = document.getElementById(`money_end_${g}`);
            if (sInput && document.activeElement !== sInput) sInput.value = formatNumber(m.start);
            if (eInput && document.activeElement !== eInput) eInput.value = formatNumber(m.end);
            
            const rankPenalty = (cachedRoundRankProfit[g] && cachedRoundRankProfit[g][selectedMoneyRoundIdx] !== undefined) ? cachedRoundRankProfit[g][selectedMoneyRoundIdx] : 0;
            const pureStrokeDiff = (m.start === 0 && m.end === 0) ? 0 : ((m.end - m.start) - rankPenalty);
            
            const rBadge = document.getElementById(`money_rank_${g}`);
            if (rBadge) {
                rBadge.style.background = rankPenalty < 0 ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.03)";
                rBadge.style.color = rankPenalty < 0 ? "#dc2626" : "#64748b";
                rBadge.textContent = rankPenalty === 0 ? "0원" : (rankPenalty > 0 ? "+" : "") + (rankPenalty / 10000).toFixed(1) + "만";
            }
            const sBadge = document.getElementById(`money_stroke_${g}`);
            if (sBadge) {
                sBadge.style.background = pureStrokeDiff > 0 ? "rgba(22,163,74,0.08)" : (pureStrokeDiff < 0 ? "rgba(220,38,38,0.08)" : "rgba(0,0,0,0.02)");
                sBadge.style.color = pureStrokeDiff > 0 ? "#16a34a" : (pureStrokeDiff < 0 ? "#dc2626" : "#64748b");
                sBadge.textContent = pureStrokeDiff === 0 ? "0원" : (pureStrokeDiff > 0 ? "+" : "") + (pureStrokeDiff / 10000).toFixed(1) + "만";
            }
        });
        return;
    }

    tbody.setAttribute('data-round', String(selectedMoneyRoundIdx));
    tbody.innerHTML = "";
    golfers.forEach(g => {
        const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
        const rankPenalty = (cachedRoundRankProfit[g] && cachedRoundRankProfit[g][selectedMoneyRoundIdx] !== undefined) ? cachedRoundRankProfit[g][selectedMoneyRoundIdx] : 0;
        const pureStrokeDiff = (m.start === 0 && m.end === 0) ? 0 : ((m.end - m.start) - rankPenalty);

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:800; color:var(--text-main);">${g}</td>
                <td><input type="text" id="money_start_${g}" inputmode="numeric" pattern="[0-9]*" class="money-input" value="${formatNumber(m.start)}" onfocus="this.select()" onchange="updateMoney('${g}', 'start', this.value)"></td>
                <td><input type="text" id="money_end_${g}" inputmode="numeric" pattern="[0-9]*" class="money-input" value="${formatNumber(m.end)}" onfocus="this.select()" onchange="updateMoney('${g}', 'end', this.value)"></td>
                <td><span id="money_rank_${g}" class="money-result-badge" style="background:${rankPenalty < 0 ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.03)"}; color:${rankPenalty < 0 ? "#dc2626" : "#64748b"}; font-weight:900;">${rankPenalty === 0 ? "0원" : (rankPenalty > 0 ? "+" : "") + (rankPenalty / 10000).toFixed(1) + "만"}</span></td>
                <td><span id="money_stroke_${g}" class="money-result-badge" style="background:${pureStrokeDiff > 0 ? "rgba(22,163,74,0.08)" : (pureStrokeDiff < 0 ? "rgba(220,38,38,0.08)" : "rgba(0,0,0,0.02)")}; color:${pureStrokeDiff > 0 ? "#16a34a" : (pureStrokeDiff < 0 ? "#dc2626" : "#64748b")}; font-weight:800;">${pureStrokeDiff === 0 ? "0원" : (pureStrokeDiff > 0 ? "+" : "") + (pureStrokeDiff / 10000).toFixed(1) + "만"}</span></td>
            </tr>`;
    });
}

function updateMoney(name, type, value) {
    saveState();
    if (!appData.roundMoney[selectedMoneyRoundIdx]) appData.roundMoney[selectedMoneyRoundIdx] = {};
    if (!appData.roundMoney[selectedMoneyRoundIdx][name]) appData.roundMoney[selectedMoneyRoundIdx][name] = { start: 0, end: 0 };
    const after = parseNumber(value);
    pushChangeLog(`${name} ${selectedMoneyRoundIdx + 1}차 ${type === 'start' ? '시작' : '남은'} 금액`,
                  appData.roundMoney[selectedMoneyRoundIdx][name][type], after, 'money');
    appData.roundMoney[selectedMoneyRoundIdx][name][type] = after;
    syncToSupabase(appData); renderAll();
}

function renderTable() {
    const headerRow = document.getElementById('headerRow'); const tbody = document.getElementById('scoreTbody');
    
    const currentInputs = tbody.querySelectorAll('.score-input');
    const expectedCount = appData.totalRounds * golfers.length;
    
    if (currentInputs.length === expectedCount && tbody.children.length === golfers.length) {
        for (let r = 0; r < appData.totalRounds; r++) {
            const cInput = document.getElementById(`course_input_${r}`);
            if (cInput && document.activeElement !== cInput) cInput.value = (appData.courses && appData.courses[r]) ? appData.courses[r] : "";
            const pBtn = document.getElementById(`photo_btn_${r}`);
            if (pBtn) pBtn.innerHTML = `📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장`;
        }
        golfers.forEach(name => {
            for (let r = 0; r < appData.totalRounds; r++) {
                const sInput = document.getElementById(`score_input_${name}_${r}`);
                if (sInput && document.activeElement !== sInput) sInput.value = (appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : "";
            }
        });
        return; 
    }

    let headerHtml = `<th class="sticky-col-1">이름</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        headerHtml += `<th><div class="header-round-title">${r + 1}차</div><input type="text" id="course_input_${r}" class="course-input" value="${(appData.courses && appData.courses[r]) ? appData.courses[r] : ""}" placeholder="골프장" onchange="updateCourse(${r}, this.value)"><div id="photo_btn_${r}" class="photo-btn" onclick="openRoundPhotoModal(${r})">📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장</div></th>`;
    }
    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap;">- 평균</th>`;
    headerRow.innerHTML = headerHtml;

    tbody.innerHTML = "";
    golfers.forEach(name => {
        const tr = document.createElement('tr'); tr.setAttribute('data-name', name);
        let rowHtml = `<td class="golfer-name sticky-col-1">${name}</td>`;
        for (let r = 0; r < appData.totalRounds; r++) {
            rowHtml += `<td class="score-cell"><input type="text" id="score_input_${name}_${r}" inputmode="numeric" pattern="[0-9]*" class="score-input" value="${(appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : ""}" placeholder="타수" onfocus="this.select()" onchange="updateScore('${name}', ${r}, this.value)"></td>`;
        }
        rowHtml += `<td class="avg-cell">-</td>`;
        tr.innerHTML = rowHtml; tbody.appendChild(tr);
    });
}

function renderHandicapMatchCard(r1, r2) {
    const matchGrid = document.getElementById('matchGrid'); if (!matchGrid) return;
    matchGrid.innerHTML = ""; const avgScores = {};
    golfers.forEach(g => {
        const s1 = parseFloat(appData.scores[g] ? appData.scores[g][r1] : NaN);
        const s2 = parseFloat(appData.scores[g] ? appData.scores[g][r2] : NaN);
        if (!isNaN(s1) && !isNaN(s2)) avgScores[g] = Math.floor((s1 + s2) / 2);
    });

    if (Object.keys(avgScores).length < 4) { matchGrid.innerHTML = `<div style="grid-column: span 2; text-align:center; color:var(--text-sub);">스코어를 먼저 입력해 주세요.</div>`; return; }

    for (let i = 0; i < golfers.length; i++) {
        for (let j = i + 1; j < golfers.length; j++) {
            const diff = avgScores[golfers[i]] - avgScores[golfers[j]];
            let matchText = diff > 0 ? `<b>${golfers[i]}</b> ➔ ${golfers[j]}에게 <b style="color:var(--primary-gold); font-size: clamp(0.7rem, 2.6vw, 0.85rem);">${diff}타</b> 받음` : 
                            (diff < 0 ? `<b>${golfers[j]}</b> ➔ ${golfers[i]}에게 <b style="color:var(--primary-gold); font-size: clamp(0.7rem, 2.6vw, 0.85rem);">${Math.abs(diff)}타</b> 받음` : 
                            `<b>${golfers[i]}</b> vs <b>${golfers[j]}</b> ➔ <b style="color:#16a34a;">스크래치</b>`);
            const item = document.createElement('div'); item.className = 'match-item'; item.innerHTML = matchText; matchGrid.appendChild(item);
        }
    }
}

// 누가 무엇을 어떻게 바꿨는지 남긴다. 값이 실제로 달라졌을 때만 기록한다.
// (공금은 별도로 fundLogs에 쌓인다)
const MAX_CHANGE_LOGS = 100;
function pushChangeLog(target, before, after, kind) {
    if (String(before === undefined || before === null ? "" : before) === String(after === undefined || after === null ? "" : after)) return;
    if (!appData.changeLogs) appData.changeLogs = [];
    const now = new Date();
    appData.changeLogs.push({
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        who: localStorage.getItem('jtfag_my_name') || "알 수 없음",
        target: target, before: before, after: after, kind: kind || 'text'
    });
    while (appData.changeLogs.length > MAX_CHANGE_LOGS) appData.changeLogs.shift();
}

function updateCourse(r, val) {
    saveState(); if (!appData.courses) appData.courses = [];
    pushChangeLog(`${r + 1}차 골프장`, appData.courses[r], val, 'text');
    appData.courses[r] = val; syncToSupabase(appData);
}
function updateScore(name, r, val) {
    saveState(); if (!appData.scores) appData.scores = {}; if (!appData.scores[name]) appData.scores[name] = [];
    const after = val === "" ? "" : parseNumber(val);
    pushChangeLog(`${name} ${r + 1}차 스코어`, appData.scores[name][r], after, 'score');
    appData.scores[name][r] = after; syncToSupabase(appData); renderAll();
}

function addRound() {
    saveState(); appData.totalRounds++;
    if (!appData.courses) appData.courses = []; appData.courses.push("");
    if (!appData.roundPhotos) appData.roundPhotos = []; appData.roundPhotos.push([]);
    golfers.forEach(g => { if (!appData.scores[g]) appData.scores[g] = []; appData.scores[g].push(""); });
    const newRoundMoney = {}; golfers.forEach(g => newRoundMoney[g] = { start: 0, end: 0 });
    if (!appData.roundMoney) appData.roundMoney = []; appData.roundMoney.push(newRoundMoney);
    selectedMoneyRoundIdx = appData.totalRounds - 1;
    syncToSupabase(appData); renderAll(); showToast(`➕ ${appData.totalRounds}차전이 추가되었습니다.`);
    setTimeout(() => { const wrapper = document.getElementById('tableWrapper'); if(wrapper) wrapper.scrollTo({ left: wrapper.scrollWidth + 1000, behavior: 'smooth' }); }, 150);
}

function removeRound() {
    if (appData.totalRounds <= 2) { showToast("⚠️ 최소 2개 라운드는 유지되어야 합니다."); return; }
    saveState(); appData.totalRounds--;
    if (appData.courses) appData.courses.pop();
    if (appData.roundPhotos && appData.roundPhotos.length > 0) appData.roundPhotos.pop();
    golfers.forEach(name => { if (appData.scores[name]) appData.scores[name].pop(); });
    if (appData.roundMoney && appData.roundMoney.length > 0) appData.roundMoney.pop();
    if (selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
    syncToSupabase(appData); renderAll(); showToast(`➖ ${appData.totalRounds + 1}차전 데이터가 삭제되었습니다.`);
}

let selectedPhotoRoundIdx = -1;
function openRoundPhotoModal(r) { selectedPhotoRoundIdx = r; document.getElementById('roundPhotoTitle').textContent = `📸 ${r + 1}차전 갤러리`; renderRoundPhotos(); document.getElementById('roundPhotoModal').classList.add('active'); }
function closeRoundPhotoModal() { document.getElementById('roundPhotoModal').classList.remove('active'); }

// payload에 base64로 남아 있는 예전 사진 수. 0이면 이전 버튼을 숨긴다.
function countLegacyPhotos() {
    return (appData.roundPhotos || []).reduce((n, list) =>
        n + (list || []).filter(src => typeof src === 'string' && src.startsWith('data:')).length, 0);
}

function renderRoundPhotos() {
    const grid = document.getElementById('photoGrid'); grid.innerHTML = "";

    const photos = (appData.roundPhotos && appData.roundPhotos[selectedPhotoRoundIdx]) ? appData.roundPhotos[selectedPhotoRoundIdx] : [];
    if (photos.length === 0) { grid.innerHTML = `<div style="grid-column: span 2; text-align:center; padding: 20px; color:#94a3b8; font-size: 0.8rem;">등록된 사진이 없습니다.</div>`; return; }
    photos.forEach((src, index) => {
        grid.innerHTML += `<div class="photo-item"><img src="${src}" loading="lazy" onclick="openImageViewModal(appData.roundPhotos[selectedPhotoRoundIdx][${index}])"><button type="button" class="photo-delete-btn" onclick="deleteRoundPhoto(${index})">✕</button></div>`;
    });
}

// 원본을 그대로 올리면 용량이 커서, 긴 변 기준 800px JPEG으로 줄여 올린다.
function compressImageToBlob(file, maxSize) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => reject(new Error("이미지를 열지 못했습니다."));
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > h) { if (w > maxSize) { h *= maxSize / w; w = maxSize; } }
                else { if (h > maxSize) { w *= maxSize / h; h = maxSize; } }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(b => b ? resolve(b) : reject(new Error("압축에 실패했습니다.")), 'image/jpeg', 0.6);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handleRoundPhotoUpload(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;
    if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
    if (!appData.roundPhotos[selectedPhotoRoundIdx]) appData.roundPhotos[selectedPhotoRoundIdx] = [];
    if (appData.roundPhotos[selectedPhotoRoundIdx].length + files.length > MAX_PHOTOS_PER_ROUND) {
        showToast(`⚠️ 사진은 차수별로 최대 ${MAX_PHOTOS_PER_ROUND}장까지만 등록 가능합니다.`);
        input.value = ''; return;
    }

    showToast("⏳ 사진을 압축하여 업로드 중입니다...");
    const urls = [];
    let failed = 0;
    for (const file of files) {
        try {
            urls.push(await uploadPhotoBlob(await compressImageToBlob(file, 800), selectedPhotoRoundIdx));
        } catch (err) { console.error("사진 업로드 실패:", err); failed++; }
    }
    input.value = '';

    // 한 장이라도 올라갔으면 그만큼만 반영한다. 전부 실패하면 상태를 건드리지 않는다.
    if (urls.length === 0) { showToast("⚠️ 사진 업로드에 실패했습니다. 잠시 후 다시 시도해주세요."); return; }
    saveState();
    appData.roundPhotos[selectedPhotoRoundIdx].push(...urls);
    syncToSupabase(appData); renderRoundPhotos(); renderAll();
    showToast(failed === 0 ? `✅ 사진 ${urls.length}장 업로드 완료!` : `⚠️ ${urls.length}장 완료, ${failed}장 실패`);
}

// payload에 base64로 들어 있는 기존 사진을 Storage로 옮긴다. 되돌릴 수 없어 관리자만 실행한다.
async function migratePhotosToStorage() {
    if (!(await authenticateAdmin())) return;
    const rounds = appData.roundPhotos || [];
    let targetCount = 0;
    rounds.forEach(list => (list || []).forEach(src => {
        if (typeof src === 'string' && src.startsWith('data:')) targetCount++;
    }));
    if (targetCount === 0) { showToast("✅ 이전할 사진이 없습니다. 이미 모두 Storage에 있습니다."); return; }
    if (!(await showConfirmPrompt(`사진 ${targetCount}장을 Storage로 옮깁니다.<br><span style='font-size:0.78rem; font-weight:600; color:#94a3b8;'>되돌릴 수 없습니다.</span>`, "이전하기", "#d4af37"))) return;

    showToast(`⏳ 사진 ${targetCount}장 이전 중...`);
    saveState();
    let done = 0, failed = 0;
    for (let r = 0; r < rounds.length; r++) {
        const list = rounds[r] || [];
        for (let i = 0; i < list.length; i++) {
            const src = list[i];
            if (typeof src !== 'string' || !src.startsWith('data:')) continue;
            try {
                list[i] = await uploadPhotoBlob(await (await fetch(src)).blob(), r);
                done++;
            } catch (err) { console.error("사진 이전 실패:", err); failed++; }
        }
    }
    syncToSupabase(appData); renderRoundPhotos(); renderAll();
    showToast(failed === 0 ? `✅ 사진 ${done}장 이전 완료!` : `⚠️ ${done}장 완료, ${failed}장 실패`);
}

async function deleteRoundPhoto(photoIdx) {
    if (!(await showConfirmPrompt("이 사진을 삭제할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#94a3b8;'>되돌릴 수 없습니다.</span>"))) return;
    const removed = appData.roundPhotos[selectedPhotoRoundIdx][photoIdx];
    saveState(); appData.roundPhotos[selectedPhotoRoundIdx].splice(photoIdx, 1);
    syncToSupabase(appData); renderRoundPhotos(); renderAll();
    showToast("🗑️ 사진이 삭제되었습니다.");
    await deletePhotoFromStorage(removed);
}

function openImageViewModal(src) { document.getElementById('fullImageView').src = src; document.getElementById('imageViewModal').classList.add('active'); }
function closeImageViewModal() { document.getElementById('imageViewModal').classList.remove('active'); document.getElementById('fullImageView').src = ""; }

async function downloadCurrentPhoto() {
    const imgSrc = document.getElementById('fullImageView').src; if (!imgSrc) return;
    if (navigator.userAgent.match(/kakaotalk/i)) { showToast("⚠️ 카카오톡에선 다운로드가 제한됩니다. 우측 하단 탭에서 '다른 브라우저로 열기'를 하시거나 사진을 꾹 눌러주세요!"); return; }
    try {
        // 사진은 Storage URL이거나, 아직 이전하지 않은 예전 base64일 수 있다.
        let blob;
        if (imgSrc.startsWith('data:')) {
            const splitDataURI = imgSrc.split(','); const byteString = atob(splitDataURI[1]); const mime = splitDataURI[0].split(':')[1].split(';')[0];
            const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab); for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
            blob = new Blob([ab], { type: mime });
        } else {
            const res = await fetch(imgSrc);
            if (!res.ok) throw new Error("사진을 불러오지 못했습니다.");
            blob = await res.blob();
        }
        const mimeString = blob.type || 'image/jpeg'; const fileName = `JTFAG_Gallery_${new Date().getTime()}.jpeg`;
        if (navigator.share && navigator.canShare) {
            const file = new File([blob], fileName, { type: mimeString });
            if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'JTFAG 사진 저장' }); showToast("💾 갤러리 저장 메뉴를 성공적으로 열었습니다."); return; }
        }
        const blobUrl = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl);
        showToast("💾 기기에 성공적으로 저장되었습니다!");
    } catch (error) { console.error("다운로드 에러:", error); if (error.name !== 'AbortError') { showToast("⚠️ 다운로드 실패! 사진을 꾹~ 눌러서 '이미지 저장'을 선택해주세요."); } }
}

function openHistoryModal() { const modal = document.getElementById('historyModal'); if (modal) modal.classList.add('active'); }
function closeHistoryModal() { const modal = document.getElementById('historyModal'); if (modal) modal.classList.remove('active'); }

function openPersonalReport(name) {
    const ranksForSound = golferRankHistory[name] || [];
    let currentRankForSound = ranksForSound.length > 0 ? ranksForSound[ranksForSound.length - 1] : 3;
    
    if (currentRankForSound === 0 && SOUND_CONFIG[0]) {
        try {
            const audio = new Audio(SOUND_CONFIG[0]);
            audio.play().catch(e => console.log("오디오 재생 실패:", e));
        } catch(e) {}
    }

    document.getElementById('reportTitle').innerHTML = `✨ <span style="color:#fef08a;">${name}</span> 명예의 전당 ✨`;
    const validScores = (appData.scores && appData.scores[name]) ? appData.scores[name].filter((s) => s !== "" && !isNaN(parseFloat(s))).map(s => parseFloat(s)) : [];
    let maxStr = "-", minStr = "-", avgStr = "-";
    
    if(validScores.length > 0) { 
        maxStr = Math.max(...validScores); 
        minStr = Math.min(...validScores); 
        avgStr = (validScores.reduce((a,b)=>a+b,0) / validScores.length).toFixed(1); 
    }
    
    const rankCounts = [0, 0, 0, 0]; (golferRankHistory[name] || []).forEach(r => rankCounts[r]++);
    const badgeHtmlWithDesc = (golferBadgesMap[name] || []).map((b, idx) => `<div class="badge-desc-item slot-roll" style="animation-delay: ${idx * 0.1}s;"><div style="flex-shrink:0;">${b.html}</div><div class="badge-desc-text">${b.desc}</div></div>`).join('');
    
    const winRates = {}; golfers.forEach(g => { if(g !== name) winRates[g] = {w:0, l:0, t:0}; });
    for (let r = 2; r < appData.totalRounds; r++) {
        let isComplete = true; const hAvg = {}; const cScore = {};
        golfers.forEach(g => {
            const s1 = parseFloat(appData.scores[g] ? appData.scores[g][r-2] : NaN), s2 = parseFloat(appData.scores[g] ? appData.scores[g][r-1] : NaN), sr = parseFloat(appData.scores[g] ? appData.scores[g][r] : NaN);
            if(isNaN(s1) || isNaN(s2) || isNaN(sr)) isComplete = false;
            hAvg[g] = Math.floor((s1+s2)/2); cScore[g] = sr;
        });
        if(!isComplete) continue;
        for(let opp in winRates) {
            const myAdj = cScore[name] - (hAvg[name] - hAvg[opp]), oppAdj = cScore[opp];
            if(myAdj < oppAdj) winRates[opp].w++; else if(myAdj > oppAdj) winRates[opp].l++;
            else { if(hAvg[name] < hAvg[opp]) winRates[opp].w++; else if(hAvg[opp] < hAvg[name]) winRates[opp].l++; else winRates[opp].t++; }
        }
    }

    let winRateHtml = ""; let hasMatches = false;
    for(let opp in winRates) {
        const matchCount = winRates[opp].w + winRates[opp].l + winRates[opp].t;
        if (matchCount > 0) { 
            hasMatches = true; 
            winRateHtml += `<div class="slot-roll" style="display:flex; animation-delay: 0.3s; width: 100%;"><span>vs ${opp}</span> <b style="color:#b8860b;">승률 ${Math.round((winRates[opp].w / matchCount) * 100)}%</b> <span>(${winRates[opp].w}승 ${winRates[opp].t}무 ${winRates[opp].l}패)</span></div>`; 
        }
    }
    if (!hasMatches) winRateHtml = "<div style='text-align:center; color:#94a3b8;'>진행된 매치가 없습니다.</div>";

    const myStats = (typeof CUMULATIVE_STATS !== 'undefined') ? CUMULATIVE_STATS : { "이관교": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "김지명": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "신성호": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 }, "박승수": { holeInOne: 0, eagle: 0, birdie: 0, par: 0, doublePar: 0 } };

    const iE = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8343.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
    const iH = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8331.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
    const iC = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8333.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;
    const iS = `<img src="https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/public/rank-icon/IMG_8335.png" style="height:1.2em; vertical-align:middle; margin-right:2px;">`;

    document.getElementById('reportContent').innerHTML = `
        <div class="report-tabs">
            <button type="button" class="report-tab active" data-tab="record" onclick="switchReportTab('record')">기록</button>
            <button type="button" class="report-tab" data-tab="analysis" onclick="switchReportTab('analysis')">분석</button>
        </div>
        <div id="reportPaneAnalysis" style="display:none;">${buildAnalysisHtml(name)}</div>
        <div id="reportPaneRecord">
        <div class="report-section"><div class="report-title">🎯 상세 타수 누적 기록</div><div class="stat-grid" style="grid-template-columns: repeat(5, 1fr);">
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">홀인원</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].holeInOne}" style="color:#dc2626; animation-delay: 0.1s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">이글</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].eagle}" style="color:#ea580c; animation-delay: 0.2s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">버디</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].birdie}" style="color:#059669; animation-delay: 0.3s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">파</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].par}" style="color:#2563eb; animation-delay: 0.4s;">0</div></div>
            <div class="stat-box" style="padding: 4px;"><div class="stat-label" style="font-size:0.6rem;">양파</div><div class="stat-val slot-roll count-up" data-val="${myStats[name].doublePar}" style="color:#475569; animation-delay: 0.5s;">0</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">🏆 획득한 뱃지 컬렉션</div><div class="report-badges-area">${badgeHtmlWithDesc ? badgeHtmlWithDesc : '<span style="color:#94a3b8; font-size:0.75rem; text-align:center; padding:10px;">아직 획득한 뱃지가 없습니다.</span>'}</div></div>
        <div class="report-section"><div class="report-title">📊 스코어 요약</div><div class="stat-grid">
            <div class="stat-box"><div class="stat-label">최저타</div><div class="stat-val slot-roll count-up" data-val="${minStr}" style="color:#2563eb; animation-delay: 0.2s;">0</div></div>
            <div class="stat-box"><div class="stat-label">평균타수</div><div class="stat-val slot-roll count-up" data-val="${avgStr}" style="color:#b8860b; animation-delay: 0.3s;">0</div></div>
            <div class="stat-box"><div class="stat-label">최고타</div><div class="stat-val slot-roll count-up" data-val="${maxStr}" style="color:#dc2626; animation-delay: 0.4s;">0</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">🎖️ 계급별 달성 횟수</div><div class="stat-grid" style="grid-template-columns: repeat(4, 1fr);">
            <div class="stat-box"><div class="stat-label">${iE}독수리</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[0]}" data-suffix="회" style="color:#b8860b; animation-delay: 0.1s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iH}매</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[1]}" data-suffix="회" style="color:#0ea5e9; animation-delay: 0.2s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iC}학</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[2]}" data-suffix="회" style="color:#a855f7; animation-delay: 0.3s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iS}참새</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[3]}" data-suffix="회" style="color:#64748b; animation-delay: 0.4s;">0회</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">⚔️ 1:1 통산 승률</div><div class="winrate-list">${winRateHtml}</div></div>
        </div>
    `;
    switchReportTab('record');
    
    document.getElementById('personalReportModal').classList.add('active');

    setTimeout(() => {
        document.querySelectorAll('#personalReportModal .count-up').forEach(el => {
            const targetVal = el.getAttribute('data-val');
            if(targetVal === "-") { el.textContent = "-"; return; }
            const target = parseFloat(targetVal);
            const suffix = el.getAttribute('data-suffix') || "";
            const duration = 1200; 
            const startTime = performance.now();
            
            function updateCount(currentTime) {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
                const current = target * ease;
                
                if (Number.isInteger(target)) {
                    el.textContent = Math.floor(current) + suffix;
                } else {
                    el.textContent = current.toFixed(1) + suffix;
                }
                
                if (progress < 1) requestAnimationFrame(updateCount);
                else el.textContent = targetVal + suffix;
            }
            requestAnimationFrame(updateCount);
        });
    }, 100);
}

// 메뉴를 열기 전에 인증한다. 인증 전에는 로그도 메뉴도 보이지 않는다.
// ─── 알림 설정 ───
function getNotifySettings() {
    return Object.assign({}, DEFAULT_NOTIFY_SETTINGS, appData.notifySettings || {});
}

function renderNotifyPreview() {
    const box = document.getElementById('notifyPreview');
    if (!box) return;
    const days = document.getElementById('notifyDays').value || '?';
    const fill = (s) => String(s)
        .replace(/\{남은일수\}/g, days)
        .replace(/\{일정\}/g, appData.nextRoundDate || '(등록된 일정 없음)');
    box.innerHTML = `<div class="notify-preview-label">미리보기</div>
        <div class="notify-preview-title">${fill(document.getElementById('notifyTitle').value)}</div>
        <div class="notify-preview-body">${fill(document.getElementById('notifyBody').value)}</div>`;
}

function openNotifySettings() {
    const s = getNotifySettings();
    document.getElementById('notifyDays').value = s.daysBefore;
    document.getElementById('notifyTitle').value = s.title;
    document.getElementById('notifyBody').value = s.body;
    ['notifyDays', 'notifyTitle', 'notifyBody'].forEach(id =>
        document.getElementById(id).oninput = renderNotifyPreview);
    renderNotifyPreview();
    document.getElementById('notifySettingsModal').classList.add('active');
}
function closeNotifySettings() { document.getElementById('notifySettingsModal').classList.remove('active'); }

function saveNotifySettings() {
    const days = parseInt(document.getElementById('notifyDays').value, 10);
    const title = document.getElementById('notifyTitle').value.trim();
    const body = document.getElementById('notifyBody').value.trim();

    if (!Number.isFinite(days) || days < 1 || days > 30) { showToast("⚠️ 며칠 전 알림은 1~30 사이로 입력해주세요."); return; }
    if (!title) { showToast("⚠️ 알림 제목을 입력해주세요."); return; }

    saveState();
    appData.notifySettings = { daysBefore: days, title: title, body: body || '{일정}' };
    syncToSupabase(appData);
    closeNotifySettings();
    renderAdminModal();
    showToast(`🔔 라운드 ${days}일 전에 알리도록 저장했습니다.`);
}

async function openAdminModal() {
    if (!isFundUnlocked && !(await authenticateAdmin())) return;
    renderAdminModal(); renderStorageUsage();
    document.getElementById('adminModal').classList.add('active');
}
function closeAdminModal() { document.getElementById('adminModal').classList.remove('active'); }

function adminLock() {
    isFundUnlocked = false;
    updateLockUI();
    closeAdminModal();
    showToast("🔒 관리자 권한을 해제했습니다.");
}

async function adminRunAction(fn) {
    await fn();
    renderAdminModal();
}

function renderAdminModal() {
    const status = document.getElementById('adminStatus');
    const actions = document.getElementById('adminActions');
    if (!status || !actions) return;

    status.innerHTML = `<div class="admin-state on">
            <span>🔓 관리자 권한 활성</span>
            <button type="button" class="admin-state-btn" onclick="adminLock()">잠그기</button>
        </div>`;

    const legacy = countLegacyPhotos();
    let btns = `
        <button type="button" class="admin-btn" onclick="openNotifySettings()">🔔 알림 설정 <span class="admin-btn-sub">${getNotifySettings().daysBefore}일 전</span></button>
        <button type="button" class="admin-btn" onclick="adminRunAction(editClubFund)">💰 공금 수정 <span class="admin-btn-sub">${formatFundString(appData.clubFund)}</span></button>
        <button type="button" class="admin-btn" onclick="openFundLogModal()">📜 공금 수정 로그</button>
        <button type="button" class="admin-btn" onclick="adminRunAction(changeAdminPassword)">🔑 비밀번호 변경</button>
        <button type="button" class="admin-btn danger" onclick="adminRunAction(deleteMyName)">👤 이 기기의 이름 삭제</button>`;
    if (legacy > 0) {
        btns += `<button type="button" class="admin-btn" onclick="adminRunAction(migratePhotosToStorage)">🗄️ 기존 사진 ${legacy}장 Storage로 이전</button>`;
    }
    btns += `<button type="button" class="admin-btn danger-strong" onclick="resetAllData()">🔄 전체 데이터 초기화</button>`;
    actions.innerHTML = btns;

    const list = document.getElementById('changeLogList');
    const logs = appData.changeLogs || [];
    if (logs.length === 0) {
        list.innerHTML = `<div class="analysis-empty">기록된 변경 내역이 없습니다.</div>`;
        return;
    }
    const fmt = (v, kind) => {
        if (v === "" || v === undefined || v === null) return '<span class="log-empty">비어 있음</span>';
        return kind === 'money' ? formatNumber(v) + '원' : String(v);
    };
    list.innerHTML = logs.slice().reverse().map(l => `
        <div class="change-log-item">
            <div class="log-meta">${l.time} · <b>${l.who}</b></div>
            <div class="log-target">${l.target}</div>
            <div class="log-diff">${fmt(l.before, l.kind)} <span class="log-arrow">→</span> <b>${fmt(l.after, l.kind)}</b></div>
        </div>`).join('');
}

function switchReportTab(tab) {
    const showRecord = (tab !== 'analysis');
    const rec = document.getElementById('reportPaneRecord');
    const ana = document.getElementById('reportPaneAnalysis');
    if (rec) rec.style.display = showRecord ? 'block' : 'none';
    if (ana) ana.style.display = showRecord ? 'none' : 'block';
    document.querySelectorAll('.report-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === (showRecord ? 'record' : 'analysis')));
    const body = document.getElementById('reportContent');
    if (body) body.scrollTop = 0;
}

// 개인 리포트 '분석' 탭. 홀 기록이 있는 차수만 ①②에 쓰이고, ③은 입력된 스코어 전체를 쓴다.
function buildAnalysisHtml(name) {
    const a = (typeof getHoleAnalysis === 'function') ? getHoleAnalysis(name) : null;
    let html = "";

    if (!a) {
        html += `<div class="report-section"><div class="report-title">🕳️ 홀별 분석</div>
            <div class="analysis-empty">홀 단위 기록이 아직 없습니다.<br>스코어카드가 등록되면 표시됩니다.</div></div>`;
    } else {
        // ① 파 종류별 강약 — 값이 낮을수록 좋다. 가장 좋은 쪽 초록, 나쁜 쪽 빨강.
        const pars = [{ k: '파3', v: a.par3 }, { k: '파4', v: a.par4 }, { k: '파5', v: a.par5 }].filter(x => x.v !== null);
        const best = Math.min(...pars.map(x => x.v)), worst = Math.max(...pars.map(x => x.v));
        // 세 값이 거의 같으면 억지로 강약을 가르지 않고 전부 '보통'으로 둔다.
        const meaningful = (worst - best) >= 0.3;
        const parCells = pars.map(x => {
            let label = '보통', color = '#475569';
            if (meaningful && x.v === best) { label = '강함'; color = '#059669'; }
            else if (meaningful && x.v === worst) { label = '약함'; color = '#dc2626'; }
            const width = worst > 0 ? Math.max(8, (x.v / worst) * 100) : 8;
            return `<div class="stat-box" style="padding:6px 4px;">
                <div class="stat-label" style="font-size:0.62rem;">${x.k}</div>
                <div class="analysis-val" style="color:${color};">${label}</div>
                <div class="analysis-bar"><span style="width:${width}%; background:${color};"></span></div></div>`;
        }).join('');
        html += `<div class="report-section"><div class="report-title">🕳️ 파 종류별 강약</div>
            <div class="stat-grid" style="grid-template-columns: repeat(${pars.length}, 1fr);">${parCells}</div>
            <div class="analysis-note">${meaningful ? '막대가 짧을수록 잘 치는 홀입니다.' : '파 종류별 차이가 거의 없습니다.'}</div></div>`;

        // ② 전반 / 후반
        const diff = a.back - a.front;
        let comment = "전반과 후반이 고릅니다.";
        if (diff >= 5) comment = `후반에 ${diff}타를 더 잃습니다.`;
        else if (diff <= -5) comment = `후반에 ${Math.abs(diff)}타를 더 줄입니다.`;
        html += `<div class="report-section"><div class="report-title">🌗 전반 / 후반</div>
            <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr);">
                <div class="stat-box"><div class="stat-label">전반 9홀</div><div class="analysis-val" style="color:${a.front <= a.back ? '#059669' : '#dc2626'};">+${a.front}</div></div>
                <div class="stat-box"><div class="stat-label">후반 9홀</div><div class="analysis-val" style="color:${a.back < a.front ? '#059669' : '#dc2626'};">+${a.back}</div></div>
            </div>
            <div class="analysis-note">${comment}</div></div>`;
    }

    // ③ 차수별 추이
    const scores = (appData.scores && appData.scores[name]) ? appData.scores[name] : [];
    const valid = scores.map((s, i) => ({ r: i + 1, v: parseFloat(s) })).filter(x => !isNaN(x.v) && x.v > 0);
    let trend = `<div class="analysis-empty">입력된 스코어가 없습니다.</div>`;
    if (valid.length > 0) {
        const lo = Math.min(...valid.map(x => x.v)), hi = Math.max(...valid.map(x => x.v));
        // 눈금 최소 폭을 둬서 1~2타 차이가 막대에서 과장돼 보이지 않게 한다.
        const span = Math.max(hi - lo, 8);
        // 세로 막대라 차수가 늘어도 높이는 그대로다. 막대만 얇아진다.
        const step = valid.length > 12 ? Math.ceil(valid.length / 8) : 1;
        const cols = valid.map((x, i) => {
            const isBest = (x.v === lo && valid.length > 1);
            return `<div class="trend-col" title="${x.r}차전 ${x.v}타"><span style="height:${30 + ((x.v - lo) / span) * 70}%; background:${isBest ? '#059669' : '#cbd5e1'};"></span></div>`;
        }).join('');
        const axis = valid.map((x, i) => {
            const show = (step === 1) || (i % step === 0) || (i === valid.length - 1);
            return `<span>${show ? x.r : ''}</span>`;
        }).join('');
        const last = valid[valid.length - 1];
        trend = `<div class="trend-chart">${cols}</div><div class="trend-axis">${axis}</div>
            <div class="analysis-note">최저 <b style="color:#059669;">${lo}타</b> · 최고 ${hi}타 · 최근 <b>${last.v}타</b>(${last.r}차)</div>`;
    }
    html += `<div class="report-section"><div class="report-title">📈 차수별 추이</div>${trend}
        ${a ? `<div class="analysis-note">위 분석은 홀 기록이 있는 ${a.roundCount}개 차수 기준입니다.</div>` : ''}</div>`;

    return html;
}

function closePersonalReport() { document.getElementById('personalReportModal').classList.remove('active'); }

async function resetAllData() {
    if (!(await authenticateAdmin())) return;
    if (!(await showConfirmPrompt("정말로 모든 데이터를<br>초기화할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#94a3b8;'>스코어·정산·사진이 모두 사라집니다.</span>", "초기화"))) return;
    saveState(); appData = getDefaultData(); selectedMoneyRoundIdx = appData.totalRounds - 1; syncToSupabase(appData);
    closeAdminModal();
    renderAll(); showToast("🔄 모든 데이터가 초기화되었습니다."); forceTableReflow();
}

let pushTimeout;

function fallbackCopy(text) {
    const ta = document.createElement('textarea'); ta.value = text;
    ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); 
    
    try {
        document.execCommand('copy');
        showToast("📋 일정이 복사되었습니다! 단톡방에 붙여넣기 하세요.");
        
        const isAndroid = /android/i.test(navigator.userAgent);
        if (isAndroid) { window.location.href = 'intent://#Intent;scheme=kakaotalk;package=com.kakao.talk;end'; } 
        else { window.location.href = 'kakaotalk://'; }
    } catch (err) { showToast("⚠️ 복사에 실패했습니다. 일정을 수동으로 공유해주세요."); }
    document.body.removeChild(ta);
}

// ─── 앱 설치 안내 ───
// 안드로이드는 크롬이 실제 설치를 지원해 버튼 한 번으로 끝나지만,
// iOS는 애플이 프로그램적 설치를 막아뒀다. 그래서 방법을 안내만 한다.
let deferredInstallPrompt = null;
const INSTALL_DISMISS_KEY = 'jtfag_install_dismissed';

function isAppInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // 아이패드 사파리
}

function dismissInstallBanner() {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    const el = document.getElementById('installBanner');
    if (el) el.classList.remove('show');
}

function renderInstallBanner() {
    const banner = document.getElementById('installBanner');
    if (!banner) return;
    if (isAppInstalled() || localStorage.getItem(INSTALL_DISMISS_KEY)) { banner.classList.remove('show'); return; }

    const desc = document.getElementById('installDesc');
    const action = document.getElementById('installAction');

    if (deferredInstallPrompt) {
        desc.textContent = '홈 화면에 앱으로 추가하고 라운드 알림을 받아보세요.';
        action.innerHTML = `<button type="button" class="install-btn" onclick="runInstall()">📲 설치하기</button>`;
    } else if (isIOS()) {
        desc.textContent = '앱처럼 쓰고 라운드 알림을 받으려면 홈 화면에 추가하세요.';
        action.innerHTML = `<div class="install-steps">
            <span><b>1</b> 아래 <b>공유</b> <span class="ios-share">⬆︎</span> 를 누르고</span>
            <span><b>2</b> <b>‘홈 화면에 추가’</b> 를 선택하세요</span>
        </div>`;
    } else {
        banner.classList.remove('show');
        return;
    }
    banner.classList.add('show');
}

async function runInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (outcome === 'accepted') {
        document.getElementById('installBanner').classList.remove('show');
    } else {
        showToast("설치를 취소했습니다. 나중에 다시 설치할 수 있습니다.");
        renderInstallBanner();
    }
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();               // 크롬 기본 배너 대신 우리 안내를 쓴다
    deferredInstallPrompt = e;
    renderInstallBanner();
});
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const el = document.getElementById('installBanner');
    if (el) el.classList.remove('show');
    showToast("🎉 앱이 설치되었습니다!");
});

// ─── 라운드 알림 구독 ───
// 실제 발송은 GitHub Actions가 한다. 여기서는 각자 기기의 구독을 켜고 끈다.
async function updateAlarmUI() {
    const btn = document.getElementById('alarmToggleBtn');
    if (!btn) return;
    if (!pushSupported()) { btn.textContent = '🔕'; btn.title = '이 브라우저는 알림을 지원하지 않습니다'; return; }
    const sub = await getPushSubscription();
    const on = !!sub && Notification.permission === 'granted';
    btn.textContent = on ? '🔔' : '🔕';
    btn.title = on ? '라운드 알림 켜짐 — 눌러서 끄기' : '라운드 알림 받기';
}

async function toggleRoundAlarm() {
    if (!pushSupported()) {
        showToast("⚠️ 이 브라우저는 알림을 지원하지 않습니다. 홈 화면에 추가한 앱에서 열어주세요.");
        return;
    }
    if (Notification.permission === 'denied') {
        showToast("⚠️ 알림이 차단돼 있습니다. 기기 설정에서 이 앱의 알림을 허용해주세요.");
        return;
    }

    const existing = await getPushSubscription();
    if (existing && Notification.permission === 'granted') {
        if (!(await showConfirmPrompt("라운드 알림을 끌까요?<br><span style='font-size:0.78rem; font-weight:600; color:#94a3b8;'>이 기기로 알림이 오지 않습니다.</span>", "끄기"))) return;
        try { await unsubscribeFromPush(); showToast("🔕 라운드 알림을 껐습니다."); }
        catch (err) { console.error(err); showToast("⚠️ 알림 해제에 실패했습니다."); }
        updateAlarmUI();
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast("⚠️ 알림 권한이 허용되지 않았습니다."); updateAlarmUI(); return; }

    try {
        await subscribeToPush(localStorage.getItem('jtfag_my_name'));
        showToast("🔔 라운드 알림을 켰습니다! 라운드 2일 전에 알려드립니다.");
    } catch (err) {
        console.error("구독 실패:", err);
        showToast(`⚠️ 알림 등록 실패 — ${(err && err.message) ? err.message : err}`, 9000);
    }
    updateAlarmUI();
}

function sendNotification() {
    if (!appData.nextRoundDate || appData.nextRoundDate === "") { showToast("⚠️ 등록된 일정이 없습니다. 먼저 일정을 등록해주세요!"); return; }
    const weatherInfo = document.getElementById('weatherText').innerText; let weatherStr = "날씨 정보 없음";
    if (weatherInfo && !weatherInfo.includes("확인중") && !weatherInfo.includes("못했습니다")) { const parts = weatherInfo.split(': '); if (parts.length > 1) weatherStr = parts[1].trim(); }

    document.getElementById('pushBody').innerHTML = `📅 <b>${appData.nextRoundDate}</b><br>⛅ ${weatherStr}<br><span style="color:#60a5fa; font-size:0.7rem; margin-top:4px; display:block;">👉 터치해서 일정 복사하기</span>`;
    const pushEl = document.getElementById('pushNotification'); pushEl.classList.add('show');
    if (navigator.vibrate) navigator.vibrate(200);

    clearTimeout(pushTimeout);
    pushTimeout = setTimeout(() => { pushEl.classList.remove('show'); }, 5000);
}

function shareSchedule() {
    document.getElementById('pushNotification').classList.remove('show');
    const weatherInfo = document.getElementById('weatherText').innerText; let weatherStr = "날씨 정보 없음";
    if (weatherInfo && !weatherInfo.includes("확인중") && !weatherInfo.includes("못했습니다")) { const parts = weatherInfo.split(': '); if (parts.length > 1) weatherStr = parts[1].trim(); }
    const shareMsg = `[⛳ JTFAG 리그 일정 알림]\n\n📅 일정: ${appData.nextRoundDate}\n⛅ 날씨: ${weatherStr}\n\n결전의 날이 다가옵니다! 멘탈 꽉 잡고 준비하세요! 🔥`;
    fallbackCopy(shareMsg);
}

let hasGreeted = false;

async function checkAndGreetUser() {
    if (hasGreeted || !isLoaded || Object.keys(golferRankHistory).length === 0) return;

    let myName = localStorage.getItem('jtfag_my_name');
    if (!myName || !golfers.includes(myName)) {
        hasGreeted = true; 
        setTimeout(async () => {
            myName = await showNameSelectionPrompt("👋 환영합니다!<br>본인의 이름을 선택해주세요.");
            if (myName && golfers.includes(myName)) {
                localStorage.setItem('jtfag_my_name', myName);
                showGreeting(myName);
            } else {
                hasGreeted = false; 
            }
        }, 500);
        return;
    }

    showGreeting(myName);
    hasGreeted = true;
}

async function deleteMyName() {
    const currentName = localStorage.getItem('jtfag_my_name');
    if (!currentName) {
        showToast("⚠️ 현재 기기에 등록된 이름이 없습니다.");
        checkAndGreetUser();
        return;
    }
    
    const isConfirmed = await showConfirmPrompt("기기에 저장된 이름을 삭제하시겠습니까?<br><span style='font-size:0.8rem; font-weight:400; color:#94a3b8;'>삭제 후 다음 접속 시 다시 등록할 수 있습니다.</span>");
    
    if (isConfirmed) {
        localStorage.removeItem('jtfag_my_name');
        showToast("🗑️ 이름이 삭제되었습니다.");
        hasGreeted = false; 
        
        setTimeout(() => {
            checkAndGreetUser();
        }, 500);
    }
}

function showGreeting(myName) {
    const ranks = golferRankHistory[myName] || [];
    let myRankIdx = 3; 
    if (ranks.length > 0) {
        myRankIdx = ranks[ranks.length - 1]; 
    }

    const rankInfo = RANK_CONFIG[myRankIdx];
    const iconHtml = rankInfo.icon;

    let greetMsg = "";
    if (myRankIdx === 0) greetMsg = `✨ 황제 귀환!<br><span style="color:#fef08a;">독수리등급 ${myName}님</span>이 입장하였습니다.`;
    else if (myRankIdx === 1) greetMsg = `⚔️ 맹수의 발톱!<br><span style="color:#0ea5e9;">매등급 ${myName}님</span>이 입장하였습니다.`;
    else if (myRankIdx === 2) greetMsg = `🦢 우아한 날개짓!<br><span style="color:#a855f7;">학등급 ${myName}님</span>이 입장하였습니다.`;
    else greetMsg = `💦 앗!<br><span style="color:#94a3b8;">참새등급 ${myName}님</span>이 입장하였습니다.`;

    const overlay = document.createElement('div');
    overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(4px); z-index:9999; opacity:0; transition:opacity 0.4s ease;";
    
    const toast = document.createElement('div');
    toast.innerHTML = `<div style="font-size: 2.5rem; margin-bottom: 12px; display:flex; justify-content:center;">${iconHtml}</div><div style="font-size: 0.95rem; line-height:1.5; word-break:keep-all;">${greetMsg}</div>`;
    toast.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%) scale(0.7); opacity:0; width: 85%; max-width: 320px; background:linear-gradient(135deg, #1e293b, #0f172a); border:2px solid #d4af37; color:#fff; padding:24px 16px; border-radius:16px; text-align:center; font-weight:800; z-index:10000; box-shadow:0 15px 40px rgba(0,0,0,0.6); transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);";
    
    document.body.appendChild(overlay);
    document.body.appendChild(toast);
    
    setTimeout(() => { 
        overlay.style.opacity = "1";
        toast.style.transform = "translate(-50%, -50%) scale(1)"; 
        toast.style.opacity = "1";
    }, 50);
    
    setTimeout(() => { 
        toast.style.transform = "translate(-50%, -50%) scale(0.8)";
        toast.style.opacity = "0"; 
        overlay.style.opacity = "0"; 
        setTimeout(() => { toast.remove(); overlay.remove(); }, 500);
    }, 3000);
}
