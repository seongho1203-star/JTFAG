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
   기본 배율에서 아래로 끌면 닫는다. 확대 중에는 기존처럼 사진을 이동한다.
   손을 뗀 자리가 사진 밖이고 움직인 적이 없어도 닫는다. */
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

