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
            // **내가 보낸 저장의 메아리는 통째로 무시한다.** 내 화면이 이미 더 최신이라
            // 다시 그릴 이유가 없고, 그리는 순간 적고 있던 금액 칸이 되돌아간다.
            // (저장을 한 줄로 세우므로 내 로컬 상태가 내가 보낸 것보다 뒤처질 수 없다.)
            if (isMyEcho(payload.new.payload)) { showSaveStatus("⚡ 동기화 완료"); return; }
            appData = payload.new.payload;
            if (!appData.roundMoney) appData.roundMoney = getDefaultData().roundMoney;
            if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
            if (!appData.fundLogs) appData.fundLogs = [];
            if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
            // **금액은 이 payload를 믿지 않는다.** 보낸 폰이 낡았으면 남의 금액이 0이거나 옛 값이다.
            // 따로 둔 테이블(money.js)의 값을 그 위에 얹는다 — 그래서 누가 무엇을 저장해도 금액은 안 바뀐다.
            // 테이블이 없을 때만 예전 보호막(내 칸을 다시 얹고 한 번 더 저장)으로 돈다.
            if (moneyMode === 'table') overlayMoney();
            else if (reapplyMyMoney()) syncToSupabase(appData);
            applyHoleScores();
            renderNoticeArea(); renderAll(); showSaveStatus("⚡ 실시간 업데이트됨");
            if (document.getElementById('roundPhotoModal').classList.contains('active')) renderRoundPhotos();
            // 판독 결과(status)는 워크플로가 payload에 써 넣으므로 실시간으로 들어온다.
            if (document.getElementById('scoreRequestModal').classList.contains('active')) renderScoreRequestModal();
        }
    }).subscribe(realtimeStatus('league'));

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
        <div style="background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:85%; max-width:320px; max-height:70vh; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.5); transform:scale(0.9); transition:transform 0.3s;">
            <h3 style="margin:0 0 12px 0; color:#16181a; font-size:1rem; text-align:center; flex-shrink:0;">📜 공금 수정 로그</h3>
            <div id="fundLogContent" style="font-size:0.8rem; color:#6b7075; text-align:left; flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; margin-bottom:12px;"></div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
                <button type="button" id="fundLogClearBtn" onclick="clearFundLogs()" style="flex:0 0 auto; padding:10px 12px; background:#fdecec; border:none; border-radius:6px; color:#c0392b; font-weight:700; cursor:pointer; font-family:inherit; font-size:0.8rem;">전체 삭제</button>
                <button type="button" onclick="closeFundLogModal()" style="flex:1; padding:10px; background:#f2f2ee; border:none; border-radius:6px; color:#3a3f44; font-weight:700; cursor:pointer; font-family:inherit;">닫기</button>
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
            const move = diff > 0 ? { word: '적립', color: '#1f6b45' }
                       : diff < 0 ? { word: '사용', color: '#c0392b' }
                                  : { word: '변동 없음', color: '#94a3b8' };
            const moveHtml = diff === 0
                ? `<div style="margin-top:3px; color:#94a3b8; font-size:0.8rem; font-weight:700;">변동 없음</div>`
                : `<div style="margin-top:3px; font-size:0.8rem; font-weight:800; color:${move.color};">${move.word} ${formatNumber(Math.abs(diff))}원</div>`;
            // 예전 기록에는 memo가 없다. 있을 때만 줄을 만든다.
            const memoHtml = log.memo
                ? `<div style="margin-top:5px; color:#3a3f44; font-size:0.78rem; background:#f7f7f5; border-left:2px solid #2b5394; border-radius:0 4px 4px 0; padding:4px 7px; word-break:keep-all;">📝 ${escapeHtml(log.memo)}</div>`
                : "";
            return `<div style="padding:10px 0; border-bottom:1px solid #eeeeea;">
                <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
                    <span style="font-size:0.72rem; font-weight:800; color:#3a3f44; background:#f2f2ee; border-radius:5px; padding:2px 6px; white-space:nowrap;">${log.time}</span>
                    <span style="font-size:0.75rem; color:#2b5394; font-weight:700;">${escapeHtml(log.name || '')}</span>
                    <button type="button" onclick="editFundLog(${i})" title="내역 수정" style="margin-left:auto; flex-shrink:0; width:22px; height:22px; line-height:1; padding:0; background:transparent; border:1px solid #e6e6e2; border-radius:5px; color:#6b7075; font-size:0.7rem; cursor:pointer; font-family:inherit;">✎</button>
                    <button type="button" onclick="removeFundLog(${i})" title="기록 삭제" style="flex-shrink:0; width:22px; height:22px; line-height:1; padding:0; background:transparent; border:1px solid #e6e6e2; border-radius:5px; color:#6b7075; font-size:0.7rem; cursor:pointer; font-family:inherit;">✕</button>
                </div>
                <div style="color:#6b7075; font-size:0.82rem; white-space:nowrap;">${formatNumber(log.before)}원 ➔ <b style="color:#16181a;">${formatNumber(log.after)}원</b></div>
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
    /* 입력창·확인창이 떠 있는 사이 남의 저장이 실시간으로 들어오면 appData가 통째로 바뀐다.
       예전엔 창을 열 때 집은 기록(옛 appData의 것)을 그대로 고쳐 **'고쳤습니다'라고 떠도 저장이 안 됐고**,
       지우기는 순번으로 지워 **다른 기록이 지워질 수 있었다.** 그래서 창을 닫은 뒤 지금 목록에서
       같은 기록(시각·이름·금액이 같은 것)을 다시 찾아 처리한다. 없으면 손대지 않는다. */
    const findFundLog = (log) => (appData.fundLogs || []).findIndex(l =>
        l.time === log.time && l.name === log.name && l.before === log.before && l.after === log.after);

    window.editFundLog = async (idx) => {
        const picked = (appData.fundLogs || [])[idx];
        if (!picked) return;
        const memo = await showMemoPrompt(picked);
        if (memo === null) return;                       // 취소
        const at = findFundLog(picked);
        if (at < 0) { showToast("이미 삭제된 기록입니다."); renderFundLogs(); return; }
        const log = appData.fundLogs[at];
        if (memo === (log.memo || '')) return;           // 그대로면 저장하지 않는다
        saveState();
        if (memo) log.memo = memo; else delete log.memo; // 비우면 아예 없앤다(옛 기록과 같은 모양)
        syncToSupabase(appData);
        renderFundLogs();
        showToast(memo ? "✏️ 내역을 수정했습니다." : "✏️ 내역을 삭제했습니다.");
    };

    window.removeFundLog = async (idx) => {
        const log = (appData.fundLogs || [])[idx];
        if (!log) return;
        const ok = await showConfirmPrompt(
            `이 기록을 삭제할까요?<br><span style="font-size:0.78rem; color:#cbd5e1;">${log.time} · ${escapeHtml(log.name || '')}</span>`,
            '삭제');
        if (!ok) return;
        const at = findFundLog(log);
        if (at < 0) { showToast("이미 삭제된 기록입니다."); renderFundLogs(); return; }
        saveState();
        appData.fundLogs.splice(at, 1);
        syncToSupabase(appData);
        renderFundLogs();
        showToast("🗑️ 기록 1건을 삭제했습니다.");
    };

    window.clearFundLogs = async () => {
        const n = (appData.fundLogs || []).length;
        if (n === 0) return;
        const ok = await showConfirmPrompt(
            `기록 ${n}건을 모두 삭제할까요?<br><span style="font-size:0.78rem; color:#cbd5e1;">공금 잔액은 변경되지 않습니다.</span>`,
            '전체 삭제');
        if (!ok) return;
        saveState();
        appData.fundLogs = [];
        syncToSupabase(appData);
        renderFundLogs();
        showToast(`🗑️ 기록 ${n}건을 모두 삭제했습니다.`);
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
        box.style.cssText = "background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#16181a; font-size:0.9rem; margin-bottom:15px; font-weight:700; word-break:keep-all; line-height:1.4;";
        
        const inputEl = document.createElement('input');
        inputEl.type = "password";      
        inputEl.inputMode = "numeric";  
        inputEl.pattern = "[0-9]*";
        inputEl.style.cssText = "width:100%; padding:10px; border-radius:6px; border:1px solid #e6e6e2; background:#f7f7f5; color:#16181a; font-size:1.2rem; text-align:center; margin-bottom:15px; letter-spacing:6px; box-sizing:border-box; outline:none;";
        
        const btnRow = document.createElement('div');
        btnRow.style.cssText = "display:flex; gap:8px;";
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.85rem; font-weight:700; cursor:pointer;";
        
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = "확인";
        confirmBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#2b5394; color:#ffffff; font-size:0.85rem; font-weight:800; cursor:pointer;";
        
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
        box.style.cssText = "background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#16181a; font-size:0.95rem; margin-bottom:15px; font-weight:800; word-break:keep-all; line-height:1.4;";
        
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
            btn.style.cssText = "width:100%; padding:10px; border-radius:6px; border:1px solid #e6e6e2; background:#f7f7f5; color:#16181a; font-size:0.95rem; font-weight:700; cursor:pointer; transition:background 0.2s;";
            btn.onclick = () => cleanup(name);
            btnContainer.appendChild(btn);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "나중에";
        cancelBtn.style.cssText = "width:100%; padding:10px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.85rem; font-weight:700; cursor:pointer;";
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
        box.style.cssText = `background:#ffffff; border:1px solid ${color}; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;`;
        
        const msgEl = document.createElement('div');
        msgEl.innerHTML = message;
        msgEl.style.cssText = "color:#16181a; font-size:0.9rem; margin-bottom:15px; font-weight:700; word-break:keep-all; line-height:1.5;";
        
        const btnRow = document.createElement('div');
        btnRow.style.cssText = "display:flex; gap:8px;";
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.85rem; font-weight:700; cursor:pointer;";
        
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
        box.style.cssText = "background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:100%; max-width:300px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;";

        const diff = (log.after || 0) - (log.before || 0);
        const moveText = diff === 0 ? '변동 없음'
            : `${diff > 0 ? '적립' : '사용'} ${formatNumber(Math.abs(diff))}원`;

        const msgEl = document.createElement('div');
        msgEl.innerHTML = `내역 수정<br>`
            + `<span style="font-size:0.74rem; font-weight:700; color:#94a3b8;">${escapeHtml(log.time || '')} · ${escapeHtml(log.name || '')}</span><br>`
            + `<span style="font-size:0.78rem; font-weight:800; color:${diff < 0 ? '#c0392b' : diff > 0 ? '#1f6b45' : '#94a3b8'};">${moveText}</span>`;
        msgEl.style.cssText = "color:#16181a; font-size:0.9rem; margin-bottom:14px; font-weight:800; line-height:1.6;";

        const input = document.createElement('input');
        input.type = "text"; input.maxLength = 40;
        input.value = log.memo || '';
        input.placeholder = "예: 박승수 9월회비";
        input.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #e6e6e2; background:#f7f7f5; color:#16181a; font-size:0.85rem; font-weight:700; text-align:center; outline:none; margin-bottom:12px; font-family:inherit;";

        const row = document.createElement('div'); row.style.cssText = "display:flex; gap:8px;";
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.85rem; font-weight:700; cursor:pointer; font-family:inherit;";
        const okBtn = document.createElement('button');
        okBtn.textContent = "저장";
        okBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#2b5394; color:#ffffff; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit;";
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
    const pwd = await showPasswordPrompt("🔒 시스템 관리 비밀번호를<br>입력해 주세요");
    
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
    const oldPwd = await showPasswordPrompt("현재 사용 중인<br>비밀번호를 입력해 주세요");
    
    if (oldPwd === null) return;
    if (oldPwd === correctPwd) {
        const newPwd = await showPasswordPrompt("새로운 비밀번호를 입력해 주세요<br><span style='font-size:0.75rem; font-weight:400; color:#6b7075;'>(모든 관리자가 이 비밀번호를 사용합니다)</span>");
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
    direct: { tab: "✏️ 직접", label: "정정할 잔액", memo: "예) 잔액 정정", sign: 0 }
};

function showFundPrompt(before) {
    return new Promise((resolve) => {
        let mode = 'use';   // 대개는 쓴 돈을 적는다

        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); z-index:10000; display:flex; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s; padding:20px;";
        const box = document.createElement('div');
        box.style.cssText = "background:#ffffff; border:1px solid #e6e6e2; border-radius:12px; padding:20px; width:100%; max-width:280px; box-shadow:0 15px 40px rgba(0,0,0,0.2); transform:scale(0.9); transition:transform 0.2s; text-align:center;";
        const msgEl = document.createElement('div');
        msgEl.innerHTML = `💰 공금 수정<div style="color:#94a3b8; font-size:0.72rem; font-weight:700; margin-top:3px;">현재 ${formatFundString(before)}</div>`;
        msgEl.style.cssText = "color:#16181a; font-size:0.9rem; margin-bottom:12px; font-weight:800; word-break:keep-all;";

        const tabRow = document.createElement('div');
        tabRow.style.cssText = "display:flex; gap:5px; margin-bottom:12px;";
        const tabs = {};
        Object.keys(FUND_MODES).forEach(key => {
            const btn = document.createElement('button');
            btn.type = "button"; btn.textContent = FUND_MODES[key].tab;
            btn.style.cssText = "flex:1; padding:7px 0; border-radius:6px; border:1px solid #e6e6e2; background:#ffffff; color:#6b7075; font-size:0.75rem; font-weight:800; cursor:pointer; font-family:inherit;";
            btn.onclick = () => setMode(key);
            tabs[key] = btn; tabRow.appendChild(btn);
        });

        const amountLabel = document.createElement('div');
        amountLabel.style.cssText = "color:#94a3b8; font-size:0.72rem; font-weight:700; text-align:left; margin-bottom:4px;";
        const amountInput = document.createElement('input');
        amountInput.type = "text"; amountInput.inputMode = "numeric";
        amountInput.placeholder = "0";
        amountInput.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #e6e6e2; background:#f7f7f5; color:#16181a; font-size:1rem; font-weight:800; text-align:center; outline:none; font-family:inherit;";

        // 저장하면 잔액이 얼마가 되는지 치는 대로 보여 준다.
        const preview = document.createElement('div');
        preview.style.cssText = "font-size:0.78rem; font-weight:800; margin:7px 0 10px 0; min-height:16px;";

        const memoLabel = document.createElement('div');
        memoLabel.textContent = "내역 (선택)";
        memoLabel.style.cssText = "color:#94a3b8; font-size:0.72rem; font-weight:700; text-align:left; margin-bottom:4px;";
        const memoInput = document.createElement('input');
        memoInput.type = "text"; memoInput.maxLength = 40;
        memoInput.style.cssText = "width:100%; padding:10px; border-radius:8px; border:1px solid #e6e6e2; background:#f7f7f5; color:#16181a; font-size:0.85rem; font-weight:700; text-align:center; outline:none; margin-bottom:12px; font-family:inherit;";

        const row = document.createElement('div'); row.style.cssText = "display:flex; gap:8px;";
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = "취소";
        cancelBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#f2f2ee; color:#3a3f44; font-size:0.85rem; font-weight:700; cursor:pointer; font-family:inherit;";
        const okBtn = document.createElement('button');
        okBtn.textContent = "저장";
        okBtn.style.cssText = "flex:1; padding:10px; border-radius:6px; border:none; background:#2b5394; color:#ffffff; font-size:0.85rem; font-weight:800; cursor:pointer; font-family:inherit;";
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
                `<span style="color:${after < 0 ? '#c0392b' : '#1f6b45'};">${formatFundString(after)}</span>` +
                (after < 0 ? `<div style="color:#c0392b; font-size:0.68rem; font-weight:700; margin-top:2px;">잔액이 0원 미만이 됩니다</div>` : "");
        }

        function setMode(key) {
            mode = key;
            Object.keys(tabs).forEach(k => {
                const on = k === key;
                tabs[k].style.background = on ? "#2b5394" : "#ffffff";
                tabs[k].style.color = on ? "#ffffff" : "#6b7075";
                tabs[k].style.borderColor = on ? "#2b5394" : "#e6e6e2";
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
    const snapshot = JSON.parse(historyStack.pop());
    // 금액은 테이블이 진짜라 사본을 덮어씌우는 것만으로는 안 돌아간다. 내 칸만 테이블에 되돌려 쓴다
    // (사본에 든 남의 금액은 그때 값이라, 그대로 쓰면 그 뒤에 남이 적은 금액을 지운다).
    if (typeof commitUndoMoney === 'function') commitUndoMoney(appData, snapshot);
    appData = snapshot;
    if (typeof overlayMoney === 'function') overlayMoney();
    syncToSupabase(appData); showToast("↩️ 이전 상태로 되돌렸습니다."); renderAll();
}

function renderSkeleton() {
    const summaryGrid = document.getElementById('summaryGrid');
    if (summaryGrid) { summaryGrid.innerHTML = golfers.map(() => `<div class="summary-item skeleton"><div class="name">---</div><div class="detail-line">---</div><div class="detail-line">---</div><div class="detail-line">---</div><div class="final-total">---</div></div>`).join(''); }
}

let toastTimer = null;
function showToast(msg, ms) {
    const toast = document.getElementById('customToast'); if (!toast) return;
    toast.textContent = msg; toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, ms || 2200);
}

// `⚠️`로 시작하는 문구는 서버와 안 이어진 상태라 빨강(.off), 나머지는 초록이다.
// 실시간이 끊겨 있는 동안은 초록 문구를 띄우지 않는다 — 저장(REST)은 돼도 남이 고친 게 안 들어오는
// 상태라, `동기화 완료`로 덮으면 끊긴 걸 모르고 지나간다.
function showSaveStatus(msg) {
    if (realtimeDown && !msg.startsWith('⚠️')) return;
    const saveStatus = document.getElementById('saveStatus'); if (saveStatus) { saveStatus.textContent = msg; saveStatus.classList.toggle('off', msg.startsWith('⚠️')); saveStatus.style.opacity = '1'; setTimeout(() => { saveStatus.style.opacity = '0.7'; }, 1200); }
}

/* 실시간 연결 상태를 상태 문구에 반영한다. 예전엔 접속·저장만 봐서, 쓰는 도중 실시간이 끊겨도
   초록으로 남아 있었다 — 그 사이 남이 고친 금액·일정이 안 들어오는데 아무도 모른다.
   채널(payload · 금액)마다 `.subscribe(realtimeStatus('이름'))`으로 상태를 받는다.
   - 하나라도 끊기면(`CHANNEL_ERROR`·`TIMED_OUT`·`CLOSED`) 3초 기다렸다 빨강으로 바꾼다.
     잠깐 끊겼다 바로 붙는 경우까지 깜빡이면 오히려 불안하다.
   - 다시 다 붙으면 **payload를 한 번 다시 읽는다.** 실시간은 끊긴 동안의 이벤트를 다시 보내 주지
     않으므로(앞으로 나올 때 다시 읽는 것과 같은 이유) 읽어야 그 틈이 메워지고, 읽고 나면 초록이 된다.
   supabase-js가 끊긴 채널을 알아서 다시 붙이므로 여기서 재접속은 하지 않는다. */
let realtimeDown = false;
let realtimeDownTimer = null;
const realtimeStates = {};
function realtimeStatus(name) {
    return status => {
        realtimeStates[name] = status;
        const down = Object.values(realtimeStates).some(st => st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED');
        if (down) {
            if (!realtimeDown && !realtimeDownTimer) realtimeDownTimer = setTimeout(() => {
                realtimeDownTimer = null;
                realtimeDown = true;
                showSaveStatus("⚠️ 실시간 연결 끊김");
            }, 3000);
            return;
        }
        clearTimeout(realtimeDownTimer); realtimeDownTimer = null;
        if (!realtimeDown) return;
        realtimeDown = false;
        if (isLoaded) fetchFromSupabase();   // 끊긴 사이 놓친 걸 메운다(끝나면 초록 문구를 띄운다)
    };
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

/* 일정 문구에 요일을 붙인다 — `10월 3일 오후 5:21` → `10월 3일(토) 오후 5:21`.
   문구(`nextRoundDate`)에는 연도가 없어 요일을 알 수 없으므로 함께 저장된 `nextRoundISO`에서 낸다.
   **화면에 그릴 때만 붙이고 저장하지 않는다** — 문구를 읽는 곳(알림 발송 · `lastScheduledCourse()` ·
   날씨의 `courseFromText()`)이 여럿이라 저장 형식을 바꾸면 하나씩 다 손봐야 한다.
   ISO의 월·일이 문구와 다르면(예전 데이터가 어긋난 경우) 틀린 요일을 붙이는 대신 그냥 둔다. */
function withWeekday(text) {
    const iso = appData.nextRoundISO;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m || !text) return text || '';
    const month = parseInt(m[2], 10), day = parseInt(m[3], 10);
    const re = /(\d{1,2})월\s*(\d{1,2})일(?!\s*\()/;
    const hit = re.exec(text);
    if (!hit || parseInt(hit[1], 10) !== month || parseInt(hit[2], 10) !== day) return text;
    const wd = '일월화수목금토'[new Date(Date.UTC(+m[1], month - 1, day)).getUTCDay()];
    return text.replace(re, `$1월 $2일(${wd})`);
}

/* 일정 문구를 줄바꿈해도 안 갈리게 다듬는다. `keep-all`은 콜론 뒤에서 줄을 바꿔
   `오후 5:` / `34 JNJ골프리조트`처럼 시각이 두 동강 났다. 날짜(`10월 14일(수)`)와
   시각(`오후 5:34`)을 한 덩어리로 묶어 줄은 그 사이에서만 바뀌게 한다.
   사용자가 적은 글이라 먼저 `escapeHtml()`을 거친다. */
function scheduleHtml(text) {
    return escapeHtml(text)
        .replace(/\d{1,2}월\s*\d{1,2}일(?:\([일월화수목금토]\))?/, m => `<span class="nowrap">${m}</span>`)
        .replace(/(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}/, m => `<span class="nowrap">${m}</span>`)
        .replace(/\([^()]*\)\s*$/, m => `<span class="nowrap">${m}</span>`);   // 끝의 코스 `(정-남)` — 하이픈에서 갈렸다
}

// 공지 카드: 날짜·시각 한 줄, 골프장(코스 괄호까지)은 다음 줄 (사용자 요청 — `일정과 골프장과 줄바꿈해줘`).
// 시각을 못 찾는 예전 문구는 예전처럼 한 덩어리로 그린다.
function noticeScheduleHtml(text) {
    const m = text.match(/(?:(?:오전|오후)\s*)?\d{1,2}:\d{2}/);
    if (!m) return scheduleHtml(text);
    const cut = m.index + m[0].length;
    const head = text.slice(0, cut), tail = text.slice(cut).trim();
    return scheduleHtml(head) + (tail ? `<span class="sched-course">${scheduleHtml(tail)}</span>` : '');
}

function renderNoticeArea() {
    const dateDisplay = document.getElementById('nextRoundDisplay');
    if (dateDisplay) { dateDisplay.innerHTML = appData.nextRoundDate ? (ddayBadgeHtml() + noticeScheduleHtml(withWeekday(appData.nextRoundDate))) : `일정 등록하기`; checkWeather(appData.nextRoundDate); }
    updateLockUI();
}

// 홈 화면 앱은 백그라운드에 그대로 떠 있어, 자정을 넘겨도 어제 계산한 D-day가 남는다.
// 다시 앞으로 불러올 때 한 번 더 그린다.
//
// **그때 payload도 다시 읽는다.** 실시간 이벤트는 놓친 걸 나중에 다시 보내 주지 않는다 —
// 폰이 잠겨 있는 동안 남이 고친 내용을 못 받은 채로 깨어나면, 그 낡은 appData를 그대로
// 저장하는 순간 **남의 금액이 통째로 지워진다**(행 전체가 오가는 구조라 그렇다).
// 앞으로 나올 때 한 번 읽어 두면 그 창이 닫힌다. 적다 만 칸은 `renderMoneyTable()`의
// 빠른 길이 포커스 있는 칸을 건너뛰므로 글자가 날아가지 않는다.
document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
        // 금액을 적다가 앱을 내려놓거나 화면이 꺼지면 `change`가 안 울려 **적은 값이 그냥 사라진다.**
        // 떠나기 전에 포커스를 빼서 저장을 태운다.
        if (isMoneyField(document.activeElement)) document.activeElement.blur();
        return;
    }
    if (!isLoaded) return;
    renderNoticeArea();
    fetchFromSupabase();
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
function subCourseFromStats(roundIdx) {
    if (typeof ROUND_HOLES === 'undefined') return '';
    const rec = ROUND_HOLES[String(roundIdx + 1)];
    const text = String((rec && rec.course) || '').trim();
    if (!text) return '';
    const paren = text.match(/\(([^()]+)\)\s*$/);
    if (paren) return paren[1].trim();
    return text.includes('-') ? text : '';
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
    const key = String(club || '').replace(/\s+/g, '');
    if (!key) return [];
    const clubs = roundCourseMap(), seen = new Set();
    // 차수를 하나씩 훑는다 — 일정에서 정한 것과 스코어카드에서 읽은 것을 같이 본다.
    // subCourseOf()가 그 우선순위를 이미 알고 있으므로 여기서 다시 가리지 않는다.
    for (let r = 0; r < (appData.totalRounds || 0); r++) {
        const c = String(clubs[r + 1] || (appData.courses && appData.courses[r]) || '').replace(/\s+/g, '');
        if (c !== key) continue;
        splitSubCourse(subCourseOf(r)).forEach(v => seen.add(v));
    }
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

    // 그 차수의 코스도 같이 채운다 — 일정에서 정한 게 없으면 스코어카드에서 읽은 값이 온다.
    // 없으면 빈 칸으로 둔다. 지난 차수의 코스가 남아 있으면 다른 골프장인데 엉뚱한 게 딸려 들어간다.
    document.getElementById('schSubCourse').value = subCourseOf(pick - 1);
    renderSubCourseChips();

    const statusText = document.getElementById('courseLoadStatus');
    if (statusText) statusText.textContent = `전국 ${allCourses().length}곳에서 검색`;
    renderCourseResults(true);
}

/* 창을 열어 둔 채로 차수를 바꾸면 그 차수에 정해 둔 골프장·코스로 갈아 끼운다.
   **이미 정해진 게 있을 때만** 바꾼다 — 아직 아무것도 없는 차수로 옮겼는데
   치던 이름을 지워 버리면, 새 차수를 잡으려던 사람이 처음부터 다시 쳐야 한다. */
function onScheduleRoundChange() {
    const no = parseInt(document.getElementById('schRound').value, 10);
    if (!no) return;
    const club = roundCourseMap()[no] || (appData.courses && appData.courses[no - 1]) || '';
    const sub = subCourseOf(no - 1);
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
    roundCourseMap()[roundNo] = course;
    // 코스는 따로 둔다. courses[]에 합치면 골프장 이름이 되어 날씨와 승률 묶음이 깨진다.
    if (sub) subCourseMap()[roundNo] = sub; else delete subCourseMap()[roundNo];
    if (roundNo <= appData.totalRounds) {
        if (!appData.courses) appData.courses = [];
        appData.courses[roundNo - 1] = course;
    }

    syncToSupabase(appData); renderNoticeArea(); renderAll(); closeScheduleModal();
    showToast(roundNo <= appData.totalRounds
        ? `✅ ${roundNo}차 일정을 저장했습니다. 스코어표 골프장도 반영했습니다.`
        : `✅ ${roundNo}차 일정을 저장했습니다. 차수 생성 시 골프장이 자동 반영됩니다.`);
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
    if (typeof renderTripCard === 'function') { renderTripCard(); refreshTripModal(); }
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
            el.textContent = formatFinalBalance(t < 1 ? v : target);   // '합산' 글자는 위 줄(.final-label)에 따로 있다
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
        // 이름 칸에는 ⭐(독수리 명예 표식)이 붙을 수 있어 첫 글자 마디(이름 자체)로 견준다.
        const card = [...document.querySelectorAll('.summary-item')]
            .find(el => { const n = el.querySelector('.name'); return n && n.firstChild && n.firstChild.textContent === name; });
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
        ? `🎬 연출 기록 ${keys.length}개를 초기화했습니다. 새로고침하면 다시 재생됩니다.`
        : "🎬 초기화할 연출 기록이 없습니다.");
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
/* 칸에 **그 칸이 만들어질 때의 차수를 박아 둔다**(네 번째 인자).
   예전엔 `updateMoney()`가 그때그때의 `selectedMoneyRoundIdx`를 읽었다 — 금액을 적다가
   차수 드롭다운을 바꾸면 블러(= 저장)가 드롭다운 처리보다 늦게 도는 기기에서
   **방금 적은 금액이 엉뚱한 차수에 들어간다**(그 차수 금액은 덮이고 원래 차수는 안 바뀐다).
   칸에 박아 두면 어떤 순서로 돌든 적은 자리에 들어간다. */
function moneyCell(g, type, value) {
    const editable = canEditMoney(g);
    const r = selectedMoneyRoundIdx;
    return `<input type="text" id="money_${type}_${g}" inputmode="numeric" pattern="[0-9]*"
        class="money-input${editable ? '' : ' locked'}" value="${formatNumber(value)}"
        ${editable ? '' : 'readonly '}onfocus="this.select()"
        ${editable
            ? `onchange="updateMoney('${g}', '${type}', this.value, ${r})" onkeydown="moneyKeydown(event)"`
            : `onclick="moneyLockNotice('${g}')"`}>`;
}

/* ── 금액 입력 마무리 ─────────────────────────────────────────────
   금액 칸은 확인 단추 없이 **포커스가 빠질 때(`onchange`)** 저장된다. 그런데 저장됐다는
   표시가 없어 "다른 데를 눌렀는데 들어간 건지 모르겠다"는 말이 나왔다. 아이폰 숫자
   키패드에는 완료 키조차 없어(홈 화면 앱은 사파리의 '완료' 줄도 안 뜬다) 더 그렇다.

   그래서 셋을 둔다:
   1. 저장되면 **토스트로 무엇이 얼마로 저장됐는지** 알리고 그 칸을 잠깐 반짝인다
      (`.just-saved` — 한 칸에 한 번만 도는 box-shadow 애니메이션이다. 배경색은
      `.money-input`이 `!important`라 애니메이션이 못 이긴다).
   2. 금액 칸에 커서가 있는 동안만 화면 아래에 **`✓ 입력 완료`**(`#moneyDoneBar`)가 뜬다.
      누르면 포커스를 빼서 저장을 태우고, 바뀐 게 없으면 그렇다고 말해 준다.
      단추의 `pointerdown`을 막아 **단추를 누르는 순간 포커스가 먼저 빠지지 않게** 한다 —
      안 막으면 눌리기 전에 바가 사라져 손가락이 엉뚱한 곳에 닿는다.
      아이폰은 키보드가 올라와도 `position:fixed`가 키보드 뒤에 깔리므로
      `visualViewport`로 키보드 위에 붙인다.
   3. Enter(안드로이드 키보드의 완료 키)로도 포커스가 빠져 저장된다. */
const MONEY_FIELD_LABEL = { start: '시작 금액', end: '남은 금액', donate: '찬조' };
let lastMoneySavedAt = 0;

function isMoneyField(el) {
    return !!el && el.matches && el.matches('.money-input:not(.locked), .donate-input:not(.locked)');
}

function moneyKeydown(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
}

function flashMoneySaved(name, type, after) {
    lastMoneySavedAt = Date.now();
    showToast(`💾 ${name} ${MONEY_FIELD_LABEL[type] || type} ${formatNumber(after)}원 저장됨`);
    const el = document.getElementById(`money_${type}_${name}`);
    if (!el) return;
    el.classList.remove('just-saved');
    void el.offsetWidth;                          // 애니메이션을 처음부터 다시 돌린다
    el.classList.add('just-saved');
}

function placeMoneyDoneBar() {
    const bar = document.getElementById('moneyDoneBar');
    if (!bar || !bar.classList.contains('on')) return;
    const vv = window.visualViewport;
    // 키보드가 올라오면 보이는 영역이 줄어든다. 그 아래쪽 끝에서 12px 위에 둔다.
    const hidden = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = `${hidden + 12}px`;
}

function showMoneyDoneBar(on) {
    const bar = document.getElementById('moneyDoneBar');
    if (!bar) return;
    bar.classList.toggle('on', !!on);
    if (on) placeMoneyDoneBar(); else bar.style.bottom = '';
}

// 눌림 표시. `:active`는 터치에서 안 켜진다 — pointerdown을 막았기 때문이다(포커스를 지키려고).
// 그래서 pointerdown/up에 직접 `.pressing`을 붙였다 뗀다. 손가락이 밖으로 나가도 풀린다.
function pressMoneyDone(e, on) {
    if (on) e.preventDefault();                   // 포커스가 먼저 빠지지 않게
    e.currentTarget.classList.toggle('pressing', !!on);
}

function finishMoneyInput() {
    const el = document.activeElement;
    const before = lastMoneySavedAt;
    if (isMoneyField(el)) el.blur();              // change → updateMoney → 토스트
    if (lastMoneySavedAt === before) showToast('✔️ 변경된 금액이 없습니다.');
    showMoneyDoneBar(false);
}

document.addEventListener('focusin', e => { if (isMoneyField(e.target)) showMoneyDoneBar(true); });
document.addEventListener('focusout', e => {
    if (!isMoneyField(e.target)) return;
    // 다음 칸으로 옮겨 가는 중이면 바를 그대로 둔다.
    setTimeout(() => { if (!isMoneyField(document.activeElement)) showMoneyDoneBar(false); }, 0);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', placeMoneyDoneBar);
    window.visualViewport.addEventListener('scroll', placeMoneyDoneBar);
}

/* 계급정산·타수정산 — 표의 뒤 두 칸이 이 값이다.
   **니어 이월이 `strokeDiffOf()`를 같이 쓴다** — 규칙이 두 군데가 되면
   표에 적힌 타수정산과 니어가 합이 안 맞아 어디가 틀렸는지 알 수 없게 된다. */
function rankPenaltyOf(name, roundIdx) {
    return (cachedRoundRankProfit[name] && cachedRoundRankProfit[name][roundIdx] !== undefined)
        ? cachedRoundRankProfit[name][roundIdx] : 0;
}

function strokeDiffOf(name, roundIdx) {
    const m = (appData.roundMoney && appData.roundMoney[roundIdx] && appData.roundMoney[roundIdx][name]) || { start: 0, end: 0 };
    const start = Number(m.start) || 0, end = Number(m.end) || 0;
    if (start === 0 && end === 0) return 0;      // 아직 안 적은 사람은 0으로 둔다
    return (end - start) - rankPenaltyOf(name, roundIdx);
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

            paintMoneyResult(document.getElementById(`money_rank_${g}`), rankPenaltyOf(g, selectedMoneyRoundIdx));
            paintMoneyResult(document.getElementById(`money_stroke_${g}`), strokeDiffOf(g, selectedMoneyRoundIdx));
        });
        renderDonateRow();
        return;
    }

    tbody.setAttribute('data-round', String(selectedMoneyRoundIdx));
    tbody.setAttribute('data-lock', lockKey);
    tbody.innerHTML = "";
    golfers.forEach(g => {
        const m = appData.roundMoney[selectedMoneyRoundIdx][g] || { start: 0, end: 0 };
        const rankPenalty = rankPenaltyOf(g, selectedMoneyRoundIdx);
        const pureStrokeDiff = strokeDiffOf(g, selectedMoneyRoundIdx);

        tbody.innerHTML += `
            <tr>
                <td style="font-weight:800; color:var(--text-main);">${g}</td>
                <td>${moneyCell(g, 'start', m.start)}</td>
                <td>${moneyCell(g, 'end', m.end)}</td>
                <td><span id="money_rank_${g}" class="money-result-badge ${moneyResultTone(rankPenalty)}">${moneyResultText(rankPenalty)}</span></td>
                <td><span id="money_stroke_${g}" class="money-result-badge ${moneyResultTone(pureStrokeDiff)}">${moneyResultText(pureStrokeDiff)}</span></td>
            </tr>`;
    });
    renderDonateRow();
}

/* ── 찬조 ────────────────────────────────────────────────────────
   모임을 위해 개인이 쓴 돈이다. 정산과 달리 시작·남은 금액에서 나오지 않고
   그 사람이 따로 적는다. **합산에서 그만큼 뺀다** — -50만인 사람이 5만을 찬조하면 -55만.

   값은 `roundMoney[차수][이름].donate`에 같이 둔다. 배열을 새로 만들면
   `addRound()`·`removeRound()`가 길이를 또 맞춰야 하는데, 여기 얹으면 저절로 따라다닌다.
   예전 payload에는 이 키가 없으므로 **없으면 0으로 볼 것.**

   **표의 6번째 열로 넣지 말 것.** 5열이 이미 364px(390px 기기)를 꽉 쓰고 있어
   하나를 더 넣으면 금액 칸이 찌그러진다 — 320px에서는 지금도 가로로 넘친다.
   `.money-input`도 재사용하지 않는다(68px로 묶여 있다).

   가로 한 줄에 넷을 늘어놓는다. 이름을 위, 칸을 아래에 둬야 91px 안에 들어간다 —
   옆에 붙이면 이름이 자리를 먹어 칸이 45px로 찌그러진다. 니어는 그 아래 줄이다. */
function renderDonateRow() {
    const box = document.getElementById('donateRow');
    if (!box) return;
    const round = (appData.roundMoney && appData.roundMoney[selectedMoneyRoundIdx]) || {};
    const valueOf = g => Number(round[g] && round[g].donate) || 0;

    // 차수나 잠금이 바뀔 때만 다시 만든다. 아니면 값만 갈아 끼운다 —
    // 정산 표와 같은 이유다(안 그러면 타이핑 중에 칸이 새로 만들어져 포커스가 날아간다).
    const key = `${selectedMoneyRoundIdx}|${isMoneyUnlocked ? 'all' : myGolferName() || 'none'}`;
    if (box.getAttribute('data-key') === key) {
        golfers.forEach(g => {
            const el = document.getElementById(`money_donate_${g}`);
            if (el && document.activeElement !== el) el.value = valueOf(g) ? formatNumber(valueOf(g)) : '';
        });
        paintDonateSum();
        paintNearBox();
        return;
    }

    box.setAttribute('data-key', key);
    box.innerHTML = `
        <div class="donate-box">
            <div class="donate-head"><span class="donate-title">🎁 찬조</span><b id="donateSum"></b></div>
            <div class="donate-grid">` + golfers.map(g => {
                const v = valueOf(g);
                const editable = canEditMoney(g);
                return `<label class="donate-cell"><span class="donate-name">${g}</span>
                    <input type="text" id="money_donate_${g}" inputmode="numeric" pattern="[0-9]*"
                        class="donate-input${editable ? '' : ' locked'}" value="${v ? formatNumber(v) : ''}" placeholder="0"
                        ${editable ? '' : 'readonly '}onfocus="this.select()"
                        ${editable
                            ? `onchange="updateMoney('${g}', 'donate', this.value, ${selectedMoneyRoundIdx})" onkeydown="moneyKeydown(event)"`
                            : `onclick="moneyLockNotice('${g}')"`}></label>`;
            }).join('') + `</div>
        </div>
        <div class="near-box">
            <span class="near-head">🎯 니어 잔액</span>
            <b id="nearCarry">0원</b>
            <span id="nearCheck" class="near-check"></span>
        </div>`;
    paintDonateSum();
    paintNearBox();
}

/* ── 니어 잔액 ───────────────────────────────────────────────────
   파3 홀마다 **1인당 5천원씩** 걷는다 — 넷이면 한 홀에 2만원이다.
   18홀에 파3가 넷이니 한 차수에 8만원이 모이고, 그 홀의 니어 임자가 없으면
   그 2만원이 팟에 남아 다음으로 넘어간다. 그게 니어 잔액이다.
   **그래서 잔액은 2만원의 배수가 된다** — 8차의 40,000원은 두 홀이 주인 없이 남은 것이다.

   **잔액 하나만 적는다.** 잃은·딴 금액은 표의 `타수정산` 칸에 사람마다 이미 다 나와 있어
   되풀이일 뿐이다. 표에 없는 건 잔액 하나뿐이다.

   **더하는 값은 표의 `타수정산` 칸이다**(`strokeDiffOf()`). 시작·남은 차이를 그대로 쓰면 안 된다 —
   거기엔 계급정산이 섞여 있는데 그 돈은 공금으로 가지 선수들 사이에서 오간 게 아니다.
   표에 적힌 숫자와 같은 함수를 써야 눈으로 더해 봤을 때도 맞는다.

   **입력받지 않고 계산한다.** 타수정산의 합이 정확히 그 금액이라, 따로 적으면
   시작·남은 금액을 고칠 때마다 어긋난다. 계산하면 언제나 맞는다.

   **마이너스일 수도 있다** — 지난 차수에서 넘어온 잔액을 이번에 누가 먹어, 팟에서 나간 돈이
   걷은 돈보다 많은 경우다. 부호를 그대로 붙여 적고 색으로 구분한다. 0이면 '없음'.

   금액 옆에 `파3 2개`처럼 홀 수를 적어 봤는데 사용자 요청으로 뺐다. 되살리지 말 것. */
const NEAR_PER_PERSON = 5000;                 // 파3 한 홀에 한 사람이 내는 돈
function nearPotPerHole() { return NEAR_PER_PERSON * golfers.length; }   // 한 홀에 모이는 돈

function paintNearBox() {
    const el = document.getElementById('nearCarry');
    if (!el) return;

    // 타수정산을 다 더하면 팟에 남은 돈이 된다. 마이너스면 팟에 쌓인 것이다.
    const sum = golfers.reduce((a, g) => a + strokeDiffOf(g, selectedMoneyRoundIdx), 0);
    const left = -sum;

    el.textContent = left === 0 ? '없음' : `${left < 0 ? '-' : ''}${formatNumber(Math.abs(left))}원`;
    el.className = left === 0 ? 'zero' : (left > 0 ? 'carry-out' : 'carry-in');
    paintNearCheck(left);
}

/* ── 정산 검산 ───────────────────────────────────────────────────
   니어 팟은 파3 홀마다 2만원(1인당 5천 × 넷)씩 모이므로 **잔액은 반드시 2만원의 배수**다.
   배수가 아니면 누군가의 시작·남은 금액이 잘못 적힌 것이다. 얼마가 어긋났는지 같이 적는다.

   **`잃은 + 딴 + 잔액`을 검산으로 쓰지 말 것** — 잔액을 그 둘의 합으로 계산하므로
   언제나 0이 나온다. 늘 '일치'만 뜨는 표시는 아무것도 안 알려 준다.

   아무도 금액을 안 적은 차수는 '일치'라고 하면 거짓말이라 `입력 전`으로 둔다. */
function paintNearCheck(left) {
    const badge = document.getElementById('nearCheck');
    if (!badge) return;
    const round = (appData.roundMoney && appData.roundMoney[selectedMoneyRoundIdx]) || {};
    const entered = golfers.some(g => {
        const m = round[g] || {};
        return (Number(m.start) || 0) !== 0 || (Number(m.end) || 0) !== 0;
    });

    if (!entered) {
        badge.className = 'near-check none';
        badge.textContent = '미입력';
        return;
    }

    const per = nearPotPerHole();
    const off = per > 0 ? Math.abs(left) % per : 0;
    if (off === 0) {
        badge.className = 'near-check ok';
        badge.textContent = '✅ 정산 일치';
    } else {
        badge.className = 'near-check bad';
        badge.textContent = `⚠️ 불일치 ${formatNumber(Math.min(off, per - off))}원`;
    }
}

// 이 차수에 모인 찬조. 0이면 아무것도 안 적는다 — 늘 '0원'이 붙어 있으면 잡음이다.
function paintDonateSum() {
    const el = document.getElementById('donateSum');
    if (!el) return;
    const round = (appData.roundMoney && appData.roundMoney[selectedMoneyRoundIdx]) || {};
    const sum = golfers.reduce((a, g) => a + (Number(round[g] && round[g].donate) || 0), 0);
    el.textContent = sum ? `찬조 합계 ${formatNumber(sum)}원` : '';
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
        : `🔒 먼저 사용자 이름을 등록해 주세요.`);
}

function toggleMoneyEdit() {
    isMoneyUnlocked = !isMoneyUnlocked;
    renderMoneyTable();
    renderAdminModal();
    showToast(isMoneyUnlocked
        ? "💰 정산 금액 전체 수정을 활성화했습니다."
        : "🔒 정산 금액 수정을 본인 항목으로 제한했습니다.");
}

/* ── 내가 방금 적은 금액은 들어오는 payload에 덮이지 않는다 ───────
   "시작 금액을 적고 남은 금액을 적다 보면 금액이 사라진다"는 제보가 있었다.
   부분 저장이 없어 **언제나 행 전체가 오가기** 때문에 두 갈래로 지워진다:
   1. **내 저장의 메아리가 늦게 온다.** 시작 금액 저장(A)과 남은 금액 저장(B)을 잇따라 보내면
      A의 실시간 이벤트가 B보다 늦게 도착할 수 있다. A에는 남은 금액이 없으므로
      `appData = payload`로 갈아 끼우는 순간 방금 적은 남은 금액이 0으로 돌아간다.
   2. **남이 같은 때 저장한다.** 넷이 둘러앉아 각자 금액을 적는 정산 자리에서, 내 금액을
      아직 모르는 payload가 내 것을 덮는다. 폰이 잠겨 있던 사람은 실시간을 놓쳐 더 낡아 있다.
   그래서 내가 적은 금액을 `MONEY_GUARD_MS` 동안 들고 있다가, 들어온 payload에 그 값이 없으면
   `reapplyMyMoney()`가 다시 얹는다. 얹었으면 **한 번 더 저장해** 남의 화면에도 돌려준다 —
   내 화면에만 있고 DB에 없으면 다음 사람이 또 지운다.
   **금액은 이력이 없어 한 번 지워지면 못 되살린다**(6차 정산 금액이 그렇게 날아갔다).
   이 보호막을 빼지 말 것.
   값이 이미 같으면 아무것도 안 하므로 저장 → 메아리 → 저장으로 끝없이 돌지 않는다.
   내가 **0으로 지운 것도 기억한다** — 안 그러면 낡은 payload의 옛 금액이 되살아난다. */
const MONEY_GUARD_MS = 60000;      // 확인이 영영 안 와도 이만큼만 붙들고 있는다
const MONEY_GUARD_KEY = 'jtfag_money_guard';

/* **이 기억은 새로고침해도 살아남아야 한다.** 넷이 동시에 적으면, 먼저 적은 사람 금액이
   남의 낡은 payload에 잠깐 지워졌다가 **그 사람 폰이 되살려 놓는다.** 그런데 적자마자 앱을
   닫거나 새로고침하면 기억이 날아가 되살릴 사람이 없어진다(금액은 이력이 없어 끝이다).
   그래서 localStorage에 같이 둔다 — 다시 열면 `fetchFromSupabase()`가 읽어 온 payload에
   내 값이 없는 걸 보고 되돌려 놓는다. 1분 상한은 그대로다. */
function loadMoneyGuard() {
    try {
        const a = JSON.parse(localStorage.getItem(MONEY_GUARD_KEY) || '[]');
        const now = Date.now();
        return Array.isArray(a) ? a.filter(e => e && typeof e.at === 'number' && now - e.at < MONEY_GUARD_MS) : [];
    } catch (e) { return []; }
}
function saveMoneyGuard() {
    try {
        if (myMoneyEdits.length) localStorage.setItem(MONEY_GUARD_KEY, JSON.stringify(myMoneyEdits));
        else localStorage.removeItem(MONEY_GUARD_KEY);
    } catch (e) { /* 저장 공간이 막혀도 앱은 그대로 돌아간다 */ }
}

let myMoneyEdits = loadMoneyGuard();

function rememberMyMoney(round, name, field, value) {
    const now = Date.now();
    myMoneyEdits = myMoneyEdits.filter(e => now - e.at < MONEY_GUARD_MS
        && !(e.round === round && e.name === name && e.field === field));
    myMoneyEdits.push({ round, name, field, value, at: now });
    saveMoneyGuard();
}

/* 들어온 payload에 내가 적은 금액이 그대로 있으면 **확인된 것**이라 기억에서 지운다.
   없으면 다시 얹는다. 시간이 아니라 '확인됐는가'로 손을 떼므로, 보호가 필요 없는 값을
   붙들고 있지 않고 확인이 늦어도 지켜 준다. (그래도 영영 붙들진 않게 1분 상한을 둔다.) */
function reapplyMyMoney() {
    // 테이블 모드에서는 쓰지 않는다 — 테이블 값을 얹는 `overlayMoney()`가 그 일을 한다.
    // 여기서 payload를 또 저장하면 그게 다시 낡은 값을 퍼뜨리는 통로가 된다.
    if (typeof moneyMode !== 'undefined' && moneyMode === 'table') { myMoneyEdits = []; saveMoneyGuard(); return false; }
    const now = Date.now();
    let fixed = false;
    myMoneyEdits = myMoneyEdits.filter(e => {
        if (now - e.at >= MONEY_GUARD_MS) return false;
        if (e.round < 0 || e.round >= (appData.totalRounds || 0)) return false;   // 차수가 지워졌으면 손대지 않는다
        if (!appData.roundMoney) appData.roundMoney = [];
        if (!appData.roundMoney[e.round]) appData.roundMoney[e.round] = {};
        if (!appData.roundMoney[e.round][e.name]) appData.roundMoney[e.round][e.name] = { start: 0, end: 0 };
        const row = appData.roundMoney[e.round][e.name];
        // 값이 맞으면 확인된 것으로 보고 손을 뗀다. '맞아도 1분 내내 지키기'로 바꿔 봤는데
        // 네 폰이 서로 자기 칸을 되살리느라 4초에 저장이 83번 나갔다(multi.js payload).
        // 이 보호막은 테이블이 없을 때만 쓰는 임시 그물이다 — 진짜 해법은 money.js의 분리 저장이다.
        if ((Number(row[e.field]) || 0) === e.value) return false;
        row[e.field] = e.value; fixed = true;
        return true;
    });
    saveMoneyGuard();
    return fixed;
}

function updateMoney(name, type, value, round) {
    // 화면이 막고 있어도 여기서 한 번 더 본다 — 이 함수가 유일한 입구다.
    if (!canEditMoney(name)) { moneyLockNotice(name); renderMoneyTable(); return; }
    // 칸에 박아 둔 차수를 쓴다. 없으면(예전 호출) 지금 보고 있는 차수.
    const r = (round === undefined || round === null) ? selectedMoneyRoundIdx : Number(round);
    if (r < 0 || r >= appData.totalRounds) return;          // 그 사이 차수가 지워졌다
    if (!appData.roundMoney) appData.roundMoney = [];
    if (!appData.roundMoney[r]) appData.roundMoney[r] = {};
    if (!appData.roundMoney[r][name]) appData.roundMoney[r][name] = { start: 0, end: 0 };
    const after = parseNumber(value);
    const before = Number(appData.roundMoney[r][name][type]) || 0;
    if (moneyMode === 'table') {
        // **그 칸 한 줄만 쓴다**(money.js). payload를 통째로 보내지 않으므로 남의 금액에 닿을 수 없다.
        if (after !== before) {
            saveState();
            appData.roundMoney[r][name][type] = after;
            writeMoneyCell(r, name, type, after);
            renderAll();
        }
    } else {
        rememberMyMoney(r, name, type, after);    // 테이블이 없을 때의 보호막 — 낡은 payload에 덮이지 않게
        if (after !== before) {                   // 같은 값이면 헛저장을 안 만든다
            saveState();
            appData.roundMoney[r][name][type] = after;
            syncToSupabase(appData); renderAll();
        }
    }
    // 값이 그대로여도 칸의 글자는 맞춰 둔다 — `300000`을 치면 `300,000`으로 보여야
    // '입력이 안 먹었나' 싶지 않다. 보고 있는 차수의 칸일 때만 손댄다.
    if (r === selectedMoneyRoundIdx) {
        const el = document.getElementById(`money_${type}_${name}`);
        if (el && document.activeElement !== el) {
            el.value = (type === 'donate') ? (after ? formatNumber(after) : '') : formatNumber(after);
        }
    }
    flashMoneySaved(name, type, after);           // 렌더 뒤에 — 칸이 새로 만들어졌을 수 있다
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
    const settled = settleScheduleRound();   // 지운 차수에 남아 있던 일정을 마지막 차수로
    const seeded = typeof seedTrips === 'function' && seedTrips();   // 여행 일정(trip.js) — 처음 한 번만
    if (changed || filled || dropped || settled || seeded) syncToSupabase(appData);
}

function toggleScoreEdit() {
    isScoreUnlocked = !isScoreUnlocked;
    renderTable();
    renderAdminModal();
    showToast(isScoreUnlocked
        ? "✏️ 타수 직접 수정을 활성화했습니다. 홀 기록이 있는 차수는 제외됩니다."
        : "🔒 타수 수정을 잠갔습니다.");
}

/* ── 독수리 3연속 명예 표식 ────────────────────────────────────────
   `🦅 3연속` 뱃지는 **연속이 이어지는 동안만** 붙는다 — 매를 한 번 하면 사라져
   '예전에 이뤘다'는 기록이 어디에도 안 남는다. 그래서 이름 옆에 작은 ⭐를 붙인다.
   한 번 달리면 안 없어지고, `bestEagleStreak()`(calc.js)로 **계산해서** 내므로
   payload에 새 필드가 안 생긴다.

   **표와 요약 카드가 이 함수 하나를 같이 쓴다** — 규칙이 두 군데가 되면 한쪽에만 별이 붙는다.
   양쪽에 빈 `<span data-crown="이름">`을 심어 두고 여기서 채운다.
   부르는 곳은 `calculateAndRender()`(계급을 낸 직후)와 `renderTable()`(칸을 새로 만든 뒤)이다.

   **표식에 애니메이션을 걸지 말 것** — 이름은 표에 네 줄, 요약 카드에 네 개가 늘 떠 있어
   '항상 켜져 있는 그리기 비용'이 된다(안드로이드에서 화면이 끊긴 그 자리다). */
const EAGLE_HONOR_NEED = 3;

function eagleHonorBest(g) {
    if (typeof bestEagleStreak !== 'function') return 0;
    return bestEagleStreak((typeof golferRankHistory !== 'undefined' && golferRankHistory[g]) || []);
}

function paintEagleCrowns() {
    document.querySelectorAll('[data-crown]').forEach(el => {
        const best = eagleHonorBest(el.getAttribute('data-crown'));
        const on = best >= EAGLE_HONOR_NEED;
        el.textContent = on ? '⭐' : '';
        el.className = on ? 'eagle-honor' : 'eagle-honor off';
    });
}

// 별을 누르면 무슨 뜻인지 알려 준다. 안 그러면 아는 사람만 아는 표시가 된다.
function eagleHonorNotice(g) {
    const best = eagleHonorBest(g);
    if (best < EAGLE_HONOR_NEED) return;
    showToast(`⭐ ${g}님 · 독수리 ${EAGLE_HONOR_NEED}연속 달성자 (최고 ${best}연속)`);
}

function renderTable() {
    const headerRow = document.getElementById('headerRow'); const tbody = document.getElementById('scoreTbody');
    
    const currentInputs = tbody.querySelectorAll('.score-input');
    const expectedCount = appData.totalRounds * golfers.length;
    
    if (currentInputs.length === expectedCount && tbody.children.length === golfers.length) {
        for (let r = 0; r < appData.totalRounds; r++) {
            const cInput = document.getElementById(`course_input_${r}`);
            if (cInput && document.activeElement !== cInput) cInput.value = (appData.courses && appData.courses[r]) ? appData.courses[r] : "";
            paintSubCourse(r);
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
        // 빠른 길에서도 명예 표식을 다시 칠한다 — 빠뜨리면 차수가 늘어 3연속이 되어도
        // 표의 별이 새로고침 전까지 안 붙는다(정산 칸 잠금이 `data-lock` 없이 그랬던 자리다).
        paintEagleCrowns();
        return;
    }

    let headerHtml = `<th class="sticky-col-1">이름</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        // 골프장은 사람이 여기서 치지 않는다 — 일정에서 차수를 고르면 저절로 채워진다.
        // 칸을 눌렀을 때 그 차수 일정이 열리게 해 둔다(고칠 길이 있어야 한다).
        headerHtml += `<th><div class="header-round-title">${r + 1}차</div><div class="course-slot" onclick="openScheduleForRound(${r})"><input type="text" id="course_input_${r}" class="course-input locked" readonly value="${escapeHtml((appData.courses && appData.courses[r]) || "")}" placeholder="골프장"></div><div id="photo_btn_${r}" class="photo-btn" onclick="openRoundPhotoModal(${r})">📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장</div></th>`;
    }
    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap;">- 평균</th>`;
    headerRow.innerHTML = headerHtml;
    for (let r = 0; r < appData.totalRounds; r++) paintSubCourse(r);

    tbody.innerHTML = "";
    golfers.forEach(name => {
        const tr = document.createElement('tr'); tr.setAttribute('data-name', name);
        let rowHtml = `<td class="golfer-name sticky-col-1">${name}<span class="eagle-honor off" data-crown="${name}" onclick="eagleHonorNotice('${name}')"></span></td>`;
        for (let r = 0; r < appData.totalRounds; r++) {
            const locked = isScoreCellLocked(r);
            rowHtml += `<td class="score-cell"><input type="text" id="score_input_${name}_${r}" inputmode="numeric" pattern="[0-9]*" class="score-input${locked ? ' locked' : ''}"${locked ? ' readonly' : ''} value="${(appData.scores[name] && appData.scores[name][r] !== undefined) ? appData.scores[name][r] : ""}" placeholder="타수" onfocus="this.select()" onchange="updateScore('${name}', ${r}, this.value)"></td>`;
        }
        rowHtml += `<td class="avg-cell"><span class="avg-pill empty">-</span></td>`;
        tr.innerHTML = rowHtml; tbody.appendChild(tr);
    });
    paintEagleCrowns();   // 칸을 새로 만들었으니 명예 표식을 다시 붙인다
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
    // 같은 번호의 차수를 예전에 지운 적이 있으면 테이블에 그때 금액이 남아 있다. 새 경기라 비운다.
    if (typeof clearMoneyRound === 'function') clearMoneyRound(appData.totalRounds - 1);
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
    const detail = parts.length ? parts.join(' · ') : '입력된 데이터 없음';

    const ok = await showConfirmPrompt(
        `${r + 1}차전을 삭제할까요?<br>` +
        `<span style="font-size:0.78rem; font-weight:600; color:#cbd5e1;">${detail}</span>` +
        (photos ? `<br><span style="font-size:0.72rem; font-weight:600; color:#94a3b8;">실시간 동기화 상황에 따라 되돌리기 시 사진 목록이 복구되지 않을 수 있습니다.</span>` : ''),
        "삭제");
    if (!ok) return;

    saveState(); appData.totalRounds--;
    if (appData.courses) appData.courses.pop();
    if (appData.roundPhotos && appData.roundPhotos.length > 0) appData.roundPhotos.pop();
    golfers.forEach(name => { if (appData.scores[name]) appData.scores[name].pop(); });
    if (appData.roundMoney && appData.roundMoney.length > 0) appData.roundMoney.pop();
    if (selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
    const moved = carryScheduleAfterRemove(r + 1);
    syncToSupabase(appData); renderAll();
    showToast(`➖ ${r + 1}차전 데이터가 삭제되었습니다.` + (moved ? ` 일정은 ${appData.totalRounds}차로 이동했습니다.` : ''));
}

/* 지운 차수에 일정이 붙어 있었다면 어디로 가야 하나.
   10차를 지웠는데 일정 창을 열면 여전히 `10차 (예정) · 골프장`이 골라져 있었다 —
   `nextRoundNo`와 `roundCourses[10]`이 그대로 남기 때문이다(골프장 이름은 차수를 지웠다
   다시 만들어도 돌아오도록 **일부러** 남긴다). 그런데 일정까지 지운 차수를 붙들고 있으면
   "지웠는데 아직 있다"로 보인다.

   남은 마지막 차수가 **아직 안 친 차수**면 일정을 그쪽으로 옮긴다 — 지운 차수는 미리 만들어
   둔 것이었을 테니. 골프장·코스도 함께 옮기고 지운 번호의 것은 지운다.
   '안 친 차수'는 `roundIsEmpty()`로 본다 — 홀 기록·타수·정산 금액·사진이 **모두** 없을 때만이다.
   홀 기록만 보면 지난 차수를 치고 스코어카드를 아직 안 올린 사이에 다음 일정을 잡은 경우에
   그 차수를 안 친 것으로 잘못 보고 골프장을 덮어쓴다. 하나라도 있으면 다음 라운드는 정말로
   지운 번호이므로 그대로 둔다.

   **이미 그렇게 된 데이터도 접속할 때 바로잡는다**(`settleScheduleRound()`, `applyHoleScores()`에서).
   일정이 '아직 없는 다음 차수'에 붙어 있는데 마지막 차수가 비어 있으면 같은 규칙으로 옮긴다.
   바뀐 게 있을 때만 true를 돌려 헛저장이 안 나간다. */
function roundIsEmpty(r) {
    if (r < 0 || r >= appData.totalRounds || hasHoleRecord(r)) return false;
    const scored = golfers.some(g => {
        const v = appData.scores && appData.scores[g] && appData.scores[g][r];
        return v !== "" && v !== undefined && v !== null && !isNaN(parseFloat(v));
    });
    if (scored) return false;
    const money = appData.roundMoney && appData.roundMoney[r];
    const paid = money && golfers.some(g => money[g] && ((Number(money[g].start) || 0) !== 0 || (Number(money[g].end) || 0) !== 0 || (Number(money[g].donate) || 0) !== 0));
    if (paid) return false;
    const photos = appData.roundPhotos && appData.roundPhotos[r];
    return !(photos && photos.length);
}

function moveScheduleTo(from, to) {
    const clubs = roundCourseMap(), subs = subCourseMap();
    appData.nextRoundNo = to;
    if (clubs[from]) {
        clubs[to] = clubs[from];
        if (!appData.courses) appData.courses = [];
        if (to <= appData.totalRounds) appData.courses[to - 1] = clubs[from];
    }
    delete clubs[from];
    if (subs[from]) subs[to] = subs[from]; else delete subs[to];
    delete subs[from];
}

function carryScheduleAfterRemove(deleted) {
    if (parseInt(appData.nextRoundNo, 10) !== deleted) return false;
    const last = appData.totalRounds;
    if (!roundIsEmpty(last - 1)) return false;
    moveScheduleTo(deleted, last);
    return true;
}

function settleScheduleRound() {
    const next = parseInt(appData.nextRoundNo, 10);
    const last = appData.totalRounds;
    if (next !== last + 1 || !roundIsEmpty(last - 1)) return false;
    moveScheduleTo(next, last);
    return true;
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
        content.innerHTML = `<div class="subs-empty">알림 수신 기기가 없습니다.<br>상단 🔔 버튼으로 활성화할 수 있습니다.</div>`;
        return;
    }

    // 사람별로 묶어 보여 준다. 이름을 안 남긴 구독은 맨 뒤로.
    const byName = {};
    pushSubsCache.forEach((s, i) => {
        const key = s.name || '이름 미등록';
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
                        <button type="button" class="subs-del" onclick="removePushSub(${idx})" title="알림 해제">✕</button>
                    </div>`;
                }).join('')}
            </div>`).join('') +
        `<div class="subs-note">✕를 누르면 해당 기기의 알림 수신이 해제됩니다. 사용자가 다시 활성화하면 복구됩니다.<br>
         기기 변경·앱 삭제로 만료된 구독은 다음 발송 시 자동으로 정리됩니다.</div>`;
}

// 남의 기기를 지우면 그 사람은 이유도 모른 채 알림이 끊긴다. 그래서 한 번 더 묻는다.
async function removePushSub(idx) {
    const sub = pushSubsCache[idx];
    if (!sub) return;
    const me = sub.endpoint === pushSubsMine;
    const who = sub.name || '이름 미등록';

    const ok = await showConfirmPrompt(
        `${escapeHtml(who)}님의 <b>${escapeHtml(pushEndpointLabel(sub.endpoint))}</b> 알림을 해제할까요?` +
        `<br><span style="font-size:0.8rem; font-weight:400; color:#94a3b8;">` +
        (me ? '현재 사용 중인 기기입니다. 🔔 버튼으로 다시 활성화할 수 있습니다.'
            : '해당 기기에서 🔔 버튼을 누르면 다시 활성화됩니다.') + '</span>', '알림 해제');
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
    showToast("🔕 알림을 해제했습니다.");
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
            ? `📷 ${selectedScorecardRound + 1}차 스코어카드 재업로드`
            : `📷 ${selectedScorecardRound + 1}차 스코어카드 사진 업로드`);

    // 지울 게 있을 때만 보여 준다 — 홀 기록이 없는 차수에 뜨면 누를 이유가 없다.
    const delBtn = document.getElementById('scorecardDelBtn');
    if (delBtn) {
        const can = selectedScorecardRound !== -1 && hasHoleRecord(selectedScorecardRound);
        delBtn.style.display = can ? '' : 'none';
        if (can) delBtn.textContent = `🗑️ ${selectedScorecardRound + 1}차 홀 기록 삭제`;
    }

    const list = (appData.scoreRequests || []).slice().reverse();
    if (list.length === 0) {
        log.innerHTML = `<div class="scorecard-log-empty">등록된 스코어카드가 없습니다.</div>`;
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

/* 홀 기록 지우기 요청. 사진 판독과 **같은 줄**을 탄다 —
   `stats.js`는 저장소 파일이라 앱이 직접 못 고치고, 워크플로만 고칠 수 있기 때문이다.
   요청을 payload에 남기면 `kickScorecardWorkflow()`가 깨우고,
   `scripts/read-scorecard.js`의 `removeOne()`이 그 차수 블록을 걷어내 커밋한다.

   **이 길이 없으면 막다른 길이 된다** — 홀 기록이 있는 차수는 타수 칸이 잠겨
   관리자 메뉴로도 못 고친다. 8차 카드가 9차로 잘못 올라갔을 때 실제로 그랬다. */
async function requestHoleDelete() {
    if (selectedScorecardRound === -1) { showToast("⚠️ 차수를 먼저 선택해 주세요."); return; }
    const round = selectedScorecardRound;
    if (!hasHoleRecord(round)) { showToast(`${round + 1}차는 홀 기록이 없습니다.`); return; }

    const scores = golfers.map(g => {
        const v = appData.scores && appData.scores[g] && appData.scores[g][round];
        return `${g} ${v || '-'}타`;
    }).join(' · ');
    const okGo = await showConfirmPrompt(
        `🗑️ <b>${round + 1}차</b> 홀 기록을 삭제할까요?` +
        `<div style="font-size:0.76rem; font-weight:600; color:#cbd5e1; margin-top:10px; line-height:1.6;">` +
        `현재 기록<br>${escapeHtml(scores)}</div>` +
        `<div style="font-size:0.74rem; font-weight:600; color:#94a3b8; margin-top:10px; line-height:1.6;">` +
        `삭제하면 타수 칸 잠금이 해제되어 올바른 사진을 재업로드하거나 직접 수정할 수 있습니다.<br>` +
        `<span style="color:#fbbf24;">스코어표의 타수는 자동으로 삭제되지 않습니다. 삭제 후 직접 수정해 주세요.</span></div>`,
        "삭제");
    if (!okGo) return;

    const now = new Date();
    saveState();
    if (!appData.scoreRequests) appData.scoreRequests = [];
    appData.scoreRequests.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        action: '삭제',                 // 이게 있으면 판독 대신 삭제로 간다
        round: round + 1,
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        by: localStorage.getItem('jtfag_my_name') || SCORE_OWNER,
        status: '대기',
        note: ''
    });
    while (appData.scoreRequests.length > MAX_SCORE_REQUESTS) appData.scoreRequests.shift();

    // 사진 등록과 같은 이유로 저장이 끝난 뒤에 깨운다 — 워크플로가 DB의 '대기'를 보고 움직인다.
    await syncToSupabase(appData);
    renderScoreRequestModal();
    showToast(`🗑️ ${round + 1}차 삭제를 요청했습니다.`);
    if (await kickScorecardWorkflow()) {
        showToast("🚀 처리를 시작했습니다. 1~2분 뒤 새로고침하면 반영됩니다.");
    }
}

async function handleScorecardUpload(event) {
    const input = event.target;
    const file = (input.files || [])[0];
    input.value = '';
    if (!file) return;
    if (selectedScorecardRound === -1) { showToast("⚠️ 차수를 먼저 선택해 주세요."); return; }
    const round = selectedScorecardRound;

    // 게스트는 이름이 아니라 타수로 지목한다. 스코어카드가 이름을 가려 보여줘도,
    // 성이 우리와 겹쳐도 이 타수 한 줄만 정확히 빠진다.
    // 버디·파는 그 타수인 사람이 둘일 때만 쓰는 보조 열쇠라 비워둘 수 있다.
    let guestTotal = null, guestBirdies = null, guestPars = null;
    if (document.getElementById('scorecardHasGuest').checked) {
        guestTotal = parseNumber(document.getElementById('scorecardGuestTotal').value);
        if (!Number.isInteger(guestTotal) || guestTotal < 50 || guestTotal > 200) {
            showToast("⚠️ 게스트 타수를 정확히 입력해 주세요. (예: 100)");
            return;
        }
        const optional = (id, label) => {
            const raw = document.getElementById(id).value.trim();
            if (raw === '') return null;
            const n = parseNumber(raw);
            if (!Number.isInteger(n) || n < 0 || n > 18) { showToast(`⚠️ 게스트 ${label} 개수가 올바르지 않습니다. (0~18)`); return false; }
            return n;
        };
        guestBirdies = optional('scorecardGuestBirdie', '버디');
        if (guestBirdies === false) return;
        guestPars = optional('scorecardGuestPar', '파');
        if (guestPars === false) return;
    }

    showToast("⏳ 스코어카드를 업로드 중입니다...");
    let url;
    try {
        url = await uploadPhotoBlob(await compressImageToBlob(file, SCORECARD_MAX_PX, SCORECARD_QUALITY), round);
    } catch (err) {
        console.error("스코어카드 업로드 실패:", err);
        showToast("⚠️ 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요.");
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
        ? `✅ ${round + 1}차 스코어카드를 등록했습니다. 판독 완료 후 타수가 자동 반영됩니다.`
        : `✅ ${round + 1}차 스코어카드를 등록했습니다. 게스트(${guestTotal}타)는 제외하고 기록됩니다.`);

    // 예약 실행을 기다리지 않고 지금 판독을 시작시킨다.
    // 실패해도 등록은 이미 끝났고 예약 실행이 그물로 남아 있으므로 조용히 넘어간다.
    if (await kickScorecardWorkflow()) {
        showToast("🚀 판독을 시작했습니다. 1~2분 뒤 새로고침하면 타수가 반영됩니다.");
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
    // **올리기 시작한 차수를 붙들어 둔다.** 원본은 오래 걸려 그사이 다른 차수 갤러리를 열 수 있는데,
    // 그때그때 `selectedPhotoRoundIdx`를 읽으면 사진이 나중에 연 차수에 붙었다(금액 칸이 그랬던 것과 같은 자리).
    const round = selectedPhotoRoundIdx;
    if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
    if (!appData.roundPhotos[round]) appData.roundPhotos[round] = [];
    if (appData.roundPhotos[round].length + files.length > MAX_PHOTOS_PER_ROUND) {
        showToast(`⚠️ 사진은 차수별로 최대 ${MAX_PHOTOS_PER_ROUND}장까지만 등록 가능합니다.`);
        input.value = ''; return;
    }

    /* 라운드 사진은 **원본 그대로** 올린다. 예전엔 긴 변 800px·품질 0.6으로 줄였는데,
       큰 화면에서 보거나 저장하면 뭉개져서 남는 기록으로는 아까웠다.
       payload에는 URL만 들어가므로(사진은 Storage에) payload 용량에는 영향이 없다.
       대신 Storage는 그만큼 쓰고 업로드도 오래 걸려, 몇 장째인지 보여 준다.
       **스코어카드는 그대로 1600px로 줄인다**(`SCORECARD_MAX_PX`) — 판독에 그 이상은
       필요 없고, 크게 보내면 판독만 느려지고 비싸진다. */
    showToast(files.length > 1
        ? `⏳ 사진 ${files.length}장을 원본으로 업로드 중입니다...`
        : "⏳ 사진을 원본으로 업로드 중입니다...");
    const urls = [];
    let failed = 0;
    for (let i = 0; i < files.length; i++) {
        try {
            if (files.length > 1) showToast(`⏳ ${i + 1}/${files.length}장 업로드 중... (원본)`);
            // File은 Blob이라 그대로 올라간다 — 다시 그리지 않으므로 화질이 그대로다.
            urls.push(await uploadPhotoBlob(files[i], round));
        } catch (err) { console.error("사진 업로드 실패:", err); failed++; }
    }
    input.value = '';

    // 한 장이라도 올라갔으면 그만큼만 반영한다. 전부 실패하면 상태를 건드리지 않는다.
    if (urls.length === 0) { showToast("⚠️ 사진 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요."); return; }
    // 올리는 사이 실시간 갱신으로 appData가 통째로 바뀌었을 수 있어 지금 것에 다시 붙인다.
    // 그사이 그 차수가 지워졌으면 붙일 곳이 없다 — 파일은 Storage에 남아 있다.
    if (round >= appData.totalRounds) { showToast("⚠️ 업로드 중 해당 차수가 삭제되어 사진을 등록하지 못했습니다."); return; }
    if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
    if (!appData.roundPhotos[round]) appData.roundPhotos[round] = [];
    saveState();
    appData.roundPhotos[round].push(...urls);
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
    if (!(await showConfirmPrompt(`사진 ${targetCount}장을 Storage로 옮깁니다.<br><span style='font-size:0.78rem; font-weight:600; color:#6b7075;'>되돌릴 수 없습니다.</span>`, "이전하기", "#d4af37"))) return;

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

/* **누른 순간의 사진 주소로 지운다.** 예전엔 순번으로 지웠는데, 확인창이 떠 있는 사이 남이
   같은 차수 사진을 지우면 실시간 갱신으로 순번이 밀려 **엉뚱한 사진이 Storage에서 영구히 지워졌다.**
   확인을 누른 뒤 지금 목록에서 그 주소를 다시 찾고, 이미 없으면 아무것도 안 한다. */
async function deleteRoundPhoto(photoIdx) {
    const round = selectedPhotoRoundIdx;
    const removed = ((appData.roundPhotos || [])[round] || [])[photoIdx];
    if (!removed) return;
    if (!(await showConfirmPrompt("이 사진을 삭제할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#6b7075;'>되돌릴 수 없습니다.</span>"))) return;
    const list = (appData.roundPhotos || [])[round] || [];
    const idx = list.indexOf(removed);
    if (idx < 0) { showToast("이미 삭제된 사진입니다."); renderRoundPhotos(); return; }
    saveState(); list.splice(idx, 1);
    syncToSupabase(appData); renderRoundPhotos(); renderAll();
    showToast("🗑️ 사진이 삭제되었습니다.");
    await deletePhotoFromStorage(removed);
}

function openImageViewModal(src) {
    initPhotoZoom();
    photoZoomReset();
    document.getElementById('fullImageView').src = src;
    document.getElementById('imageViewModal').classList.add('active');
}
function closeImageViewModal() {
    document.getElementById('imageViewModal').classList.remove('active');
    document.getElementById('fullImageView').src = "";
    photoZoomReset();
}

/* ── 사진 확대 ────────────────────────────────────────────────────
   viewport가 `user-scalable=no`라 브라우저의 두 손가락 확대가 안 먹는다. 그래서 여기서
   포인터 이벤트로 직접 한다 — 두 손가락 벌리기 · 한 손가락 끌기 · 두 번 두드리기 · 마우스 휠.
   **`transform`만 움직인다.** 다른 연출과 같은 이유다(안드로이드에서 filter는 끊긴다).

   벌릴 때 손가락 가운데 점이 제자리에 있어야 자연스럽다. 가운데를 기준으로 그냥 키우면
   보고 있던 곳이 밖으로 밀려난다. 그래서 그 점의 원본 좌표를 잡아 두고 배율을 바꾼 뒤
   같은 자리에 오도록 이동값을 다시 푼다.

   무대(.photo-stage)에 `touch-action: none`을 줘야 페이지가 같이 밀리지 않는다.
   **손을 뗀 자리가 사진 밖이고 움직인 적이 없으면 닫는다** — 끌다가 놓았다고 닫히면 안 된다. */
const photoZoom = {
    bound: false, scale: 1, tx: 0, ty: 0,
    pointers: new Map(), pinch: null, drag: null, moved: false, lastTap: 0
};
const PHOTO_ZOOM_MAX = 5;
const PHOTO_ZOOM_TAP = 2.5;   // 두 번 두드렸을 때 배율

function photoZoomApply(animate) {
    const img = document.getElementById('fullImageView');
    if (!img) return;
    img.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
    img.style.transform = `translate(${photoZoom.tx}px, ${photoZoom.ty}px) scale(${photoZoom.scale})`;
}

function photoZoomReset() {
    photoZoom.scale = 1; photoZoom.tx = 0; photoZoom.ty = 0;
    photoZoom.pointers.clear(); photoZoom.pinch = null; photoZoom.drag = null; photoZoom.moved = false;
    photoZoomApply(false);
}

// 사진이 화면보다 커진 만큼만 밀 수 있게 붙잡는다. 안 그러면 사진이 화면 밖으로 날아간다.
function photoZoomClamp() {
    const img = document.getElementById('fullImageView');
    const stage = document.getElementById('photoStage');
    if (!img || !stage) return;
    const s = photoZoom.scale;
    const w = img.clientWidth * s, h = img.clientHeight * s;
    const maxX = Math.max(0, (w - stage.clientWidth) / 2);
    const maxY = Math.max(0, (h - stage.clientHeight) / 2);
    photoZoom.tx = Math.min(maxX, Math.max(-maxX, photoZoom.tx));
    photoZoom.ty = Math.min(maxY, Math.max(-maxY, photoZoom.ty));
}

// 화면의 한 점(px,py)이 제자리에 남도록 배율을 next로 바꾼다.
function photoZoomTo(next, px, py, animate) {
    const img = document.getElementById('fullImageView');
    if (!img) return;
    const r = img.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;   // 지금 화면에서의 사진 중심
    const s0 = photoZoom.scale;
    const s1 = Math.min(PHOTO_ZOOM_MAX, Math.max(1, next));
    // 그 점이 사진 안에서 어디였는지(원본 배율 기준)를 잡고, 새 배율에서 같은 자리에 오게 민다.
    const lx = (px - cx) / s0, ly = (py - cy) / s0;
    photoZoom.tx += lx * (s0 - s1);
    photoZoom.ty += ly * (s0 - s1);
    photoZoom.scale = s1;
    if (s1 === 1) { photoZoom.tx = 0; photoZoom.ty = 0; }
    photoZoomClamp();
    photoZoomApply(animate);
}

function initPhotoZoom() {
    if (photoZoom.bound) return;
    const stage = document.getElementById('photoStage');
    const img = document.getElementById('fullImageView');
    if (!stage || !img) return;
    photoZoom.bound = true;

    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const two = () => [...photoZoom.pointers.values()];

    stage.addEventListener('pointerdown', e => {
        // 이미 풀린 포인터면 브라우저가 예외를 던진다. 잡아야 나머지 손가락 처리가 이어진다.
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
        photoZoom.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, onImg: e.target === img });
        photoZoom.moved = false;
        if (photoZoom.pointers.size === 2) {
            const [a, b] = two();
            const r = img.getBoundingClientRect();
            photoZoom.pinch = {
                d0: dist(a, b), s0: photoZoom.scale, m0: mid(a, b), tx0: photoZoom.tx, ty0: photoZoom.ty,
                cx0: r.left + r.width / 2, cy0: r.top + r.height / 2      // 벌리기 시작할 때의 사진 중심
            };
            photoZoom.drag = null;
        } else if (photoZoom.pointers.size === 1) {
            photoZoom.drag = { x: e.clientX, y: e.clientY, tx0: photoZoom.tx, ty0: photoZoom.ty };
        }
    });

    stage.addEventListener('pointermove', e => {
        const p = photoZoom.pointers.get(e.pointerId);
        if (!p) return;
        p.x = e.clientX; p.y = e.clientY;

        if (photoZoom.pointers.size === 2 && photoZoom.pinch) {
            const [a, b] = two();
            const k = photoZoom.pinch;
            const m = mid(a, b);
            const s1 = Math.min(PHOTO_ZOOM_MAX, Math.max(1, k.s0 * dist(a, b) / k.d0));
            // 벌리기 시작한 가운데 점이 사진의 어디였는지(원본 배율 기준) 잡아 두고,
            // 새 배율에서 그 점이 지금 손가락 가운데로 오도록 이동값을 푼다.
            const lx = (k.m0.x - k.cx0) / k.s0, ly = (k.m0.y - k.cy0) / k.s0;
            photoZoom.scale = s1;
            photoZoom.tx = k.tx0 + lx * (k.s0 - s1) + (m.x - k.m0.x);
            photoZoom.ty = k.ty0 + ly * (k.s0 - s1) + (m.y - k.m0.y);
            photoZoom.moved = true;
            photoZoomClamp();
            photoZoomApply(false);
        } else if (photoZoom.pointers.size === 1 && photoZoom.drag && photoZoom.scale > 1) {
            const d = photoZoom.drag;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) photoZoom.moved = true;
            photoZoom.tx = d.tx0 + dx; photoZoom.ty = d.ty0 + dy;
            photoZoomClamp();
            photoZoomApply(false);
        }
    });

    const up = e => {
        const p = photoZoom.pointers.get(e.pointerId);
        photoZoom.pointers.delete(e.pointerId);
        if (photoZoom.pointers.size === 1) {
            // 한 손가락이 남으면 그 자리에서 끌기를 새로 시작한다 — 안 그러면 사진이 튄다.
            const [a] = two();
            photoZoom.drag = { x: a.x, y: a.y, tx0: photoZoom.tx, ty0: photoZoom.ty };
            photoZoom.pinch = null;
            return;
        }
        if (photoZoom.pointers.size > 0) return;
        photoZoom.pinch = null; photoZoom.drag = null;

        if (photoZoom.scale < 1.05) { photoZoom.scale = 1; photoZoom.tx = 0; photoZoom.ty = 0; photoZoomApply(true); }

        if (photoZoom.moved || !p) return;
        // 여기부터는 '두드림'이다. 사진 밖이면 닫고, 사진이면 두 번 두드림을 본다.
        if (!p.onImg) { closeImageViewModal(); return; }
        const now = Date.now();
        if (now - photoZoom.lastTap < 300) {
            photoZoom.lastTap = 0;
            photoZoomTo(photoZoom.scale > 1 ? 1 : PHOTO_ZOOM_TAP, e.clientX, e.clientY, true);
        } else {
            photoZoom.lastTap = now;
        }
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);

    // 데스크톱: 휠로 확대·축소. 마우스가 있는 자리를 기준으로 한다.
    stage.addEventListener('wheel', e => {
        e.preventDefault();
        photoZoomTo(photoZoom.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY, false);
    }, { passive: false });
}

// 사진 파일을 Blob으로. Storage URL이거나, 아직 이전하지 않은 예전 base64일 수 있다.
async function currentPhotoBlob() {
    const imgSrc = document.getElementById('fullImageView').src;
    if (!imgSrc) return null;
    if (imgSrc.startsWith('data:')) {
        const splitDataURI = imgSrc.split(','); const byteString = atob(splitDataURI[1]); const mime = splitDataURI[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab); for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
        return new Blob([ab], { type: mime });
    }
    const res = await fetch(imgSrc);
    if (!res.ok) throw new Error("사진을 불러오지 못했습니다.");
    return await res.blob();
}

function photoFileName(blob) {
    const ext = (PHOTO_EXT && PHOTO_EXT[blob.type]) || 'jpg';
    return `JTFAG_${new Date().getTime()}.${ext}`;
}

/* 도구는 다운로드와 닫기 둘뿐이다. 공유 단추도 있었는데, 폰에서 다운로드가 같은 시스템 시트를
   띄우게 되면서 둘이 똑같아져 사용자 요청으로 뺐다 — 되살리지 말 것.

   **모바일에서 다운로드는 시스템 저장 시트를 띄운다.** 웹앱은 갤러리에 직접 쓸 수 없다 —
   `<a download>`를 써 봤더니 삼성 브라우저는 "다운로드하시겠습니까?" 확인창을 띄우고,
   아이폰은 갤러리가 아니라 파일 앱으로 보내 버려 "이상한 게 뜬다"는 말이 나왔다.
   사진을 갤러리로 넣는 정식 길은 `navigator.share`에 파일을 넘기는 것이다 —
   iOS는 시트에 '이미지 저장'이 있고, 안드로이드는 갤러리·포토가 대상으로 뜬다.
   그래서 손가락 기기면 시트를 띄우고, PC처럼 시트가 없는 곳에서만 `<a download>`를 쓴다.
   `<a download>`로 되돌리지 말 것. */
// 손가락 기기인가 — maxTouchPoints만 본다. 'ontouchstart' in window는 예전 방식이라
// PC 크롬에서도 true가 나올 때가 있어 쓰지 않는다. 아이폰·안드로이드는 5 이상을 돌려준다.
function isTouchDevice() {
    return (navigator.maxTouchPoints || 0) > 0;
}

async function downloadCurrentPhoto() {
    if (!document.getElementById('fullImageView').src) return;
    if (navigator.userAgent.match(/kakaotalk/i)) { showToast("⚠️ 카카오톡 인앱 브라우저에서는 저장이 제한됩니다. '다른 브라우저로 열기'를 이용하거나 사진을 길게 눌러 저장하세요."); return; }
    try {
        const blob = await currentPhotoBlob();
        if (!blob) return;
        const file = new File([blob], photoFileName(blob), { type: blob.type || 'image/jpeg' });

        if (isTouchDevice() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'JTFAG 사진 저장' });
            showToast("📷 '이미지 저장' 또는 갤러리를 선택하면 저장됩니다.");
            return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = file.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl);
        showToast("💾 기기에 저장했습니다.");
    } catch (error) {
        if (error && error.name === 'AbortError') return;   // 시트를 그냥 닫은 것
        console.error("다운로드 에러:", error); showToast("⚠️ 저장에 실패했습니다. 사진을 길게 눌러 '이미지 저장'을 선택해 주세요.");
    }
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
        box.innerHTML = "<div style='text-align:center; color:#94a3b8;'>골프장별 승률을 산출할 기록이 없습니다.</div>";
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
        return `<option value="${escapeHtml(key)}"${key === h2hCourseKey ? ' selected' : ''}>${escapeHtml(c.label)} (${c.played}경기)</option>`;
    }).join('');
    sel.value = h2hCourseKey;

    box.innerHTML = winRateListHtml(cur.rec)
        + `<div class="winrate-note">핸디캡은 직전 2개 차수 기준으로 산출되므로 1·2차전은 집계에서 제외됩니다.</div>`;
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

    document.getElementById('reportTitle').innerHTML = `✨ <span style="color:var(--primary-gold);">${name}</span> 명예의 전당 ✨`;
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
        if (notifyDaysDraft.length >= MAX_NOTIFY_DAYS) { showToast(`⚠️ 최대 ${MAX_NOTIFY_DAYS}개까지 선택할 수 있습니다.`); return; }
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
            <div class="notify-preview-empty">알림 시점을 1개 이상 선택해 주세요.</div>`;
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

    if (days.length === 0) { showToast("⚠️ 알림 시점을 1개 이상 선택해 주세요."); return; }
    if (!title) { showToast("⚠️ 알림 제목을 입력해 주세요."); return; }

    saveState();
    appData.notifySettings = { daysBefore: days, title: title, body: body || '{일정}' };
    syncToSupabase(appData);
    closeNotifySettings();
    renderAdminModal();
    showToast(`🔔 알림 시점을 저장했습니다. (${days.map(notifyDayName).join(' · ')})`);
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
            <button type="button" class="admin-state-btn" onclick="adminLock()">잠금</button>
        </div>`;

    const legacy = countLegacyPhotos();
    let btns = `
        <button type="button" class="admin-btn" onclick="openNotifySettings()">🔔 알림 설정 <span class="admin-btn-sub">${getNotifySettings().daysBefore.map(notifyDayName).join(' · ')}</span></button>
        <button type="button" class="admin-btn" onclick="openFundLogModal()">📜 공금 수정 로그</button>
        <button type="button" class="admin-btn" onclick="openPushSubsModal()">🔔 알림 받는 기기</button>
        <button type="button" class="admin-btn" onclick="toggleScoreEdit()">${isScoreUnlocked ? '🔒 타수 수정 잠금' : '✏️ 타수 직접 수정'} <span class="admin-btn-sub">${isScoreUnlocked ? '수정 가능' : '홀 기록 없는 차수만'}</span></button>
        <button type="button" class="admin-btn" onclick="toggleMoneyEdit()">${isMoneyUnlocked ? '🔒 정산 금액 수정 잠금' : '💰 정산 금액 전체 수정'} <span class="admin-btn-sub">${isMoneyUnlocked ? '전체 수정 가능' : '기본: 본인 항목만'}</span></button>
        <button type="button" class="admin-btn" onclick="resetEffectSeen()">🎬 연출 다시 보기 <span class="admin-btn-sub">이 기기의 연출 기록만 초기화</span></button>
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
            <div class="analysis-note">${meaningful ? '막대가 짧을수록 성적이 좋은 홀 유형입니다.' : '파 유형별 편차가 거의 없습니다.'}</div></div>`;

        // ② 전반 / 후반
        const diff = a.back - a.front;
        let comment = "전·후반 편차가 크지 않습니다.";
        if (diff >= 5) comment = `후반 스코어가 평균 ${diff}타 높습니다.`;
        else if (diff <= -5) comment = `후반 스코어가 평균 ${Math.abs(diff)}타 낮습니다.`;
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
    if (!(await showConfirmPrompt("정말로 모든 데이터를<br>초기화할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#6b7075;'>스코어·정산·사진이 모두 사라집니다.</span>", "초기화"))) return;
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
        desc.textContent = '홈 화면에 앱을 설치하고 라운드 알림을 받아 보세요.';
        action.innerHTML = `<button type="button" class="install-btn" onclick="runInstall()">📲 설치</button>`;
    } else if (isIOS()) {
        desc.textContent = '앱으로 이용하고 라운드 알림을 받으려면 홈 화면에 추가하세요.';
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
    btn.title = on ? '라운드 알림 사용 중 — 눌러서 해제' : '라운드 알림 설정';
}

async function toggleRoundAlarm() {
    if (!pushSupported()) {
        showToast("⚠️ 이 브라우저는 알림을 지원하지 않습니다. 홈 화면에 추가한 앱에서 열어 주세요.");
        return;
    }
    if (Notification.permission === 'denied') {
        showToast("⚠️ 알림이 차단되어 있습니다. 기기 설정에서 이 앱의 알림을 허용해 주세요.");
        return;
    }

    const existing = await getPushSubscription();
    if (existing && Notification.permission === 'granted') {
        if (!(await showConfirmPrompt("라운드 알림을 해제할까요?<br><span style='font-size:0.78rem; font-weight:600; color:#6b7075;'>이 기기에서 더 이상 알림을 수신하지 않습니다.</span>", "해제"))) return;
        try { await unsubscribeFromPush(); showToast("🔕 라운드 알림을 해제했습니다."); }
        catch (err) { console.error(err); showToast("⚠️ 알림 해제에 실패했습니다."); }
        updateAlarmUI();
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { showToast("⚠️ 알림 권한이 허용되지 않았습니다."); updateAlarmUI(); return; }

    try {
        await subscribeToPush(localStorage.getItem('jtfag_my_name'));
        showToast(`🔔 라운드 알림을 설정했습니다. (${getNotifySettings().daysBefore.map(notifyDayName).join(' · ')})`);
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
            myName = await showNameSelectionPrompt("👋 환영합니다!<br>본인의 이름을 선택해 주세요.");
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
    
    const isConfirmed = await showConfirmPrompt("기기에 저장된 이름을 삭제하시겠습니까?<br><span style='font-size:0.8rem; font-weight:400; color:#6b7075;'>삭제 후 다음 접속 시 다시 등록할 수 있습니다.</span>");
    
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

    // 포스터 — 화면 전체를 계급 색으로 칠하고 이름을 크게 쓴다(사용자가 시안 여덟 개 중 F를 골랐다).
    // 문구(`⚔️ 맹수의 발톱!`)는 분위기를 내는 연출 글이라 그대로 둔다.
    const GREET = [
        { phrase: '✨ 황제 귀환!', from: '#d4a62a', to: '#7a4e12' },
        { phrase: '⚔️ 맹수의 발톱!', from: '#1196d8', to: '#1c4f9a' },
        { phrase: '🦢 우아한 날개짓!', from: '#a35ae6', to: '#5b3aa8' },
        { phrase: '💦 앗!', from: '#8592a0', to: '#46505c' }
    ];
    const g = GREET[myRankIdx] || GREET[3];
    const m = /src="([^"]+)"/.exec(rankInfo.icon || '');
    const pic = m ? `<img class="greet-pic" src="${m[1]}" alt="">` : '';

    // 덮는 창 하나다 — 화면 전체·position:fixed·입력을 받으므로 watchOverlays()가 뒷배경을 잠근다.
    // greet-overlay 표식은 연출(카운트업·결과 발표)이 이게 사라질 때까지 기다리게 하는 데 쓴다.
    // transform·opacity만 움직인다(blur·filter는 안드로이드에서 끊긴다).
    const overlay = document.createElement('div');
    overlay.className = 'greet-overlay greet-poster';
    overlay.style.setProperty('--g1', g.from);
    overlay.style.setProperty('--g2', g.to);
    overlay.innerHTML = `${pic}
        <div class="greet-text">
            <div class="greet-kick">${g.phrase}</div>
            <div class="greet-name">${escapeHtml(rankInfo.name)}등급<br>${escapeHtml(myName)}님</div>
            <div class="greet-msg">입장하였습니다 · 화면을 누르면 넘어갑니다</div>
        </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('show')));

    // 3초를 채우든 눌러서 넘기든 한 번만 사라지게 한다.
    let gone = false;
    const dismiss = () => {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        overlay.classList.remove('show');
        overlay.classList.add('hide');
        // 인사말이 완전히 걷힌 뒤에 연출을 시작한다 — 안 그러면 뒤에서 혼자 끝나 버린다.
        setTimeout(() => { overlay.remove(); runEntranceEffects(); }, 450);
    };
    const timer = setTimeout(dismiss, 3000);
    overlay.onclick = dismiss;
}

// 통합 정산 요약의 뱃지 칩 높이를 네 칸 모두 같게 맞춘다.
// 다 한 줄이면 한 줄 높이로 낮게, 하나라도 두 줄로 접히면 모두 두 줄 높이로 — 그래야 합산이 같은 높이에 선다.
// (예전엔 늘 두 줄 자리로 못박아 한 줄짜리 칩이 헐렁했다 — 사용자 요청 `뱃지높이를 좀만 줄여줘`.)
function equalizeSummaryBadges() {
    const grid = document.getElementById('summaryGrid');
    if (!grid) return;
    grid.style.removeProperty('--chip-h');
    let h = 0;
    grid.querySelectorAll('.sum-badges .season-badge').forEach(c => { h = Math.max(h, c.offsetHeight); });
    if (h) grid.style.setProperty('--chip-h', h + 'px');
}
let equalizeTimer = null;
window.addEventListener('resize', () => { clearTimeout(equalizeTimer); equalizeTimer = setTimeout(equalizeSummaryBadges, 150); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => equalizeSummaryBadges());

// ─── 화면 둘: 홈 / 정산·스코어 — 좌우로 밀어서 넘긴다 ───
// 사용자 요청 — `통합정산요약까지 1화면, 나머지 2화면` → `탭 모양이 너무 안예뻐. 좌우 슬라이드방식으로`.
// 숨긴 쪽은 display:none일 뿐 그대로 그려진다(renderAll은 손대지 않는다).
// 표는 숨어 있는 동안 폭이 0이라 jumpToLatestRound()가 오른쪽 끝으로 못 보낸다 —
// 처음 정산·스코어로 넘어올 때 다시 부른다(그 함수는 한 번만 보낸다).
// top: 넘어간 뒤 놓을 스크롤 자리(안 주면 맨 위).
function showPage(name, top) {
    const box = document.getElementById('appContainer');
    if (!box || (name !== 'home' && name !== 'detail')) return;
    const same = box.dataset.page === name;
    box.dataset.page = name;
    document.querySelectorAll('.page-tab').forEach(b => {
        const on = b.dataset.tab === name;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const sw = document.getElementById('pageSwitch');
    if (sw) sw.style.setProperty('--seg', name === 'detail' ? 1 : 0);
    try { sessionStorage.setItem('jtfag_page', name); } catch (e) {}
    window.scrollTo(0, typeof top === 'number' ? top : 0);
    if (!same && name === 'detail') {
        requestAnimationFrame(() => { if (typeof jumpToLatestRound === 'function') jumpToLatestRound(); forceTableReflow(); });
    }
}
// 새로고침해도 보던 화면에 남는다(앱을 새로 켜면 홈부터).
try { const p = sessionStorage.getItem('jtfag_page'); if (p === 'detail') document.addEventListener('DOMContentLoaded', () => showPage('detail')); } catch (e) {}

// 미는 동안만 두 화면을 나란히 펴고(.swiping) .pager를 옆으로 옮긴다.
// - 들어오는 화면은 지금 보이는 자리(스크롤)에 맞춰 내려 둔다 — 정산·스코어 아래쪽에서 밀어도
//   홈이 빈자리 없이 손을 따라 나온다. 넘어간 뒤 그만큼 스크롤을 옮겨 한 픽셀도 안 튄다.
// - 가로로 굴러가는 칸(타수 표 등)과 입력칸에서 시작한 손짓은 안 받는다 — 표는 표대로 민다.
const pagerSwipe = (() => {
    const EASE_MS = 320;
    const PAGE_GAP = 16;    // 두 화면 사이 틈 — style.css의 .pager gap과 같아야 한다
    let st = null;          // 손짓 하나의 상태
    let busy = false;       // 넘어가는 움직임이 도는 중
    const el = id => document.getElementById(id);
    const order = n => (n === 'detail' ? 1 : 0);
    const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function taken(t, clip) {
        if (!t || !t.closest) return true;
        if (t.closest('input, textarea, select, [contenteditable="true"]')) return true;
        for (let n = t; n && n !== clip; n = n.parentElement) {
            if (n.scrollWidth > n.clientWidth + 1) {
                const ox = getComputedStyle(n).overflowX;
                if (ox === 'auto' || ox === 'scroll') return true;
            }
        }
        return false;
    }

    // 두 화면을 펴고 들어올 화면을 지금 보는 높이에 맞춘다
    function open(from, to) {
        const box = el('appContainer'), clip = el('pagerClip'), pager = el('pager');
        const W = clip.clientWidth + PAGE_GAP;   // 한 화면 + 사이 틈
        const P = clip.getBoundingClientRect().top + window.scrollY;
        const off = Math.max(0, window.scrollY - P);
        box.classList.add('swiping');
        const incoming = box.querySelector(to === 'home' ? '.page-home' : '.page-detail');
        if (incoming && off) incoming.style.transform = `translateY(${off}px)`;
        pager.style.transform = `translateX(${-order(from) * W}px)`;
        return { box, clip, pager, W, P, off, incoming, from, to };
    }

    function paint(s, x) {
        s.pager.style.transform = `translateX(${x}px)`;
        const sw = el('pageSwitch');
        if (sw) sw.style.setProperty('--seg', Math.min(1, Math.max(0, -x / s.W)));
    }

    // 넘어가거나(commit) 제자리로 돌아간 뒤 정리한다
    function settle(s, commit) {
        busy = true;
        const sw = el('pageSwitch');
        if (sw) { sw.classList.remove('drag'); sw.style.setProperty('--seg', order(commit ? s.to : s.from)); }
        s.pager.classList.add('anim');
        s.pager.style.transform = `translateX(${-order(commit ? s.to : s.from) * s.W}px)`;
        let done = false;
        const end = () => {
            if (done) return; done = true;
            const keep = window.scrollY;
            s.pager.classList.remove('anim');
            s.pager.style.transform = '';
            if (s.incoming) s.incoming.style.transform = '';
            s.box.classList.remove('swiping');
            if (commit) showPage(s.to, s.off ? s.P : keep);
            busy = false;
        };
        s.pager.addEventListener('transitionend', end, { once: true });
        setTimeout(end, EASE_MS + 120);   // transitionend가 안 오는 판(앱을 덮어 둔 때 등)의 그물
    }

    function slideTo(name) {
        const box = el('appContainer');
        if (!box || busy || st) return;
        const from = box.dataset.page || 'home';
        if (from === name) return;
        if (reduce()) { showPage(name); return; }
        const s = open(from, name);
        void s.pager.offsetWidth;   // 출발 자리를 한 번 그려 두고 움직인다
        settle(s, true);
    }

    function start(e) {
        if (busy || e.touches.length !== 1) { st = null; return; }
        const clip = el('pagerClip');
        const t = e.touches[0];
        st = { x: t.clientX, y: t.clientY, own: false, dead: taken(e.target, clip), dx: 0, hist: [[t.clientX, Date.now()]] };
    }

    function move(e) {
        if (!st || st.dead) return;
        const t = e.touches[0];
        const dx = t.clientX - st.x, dy = t.clientY - st.y;
        if (!st.own) {
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
            if (Math.abs(dx) < Math.abs(dy) * 1.2) { st.dead = true; return; }   // 세로로 굴리는 손짓
            const from = el('appContainer').dataset.page || 'home';
            const to = from === 'home' ? 'detail' : 'home';
            st.own = true; st.x = t.clientX;   // 여기서부터 손을 따라간다(처음 10px은 버린다)
            st.s = open(from, to);
            const sw = el('pageSwitch'); if (sw) sw.classList.add('drag');
        }
        e.preventDefault();
        const s = st.s;
        let d = t.clientX - st.x;
        // 갈 데가 없는 쪽으로 밀면 살짝만 따라온다
        if ((s.from === 'home' && d > 0) || (s.from === 'detail' && d < 0)) d *= 0.2;
        d = Math.max(-s.W, Math.min(s.W, d));
        st.dx = d;
        st.hist.push([t.clientX, Date.now()]);
        if (st.hist.length > 5) st.hist.shift();
        paint(s, -order(s.from) * s.W + d);
    }

    function end() {
        if (!st) return;
        const cur = st; st = null;
        if (!cur.own) return;
        const s = cur.s;
        const h = cur.hist, a = h[0], b = h[h.length - 1];
        const dt = b[1] - a[1];
        const v = dt > 0 && Date.now() - b[1] < 120 ? (b[0] - a[0]) / dt : 0;   // px/ms, 멈췄다 놓으면 0
        const dir = s.from === 'home' ? -1 : 1;   // 넘어가려면 이쪽으로 밀어야 한다
        const go = cur.dx * dir > s.W * 0.3 || (v * dir > 0.5 && cur.dx * dir > 20);
        settle(s, go);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const clip = el('pagerClip');
        if (!clip) return;
        clip.addEventListener('touchstart', start, { passive: true });
        clip.addEventListener('touchmove', move, { passive: false });   // 가로로 미는 동안만 세로 굴림을 막는다
        clip.addEventListener('touchend', end);
        clip.addEventListener('touchcancel', end);
    });

    return { slideTo };
})();
function slideToPage(name) { pagerSwipe.slideTo(name); }
