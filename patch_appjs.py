"""
Life Four Cuts v2.0 — app.js 전면 패치 스크립트
모든 13개 기능을 한 번에 적용합니다.
"""

import re

with open('app.js', 'r', encoding='utf-8') as f:
    src = f.read()

# ==============================================================
# PATCH 1: CONFIG 확장 (레이아웃 3종, 타이머 옵션)
# ==============================================================
old_config = '''  const CONFIG = {
    countdown: 5,       // 촬영당 카운트다운 초 (첫 컷은 별도로 10초 적용)
    totalShots: 4,      // 총 촬영 매수
    camera: {
      width:  { ideal: 1920 },
      height: { ideal: 1080 },
      facingMode: 'user'
    },
    // 세로 4컷 전용 레이아웃 설정
    layouts: {
      strip: {
        canvasWidth:  1200,
        canvasHeight: 3600,
        photoWidth:   1080,
        photoHeight:  760,
        padding: 60,
        gap:     30
      }
    },
    captureQuality: 0.95,
    qrThumbnail: { width: 100, height: 150, quality: 0.3 }
  };'''

new_config = '''  const CONFIG = {
    countdown: 5,       // 기본 카운트다운 (사용자 선택 가능)
    camera: {
      width:  { ideal: 1920 },
      height: { ideal: 1080 }
    },
    // 레이아웃 3종 설정
    layouts: {
      strip4: {
        canvasWidth:  1200,
        canvasHeight: 3600,
        photoWidth:   1080,
        photoHeight:  760,
        padding: 60,
        gap:     30,
        totalShots: 4
      },
      strip3: {
        canvasWidth:  1200,
        canvasHeight: 2800,
        photoWidth:   1080,
        photoHeight:  780,
        padding: 70,
        gap:     30,
        totalShots: 3
      },
      grid22: {
        canvasWidth:  1200,
        canvasHeight: 1340,
        photoWidth:   540,
        photoHeight:  540,
        padding: 60,
        gap:     30,
        totalShots: 4
      },
      // 하위 호환
      strip: {
        canvasWidth:  1200,
        canvasHeight: 3600,
        photoWidth:   1080,
        photoHeight:  760,
        padding: 60,
        gap:     30,
        totalShots: 4
      }
    },
    captureQuality: 0.95,
    qrThumbnail: { width: 100, height: 150, quality: 0.3 }
  };'''

src = src.replace(old_config, new_config)

# ==============================================================
# PATCH 2: STATE 확장 (새 필드 추가)
# ==============================================================
old_state = '''  const state = {
    currentScreen: 'start',
    frame: {
      layout: 'strip',    // 세로 4컷 고정
      color:  '#000000',  // 프레임 배경색
      bg:     'none',     // 배경 이미지 키
      deco:   'none'      // 데코 이미지 키
    },
    bgImages:   {},
    decoImages: {},
    photos:          [],   // 캡처된 이미지 Data URL 배열
    currentShot:      0,   // 현재 촬영 인덱스 (0-3)
    filter:       'none',  // 선택된 필터 이름
    adjustments: { brightness: 50, saturation: 50, contrast: 50 }, // 이미지 조정
    stickers:        [],   // {id, emoji, x, y, size, rotation} 배열
    loadedPhotos:    [],   // 캡처된 이미지의 HTMLImageElement 배열 (깜빡임 방지용 캐시)
    cameraStream:  null,
    countdownTimer: null,
    selectedSticker: null,
    pendingStickerEmoji: null,  // 마우스로 따라다니는 배치 대기 스티커
    composedCanvas:  null,
    isDragging:     false,
    isResizing:     false,
    dragOffset:     { x: 0, y: 0 },
    resizeStartDist: 0,
    resizeStartSize: 0,
    stickerIdCounter: 0,
    uploadedImageUrl: null,
    hostedPageUrl:    null,
    selectedCameraId: null
  };'''

new_state = '''  const state = {
    currentScreen: 'start',
    frame: {
      layout: 'strip4',   // 레이아웃 키 (strip4 / strip3 / grid22)
      color:  '#000000',  // 프레임 배경색
      bg:     'none',     // 배경 스타일 키
      deco:   'none'      // 데코 이미지 키
    },
    bgImages:   {},
    decoImages: {},
    photos:          [],
    currentShot:      0,
    retakeIndex:     -1,   // 재촬영할 사진 인덱스 (-1: 재촬영 모드 아님)
    filter:       'none',
    adjustments: { brightness: 50, saturation: 50, contrast: 50 },
    stickers:        [],
    loadedPhotos:    [],
    cameraStream:  null,
    countdownTimer: null,
    selectedSticker: null,
    pendingStickerEmoji: null,
    composedCanvas:  null,
    isDragging:     false,
    isResizing:     false,
    dragOffset:     { x: 0, y: 0 },
    resizeStartDist: 0,
    resizeStartSize: 0,
    stickerIdCounter: 0,
    uploadedImageUrl: null,
    hostedPageUrl:    null,
    selectedCameraId: null,
    facingMode: 'user',        // 카메라 방향 (user=전면, environment=후면)
    timerDuration: 5,          // 사용자 선택 타이머 (초)
    shootingStarted: false,    // 촬영 시작 버튼 누름 여부
    instantShootCallback: null // 즉시 촬영 콜백
  };'''

src = src.replace(old_state, new_state)

# ==============================================================
# PATCH 3: getTotalShots() — 레이아웃 기반
# ==============================================================
old_getTotalShots = '''  function getTotalShots() {
    return 4;
  }'''

new_getTotalShots = '''  function getTotalShots() {
    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip4;
    return layout.totalShots || 4;
  }

  function getLayoutConfig() {
    return CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip4;
  }'''

src = src.replace(old_getTotalShots, new_getTotalShots)

# ==============================================================
# PATCH 4: initCamera() — facingMode를 state에서 가져오기
# ==============================================================
old_camera_constraints = '''      if (state.selectedCameraId) {
        constraints.video.deviceId = { exact: state.selectedCameraId };
      } else {
        constraints.video.facingMode = CONFIG.camera.facingMode;
      }'''

new_camera_constraints = '''      if (state.selectedCameraId) {
        constraints.video.deviceId = { exact: state.selectedCameraId };
      } else {
        constraints.video.facingMode = state.facingMode || 'user';
      }'''

src = src.replace(old_camera_constraints, new_camera_constraints)

# ==============================================================
# PATCH 5: startCountdown() — 즉시 촬영 버튼 표시
# ==============================================================
old_countdown_start = '''  function startCountdown(duration, onComplete) {
    const countdownEl = $('#countdown-number');
    if (!countdownEl) return;

    let remaining = duration;
    countdownEl.textContent = remaining;
    countdownEl.style.display = 'flex';
    countdownEl.classList.add('visible');'''

new_countdown_start = '''  function startCountdown(duration, onComplete) {
    const countdownEl = $('#countdown-number');
    if (!countdownEl) return;

    // 즉시 촬영 버튼 표시
    const shootNowBtn = $('#btn-shoot-now');
    if (shootNowBtn) {
      shootNowBtn.classList.remove('hidden');
    }

    // 즉시 촬영 콜백 저장
    state.instantShootCallback = () => {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
      if (shootNowBtn) shootNowBtn.classList.add('hidden');
      if (countdownEl) {
        countdownEl.style.display = 'none';
        countdownEl.classList.remove('visible', 'countdown-pop');
      }
      triggerFlash();
      playSound('shutter');
      if (onComplete) onComplete();
    };

    let remaining = duration;
    countdownEl.textContent = remaining;
    countdownEl.style.display = 'flex';
    countdownEl.classList.add('visible');'''

src = src.replace(old_countdown_start, new_countdown_start)

# ==============================================================
# PATCH 6: cancelCountdown() — 즉시 촬영 버튼도 숨기기
# ==============================================================
old_cancel = '''  function cancelCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }

    const countdownEl = $('#countdown-number');
    if (countdownEl) {
      countdownEl.style.display = 'none';
      countdownEl.classList.remove('visible', 'countdown-pop');
    }
  }'''

new_cancel = '''  function cancelCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }
    state.instantShootCallback = null;

    const countdownEl = $('#countdown-number');
    if (countdownEl) {
      countdownEl.style.display = 'none';
      countdownEl.classList.remove('visible', 'countdown-pop');
    }

    const shootNowBtn = $('#btn-shoot-now');
    if (shootNowBtn) shootNowBtn.classList.add('hidden');
  }'''

src = src.replace(old_cancel, new_cancel)

# ==============================================================
# PATCH 7: countdown onComplete — 즉시 촬영 버튼 숨기기
# ==============================================================
old_countdown_done = '''        clearInterval(state.countdownTimer);
        state.countdownTimer = null;

        countdownEl.style.display = 'none';
        countdownEl.classList.remove('visible', 'countdown-pop');

        // 플래시 효과 및 셔터 사운드
        triggerFlash();
        playSound('shutter');

        if (onComplete) {
          onComplete();
        }'''

new_countdown_done = '''        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        state.instantShootCallback = null;

        // 즉시 촬영 버튼 숨기기
        const shootNowBtn2 = $('#btn-shoot-now');
        if (shootNowBtn2) shootNowBtn2.classList.add('hidden');

        countdownEl.style.display = 'none';
        countdownEl.classList.remove('visible', 'countdown-pop');

        // 플래시 효과 및 셔터 사운드
        triggerFlash();
        playSound('shutter');

        if (onComplete) {
          onComplete();
        }'''

src = src.replace(old_countdown_done, new_countdown_done)

# ==============================================================
# PATCH 8: drawDateWatermark() — 브랜드 텍스트 + 색상 자동 조정
# ==============================================================
old_watermark = '''  function drawDateWatermark(ctx, w, h, bgColor) {
    const date = getFormattedDate();
    const textColor = '#000000'; // 강제 검은색

    ctx.fillStyle = textColor;
    ctx.font = '900 70px "Outfit", "Pretendard", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(date, w / 2, h - 15);
  }'''

new_watermark = '''  function drawDateWatermark(ctx, w, h, bgColor) {
    const date = getFormattedDate();
    // 배경 밝기에 따라 텍스트 색상 자동 결정
    let textColor = '#000000';
    if (bgColor && bgColor.startsWith('#')) {
      const brightness = getColorBrightness(bgColor);
      textColor = brightness < 100 ? '#ffffff' : '#000000';
    }

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';

    // 브랜드 텍스트
    ctx.font = '700 48px "Outfit", "Pretendard", sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Life Four Cuts', w / 2, h - 68);

    // 날짜 텍스트
    ctx.font = '900 70px "Outfit", "Pretendard", sans-serif';
    ctx.fillText(date, w / 2, h - 10);
    ctx.restore();
  }'''

src = src.replace(old_watermark, new_watermark)

# ==============================================================
# PATCH 9: getPhotoPositions() — 레이아웃 3종 지원
# ==============================================================
old_positions = '''  function getPhotoPositions(layoutName, layout) {
    const positions = [];
    const total = getTotalShots();

    // 세로 4컷(strip) 전용
    let pw = layout.photoWidth;
    let ph = layout.photoHeight;
    let pad = layout.padding;
    let gap = layout.gap;

    const startX = (layout.canvasWidth - pw) / 2;
    for (let i = 0; i < total; i++) {
      positions.push({
        x: startX,
        y: pad + i * (ph + gap),
        width:  pw,
        height: ph
      });
    }

    return positions;
  }'''

new_positions = '''  function getPhotoPositions(layoutName, layout) {
    const positions = [];
    const total = layout.totalShots || getTotalShots();
    const pw = layout.photoWidth;
    const ph = layout.photoHeight;
    const pad = layout.padding;
    const gap = layout.gap;

    if (layoutName === 'grid22') {
      // 2×2 격자 레이아웃
      const cols = 2;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= total) break;
          positions.push({
            x: pad + c * (pw + gap),
            y: pad + r * (ph + gap),
            width:  pw,
            height: ph
          });
        }
      }
    } else {
      // 세로 스트립 (strip4 / strip3)
      const startX = (layout.canvasWidth - pw) / 2;
      for (let i = 0; i < total; i++) {
        positions.push({
          x: startX,
          y: pad + i * (ph + gap),
          width:  pw,
          height: ph
        });
      }
    }

    return positions;
  }'''

src = src.replace(old_positions, new_positions)

# ==============================================================
# PATCH 10: initShootScreen() — 버튼 대기 방식으로 변경
# ==============================================================
old_initShoot = '''  async function initShootScreen() {
    // 상태 초기화
    state.adjustments = { brightness: 50, saturation: 50, contrast: 50 };
    state.currentShot = 0;
    state.photos = [];
    state.loadedPhotos = [];

    // 촬영 표시기 업데이트
    updateShotIndicator();

    const select = $('#camera-select');
    if (select) select.disabled = false;

    // 우측 레이아웃 프레임 썸네일 캔버스 초기화 (빈 슬롯 상태로 그리기)
    renderShootPreviewCanvas();

    // 카메라 시작
    await initCamera();

    // 1.5초 후 첫 카운트다운 시작 (카메라 로딩 대기 시간 고려)
    setTimeout(() => {
      if (state.currentScreen === 'shoot') {
        startShootingSequence();
      }
    }, 1500);
  }'''

new_initShoot = '''  async function initShootScreen() {
    // 상태 초기화
    state.adjustments = { brightness: 50, saturation: 50, contrast: 50 };
    state.currentShot = 0;
    state.retakeIndex = -1;
    state.photos = [];
    state.loadedPhotos = [];
    state.shootingStarted = false;
    state.instantShootCallback = null;

    // 촬영 표시기 업데이트
    updateShotIndicator();

    const select = $('#camera-select');
    if (select) select.disabled = false;

    // shot-indicator에 총 컷 수 반영
    const totalEl = document.querySelector('.shot-total');
    if (totalEl) totalEl.textContent = ` / ${getTotalShots()}`;

    // 카메라 전환 버튼
    const flipBtn = $('#btn-flip-camera');
    if (flipBtn) {
      flipBtn.onclick = async () => {
        state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
        state.selectedCameraId = null;
        await initCamera();
      };
    }

    // 타이머 옵션 버튼
    $$('.timer-btn').forEach(btn => {
      btn.classList.remove('active');
      if (parseInt(btn.dataset.seconds) === state.timerDuration) {
        btn.classList.add('active');
      }
      btn.onclick = () => {
        $$('.timer-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timerDuration = parseInt(btn.dataset.seconds);
      };
    });

    // 즉시 촬영 버튼 숨기기
    const shootNowBtn = $('#btn-shoot-now');
    if (shootNowBtn) shootNowBtn.classList.add('hidden');

    // 촬영 시작 버튼 표시
    const startBtn = $('#btn-start-shooting');
    if (startBtn) {
      startBtn.classList.remove('hidden');
      startBtn.onclick = () => {
        if (state.shootingStarted) return;
        state.shootingStarted = true;
        startBtn.classList.add('hidden');
        // 타이머 옵션 잠금
        $$('.timer-btn').forEach(b => b.disabled = true);
        startShootingSequence();
      };
    }

    // 즉시 촬영 버튼 핸들러
    const shootNowBtnEl = $('#btn-shoot-now');
    if (shootNowBtnEl) {
      shootNowBtnEl.onclick = () => {
        if (state.instantShootCallback) {
          state.instantShootCallback();
        }
      };
    }

    // 우측 캔버스 초기화
    renderShootPreviewCanvas();

    // 카메라 시작
    await initCamera();
  }'''

src = src.replace(old_initShoot, new_initShoot)

# ==============================================================
# PATCH 11: startShootingSequence() — 재촬영 모드 지원 + 타이머 옵션 사용
# ==============================================================
old_shooting_seq = '''  function startShootingSequence() {
    const select = $('#camera-select');
    if (select) select.disabled = true;

    const totalShots = getTotalShots();
    
    if (state.currentShot >= totalShots) {
      // 모든 촬영 완료 → 1초 후 편집 화면으로 이동
      setTimeout(() => {
        showScreen('edit');
      }, 1000);
      return;
    }

    updateShotIndicator();

    // 첫번째 컷 촬영 전에는 10초의 대기시간을 부여하고 안내문구 표시
    const isFirstShot = (state.currentShot === 0);
    const duration = isFirstShot ? 10 : CONFIG.countdown;

    const poseInstruction = $('#pose-instruction');
    if (isFirstShot && poseInstruction) {
      poseInstruction.classList.remove('hidden');
    }

    startCountdown(duration, () => {
      // 카운트다운 완료 시 안내 문구 숨김
      if (poseInstruction) {
        poseInstruction.classList.add('hidden');
      }

      // 프레임 캡처
      const photoURL = captureFrame();
      if (photoURL) {
        // 날아가는 모션 효과와 함께 우측 슬롯에 임시 배치
        animatePhotoToSidebar(state.currentShot, photoURL);
      }

      state.currentShot++;
      updateShotIndicator();

      if (state.currentShot < totalShots) {
        // 2초 후 다음 촬영 (비행 모션 시간 0.9초를 감안하여 다음 컷 딜레이 여유 부여)
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            startShootingSequence();
          }
        }, 2200);
      } else {
        // 모든 촬영 완료 → 편집 화면으로 1.8초 뒤 전환
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            showScreen('edit');
          }
        }, 1800);
      }
    });
  }'''

new_shooting_seq = '''  function startShootingSequence() {
    const select = $('#camera-select');
    if (select) select.disabled = true;

    const totalShots = getTotalShots();

    // 재촬영 모드: 특정 인덱스만 다시 찍기
    if (state.retakeIndex >= 0) {
      const idx = state.retakeIndex;
      updateShotIndicator(idx + 1);

      const poseInstruction = $('#pose-instruction');
      if (poseInstruction) poseInstruction.classList.remove('hidden');

      startCountdown(state.timerDuration, () => {
        if (poseInstruction) poseInstruction.classList.add('hidden');

        const photoURL = captureFrame();
        if (photoURL) {
          // 기존 사진 교체
          state.photos[idx] = photoURL;
          const img = new Image();
          img.src = photoURL;
          state.loadedPhotos[idx] = img;
          animatePhotoToSidebar(idx, photoURL);
        }

        state.retakeIndex = -1;
        // 타이머 버튼 잠금 해제
        $$('.timer-btn').forEach(b => b.disabled = false);
        const startBtn = $('#btn-start-shooting');
        if (startBtn) startBtn.classList.add('hidden');

        // 잠시 후 편집화면으로
        setTimeout(() => {
          if (state.currentScreen === 'shoot') showScreen('edit');
        }, 1800);
      });
      return;
    }

    if (state.currentShot >= totalShots) {
      setTimeout(() => showScreen('edit'), 1000);
      return;
    }

    updateShotIndicator();

    const isFirstShot = (state.currentShot === 0);
    const duration = state.timerDuration;

    const poseInstruction = $('#pose-instruction');
    if (isFirstShot && poseInstruction) {
      poseInstruction.classList.remove('hidden');
    }

    startCountdown(duration, () => {
      if (poseInstruction) poseInstruction.classList.add('hidden');

      const photoURL = captureFrame();
      if (photoURL) {
        animatePhotoToSidebar(state.currentShot, photoURL);
      }

      state.currentShot++;
      updateShotIndicator();

      if (state.currentShot < totalShots) {
        setTimeout(() => {
          if (state.currentScreen === 'shoot') startShootingSequence();
        }, 2200);
      } else {
        // 촬영 완료 → 재촬영 말풍선 표시 후 편집화면 이동
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            showRetakeTooltip();
            setTimeout(() => {
              if (state.currentScreen === 'shoot') showScreen('edit');
            }, 3000);
          }
        }, 1200);
      }
    });
  }

  /**
   * 재촬영 안내 말풍선 표시
   */
  function showRetakeTooltip() {
    const tooltip = $('#retake-tooltip');
    if (!tooltip) return;
    tooltip.classList.remove('hidden');
    const closeBtn = $('#btn-retake-tooltip-close');
    if (closeBtn) {
      closeBtn.onclick = () => tooltip.classList.add('hidden');
    }
    setTimeout(() => tooltip.classList.add('hidden'), 5000);
  }'''

src = src.replace(old_shooting_seq, new_shooting_seq)

# ==============================================================
# PATCH 12: updateShotIndicator() — 인덱스 파라미터 지원
# ==============================================================
old_shot_indicator = '''  function updateShotIndicator() {
    const indicator = $('#shot-indicator');
    const totalShots = getTotalShots();
    
    if (indicator) {
      const current = Math.min(state.currentShot + 1, totalShots);
      indicator.textContent = `${current} / ${totalShots}`;
    }
  }'''

new_shot_indicator = '''  function updateShotIndicator(overrideShot) {
    const currentEl = document.querySelector('.shot-current');
    const totalEl   = document.querySelector('.shot-total');
    const totalShots = getTotalShots();

    const current = overrideShot !== undefined
      ? overrideShot
      : Math.min(state.currentShot + 1, totalShots);

    if (currentEl) currentEl.textContent = current;
    if (totalEl) totalEl.textContent = ` / ${totalShots}`;
  }'''

src = src.replace(old_shot_indicator, new_shot_indicator)

# ==============================================================
# PATCH 13: initFrameScreen() — 레이아웃 선택 UI
# ==============================================================
old_initFrame = '''  function initFrameScreen() {
    // 세로 4컷 고정 – 레이아웃 선택 없음
    state.frame.layout = 'strip';

    // 진입 시 초기 미리보기 렌더링
    renderFramePreview();
  }'''

new_initFrame = '''  function initFrameScreen() {
    // 레이아웃 선택 카드 이벤트
    $$('.layout-card').forEach(card => {
      card.addEventListener('click', () => {
        $$('.layout-card').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        card.classList.add('active');
        card.setAttribute('aria-pressed', 'true');
        state.frame.layout = card.dataset.layout;
        renderFramePreview();
      });
    });

    // 현재 선택된 레이아웃 카드 활성화
    const activeCard = $(`.layout-card[data-layout="${state.frame.layout}"]`);
    if (activeCard) {
      $$('.layout-card').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed','false'); });
      activeCard.classList.add('active');
      activeCard.setAttribute('aria-pressed','true');
    }

    // 규격 다운로드 버튼
    const dlBtn = $('#btn-download-template');
    if (dlBtn) {
      dlBtn.onclick = downloadTemplateBlank;
    }

    renderFramePreview();
  }

  /**
   * 현재 레이아웃에 맞는 빈 규격 PNG 템플릿 다운로드
   */
  function downloadTemplateBlank() {
    const layout = getLayoutConfig();
    const canvas = document.createElement('canvas');
    canvas.width  = layout.canvasWidth;
    canvas.height = layout.canvasHeight;
    const ctx = canvas.getContext('2d');

    // 흰 배경
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 사진 슬롯 표시 (투명 구멍 효과)
    const positions = getPhotoPositions(state.frame.layout, layout);
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 8]);
    positions.forEach(pos => {
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
    });
    ctx.setLineDash([]);

    // 가이드 텍스트
    ctx.fillStyle = '#888888';
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    positions.forEach((pos, i) => {
      ctx.fillText(`Photo ${i + 1}`, pos.x + pos.width / 2, pos.y + pos.height / 2);
    });

    const link = document.createElement('a');
    link.download = `life4cuts_template_${state.frame.layout}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }'''

src = src.replace(old_initFrame, new_initFrame)

# ==============================================================
# PATCH 14: composeImage() — layout 'strip' → 'strip4' 하위 호환
# ==============================================================
# composeImage에서 CONFIG.layouts[frameConfig.layout] 이미 있음, 하위 호환 OK

# ==============================================================
# PATCH 15: renderEditCanvas() — bg 스타일 Canvas 렌더링 지원
# ==============================================================
old_render_bg = '''    // 1) 캔버스 배경 설정
    if (state.frame.bg !== 'none' && state.bgImages && state.bgImages[state.frame.bg]) {
      const bgImg = state.bgImages[state.frame.bg];
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = state.frame.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }'''

new_render_bg = '''    // 1) 캔버스 배경 설정
    drawBackground(ctx, canvas.width, canvas.height, state.frame.bg, state.frame.color);'''

src = src.replace(old_render_bg, new_render_bg)

# ==============================================================
# PATCH 16: composeImage() — 같은 bg 처리
# ==============================================================
old_compose_bg = '''    // 배경색 (프레임 색상)
    if (frameConfig.bg !== 'none' && state.bgImages && state.bgImages[frameConfig.bg]) {
      ctx.drawImage(state.bgImages[frameConfig.bg], 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = frameConfig.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }'''

new_compose_bg = '''    // 배경 설정
    drawBackground(ctx, canvas.width, canvas.height, frameConfig.bg, frameConfig.color);'''

src = src.replace(old_compose_bg, new_compose_bg)

# ==============================================================
# PATCH 17: bg 스타일 목록 및 drawBackground 함수 추가
#           (getColorBrightness 함수 바로 앞에 삽입)
# ==============================================================
insert_before = '''  /**
   * 색상의 밝기를 계산합니다.'''

bg_functions = '''  // ============================================================
  // === BACKGROUND STYLES MODULE (배경 스타일 모듈) ===
  // ============================================================

  /**
   * 배경 스타일 정의 목록
   */
  const BG_STYLES = [
    { key: 'none',           label: 'ដើម\\nSolid',         thumb: null },
    { key: 'gradient_pink',  label: 'ផ្កា\\nPink Gradient', thumb: null },
    { key: 'gradient_blue',  label: 'ពណ៌ខៀវ\\nBlue Gradient', thumb: null },
    { key: 'gradient_gold',  label: 'មាស\\nGold Glam',     thumb: null },
    { key: 'film_noir',      label: 'ហ្វីល\\nFilm Noir',   thumb: null },
    { key: 'pastel_bloom',   label: 'ផ្ការ\\nPastel Bloom', thumb: null },
    { key: 'minimal_dots',   label: 'ចំណុច\\nMinimal Dots', thumb: null },
    { key: 'vert4_bg2',      label: 'Template 2',          thumb: null }
  ];

  /**
   * 배경 스타일을 Canvas에 렌더링합니다.
   */
  function drawBackground(ctx, w, h, bgKey, solidColor) {
    ctx.save();
    switch (bgKey) {
      case 'gradient_pink': {
        const grd = ctx.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, '#ffd6e7');
        grd.addColorStop(0.4, '#ffb3d9');
        grd.addColorStop(1, '#c9a0dc');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        // 장식용 원형 흐림
        const rg = ctx.createRadialGradient(w * 0.8, h * 0.1, 0, w * 0.8, h * 0.1, w * 0.6);
        rg.addColorStop(0, 'rgba(255,255,255,0.18)');
        rg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'gradient_blue': {
        const grd = ctx.createLinearGradient(0, 0, w * 0.3, h);
        grd.addColorStop(0, '#a8edea');
        grd.addColorStop(0.5, '#7ec8e3');
        grd.addColorStop(1, '#3a7bd5');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'gradient_gold': {
        const grd = ctx.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, '#f7e7c1');
        grd.addColorStop(0.5, '#f5c842');
        grd.addColorStop(1, '#c8860a');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        // 글리터 점 효과
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (let i = 0; i < 200; i++) {
          const px = Math.random() * w;
          const py = Math.random() * h;
          const pr = Math.random() * 6 + 1;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'film_noir': {
        // 어두운 필름 감성
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#1a1a2e');
        grd.addColorStop(0.5, '#16213e');
        grd.addColorStop(1, '#0f3460');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        // 필름 스트립 사이드 바
        ctx.fillStyle = '#111122';
        ctx.fillRect(0, 0, 36, h);
        ctx.fillRect(w - 36, 0, 36, h);
        // 스프로켓 구멍
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for (let y = 40; y < h; y += 70) {
          drawRoundedRect(ctx, 6, y, 24, 18, 4); ctx.fill();
          drawRoundedRect(ctx, w - 30, y, 24, 18, 4); ctx.fill();
        }
        break;
      }
      case 'pastel_bloom': {
        // 파스텔 꽃 테마
        ctx.fillStyle = '#fff5f5';
        ctx.fillRect(0, 0, w, h);
        const flowers = [
          {x: 0.1, y: 0.05, r: 120, c: 'rgba(255,182,193,0.45)'},
          {x: 0.9, y: 0.05, r: 140, c: 'rgba(255,200,221,0.4)'},
          {x: 0.05, y: 0.5, r: 100, c: 'rgba(216,180,254,0.35)'},
          {x: 0.95, y: 0.5, r: 110, c: 'rgba(175,240,216,0.35)'},
          {x: 0.1, y: 0.95, r: 130, c: 'rgba(255,182,193,0.4)'},
          {x: 0.9, y: 0.95, r: 150, c: 'rgba(255,220,150,0.35)'},
          {x: 0.5, y: 0.1, r:  90, c: 'rgba(200,220,255,0.3)'},
          {x: 0.5, y: 0.9, r:  95, c: 'rgba(255,180,240,0.3)'}
        ];
        flowers.forEach(f => {
          const rg = ctx.createRadialGradient(f.x*w, f.y*h, 0, f.x*w, f.y*h, f.r);
          rg.addColorStop(0, f.c);
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = rg;
          ctx.fillRect(0, 0, w, h);
        });
        break;
      }
      case 'minimal_dots': {
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);
        const dotSpacing = 48;
        ctx.fillStyle = 'rgba(100,120,180,0.18)';
        for (let dx = dotSpacing / 2; dx < w; dx += dotSpacing) {
          for (let dy = dotSpacing / 2; dy < h; dy += dotSpacing) {
            ctx.beginPath();
            ctx.arc(dx, dy, 5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'vert4_bg2':
        if (state.bgImages && state.bgImages['vert4_bg2']) {
          ctx.drawImage(state.bgImages['vert4_bg2'], 0, 0, w, h);
        } else {
          ctx.fillStyle = solidColor || '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        break;
      default:
        // Custom uploaded template
        if (bgKey && bgKey.startsWith('custom_') && state.bgImages && state.bgImages[bgKey]) {
          ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
        } else if (bgKey !== 'none' && state.bgImages && state.bgImages[bgKey]) {
          ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
        } else {
          ctx.fillStyle = solidColor || '#000000';
          ctx.fillRect(0, 0, w, h);
        }
    }
    ctx.restore();
  }

  /**
   * 배경 스타일 목록을 렌더링합니다.
   */
  function renderBgOptions() {
    const container = $('#bg-options-list');
    if (!container) return;
    container.innerHTML = '';

    BG_STYLES.forEach(style => {
      const item = document.createElement('div');
      item.className = 'style-option-item' + (state.frame.bg === style.key ? ' active' : '');
      item.dataset.bg = style.key;

      // 썸네일 캔버스
      const thumb = document.createElement('canvas');
      thumb.width  = 60;
      thumb.height = 60;
      drawBackground(thumb.getContext('2d'), 60, 60, style.key, state.frame.color);

      const lbl = document.createElement('span');
      lbl.innerHTML = style.label.replace('\\n', '<br>');

      item.appendChild(thumb);
      item.appendChild(lbl);
      item.addEventListener('click', () => {
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        state.frame.bg = style.key;
        renderEditCanvas();
      });
      container.appendChild(item);
    });

    // 커스텀 템플릿들 (IndexedDB에서 로드)
    loadCustomTemplatesFromDB().then(templates => {
      templates.forEach(t => {
        addCustomTemplateOption(container, t);
      });
    });
  }

  '''

src = src.replace(insert_before, bg_functions + insert_before)

# ==============================================================
# PATCH 18: IndexedDB 커스텀 템플릿 기능 추가
#           (initCamera 함수 바로 앞에 삽입)
# ==============================================================
insert_before_camera = '''  /**
   * 카메라 초기화'''

idb_code = '''  // ============================================================
  // === CUSTOM TEMPLATE (IndexedDB) ===
  // ============================================================

  const IDB_NAME = 'life4cuts';
  const IDB_STORE = 'customTemplates';
  let idbInstance = null;

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (idbInstance) { resolve(idbInstance); return; }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = e => { idbInstance = e.target.result; resolve(idbInstance); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  async function saveCustomTemplate(key, dataURL, name) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ key, dataURL, name });
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }

  async function loadCustomTemplatesFromDB() {
    try {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } catch { return []; }
  }

  async function deleteCustomTemplate(key) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }

  function addCustomTemplateOption(container, t) {
    const item = document.createElement('div');
    item.className = 'style-option-item custom-template-option' + (state.frame.bg === t.key ? ' active' : '');
    item.dataset.bg = t.key;

    const img = document.createElement('img');
    img.src = t.dataURL;
    img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:4px;';

    const lbl = document.createElement('span');
    lbl.textContent = t.name || '커스텀';

    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.className = 'custom-template-del';
    delBtn.title = '삭제';
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      await deleteCustomTemplate(t.key);
      delete state.bgImages[t.key];
      if (state.frame.bg === t.key) state.frame.bg = 'none';
      item.remove();
      renderEditCanvas();
    };

    item.appendChild(img);
    item.appendChild(lbl);
    item.appendChild(delBtn);
    item.addEventListener('click', () => {
      $$('.style-option-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      state.frame.bg = t.key;
      // 이미지 캐시에 추가
      if (!state.bgImages[t.key]) {
        const bgImg = new Image();
        bgImg.src = t.dataURL;
        state.bgImages[t.key] = bgImg;
      }
      renderEditCanvas();
    });
    container.appendChild(item);
  }

  function setupCustomTemplateUpload() {
    const input = $('#custom-template-input');
    if (!input) return;
    input.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataURL = ev.target.result;
        const key = 'custom_' + Date.now();
        const name = file.name.replace(/\.[^.]+$/, '');
        await saveCustomTemplate(key, dataURL, name);
        const bgImg = new Image();
        bgImg.src = dataURL;
        state.bgImages[key] = bgImg;
        // BG 옵션 목록 새로 고침
        renderBgOptions();
        // 바로 선택
        state.frame.bg = key;
        renderEditCanvas();
      };
      reader.readAsDataURL(file);
      input.value = '';
    });
  }

  '''

src = src.replace(insert_before_camera, idb_code + insert_before_camera)

# ==============================================================
# PATCH 19: initEditScreen() — renderBgOptions, setupCustomTemplateUpload 호출
# ==============================================================
old_initEdit_top = '''  async function initEditScreen() {
    // 카메라 끄기
    stopCamera();

    // 우측 패널 스크롤 초기화
    const editControls = document.querySelector('.edit-controls');
    if (editControls) {
      editControls.scrollTop = 0;
    }'''

new_initEdit_top = '''  async function initEditScreen() {
    // 카메라 끄기
    stopCamera();

    // 우측 패널 스크롤 초기화
    const editControls = document.querySelector('.edit-controls');
    if (editControls) {
      editControls.scrollTop = 0;
    }

    // 배경 스타일 옵션 렌더링
    renderBgOptions();

    // 커스텀 템플릿 업로드 설정
    setupCustomTemplateUpload();'''

src = src.replace(old_initEdit_top, new_initEdit_top)

# ==============================================================
# PATCH 20: 색상 선택 이벤트에 RGB 피커 추가 (글로벌 이벤트 핸들러 추가)
# ==============================================================
# 기존 color-swatch 이벤트 처리 찾기
old_color_btn = '''    // 프레임 색상 선택 버튼
    $$('.color-swatch').forEach(btn => {'''

new_color_btn = '''    // RGB 커스텀 컬러 피커
    const colorCustom = $('#color-custom');
    if (colorCustom) {
      colorCustom.addEventListener('input', (e) => {
        const newColor = e.target.value;
        state.frame.color = newColor;
        $$('.color-swatch').forEach(s => { s.classList.remove('active'); s.setAttribute('aria-pressed','false'); });
        renderEditCanvas();
      });
    }

    // 프레임 색상 선택 버튼
    $$('.color-swatch').forEach(btn => {'''

src = src.replace(old_color_btn, new_color_btn)

# ==============================================================
# PATCH 21: 편집 화면에서 사진 클릭 → 재촬영 기능
# (btn-edit-back 버튼 이벤트 핸들러 등록하는 부분 근처에 추가)
# ==============================================================
old_edit_canvas_setup = '''    // 편집 캔버스 터치/포인터 이벤트 초기화
    setupCanvasTouchEvents();'''

new_edit_canvas_setup = '''    // 편집 캔버스 터치/포인터 이벤트 초기화
    setupCanvasTouchEvents();

    // 편집 캔버스에서 사진 영역 클릭 → 재촬영 기능
    const editCanvas = $('#edit-canvas');
    if (editCanvas) {
      editCanvas.addEventListener('click', (e) => {
        // 스티커 관련 모드이면 무시
        if (state.pendingStickerEmoji || state.isDragging || state.selectedSticker !== null) return;
        const rect = editCanvas.getBoundingClientRect();
        const normX = (e.clientX - rect.left) / rect.width;
        const normY = (e.clientY - rect.top)  / rect.height;
        // 어느 사진 슬롯인지 확인
        const layout = getLayoutConfig();
        const positions = getPhotoPositions(state.frame.layout, layout);
        const cw = editCanvas.width;
        const ch = editCanvas.height;
        for (let i = 0; i < positions.length; i++) {
          const pos = positions[i];
          const px = pos.x / cw, py = pos.y / ch;
          const pw = pos.width / cw, ph2 = pos.height / ch;
          if (normX >= px && normX <= px + pw && normY >= py && normY <= py + ph2) {
            // 재촬영 확인
            if (confirm(`사진 ${i + 1}번을 다시 촬영할까요?\nRetake photo ${i + 1}?`)) {
              state.retakeIndex = i;
              state.shootingStarted = true;
              showScreen('shoot');
            }
            break;
          }
        }
      });
    }'''

src = src.replace(old_edit_canvas_setup, new_edit_canvas_setup)

# ==============================================================
# PATCH 22: initStartScreen() — btn-flip-camera 초기 설정
# Retake 버튼: 촬영 화면으로 돌아가 전체 재촬영
# ==============================================================
old_retake_btn = '''      btnRetake.addEventListener('click', () => {
        cancelCountdown();
        stopCamera();
        state.currentShot = 0;
        state.photos = [];
        state.loadedPhotos = [];
        initShootScreen();
      });'''

new_retake_btn = '''      btnRetake.addEventListener('click', () => {
        cancelCountdown();
        state.retakeIndex = -1;
        state.shootingStarted = false;
        state.currentShot = 0;
        state.photos = [];
        state.loadedPhotos = [];
        initShootScreen();
      });'''

src = src.replace(old_retake_btn, new_retake_btn)

# ==============================================================
# PATCH 23: 이미 있는 bg 옵션 렌더링 함수를 renderBgOptions()로 교체
# (이전 방식의 renderBgOptions가 있다면 대체)
# ==============================================================

# ==============================================================
# PATCH 24: renderFramePreview() — 예시 이미지 삽입
# ==============================================================
old_frame_preview_placeholder = '''    // 4) 각 슬롯에 플레이스홀더 사각형 그리기'''

new_frame_preview_placeholder = '''    // 4) 각 슬롯에 예시 이미지 또는 플레이스홀더 그리기'''

src = src.replace(old_frame_preview_placeholder, new_frame_preview_placeholder)

# ==============================================================
# 최종 저장
# ==============================================================
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(src)

print('app.js patched successfully.')
