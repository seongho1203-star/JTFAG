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
            applyHoleScores();
            renderNoticeArea(); renderAll(); showSaveStatus("⚡ 실시간 업데이트됨");
            if (document.getElementById('roundPhotoModal').classList.contains('active')) renderRoundPhotos();
            // 판독 결과(status)는 워크플로가 payload에 써 넣으므로 실시간으로 들어온다.
            if (document.getElementById('scoreRequestModal').classList.contains('active')) renderScoreRequestModal();
        }
    }).subscribe();

    watchTableTouch();
    watchOverlays();
    initScheduleOptions();
    registerServiceWorker().then(() => updateAlarmUI());
    setTimeout(renderInstallBanner, 2500);   // iOS는 이벤트가 없으므로 직접 띄운다

    const fundLogModal = document.createElement('div');
    fundLogModal.id = 'fundLogModal';
    fundLogModal.className = 'modal-overlay';
    // 여닫는 건 .active 클래스가 한다. 여기서는 색과 층만 다르게 준다 —
    // opacity·pointer-events·visibility·transition을 인라인으로 덮어쓰면 안 된다.
    // (.modal-overlay는 닫혀 있을 때 visibility:hidden이라, 인라인 opacity만 1로
    //  올리면 '보이지 않는데 열려 있는' 상태가 된다. 실제로 그래서 안 열렸다.)
    fundLogModal.style.cssText = "background:rgba(0,0,0,0.7); z-index:9999;";
    // 카드는 세로 3단이다 — 머리말·목록·버튼. 가운데만 스크롤되므로
    // 기록이 아무리 쌓여도 '닫기'가 화면 밖으로 밀려나지 않는다.
    fundLogModal.innerHTML = `
        <div style="background:#1e293b; border:1px solid #334155; border-radius:12px; padding:20px; width:85%; max-width:320px; max-height:70vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.5); transform:scale(0.9); transition:transform 0.3s;">
            <h3 style="margin:0 0 12px 0; color:#d4af37; font-size:1rem; text-align:center; flex-shrink:0;">📜 공금 수정 로그</h3>
            <div id="fundLogContent" style="font-size:0.8rem; color:#94a3b8; text-align:left; flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; margin-bottom:12px;"></div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
                <button type="button" id="fundLogClearBtn" onclick="clearFundLogs()" style="flex:0 0 auto; padding:10px 12px; background:#7f1d1d; border:none; border-radius:6px; color:#fecaca; font-weight:700; cursor:pointer; font-family:inherit; font-size:0.8rem;">전체 삭제</button>
                <button type="button" onclick="closeFundLogModal()" style="flex:1; padding:10px; background:#334155; border:none; border-radius:6px; color:#fff; font-weight:700; cursor:pointer; font-family:inherit;">닫기</button>
            </div>
        </div>
    `;
    document.body.appendChild(fundLogModal);

    window.renderFundLogs = () => {
        const content = document.getElementById('fundLogContent');
        const clearBtn = document.getElementById('fundLogClearBtn');
        const logs = appData.fundLogs || [];
        if (clearBtn) clearBtn.style.display = logs.length ? 'block' : 'none';

        if (logs.length === 0) {
            content.innerHTML = "<div style='text-align:center; padding:20px;'>기록된 수정 내역이 없습니다.</div>";
            return;
        }
        // 최근 것이 위로. 지울 때는 원래 배열의 위치가 필요해서 인덱스를 같이 넘긴다.
        content.innerHTML = logs.map((log, i) => ({ log, i })).reverse().map(({ log, i }) => {
            // 한 건을 세 줄로 나눈다 — 잔액 변화 / 오간 금액 / 내역.
            // 예전엔 셋을 한 줄에 붙여 놨는데 금액이 여섯 자리가 되니 '원)'만 다음 줄로
            // 떨어져 읽기 나빴다. 줄을 나누면 자릿수가 늘어도 모양이 안 무너진다.
            const diff = (log.after || 0) - (log.before || 0);
            // 적립인지 사용인지는 부호로 안다 — 그래서 로그에 따로 안 담는다.
            const move = diff > 0 ? { word: '적립', color: '#4ade80' }
                       : diff < 0 ? { word: '사용', color: '#f87171' }
                                  : { word: '변동 없음', color: '#94a3b8' };
            const moveHtml = diff === 0
                ? `<div style="margin-top:3px; color:#94a3b8; font-size:0.8rem; font-weight:700;">변동 없음</div>`
                : `<div style="margin-top:3px; font-size:0.8rem; font-weight:800; color:${move.color};">${move.word} ${formatNumber(Math.abs(diff))}원</div>`;
            // 예전 기록에는 memo가 없다. 있을 때만 줄을 만든다.
            const memoHtml = log.memo
                ? `<div style="margin-top:5px; color:#cbd5e1; font-size:0.78rem; background:rgba(212,175,55,0.1); border-left:2px solid #d4af37; border-radius:0 4px 4px 0; padding:4px 7px; word-break:keep-all;">📝 ${escapeHtml(log.memo)}</div>`
                : "";
            return `<div style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:0.72rem; font-weight:800; color:#e2e8f0; background:rgba(255,255,255,0.08); border-radius:5px; padding:2px 6px; white-space:nowrap;">${log.time}</span>
                    <span style="font-size:0.75rem; color:#fef08a; font-weight:700;">${escapeHtml(log.name || '')}</span>
                    <button type="button" onclick="editFundLog(${i})" title="내역 고치기" style="margin-left:auto; flex-shrink:0; width:22px; height:22px; line-height:1; padding:0; background:transparent; border:1px solid #475569; border-radius:5px; color:#94a3b8; font-size:0.7rem; cursor:pointer; font-family:inherit;">✎</button>
                    <button type="button" onclick="removeFundLog(${i})" title="이 기록 지우기" style="flex-shrink:0; width:22px; height:22px; line-height:1; padding:0; background:transparent; border:1px solid #475569; border-radius:5px; color:#94a3b8; font-size:0.7rem; cursor:pointer; font-family:inherit;">✕</button>
                </div>
                <div style="color:#cbd5e1; font-size:0.82rem; white-space:nowrap;">${formatNumber(log.before)}원 ➔ <b style="color:#e2e8f0;">${formatNumber(log.after)}원</b></div>
                ${moveHtml}
                ${memoHtml}
             </div>`;
        }).join('');
    };

    window.openFundLogModal = () => {
        renderFundLogs();
        fundLogModal.classList.add('active');
        fundLogModal.querySelector('div').style.transform = "scale(1)";
    };

    window.closeFundLogModal = () => {
        fundLogModal.classList.remove('active');
        fundLogModal.querySelector('div').style.transform = "scale(0.9)";
    };

    // 기록 지우기. 공금 잔액은 건드리지 않는다 — 로그만 없앤다.
    // 테스트로 남긴 줄을 걷어내려고 만든 것이라, 되돌릴 수 있게 saveState()를 먼저 부른다.
    // 내역을 잘못 적었을 때 그 줄만 고친다. 금액은 못 고친다 —
    // 로그는 before → after가 사슬로 이어져 있어 지난 금액을 고치면 이력이 어긋난다.
    window.editFundLog = async (idx) => {
        const log = (appData.fundLogs || [])[idx];
        if (!log) return;
        const memo = await showMemoPrompt(log);
        if (memo === null) return;                       // 취소
        if (memo === (log.memo || '')) return;           // 그대로면 저장하지 않는다
        saveState();
        if (memo) log.memo = memo; else delete log.memo; // 비우면 아예 없앤다(옛 기록과 같은 모양)
        syncToSupabase(appData);
        renderFundLogs();
        showToast(memo ? "✏️ 내역을 고쳤습니다." : "✏️ 내역을 지웠습니다.");
    };

    window.removeFundLog = async (idx) => {
        const log = (appData.fundLogs || [])[idx];
        if (!log) return;
        const ok = await showConfirmPrompt(
            `이 기록을 지울까요?<br><span style="font-size:0.78rem; color:#cbd5e1;">${log.time} · ${escapeHtml(log.name || '')}</span>`,
            '지우기');
        if (!ok) return;
        saveState();
        appData.fundLogs.splice(idx, 1);
        syncToSupabase(appData);
        renderFundLogs();
        showToast("🗑️ 기록 1건을 지웠습니다.");
    };

    window.clearFundLogs = async () => {
        const n = (appData.fundLogs || []).length;
        if (n === 0) return;
        const ok = await showConfirmPrompt(
            `기록 ${n}건을 모두 지울까요?<br><span style="font-size:0.78rem; color:#cbd5e1;">공금 잔액은 그대로입니다.</span>`,
            '모두 지우기');
        if (!ok) return;
        saveState();
        appData.fundLogs = [];
        syncToSupabase(appData);
        renderFundLogs();
        showToast(`🗑️ 기록 ${n}건을 모두 지웠습니다.`);
    };

});

// 사용자가 적은 글(공금 사용내역 등)을 innerHTML에 넣기 전에 태그를 무력화한다.
function escapeHtml(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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

/* 공금 로그의 내역(메모)을 고치는 창.
   `.modal-overlay` 클래스를 쓰지 않고 스스로 스타일을 다 지정한다 —
   그 클래스는 닫히면 `visibility:hidden`이라 인라인 opacity만으로는 안 보인다.
   z-index는 로그 창(9999)보다 위여야 한다.

   **금액은 고칠 수 없고 내역만 고친다.** 로그는 `before → after`가 사슬로 이어져 있어
   지난 금액을 고치면 다음 기록의 `before`와 어긋나 이력이 거짓말이 된다.
   금액을 잘못 넣었으면 공금을 한 번 더 수정해 바로잡는 게 맞다. */
function showMemoPrompt(log) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10001; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";

        const box = document.createElement('div');
        box.style.cssText = "background:#1e293b; border:1px solid #d4af37; border-radius:12px; padding:20px; width:100%; max-width:300px; box-shadow:0 15px 40px rgba(0,0,0,0.6); transform:scale(0.9); transition:transform 0.2s; text-align:center;";

        const diff = (log.after || 0) - (log.before || 0);
        const moveText = diff === 0 ? '변동 없음'
            : `${diff > 0 ? '적립' : '사용'} ${formatNumber(Math.abs(diff))}원`;

        const msgEl = document.createElement('div');
        msgEl.innerHTML = `내역 고치기<br>`
            + `<span style="font-size:0.74rem; font-weight:700; color:#94a3b8;">${escapeHtml(log.time || '')} · ${escapeHtml(log.name || '')}</span><br>`
            + `<span style="font-size:0.78rem; font-weight:800; color:${diff < 0 ? '#f87171' : diff > 0 ? '#4ade80' : '#94a3b8'};">${moveText}</span>`;
        msgEl.style.cssText = "color:#f8fafc; font-size:0.9rem; margin-bottom:14px; font-weight:800; line-height:1.6;";

        const input = document.createElement('input');
        input.type = "text"; input.maxLength = 40;
        input.value = log.memo || '';
        input.placeholder = "예: 박승수 9월회비";
        input.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #475569; background:#0f172a; color:#fef08a; font-size:0.85rem; font-weight:700; text-align:center; outline:none; margin-bottom:12px; font-family:inherit;";

        const row = document.createElement('div'); row.style.cssText = "display:flex; gap:8px;";
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer; font-family:inherit;";
        const okBtn = document.createElement('button');
        okBtn.textContent = "저장";
        okBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#d4af37; color:#1e293b; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit;";
        row.appendChild(cancelBtn); row.appendChild(okBtn);

        box.appendChild(msgEl); box.appendChild(input); box.appendChild(row);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.style.opacity = "1";
            box.style.transform = "scale(1)";
            input.focus(); input.select();
        }, 10);

        function cleanup(value) {
            overlay.style.opacity = "0";
            box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(value); }, 200);
        }

        cancelBtn.onclick = () => cleanup(null);
        okBtn.onclick = () => cleanup(input.value.trim());
        input.onkeydown = (e) => { if (e.key === 'Enter') cleanup(input.value.trim()); };
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
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


// 공금 수정 창. 적립/사용을 고르고 그 금액만 적으면 잔액은 저절로 계산된다.
// 잔액을 잘못 적어 둔 걸 바로잡을 때가 있어 '직접'(잔액을 그대로 씀)도 남겨 뒀다.
// 취소하면 null, 저장하면 {after, memo}를 돌려준다 — after는 이미 계산된 잔액이다.
const FUND_MODES = {
    add:    { tab: "➕ 적립", label: "적립할 금액", memo: "예) 6월 회비 4명", sign: 1 },
    use:    { tab: "➖ 사용", label: "사용한 금액", memo: "예) 5차 그늘집 결제", sign: -1 },
    direct: { tab: "✏️ 직접", label: "고쳐 쓸 잔액", memo: "예) 잔액 정정", sign: 0 }
};

function showFundPrompt(before) {
    return new Promise((resolve) => {
        let mode = 'use';   // 대개는 쓴 돈을 적는다

        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        const box = document.createElement('div');
        box.style.cssText = "background:#1e293b; border:1px solid #d4af37; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.6); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        const msgEl = document.createElement('div');
        msgEl.innerHTML = `💰 공금 수정<div style="color:#94a3b8; font-size:0.72rem; font-weight:700; margin-top:3px;">현재 ${formatFundString(before)}</div>`;
        msgEl.style.cssText = "color:#f8fafc; font-size:0.9rem; margin-bottom:12px; font-weight:800; word-break:keep-all;";

        const tabRow = document.createElement('div');
        tabRow.style.cssText = "display:flex; gap:5px; margin-bottom:12px;";
        const tabs = {};
        Object.keys(FUND_MODES).forEach(key => {
            const btn = document.createElement('button');
            btn.type = "button"; btn.textContent = FUND_MODES[key].tab;
            btn.style.cssText = "flex:1; padding:7px 0; border-radius:6px; border:1px solid #475569; background:#0f172a; color:#94a3b8; font-size:0.75rem; font-weight:800; cursor:pointer; font-family:inherit;";
            btn.onclick = () => setMode(key);
            tabs[key] = btn; tabRow.appendChild(btn);
        });

        const amountLabel = document.createElement('div');
        amountLabel.style.cssText = "color:#94a3b8; font-size:0.72rem; font-weight:700; text-align:left; margin-bottom:4px;";
        const amountInput = document.createElement('input');
        amountInput.type = "text"; amountInput.inputMode = "numeric";
        amountInput.placeholder = "0";
        amountInput.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #475569; background:#0f172a; color:#fff; font-size:1rem; font-weight:800; text-align:center; outline:none; font-family:inherit;";

        // 저장하면 잔액이 얼마가 되는지 치는 대로 보여 준다.
        const preview = document.createElement('div');
        preview.style.cssText = "font-size:0.78rem; font-weight:800; margin:7px 0 10px 0; min-height:16px;";

        const memoLabel = document.createElement('div');
        memoLabel.textContent = "내역 (선택)";
        memoLabel.style.cssText = "color:#94a3b8; font-size:0.72rem; font-weight:700; text-align:left; margin-bottom:4px;";
        const memoInput = document.createElement('input');
        memoInput.type = "text"; memoInput.maxLength = 40;
        memoInput.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #475569; background:#0f172a; color:#fef08a; font-size:0.85rem; font-weight:700; text-align:center; outline:none; margin-bottom:12px; font-family:inherit;";

        const row = document.createElement('div'); row.style.cssText = "display:flex; gap:8px;";
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#475569; color:#fff; font-size:0.85rem; font-weight:700; cursor:pointer; font-family:inherit;";
        const okBtn = document.createElement('button');
        okBtn.textContent = "저장";
        okBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#d4af37; color:#1e293b; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit;";
        row.appendChild(cancelBtn); row.appendChild(okBtn);

        box.appendChild(msgEl); box.appendChild(tabRow);
        box.appendChild(amountLabel); box.appendChild(amountInput); box.appendChild(preview);
        box.appendChild(memoLabel); box.appendChild(memoInput);
        box.appendChild(row);
        overlay.appendChild(box); document.body.appendChild(overlay);

        // 적은 금액으로 잔액이 얼마가 되는지 — 저장할 값도 여기서 나온다.
        function resultOf() {
            const amount = parseNumber(amountInput.value);
            const sign = FUND_MODES[mode].sign;
            return sign === 0 ? amount : before + sign * amount;
        }

        function refresh() {
            const amount = parseNumber(amountInput.value);
            const after = resultOf();
            if (!amount) { preview.textContent = ""; return; }
            const sign = FUND_MODES[mode].sign;
            const arrow = sign === 0 ? "➔"
                : `${sign > 0 ? '+' : '−'} ${formatNumber(amount)}원 =`;
            preview.innerHTML = `<span style="color:#64748b;">${formatNumber(before)}원 ${arrow}</span> ` +
                `<span style="color:${after < 0 ? '#f87171' : '#4ade80'};">${formatFundString(after)}</span>` +
                (after < 0 ? `<div style="color:#f87171; font-size:0.68rem; font-weight:700; margin-top:2px;">잔액이 마이너스가 됩니다</div>` : "");
        }

        function setMode(key) {
            mode = key;
            Object.keys(tabs).forEach(k => {
                const on = k === key;
                tabs[k].style.background = on ? "#d4af37" : "#0f172a";
                tabs[k].style.color = on ? "#1e293b" : "#94a3b8";
                tabs[k].style.borderColor = on ? "#d4af37" : "#475569";
            });
            amountLabel.textContent = FUND_MODES[key].label;
            memoInput.placeholder = FUND_MODES[key].memo;
            // '직접'으로 바꾸면 지금 잔액을 넣어 준다 — 고칠 값이 대개 그 근처다.
            if (key === 'direct' && !parseNumber(amountInput.value)) amountInput.value = formatNumber(before);
            refresh(); amountInput.focus();
        }

        setMode(mode);
        setTimeout(() => { overlay.style.opacity = "1"; box.style.transform = "scale(1)"; amountInput.focus(); }, 10);

        function cleanup(value) {
            overlay.style.opacity = "0"; box.style.transform = "scale(0.9)";
            setTimeout(() => { overlay.remove(); resolve(value); }, 200);
        }
        function save() {
            if (!parseNumber(amountInput.value)) { amountInput.focus(); return; }
            cleanup({ after: resultOf(), memo: memoInput.value.trim() });
        }
        cancelBtn.onclick = () => cleanup(null);
        okBtn.onclick = save;
        // 치는 동안 천 단위 쉼표를 넣어 준다. 숫자가 아닌 글자는 버린다.
        amountInput.oninput = () => {
            const digits = amountInput.value.replace(/[^0-9]/g, '');
            amountInput.value = digits ? Number(digits).toLocaleString('ko-KR') : "";
            refresh();
        };
        amountInput.onkeydown = (e) => { if (e.key === 'Enter') memoInput.focus(); };
        memoInput.onkeydown = (e) => { if (e.key === 'Enter') save(); };
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(null); };
    });
}

// 공금 수정. 공지 카드의 `💰 남은 공금 잔액` 칸을 누르면 열린다.
// 예전에는 관리자 메뉴 안에 있어서 그 문(비밀번호)을 이미 지난 뒤였다.
// 이제 바로 부를 수 있게 됐으니 **여기서 비밀번호를 직접 묻는다** — 돈이라 그대로 열어 둘 수 없다.
// (한 번 풀면 isFundUnlocked가 남아, 잠그기 전까지는 다시 묻지 않는다.)
async function editClubFund() {
    if (!(await authenticateAdmin())) return;
    const before = appData.clubFund || 0;
    const entered = await showFundPrompt(before);
    if (entered === null) return;
    const after = entered.after;
    const memo = entered.memo || "";
    // 금액이 그대로면 사용내역만 남길 이유가 없다.
    if (after === before) { showToast("변경 사항이 없습니다."); return; }

    saveState();
    if (!appData.fundLogs) appData.fundLogs = [];
    const now = new Date();
    appData.fundLogs.push({
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        name: localStorage.getItem('jtfag_my_name') || "알 수 없음",
        before: before, after: after, memo: memo
    });
    while (appData.fundLogs.length > 50) appData.fundLogs.shift();

    appData.clubFund = after;
    syncToSupabase(appData); renderNoticeArea(); renderAll();
    const diff = after - before;
    showToast(`💰 ${diff > 0 ? '+' : '−'}${formatNumber(Math.abs(diff))}원 → 공금 ${formatFundString(after)}`);
}

// 공금은 표시만 한다. 고치는 건 그 칸을 눌러 여는 editClubFund()뿐이다.
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

// 다음 라운드까지 남은 날. 표시 문구(nextRoundDate)에는 연도가 없으므로
// 일정 저장 때 따로 남겨 둔 nextRoundISO(YYYY-MM-DD)만 본다. 알림 발송기와 같은 값이다.
// 기기 시간대와 무관하게 한국 날짜끼리 비교한다.
function daysUntilNextRound() {
    const iso = appData.nextRoundISO;
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
}

// 일정이 없거나 이미 지난 날짜면 뱃지를 붙이지 않는다.
function ddayBadgeHtml() {
    const left = daysUntilNextRound();
    if (left === null || left < 0) return '';
    if (left === 0) return `<span class="dday-badge dday-today">D-DAY</span>`;
    return `<span class="dday-badge ${left <= 3 ? 'dday-soon' : 'dday-far'}">D-${left}</span>`;
}

function renderNoticeArea() {
    const dateDisplay = document.getElementById('nextRoundDisplay');
    if (dateDisplay) { dateDisplay.innerHTML = appData.nextRoundDate ? (ddayBadgeHtml() + appData.nextRoundDate) : `일정 등록하기`; checkWeather(appData.nextRoundDate); }
    updateLockUI();
}

// 홈 화면 앱은 백그라운드에 그대로 떠 있어, 자정을 넘겨도 어제 계산한 D-day가 남는다.
// 다시 앞으로 불러올 때 한 번 더 그린다.
document.addEventListener('visibilitychange', function () {
    if (!document.hidden && isLoaded) renderNoticeArea();
});

// 표가 가끔 안 그려지는 걸 막으려고 overflow를 잠깐 껐다 켜서 다시 그리게 한다.
// 그런데 손가락으로 밀고 있는 중에 이게 돌면 스크롤이 그 자리에서 죽는다.
// (다른 사람이 값을 고쳐 실시간 갱신이 들어오면 renderAll이 도는 탓에 종종 겹쳤다)
// 그래서 표를 만지고 있는 동안에는 건너뛴다.
let isTableTouched = false;

function watchTableTouch() {
    const wrapper = document.getElementById('tableWrapper');
    if (!wrapper) return;
    const on = () => { isTableTouched = true; };
    const off = () => { isTableTouched = false; };
    wrapper.addEventListener('touchstart', on, { passive: true });
    wrapper.addEventListener('touchend', off, { passive: true });
    wrapper.addEventListener('touchcancel', off, { passive: true });
    wrapper.addEventListener('pointerdown', on, { passive: true });
    wrapper.addEventListener('pointerup', off, { passive: true });
    wrapper.addEventListener('pointercancel', off, { passive: true });
}

// ─── 창이 떠 있는 동안 뒷배경 잠그기 ───
// 창을 여는 곳이 스무 군데가 넘고(모달 10개 + 직접 만들어 붙이는 창 6개), 한 곳씩 고치면
// 반드시 하나를 빠뜨린다 — 그러면 화면이 잠긴 채로 안 풀려서 원래 문제보다 나쁘다.
// 그래서 '화면을 덮는 게 생겼는지'를 지켜보다가 body를 잠근다. 여는 코드는 손대지 않는다.
//
// 덮는 창의 조건: body 바로 아래 · position:fixed · 누를 수 있고(pointer-events) · 화면을 거의 다 덮음.
// 이 조건이 곧 필터다 — 닫힌 모달(pointer-events:none)·토스트(작음)·인사말은 저절로 빠진다.
// opacity는 보지 않는다. 창이 열릴 때 0에서 1로 서서히 오르는데, 관찰자는 그 첫 프레임에
// 돌아서 아직 0을 읽는다 — 그러면 안 잠기고, 그 뒤로 바뀌는 게 없어 영영 다시 안 본다.
// (실제로 관리자 메뉴와 일정 모달만 안 잠기는 걸로 나타났다.)
// pointer-events는 전환 없이 즉시 바뀌고, '입력을 가로채고 있는가'라는 뜻이라 더 정확하다.
function isCoveringOverlay(el) {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.display === 'none' || s.pointerEvents === 'none') return false;
    if (s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
}

function anyOverlayOpen() {
    for (const el of document.body.children) {
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
        if (isCoveringOverlay(el)) return true;
    }
    return false;
}

// **iOS와 나머지의 잠그는 방법이 다르다.**
// iOS 사파리는 overflow:hidden만으로는 뒤가 계속 밀려서 body를 position:fixed로 붙잡아야 한다.
// 그런데 안드로이드에서 그렇게 하면 **키보드가 올라올 때 화면이 어긋난다** — 소프트 키보드가
// 뷰포트 높이를 줄이는데, 붙잡아 둔 body가 그걸 따라가지 못해 창이 밀려 보인다.
// (관리자 비밀번호 창이 반쯤 밀려 나온 제보가 실제로 이것이었다.)
// 안드로이드·PC는 html+body의 overflow:hidden만으로 충분하고, 스크롤 위치도 알아서 남는다.
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let scrollLocked = false;
let lockedScrollY = 0;

function applyScrollLock() {
    const want = anyOverlayOpen();
    if (want === scrollLocked) return;   // 안 바뀌었으면 건드리지 않는다
    scrollLocked = want;
    const body = document.body, html = document.documentElement;

    if (want) {
        lockedScrollY = window.scrollY || window.pageYOffset || 0;
        if (IS_IOS) {
            body.style.position = 'fixed';
            body.style.top = `-${lockedScrollY}px`;
            body.style.left = '0';
            body.style.right = '0';
            body.style.width = '100%';
        }
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
    } else {
        if (IS_IOS) {
            body.style.position = '';
            body.style.top = '';
            body.style.left = '';
            body.style.right = '';
            body.style.width = '';
        }
        html.style.overflow = '';
        body.style.overflow = '';
        // 붙잡아 둔 동안 스크롤이 0으로 밀린 건 iOS뿐이다. 나머지는 그대로 남아 있다.
        if (IS_IOS) window.scrollTo(0, lockedScrollY);
    }
}

let overlayObserver = null;
let overlayChildObserver = null;

function watchOverlays() {
    let queued = false;
    const check = () => {
        if (queued) return;
        queued = true;
        // 한 번 열 때 여러 번 바뀌므로(class → style → 자식 추가) 한 프레임에 한 번만 본다.
        requestAnimationFrame(() => { queued = false; applyScrollLock(); });
    };

    // **body 바로 아래 것들만 본다.** 예전엔 subtree까지 통째로 봤는데, 표와 요약 카드를
    // 다시 그릴 때마다 관찰자가 수백 번 깨어나 매번 화면 크기를 재느라 폰이 버벅였다
    // (느린 안드로이드에서 눈에 띄게 끊겼다). 덮는 창은 언제나 body 바로 아래에 있으므로
    // .container 안쪽 변화는 볼 이유가 없다.
    overlayChildObserver = new MutationObserver(check);
    const watchChildren = () => {
        overlayChildObserver.disconnect();
        for (const el of document.body.children) {
            if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
            overlayChildObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
        }
        check();
    };

    // 창이 새로 붙거나 떨어지면 관찰 대상을 다시 맞춘다.
    overlayObserver = new MutationObserver(watchChildren);
    overlayObserver.observe(document.body, { childList: true });
    watchChildren();
    // 여는 순간 opacity가 0에서 시작하는 창이 있어, 화면 회전·리사이즈 때도 다시 본다.
    window.addEventListener('resize', check);
    check();
}

function forceTableReflow() {
    if (isTableTouched) return;
    const wrapper = document.getElementById('tableWrapper');
    if (!wrapper) return;
    const currentScroll = wrapper.scrollLeft;
    wrapper.style.overflowX = 'hidden';
    void wrapper.offsetHeight;
    wrapper.style.overflowX = 'auto';
    wrapper.scrollLeft = currentScroll;
}

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

    if (!q) return { group: '자주 가는 곳', list: mine.slice(0, COURSE_RESULT_LIMIT) };

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
        html += `<div class="course-empty">찾는 곳이 없으면 이름을 그대로 쓰면 됩니다.</div>`;
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
    document.getElementById('schCourseSearch').value = name;
    renderCourseResults();
    document.getElementById('courseResults').scrollTop = 0;
}

// 차수별 골프장 기억(payload.roundCourses). 키는 차수 번호(1부터), 값은 골프장 이름.
// 표의 `courses[]`와 따로 두는 이유: 차수를 지웠다 다시 만들어도 이름이 돌아와야 한다.
function roundCourseMap() {
    if (!appData.roundCourses || typeof appData.roundCourses !== 'object') appData.roundCourses = {};
    return appData.roundCourses;
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
    const now = new Date(); document.getElementById('schMonth').value = now.getMonth() + 1; document.getElementById('schDay').value = now.getDate();

    // 표에서 눌러 들어왔으면 그 차수, 아니면 지난번에 잡아 둔 차수,
    // 그것도 없으면 아직 안 친 다음 차수를 미리 고른다.
    const saved = parseInt(pickRound || appData.nextRoundNo, 10);
    const pick = (saved >= 1 && saved <= appData.totalRounds + 1) ? saved : appData.totalRounds + 1;
    renderScheduleRoundOptions(document.getElementById('schRound'), pick);

    // 고른 차수에 이미 정해진 곳이 있으면 그걸, 없으면 지난번에 고른 곳을 넣어 둔다.
    // (표에서 골프장 칸을 눌러 들어온 경우 그 차수의 이름이 그대로 떠야 한다.)
    const search = document.getElementById('schCourseSearch');
    search.value = roundCourseMap()[pick] || (appData.courses && appData.courses[pick - 1]) || lastScheduledCourse();

    const statusText = document.getElementById('courseLoadStatus');
    if (statusText) statusText.textContent = `전국 ${allCourses().length}곳에서 검색`;
    renderCourseResults(true);
}

// 저장돼 있는 일정 문구("8월 20일 오전 7:30 무등산CC")의 끝에 골프장 이름이 붙어 있다.
function lastScheduledCourse() {
    const text = String(appData.nextRoundDate || '');
    const m = text.match(/\d{1,2}:\d{2}\s+(.+)$/);
    return m ? m[1].trim() : '';
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
    if (!course) { showToast("⚠️ 골프장을 고르거나 이름을 입력해주세요!"); search.focus(); return; }
    saveState();
    // 목록에 없어 직접 친 곳은 남겨 둔다. 다음부터는 검색창을 열면 맨 위에 뜬다.
    if (!courseGeo(course)) rememberCourse(course);
    const m = parseInt(document.getElementById('schMonth').value, 10);
    const d = parseInt(document.getElementById('schDay').value, 10);
    const ampm = document.getElementById('schAmpm').value;
    const hh = document.getElementById('schHour').value;
    const mm = document.getElementById('schMinute').value;
    appData.nextRoundDate = `${m}월 ${d}일 ${ampm} ${hh}:${mm} ${course}`;
    // 표시용 문구에는 연도가 없어 알림이 연도를 알 수 없다. 별도로 남긴다.
    appData.nextRoundISO = resolveRoundDate(m, d);

    // 고른 차수에 골프장을 붙여 둔다 — 표의 골프장 칸을 따로 칠 필요가 없어진다.
    // 차수를 지웠다 다시 만들어도 roundCourses에 남아 있어 이름이 돌아온다.
    const roundNo = parseInt(document.getElementById('schRound').value, 10) || (appData.totalRounds + 1);
    appData.nextRoundNo = roundNo;
    roundCourseMap()[roundNo] = course;
    if (roundNo <= appData.totalRounds) {
        if (!appData.courses) appData.courses = [];
        appData.courses[roundNo - 1] = course;
    }

    syncToSupabase(appData); renderNoticeArea(); renderAll(); closeScheduleModal();
    showToast(roundNo <= appData.totalRounds
        ? `✅ ${roundNo}차 일정 저장 · 표의 골프장도 채웠습니다.`
        : `✅ ${roundNo}차 일정을 저장했습니다. 차수를 만들면 골프장이 자동으로 들어갑니다.`);
}

function renderAll() {
    renderTable();
    calculateAndRender();
    renderMoneyTable();
    forceTableReflow();
    jumpToLatestRound();
    renderStorageUsage();
    updateScoreRequestBtn();
    checkAndGreetUser();
    animateFinalTotals();
    checkRankChange();
    checkRoundResultReveal();
    checkEagleStreakCelebration();
}

// ─── 연출 세 가지 ───
// 공통 규칙: **한 번만 돌고 끝나야 하고, transform과 opacity만 움직여야 한다.**
// 계속 도는 애니메이션이나 filter·blur을 쓰면 안드로이드에서 화면이 끊기고 일부가 안 그려진다
// (실제로 그래서 뱃지의 무한 glow와 닫힌 모달의 blur을 걷어냈다).
//
// **입장 인사말이 걷힌 뒤에 시작한다.** 인사말이 3초 넘게 화면을 덮고 있어서,
// 그 뒤에서 카운트업(0.7초)이 혼자 끝나 버려 아무도 못 봤다.
//
// '인사말이 화면에 있는가'로 막으면 안 된다 — 표가 먼저 그려지고 인사말이 조금 뒤에
// 뜨는 순간이 있어서, 그 틈에 카운트업이 시작해 버린다(실제로 그랬다).
// 그래서 **인사말이 지나갔는가**를 한 번만 뒤집는 문으로 둔다.
let entranceReady = false;
let entranceFallback = null;

function entranceBlocked() {
    // 결과 발표가 떠 있는 동안에도 막는다 — 그 창이 화면을 덮고 있어서
    // 뒤에서 카운트업이 돌면 또 아무도 못 본다. 발표를 닫으면 그때 이어서 돈다.
    if (document.querySelector('.reveal-overlay')) return true;
    if (entranceReady) return false;
    // 인사말이 아예 안 뜨는 경우(이미 인사한 세션, 이름 미등록 등)에도 연출은 나와야 한다.
    if (!entranceFallback) entranceFallback = setTimeout(runEntranceEffects, 6000);
    return true;
}

// 인사말이 사라지는 순간 showGreeting()이 불러 준다.
function runEntranceEffects() {
    if (entranceReady) return;
    entranceReady = true;
    clearTimeout(entranceFallback);
    // 발표가 열리면 아래 셋은 entranceBlocked()에 막히고, 발표를 닫을 때 이어서 돈다.
    checkRoundResultReveal();
    afterRevealEffects();
}

function afterRevealEffects() {
    animateFinalTotals();
    checkRankChange();
    checkEagleStreakCelebration();
}

// 1) 합산 금액이 0에서 실제 값까지 굴러 올라간다. 접속당 한 번.
//    글자만 바꾸므로 그리기 비용이 사실상 없다.
// 저장할 때마다 실시간 이벤트가 되돌아와 요약 카드를 통째로 다시 그린다.
// 그래서 연출은 **다시 그려져도 살아남게** 만들어야 한다 —
// 붙여 둔 DOM을 들고 있지 말고, 매번 다시 찾아서 적용한다.
let countUpStarted = 0;   // 0이면 아직 시작 안 함

function animateFinalTotals() {
    if (countUpStarted || entranceBlocked()) return;
    if (document.querySelectorAll('.final-total[data-final]').length === 0) return;
    countUpStarted = performance.now();

    const DURATION = 700;
    const step = (now) => {
        const t = Math.min(1, (now - countUpStarted) / DURATION);
        const eased = 1 - Math.pow(1 - t, 3);   // 끝에서 부드럽게 멎는다
        // 다시 그려지면 예전 칸은 사라지므로 매 프레임 새로 찾는다.
        document.querySelectorAll('.final-total[data-final]').forEach(el => {
            const target = parseFloat(el.getAttribute('data-final')) || 0;
            // 만 원 단위로 끊어 올린다 — 1원 단위로 굴리면 글자가 정신없다.
            const v = Math.round(target * eased / 10000) * 10000;
            el.textContent = `합산: ${formatFinalBalance(t < 1 ? v : target)}`;
        });
        if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// 2) 계급이 바뀐 사람의 뱃지가 튀어오른다. 기기마다 그 변화당 한 번.
//    올라갔으면 위로 솟고, 떨어졌으면 아래로 툭 떨어진다.
// 무엇이 바뀌었는지는 한 번만 판정해 pendingRankBump에 담아 두고,
// 실제로 붙이는 건 다시 그릴 때마다 한다 (안 그러면 실시간 갱신에 지워진다).
let pendingRankBump = {};
let rankBumpChecked = false;

function checkRankChange() {
    if (typeof golferRankHistory === 'undefined' || entranceBlocked()) return;

    if (!rankBumpChecked) {
        let ready = false;
        golfers.forEach(name => {
            const ranks = golferRankHistory[name] || [];
            if (ranks.length === 0) return;
            ready = true;
            const now = ranks[ranks.length - 1];
            const key = `jtfag_rank_${name}`;
            const seen = localStorage.getItem(key);
            localStorage.setItem(key, `${ranks.length}:${now}`);
            if (!seen) return;                   // 처음 보는 기기면 조용히 넘어간다
            const [seenCount, seenRank] = seen.split(':').map(Number);
            if (seenCount === ranks.length || seenRank === now) return;
            // 숫자가 작을수록 높은 계급이다 (0 = 독수리).
            pendingRankBump[name] = now < seenRank ? 'rank-up' : 'rank-down';
        });
        if (ready) rankBumpChecked = true;
        // 연출은 잠깐이면 충분하다. 지나면 더 붙이지 않는다.
        if (Object.keys(pendingRankBump).length) setTimeout(() => { pendingRankBump = {}; }, 4000);
    }

    Object.keys(pendingRankBump).forEach(name => {
        const card = [...document.querySelectorAll('.summary-item')]
            .find(el => (el.querySelector('.name') || {}).textContent === name);
        const badge = card && card.querySelector('.rank-badge');
        if (badge && !badge.classList.contains(pendingRankBump[name])) {
            badge.classList.add(pendingRankBump[name]);
        }
    });
}

// 3) 새 차수 결과가 처음 보이면 4위부터 1위까지 차례로 공개한다.
//    기기마다 그 차수당 한 번. 이미 아는 결과라도 순서대로 까 보는 맛이 있다.
function checkRoundResultReveal() {
    if (typeof lastRankedRound === 'undefined' || lastRankedRound < 0) return;
    if (entranceBlocked()) return;
    if (document.querySelector('.reveal-overlay, .celebrate-overlay')) return;

    const key = 'jtfag_result_seen';
    const seen = parseInt(localStorage.getItem(key), 10);
    if (seen === lastRankedRound) return;
    localStorage.setItem(key, String(lastRankedRound));
    if (!Number.isFinite(seen)) return;          // 처음 보는 기기면 예전 차수까지 들출 이유가 없다

    const order = golfers.slice().sort((a, b) => {
        const ra = (golferRankHistory[a] || []).slice(-1)[0];
        const rb = (golferRankHistory[b] || []).slice(-1)[0];
        return ra - rb;
    });
    revealRoundResult(lastRankedRound, order);
}

function revealRoundResult(roundIdx, order) {
    const rows = order.map((name, i) => {
        const info = RANK_CONFIG[i] || RANK_CONFIG[3];
        const gross = (appData.scores[name] && appData.scores[name][roundIdx]) || '';
        return `<div class="reveal-row" style="animation-delay:${0.35 + (order.length - 1 - i) * 0.5}s">
            <span class="reveal-place">${i + 1}위</span>
            <span class="reveal-name">${escapeHtml(name)}</span>
            <span class="rank-badge ${info.class} reveal-rank">${info.icon} ${info.name}</span>
            <span class="reveal-gross">${gross !== '' ? gross + '타' : ''}</span>
        </div>`;
    }).reverse();   // 4위가 먼저 그려지고, 1위가 맨 위에 마지막으로 뜬다

    const overlay = document.createElement('div');
    overlay.className = 'reveal-overlay';
    overlay.innerHTML = `
        <div class="reveal-card">
            <div class="reveal-title">🥁 ${roundIdx + 1}차전 결과</div>
            <div class="reveal-rows">${rows.join('')}</div>
            <button type="button" class="reveal-close">확인</button>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));

    // 1위가 뜨는 순간 색종이를 뿌린다. 마지막 줄의 등장 시각에 맞춘다.
    const finale = 350 + (order.length - 1) * 500 + 400;
    const timers = [setTimeout(() => dropConfetti(overlay, 60), finale)];

    const close = () => {
        timers.forEach(clearTimeout);
        overlay.classList.remove('on');
        // 창이 완전히 걷힌 뒤에 카운트업·계급 변동을 이어서 보여 준다.
        setTimeout(() => { overlay.remove(); afterRevealEffects(); }, 300);
    };
    overlay.onclick = close;
}

// ─── 독수리 연속 달성 축포 ───
// 모임에서 크게 축하하기로 한 기록이라 뱃지만으로는 모자라 화면 전체로 터뜨린다.
// 기기마다 사람·연속수 조합당 딱 한 번만 뜬다 — 접속할 때마다 뜨면 축하가 아니라 방해다.
// (4연속이 되면 키가 달라지므로 그때 또 한 번 뜬다.)
const CONFETTI_COLORS = ['#fbbf24', '#f59e0b', '#fde68a', '#ffffff', '#34d399', '#60a5fa', '#f472b6'];

// 색종이는 결과 발표와 독수리 축포가 함께 쓴다.
// transform만 움직이므로 80장을 뿌려도 안드로이드에서 안 끊긴다.
function dropConfetti(host, count, colors) {
    const palette = colors && colors.length ? colors : CONFETTI_COLORS;
    for (let i = 0; i < count; i++) {
        const bit = document.createElement('div');
        bit.className = 'confetti';
        bit.style.left = (Math.random() * 100) + 'vw';
        bit.style.backgroundColor = palette[i % palette.length];
        bit.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
        bit.style.animationDelay = (Math.random() * 1.4) + 's';
        if (Math.random() < 0.35) bit.style.borderRadius = '50%';
        host.appendChild(bit);
    }
}

function checkEagleStreakCelebration() {
    if (typeof eagleStreak !== 'function' || typeof golferRankHistory === 'undefined') return;
    if (entranceBlocked()) return;
    if (document.querySelector('.celebrate-overlay, .reveal-overlay')) return;
    for (const name of golfers) {
        const streak = eagleStreak(golferRankHistory[name] || []);
        if (streak < 3) continue;
        const key = `jtfag_eagle_${name}_${streak}`;
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, '1');
        celebrateEagleStreak(name, streak);
        return;   // 한 번에 하나만. 둘이 동시에 달성했으면 나머지는 다음 접속 때 뜬다
    }
}

/* 독수리 연속 달성 축포.
   모임에서 크게 축하하기로 한 기록이라 화면을 통째로 쓴다 —
   독수리가 하늘에서 날아 내려오고 울음소리가 함께 난다.

   **여기서도 transform과 opacity만 움직인다.** 화면을 꽉 채우는 연출이라
   filter나 blur을 쓰면 안드로이드가 그대로 주저앉는다. 날갯짓도 회전(transform)이고
   반복 횟수가 정해져 있어 6.5초 뒤 창과 함께 사라진다 — 무한 반복이 남지 않는다.

   소리는 막힐 수 있다(브라우저가 사용자 동작 없는 자동 재생을 막는다).
   막혀도 그림은 그대로 나오고 오류창도 안 띄운다. 뱃지를 눌러서 볼 때는
   누른 동작이 있으니 반드시 난다. */
function playEagleCry() {
    if (!SOUND_CONFIG[0]) return;
    try {
        const audio = new Audio(SOUND_CONFIG[0]);
        audio.volume = 0.7;
        audio.play().catch(e => console.log("독수리 소리 재생 실패:", e));
    } catch (e) { /* 소리가 안 나도 축하는 계속된다 */ }
}

/* 앞에서 본 흰머리수리. 날개는 따로 묶어 두어 몸통과 별개로 회전시킨다(날갯짓).

   **병아리처럼 보이지 않게 하는 건 비율이다.** 머리가 크고 날개가 짧으면 아기 새가 된다.
   그래서 날개폭을 몸통의 다섯 배 가까이 벌리고, 머리는 작게 두고, 날개를 위로 살짝
   들어 올려(솟아오르는 V자) 활공하는 자세로 잡았다. 머리를 키우지 말 것.

   독수리로 읽히게 하는 나머지는 **흰 머리 · 갈고리 부리 · 갈라진 날개 끝 · 사나운 눈썹**이다.
   눈썹을 빼면 순한 새가 되므로 빼지 말 것. */
function eagleSvg() {
    // 어깨에서 위로 뻗어 나가 끝이 다섯 갈래로 갈라지는 날개 (왼쪽 기준, 오른쪽은 뒤집어 쓴다)
    const wing = `M 138 58
        C 116 44, 78 26, 40 18
        L 12 10  L 40 26
        L 8 26   L 40 38
        L 14 44  L 44 52
        L 26 62  L 56 62
        L 44 76  L 74 66
        C 98 60, 124 62, 138 66 Z`;
    return `
    <svg class="eg-bird" viewBox="0 0 300 165" aria-hidden="true">
      <defs>
        <linearGradient id="egBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8a5a1b"/><stop offset="45%" stop-color="#5c2a0c"/><stop offset="100%" stop-color="#2e1206"/>
        </linearGradient>
        <linearGradient id="egWing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fde68a"/><stop offset="38%" stop-color="#c98b25"/><stop offset="100%" stop-color="#5c2a0c"/>
        </linearGradient>
        <linearGradient id="egHead" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#dbe2ea"/>
        </linearGradient>
      </defs>

      <g class="eg-wing eg-wl"><path d="${wing}" fill="url(#egWing)"/></g>
      <g class="eg-wing eg-wr"><path d="${wing}" fill="url(#egWing)" transform="translate(300,0) scale(-1,1)"/></g>

      <!-- 부챗살처럼 펼친 꼬리 -->
      <path d="M 138 104 L 162 104 L 170 148 L 159 138 L 155 152 L 150 140 L 145 152 L 141 138 L 130 148 Z" fill="url(#egWing)"/>

      <!-- 몸통. 가슴은 넓고 아래로 갈수록 좁아진다 -->
      <path d="M 150 44 C 164 44, 172 54, 171 66 L 167 92 L 160 110 L 150 118 L 140 110 L 133 92 L 129 66 C 128 54, 136 44, 150 44 Z" fill="url(#egBody)"/>
      <!-- 가슴 깃 결 -->
      <path d="M 150 62 L 156 76 L 150 90 L 144 76 Z" fill="#3f1c08" opacity="0.55"/>

      <!-- 흰 머리. 작게 둘 것 — 키우면 아기 새가 된다 -->
      <path d="M 150 20 C 161 20, 168 28, 168 37 C 168 45, 160 50, 150 50 C 140 50, 132 45, 132 37 C 132 28, 139 20, 150 20 Z" fill="url(#egHead)"/>
      <!-- 사나운 눈매 -->
      <path d="M 136 29 L 147 34 L 147 38 L 136 33 Z" fill="#4a2109"/>
      <path d="M 164 29 L 153 34 L 153 38 L 164 33 Z" fill="#4a2109"/>
      <circle cx="141" cy="37" r="2.7" fill="#f59e0b"/><circle cx="159" cy="37" r="2.7" fill="#f59e0b"/>
      <circle cx="141" cy="37" r="1.4" fill="#111827"/><circle cx="159" cy="37" r="1.4" fill="#111827"/>
      <!-- 끝이 아래로 굽은 갈고리 부리 -->
      <path d="M 143 42 L 157 42 L 155 52 C 154 59, 151 63, 147 64 C 150 59, 151 54, 148 50 L 144 48 Z" fill="#facc15"/>
    </svg>`;
}

/* 연출은 기기마다 한 번만 뜬다 — 접속할 때마다 뜨면 축하가 아니라 방해다.
   그 '봤다' 표시가 localStorage에 남아 있어서, 차수를 지웠다 다시 만들어도
   축포가 다시 뜨지 않는다(실제로 이것 때문에 안 나온다는 문의가 있었다).

   이 버튼은 **표시만 지운다.** 타수·금액·사진 어느 것도 건드리지 않는다. */
function resetEffectSeen() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('jtfag_eagle_') || k.startsWith('jtfag_rank_') || k === 'jtfag_result_seen')) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
    showToast(keys.length
        ? `🎬 연출 표시 ${keys.length}개를 지웠습니다. 새로고침하면 다시 나옵니다.`
        : "🎬 지울 표시가 없습니다. 새로고침하면 나옵니다.");
}

/* 연속수에 따라 축포도 등급이 갈린다 — 뱃지(금 → 불꽃 → 전설)와 같은 언어다.
   둘이 어긋나면 '급이 올라갔다'가 전해지지 않는다.
   바뀌는 건 색과 문구뿐이라 그리기 비용은 그대로다. */
const EAGLE_TIERS = [
    {
        min: 5, cls: 'eg-legend', mark: '👑',
        sub: n => `${n}경기 연속 독수리.<br><b>JTFAG의 전설입니다</b> 👑`,
        confetti: 150, colors: ['#fde68a', '#fbbf24', '#c084fc', '#a78bfa', '#ffffff', '#7c3aed']
    },
    {
        min: 4, cls: 'eg-fire', mark: '🔥',
        sub: n => `${n}번을 내리 1등.<br><b>이제 말릴 사람이 없습니다</b> 🔥`,
        confetti: 120, colors: ['#fbbf24', '#f59e0b', '#ef4444', '#fca5a5', '#ffffff', '#dc2626']
    },
    {
        min: 3, cls: '', mark: '',
        sub: n => `독수리 ${n}경기 연속 달성!<br>모두 축하해 주세요 🎉`,
        confetti: 90, colors: null
    }
];

function eagleTier(streak) {
    return EAGLE_TIERS.find(t => streak >= t.min) || EAGLE_TIERS[EAGLE_TIERS.length - 1];
}

/* 연속한 만큼 독수리 도장을 한 줄로 찍는다.
   숫자만으로는 4와 5의 차이가 잘 안 느껴지는데, 도장이 하나씩 톡톡 박히면
   '쭉 이어졌다'가 눈에 들어온다. 열 개가 넘어도 줄만 길어지지 화면은 안 깨진다.
   찍히는 시각은 인라인 delay로 준다 — 개수가 정해져 있지 않아 CSS로는 못 적는다. */
const STAMP_START = 1.75, STAMP_GAP = 0.1;

function eagleStamps(streak) {
    const n = Math.min(streak, 12);       // 열두 개가 넘으면 줄이 두 줄로 넘어간다
    const last = STAMP_START + (n - 1) * STAMP_GAP;
    const more = streak > n
        ? `<span class="eg-stamp-more" style="animation-delay:${(last + STAMP_GAP).toFixed(2)}s">+${streak - n}</span>`
        : '';
    return `<div class="eg-stamps">` +
        Array.from({ length: n }, (_, i) =>
            `<span class="eg-stamp" style="animation-delay:${(STAMP_START + i * STAMP_GAP).toFixed(2)}s">🦅</span>`).join('') +
        more + `</div>`;
}

// 도장이 다 찍힌 뒤에 아래 문구가 올라와야 순서가 맞는다.
// 개수만큼 늦춰야 하므로 CSS에 못 적고 인라인으로 준다.
function eagleSubDelay(streak) {
    return STAMP_START + (Math.min(streak, 12) - 1) * STAMP_GAP + 0.35;
}

function celebrateEagleStreak(name, streak) {
    const existing = document.querySelector('.celebrate-overlay');
    if (existing) existing.remove();

    // 사진(EAGLE_HERO_URL)이 있으면 가로를 꽉 채우는 시네마 밴드로 깐다.
    //
    // **화면 전체를 덮지 않는 이유가 있다.** 받은 그림이 가로형(498x389)이라
    // 세로 화면에 cover로 깔면 양옆이 잘려 독수리 머리가 반토막 난다.
    // 가로만 맞추면 원본보다 작게 그려져 선명하기까지 하다.
    //
    // 밴드 위아래는 그라데이션으로 어둠에 녹인다 — `mask`를 쓰면 매 프레임
    // 다시 합성되므로(GIF는 계속 바뀐다) 그냥 그라데이션 조각을 덮는다.
    const photo = EAGLE_HERO_URL;
    const tier = eagleTier(streak);
    const overlay = document.createElement('div');
    overlay.className = 'celebrate-overlay' + (photo ? ' eg-photo-mode' : '') + (tier.cls ? ' ' + tier.cls : '');
    overlay.innerHTML = `
        <div class="eg-ring"></div>
        <div class="eg-ring eg-ring2"></div>
        <div class="eg-stage">
            ${photo ? `
            <div class="eg-band">
                <img class="eg-photo" src="${photo}" alt="">
                <div class="eg-band-fade eg-band-top"></div>
                <div class="eg-band-fade eg-band-bot"></div>
                <div class="eg-band-line eg-band-line-t"></div>
                <div class="eg-band-line eg-band-line-b"></div>
            </div>` : eagleSvg()}
            <div class="eg-count">${streak}<span>연속</span>${tier.mark ? `<b class="eg-mark">${tier.mark}</b>` : ''}</div>
            <div class="eg-title">독 수 리</div>
            <div class="eg-name">${escapeHtml(name)}</div>
            ${eagleStamps(streak)}
            <div class="eg-sub" style="animation-delay:${eagleSubDelay(streak).toFixed(2)}s">${tier.sub(streak)}</div>
        </div>
        <div class="eg-skip">화면을 누르면 닫힙니다</div>`;

    // 사진을 못 받아오면(주소가 바뀌었거나 오프라인) 앱이 그린 독수리로 되돌아간다.
    const img = overlay.querySelector('.eg-photo');
    if (img) img.onerror = () => {
        overlay.classList.remove('eg-photo-mode');
        const band = overlay.querySelector('.eg-band');
        if (band) band.remove();
        overlay.querySelector('.eg-stage').insertAdjacentHTML('afterbegin', eagleSvg());
    };

    dropConfetti(overlay, tier.confetti, tier.colors);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));
    playEagleCry();

    // 사진은 천천히 밀고 들어오는 맛이 있어 조금 더 오래 둔다.
    let timer = null;
    const close = () => { clearTimeout(timer); overlay.classList.remove('on'); setTimeout(() => overlay.remove(), 300); };
    overlay.onclick = close;
    timer = setTimeout(close, photo ? 8000 : 6500);
}

// 접속하면 표를 맨 오른쪽으로 밀어 둔다 — 궁금한 건 방금 친 차수라서다.
// 딱 한 번만 한다. 남이 값을 고쳐 실시간 갱신이 들어올 때마다 밀어 버리면
// 앞 차수를 보고 있던 사람의 화면이 튄다.
let jumpedToLatestRound = false;

function jumpToLatestRound() {
    if (jumpedToLatestRound) return;
    const wrapper = document.getElementById('tableWrapper');
    // 아직 표가 안 그려졌으면(뼈대만 있을 때) 다음 렌더에 다시 해 본다.
    if (!wrapper || wrapper.scrollWidth <= wrapper.clientWidth) return;
    jumpedToLatestRound = true;

    // 부드럽게 밀지 않는다. 처음 보이는 화면은 이미 오른쪽이어야 한다.
    const toEnd = () => { if (!isTableTouched) wrapper.scrollLeft = wrapper.scrollWidth; };
    toEnd();
    // 글꼴이 늦게 붙으면 표 폭이 달라진다. 자리를 두 번 더 맞춘다.
    requestAnimationFrame(toEnd);
    setTimeout(toEnd, 400);
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

function changeMoneyRound(idxVal) { selectedMoneyRoundIdx = parseInt(idxVal, 10); renderMoneyTable(); }

// 차수 목록을 드롭다운에 채운다. 차수가 늘어도 화면이 커지지 않는다 —
// 예전엔 칩을 격자로 늘어놓는 창이었는데, 스무 개가 되면 감당이 안 된다.
function renderMoneyRoundOptions(select) {
    const want = [];
    for (let r = 0; r < appData.totalRounds; r++) {
        const course = (appData.courses && appData.courses[r]) ? appData.courses[r].trim() : "";
        want.push(`${r + 1}차전${course ? ` · ${course}` : ""}`);
    }
    // 내용이 그대로면 다시 만들지 않는다 (실시간 갱신 때마다 목록이 껌뻑인다).
    if (select.getAttribute('data-labels') === want.join('|')) {
        select.value = String(selectedMoneyRoundIdx);
        return;
    }
    select.innerHTML = "";
    want.forEach((label, r) => select.add(new Option(label, r)));
    select.setAttribute('data-labels', want.join('|'));
    select.value = String(selectedMoneyRoundIdx);
}

// 정산 금액 뱃지. 계급정산·타수정산이 같은 함수를 쓰므로 두 칸이 어긋날 수 없다.
function moneyResultTone(v) { return v > 0 ? 'pos' : (v < 0 ? 'neg' : 'zero'); }
function moneyResultText(v) { return v === 0 ? "0원" : (v > 0 ? "+" : "") + (v / 10000).toFixed(1) + "만"; }
function paintMoneyResult(el, v) {
    if (!el) return;
    el.className = `money-result-badge ${moneyResultTone(v)}`;
    el.textContent = moneyResultText(v);
}

// 남의 칸은 readonly로 두고 누르면 왜 안 되는지 알려 준다.
// pointer-events를 끄지 않는 이유가 그것이다 — 아무 반응이 없으면 고장으로 보인다.
function moneyCell(g, type, value) {
    const editable = canEditMoney(g);
    return `<input type="text" id="money_${type}_${g}" inputmode="numeric" pattern="[0-9]*"
        class="money-input${editable ? '' : ' locked'}" value="${formatNumber(value)}"
        ${editable ? '' : 'readonly '}onfocus="this.select()"
        ${editable
            ? `onchange="updateMoney('${g}', '${type}', this.value)"`
            : `onclick="moneyLockNotice('${g}')"`}>`;
}

function renderMoneyTable() {
    const tbody = document.getElementById('moneyTbody');
    const roundSelect = document.getElementById('moneyRoundSelect');

    if (!tbody || !roundSelect) return;

    renderMoneyRoundOptions(roundSelect);

    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.roundMoney[selectedMoneyRoundIdx]) {
        appData.roundMoney[selectedMoneyRoundIdx] = {};
        golfers.forEach(g => appData.roundMoney[selectedMoneyRoundIdx][g] = { start: 0, end: 0 });
    }

    // 잠금 상태가 바뀌면 칸을 다시 만들어야 한다 — 아래 빠른 길은 값만 갈아 끼운다.
    const lockKey = `${isMoneyUnlocked ? 'all' : myGolferName() || 'none'}`;

    if (tbody.children.length === golfers.length
        && tbody.getAttribute('data-round') === String(selectedMoneyRoundIdx)
        && tbody.getAttribute('data-lock') === lockKey) {
        golfers.forEach(g => {
            const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
            const sInput = document.getElementById(`money_start_${g}`);
            const eInput = document.getElementById(`money_end_${g}`);
            if (sInput && document.activeElement !== sInput) sInput.value = formatNumber(m.start);
            if (eInput && document.activeElement !== eInput) eInput.value = formatNumber(m.end);
            
            const rankPenalty = (cachedRoundRankProfit[g] && cachedRoundRankProfit[g][selectedMoneyRoundIdx] !== undefined) ? cachedRoundRankProfit[g][selectedMoneyRoundIdx] : 0;
            const pureStrokeDiff = (m.start === 0 && m.end === 0) ? 0 : ((m.end - m.start) - rankPenalty);
            
            paintMoneyResult(document.getElementById(`money_rank_${g}`), rankPenalty);
            paintMoneyResult(document.getElementById(`money_stroke_${g}`), pureStrokeDiff);
        });
        return;
    }

    tbody.setAttribute('data-round', String(selectedMoneyRoundIdx));
    tbody.setAttribute('data-lock', lockKey);
    tbody.innerHTML = "";
    golfers.forEach(g => {
        const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
        const rankPenalty = (cachedRoundRankProfit[g] && cachedRoundRankProfit[g][selectedMoneyRoundIdx] !== undefined) ? cachedRoundRankProfit[g][selectedMoneyRoundIdx] : 0;
        const pureStrokeDiff = (m.start === 0 && m.end === 0) ? 0 : ((m.end - m.start) - rankPenalty);

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:800; color:var(--text-main);">${g}</td>
                <td>${moneyCell(g, 'start', m.start)}</td>
                <td>${moneyCell(g, 'end', m.end)}</td>
                <td><span id="money_rank_${g}" class="money-result-badge ${moneyResultTone(rankPenalty)}">${moneyResultText(rankPenalty)}</span></td>
                <td><span id="money_stroke_${g}" class="money-result-badge ${moneyResultTone(pureStrokeDiff)}">${moneyResultText(pureStrokeDiff)}</span></td>
            </tr>`;
    });
}

/* ── 정산 금액은 본인 칸만 ───────────────────────────────────────
   6차 정산 금액이 남의 손에 지워진 일이 있었다. 이제 시작·남은 금액은
   `jtfag_my_name`이 그 사람일 때만 열린다.

   이건 보안이 아니라 **실수 방지 장치**다 — jtfag_my_name은 누구나 바꿀 수 있고
   서버는 접속자를 구분하지 못한다. 무심코 남의 줄을 건드리는 걸 막는 게 목적이다.

   관리자는 `💰 정산 금액 전체 수정`으로 잠시 열 수 있다. 이 문이 없으면
   동반자 폰이 없을 때 아무도 고칠 수 없게 되어 오히려 곤란해진다. */
function myGolferName() {
    const n = localStorage.getItem('jtfag_my_name');
    return golfers.includes(n) ? n : '';
}

function canEditMoney(name) {
    return isMoneyUnlocked || name === myGolferName();
}

function moneyLockNotice(name) {
    const me = myGolferName();
    showToast(me
        ? `🔒 ${name}님 칸은 본인만 입력할 수 있습니다.`
        : `🔒 먼저 본인 이름을 정해주세요. (설정 → 내 이름)`);
}

function toggleMoneyEdit() {
    isMoneyUnlocked = !isMoneyUnlocked;
    renderMoneyTable();
    renderAdminModal();
    showToast(isMoneyUnlocked
        ? "💰 정산 금액 칸을 모두 열었습니다."
        : "🔒 정산 금액은 다시 본인 칸만 열립니다.");
}

function updateMoney(name, type, value) {
    // 화면이 막고 있어도 여기서 한 번 더 본다 — 이 함수가 유일한 입구다.
    if (!canEditMoney(name)) { moneyLockNotice(name); renderMoneyTable(); return; }
    saveState();
    if (!appData.roundMoney[selectedMoneyRoundIdx]) appData.roundMoney[selectedMoneyRoundIdx] = {};
    if (!appData.roundMoney[selectedMoneyRoundIdx][name]) appData.roundMoney[selectedMoneyRoundIdx][name] = { start: 0, end: 0 };
    const after = parseNumber(value);
    appData.roundMoney[selectedMoneyRoundIdx][name][type] = after;
    syncToSupabase(appData); renderAll();
}

// ─── 타수 자동 입력 ───
// 타수는 사람이 넣지 않는다. 스코어카드를 판독해 stats.js의 ROUND_HOLES에 넣으면
// par + rel 합계가 그 차수의 그로스가 되고, 그 값이 appData.scores로 흘러들어간다.
// 핸디캡·정산·평균은 예전처럼 appData.scores를 읽으므로 아래 계산은 손대지 않아도 된다.

function hasHoleRecord(r) {   // r은 0부터 시작하는 차수 인덱스
    return typeof ROUND_HOLES !== 'undefined' && !!ROUND_HOLES[String(r + 1)];
}

// 잠긴 칸인가. 홀 기록이 있는 차수는 관리자가 열어도 잠긴 채로 둔다 —
// 손으로 고쳐 봐야 다음 접속 때 홀 기록 값으로 되돌아가기 때문이다.
function isScoreCellLocked(r) {
    return hasHoleRecord(r) || !isScoreUnlocked;
}

// 홀 기록에서 뽑은 그로스를 appData.scores에 반영한다. 실제로 바뀐 게 있을 때만 true.
function syncScoresFromHoles() {
    if (typeof grossFromHoles !== 'function') return false;
    let changed = false;
    if (!appData.scores) appData.scores = {};
    for (let r = 0; r < appData.totalRounds; r++) {
        if (!hasHoleRecord(r)) continue;
        golfers.forEach(name => {
            const gross = grossFromHoles(r + 1, name);
            if (gross === null) return;
            if (!appData.scores[name]) appData.scores[name] = [];
            if (appData.scores[name][r] !== gross) { appData.scores[name][r] = gross; changed = true; }
        });
    }
    return changed;
}

// 없앤 기능이 payload에 남긴 필드를 한 번 걷어낸다.
//   changeLogs  — 변경 이력(공금 기록은 fundLogs에 따로 있다)
//   guestRounds — 게스트 라운드 표시
function dropRetiredFields() {
    let dropped = false;
    ['changeLogs', 'guestRounds'].forEach(key => {
        if (key in appData) { delete appData[key]; dropped = true; }
    });
    return dropped;
}

// 값이 달라졌을 때만 저장한다. 4명이 동시에 접속해도 첫 한 명만 쓰고 나머지는 조용하다.
function applyHoleScores() {
    const changed = syncScoresFromHoles();
    const filled = applyRoundCourses();
    const dropped = dropRetiredFields();
    if (changed || filled || dropped) syncToSupabase(appData);
}

function toggleScoreEdit() {
    isScoreUnlocked = !isScoreUnlocked;
    renderTable();
    renderAdminModal();
    showToast(isScoreUnlocked
        ? "✏️ 타수 칸을 열었습니다. 홀 기록이 있는 차수는 그대로 잠깁니다."
        : "🔒 타수 칸을 다시 잠갔습니다.");
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
                if (!sInput) continue;
                if (document.activeElement !== sInput) sInput.value = (appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : "";
                const locked = isScoreCellLocked(r);
                sInput.readOnly = locked;
                sInput.classList.toggle('locked', locked);
            }
        });
        return;
    }

    let headerHtml = `<th class="sticky-col-1">이름</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        // 골프장은 사람이 여기서 치지 않는다 — 일정에서 차수를 고르면 저절로 채워진다.
        // 칸을 눌렀을 때 그 차수 일정이 열리게 해 둔다(고칠 길이 있어야 한다).
        headerHtml += `<th><div class="header-round-title">${r + 1}차</div><div class="course-slot" onclick="openScheduleForRound(${r})"><input type="text" id="course_input_${r}" class="course-input locked" readonly value="${(appData.courses && appData.courses[r]) ? appData.courses[r] : ""}" placeholder="골프장"></div><div id="photo_btn_${r}" class="photo-btn" onclick="openRoundPhotoModal(${r})">📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장</div></th>`;
    }
    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap;">- 평균</th>`;
    headerRow.innerHTML = headerHtml;

    tbody.innerHTML = "";
    golfers.forEach(name => {
        const tr = document.createElement('tr'); tr.setAttribute('data-name', name);
        let rowHtml = `<td class="golfer-name sticky-col-1">${name}</td>`;
        for (let r = 0; r < appData.totalRounds; r++) {
            const locked = isScoreCellLocked(r);
            rowHtml += `<td class="score-cell"><input type="text" id="score_input_${name}_${r}" inputmode="numeric" pattern="[0-9]*" class="score-input${locked ? ' locked' : ''}"${locked ? ' readonly' : ''} value="${(appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : ""}" placeholder="타수" onfocus="this.select()" onchange="updateScore('${name}', ${r}, this.value)"></td>`;
        }
        rowHtml += `<td class="avg-cell"><span class="avg-pill empty">-</span></td>`;
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

function updateScore(name, r, val) {
    // readonly 칸은 onchange가 안 뜨지만, 잠금 상태가 바뀌는 순간을 대비해 한 번 더 막는다.
    // renderTable()은 커서가 놓인 칸을 건너뛰므로, 여기서 그 칸을 직접 되돌린다.
    if (isScoreCellLocked(r)) {
        const cell = document.getElementById(`score_input_${name}_${r}`);
        if (cell) cell.value = (appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : "";
        return;
    }
    saveState(); if (!appData.scores) appData.scores = {}; if (!appData.scores[name]) appData.scores[name] = [];
    const after = val === "" ? "" : parseNumber(val);
    appData.scores[name][r] = after; syncToSupabase(appData); renderAll();
}

function addRound() {
    saveState(); appData.totalRounds++;
    // 일정에서 이 차수 골프장을 미리 잡아 뒀으면 그걸 넣는다.
    if (!appData.courses) appData.courses = []; appData.courses.push(roundCourseMap()[appData.totalRounds] || "");
    if (!appData.roundPhotos) appData.roundPhotos = []; appData.roundPhotos.push([]);
    golfers.forEach(g => { if (!appData.scores[g]) appData.scores[g] = []; appData.scores[g].push(""); });
    const newRoundMoney = {}; golfers.forEach(g => newRoundMoney[g] = { start: 0, end: 0 });
    if (!appData.roundMoney) appData.roundMoney = []; appData.roundMoney.push(newRoundMoney);
    selectedMoneyRoundIdx = appData.totalRounds - 1;
    syncToSupabase(appData); renderAll(); showToast(`➕ ${appData.totalRounds}차전이 추가되었습니다.`);
    setTimeout(() => { const wrapper = document.getElementById('tableWrapper'); if(wrapper) wrapper.scrollTo({ left: wrapper.scrollWidth + 1000, behavior: 'smooth' }); }, 150);
}

// 마지막 차수를 지운다. 무엇이 사라지는지 먼저 보여 주고 한 번 더 묻는다 —
// 사진이 붙은 차수를 무심코 지웠다가 되돌리기가 실시간 갱신에 밀려
// 사진이 통째로 안 보이게 된 적이 있다.
async function removeRound() {
    if (appData.totalRounds <= 2) { showToast("⚠️ 최소 2개 라운드는 유지되어야 합니다."); return; }

    const r = appData.totalRounds - 1;
    const course = (appData.courses && appData.courses[r] || '').trim();
    const photos = (appData.roundPhotos && appData.roundPhotos[r] || []).length;
    const scored = golfers.filter(g => {
        const v = appData.scores[g] && appData.scores[g][r];
        return v !== "" && v !== undefined && !isNaN(parseFloat(v));
    }).length;

    const parts = [];
    if (course) parts.push(escapeHtml(course));
    if (scored) parts.push(`타수 ${scored}명`);
    if (photos) parts.push(`<b style="color:#fca5a5;">사진 ${photos}장</b>`);
    const detail = parts.length ? parts.join(' · ') : '아직 아무것도 없음';

    const ok = await showConfirmPrompt(
        `${r + 1}차전을 지울까요?<br>` +
        `<span style="font-size:0.78rem; font-weight:600; color:#cbd5e1;">${detail}</span>` +
        (photos ? `<br><span style="font-size:0.72rem; font-weight:600; color:#94a3b8;">되돌리기가 실시간 갱신에 밀리면 목록이 사라질 수 있습니다.</span>` : ''),
        "지우기");
    if (!ok) return;

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

/* ── 알림 받는 기기 ───────────────────────────────────────────────
   push_subscriptions에 남아 있는 구독을 그대로 보여 준다. 사람 수가 아니라
   기기 수다 — 한 사람이 폰과 PC로 따로 구독하면 두 줄이 된다.
   기기를 바꾸거나 앱을 지워도 예전 구독이 남아 있을 수 있는데, 그런 건
   발송할 때 만료(404/410)로 확인되면 scripts/push.js가 알아서 지운다. */

let pushSubsCache = [];
let pushSubsMine = null;

function closePushSubsModal() { document.getElementById('pushSubsModal').classList.remove('active'); }

async function openPushSubsModal() {
    const content = document.getElementById('pushSubsContent');
    if (!content) return;
    content.innerHTML = `<div class="subs-empty">불러오는 중…</div>`;
    document.getElementById('pushSubsModal').classList.add('active');

    try {
        pushSubsCache = await listPushSubscriptions();
    } catch (err) {
        content.innerHTML = `<div class="subs-empty">⚠️ ${escapeHtml(err.message)}</div>`;
        return;
    }
    // 이 기기가 목록의 어느 줄인지 표시해 준다.
    pushSubsMine = null;
    try {
        const sub = await getPushSubscription();
        if (sub) pushSubsMine = sub.endpoint;
    } catch (e) { /* 이 기기 표시는 못 해도 목록은 보여 준다 */ }

    renderPushSubs();
}

function renderPushSubs() {
    const content = document.getElementById('pushSubsContent');
    if (!content) return;

    if (pushSubsCache.length === 0) {
        content.innerHTML = `<div class="subs-empty">알림을 받는 기기가 없습니다.<br>공지 카드의 🔔 버튼으로 켤 수 있습니다.</div>`;
        return;
    }

    // 사람별로 묶어 보여 준다. 이름을 안 남긴 구독은 맨 뒤로.
    const byName = {};
    pushSubsCache.forEach((s, i) => {
        const key = s.name || '이름 없음';
        (byName[key] = byName[key] || []).push({ sub: s, idx: i });
    });
    const order = golfers.filter(n => byName[n]).concat(Object.keys(byName).filter(n => !golfers.includes(n)));

    content.innerHTML =
        `<div class="subs-total">전체 <b>${pushSubsCache.length}</b>대 · ${order.length}명</div>` +
        order.map(name => `
            <div class="subs-person">
                <div class="subs-name">${escapeHtml(name)} <span class="subs-count">${byName[name].length}대</span></div>
                ${byName[name].map(({ sub, idx }) => {
                    const me = sub.endpoint === pushSubsMine;
                    return `<div class="subs-device${me ? ' me' : ''}">
                        <span class="subs-device-name">${escapeHtml(pushEndpointLabel(sub.endpoint))}</span>
                        ${me ? '<span class="subs-me-tag">이 기기</span>' : ''}
                        <button type="button" class="subs-del" onclick="removePushSub(${idx})" title="이 기기 알림 끄기">✕</button>
                    </div>`;
                }).join('')}
            </div>`).join('') +
        `<div class="subs-note">✕를 누르면 그 기기는 알림을 더 받지 않습니다. 본인이 다시 켜면 되살아납니다.<br>
         기기를 바꾸거나 앱을 지워 못 쓰게 된 구독은, 다음 알림을 보낼 때 확인되면 저절로 정리됩니다.</div>`;
}

// 남의 기기를 지우면 그 사람은 이유도 모른 채 알림이 끊긴다. 그래서 한 번 더 묻는다.
async function removePushSub(idx) {
    const sub = pushSubsCache[idx];
    if (!sub) return;
    const me = sub.endpoint === pushSubsMine;
    const who = sub.name || '이름 없음';

    const ok = await showConfirmPrompt(
        `${escapeHtml(who)}님의 <b>${escapeHtml(pushEndpointLabel(sub.endpoint))}</b>에 알림을 끊을까요?` +
        `<br><span style="font-size:0.8rem; font-weight:400; color:#94a3b8;">` +
        (me ? '이 기기입니다. 🔔 버튼으로 다시 켤 수 있습니다.'
            : '본인이 그 기기에서 🔔 버튼을 누르면 다시 켜집니다.') + '</span>', '알림 끄기');
    if (!ok) return;

    try {
        // 이 기기면 브라우저 구독까지 끊는다. 안 그러면 버튼만 켜진 채로 남는다.
        if (me) { await unsubscribeFromPush(); pushSubsMine = null; }
        else await deletePushSubscription(sub.endpoint);
    } catch (err) {
        showToast(`⚠️ ${err.message}`);
        return;
    }

    pushSubsCache.splice(idx, 1);
    renderPushSubs();
    if (me) updateAlarmUI();
    showToast("🔕 알림을 껐습니다.");
}

/* ── 스코어카드 등록 ──────────────────────────────────────────────
   여기서는 사진만 올리고 요청을 남긴다. 실제 판독은 GitHub Actions가
   맡는다(scripts/read-scorecard.js). 판독이 끝나면 stats.js에 그 차수가
   커밋되고, 배포된 뒤 접속하면 표의 타수가 저절로 채워진다.
   payload.scoreRequests 한 건 = {id, round, url, time, by, status, note}
   round는 차수(1부터), status는 대기 / 완료 / 실패. */

let selectedScorecardRound = -1;

// 본인 기기에서만 버튼을 보여 준다. 이름은 언제든 바뀔 수 있어 렌더마다 다시 판단한다.
function updateScoreRequestBtn() {
    const btn = document.getElementById('scoreRequestBtn');
    if (!btn) return;
    const isOwner = localStorage.getItem('jtfag_my_name') === SCORE_OWNER;
    btn.style.display = isOwner ? '' : 'none';
}

// 올릴 차수는 거의 항상 '방금 친 차수'다. 홀 기록이 아직 없는 마지막 차수를
// 미리 골라 둬, 차수가 몇 개든 열자마자 사진만 올리면 되게 한다.
function defaultScorecardRound() {
    for (let r = appData.totalRounds - 1; r >= 0; r--) {
        if (!hasHoleRecord(r)) return r;
    }
    return appData.totalRounds - 1;
}

async function openScoreRequestModal() {
    if (localStorage.getItem('jtfag_my_name') !== SCORE_OWNER) return;
    if (!(await authenticateAdmin())) return;
    selectedScorecardRound = defaultScorecardRound();
    // 게스트 표시는 매번 새로 정한다. 지난번 값이 남아 있으면 엉뚱한 사람이 빠진다.
    const check = document.getElementById('scorecardHasGuest');
    if (check) check.checked = false;
    ['scorecardGuestTotal', 'scorecardGuestBirdie', 'scorecardGuestPar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    toggleGuestInput();
    renderScoreRequestModal();
    document.getElementById('scoreRequestModal').classList.add('active');
}

function toggleGuestInput() {
    const check = document.getElementById('scorecardHasGuest');
    const box = document.getElementById('scorecardGuestBox');
    if (!check || !box) return;
    box.style.display = check.checked ? '' : 'none';
}

function closeScoreRequestModal() { document.getElementById('scoreRequestModal').classList.remove('active'); }

function selectScorecardRound(r) { selectedScorecardRound = r; renderScoreRequestModal(); }

function renderScoreRequestModal() {
    const select = document.getElementById('scoreRequestRound');
    const log = document.getElementById('scoreRequestLog');
    const pickBtn = document.getElementById('scorecardPickBtn');
    if (!select || !log || !pickBtn) return;

    // 차수가 몇 개가 되든 창 크기가 그대로인 드롭다운으로 고른다.
    // 홀 기록이 이미 있는 차수는 ✓로 표시해, 다시 올리는 건지 알 수 있게 한다.
    let optionHtml = "";
    for (let r = 0; r < appData.totalRounds; r++) {
        optionHtml += `<option value="${r}"${selectedScorecardRound === r ? ' selected' : ''}>${r + 1}차${hasHoleRecord(r) ? ' ✓ 기록 있음' : ''}</option>`;
    }
    select.innerHTML = optionHtml;
    select.value = String(selectedScorecardRound);

    pickBtn.disabled = selectedScorecardRound === -1;
    pickBtn.textContent = selectedScorecardRound === -1
        ? "먼저 차수를 선택하세요"
        : (hasHoleRecord(selectedScorecardRound)
            ? `📷 ${selectedScorecardRound + 1}차 스코어카드 다시 올리기`
            : `📷 ${selectedScorecardRound + 1}차 스코어카드 사진 올리기`);

    const list = (appData.scoreRequests || []).slice().reverse();
    if (list.length === 0) {
        log.innerHTML = `<div class="scorecard-log-empty">아직 등록한 스코어카드가 없습니다.</div>`;
        return;
    }
    log.innerHTML = list.map(req => {
        const tone = req.status === '완료' ? 'ok' : (req.status === '실패' ? 'bad' : 'wait');
        const note = req.note ? `<div class="scorecard-log-note">${escapeHtml(req.note)}</div>` : "";
        return `<div class="scorecard-log-row">
            <div class="scorecard-log-head">
                <span>${req.time} · <b>${req.round}차</b></span>
                <span class="scorecard-status ${tone}">${req.status}</span>
            </div>${note}
        </div>`;
    }).join('');
}

async function handleScorecardUpload(event) {
    const input = event.target;
    const file = (input.files || [])[0];
    input.value = '';
    if (!file) return;
    if (selectedScorecardRound === -1) { showToast("⚠️ 차수를 먼저 선택해주세요."); return; }
    const round = selectedScorecardRound;

    // 게스트는 이름이 아니라 타수로 지목한다. 스코어카드가 이름을 가려 보여줘도,
    // 성이 우리와 겹쳐도 이 타수 한 줄만 정확히 빠진다.
    // 버디·파는 그 타수인 사람이 둘일 때만 쓰는 보조 열쇠라 비워둘 수 있다.
    let guestTotal = null, guestBirdies = null, guestPars = null;
    if (document.getElementById('scorecardHasGuest').checked) {
        guestTotal = parseNumber(document.getElementById('scorecardGuestTotal').value);
        if (!Number.isInteger(guestTotal) || guestTotal < 50 || guestTotal > 200) {
            showToast("⚠️ 게스트 타수를 정확히 입력해주세요. (예: 100)");
            return;
        }
        const optional = (id, label) => {
            const raw = document.getElementById(id).value.trim();
            if (raw === '') return null;
            const n = parseNumber(raw);
            if (!Number.isInteger(n) || n < 0 || n > 18) { showToast(`⚠️ 게스트 ${label} 개수가 이상합니다. (0~18)`); return false; }
            return n;
        };
        guestBirdies = optional('scorecardGuestBirdie', '버디');
        if (guestBirdies === false) return;
        guestPars = optional('scorecardGuestPar', '파');
        if (guestPars === false) return;
    }

    showToast("⏳ 스코어카드를 올리는 중입니다...");
    let url;
    try {
        url = await uploadPhotoBlob(await compressImageToBlob(file, SCORECARD_MAX_PX, SCORECARD_QUALITY), round);
    } catch (err) {
        console.error("스코어카드 업로드 실패:", err);
        showToast("⚠️ 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.");
        return;
    }

    const now = new Date();
    saveState();
    if (!appData.scoreRequests) appData.scoreRequests = [];
    appData.scoreRequests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        round: round + 1,
        url: url,
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        by: localStorage.getItem('jtfag_my_name') || SCORE_OWNER,
        guestTotal: guestTotal,
        guestBirdies: guestBirdies,
        guestPars: guestPars,
        status: '대기',
        note: ''
    });
    while (appData.scoreRequests.length > MAX_SCORE_REQUESTS) appData.scoreRequests.shift();

    // 깨우기 전에 저장이 끝나야 한다. 판독 함수는 DB에 '대기' 요청이 있는지 보고
    // 움직이므로, 저장이 아직 안 닿았으면 "대기 중인 요청이 없다"며 그냥 돌아간다.
    await syncToSupabase(appData);
    renderScoreRequestModal();
    showToast(guestTotal === null
        ? `✅ ${round + 1}차 스코어카드 등록! 판독이 끝나면 타수가 자동으로 채워집니다.`
        : `✅ ${round + 1}차 등록! ${guestTotal}타(게스트)는 빼고 기록됩니다.`);

    // 예약 실행을 기다리지 않고 지금 판독을 시작시킨다.
    // 실패해도 등록은 이미 끝났고 예약 실행이 그물로 남아 있으므로 조용히 넘어간다.
    if (await kickScorecardWorkflow()) {
        showToast("🚀 판독을 시작했습니다. 1~2분 뒤 새로고침하면 타수가 채워집니다.");
    }
}

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
// 판독용 스코어카드만 예외로 더 크고 선명하게(1600px/0.85) 올린다 — 숫자가 뭉개지면 못 읽는다.
function compressImageToBlob(file, maxSize, quality) {
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
                canvas.toBlob(b => b ? resolve(b) : reject(new Error("압축에 실패했습니다.")), 'image/jpeg', quality || 0.6);
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

/* ── 1:1 승률 보여주기 ──────────────────────────────────────────
   통산과 골프장별이 같은 모양으로 나와야 견주기 쉽다. 그래서 그리는 것도 한 함수다. */
function winRateListHtml(rec) {
    let html = "", any = false;
    for (const opp in rec) {
        const n = rec[opp].w + rec[opp].l + rec[opp].t;
        if (!n) continue;
        any = true;
        html += `<div class="slot-roll" style="display:flex; animation-delay: 0.3s; width: 100%;"><span>vs ${opp}</span> <b style="color:#b8860b;">승률 ${Math.round((rec[opp].w / n) * 100)}%</b> <span>(${rec[opp].w}승 ${rec[opp].t}무 ${rec[opp].l}패)</span></div>`;
    }
    return any ? html : "<div style='text-align:center; color:#94a3b8;'>진행된 매치가 없습니다.</div>";
}

/* 골프장별 1:1 승률.
   핸디캡이 직전 두 차수라 1·2차는 승부가 안 나온다 — 그 골프장에 3차 이후 라운드가
   하나도 없으면 목록에 올리지 않는다. 빈 칸을 골라 놓고 '매치 없음'만 보는 건 헛걸음이다. */
let h2hCourseKey = null;

function courseWinRateOptions(name) {
    return roundsByCourse()
        .map(c => ({ ...c, rec: headToHead(name, c.rounds) }))
        .map(c => {
            const played = Object.values(c.rec).reduce((m, v) => Math.max(m, v.w + v.l + v.t), 0);
            return { ...c, played };
        })
        .filter(c => c.played > 0);
}

function renderCourseWinRate(name) {
    const box = document.getElementById('courseWinRate');
    const sel = document.getElementById('courseWinRateSelect');
    if (!box || !sel) return;

    const list = courseWinRateOptions(name);
    if (list.length === 0) {
        sel.style.display = 'none';
        box.innerHTML = "<div style='text-align:center; color:#94a3b8;'>아직 골프장별로 볼 만한 기록이 없습니다.</div>";
        return;
    }
    sel.style.display = '';

    // 고른 곳이 없거나 사라졌으면 라운드가 가장 많은 곳부터 보여 준다.
    if (!list.some(c => c.label.replace(/\s+/g, '') === h2hCourseKey)) {
        h2hCourseKey = list.slice().sort((a, b) => b.played - a.played)[0].label.replace(/\s+/g, '');
    }
    const cur = list.find(c => c.label.replace(/\s+/g, '') === h2hCourseKey);

    sel.innerHTML = list.map(c => {
        const key = c.label.replace(/\s+/g, '');
        return `<option value="${escapeHtml(key)}"${key === h2hCourseKey ? ' selected' : ''}>${escapeHtml(c.label)} (${c.played}판)</option>`;
    }).join('');
    sel.value = h2hCourseKey;

    box.innerHTML = winRateListHtml(cur.rec)
        + `<div class="winrate-note">핸디캡은 직전 두 차수로 내므로 1·2차전은 승부에서 빠집니다.</div>`;
}

function selectCourseWinRate(key, name) {
    h2hCourseKey = key;
    renderCourseWinRate(name);
}

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
    
    // 통산 승률. 계산은 calc.js의 headToHead() 한 곳에만 있다 —
    // 골프장별 승률이 같은 함수를 쓰므로 규칙이 어긋날 자리가 없다.
    const winRateHtml = winRateListHtml(headToHead(name, allRoundIdx()));

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
        <div class="report-section"><div class="report-title">🎖️ 계급별 달성 횟수</div><div class="stat-grid cols-4">
            <div class="stat-box"><div class="stat-label">${iE}독수리</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[0]}" data-suffix="회" style="color:#b8860b; animation-delay: 0.1s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iH}매</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[1]}" data-suffix="회" style="color:#0ea5e9; animation-delay: 0.2s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iC}학</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[2]}" data-suffix="회" style="color:#a855f7; animation-delay: 0.3s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">${iS}참새</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[3]}" data-suffix="회" style="color:#64748b; animation-delay: 0.4s;">0회</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">⚔️ 1:1 통산 승률</div><div class="winrate-list">${winRateHtml}</div></div>
        <div class="report-section">
            <div class="report-title report-title-row">
                <span>🏌️ 골프장별 1:1 승률</span>
                <select class="course-wr-select" id="courseWinRateSelect"
                        onchange="selectCourseWinRate(this.value, '${escapeHtml(name)}')"></select>
            </div>
            <div class="winrate-list" id="courseWinRate"></div>
        </div>
        </div>
    `;
    renderCourseWinRate(name);
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
    const s = Object.assign({}, DEFAULT_NOTIFY_SETTINGS, appData.notifySettings || {});
    s.daysBefore = normalizeDaysBefore(s.daysBefore);
    if (s.daysBefore.length === 0) s.daysBefore = normalizeDaysBefore(DEFAULT_NOTIFY_SETTINGS.daysBefore);
    return s;
}

// 알림 설정 모달이 열려 있는 동안의 선택 상태. 저장을 눌러야 payload에 들어간다.
let notifyDaysDraft = [];

function notifyDayName(d) { return d === 0 ? '당일' : `${d}일 전`; }

function renderNotifyDayChips() {
    const box = document.getElementById('notifyDayChips');
    if (!box) return;
    box.innerHTML = NOTIFY_DAY_CHOICES.map(d =>
        `<button type="button" class="notify-day-chip${notifyDaysDraft.includes(d) ? ' on' : ''}" onclick="toggleNotifyDay(${d})">${notifyDayName(d)}</button>`
    ).join('');
}

function toggleNotifyDay(d) {
    const i = notifyDaysDraft.indexOf(d);
    if (i >= 0) notifyDaysDraft.splice(i, 1);
    else {
        if (notifyDaysDraft.length >= MAX_NOTIFY_DAYS) { showToast(`⚠️ 최대 ${MAX_NOTIFY_DAYS}개까지 고를 수 있습니다.`); return; }
        notifyDaysDraft.push(d);
    }
    notifyDaysDraft = normalizeDaysBefore(notifyDaysDraft);
    renderNotifyDayChips();
    renderNotifyPreview();
}

function renderNotifyPreview() {
    const box = document.getElementById('notifyPreview');
    if (!box) return;
    // 사람마다 달라지는 자리표시자는 '이 기기의 나'로 미리 보여 준다.
    // 실제로는 받는 사람 각자의 이름·계급으로 바뀐다 (scripts/send-reminder.js).
    const me = localStorage.getItem('jtfag_my_name') || '';
    const myRank = (appData.currentRanks && appData.currentRanks[me]) ? `${appData.currentRanks[me]}등급` : '';
    const myTitle = me ? (myRank ? `${myRank} ${me}님` : `${me}님`) : '';
    const fill = (s, days) => String(s)
        .replace(/\{남은일수\}/g, String(days))
        .replace(/\{디데이\}/g, ddayLabel(days))
        .replace(/\{일정\}/g, appData.nextRoundDate || '(등록된 일정 없음)')
        .replace(/\{이름\}/g, me)
        .replace(/\{등급\}/g, myRank)
        .replace(/\{호칭\}/g, myTitle)
        .replace(/\s{2,}/g, ' ').trim();
    const title = document.getElementById('notifyTitle').value;
    const body = document.getElementById('notifyBody').value;

    if (notifyDaysDraft.length === 0) {
        box.innerHTML = `<div class="notify-preview-label">미리보기</div>
            <div class="notify-preview-empty">알릴 날을 하나 이상 골라주세요.</div>`;
        return;
    }
    // 고른 날마다 실제로 어떤 문구가 나가는지 따로 보여준다.
    // 당일에 "0일 뒤 라운드입니다"처럼 어색해지는 걸 여기서 바로 알아챌 수 있다.
    box.innerHTML = `<div class="notify-preview-label">미리보기 · ${notifyDaysDraft.length}번 발송</div>` +
        notifyDaysDraft.map(d => `<div class="notify-preview-card">
            <div class="notify-preview-when">${notifyDayName(d)}</div>
            <div class="notify-preview-title">${fill(title, d)}</div>
            <div class="notify-preview-body">${fill(body, d)}</div>
        </div>`).join('');
}

function openNotifySettings() {
    const s = getNotifySettings();
    notifyDaysDraft = s.daysBefore.slice();
    document.getElementById('notifyTitle').value = s.title;
    document.getElementById('notifyBody').value = s.body;
    ['notifyTitle', 'notifyBody'].forEach(id =>
        document.getElementById(id).oninput = renderNotifyPreview);
    renderNotifyDayChips();
    renderNotifyPreview();
    document.getElementById('notifySettingsModal').classList.add('active');
}
function closeNotifySettings() { document.getElementById('notifySettingsModal').classList.remove('active'); }

function saveNotifySettings() {
    const days = normalizeDaysBefore(notifyDaysDraft);
    const title = document.getElementById('notifyTitle').value.trim();
    const body = document.getElementById('notifyBody').value.trim();

    if (days.length === 0) { showToast("⚠️ 알릴 날을 하나 이상 골라주세요."); return; }
    if (!title) { showToast("⚠️ 알림 제목을 입력해주세요."); return; }

    saveState();
    appData.notifySettings = { daysBefore: days, title: title, body: body || '{일정}' };
    syncToSupabase(appData);
    closeNotifySettings();
    renderAdminModal();
    showToast(`🔔 ${days.map(notifyDayName).join(' · ')}에 알리도록 저장했습니다.`);
}

async function openAdminModal() {
    if (!isFundUnlocked && !(await authenticateAdmin())) return;
    renderAdminModal(); renderStorageUsage();
    document.getElementById('adminModal').classList.add('active');
}
function closeAdminModal() { document.getElementById('adminModal').classList.remove('active'); }

function adminLock() {
    isFundUnlocked = false;
    isScoreUnlocked = false;
    isMoneyUnlocked = false;
    renderMoneyTable();
    renderTable();
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
        <button type="button" class="admin-btn" onclick="openNotifySettings()">🔔 알림 설정 <span class="admin-btn-sub">${getNotifySettings().daysBefore.map(notifyDayName).join(' · ')}</span></button>
        <button type="button" class="admin-btn" onclick="openFundLogModal()">📜 공금 수정 로그</button>
        <button type="button" class="admin-btn" onclick="openPushSubsModal()">🔔 알림 받는 기기</button>
        <button type="button" class="admin-btn" onclick="toggleScoreEdit()">${isScoreUnlocked ? '🔒 타수 칸 잠그기' : '✏️ 타수 직접 수정'} <span class="admin-btn-sub">${isScoreUnlocked ? '열림' : '홀 기록 없는 차수만'}</span></button>
        <button type="button" class="admin-btn" onclick="toggleMoneyEdit()">${isMoneyUnlocked ? '🔒 정산 금액 잠그기' : '💰 정산 금액 전체 수정'} <span class="admin-btn-sub">${isMoneyUnlocked ? '전원 열림' : '평소엔 본인 칸만'}</span></button>
        <button type="button" class="admin-btn" onclick="resetEffectSeen()">🎬 연출 다시 보기 <span class="admin-btn-sub">이 기기에서 본 표시만 지움</span></button>
        <button type="button" class="admin-btn" onclick="adminRunAction(changeAdminPassword)">🔑 비밀번호 변경</button>
        <button type="button" class="admin-btn danger" onclick="adminRunAction(deleteMyName)">👤 이 기기의 이름 삭제</button>`;
    if (legacy > 0) {
        btns += `<button type="button" class="admin-btn" onclick="adminRunAction(migratePhotosToStorage)">🗄️ 기존 사진 ${legacy}장 Storage로 이전</button>`;
    }
    btns += `<button type="button" class="admin-btn danger-strong" onclick="resetAllData()">🔄 전체 데이터 초기화</button>`;
    actions.innerHTML = btns;

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
        // 두 칸이 같은 함수를 쓴다. 예전에는 전반만 등호(<=)가 붙어 있어,
        // 전후반이 같은 값일 때 전반은 초록·후반은 빨강으로 갈렸다.
        const halfColor = (mine, other) => mine === other ? '#475569' : (mine < other ? '#059669' : '#dc2626');
        html += `<div class="report-section"><div class="report-title">🌗 전반 / 후반</div>
            <div class="stat-grid" style="grid-template-columns: repeat(2, 1fr);">
                <div class="stat-box"><div class="stat-label">전반 9홀</div><div class="analysis-val" style="color:${halfColor(a.front, a.back)};">+${a.front}</div></div>
                <div class="stat-box"><div class="stat-label">후반 9홀</div><div class="analysis-val" style="color:${halfColor(a.back, a.front)};">+${a.back}</div></div>
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
                updateScoreRequestBtn();
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
        updateScoreRequestBtn();
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
    // 다른 창과 똑같이 입력을 받는다 — 그래야 watchOverlays()가 뒷배경을 잠근다.
    // 대신 3초를 억지로 기다리지 않도록 눌러서 넘길 수 있게 해 뒀다(아래 dismiss).
    // 전체화면 blur은 안드로이드에서 값이 비싸다(화면이 끊긴다). 어두운 막만으로 충분하다.
    // greet-overlay 표식은 연출(카운트업·결과 발표)이 이게 사라질 때까지 기다리게 하는 데 쓴다.
    overlay.className = 'greet-overlay';
    overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.62); z-index:9999; opacity:0; transition:opacity 0.4s ease;";
    
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
    
    // 3초를 채우든 눌러서 넘기든 한 번만 사라지게 한다.
    let gone = false;
    const dismiss = () => {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        toast.style.transform = "translate(-50%, -50%) scale(0.8)";
        toast.style.opacity = "0";
        overlay.style.opacity = "0";
        // 인사말이 완전히 걷힌 뒤에 연출을 시작한다 — 안 그러면 뒤에서 혼자 끝나 버린다.
        setTimeout(() => { toast.remove(); overlay.remove(); runEntranceEffects(); }, 500);
    };
    const timer = setTimeout(dismiss, 3000);
    overlay.onclick = dismiss;
    toast.onclick = dismiss;
}
