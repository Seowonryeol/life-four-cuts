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
  };


  // ============================================================
  // === STATE (상태 관리) ===
  // ============================================================

  const state = {
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
    // navigator.mediaDevices 가 없는 경우 (HTTP에서 스마트폰/태블릿 접속 등)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = location.protocol === 'http:';
      const msg = isHttp
        ? '카메라를 사용하려면 HTTPS 연결이 필요합니다.\n\n' +
          'Wi-Fi 환경에서 같은 주소로 접속하거나,\n' +
          'localhost.run 터널(https://)을 통해 접속해 주세요.'
        : '이 기기 또는 브라우저에서 카메라를 지원하지 않습니다.\n카메라 접근 권한을 확인해 주세요.';
      alert(msg);
      return;
    }

    // 기존 스트림이 남아있다면 정지
    stopCamera();

    try {
      const constraints = {
        video: {
          width:      CONFIG.camera.width,
          height:     CONFIG.camera.height
        },
        audio: false
      };

      if (state.selectedCameraId) {
        constraints.video.deviceId = { exact: state.selectedCameraId };
      } else {
        constraints.video.facingMode = CONFIG.camera.facingMode;
      }

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

      // 카메라 디바이스 목록 갱신
      await populateCameraDevices();
    } catch (error) {
      console.error('카메라 초기화 실패:', error);
      const isNotAllowed = error.name === 'NotAllowedError' || error.name === 'SecurityError';
      const msg = isNotAllowed
        ? '카메라 접근이 거부되었거나 화면 오버레이(필터, 팝업 등)가 실행 중입니다.\n설정에서 오버레이를 끄고 권한을 허용한 뒤 화면의 [다시 연결] 버튼을 눌러주세요.'
        : '카메라를 초기화할 수 없습니다. 권한을 확인해주세요.';
      
      const container = document.querySelector('.camera-aspect-box');
      if (container) {
        let retryBtn = document.getElementById('btn-camera-retry');
        if (!retryBtn) {
          retryBtn = document.createElement('button');
          retryBtn.id = 'btn-camera-retry';
          retryBtn.className = 'btn-primary';
          retryBtn.innerText = '📸 카메라 다시 연결하기';
          retryBtn.style.position = 'absolute';
          retryBtn.style.zIndex = '100';
          retryBtn.onclick = () => {
            retryBtn.remove();
            initCamera();
          };
          container.appendChild(retryBtn);
        }
      }
      alert(msg);
    }
  }

  /**
   * 사용 가능한 카메라 장치 목록을 가져와 드롭다운에 채웁니다.
   */
  async function populateCameraDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return;
      }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      const select = $('#camera-select');
      if (!select) return;

      select.innerHTML = '';

      if (videoDevices.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.innerText = '카메라 없음';
        select.appendChild(opt);
        return;
      }

      videoDevices.forEach((device, index) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.innerText = device.label || `카메라 ${index + 1}`;
        if (state.selectedCameraId === device.deviceId) {
          opt.selected = true;
        } else if (!state.selectedCameraId) {
          // 현재 활성화된 스트림의 장치 ID와 비교
          const activeTrack = state.cameraStream ? state.cameraStream.getVideoTracks()[0] : null;
          if (activeTrack && activeTrack.getSettings().deviceId === device.deviceId) {
            opt.selected = true;
          }
        }
        select.appendChild(opt);
      });
    } catch (err) {
      console.error('카메라 디바이스 목록 로드 실패:', err);
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

        gainNode.gain.setValueAtTime(0.8, ctx.currentTime);
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
        gainNode.gain.setValueAtTime(1.2, ctx.currentTime);
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
    { name: 'none',    label: 'ដើម<br>Original',    filterStr: 'none' },
    { name: 'bw',      label: 'ស&ខ្មៅ<br>B&W',    filterStr: 'grayscale(100%)' },
    { name: 'soft',    label: 'ទន់<br>Soft', filterStr: 'brightness(115%) contrast(85%) saturate(80%)' },
    { name: 'vivid',   label: 'រស់រវើក<br>Vivid',  filterStr: 'saturate(150%) contrast(115%) brightness(105%)' },
    { name: 'vintage', label: 'បុរាណ<br>Vintage',  filterStr: 'sepia(55%) contrast(108%) brightness(92%)' },
    { name: 'cool',    label: 'ត្រជាក់<br>Cool',    filterStr: 'hue-rotate(20deg) saturate(110%) brightness(105%)' },
    { name: 'warm',    label: 'កក់ក្តៅ<br>Warm',    filterStr: 'hue-rotate(-15deg) saturate(120%) brightness(108%)' },
    { name: 'film',    label: 'ហ្វីល<br>Film',    filterStr: 'contrast(95%) brightness(90%) saturate(110%) sepia(20%)' },
    { name: 'fade',    label: 'រសាត់<br>Fade',  filterStr: 'brightness(120%) contrast(85%) saturate(70%) opacity(90%)' },
    { name: 'neon',    label: 'ណេអុង<br>Neon',    filterStr: 'saturate(200%) contrast(130%) brightness(90%) hue-rotate(10deg)' }
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
      const label = createElement('span', 'filter-name');
      label.innerHTML = filter.label;

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
   * 스티커 카테고리 목록
   */
  const STICKER_CATEGORIES = [
    {
      label: '하트 & 사랑',
      emojis: ['❤️','💕','💖','💗','💓','💞','💘','💝','💟','🥰','🥳','🤗']
    },
    {
      label: '사진 & 구도시',
      emojis: ['📸','🎥','💋','🥳','🎉','🎊','🎈','🎂','🎆','🎇','✨','💫']
    },
    {
      label: '폴 & 자연',
      emojis: ['🌸','🌹','🌺','🌻','🌼','🌷','🌶️','🌽','🦄','🦴','🌈','🌙']
    },
    {
      label: '표정 & 캐릭터',
      emojis: ['😊','😄','😘','😗','🤗','🤩','😎','🥳','😱','🤪','🙏','👌']
    },
    {
      label: '서신 & 킹',
      emojis: ['☆','🌟','💫','🍌','💎','👑','🎠','🎄','🔮','🎀','🦄','🌈']
    },
    {
      label: '터치 & 프레임',
      emojis: ['💌','🎁','🧡','☀️','🌚','🗑️','🍜','☕','🎧','🍓','🍒','🍎']
    }
  ];

  // Flat list for backward compat
  const STICKER_EMOJIS = STICKER_CATEGORIES.flatMap(c => c.emojis);

  /**
   * 스티커 팔레트를 #sticker-list에 렌더링합니다.
   */
  function renderStickerPalette() {
    const container = $('#sticker-list');
    if (!container) return;

    container.innerHTML = '';

    STICKER_CATEGORIES.forEach(category => {
      // Category label
      const label = createElement('div', 'sticker-category-label');
      label.textContent = category.label;
      container.appendChild(label);

      // Sticker items in this category
      category.emojis.forEach(emoji => {
        const item = createElement('div', 'sticker-item');
        item.textContent = emoji;
        item.dataset.emoji = emoji;
        item.draggable = true;
        item.title = '더블클릭: 중앙 배치 / 클릭: 마우스 배치 모드';

        // Single click → activate "place on click" mode + cursor follower
        item.addEventListener('click', (e) => {
          e.stopPropagation();

          if (state.pendingStickerEmoji === emoji) {
            // 같은 스티커 재클릭 → 취소
            state.pendingStickerEmoji = null;
            $$('.sticker-item.active', container).forEach(el => el.classList.remove('active'));
            hideStickerCursor();
          } else {
            state.pendingStickerEmoji = emoji;
            $$('.sticker-item.active', container).forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            showStickerCursor(emoji);
          }
        });

        // Double click → directly add to canvas center
        item.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          e.preventDefault();

          // Clear pending mode
          state.pendingStickerEmoji = null;
          $$('.sticker-item.active', container).forEach(el => el.classList.remove('active'));
          hideStickerCursor();

          addSticker(emoji, 0.5, 0.5);

          // Visual feedback
          item.style.transform = 'scale(0.8)';
          setTimeout(() => { item.style.transform = ''; }, 250);
        });

        // Drag start for drag-and-drop onto canvas
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('emoji', emoji);
          state.pendingStickerEmoji = null;
          hideStickerCursor();
          $$('.sticker-item.active', container).forEach(el => el.classList.remove('active'));
        });

        container.appendChild(item);
      });
    });
  }

  /**
   * 마우스 커서 팔로어 표시
   */
  function showStickerCursor(emoji) {
    const cursor = $('#sticker-cursor');
    if (!cursor) return;
    cursor.textContent = emoji;
    cursor.classList.add('visible');
  }

  /**
   * 마우스 커서 팔로어 숨기기
   */
  function hideStickerCursor() {
    const cursor = $('#sticker-cursor');
    if (!cursor) return;
    cursor.classList.remove('visible');
    cursor.textContent = '';
  }

  /**
   * 마우스 이동 시 커서 팔로어 위치 업데이트
   */
  document.addEventListener('mousemove', (e) => {
    const cursor = $('#sticker-cursor');
    if (!cursor || !cursor.classList.contains('visible')) return;
    cursor.style.left = e.clientX + 'px';
    cursor.style.top  = e.clientY + 'px';
  });

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
      size: 216.3 / $('#edit-canvas').width,        // 가로 58px 크기로 삽입
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
      ctx.rotate((sticker.rotation || 0) * Math.PI / 180);

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
        const btnSize = 80;
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

        // 크기 조절 핸들 3개 (우하단, 좌하단, 좌상단)
        ctx.fillStyle = 'rgba(100, 180, 255, 0.9)';
        const handlePositions = [
          { x: halfSize, y: halfSize },   // 우하단 (BR)
          { x: -halfSize, y: halfSize },  // 좌하단 (BL)
          { x: -halfSize, y: -halfSize }  // 좌상단 (TL)
        ];
        handlePositions.forEach(pos => {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 32, 0, Math.PI * 2);
          ctx.fill();
        });


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

    // ─────────────────────────────────────────────────────────────
    // 렌더링과 동일한 좌표계로 히트 테스트:
    //   renderStickersOnCanvas 는 ctx.translate(x*cW, y*cH) 후
    //   삭제버튼 중심 = (halfSize,        -halfSize)
    //   리사이즈핸들 = (halfSize,          halfSize)
    //   모두 norm 좌표로 변환해서 비교합니다.
    // ─────────────────────────────────────────────────────────────



    function isDeleteButtonHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const fontSize = s.size * canvasW;
      const halfSize = fontSize / 2 + 4;   // px
      const btnR     = 40;                  // px — 원 반지름

      const btnCxPx = s.x * canvasW + halfSize;   // 우상단
      const btnCyPx = s.y * canvasH - halfSize;

      const btnCxN = btnCxPx / canvasW;
      const btnCyN = btnCyPx / canvasH;
      const hitR   = (btnR + 8) / canvasW;  

      const dx = normX - btnCxN;
      const dy = normY - btnCyN;
      return Math.sqrt(dx * dx + dy * dy) < hitR;
    }

    function isResizeHandleHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const fontSize = s.size * canvasW;
      const halfSize = fontSize / 2 + 4;
      const handleR  = 32;
      const hitR = (handleR + 12) / canvasW;

      const handlePositions = [
        { x: halfSize, y: halfSize },   // 우하단
        { x: -halfSize, y: halfSize },  // 좌하단
        { x: -halfSize, y: -halfSize }  // 좌상단
      ];

      for (let pos of handlePositions) {
        const hxPx = s.x * canvasW + pos.x;
        const hyPx = s.y * canvasH + pos.y;
        const hxN  = hxPx / canvasW;
        const hyN  = hyPx / canvasH;
        const dx = normX - hxN;
        const dy = normY - hyN;
        if (Math.sqrt(dx * dx + dy * dy) < hitR) return true;
      }
      return false;
    }
    


    let isResizing = false;
      
    
    let resizeStartDist = 0;
    let resizeStartSize = 0;

    // 포인터/터치 다운
    function handlePointerDown(e) {
      e.preventDefault();
      const { normX, normY } = getCanvasCoords(e);

      // 3. 기존 스티커 선택 확인 (드래그 우선 여부 확인)
      const hitIndex = findStickerAt(normX, normY);

      // 1. 선택된 스티커의 삭제 버튼 확인 (중심과 너무 가까우면 무시하여 드래그 우선)
      if (state.selectedSticker !== null && isDeleteButtonHit(state.selectedSticker, normX, normY)) {
        const s = state.stickers[state.selectedSticker];
        const distToCenter = Math.sqrt(Math.pow(normX - s.x, 2) + Math.pow(normY - s.y, 2));
        const minDragDist = (s.size * 0.3); // 중심에 너무 가까우면 삭제 무시
        
        if (distToCenter > minDragDist || hitIndex !== state.selectedSticker) {
          removeSticker(state.selectedSticker);
          return;
        }
      }

      // 2. 선택된 스티커의 크기 조절 핸들 확인
      if (state.selectedSticker !== null && isResizeHandleHit(state.selectedSticker, normX, normY)) {
        isResizing = true;
        const s = state.stickers[state.selectedSticker];
        const rect = canvas.getBoundingClientRect();
        const pixelDx = (normX - s.x) * rect.width;
        const pixelDy = (normY - s.y) * rect.height;
        resizeStartDist = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
        if (resizeStartDist < 0.001) resizeStartDist = 0.001; // 0 나누기 방지
        resizeStartSize = s.size;
        return;
      }

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
        const placed = state.pendingStickerEmoji;
        state.pendingStickerEmoji = null;

        // 팔레트 활성 상태 해제 & 커서 팔로어 숨기기
        $$('.sticker-item.active').forEach(el => el.classList.remove('active'));
        hideStickerCursor();
        canvas.style.cursor = 'crosshair';
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
        // 크기 조절: 스티커 중심(s.x, s.y)에서 현재 포인터까지의 픽셀 거리 계산
        const s = state.stickers[state.selectedSticker];
        const rect = canvas.getBoundingClientRect();
        const pixelDx = (normX - s.x) * rect.width;
        const pixelDy = (normY - s.y) * rect.height;
        const currentDist = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
        
        const scale = currentDist / resizeStartDist;
        s.size = clamp(resizeStartSize * scale, 0.03, 0.80);
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

    // 더블클릭/더블탭: 스티커 크기 순환
    function handleDoubleTap(e) {
      e.preventDefault();
      const { normX, normY } = getCanvasCoords(e);
      const hitIndex = findStickerAt(normX, normY);
      if (hitIndex >= 0) {
        const s = state.stickers[hitIndex];
        // 크기 순환: 소 → 중 → 대 → 소
        if (s.size < 0.08) s.size = 0.12;
        else if (s.size < 0.15) s.size = 0.2;
        else s.size = 0.06;

        state.selectedSticker = hitIndex;
        renderEditCanvas();
      }
    }


    // ── 이벤트 리스너 등록 (Pointer Events API — mouse + touch 통합) ──
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId); // 부드러운 드래그를 위해 캡처
      handlePointerDown(e);
    }, { passive: false });

    canvas.addEventListener('pointermove', (e) => {
      // 스티커 배치 대기 중 커서 변경
      if (state.pendingStickerEmoji) {
        canvas.style.cursor = 'copy';
      } else {
        const { normX, normY } = getCanvasCoords(e);
        const hit = findStickerAt(normX, normY);
        canvas.style.cursor = hit >= 0 ? 'grab' : 'crosshair';
      }
      handlePointerMove(e);
    }, { passive: false });

    canvas.addEventListener('pointerup',     handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);

    // 더블클릭: 스티커 크기 순환
    canvas.addEventListener('dblclick', handleDoubleTap);

    // HTML5 Drag and Drop (팔레트 → 캔버스)
    canvas.addEventListener('dragover', (e) => { e.preventDefault(); });

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
      if (i >= state.loadedPhotos.length) break;

      const img = state.loadedPhotos[i];
      if (!img.complete) {
        await new Promise(res => { img.onload = res; });
      }
      const pos = positions[i];

      ctx.save();

      // 필터 및 조정 적용
      let filterStr = '';
      if (filterName !== 'none') {
        const filterObj = FILTERS.find(f => f.name === filterName);
        if (filterObj) filterStr += filterObj.filterStr + ' ';
      }
      const b = (state.adjustments.brightness / 50) * 100;
      const s = (state.adjustments.saturation / 50) * 100;
      const c = (state.adjustments.contrast / 50) * 100;
      filterStr += `brightness(${b}%) saturate(${s}%) contrast(${c}%)`;
      ctx.filter = filterStr.trim();

      // 사진을 슬롯에 맞게 그리기 (비율 유지하며 채우기)
      drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);
      ctx.filter = 'none';

      // 'Solid' 또는 'Template 2' 인 경우 10px 검은색 테두리 추가
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
      }

      ctx.restore();
    }

    // 데코 이미지 그리기 (사진 위, 스티커 아래)
    if (frameConfig.deco && frameConfig.deco !== 'none' && state.decoImages && state.decoImages[frameConfig.deco]) {
      ctx.drawImage(state.decoImages[frameConfig.deco], 0, 0, canvas.width, canvas.height);
    }

    // 스티커 그리기 (최상단)
    if (stickers && stickers.length > 0) {
      renderStickersOnCanvas(ctx, stickers, canvas.width, canvas.height, false);
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
    const textColor = '#000000'; // 강제 검은색

    ctx.fillStyle = textColor;
    ctx.font = '900 70px "Outfit", "Pretendard", sans-serif';
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
      if (i >= state.loadedPhotos.length) break;

      const img = state.loadedPhotos[i];
      if (!img.complete) {
        await new Promise(res => { img.onload = res; });
      }
      const pos = positions[i];

      ctx.save();

      // 필터 및 조정 적용
      let filterStr = '';
      if (state.filter !== 'none') {
        const filterObj = FILTERS.find(f => f.name === state.filter);
        if (filterObj) filterStr += filterObj.filterStr + ' ';
      }
      const b = (state.adjustments.brightness / 50) * 100;
      const s = (state.adjustments.saturation / 50) * 100;
      const c = (state.adjustments.contrast / 50) * 100;
      filterStr += `brightness(${b}%) saturate(${s}%) contrast(${c}%)`;
      ctx.filter = filterStr.trim();

      drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);
      ctx.filter = 'none'; // 필터 초기화

      // 'Solid' 또는 'Template 2' 인 경우 10px 테두리 추가
      if (state.frame.bg === 'none' || state.frame.bg === 'vert4_bg2') {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
        ctx.restore();
      }

      ctx.restore();
    }

    // 데코 이미지 그리기 (사진 위, 스티커 아래)
    if (state.frame.deco !== 'none' && state.decoImages && state.decoImages[state.frame.deco]) {
      ctx.drawImage(state.decoImages[state.frame.deco], 0, 0, canvas.width, canvas.height);
    }

    // 스티커 (선택 UI 포함, 최상단)
    renderStickersOnCanvas(ctx, state.stickers, canvas.width, canvas.height, true);

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

    positions.forEach((pos, index) => {
      ctx.save();

      // 사진 칸 플레이스홀더
      ctx.fillStyle = '#e8e8ea';
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);

      // 아이콘 및 텍스트
      ctx.fillStyle = '#a0a0ab';
      ctx.font = '72px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', pos.x + pos.width / 2, pos.y + pos.height / 2 - 40);
      
      ctx.font = 'bold 36px "Pretendard", sans-serif';
      ctx.fillText(`Sample Photo ${index + 1}`, pos.x + pos.width / 2, pos.y + pos.height / 2 + 50);

      // 'Solid' 또는 'Template 2' 인 경우 5px 테두리 추가
      if (state.frame.bg === 'none' || state.frame.bg === 'vert4_bg2') {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
        ctx.restore();
      }

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
    try { state.sampleImage = await loadImage('./assets/sample.png'); } catch(e) {}
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
        alert('បរាជ័យក្នុងការបង្កើតរូបភាព។ / Failed to create image.');
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
      const dataURL = canvas.toDataURL('image/jpeg', 0.90);
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataURL,
          clientBaseUrl: window.location.origin
        })
      });
      const data = await response.json();
      if (data.success) {
        state.hostedPageUrl = data.url;
        state.uploadedImageUrl = data.imageUrl;
        return true;
      } else {
        console.error('업로드 실패:', data.error);
        return false;
      }
    } catch (e) {
      console.error('에러:', e);
      return false;
    }
  }
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
          qrContainer.innerHTML += `<p style="font-size: 14px; margin-top: 10px; color: #888;">ស្កេន QR នេះដើម្បីរក្សាទុករូបថតទៅទូរស័ព្ទរបស់អ្នក<br>Scan this QR to save the photo to your phone</p>`;
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
      alert('សូមបញ្ចូលអាសយដ្ឋានអ៊ីមែលដែលត្រឹមត្រូវ។ / Please enter a valid email address.');
      return;
    }

    const btnSend = $('#btn-email-send');
    const originalText = btnSend.innerHTML;
    btnSend.innerHTML = 'កំពុងផ្ញើ...<br><span style="font-size: 0.7em;">Sending...</span>';
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
        headers: { 
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true'
        },
        body: JSON.stringify({ email, imageUrl: state.uploadedImageUrl })
      });
      
      const data = await response.json();
      if (data.success) {
        let msg = 'អ៊ីមែលត្រូវបានផ្ញើ! / Email sent successfully!';
        if (data.previewUrl) {
          msg += '\n(Test mode: Check Ethereal logs for preview)';
          console.log('Ethereal Email Preview URL:', data.previewUrl);
        }
        alert(msg);
        
        // 패널 닫기
        const panel = $('#email-container');
        if (panel) panel.classList.add('hidden');
      } else {
        throw new Error(data.error || 'បរាជ័យក្នុងការផ្ញើអ៊ីមែល។ / Failed to send email.');
      }
    } catch (error) {
      console.error(error);
      alert(error.message || 'មានកំហុសមួយបានកើតឡើង។ / An error occurred.');
    } finally {
      btnSend.innerHTML = originalText;
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
    state.loadedPhotos = [];
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
        { label: 'ពណ៌រឹង<br>Solid', bg: 'none', deco: 'none' },
        { label: 'គំរូទី១<br>Template 1', bg: 'vert4_bg1', deco: 'vert4_deco1' },
        { label: 'គំរូទី២<br>Template 2', bg: 'vert4_bg2', deco: 'vert4_deco2' }
      ];
    } else {
      options = [
        { label: 'ពណ៌រឹង<br>Solid', bg: 'none', deco: 'none' },
        { label: 'ផ្ទៃខាងក្រោយ១<br>Background 1', bg: 'bg1', deco: 'none' },
        { label: 'ផ្ទៃខាងក្រោយ២<br>Background 2', bg: 'bg2', deco: 'none' },
        { label: 'ផ្ទៃខាងក្រោយ៣<br>Background 3', bg: 'bg3', deco: 'none' }
      ];
    }

    options.forEach(opt => {
      const btn = createElement('button', 'frame-style-option');
      btn.innerHTML = opt.label;
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
        
        if (state.currentScreen === 'edit') {
          renderEditCanvas();
        } else {
          renderFramePreview();
        }
      });

      container.appendChild(btn);
    });
  }

  /**
   * 프레임 선택 화면 초기화 (이제 레이아웃만 선택)
   */
  function initFrameScreen() {
    // 세로 4컷 고정 – 레이아웃 선택 없음
    state.frame.layout = 'strip';

    // 진입 시 초기 미리보기 렌더링
    renderFramePreview();
  }

  /**
   * 촬영 화면 초기화
   */
  async function initShootScreen() {
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
  }

  /**
   * 촬영 시퀀스: 카운트다운 → 캡처 → 다음 촬영 또는 완료
   */
  function startShootingSequence() {
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
  /**
   * 실시간 촬영 현황 프레임 캔버스를 렌더링합니다.
   * @param {number} limitIndex - 이 인덱스 미만의 사진들만 캔버스에 그립니다. (애니메이션 완료 전 슬롯 비워두기용)
   */
  function renderShootPreviewCanvas(limitIndex = state.photos.length) {
    const canvas = $('#shoot-preview-canvas');
    if (!canvas) return;

    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip;
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    const ctx = canvas.getContext('2d');

    // 기본 배경색 채우기
    ctx.fillStyle = '#222233';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const positions = getPhotoPositions(state.frame.layout, layout);
    const totalShots = getTotalShots();

    positions.forEach((pos, index) => {
      ctx.save();
      
      if (index < limitIndex && index < state.loadedPhotos.length) {
        // 촬영된 사진 그리기
        const img = state.loadedPhotos[index];
        if (img.complete) {
          ctx.save();
          drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);
          ctx.restore();
        } else {
          // 로드 완료되지 않았을 경우를 위한 콜백 (일반적으로 Data URL이므로 즉시 완료됨)
          img.onload = () => {
            ctx.save();
            drawImageCover(ctx, img, pos.x, pos.y, pos.width, pos.height);
            ctx.restore();
          };
        }
      } else {
        // 촬영 전 빈 슬롯 (플레이스홀더)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(pos.x, pos.y, pos.width, pos.height);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.font = 'bold 48px "Pretendard", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), pos.x + pos.width / 2, pos.y + pos.height / 2);
      }
      
      ctx.restore();
    });
  }

  /**
   * 사진 촬영 시 카메라 영역에서 우측 레이아웃 프레임의 빈 슬롯으로 날아가는 애니메이션을 실행합니다.
   */
  function animatePhotoToSidebar(index, dataURL) {
    const cameraPreview = $('#camera-preview');
    const canvas = $('#shoot-preview-canvas');
    
    // 데이터 즉시 등록 및 기존 사진들만 먼저 렌더링 (현재 촬영 컷은 빈 슬롯 상태 유지)
    state.photos.push(dataURL);
    
    // 깜빡임 방지용 이미지 캐싱
    const imgObj = new Image();
    imgObj.src = dataURL;
    state.loadedPhotos.push(imgObj);

    renderShootPreviewCanvas(state.photos.length - 1);

    if (!cameraPreview || !canvas) {
      // 요소를 찾지 못한 경우 애니메이션 없이 즉시 최종 렌더링
      renderShootPreviewCanvas();
      return;
    }

    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip;
    const positions = getPhotoPositions(state.frame.layout, layout);
    const pos = positions[index];

    // 뷰포트 기준 좌표 및 크기 계산
    const camRect = cameraPreview.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const scaleX = canvasRect.width / canvas.width;
    const scaleY = canvasRect.height / canvas.height;

    const targetLeft = canvasRect.left + pos.x * scaleX;
    const targetTop = canvasRect.top + pos.y * scaleY;
    const targetWidth = pos.width * scaleX;
    const targetHeight = pos.height * scaleY;

    // 날아가는 이미지 생성
    const flyer = document.createElement('img');
    flyer.src = dataURL;
    flyer.style.position = 'fixed';
    flyer.style.zIndex = '9999';
    flyer.style.left = camRect.left + 'px';
    flyer.style.top = camRect.top + 'px';
    flyer.style.width = camRect.width + 'px';
    flyer.style.height = camRect.height + 'px';
    flyer.style.objectFit = 'cover';
    flyer.style.borderRadius = '12px';
    flyer.style.boxShadow = '0 12px 35px rgba(0, 0, 0, 0.6)';
    flyer.style.transition = 'all 0.9s cubic-bezier(0.25, 1, 0.5, 1)';
    flyer.style.opacity = '1';
    
    // 카메라 영상은 좌우반전 상태이므로 시작점에서도 좌우반전 적용
    flyer.style.transform = 'scaleX(-1) rotate(0deg)';

    document.body.appendChild(flyer);

    // Reflow
    void flyer.offsetWidth;

    // 목표 위치로 애니메이션 적용 (날아가면서 원래 방향으로 회전하며 축소)
    flyer.style.left = targetLeft + 'px';
    flyer.style.top = targetTop + 'px';
    flyer.style.width = targetWidth + 'px';
    flyer.style.height = targetHeight + 'px';
    flyer.style.transform = 'scaleX(1) rotate(360deg)';
    flyer.style.borderRadius = '4px';
    flyer.style.opacity = '0.95';

    flyer.addEventListener('transitionend', () => {
      // 애니메이션 끝나면 캔버스에 영구 렌더링하고 비행 이미지 제거
      renderShootPreviewCanvas();
      flyer.remove();
    });
  }

  /**
   * 편집 화면 초기화
   */
  async function initEditScreen() {
    // 카메라 끄기
    stopCamera();

    // 우측 패널 스크롤 초기화
    const editControls = document.querySelector('.edit-controls');
    if (editControls) {
      editControls.scrollTop = 0;
    }

    // 필터 및 기타 상태 초기화
    state.filter = 'none';
    state.stickers = [];
    state.selectedSticker = null;
    state.pendingStickerEmoji = null;
    state.isDragging = false;
    hideStickerCursor();

    const stickerHint = $('#sticker-hint');
    if (stickerHint) stickerHint.style.display = 'block';

    // 조정 슬라이더 이벤트 설정
    const adjSliders = ['brightness', 'saturation', 'contrast'];
    adjSliders.forEach(type => {
      const slider = $(`#adj-${type}`);
      if (slider) {
        slider.value = state.adjustments[type];
        slider.addEventListener('input', (e) => {
          state.adjustments[type] = parseInt(e.target.value, 10);
          requestAnimationFrame(renderEditCanvas);
        });
      }
    });

    // 프레임 색상 스와치 이벤트 설정
    const colorSwatches = $$('.color-swatch[data-color]');
    colorSwatches.forEach(swatch => {
      const clone = swatch.cloneNode(true);
      swatch.parentNode.replaceChild(clone, swatch);

      clone.addEventListener('click', () => {
        $$('.color-swatch').forEach(s => s.classList.remove('active'));
        clone.classList.add('active');
        state.frame.color = clone.dataset.color;
        renderEditCanvas();
      });

      if (clone.dataset.color === state.frame.color) {
        clone.classList.add('active');
      }
    });

    // 배경 선택 UI 빌드 및 동적 템플릿 바인딩
    updateBgOptionsUI();

    // 합성 미리보기 렌더링
    await renderEditCanvas();

    // 필터 미리보기 렌더링
    await renderFilterPreviews();

    // 스티커 팔레트 렌더링
    renderStickerPalette();

    // 캔버스 터치 이벤트 설정
    setupCanvasTouchEvents();
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
    const select = $('#camera-select');
    if (select) select.disabled = false;

    // 촬영 상태 완전히 초기화 (처음부터 다시 찍기)
    state.currentShot = 0;
    state.photos = [];
    state.loadedPhotos = [];

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
  }

  /**
   * DOMContentLoaded 이벤트 핸들러
   * 전역 이벤트 리스너를 설정하고 시작 화면을 표시합니다.
   */
  document.addEventListener('DOMContentLoaded', () => {

    // --- 앱 복귀 시 카메라 권한/스트림 복구 ---
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.currentScreen === 'shoot') {
        if (!state.cameraStream || !state.cameraStream.active) {
          console.log('앱으로 복귀: 카메라를 다시 시작합니다.');
          initCamera();
        }
      }
    });

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

    // 카메라 선택 이벤트 등록
    const cameraSelect = $('#camera-select');
    if (cameraSelect) {
      cameraSelect.addEventListener('change', async (e) => {
        const deviceId = e.target.value;
        if (!deviceId) return;
        state.selectedCameraId = deviceId;
        console.log('카메라 변경 시도:', deviceId);
        await initCamera();
      });
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
        hideStickerCursor();
        state.pendingStickerEmoji = null;
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
