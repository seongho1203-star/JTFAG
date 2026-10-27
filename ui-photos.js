// ◇ ui.js를 나눈 조각 — 라운드 사진 업로드·삭제 · 사진 크게 보기(photoZoom) · 다운로드
// ◇ 로딩 순서가 곧 원래 순서다(index.html). 전역 함수·변수라 어느 조각에서든 그대로 부른다.
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
        // 격자에는 썸네일을 보여 준다(원본은 눌렀을 때). 썸네일이 아직 없는 사진은 `photoThumbFail()`이 원본으로 물러난다.
        grid.innerHTML += `<div class="photo-item"><img src="${escapeHtml(photoThumbUrl(src))}" data-orig="${escapeHtml(src)}" loading="lazy" decoding="async" onerror="photoThumbFail(this)" onclick="openImageViewModal(appData.roundPhotos[selectedPhotoRoundIdx][${index}])"><button type="button" class="photo-delete-btn" onclick="deleteRoundPhoto(${index})">✕</button></div>`;
    });
}

/* 썸네일이 없는 사진(썸네일 기능 이전에 올린 것)은 원본으로 물러난다. 이 기기 주인이면 뒤에서 썸네일을 만들어 다음부터 빠르게 뜬다.
   한 사진은 세션당 한 번만 시도한다 — 실패하는 사진을 계속 다시 받지 않는다. */
const thumbTried = new Set();
const thumbQueue = [];
let thumbWorking = false;
function photoThumbFail(img) {
    const orig = img.dataset.orig;
    if (!orig || img.dataset.fb) return;
    img.dataset.fb = '1';
    img.src = orig;
    if (localStorage.getItem('jtfag_my_name') !== SCORE_OWNER || thumbTried.has(orig) || orig.startsWith('data:')) return;
    thumbTried.add(orig); thumbQueue.push(orig);
    runThumbQueue();
}
async function runThumbQueue() {
    if (thumbWorking) return;
    thumbWorking = true;
    while (thumbQueue.length) {
        const orig = thumbQueue.shift();
        try {
            const res = await fetch(orig);
            if (!res.ok) continue;
            if (!(await uploadPhotoThumb(orig, await res.blob()))) continue;
            const url = photoThumbUrl(orig) + '?t=' + Date.now();   // 없던 주소의 실패 기록을 피해 간다
            document.querySelectorAll('#photoGrid img').forEach(im => {
                if (im.dataset.orig === orig) { im.dataset.fb = '1'; im.src = url; }
            });
        } catch (e) { console.error('썸네일 만들기 실패:', e); }
    }
    thumbWorking = false;
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

// ── 사진 업로드 진행 표시 ──────────────────────────────────────────
// 올리는 동안은 갤러리 창 안의 진행 막대와 (창을 닫아도 보이는) 안내 글을 함께 갱신한다.
let photoUploading = false;
function photoMB(bytes) { return (bytes / 1048576).toFixed(bytes >= 10485760 ? 0 : 1) + 'MB'; }
function paintPhotoUploadProgress(st) {
    const box = document.getElementById('photoUploadProgress');
    const btn = document.getElementById('photoUploadBtn');
    if (btn) btn.disabled = !!st;
    if (!st) { if (box) box.hidden = true; return; }
    const pct = Math.min(100, Math.round(st.loaded / st.total * 100));
    const msg = st.n > 1
        ? `${Math.min(st.i + 1, st.n)}/${st.n}장 업로드 중 · ${photoMB(st.loaded)} / ${photoMB(st.total)} (${pct}%)`
        : `사진 업로드 중 · ${photoMB(st.loaded)} / ${photoMB(st.total)} (${pct}%)`;
    if (box) {
        box.hidden = false;
        const t = box.querySelector('.pup-text'); if (t) t.textContent = msg;
        const f = box.querySelector('.pup-fill'); if (f) f.style.width = pct + '%';
    }
    // 안내 글은 끝날 때까지 유지한다(기본 2.2초 뒤 사라지는 것이 문제였다).
    showToast('⏳ ' + msg, 600000);
}

async function handleRoundPhotoUpload(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;
    if (photoUploading) { showToast('ℹ️ 업로드가 진행 중입니다. 끝난 뒤 다시 선택해 주세요.'); input.value = ''; return; }
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
    /* **올리는 동안 진행 상태를 계속 보여 준다**(사용자 제보 — 여러 장이면 알림이 2초 만에 사라져 올라가는 중인지 알 수 없었다).
       갤러리 창 안의 진행 막대(`#photoUploadProgress`)가 장수·용량·퍼센트를 갱신하고,
       창을 닫아도 보이게 안내 글(토스트)도 끝날 때까지 유지한다. 끝나면 막대를 걷는다. */
    const totalBytes = files.reduce((t, f) => t + (f.size || 0), 0) || 1;
    let doneBytes = 0;
    const paint = (i, cur) => {
        const loaded = Math.min(totalBytes, doneBytes + cur);
        paintPhotoUploadProgress({ i, n: files.length, loaded, total: totalBytes });
    };
    const urls = [];
    let failed = 0;
    photoUploading = true;
    paint(0, 0);
    for (let i = 0; i < files.length; i++) {
        try {
            paint(i, 0);
            // File은 Blob이라 그대로 올라간다 — 다시 그리지 않으므로 화질이 그대로다.
            const url = await uploadPhotoBlob(files[i], round, (sent, all) => paint(i, Math.min(files[i].size || all, sent)));
            urls.push(url);
            doneBytes += files[i].size || 0;
            paint(i, 0);
            // 갤러리 격자용 썸네일 — 실패해도 사진 등록은 그대로 간다(격자가 원본으로 물러난다).
            try { await uploadPhotoThumb(url, files[i]); } catch (e) { console.warn('썸네일 업로드 실패:', e); }
        } catch (err) { console.error("사진 업로드 실패:", err); failed++; doneBytes += files[i].size || 0; }
    }
    photoUploading = false;
    paintPhotoUploadProgress(null);
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
    if (targetCount === 0) { showToast("✅ 이전할 사진이 없습니다. 이미 모두 저장소에 있습니다."); return; }
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

/* ── 사진 보기: 썸네일 먼저, 원본은 진행률을 보이며 받는다 ─────────────────
   원본이 3~5MB라 곧바로 띄우면 한참 빈 화면이다(사용자 제보). 격자에서 이미 받아 둔 썸네일을 먼저 보여 주고,
   뒤에서 원본을 받아 오며 아래에 진행 막대(`원본 불러오는 중 37%`)를 띄운다. 다 받으면 같은 자리에서 원본으로 바뀐다.
   받은 원본은 최근 네 장까지 기억해(`photoView.cache`) 다시 열면 바로 뜬다. 다른 사진으로 옮기거나 닫으면 받던 것을 끊는다. */
const photoView = { orig: '', token: 0, abort: null, cache: new Map(), saving: false };
const PHOTO_CACHE_MAX = 4;

function photoMB(n) { return (n / 1048576).toFixed(1) + 'MB'; }

const PHOTO_RING_C = 2 * Math.PI * 28;   // 원 둘레 — index.html의 r="28"과 한 쌍
function photoLoadingShow(text, ratio, retry) {
    const box = document.getElementById('photoLoading');
    if (!box) return;
    box.hidden = false;
    // 원본이 오기 전까지 썸네일을 어둡게 둔다 — 다 받으면 밝아지면서 원본으로 바뀐다. 실패하면 밝게 돌려 둔다.
    const viewer = document.querySelector('#imageViewModal .photo-viewer');
    if (viewer) viewer.classList.toggle('loading', !retry);
    document.getElementById('photoLoadingText').textContent = text;
    // 둥근 진행 표시: 선의 길이(dashoffset)만 바꾼다. 크기를 모르면(ratio < 0) 4분의 1 호가 유한 횟수로 돈다.
    const svg = document.getElementById('photoRingSvg');
    const fill = document.getElementById('photoLoadingFill');
    const unknown = ratio < 0;
    svg.classList.toggle('spin', unknown);
    const r = unknown ? 0.25 : Math.max(0.02, Math.min(1, ratio));
    fill.style.strokeDashoffset = String(PHOTO_RING_C * (1 - r));
    document.getElementById('photoLoadingPct').textContent = unknown || retry ? '' : Math.min(99, Math.floor(ratio * 100)) + '%';
    document.getElementById('photoRing').hidden = !!retry;
    document.getElementById('photoLoadingRetry').hidden = !retry;
}
function photoLoadingHide() {
    const box = document.getElementById('photoLoading');
    if (box) box.hidden = true;
    const viewer = document.querySelector('#imageViewModal .photo-viewer');
    if (viewer) viewer.classList.remove('loading');
}

function photoCachePut(src, blob) {
    const old = photoView.cache.get(src);
    if (old) URL.revokeObjectURL(old.url);
    photoView.cache.delete(src);
    const url = URL.createObjectURL(blob);
    photoView.cache.set(src, { blob, url });
    while (photoView.cache.size > PHOTO_CACHE_MAX) {
        const k = photoView.cache.keys().next().value;
        URL.revokeObjectURL(photoView.cache.get(k).url);
        photoView.cache.delete(k);
    }
    return url;
}

async function photoLoadOriginal(src, token) {
    const img = document.getElementById('fullImageView');
    const ctrl = new AbortController();
    photoView.abort = ctrl;
    photoLoadingShow('원본 불러오는 중', 0, false);
    try {
        const res = await fetch(src, { signal: ctrl.signal });
        if (!res.ok) throw new Error('사진을 불러오지 못했습니다.');
        const total = Number(res.headers.get('content-length')) || 0;
        const type = res.headers.get('content-type') || 'image/jpeg';
        let blob;
        if (res.body && res.body.getReader) {
            const reader = res.body.getReader();
            const chunks = []; let got = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value); got += value.length;
                if (token !== photoView.token) return;
                photoLoadingShow(total ? `${photoMB(got)} / ${photoMB(total)}` : photoMB(got), total ? got / total : -1, false);
            }
            blob = new Blob(chunks, { type });
        } else {
            photoLoadingShow('원본 불러오는 중', -1, false);
            blob = await res.blob();
        }
        if (token !== photoView.token) return;
        const url = photoCachePut(src, blob);
        // 원본을 다 풀어 둔 뒤에 바꾼다 — 바꾸는 순간 빈 화면이 비치지 않게.
        const full = new Image();
        full.src = url;
        try { await full.decode(); } catch (e) { /* 못 풀어도 img가 알아서 그린다 */ }
        if (token !== photoView.token) return;
        img.onerror = null;
        img.src = url;
        photoLoadingHide();
    } catch (err) {
        if (token !== photoView.token || (err && err.name === 'AbortError')) return;
        console.error('원본 불러오기 실패:', err);
        photoLoadingShow('원본을 불러오지 못했습니다.', 0, true);
    }
}

function photoRetry() {
    if (!photoView.orig) return;
    const token = ++photoView.token;
    photoLoadOriginal(photoView.orig, token);
}

function photoStopLoading() {
    photoView.token++;
    if (photoView.abort) { try { photoView.abort.abort(); } catch (e) { /* 이미 끝났다 */ } photoView.abort = null; }
}

function openImageViewModal(src) {
    initPhotoZoom();
    photoZoomReset();
    photoStopLoading();
    const token = photoView.token;
    const img = document.getElementById('fullImageView');
    photoView.orig = src;
    img.onerror = null;
    const hit = photoView.cache.get(src);
    if (hit) {
        img.src = hit.url; photoLoadingHide();
    } else if (typeof src !== 'string' || src.startsWith('data:')) {
        img.src = src; photoLoadingHide();            // 예전 base64 사진은 이미 손에 있다
    } else {
        // 격자에서 받아 둔 썸네일이 곧바로 뜬다. 썸네일이 없는 사진은 원본이 올 때까지 빈 화면에 진행 막대만 보인다.
        const thumb = photoThumbUrl(src);
        img.onerror = () => { img.onerror = null; img.removeAttribute('src'); };
        img.src = thumb;
        photoLoadOriginal(src, token);
    }
    document.getElementById('imageViewModal').classList.add('active');
}
function closeImageViewModal() {
    photoStopLoading();
    photoView.orig = '';
    photoLoadingHide();
    const img = document.getElementById('fullImageView');
    img.onerror = null;
    document.getElementById('imageViewModal').classList.remove('active');
    img.src = "";
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
   기본 배율에서 아래로 끌면 닫는다. 확대 중에는 기존처럼 사진을 이동한다.
   손을 뗀 자리가 사진 밖이고 움직인 적이 없어도 닫는다. */
const photoZoom = {
    bound: false, scale: 1, tx: 0, ty: 0,
    pointers: new Map(), pinch: null, drag: null, moved: false, lastTap: 0
};
const PHOTO_ZOOM_MAX = 12;   // 원본은 4000px가 넘어 화면(약 400px)의 열 배까지 키워도 화질이 남는다
const PHOTO_ZOOM_TAP = 3;   // 두 번 두드렸을 때 배율

function photoZoomApply(animate) {
    const img = document.getElementById('fullImageView');
    if (!img) return;
    img.style.transition = animate ? 'transform 0.18s ease-out' : 'none';
    img.style.transform = `translate(${photoZoom.tx}px, ${photoZoom.ty}px) scale(${photoZoom.scale})`;
}

function photoZoomReset() {
    photoZoom.scale = 1; photoZoom.tx = 0; photoZoom.ty = 0;
    photoZoom.pointers.clear(); photoZoom.pinch = null; photoZoom.drag = null; photoZoom.moved = false; photoZoom.lastTap = 0;
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
        if (photoZoom.pointers.size === 1) photoZoom.moved = false;
        if (photoZoom.pointers.size === 2) {
            photoZoom.moved = true;
            const [a, b] = two();
            const r = img.getBoundingClientRect();
            photoZoom.pinch = {
                d0: dist(a, b), s0: photoZoom.scale, m0: mid(a, b), tx0: photoZoom.tx, ty0: photoZoom.ty,
                cx0: r.left + r.width / 2, cy0: r.top + r.height / 2      // 벌리기 시작할 때의 사진 중심
            };
            photoZoom.drag = null;
        } else if (photoZoom.pointers.size === 1) {
            photoZoom.drag = { x: e.clientX, y: e.clientY, tx0: photoZoom.tx, ty0: photoZoom.ty, dismiss: photoZoom.scale === 1 };
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
        } else if (photoZoom.pointers.size === 1 && photoZoom.drag) {
            const d = photoZoom.drag;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) photoZoom.moved = true;
            if (photoZoom.scale > 1) {
                photoZoom.tx = d.tx0 + dx; photoZoom.ty = d.ty0 + dy;
                photoZoomClamp();
            } else if (d.dismiss) {
                const downward = dy > 0 && dy > Math.abs(dx);
                photoZoom.tx = downward ? dx * 0.25 : 0;
                photoZoom.ty = downward ? dy : 0;
            }
            photoZoomApply(false);
        }
    });

    const up = e => {
        const p = photoZoom.pointers.get(e.pointerId);
        const drag = photoZoom.drag;
        photoZoom.pointers.delete(e.pointerId);
        if (photoZoom.pointers.size === 1) {
            // 한 손가락이 남으면 그 자리에서 끌기를 새로 시작한다 — 안 그러면 사진이 튄다.
            const [a] = two();
            photoZoom.drag = { x: a.x, y: a.y, tx0: photoZoom.tx, ty0: photoZoom.ty, dismiss: false };
            photoZoom.pinch = null;
            return;
        }
        if (photoZoom.pointers.size > 0) return;
        photoZoom.pinch = null; photoZoom.drag = null;

        const dy = drag ? e.clientY - drag.y : 0, dx = drag ? e.clientX - drag.x : 0;
        const threshold = Math.max(64, Math.min(120, stage.clientHeight * 0.14));
        if (e.type === 'pointerup' && p && drag && drag.dismiss && photoZoom.scale === 1 && dy >= threshold && dy > Math.abs(dx) * 1.2) {
            closeImageViewModal();
            return;
        }
        if (e.type === 'pointercancel') photoZoom.moved = true;

        if (photoZoom.scale < 1.05) { photoZoom.scale = 1; photoZoom.tx = 0; photoZoom.ty = 0; photoZoomApply(true); }

        if (photoZoom.moved || !p) { photoZoom.lastTap = 0; return; }
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
    // 화면에 떠 있는 것이 썸네일일 수 있다 — 저장은 늘 원본으로 한다.
    const orig = photoView.orig;
    if (!orig) return null;
    if (orig.startsWith('data:')) {
        const splitDataURI = orig.split(','); const byteString = atob(splitDataURI[1]); const mime = splitDataURI[0].split(':')[1].split(';')[0];
        const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab); for (let i = 0; i < byteString.length; i++) { ia[i] = byteString.charCodeAt(i); }
        return new Blob([ab], { type: mime });
    }
    const hit = photoView.cache.get(orig);
    if (hit) return hit.blob;
    showToast("⏳ 원본을 내려받는 중입니다...");
    const res = await fetch(orig);
    if (!res.ok) throw new Error("사진을 불러오지 못했습니다.");
    const blob = await res.blob();
    photoCachePut(orig, blob);   // 다시 누르면 곧바로 저장창이 뜨게 담아 둔다
    return blob;
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

// 저장창을 마치면 단추가 초록 체크로 바뀌고 몇 초간 다시 안 눌린다 — 사진 앱에는 원본이 이미 있어 새로 저장된 줄 모르고 계속 누르던 일이 있었다.
const PHOTO_SAVED_MS = 3500;
const PHOTO_CHECK_SVG = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
function photoSavedMark() {
    const btn = document.querySelector('#imageViewModal .photo-dl');
    const prev = btn ? btn.innerHTML : '';
    if (btn) { btn.classList.add('done'); btn.innerHTML = PHOTO_CHECK_SVG; }
    showToast('✅ 저장 요청을 마쳤습니다. 사진 앱의 최근 항목에서 확인해 주세요.');
    setTimeout(() => {
        photoView.saving = false;
        if (btn) { btn.classList.remove('done'); btn.innerHTML = prev; }
    }, PHOTO_SAVED_MS);
}

/* 사진 앱은 촬영 시각(EXIF)으로 줄을 세운다 — 한 달 전 사진을 저장하면 그 시절 사진들 사이에 끼어 저장된 줄 모른다(사용자 제보).
   JPEG의 촬영·수정 시각(EXIF 0x0132·0x9003·0x9004, XMP 날짜)을 지금으로 같은 길이만큼 덮어쓴다. 바이트 위치가 안 바뀌므로 아이폰 HDR 정보(게인 맵) 같은 나머지는 그대로다.
   바뀌었으면 true. */
function photoStampNow(buf) {
    const u8 = new Uint8Array(buf);
    if (u8.length < 4 || u8[0] !== 0xFF || u8[1] !== 0xD8) return false;
    const dv = new DataView(buf);
    const d = new Date();
    const p2 = n => String(n).padStart(2, '0');
    const hms = `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
    const exifText = `${d.getFullYear()}:${p2(d.getMonth() + 1)}:${p2(d.getDate())} ${hms}`;
    const xmpText = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${hms}`;
    const ascii = (a, n) => { let t = ''; for (let i = 0; i < n && a + i < u8.length; i++) t += String.fromCharCode(u8[a + i]); return t; };
    const put = (at, text) => { for (let i = 0; i < text.length; i++) u8[at + i] = text.charCodeAt(i); };
    let changed = false;

    function stampExif(tiff, segEnd) {
        const le = ascii(tiff, 2) === 'II';
        if (!le && ascii(tiff, 2) !== 'MM') return;
        if (dv.getUint16(tiff + 2, le) !== 42) return;
        const walk = (ifd, depth) => {
            if (ifd < tiff || ifd + 2 > segEnd) return;
            const n = dv.getUint16(ifd, le);
            for (let i = 0; i < n; i++) {
                const e = ifd + 2 + i * 12;
                if (e + 12 > segEnd) return;
                const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le);
                if (tag === 0x8769 && depth < 1) { walk(tiff + dv.getUint32(e + 8, le), depth + 1); continue; }
                if ((tag === 0x0132 || tag === 0x9003 || tag === 0x9004) && type === 2 && cnt === 20) {
                    const at = tiff + dv.getUint32(e + 8, le);
                    if (at >= tiff && at + 20 <= segEnd) { put(at, exifText); changed = true; }
                }
            }
        };
        walk(tiff + dv.getUint32(tiff + 4, le), 0);
    }

    function stampXmp(start, end) {
        const text = ascii(start, end - start);
        const re = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/g;
        let m;
        while ((m = re.exec(text))) { put(start + m.index, xmpText); changed = true; }
    }

    let pos = 2;
    while (pos + 4 <= u8.length && u8[pos] === 0xFF) {
        const marker = u8[pos + 1];
        if (marker === 0xDA || marker === 0xD9) break;   // 여기부터는 사진 데이터
        const end = pos + 2 + dv.getUint16(pos + 2);
        if (end > u8.length) break;
        if (marker === 0xE1) {
            if (ascii(pos + 4, 6) === 'Exif\0\0') stampExif(pos + 10, end);
            else if (ascii(pos + 4, 28) === 'http://ns.adobe.com/xap/1.0/') stampXmp(pos + 4, end);
        }
        pos = end;
    }
    return changed;
}

async function downloadCurrentPhoto() {
    if (!photoView.orig) return;
    // 아직 받는 중이면 저장을 막는다. 여기서 따로 내려받으면 시간이 걸려, 폰이 '누른 직후'로 인정하는 시간이 지나 공유창이 안 열린다.
    if (photoView.saving) { showToast('✅ 방금 저장했습니다. 사진 앱의 최근 항목에서 확인해 주세요.'); return; }
    const viewer = document.querySelector('#imageViewModal .photo-viewer');
    if (viewer && viewer.classList.contains('loading')) { showToast('⏳ 원본을 다 받은 뒤에 저장할 수 있습니다.'); return; }
    if (navigator.userAgent.match(/kakaotalk/i)) { showToast("⚠️ 카카오톡 인앱 브라우저에서는 저장이 제한됩니다. '다른 브라우저로 열기'를 이용하거나 사진을 길게 눌러 저장하세요."); return; }
    try {
        const blob = await currentPhotoBlob();
        if (!blob) return;
        let saveBlob = blob;
        if (isTouchDevice() && /jpe?g/i.test(blob.type || '')) {   // 사진 앱 최근 항목에 오르도록 촬영 시각을 지금으로
            try {
                const buf = await blob.arrayBuffer();
                if (photoStampNow(buf)) saveBlob = new Blob([buf], { type: blob.type });
            } catch (e) { saveBlob = blob; }
        }
        const file = new File([saveBlob], photoFileName(blob), { type: blob.type || 'image/jpeg' });

        if (isTouchDevice() && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            photoView.saving = true;
            try { await navigator.share({ files: [file], title: 'JTFAG 사진 저장' }); }
            catch (e) { photoView.saving = false; throw e; }
            photoSavedMark();
            return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = file.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(blobUrl);
        showToast("💾 기기에 저장했습니다.");
    } catch (error) {
        if (error && error.name === 'AbortError') return;   // 시트를 그냥 닫은 것
        if (error && error.name === 'NotAllowedError') { showToast('📷 저장 준비가 끝났습니다. 저장 단추를 한 번 더 눌러 주세요.'); return; }   // 내려받는 사이 폰이 누른 직후로 안 쳤다 — 이제 담아 뒀으니 바로 열린다
        console.error("다운로드 에러:", error); showToast("⚠️ 저장에 실패했습니다. 사진을 길게 눌러 '이미지 저장'을 선택해 주세요.");
    }
}



// 관리자 메뉴 `📸 사진 용량 확인` — 사진 저장소(round-photos)를 얼마나 쓰는지 차수별로 보여 준다(사용자 요청).
// 앱(anon 키)은 파일 목록을 못 읽으므로 폴더별 개수·용량만 돌려주는 DB 함수 `photo_storage_usage()`를 부른다(supabase/photo-usage.sql).
// 함수가 없으면 실행 안내를 띄운다. 무료 한도는 1GB다(`PHOTO_STORAGE_LIMIT`).
const PHOTO_STORAGE_LIMIT = 1024 * 1024 * 1024;

function closePhotoUsageModal() { document.getElementById('photoUsageModal').classList.remove('active'); }

function photoUsageSize(bytes) {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

async function openPhotoUsageModal() {
    const content = document.getElementById('photoUsageContent');
    if (!content) return;
    content.innerHTML = '<div class="subs-empty">불러오는 중…</div>';
    document.getElementById('photoUsageModal').classList.add('active');

    let rows;
    try {
        const { data, error } = await window._supabase.rpc('photo_storage_usage');
        if (error) throw error;
        rows = Array.isArray(data) ? data : [];
    } catch (err) {
        const missing = /photo_storage_usage|function|404|PGRST202/i.test(String(err && (err.message || err.code || err)));
        content.innerHTML = `<div class="subs-empty">⚠️ ${missing
            ? '용량 조회 함수가 없습니다.<br>supabase/photo-usage.sql을 SQL Editor에서 한 번 실행해 주세요.'
            : escapeHtml((err && err.message) || '용량을 불러오지 못했습니다.')}</div>`;
        return;
    }

    const num = v => Number(v) || 0;
    const total = rows.reduce((a, r) => a + num(r.bytes), 0);
    const files = rows.reduce((a, r) => a + num(r.files), 0);
    const pct = Math.min(100, total / PHOTO_STORAGE_LIMIT * 100);
    const color = pct > 85 ? '#dc2626' : pct > 60 ? '#eab308' : '#16a34a';
    const icon = pct > 85 ? '🔴' : pct > 60 ? '🟡' : '🟢';

    const thumbs = rows.find(r => r.folder === 'thumbs');
    const rounds = rows.filter(r => /^round\d+$/.test(r.folder))
        .sort((a, b) => parseInt(b.folder.slice(5)) - parseInt(a.folder.slice(5)));
    const others = rows.filter(r => r !== thumbs && !rounds.includes(r));
    const maxBytes = Math.max(1, ...rows.map(r => num(r.bytes)));
    const line = (label, r) => `
        <div class="pu-row">
            <span class="pu-label">${escapeHtml(label)}</span>
            <span class="pu-bar"><i style="width:${Math.max(2, num(r.bytes) / maxBytes * 100)}%"></i></span>
            <span class="pu-val">${num(r.files)}장 · ${photoUsageSize(num(r.bytes))}</span>
        </div>`;

    content.innerHTML = `
        <div class="pu-total">
            <div class="pu-total-line"><span>전체 사용량</span><b style="color:${color}">${icon} ${photoUsageSize(total)} / 1 GB</b></div>
            <div class="storage-bar"><span style="width:${Math.max(pct, 1)}%; background:${color};"></span></div>
            <div class="pu-sub">${files}개 파일 · 남은 공간 ${photoUsageSize(Math.max(0, PHOTO_STORAGE_LIMIT - total))} (${pct.toFixed(1)}% 사용)</div>
        </div>
        ${rounds.map(r => line(r.folder.slice(5) + '차', r)).join('')}
        ${thumbs ? line('미리보기', thumbs) : ''}
        ${others.map(r => line(r.folder || '기타', r)).join('')}
        <div class="pu-note">원본 사진은 한 장에 3~5MB쯤 쓰므로 차수당 50장을 가득 채우면 150~250MB가 됩니다. 한도에 가까워지면 지난 차수 사진을 삭제해 주세요.</div>`;
}
