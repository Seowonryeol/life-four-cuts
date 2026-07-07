/**
 * 인생네컷 (Life Four Cuts) — 프리미엄 포토부스 웹 앱
 * 
 * iPad 최적화 클라이언트 전용 포토부스 애플리케이션.
 * WebRTC 카메라, Canvas 기반 필터/스티커, 프레임 합성, 내보내기 기능을 포함합니다.
 * 
 * @version 1.0.0
 */
(function () {
  'use strict';

  // ============================================================
  // === CONFIGURATION (설정) ===
  // ============================================================

  const CONFIG = {
    countdown: 5,       // 촬영당 카운트다운 초
    totalShots: 4,      // 총 촬영 매수
    camera: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      facingMode: 'user'
    },
    canvas: {
      outputWidth: 1200,   // 최종 합성 이미지 너비
      outputHeight: 1800   // 최종 합성 이미지 높이 (스트립용)
    },
    // 프레임 레이아웃별 치수
    layouts: {
      strip: {
        canvasWidth: 600,
        canvasHeight: 1800,
        photoWidth: 540,
        photoHeight: 380,
        padding: 30,
        gap: 15
      },
      grid: {
        canvasWidth: 1200,
        canvasHeight: 1200,
        photoWidth: 560,
        photoHeight: 400,
        padding: 40,
        gap: 20
      }
    },
    // JPEG 캡처 품질
    captureQuality: 0.95,
    // 썸네일 QR용 압축 설정
    qrThumbnail: {
      width: 100,
      height: 150,
      quality: 0.3
    }
  };


  // ============================================================
  // === STATE (상태 관리) ===
  // ============================================================

  const state = {
    currentScreen: 'start',
    frame: {
      layout: 'strip',       // 'strip' | 'grid'
      color: '#000000',       // 프레임 배경색
      bg: 'none',             // 'none' | 'bg1' | 'bg2' | 'bg3' | 'vert4_bg1' | 'vert4_bg2'
      deco: 'none'            // 'none' | 'vert4_deco1' | 'vert4_deco2'
    },
    bgImages: {},
    decoImages: {},
    photos: [],               // 캡처된 이미지 Data URL 배열
    currentShot: 0,           // 현재 촬영 인덱스 (0-3)
    filter: 'none',           // 선택된 필터 이름
    stickers: [],             // {id, emoji, x, y, size, rotation} 배열
    cameraStream: null,       // MediaStream 참조
    countdownTimer: null,     // 카운트다운 타이머 ID
    selectedSticker: null,    // 선택/드래그 중인 스티커 인덱스
    pendingStickerEmoji: null, // 배치 대기 중인 스티커 이모지
    composedCanvas: null,     // 최종 합성 캔버스
    isDragging: false,        // 스티커 드래그 상태
    dragOffset: { x: 0, y: 0 }, // 드래그 오프셋
    stickerIdCounter: 0,      // 스티커 고유 ID 카운터
    uploadedImageUrl: null,   // 업로드된 이미지 다운로드 주소
    hostedPageUrl: null       // QR용 이미지 호스팅 웹페이지 주소
  };

  function getTotalShots() {
    return 4;
  }


  // ============================================================
  // === UTILITY FUNCTIONS (유틸리티 함수) ===
  // ============================================================

  /**
   * querySelector 단축 함수
   * @param {string} selector - CSS 선택자
   * @param {Element} [parent=document] - 부모 요소
   * @returns {Element|null}
   */
  function $(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  /**
   * querySelectorAll 단축 함수
   * @param {string} selector - CSS 선택자
   * @param {Element} [parent=document] - 부모 요소
   * @returns {NodeList}
   */
  function $$(selector, parent) {
    return (parent || document).querySelectorAll(selector);
  }

  /**
   * 화면 전환 함수
   * 모든 화면을 숨기고 지정된 화면을 표시한 뒤 초기화 함수를 호출합니다.
   * @param {string} name - 화면 이름 (start, frame, shoot, edit, result)
   */
  function showScreen(name) {
    // 모든 화면 숨기기
    const screens = $$('[id^="screen-"]');
    screens.forEach(screen => {
      screen.classList.remove('active');
    });

    // 지정된 화면 표시
    const targetScreen = $(`#screen-${name}`);
    if (targetScreen) {
      // requestAnimationFrame으로 트랜지션 보장
      requestAnimationFrame(() => {
        targetScreen.classList.add('active');
      });
    }

    state.currentScreen = name;

    // 화면별 초기화 함수 호출
    const initFunctions = {
      start: initStartScreen,
      frame: initFrameScreen,
      shoot: initShootScreen,
      edit: initEditScreen,
      result: initResultScreen
    };

    if (initFunctions[name]) {
      initFunctions[name]();
    }
  }

  /**
   * 요소 생성 헬퍼
   * @param {string} tag - HTML 태그명
   * @param {string} [className] - CSS 클래스
   * @param {string} [content] - 텍스트 콘텐츠
   * @returns {HTMLElement}
   */
  function createElement(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content) el.textContent = content;
    return el;
  }

  /**
   * 숫자 클램핑 함수
   * @param {number} val - 입력값
   * @param {number} min - 최솟값
   * @param {number} max - 최댓값
   * @returns {number}
   */
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  /**
   * 현재 날짜를 YYYY.MM.DD 형식으로 반환
   * @returns {string}
   */
  function getFormattedDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }

  /**
   * 파일명용 타임스탬프 생성
   * @returns {string} YYYYMMDD_HHmmss 형식
   */
  function getTimestamp() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${y}${mo}${d}_${h}${mi}${s}`;
  }

  /**
   * Data URL에서 Image 객체를 로드하여 반환 (Promise)
   * @param {string} dataURL
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(dataURL) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataURL;
    });
  }


  // ============================================================
  // === CAMERA MODULE (카메라 모듈) ===
  // ============================================================

  /**
   * 카메라 초기화
   * getUserMedia로 카메라 스트림을 가져와 비디오 요소에 연결합니다.
   */
  async function initCamera() {
    try {
      const constraints = {
        video: {
          width: CONFIG.camera.width,
          height: CONFIG.camera.height,
          facingMode: CONFIG.camera.facingMode
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.cameraStream = stream;

      const video = $('#camera-preview');
      if (video) {
        video.srcObject = stream;
        // iOS Safari를 위한 속성 설정
        video.setAttribute('playsinline', '');
        video.setAttribute('autoplay', '');
        video.muted = true;

        await video.play();
      }
    } catch (error) {
      console.error('카메라 초기화 실패:', error);

      // 사용자에게 한국어 오류 메시지 표시
      let message = '카메라를 시작할 수 없습니다.\n';
      if (error.name === 'NotAllowedError') {
        message += '카메라 접근 권한을 허용해 주세요.';
      } else if (error.name === 'NotFoundError') {
        message += '카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해 주세요.';
      } else if (error.name === 'NotReadableError') {
        message += '다른 앱에서 카메라를 사용 중일 수 있습니다.';
      } else {
        message += `오류: ${error.message}`;
      }

      alert(message);
    }
  }

  /**
   * 카메라 스트림 중지
   */
  function stopCamera() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
      state.cameraStream = null;
    }

    const video = $('#camera-preview');
    if (video) {
      video.srcObject = null;
    }
  }

  /**
   * 현재 비디오 프레임을 캡처하여 Data URL로 반환
   * 미리보기와 동일하게 좌우 반전된 이미지를 생성합니다.
   * @returns {string|null} 이미지 Data URL 또는 null
   */
  function captureFrame() {
    const video = $('#camera-preview');
    if (!video || !video.videoWidth) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');

    // 좌우 반전 (미러링) — 미리보기와 동일하게 보이도록
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', CONFIG.captureQuality);
  }


  // ============================================================
  // === AUDIO / SOUND MODULE (오디오 모듈) ===
  // ============================================================

  let audioCtx = null;

  /**
   * AudioContext를 가져오거나 생성합니다.
   * iOS/Safari 자동 재생 정책을 처리합니다.
   * @returns {AudioContext}
   */
  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // 일시 중단된 컨텍스트 재개 (사용자 제스처 필요)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /**
   * 사운드 효과 재생
   * @param {'tick'|'shutter'} type - 사운드 종류
   */
  function playSound(type) {
    try {
      const ctx = getAudioContext();

      if (type === 'tick') {
        // 틱 사운드: 800Hz 사인파, 100ms, 빠른 페이드아웃
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, ctx.currentTime);

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.1);
      } else if (type === 'shutter') {
        // 셔터 사운드: 화이트 노이즈 버스트 + 밴드패스 필터, 150ms
        const bufferSize = ctx.sampleRate * 0.15;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);

        // 화이트 노이즈 생성
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        // 밴드패스 필터로 클릭 소리 느낌
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1000, ctx.currentTime);
        filter.Q.setValueAtTime(0.7, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(ctx.currentTime);
      }
    } catch (e) {
      // 오디오 재생 실패 시 조용히 무시
      console.warn('오디오 재생 실패:', e);
    }
  }


  // ============================================================
  // === COUNTDOWN MODULE (카운트다운 모듈) ===
  // ============================================================

  /**
   * 카운트다운 시작
   * @param {number} duration - 카운트다운 시간(초)
   * @param {Function} onComplete - 완료 시 콜백
   */
  function startCountdown(duration, onComplete) {
    const countdownEl = $('#countdown-number');
    if (!countdownEl) return;

    let remaining = duration;
    countdownEl.textContent = remaining;
    countdownEl.style.display = 'flex';
    countdownEl.classList.add('visible');

    // 카운트다운 색상 설정
    function updateCountdownColor(seconds) {
      if (seconds <= 1) {
        countdownEl.style.color = '#ff4444'; // 빨강
      } else if (seconds <= 2) {
        countdownEl.style.color = '#aa44ff'; // 보라
      } else if (seconds <= 3) {
        countdownEl.style.color = '#4488ff'; // 파랑
      } else {
        countdownEl.style.color = '#ffffff'; // 흰색
      }
    }

    updateCountdownColor(remaining);
    playSound('tick');

    // 팝 애니메이션 적용
    countdownEl.classList.remove('countdown-pop');
    void countdownEl.offsetWidth; // 리플로우 강제
    countdownEl.classList.add('countdown-pop');

    state.countdownTimer = setInterval(() => {
      remaining--;

      if (remaining > 0) {
        countdownEl.textContent = remaining;
        updateCountdownColor(remaining);
        playSound('tick');

        // 팝 애니메이션 재시작
        countdownEl.classList.remove('countdown-pop');
        void countdownEl.offsetWidth;
        countdownEl.classList.add('countdown-pop');
      } else {
        // 카운트다운 완료
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;

        countdownEl.style.display = 'none';
        countdownEl.classList.remove('visible', 'countdown-pop');

        // 플래시 효과 및 셔터 사운드
        triggerFlash();
        playSound('shutter');

        if (onComplete) {
          onComplete();
        }
      }
    }, 1000);
  }

  /**
   * 플래시 효과 (화면 깜빡임)
   */
  function triggerFlash() {
    const flash = $('#camera-flash');
    if (!flash) return;

    flash.classList.add('flash');
    setTimeout(() => {
      flash.classList.remove('flash');
    }, 350);
  }

  /**
   * 진행 중인 카운트다운 취소
   */
  function cancelCountdown() {
    if (state.countdownTimer) {
      clearInterval(state.countdownTimer);
      state.countdownTimer = null;
    }

    const countdownEl = $('#countdown-number');
    if (countdownEl) {
      countdownEl.style.display = 'none';
      countdownEl.classList.remove('visible', 'countdown-pop');
    }
  }


  // ============================================================
  // === FILTERS MODULE (필터 모듈) ===
  // ============================================================

  /**
   * 사용 가능한 이미지 필터 목록
   */
  const FILTERS = [
    { name: 'none', label: '원본', filterStr: 'none' },
    { name: 'bw', label: '흑백', filterStr: 'grayscale(100%)' },
    { name: 'soft', label: '부드러운', filterStr: 'brightness(110%) contrast(90%) saturate(90%)' },
    { name: 'vivid', label: '생기있는', filterStr: 'saturate(140%) contrast(110%)' },
    { name: 'vintage', label: '빈티지', filterStr: 'sepia(60%) contrast(110%) brightness(90%)' }
  ];

  /**
   * 필터 미리보기 썸네일을 생성하여 #filter-list에 렌더링합니다.
   * 첫 번째 촬영 사진의 축소판에 각 필터를 적용합니다.
   */
  async function renderFilterPreviews() {
    const container = $('#filter-list');
    if (!container) return;

    container.innerHTML = '';

    // 미리보기용 소스 이미지 (첫 번째 사진 또는 플레이스홀더)
    const sourceURL = state.photos[0] || null;

    for (const filter of FILTERS) {
      const item = createElement('div', 'filter-thumb');
      item.dataset.filter = filter.name;

      if (state.filter === filter.name) {
        item.classList.add('active');
      }

      // 배경명 라벨
      const label = createElement('span', 'filter-name', filter.label);

      if (sourceURL) {
        // 축소 썸네일 생성
        const thumbCanvas = document.createElement('canvas');
        const thumbSize = 80;
        thumbCanvas.width = thumbSize;
        thumbCanvas.height = thumbSize;

        const thumbCtx = thumbCanvas.getContext('2d');
        const img = await loadImage(sourceURL);

        // 정사각형 크롭 (중앙 기준)
        const cropSize = Math.min(img.width, img.height);
        const sx = (img.width - cropSize) / 2;
        const sy = (img.height - cropSize) / 2;

        // 필터 적용
        thumbCtx.filter = filter.filterStr;
        thumbCtx.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, thumbSize, thumbSize);
        thumbCtx.filter = 'none';

        const previewDiv = createElement('div', 'filter-preview');
        const thumbImg = createElement('img');
        thumbImg.src = thumbCanvas.toDataURL('image/jpeg', 0.7);
        thumbImg.alt = filter.label;
        previewDiv.appendChild(thumbImg);
        item.appendChild(previewDiv);
      } else {
        // 사진이 없으면 색상 플레이스홀더
        const placeholder = createElement('div', 'filter-preview');
        placeholder.style.background = filter.name === 'none' ? '#666' : '#888';
        item.appendChild(placeholder);
      }

      item.appendChild(label);

      // 필터 선택 이벤트
      item.addEventListener('click', () => {
        // 이전 활성 필터 비활성화
        $$('.filter-thumb.active', container).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        state.filter = filter.name;

        // 편집 캔버스 갱신
        renderEditCanvas();
      });

      container.appendChild(item);
    }
  }


  // ============================================================
  // === STICKERS MODULE (스티커 모듈) ===
  // ============================================================

  /**
   * 사용 가능한 스티커 이모지 목록
   */
  const STICKER_EMOJIS = [
    '❤️', '💕', '💖', '✨', '⭐', '🌟', '👑', '🎀',
    '🌸', '🌺', '🦋', '🌈', '😊', '😍', '🥰', '😎',
    '🎉', '🎊', '💫', '🔥', '💎', '🍀', '🌙', '☀️'
  ];

  /**
   * 스티커 팔레트를 #sticker-list에 렌더링합니다.
   */
  function renderStickerPalette() {
    const container = $('#sticker-list');
    if (!container) return;

    container.innerHTML = '';

    STICKER_EMOJIS.forEach(emoji => {
      const item = createElement('div', 'sticker-item');
      item.textContent = emoji;
      item.dataset.emoji = emoji;
      item.draggable = true;

      item.addEventListener('click', () => {
        // 배치 대기 모드 활성화
        state.pendingStickerEmoji = emoji;

        // 활성 상태 표시
        $$('.sticker-item.active', container).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      });

      // 더블 클릭 시 중앙에 자동 배치
      item.addEventListener('dblclick', () => {
        addSticker(emoji, 0.5, 0.5);
      });

      // 드래그 앤 드롭 시작
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('emoji', emoji);
      });

      container.appendChild(item);
    });
  }

  /**
   * 캔버스에 스티커를 추가합니다.
   * @param {string} emoji - 이모지 문자
   * @param {number} normX - 정규화된 X 좌표 (0-1)
   * @param {number} normY - 정규화된 Y 좌표 (0-1)
   */
  function addSticker(emoji, normX, normY) {
    state.stickers.push({
      id: state.stickerIdCounter++,
      emoji: emoji,
      x: normX,
      y: normY,
      size: 0.08,        // 캔버스 대비 상대 크기
      rotation: 0
    });
    renderEditCanvas();
  }

  /**
   * 지정된 스티커를 삭제합니다.
   * @param {number} index - 스티커 배열 인덱스
   */
  function removeSticker(index) {
    if (index >= 0 && index < state.stickers.length) {
      state.stickers.splice(index, 1);
      state.selectedSticker = null;
      renderEditCanvas();
    }
  }

  /**
   * 캔버스 좌표에서 스티커를 찾습니다. (히트 테스트)
   * @param {number} normX - 정규화된 X 좌표
   * @param {number} normY - 정규화된 Y 좌표
   * @returns {number} 찾은 스티커 인덱스 또는 -1
   */
  function findStickerAt(normX, normY) {
    // 역순으로 검색 (위에 있는 스티커 우선)
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const s = state.stickers[i];
      const halfSize = s.size / 2;
      if (normX >= s.x - halfSize && normX <= s.x + halfSize &&
          normY >= s.y - halfSize && normY <= s.y + halfSize) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 캔버스의 컨텍스트에 모든 스티커를 렌더링합니다.
   * @param {CanvasRenderingContext2D} ctx - 캔버스 컨텍스트
   * @param {Array} stickers - 스티커 배열
   * @param {number} canvasWidth - 캔버스 너비
   * @param {number} canvasHeight - 캔버스 높이
   * @param {boolean} [showControls=false] - 선택 UI 표시 여부
   */
  function renderStickersOnCanvas(ctx, stickers, canvasWidth, canvasHeight, showControls) {
    stickers.forEach((sticker, index) => {
      const x = sticker.x * canvasWidth;
      const y = sticker.y * canvasHeight;
      const fontSize = sticker.size * canvasWidth;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sticker.rotation * Math.PI / 180);

      // 이모지 그리기
      ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(sticker.emoji, 0, 0);

      // 선택된 스티커에 컨트롤 UI 표시
      if (showControls && index === state.selectedSticker) {
        const halfSize = fontSize / 2 + 4;

        // 선택 테두리
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2);
        ctx.setLineDash([]);

        // 삭제 버튼 (우상단)
        const btnSize = 20;
        const btnX = halfSize - btnSize / 2;
        const btnY = -halfSize - btnSize / 2;

        ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
        ctx.beginPath();
        ctx.arc(btnX + btnSize / 2, btnY + btnSize / 2, btnSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${btnSize * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', btnX + btnSize / 2, btnY + btnSize / 2);

        // 크기 조절 핸들 (우하단)
        ctx.fillStyle = 'rgba(100, 180, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  /**
   * 편집 캔버스에 터치/포인터 이벤트를 설정합니다.
   */
  function setupCanvasTouchEvents() {
    const canvas = $('#edit-canvas');
    if (!canvas) return;

    /**
     * 캔버스 내 정규화 좌표를 계산합니다.
     * @param {PointerEvent|TouchEvent} event
     * @returns {{normX: number, normY: number}}
     */
    function getCanvasCoords(event) {
      const rect = canvas.getBoundingClientRect();
      const clientX = event.touches ? event.touches[0].clientX : event.clientX;
      const clientY = event.touches ? event.touches[0].clientY : event.clientY;

      const normX = (clientX - rect.left) / rect.width;
      const normY = (clientY - rect.top) / rect.height;

      return { normX: clamp(normX, 0, 1), normY: clamp(normY, 0, 1) };
    }

    // 삭제 버튼 히트 테스트
    function isDeleteButtonHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const fontSize = s.size * canvasW;
      const halfSize = fontSize / 2 + 4;

      // 삭제 버튼은 스티커 우상단에 위치
      const btnCenterX = (s.x * canvasW + halfSize) / canvasW;
      const btnCenterY = (s.y * canvasH - halfSize) / canvasH;
      const btnRadius = 20 / canvasW;

      const dx = normX - btnCenterX;
      const dy = normY - btnCenterY;
      return Math.sqrt(dx * dx + dy * dy) < btnRadius * 2;
    }

    // 크기 조절 핸들 히트 테스트
    function isResizeHandleHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const fontSize = s.size * canvasW;
      const halfSize = fontSize / 2 + 4;

      const handleX = (s.x * canvasW + halfSize) / canvasW;
      const handleY = (s.y * canvasH + halfSize) / canvasH;
      const handleRadius = 12 / canvasW;

      const dx = normX - handleX;
      const dy = normY - handleY;
      return Math.sqrt(dx * dx + dy * dy) < handleRadius * 2;
    }

    let isResizing = false;
    let resizeStartDist = 0;
    let resizeStartSize = 0;

    // 포인터/터치 다운
    function handlePointerDown(e) {
      e.preventDefault();
      const { normX, normY } = getCanvasCoords(e);

      // 1. 선택된 스티커의 삭제 버튼 확인
      if (state.selectedSticker !== null && isDeleteButtonHit(state.selectedSticker, normX, normY)) {
        removeSticker(state.selectedSticker);
        return;
      }

      // 2. 선택된 스티커의 크기 조절 핸들 확인
      if (state.selectedSticker !== null && isResizeHandleHit(state.selectedSticker, normX, normY)) {
        isResizing = true;
        const s = state.stickers[state.selectedSticker];
        resizeStartDist = Math.sqrt(
          Math.pow(normX - s.x, 2) + Math.pow(normY - s.y, 2)
        );
        resizeStartSize = s.size;
        return;
      }

      // 3. 기존 스티커 선택 확인
      const hitIndex = findStickerAt(normX, normY);
      if (hitIndex >= 0) {
        state.selectedSticker = hitIndex;
        state.isDragging = true;

        const s = state.stickers[hitIndex];
        state.dragOffset.x = normX - s.x;
        state.dragOffset.y = normY - s.y;

        renderEditCanvas();
        return;
      }

      // 4. 대기 중인 스티커 배치
      if (state.pendingStickerEmoji) {
        addSticker(state.pendingStickerEmoji, normX, normY);
        state.pendingStickerEmoji = null;

        // 팔레트 활성 상태 해제
        $$('.sticker-item.active').forEach(el => el.classList.remove('active'));
        return;
      }

      // 5. 빈 영역 탭 → 스티커 선택 해제
      state.selectedSticker = null;
      renderEditCanvas();
    }

    // 포인터/터치 이동
    function handlePointerMove(e) {
      e.preventDefault();
      const { normX, normY } = getCanvasCoords(e);

      if (isResizing && state.selectedSticker !== null) {
        // 크기 조절
        const s = state.stickers[state.selectedSticker];
        const currentDist = Math.sqrt(
          Math.pow(normX - s.x, 2) + Math.pow(normY - s.y, 2)
        );
        const scale = currentDist / resizeStartDist;
        s.size = clamp(resizeStartSize * scale, 0.03, 0.25);
        renderEditCanvas();
        return;
      }

      if (state.isDragging && state.selectedSticker !== null) {
        // 스티커 드래그
        const s = state.stickers[state.selectedSticker];
        s.x = clamp(normX - state.dragOffset.x, 0.05, 0.95);
        s.y = clamp(normY - state.dragOffset.y, 0.05, 0.95);
        renderEditCanvas();
      }
    }

    // 포인터/터치 업
    function handlePointerUp(e) {
      state.isDragging = false;
      isResizing = false;
    }

    // 더블 탭으로 크기 순환 (작은 → 중간 → 큰)
    let lastTapTime = 0;
    function handleDoubleTap(e) {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        const { normX, normY } = getCanvasCoords(e);
        const hitIndex = findStickerAt(normX, normY);
        if (hitIndex >= 0) {
          const s = state.stickers[hitIndex];
          // 크기 순환: 0.06 → 0.1 → 0.15 → 0.06
          if (s.size < 0.08) s.size = 0.1;
          else if (s.size < 0.13) s.size = 0.15;
          else s.size = 0.06;

          state.selectedSticker = hitIndex;
          renderEditCanvas();
        }
      }
      lastTapTime = now;
    }

    // 이벤트 리스너 등록 (포인터 이벤트 우선, 폴백으로 터치 이벤트)
    canvas.addEventListener('pointerdown', handlePointerDown, { passive: false });
    canvas.addEventListener('pointermove', handlePointerMove, { passive: false });
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    canvas.addEventListener('click', handleDoubleTap);

    // 터치 이벤트 (포인터 이벤트 미지원 환경)
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    canvas.addEventListener('touchend', handlePointerUp);

    // HTML5 Drag and Drop 이벤트 (팔레트에서 캔버스로)
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault(); // 드롭 허용
    });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const emoji = e.dataTransfer.getData('emoji');
      if (emoji) {
        const { normX, normY } = getCanvasCoords(e);
        addSticker(emoji, normX, normY);
      }
    });
  }


  // ============================================================
  // === COMPOSER MODULE (합성 모듈) ===
  // ============================================================

  /**
   * 4장의 사진을 프레임과 함께 합성합니다.
   * @param {string[]} photos - 사진 Data URL 배열
   * @param {Object} frameConfig - 프레임 설정 {layout, color, style}
   * @param {string} filterName - 적용할 필터 이름
   * @param {Array} stickers - 스티커 배열
   * @returns {Promise<HTMLCanvasElement>} 합성된 캔버스
   */
  async function composeImage(photos, frameConfig, filterName, stickers) {
    const layout = CONFIG.layouts[frameConfig.layout] || CONFIG.layouts.strip;
    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    const ctx = canvas.getContext('2d');

    // 배경색 (프레임 색상)
    if (frameConfig.bg !== 'none' && state.bgImages && state.bgImages[frameConfig.bg]) {
      ctx.drawImage(state.bgImages[frameConfig.bg], 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = frameConfig.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 사진 위치 계산
    const positions = getPhotoPositions(frameConfig.layout, layout);
    const totalShots = getTotalShots();

    // 각 사진 그리기
    for (let i = 0; i < totalShots; i++) {
      if (i >= photos.length) break;

      const img = await loadImage(photos[i]);
      const pos = positions[i];

      ctx.save();

      // 필터 적용
      if (filterName !== 'none') {
        const filterObj = FILTERS.find(f => f.name === filterName);
        if (filterObj) ctx.filter = filterObj.filterStr;
      }

      // 사진을 슬롯에 맞게 그리기 (비율 유지하며 채우기)
      drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);
      ctx.filter = 'none';

      ctx.restore();
    }

    // 스티커 그리기
    if (stickers && stickers.length > 0) {
      renderStickersOnCanvas(ctx, stickers, canvas.width, canvas.height, false);
    }

    // 데코 이미지 그리기 (최상단)
    if (frameConfig.deco && frameConfig.deco !== 'none' && state.decoImages && state.decoImages[frameConfig.deco]) {
      ctx.drawImage(state.decoImages[frameConfig.deco], 0, 0, canvas.width, canvas.height);
    }

    // 날짜 워터마크
    drawDateWatermark(ctx, canvas.width, canvas.height, frameConfig.color);

    return canvas;
  }

  /**
   * 레이아웃에 따른 사진 위치 배열을 반환합니다.
   * @param {string} layoutName - 'strip' 또는 'grid'
   * @param {Object} layout - 레이아웃 설정 객체
   * @returns {Array<{x: number, y: number, width: number, height: number}>}
   */
  function getPhotoPositions(layoutName, layout) {
    const positions = [];
    const total = getTotalShots();

    if (layoutName === 'strip') {
      // 템플릿 적용 여부에 따라 슬롯 규격 동적 변경 (템플릿 1, 2는 800x2400 기준으로 제작되어 600x1800 캔버스에 0.75배 축소 서빙됨)
      let pw = layout.photoWidth;
      let ph = layout.photoHeight;
      let pad = layout.padding;
      let gap = layout.gap;

      if (state.frame.bg && state.frame.bg.startsWith('vert4_')) {
        pw = 540; // 720 * 0.75
        ph = 343; // 457 * 0.75
        pad = 33; // 44 * 0.75
        gap = 31; // 41 * 0.75
      }

      const startX = (layout.canvasWidth - pw) / 2;
      for (let i = 0; i < total; i++) {
        positions.push({
          x: startX,
          y: pad + i * (ph + gap),
          width: pw,
          height: ph
        });
      }
    } else if (layoutName === 'grid') {
      // 2×2 그리드 (가로 중앙 정렬)
      const totalWidth = layout.photoWidth * 2 + layout.gap;
      const startX = (layout.canvasWidth - totalWidth) / 2;
      for (let i = 0; i < total; i++) {
        const col = i % 2;
        const row = Math.floor(i / 2);
        positions.push({
          x: startX + col * (layout.photoWidth + layout.gap),
          y: layout.padding + row * (layout.photoHeight + layout.gap),
          width: layout.photoWidth,
          height: layout.photoHeight
        });
      }
    }

    return positions;
  }

  /**
   * 이미지를 영역에 맞게 채웁니다 (object-fit: cover 방식).
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLImageElement} img
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  function drawImageCover(ctx, img, x, y, w, h) {
    const imgRatio = img.width / img.height;
    const slotRatio = w / h;

    let sx, sy, sw, sh;

    if (imgRatio > slotRatio) {
      // 이미지가 더 넓음 → 좌우 잘림
      sh = img.height;
      sw = sh * slotRatio;
      sx = (img.width - sw) / 2;
      sy = 0;
    } else {
      // 이미지가 더 높음 → 상하 잘림
      sw = img.width;
      sh = sw / slotRatio;
      sx = 0;
      sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  /**
   * 둥근 사각형 경로를 그립니다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} r - 모서리 반지름
   */
  function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * 필름스트립 장식 (스프로켓 구멍)을 그립니다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - 캔버스 너비
   * @param {number} h - 캔버스 높이
   * @param {string} bgColor - 배경색
   */
  function drawFilmstripDecoration(ctx, w, h, bgColor) {
    const holeSize = 12;
    const holeGap = 30;
    const margin = 10;

    // 밝은 색 배경이면 어두운 구멍, 아니면 밝은 구멍
    const brightness = getColorBrightness(bgColor);
    ctx.fillStyle = brightness > 128 ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.2)';

    // 좌측 스프로켓 구멍
    for (let y = holeGap; y < h; y += holeGap) {
      drawRoundedRect(ctx, margin, y - holeSize / 2, holeSize, holeSize, 3);
      ctx.fill();
    }

    // 우측 스프로켓 구멍
    for (let y = holeGap; y < h; y += holeGap) {
      drawRoundedRect(ctx, w - margin - holeSize, y - holeSize / 2, holeSize, holeSize, 3);
      ctx.fill();
    }
  }

  /**
   * 색상의 밝기를 계산합니다.
   * @param {string} hexColor - 16진수 색상 문자열
   * @returns {number} 0-255
   */
  function getColorBrightness(hexColor) {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  /**
   * 날짜 워터마크를 그립니다.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - 캔버스 너비
   * @param {number} h - 캔버스 높이
   * @param {string} bgColor - 배경색 (텍스트 색상 결정용)
   */
  function drawDateWatermark(ctx, w, h, bgColor) {
    const date = getFormattedDate();
    const brightness = getColorBrightness(bgColor);
    const textColor = brightness > 128 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';

    ctx.fillStyle = textColor;
    ctx.font = '16px "Pretendard", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(date, w / 2, h - 15);
  }


  // ============================================================
  // === EDIT CANVAS RENDERER (편집 캔버스 렌더러) ===
  // ============================================================

  /**
   * 편집 화면의 합성 미리보기를 렌더링합니다.
   * 현재 프레임 설정, 필터, 스티커를 반영합니다.
   */
  async function renderEditCanvas() {
    const canvas = $('#edit-canvas');
    if (!canvas) return;

    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip;

    // 캔버스 크기 설정 (디스플레이 크기는 CSS로 제어)
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    const ctx = canvas.getContext('2d');

    // 1) 캔버스 배경 설정
    if (state.frame.bg !== 'none' && state.bgImages && state.bgImages[state.frame.bg]) {
      const bgImg = state.bgImages[state.frame.bg];
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = state.frame.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 사진 위치
    const positions = getPhotoPositions(state.frame.layout, layout);

    // 각 사진 그리기
    const totalShots = getTotalShots();
    for (let i = 0; i < totalShots; i++) {
      if (i >= state.photos.length) break;

      const img = await loadImage(state.photos[i]);
      const pos = positions[i];

      ctx.save();

      // 필터 적용
      if (state.filter !== 'none') {
        const filterObj = FILTERS.find(f => f.name === state.filter);
        if (filterObj) ctx.filter = filterObj.filterStr;
      }

      drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);
      ctx.filter = 'none'; // 필터 초기화

      if (state.frame.bg === 'none') {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
      }

      ctx.restore();
    }

    // 스티커 (선택 UI 포함)
    renderStickersOnCanvas(ctx, state.stickers, canvas.width, canvas.height, true);

    // 데코 이미지 그리기 (최상단)
    if (state.frame.deco !== 'none' && state.decoImages && state.decoImages[state.frame.deco]) {
      ctx.drawImage(state.decoImages[state.frame.deco], 0, 0, canvas.width, canvas.height);
    }

    // 날짜 워터마크
    drawDateWatermark(ctx, canvas.width, canvas.height, state.frame.color);
  }


  // ============================================================
  // === FRAME PREVIEW RENDERER (프레임 미리보기 렌더러) ===
  // ============================================================

  /**
   * 프레임 선택 화면의 미리보기를 렌더링합니다.
   * 사진이 없으므로 플레이스홀더 사각형을 표시합니다.
   */
  function renderFramePreview() {
    const canvas = $('#frame-preview');
    if (!canvas) return;

    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip;

    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    const ctx = canvas.getContext('2d');

    // 배경색
    if (state.frame.bg !== 'none' && state.bgImages && state.bgImages[state.frame.bg]) {
      ctx.drawImage(state.bgImages[state.frame.bg], 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = state.frame.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 사진 슬롯 위치
    const positions = getPhotoPositions(state.frame.layout, layout);

    // 플레이스홀더 사각형 그리기
    const brightness = getColorBrightness(state.frame.color);
    const placeholderColor = brightness > 128 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.15)';
    const textColor = brightness > 128 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)';

    positions.forEach((pos, index) => {
      ctx.save();

      // 플레이스홀더
      ctx.fillStyle = placeholderColor;
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);

      // 번호 텍스트
      ctx.fillStyle = textColor;
      ctx.font = 'bold 48px "Pretendard", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(index + 1), pos.x + pos.width / 2, pos.y + pos.height / 2);

      ctx.restore();
    });

    // 데코 이미지 그리기 (최상단)
    if (state.frame.deco !== 'none' && state.decoImages && state.decoImages[state.frame.deco]) {
      ctx.drawImage(state.decoImages[state.frame.deco], 0, 0, canvas.width, canvas.height);
    }

    // 날짜 워터마크
    drawDateWatermark(ctx, canvas.width, canvas.height, state.frame.color);
  }

  // 이미지 미리 로드
  async function preloadBackgrounds() {
    const bgs = [
      { key: 'bg1', path: 'assets/background_01.png' },
      { key: 'bg2', path: 'assets/background_02.png' },
      { key: 'bg3', path: 'assets/background_03.png' },
      { key: 'vert4_bg1', path: 'assets/vert4_template_background_01.png' },
      { key: 'vert4_bg2', path: 'assets/vert4_template_background_02.png' }
    ];
    
    const decos = [
      { key: 'vert4_deco1', path: 'assets/vert4_template_deco_01.png' },
      { key: 'vert4_deco2', path: 'assets/vert4_template_deco_02.png' }
    ];

    for (const bg of bgs) {
      try {
        const img = await loadImage(bg.path);
        state.bgImages[bg.key] = img;
      } catch (e) {
        console.warn('Failed to load bg', bg.path);
      }
    }

    for (const deco of decos) {
      try {
        const img = await loadImage(deco.path);
        state.decoImages[deco.key] = img;
      } catch (e) {
        console.warn('Failed to load deco', deco.path);
      }
    }
  }

  // 초기화 함수
  async function init() {
    await preloadBackgrounds();
  }


  // ============================================================
  // === EXPORT MODULE (내보내기 모듈) ===
  // ============================================================

  /**
   * 합성된 이미지를 파일로 다운로드합니다.
   * @param {HTMLCanvasElement} canvas - 합성 캔버스
   */
  function downloadImage(canvas) {
    if (!canvas) {
      console.error('다운로드할 캔버스가 없습니다.');
      return;
    }

    canvas.toBlob(function (blob) {
      if (!blob) {
        alert('이미지 생성에 실패했습니다.');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `life4cuts_${getTimestamp()}.png`;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();

      // 정리
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    }, 'image/png');
  }

  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    
    try {
      const dataURL = canvas.toDataURL('image/png', 0.9);
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL })
      });
      const data = await response.json();
      
      if (data.success) {
        state.hostedPageUrl = data.url;
        state.uploadedImageUrl = data.imageUrl;
        return true;
      }
      throw new Error(data.error || 'Upload failed');
    } catch (e) {
      console.error('업로드 실패:', e);
      return false;
    }
  }

  /**
   * QR 코드를 생성하여 컨테이너에 표시합니다.
   * 백엔드에 이미지를 업로드하고 호스팅된 URL을 QR 코드로 생성합니다.
   * @param {HTMLElement} container - QR 코드 표시 컨테이너
   * @param {HTMLCanvasElement} canvas - 합성 캔버스
   */
  async function generateQR(container, canvas) {
    if (!container) return;

    const qrContainer = $('#qr-code', container) || container;
    qrContainer.innerHTML = '<p style="color:#aaa;">업로드 중...</p>';

    try {
      const success = await uploadImageIfNeeded(canvas);
      qrContainer.innerHTML = ''; // Loading text clear
      
      if (success && state.hostedPageUrl) {
        if (typeof qrcode !== 'undefined') {
          const qr = qrcode(0, 'M');
          qr.addData(state.hostedPageUrl);
          qr.make();
          qrContainer.innerHTML = qr.createImgTag(4, 8);
          qrContainer.innerHTML += `<p style="font-size: 11px; margin-top: 10px; color: #888;">이 QR을 스캔하여 휴대폰에 사진을 저장하세요</p>`;
        } else {
          createQRFallback(qrContainer);
        }
      } else {
        createQRFallback(qrContainer);
      }
    } catch (error) {
      console.error('QR 코드 생성 실패:', error);
      qrContainer.innerHTML = '';
      createQRFallback(qrContainer);
    }
  }

  /**
   * 텍스트 메시지를 담은 QR 코드를 생성합니다. (더 이상 직접 메시지 인코딩 안함)
   */
  function createQRWithMessage(container) {
    createQRFallback(container);
  }

  /**
   * QR 라이브러리가 없을 때 대체 UI
   * @param {HTMLElement} container
   */
  function createQRFallback(container) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #888;">
        <p style="font-size: 14px; margin: 0;">QR 코드를 생성할 수 없습니다.</p>
        <p style="font-size: 12px; margin-top: 8px;">아래 다운로드 버튼을 이용해 주세요.</p>
      </div>
    `;
  }

  /**
   * 이메일 전송 처리
   */
  async function handleEmail() {
    const input = $('#email-input');
    if (!input) return;

    const email = input.value.trim();

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      alert('올바른 이메일 주소를 입력해 주세요.');
      return;
    }

    const btnSend = $('#btn-email-send');
    const originalText = btnSend.textContent;
    btnSend.textContent = '전송 중...';
    btnSend.disabled = true;

    try {
      // 이미지 업로드 선행
      const success = await uploadImageIfNeeded(state.composedCanvas);
      if (!success || !state.uploadedImageUrl) {
        throw new Error('이미지 업로드에 실패하여 이메일을 보낼 수 없습니다.');
      }

      // 서버로 이메일 전송 요청
      const response = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, imageUrl: state.uploadedImageUrl })
      });
      
      const data = await response.json();
      if (data.success) {
        let msg = '이메일이 성공적으로 전송되었습니다.';
        if (data.previewUrl) {
          msg += '\n(테스트 모드: Ethereal 로그에서 미리보기를 확인하세요)';
          console.log('Ethereal 이메일 미리보기 URL:', data.previewUrl);
        }
        alert(msg);
        
        // 패널 닫기
        const panel = $('#email-container');
        if (panel) panel.classList.add('hidden');
      } else {
        throw new Error(data.error || '이메일 전송 실패');
      }
    } catch (error) {
      console.error(error);
      alert(error.message || '오류가 발생했습니다.');
    } finally {
      btnSend.textContent = originalText;
      btnSend.disabled = false;
    }
  }


  // ============================================================
  // === SCREEN CONTROLLERS (화면 컨트롤러) ===
  // ============================================================

  /**
   * 시작 화면 초기화
   */
  function initStartScreen() {
    // 카메라 정지
    stopCamera();

    // 상태 초기화
    state.photos = [];
    state.currentShot = 0;
    state.filter = 'none';
    state.stickers = [];
    state.selectedSticker = null;
    state.pendingStickerEmoji = null;
    state.composedCanvas = null;
    state.stickerIdCounter = 0;
    state.uploadedImageUrl = null;
    state.hostedPageUrl = null;
  }

    function updateBgOptionsUI() {
    const container = $('#bg-options-list');
    if (!container) return;
    container.innerHTML = '';
    
    let options = [];
    if (state.frame.layout === 'strip') {
      options = [
        { label: '단색', bg: 'none', deco: 'none' },
        { label: '템플릿 1', bg: 'vert4_bg1', deco: 'vert4_deco1' },
        { label: '템플릿 2', bg: 'vert4_bg2', deco: 'vert4_deco2' }
      ];
    } else {
      options = [
        { label: '단색', bg: 'none', deco: 'none' },
        { label: '배경 1', bg: 'bg1', deco: 'none' },
        { label: '배경 2', bg: 'bg2', deco: 'none' },
        { label: '배경 3', bg: 'bg3', deco: 'none' }
      ];
    }

    options.forEach(opt => {
      const btn = createElement('button', 'frame-style-option');
      btn.textContent = opt.label;
      btn.dataset.bg = opt.bg;
      btn.dataset.deco = opt.deco;
      if (state.frame.bg === opt.bg) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        $$('.frame-style-option', container).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.frame.bg = opt.bg;
        state.frame.deco = opt.deco;
        renderFramePreview();
      });

      container.appendChild(btn);
    });
  }

  /**
   * 프레임 선택 화면 초기화
   */
  function initFrameScreen() {
    // 레이아웃 옵션 이벤트
    const layoutOptions = $$('.frame-layout-option[data-layout]');
    layoutOptions.forEach(option => {
      // 이전 리스너 제거를 위해 클론 교체
      const clone = option.cloneNode(true);
      option.parentNode.replaceChild(clone, option);

      clone.addEventListener('click', () => {
        layoutOptions.forEach(o => {
          const el = document.querySelector(`.frame-layout-option[data-layout="${o.dataset.layout}"]`);
          if (el) el.classList.remove('active');
        });
        clone.classList.add('active');
        state.frame.layout = clone.dataset.layout;
        state.frame.bg = 'none';
        state.frame.deco = 'none';
        updateBgOptionsUI();
        renderFramePreview();
      });

      // 현재 선택 상태 반영
      if (clone.dataset.layout === state.frame.layout) {
        clone.classList.add('active');
      }
    });

    // 색상 스와치 이벤트
    const colorSwatches = $$('.color-swatch[data-color]');
    colorSwatches.forEach(swatch => {
      const clone = swatch.cloneNode(true);
      swatch.parentNode.replaceChild(clone, swatch);

      clone.addEventListener('click', () => {
        $$('.color-swatch').forEach(s => s.classList.remove('active'));
        clone.classList.add('active');
        state.frame.color = clone.dataset.color;
        renderFramePreview();
      });

      if (clone.dataset.color === state.frame.color) {
        clone.classList.add('active');
      }
    });

    // 배경 선택 UI 빌드
    updateBgOptionsUI();

    // 초기 미리보기 렌더링
    renderFramePreview();
  }

  /**
   * 촬영 화면 초기화
   */
  async function initShootScreen() {
    // 상태 초기화
    state.currentShot = 0;
    state.photos = [];

    // 촬영 표시기 업데이트
    updateShotIndicator();

    // 사진 썸네일 초기화
    const thumbsContainer = $('#photo-thumbs');
    const totalShots = getTotalShots();
    
    if (thumbsContainer) {
      thumbsContainer.innerHTML = '';
      // 빈 썸네일 슬롯 생성
      for (let i = 0; i < totalShots; i++) {
        const slot = createElement('div', 'thumb-slot');
        slot.dataset.index = i;
        const num = createElement('span', 'thumb-number', String(i + 1));
        slot.appendChild(num);
        thumbsContainer.appendChild(slot);
      }
    }

    // 카메라 시작
    await initCamera();

    // 1초 후 첫 카운트다운 시작
    setTimeout(() => {
      if (state.currentScreen === 'shoot') {
        startShootingSequence();
      }
    }, 1000);
  }

  /**
   * 촬영 시퀀스: 카운트다운 → 캡처 → 다음 촬영 또는 완료
   */
  function startShootingSequence() {
    const totalShots = getTotalShots();
    
    if (state.currentShot >= totalShots) {
      // 모든 촬영 완료 → 1초 후 편집 화면으로 이동
      setTimeout(() => {
        showScreen('edit');
      }, 1000);
      return;
    }

    updateShotIndicator();

    startCountdown(CONFIG.countdown, () => {
      // 프레임 캡처
      const photoURL = captureFrame();
      if (photoURL) {
        state.photos.push(photoURL);
        showPhotoThumbnail(state.currentShot, photoURL);
      }

      state.currentShot++;
      updateShotIndicator();

      if (state.currentShot < totalShots) {
        // 2초 후 다음 촬영
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            startShootingSequence();
          }
        }, 2000);
      } else {
        // 모든 촬영 완료
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            showScreen('edit');
          }
        }, 1500);
      }
    });
  }

  /**
   * 촬영 표시기를 업데이트합니다.
   */
  function updateShotIndicator() {
    const indicator = $('#shot-indicator');
    const totalShots = getTotalShots();
    
    if (indicator) {
      const current = Math.min(state.currentShot + 1, totalShots);
      indicator.textContent = `${current} / ${totalShots}`;
    }
  }

  /**
   * 촬영된 사진의 썸네일을 표시합니다.
   * @param {number} index - 촬영 인덱스
   * @param {string} dataURL - 이미지 Data URL
   */
  function showPhotoThumbnail(index, dataURL) {
    const thumbsContainer = $('#photo-thumbs');
    if (!thumbsContainer) return;

    const slot = $(`.thumb-slot[data-index="${index}"]`, thumbsContainer);
    if (!slot) return;

    // 기존 번호 제거
    slot.innerHTML = '';

    // 썸네일 이미지 추가
    const img = createElement('img', 'thumb-img');
    img.src = dataURL;
    img.alt = `사진 ${index + 1}`;
    slot.appendChild(img);

    // 팝 애니메이션
    slot.classList.add('thumb-pop');
    setTimeout(() => slot.classList.remove('thumb-pop'), 500);
  }

  /**
   * 편집 화면 초기화
   */
  async function initEditScreen() {
    // 카메라 정지
    stopCamera();

    // 필터 초기화
    state.filter = 'none';
    state.stickers = [];
    state.selectedSticker = null;
    state.pendingStickerEmoji = null;

    // 합성 미리보기 렌더링
    await renderEditCanvas();

    // 필터 미리보기 렌더링
    await renderFilterPreviews();

    // 스티커 팔레트 렌더링
    renderStickerPalette();

    // 캔버스 터치 이벤트 설정
    setupCanvasTouchEvents();

    // 탭 전환 설정
    setupEditTabs();
  }

  /**
   * 편집 화면의 탭 전환을 설정합니다. (필터 / 스티커)
   */
  function setupEditTabs() {
    const tabBtns = $$('.tab-btn[data-tab]');
    tabBtns.forEach(btn => {
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);

      clone.addEventListener('click', () => {
        // 탭 버튼 활성 상태
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        clone.classList.add('active');

        const tab = clone.dataset.tab;

        // 탭 컨텐츠 전환
        const filterList = $('#filter-list');
        const stickerList = $('#sticker-list');

        if (filterList) {
          filterList.classList.toggle('active', tab === 'filters');
        }
        if (stickerList) {
          stickerList.classList.toggle('active', tab === 'stickers');
        }
      });
    });
  }

  /**
   * 결과 화면 초기화
   */
  async function initResultScreen() {
    const resultImg = $('#result-image');

    // 최종 합성 이미지 생성
    try {
      state.composedCanvas = await composeImage(
        state.photos,
        state.frame,
        state.filter,
        state.stickers
      );

      // 결과 이미지 표시
      if (resultImg && state.composedCanvas) {
        resultImg.src = state.composedCanvas.toDataURL('image/png');
        resultImg.alt = '인생네컷 결과 사진';
      }
    } catch (error) {
      console.error('이미지 합성 실패:', error);
      alert('이미지 합성 중 오류가 발생했습니다.');
    }

    // QR 및 이메일 패널 초기 숨김
    const qrContainer = $('#qr-container');
    const emailContainer = $('#email-container');
    if (qrContainer) qrContainer.classList.add('hidden');
    if (emailContainer) emailContainer.classList.add('hidden');
  }


  // ============================================================
  // === RETAKE HANDLING (재촬영 처리) ===
  // ============================================================

  /**
   * 마지막 촬영을 재촬영합니다.
   */
  function handleRetake() {
    // 촬영 상태 완전히 초기화 (처음부터 다시 찍기)
    state.currentShot = 0;
    state.photos = [];

    // 카운트다운 취소
    cancelCountdown();

    // 썸네일 컨테이너 빈 상태로 재구축
    const thumbsContainer = $('#photo-thumbs');
    const totalShots = getTotalShots();
    if (thumbsContainer) {
      thumbsContainer.innerHTML = '';
      for (let i = 0; i < totalShots; i++) {
        const slot = createElement('div', 'thumb-slot');
        slot.dataset.index = i;
        const num = createElement('span', 'thumb-number', String(i + 1));
        slot.appendChild(num);
        thumbsContainer.appendChild(slot);
      }
    }

    updateShotIndicator();

    // 0.5초 후 첫 촬영 시작
    setTimeout(() => {
      if (state.currentScreen === 'shoot') {
        startShootingSequence();
      }
    }, 500);
  }


  // ============================================================
  // === APP INITIALIZATION (앱 초기화) ===
  // ============================================================

  /**
   * 전체 상태를 기본값으로 초기화합니다.
   */
  function resetAll() {
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
    state.photos = [];
    state.currentShot = 0;
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
  }

  /**
   * DOMContentLoaded 이벤트 핸들러
   * 전역 이벤트 리스너를 설정하고 시작 화면을 표시합니다.
   */
  document.addEventListener('DOMContentLoaded', () => {

    // --- 전체 화면 시도 (첫 터치 시) ---
    let fullscreenAttempted = false;
    document.addEventListener('click', () => {
      if (fullscreenAttempted) return;
      fullscreenAttempted = true;

      const el = document.documentElement;
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => { /* 무시 */ });
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }

      // AudioContext 초기화 (사용자 제스처 필요)
      getAudioContext();
    }, { once: true });


    // --- 글로벌 버튼 이벤트 ---

    // 시작 버튼 → 프레임 선택 화면
    const btnStart = $('#btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => showScreen('frame'));
    }

    // 프레임 선택 완료 → 촬영 화면
    const btnFrameNext = $('#btn-frame-next');
    if (btnFrameNext) {
      btnFrameNext.addEventListener('click', () => showScreen('shoot'));
    }

    // 프레임 뒤로가기 → 시작 화면
    const btnFrameBack = $('#btn-frame-back');
    if (btnFrameBack) {
      btnFrameBack.addEventListener('click', () => showScreen('start'));
    }

    // 촬영 뒤로가기 → 프레임 선택 화면 (카메라 정지)
    const btnShootBack = $('#btn-shoot-back');
    if (btnShootBack) {
      btnShootBack.addEventListener('click', () => {
        cancelCountdown();
        stopCamera();
        showScreen('frame');
      });
    }

    // 재촬영 버튼 (처음부터 다시 찍기)
    const btnRetake = $('#btn-retake');
    if (btnRetake) {
      btnRetake.addEventListener('click', handleRetake);
    }

    // 편집 완료 → 결과 화면
    const btnEditDone = $('#btn-edit-done');
    if (btnEditDone) {
      btnEditDone.addEventListener('click', () => showScreen('result'));
    }

    // 편집 뒤로가기 → 촬영 화면 (처음부터 다시 찍기)
    const btnEditBack = $('#btn-edit-back');
    if (btnEditBack) {
      btnEditBack.addEventListener('click', () => {
        showScreen('shoot');
      });
    }

    // 다운로드 버튼
    const btnDownload = $('#btn-download');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => {
        downloadImage(state.composedCanvas);
      });
    }

    // QR 코드 버튼
    const btnQR = $('#btn-qr');
    if (btnQR) {
      btnQR.addEventListener('click', () => {
        const qrContainer = $('#qr-container');
        if (qrContainer) {
          qrContainer.classList.remove('hidden');
          generateQR(qrContainer, state.composedCanvas);
        }
      });
    }

    // 이메일 버튼
    const btnEmail = $('#btn-email');
    if (btnEmail) {
      btnEmail.addEventListener('click', () => {
        const emailContainer = $('#email-container');
        if (emailContainer) {
          emailContainer.classList.remove('hidden');
        }
      });
    }

    // 이메일 전송 버튼
    const btnEmailSend = $('#btn-email-send');
    if (btnEmailSend) {
      btnEmailSend.addEventListener('click', handleEmail);
    }

    // 결과 뒤로가기 → 편집 화면
    const btnResultBack = $('#btn-result-back');
    if (btnResultBack) {
      btnResultBack.addEventListener('click', () => {
        showScreen('edit');
      });
    }

    // 처음으로 버튼
    const btnRestart = $('#btn-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        resetAll();
        showScreen('start');
      });
    }

    // 닫기 버튼들 (QR/이메일 패널)
    $$('.btn-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.closest('#qr-container, #email-container');
        if (panel) {
          panel.classList.add('hidden');
        }
      });
    });


    // --- 시작 화면 표시 ---
    showScreen('start');

    // 배경 이미지 로드 등 초기화 실행
    init();

    console.log('✅ 인생네컷 포토부스 앱이 초기화되었습니다.');
  });

})();
