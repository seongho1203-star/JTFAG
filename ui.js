// ui.js - 화면 렌더링 및 사용자 이벤트 처리
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
            if (selectedMoneyRoundIdx < 0 || selectedMoneyRoundIdx >= appData.totalRounds) selectedMoneyRoundIdx = appData.totalRounds - 1;
            renderNoticeArea(); renderAll(); showSaveStatus("⚡ 실시간 업데이트됨");
            if (document.getElementById('roundPhotoModal').classList.contains('active')) renderRoundPhotos();
        }
    }).subscribe();

    const fundInput = document.getElementById('clubFundInput');
    fundInput.addEventListener('blur', function() {
        if (isFundUnlocked) { appData.clubFund = parseNumber(this.value); this.value = formatFundString(appData.clubFund); syncToSupabase(appData); }
    });
    initScheduleOptions();
});

function authenticateAdmin() {
    if (isFundUnlocked) return true;
    const pwd = prompt("🔒 공금 수정 비밀번호를 입력해주세요:");
    if (pwd === ADMIN_PASSWORD) { isFundUnlocked = true; updateLockUI(); showToast("🔓 공금 수정 권한이 인증되었습니다."); return true; } 
    else if (pwd !== null) { showToast("⚠️ 비밀번호가 일치하지 않습니다."); } return false;
}

function toggleFundLock() {
    if (isFundUnlocked) { isFundUnlocked = false; updateLockUI(); document.getElementById('clubFundInput').value = formatFundString(appData.clubFund); showToast("🔒 공금 수정이 잠겼습니다."); } 
    else { authenticateAdmin(); }
}

function handleFundClick(inputElem) {
    if (!isFundUnlocked) { if (authenticateAdmin()) { setTimeout(() => { inputElem.value = appData.clubFund || ""; inputElem.focus(); }, 50); } }
}

function updateLockUI() {
    const btn = document.getElementById('lockToggleBtn'); const fundInput = document.getElementById('clubFundInput');
    if (btn) btn.textContent = isFundUnlocked ? "🔓" : "🔒";
    if (fundInput) {
        if (isFundUnlocked) { fundInput.removeAttribute('readonly'); fundInput.value = appData.clubFund || ""; } 
        else { fundInput.setAttribute('readonly', 'true'); fundInput.value = formatFundString(appData.clubFund); }
    }
}

function undoLastAction() {
    if (historyStack.length === 0) { showToast("⚠️ 되돌릴 이전 내역이 없습니다."); return; }
    appData = JSON.parse(historyStack.pop()); syncToSupabase(appData); showToast("↩️ 이전 상태로 되돌렸습니다."); renderAll();
}

function renderSkeleton() {
    const summaryGrid = document.getElementById('summaryGrid');
    if (summaryGrid) { summaryGrid.innerHTML = golfers.map(() => `<div class="summary-item skeleton"><div class="name">---</div><div class="detail-line">---</div><div class="detail-line">---</div><div class="final-total">---</div></div>`).join(''); }
}

function showToast(msg) {
    const toast = document.getElementById('customToast'); if (!toast) return;
    toast.textContent = msg; toast.style.opacity = '1'; setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

function showSaveStatus(msg) {
    const saveStatus = document.getElementById('saveStatus'); if (saveStatus) { saveStatus.textContent = msg; saveStatus.style.opacity = '1'; setTimeout(() => { saveStatus.style.opacity = '0.7'; }, 1200); }
}

function renderNoticeArea() {
    const dateDisplay = document.getElementById('nextRoundDisplay'); const fundInput = document.getElementById('clubFundInput');
    if (dateDisplay) { dateDisplay.innerHTML = appData.nextRoundDate ? appData.nextRoundDate : `일정 등록하기`; checkWeather(appData.nextRoundDate); }
    if (fundInput && document.activeElement !== fundInput) { fundInput.value = formatFundString(appData.clubFund); }
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

function saveSchedule() {
    const course = document.getElementById('schCourseSelect').value === "직접 입력" ? document.getElementById('schCourseCustom').value : document.getElementById('schCourseSelect').value;
    if (document.getElementById('schCourseSelect').value === "직접 입력" && course.trim() === "") { alert("골프장 이름을 입력해주세요!"); return; }
    saveState();
    appData.nextRoundDate = `${document.getElementById('schMonth').value}월 ${document.getElementById('schDay').value}일 ${document.getElementById('schAmpm').value} ${document.getElementById('schHour').value}:${document.getElementById('schMinute').value} ${course}`;
    syncToSupabase(appData); renderNoticeArea(); closeScheduleModal(); showToast("✅ 일정이 성공적으로 저장되었습니다!");
}

function renderAll() { renderTable(); calculateAndRender(); renderMoneyTable(); forceTableReflow(); }

function changeMoneyRound(idxVal) { selectedMoneyRoundIdx = parseInt(idxVal, 10); renderMoneyTable(); }

function renderMoneyTable() {
    const tbody = document.getElementById('moneyTbody'); const selectBox = document.getElementById('moneyRoundSelect'); if (!tbody || !selectBox) return;
    
    let selectHtml = "";
    for (let r = 0; r < appData.totalRounds; r++) { selectHtml += `<option value="${r}" ${(r === selectedMoneyRoundIdx) ? "selected" : ""}>${r + 1}차전 정산 입력 ▾</option>`; }
    if (selectBox.innerHTML !== selectHtml) selectBox.innerHTML = selectHtml;

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
    appData.roundMoney[selectedMoneyRoundIdx][name][type] = parseNumber(value);
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

    // 💡 1차 변경: '현재 계급' 열을 이름 바로 다음(앞쪽)에 추가하고 금색 테마 부여
    let headerHtml = `<th>이름</th><th style="white-space:nowrap; color:var(--primary-gold);">현재 계급</th>`;
    for (let r = 0; r < appData.totalRounds; r++) {
        headerHtml += `<th><div class="header-round-title">${r + 1}차</div><input type="text" id="course_input_${r}" class="course-input" value="${(appData.courses && appData.courses[r]) ? appData.courses[r] : ""}" placeholder="골프장" onchange="updateCourse(${r}, this.value)"><div id="photo_btn_${r}" class="photo-btn" onclick="openRoundPhotoModal(${r})">📸 ${(appData.roundPhotos && appData.roundPhotos[r]) ? appData.roundPhotos[r].length : 0}장</div></th>`;
    }
    // 가장 끝에 있던 최종 계급 삭제 후 평균만 남김
    headerHtml += `<th id="avgHeaderTitle" style="white-space:nowrap;">- 평균</th>`;
    headerRow.innerHTML = headerHtml;

    tbody.innerHTML = "";
    golfers.forEach(name => {
        const tr = document.createElement('tr'); tr.setAttribute('data-name', name);
        // 💡 2차 변경: rank-cell(계급 뱃지가 들어갈 자리)을 스코어 앞쪽으로 위치 이동
        let rowHtml = `<td class="golfer-name">${name}</td><td class="rank-cell" style="background: rgba(212,175,55,0.05);">-</td>`;
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

function updateCourse(r, val) { saveState(); if (!appData.courses) appData.courses = []; appData.courses[r] = val; syncToSupabase(appData); }
function updateScore(name, r, val) { saveState(); if (!appData.scores) appData.scores = {}; if (!appData.scores[name]) appData.scores[name] = []; appData.scores[name][r] = val === "" ? "" : parseNumber(val); syncToSupabase(appData); renderAll(); }

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

function renderRoundPhotos() {
    const grid = document.getElementById('photoGrid'); grid.innerHTML = "";
    const photos = (appData.roundPhotos && appData.roundPhotos[selectedPhotoRoundIdx]) ? appData.roundPhotos[selectedPhotoRoundIdx] : [];
    if (photos.length === 0) { grid.innerHTML = `<div style="grid-column: span 2; text-align:center; padding: 20px; color:#94a3b8; font-size: 0.8rem;">등록된 사진이 없습니다.</div>`; return; }
    photos.forEach((photoBase64, index) => {
        grid.innerHTML += `<div class="photo-item"><img src="${photoBase64}" onclick="openImageViewModal('${photoBase64}')"><button type="button" class="photo-delete-btn" onclick="deleteRoundPhoto(${index})">✕</button></div>`;
    });
}

function handleRoundPhotoUpload(event) {
    const files = event.target.files; if (!files || files.length === 0) return;
    if (!appData.roundPhotos) appData.roundPhotos = Array.from({length: appData.totalRounds}, () => []);
    if (!appData.roundPhotos[selectedPhotoRoundIdx]) appData.roundPhotos[selectedPhotoRoundIdx] = [];
    if (appData.roundPhotos[selectedPhotoRoundIdx].length + files.length > 10) { showToast("⚠️ 사진은 차수별로 최대 10장까지만 등록 가능합니다."); return; }

    showToast("⏳ 사진을 압축하여 업로드 중입니다..."); saveState(); let loadedCount = 0;
    Array.from(files).forEach(file => {
        const reader = new FileReader(); reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image(); img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas'); const MAX = 800; let w = img.width; let h = img.height;
                if (w > h) { if (w > MAX) { h *= MAX / w; w = MAX; } } else { if (h > MAX) { w *= MAX / h; h = MAX; } }
                canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                appData.roundPhotos[selectedPhotoRoundIdx].push(canvas.toDataURL('image/jpeg', 0.6)); loadedCount++;
                if (loadedCount === files.length) { syncToSupabase(appData); renderRoundPhotos(); renderAll(); showToast("✅ 사진 업로드 완료!"); document.getElementById('roundPhotoUpload').value = ''; }
            }
        }
    });
}

function deleteRoundPhoto(photoIdx) {
    if(confirm("이 사진을 삭제하시겠습니까?")) { saveState(); appData.roundPhotos[selectedPhotoRoundIdx].splice(photoIdx, 1); syncToSupabase(appData); renderRoundPhotos(); renderAll(); showToast("🗑️ 사진이 삭제되었습니다."); }
}

function openImageViewModal(src) { document.getElementById('fullImageView').src = src; document.getElementById('imageViewModal').classList.add('active'); }
function closeImageViewModal() { document.getElementById('imageViewModal').classList.remove('active'); document.getElementById('fullImageView').src = ""; }

async function downloadCurrentPhoto() {
    const imgSrc = document.getElementById('fullImageView').src; if (!imgSrc) return;
    if (navigator.userAgent.match(/kakaotalk/i)) { showToast("⚠️ 카카오톡에선 다운로드가 제한됩니다. 우측 하단 탭에서 '다른 브라우저로 열기'를 하시거나 사진을 꾹 눌러주세요!"); return; }
    try {
        const splitDataURI = imgSrc.split(','); const byteString = atob(splitDataURI[1]); const mimeString = splitDataURI[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab); for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
        const blob = new Blob([ab], { type: mimeString }); const fileName = `JTFAG_Gallery_${new Date().getTime()}.jpeg`;
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

// 🔥 명예의 전당 (골드 네온 테두리 & 카운트업 적용) 🔥
function openPersonalReport(name) {
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

    document.getElementById('reportContent').innerHTML = `
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
            <div class="stat-box"><div class="stat-label">🦅독수리</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[0]}" data-suffix="회" style="color:#b8860b; animation-delay: 0.1s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">⚡매</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[1]}" data-suffix="회" style="color:#0ea5e9; animation-delay: 0.2s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">🦩학</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[2]}" data-suffix="회" style="color:#a855f7; animation-delay: 0.3s;">0회</div></div>
            <div class="stat-box"><div class="stat-label">🐦참새</div><div class="stat-val slot-roll count-up" data-val="${rankCounts[3]}" data-suffix="회" style="color:#64748b; animation-delay: 0.4s;">0회</div></div>
        </div></div>
        <div class="report-section"><div class="report-title">⚔️ 1:1 통산 승률</div><div class="winrate-list">${winRateHtml}</div></div>
    `;
    
    document.getElementById('personalReportModal').classList.add('active');

    // 카운트업 애니메이션 실행
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

function closePersonalReport() { document.getElementById('personalReportModal').classList.remove('active'); }

function resetAllData() {
    if (confirm("정말로 모든 실시간 데이터를 초기화하시겠습니까?")) {
        saveState(); appData = getDefaultData(); selectedMoneyRoundIdx = appData.totalRounds - 1; syncToSupabase(appData);
        renderAll(); showToast("🔄 모든 데이터가 초기화되었습니다."); forceTableReflow();
    }
}

// 🔥 즉시 실행되는 카카오톡 강제 다이렉트 전환 모드 🔥
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
