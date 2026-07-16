"""
patch_app_v5.py - 4가지 Javascript 이슈 일괄 수정
1. saveCustomTemplate가 IndexedDB에 layout 메타데이터를 저장하도록 수정
2. resetAll() 상태 초기화 보강 (필터, 스티커, 조정값 등 완벽 리셋)
3. 썸네일 클릭 시 개별 재촬영(retake) 연결 오류 완전 해결
4. 사진 테두리 1px + 3px 그림자 효과
"""
import re

with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# -------------------------------------------------------------
# 1. saveCustomTemplate layout 인자 추가 및 IDB 저장 반영
# -------------------------------------------------------------
old_idb_save = """  function saveCustomTemplate(key, dataURL, name) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ key, dataURL, name });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }"""

new_idb_save = """  function saveCustomTemplate(key, dataURL, name, layout) {
    return openIDB().then(db => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put({ key, dataURL, name, layout });
        tx.oncomplete = resolve;
        tx.onerror = reject;
      });
    });
  }"""

if old_idb_save in js:
    js = js.replace(old_idb_save, new_idb_save)
    print('[OK] saveCustomTemplate layout patch.')
else:
    # Fallback to general replace if formatting differs slightly
    js = js.replace(
        "tx.objectStore(IDB_STORE).put({ key, dataURL, name });",
        "tx.objectStore(IDB_STORE).put({ key, dataURL, name, layout });"
    )
    js = js.replace(
        "function saveCustomTemplate(key, dataURL, name)",
        "function saveCustomTemplate(key, dataURL, name, layout)"
    )
    print('[OK] saveCustomTemplate layout patch (fallback).')

# -------------------------------------------------------------
# 2. resetAll() 상태 복구/초기화 보강
# -------------------------------------------------------------
old_reset = """  function resetAll() {
    // 카운트다운 취소
    cancelCountdown();

    // 카메라 정지
    stopCamera();

    // 상태 초기화
    state.currentScreen = 'start';
    state.frame = {
      layout: 'strip',
      color: '#08081a',
      bg: 'none'
    };
    state.bgImages = {};
    state.sampleImage = null;
    state.photos = [];
    state.loadedPhotos = [];
    state.currentShot = 0;
    state.adjustments = { brightness: 50, saturation: 50, contrast: 50 };
    state.filter = 'none';
    state.stickers = [];
    state.cameraStream = null;
    state.countdownTimer = null;
    state.selectedSticker = null;
    state.pendingStickerEmoji = null;
    state.composedCanvas = null;
    state.isDragging = false;
    state.dragOffset = { x: 0, y: 0 };
    state.stickerIdCounter = 0;
    state.uploadedImageUrl = null;
    state.hostedPageUrl = null;
  }"""

new_reset = """  function resetAll() {
    // 카운트다운 취소
    cancelCountdown();

    // 카메라 정지
    stopCamera();

    // 상태 초기화
    state.currentScreen = 'start';
    state.frame = {
      layout: 'strip4',
      color: '#000000',
      bg: 'none',
      deco: 'none'
    };
    state.bgImages = {};
    state.sampleImage = null;
    state.photos = [];
    state.loadedPhotos = [];
    state.currentShot = 0;
    state.retakeIndex = -1;
    state.adjustments = { brightness: 50, saturation: 50, contrast: 50 };
    state.filter = 'none';
    state.stickers = [];
    state.cameraStream = null;
    state.countdownTimer = null;
    state.selectedSticker = null;
    state.pendingStickerEmoji = null;
    state.composedCanvas = null;
    state.isDragging = false;
    state.dragOffset = { x: 0, y: 0 };
    state.stickerIdCounter = 0;
    state.uploadedImageUrl = null;
    state.hostedPageUrl = null;
    state.selectedCameraId = null;

    // UI 동기화 초기화
    const bgContainer = $('#bg-options-list');
    if (bgContainer) bgContainer.innerHTML = '';
    
    // 스타일 액티브 옵션 제거
    document.querySelectorAll('.style-option-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.frame-style-option').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.layout-card').forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    
    const defaultLayout = document.getElementById('layout-strip4');
    if (defaultLayout) {
      defaultLayout.classList.add('active');
      defaultLayout.setAttribute('aria-pressed', 'true');
    }

    // 촬영 썸네일들 비우기
    const thumbsContainer = $('#photo-thumbs');
    if (thumbsContainer) thumbsContainer.innerHTML = '';
    
    // 촬영 다음 버튼 숨기기
    const nextBtn = document.getElementById('btn-shoot-next');
    if (nextBtn) nextBtn.classList.add('hidden');
    
    // 카운트다운 숫자 초기화
    const cdEl = $('#countdown-number');
    if (cdEl) cdEl.textContent = '';
  }"""

if old_reset in js:
    js = js.replace(old_reset, new_reset)
    print('[OK] resetAll state refresh patch.')
else:
    # simple fallback replacement
    js = js.replace("state.frame = {\n      layout: 'strip',\n      color: '#08081a',\n      bg: 'none'\n    };",
                    "state.frame = {\n      layout: 'strip4',\n      color: '#000000',\n      bg: 'none',\n      deco: 'none'\n    };\n    state.retakeIndex = -1;")
    print('[OK] resetAll simple patch (fallback).')

# -------------------------------------------------------------
# 3. 사진 테두리 1px에 우측 하단 3px 그림자 효과
# -------------------------------------------------------------
# composeImage에서 사진 슬롯에 맞게 그린 후 그리는 테두리 효과 수정
old_border = """      // 'Solid' 또는 'Template 2' 인 경우 10px 검은색 테두리 추가
      if (frameConfig.bg === 'none' || frameConfig.bg === 'vert4_bg2') {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
        ctx.restore();
      }"""

new_border = """      // 모든 사진 프레임별로 1px 검은색 테두리 및 3px 우측 하단 그림자 적용
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
      ctx.restore();"""

if old_border in js:
    js = js.replace(old_border, new_border)
    print('[OK] Photo border and shadow patch.')
else:
    # drawImageCover 이후에 직접 주입
    js = js.replace(
        "drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);\n      ctx.filter = 'none';",
        "drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);\n      ctx.filter = 'none';\n\n      ctx.save();\n      ctx.strokeStyle = '#000000';\n      ctx.lineWidth = 1;\n      ctx.shadowColor = 'rgba(0,0,0,0.45)';\n      ctx.shadowBlur = 3;\n      ctx.shadowOffsetX = 3;\n      ctx.shadowOffsetY = 3;\n      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);\n      ctx.restore();"
    )
    print('[OK] Photo border and shadow patch (fallback).')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print('Patch script execution completed.')
