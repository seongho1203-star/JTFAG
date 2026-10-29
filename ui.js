// ◇ ui.js를 나눈 조각 — 진입점(DOMContentLoaded) · 숫자 서식 · 공통 창(비밀번호·이름·확인·메모·공금) · 관리자 인증
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
// ui.js - 화면 렌더링 및 사용자 이벤트 처리

const SOUND_CONFIG = {
    0: "https://xhulylksiexhtifyrokp.supabase.co/storage/v1/object/sign/Sound/Eagle.mp3?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9kYTIzZmVlMC04YTM4LTQ2NDYtYTVlNy0yZThhNjU4NTlmZWYiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJTb3VuZC9FYWdsZS5tcDMiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg2NTM2ODY5LCJleHAiOjE4MTgwNzI4Njl9.W7A8HA7pleL5xtO1-TE-R8PiyuP8vNFV5wm0KTYnx08"
};

function parseNumber(val) { if (!val) return 0; const cleaned = String(val).replace(/[^0-9.-]/g, ''); return parseFloat(cleaned) || 0; }
function formatNumber(num) { if (num === null || num === undefined || isNaN(num) || num === 0) return "0"; return num.toLocaleString('ko-KR'); }
function formatFundString(num) { if (num === null || num === undefined || isNaN(num) || num === 0) return "0원"; return num.toLocaleString('ko-KR') + "원"; }

window.addEventListener('DOMContentLoaded', async () => {
    if (window.jtfagStylesReady) await window.jtfagStylesReady;
    renderSkeleton();
    fetchFromSupabase();
    window._supabase.channel('public:jtfag_league').on('postgres_changes', { event: '*', schema: 'public', table: window.SUPABASE_TABLE }, payload => {
        if (payload.new && payload.new.payload) {
            // **내가 보낸 저장의 메아리는 통째로 무시한다.** 내 화면이 이미 더 최신이라
            // 다시 그릴 이유가 없고, 그리는 순간 적고 있던 금액 칸이 되돌아간다.
            // (저장을 한 줄로 세우므로 내 로컬 상태가 내가 보낸 것보다 뒤처질 수 없다.)
            if (isMyEcho(payload.new.payload)) { showSaveStatus("⚡ 동기화 완료"); return; }
            const prevData = appData;
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
            // 미션·멀리건은 더하기만 하는 값이라, 보낸 폰이 낡아 빠뜨렸으면 합쳐서 한 번 더 저장한다(mission.js).
            const predictionsRestored = typeof mergePredictionData === 'function' && mergePredictionData(prevData);
            const missionsRestored = typeof mergeMissionData === 'function' && mergeMissionData(prevData);
            if (predictionsRestored || missionsRestored) syncToSupabase(appData);
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

function showFundPrompt(before, startMode) {
    return new Promise((resolve) => {
        let mode = FUND_MODES[startMode] ? startMode : 'use';   // 대개는 쓴 돈을 적는다

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
            cleanup({ after: resultOf(), memo: memoInput.value.trim(), mode });
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

// 공금 수정. 공지 카드의 `💰 공금 잔액` 칸을 누르면 열린다.
// 예전에는 관리자 메뉴 안에 있어서 그 문(비밀번호)을 이미 지난 뒤였다.
// 이제 바로 부를 수 있게 됐으니 **여기서 비밀번호를 직접 묻는다** — 돈이라 그대로 열어 둘 수 없다.
// (한 번 풀면 isFundUnlocked가 남아, 잠그기 전까지는 다시 묻지 않는다.)
async function editClubFund(startMode) {
    if (!(await authenticateAdmin())) return;
    const before = appData.clubFund || 0;
    const entered = await showFundPrompt(before, startMode);
    if (entered === null) return;
    const after = entered.after;
    const memo = entered.memo || "";
    // 금액이 그대로면 사용내역만 남길 이유가 없다.
    if (after === before) { showToast("변경 사항이 없습니다."); return; }

    saveState();
    if (!appData.fundLogs) appData.fundLogs = [];
    const now = new Date();
    const entry = {
        time: `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        name: localStorage.getItem('jtfag_my_name') || "알 수 없음",
        before: before, after: after, memo: memo
    };
    if (entered.mode === 'direct') entry.fix = true;   // 잔액을 직접 정정한 기록 — 장부에 `정정`으로 따로 보인다
    appData.fundLogs.push(entry);
    // 장부라 예전의 50건 제한은 없앴다. 그래도 끝없이 불어나지 않게 넉넉한 상한만 둔다.
    while (appData.fundLogs.length > 500) appData.fundLogs.shift();

    appData.clubFund = after;
    syncToSupabase(appData); renderNoticeArea(); renderAll();   // renderAll이 열려 있는 공금 장부도 다시 그린다
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
    // 미션·멀리건 사용은 되돌리지 않는다 — 되돌려 미션을 다시 뽑을 수 있으면 무작위의 뜻이 없다(mission.js).
    ['missions', 'mulligans', 'missionResets', 'missionRestores', 'predictions'].forEach(k => { if (appData[k] !== undefined) snapshot[k] = appData[k]; });
    appData = snapshot;
    if (typeof overlayMoney === 'function') overlayMoney();
    syncToSupabase(appData); showToast("↩️ 이전 상태로 되돌렸습니다."); renderAll();
}

