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
        padding: 45,
        gap:     30,
        totalShots: 4
      },
      // 세로 2×2 (스마트폰 세로 사진 4장 - 3:4 portrait)
      grid22v: {
        canvasWidth:  1200,
        canvasHeight: 1600, // 4번 피드백 반영: 전체 길이 50px 확장
        photoWidth:   525,
        photoHeight:  700,
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
  };


  // ============================================================
  // === STATE (상태 관리) ===
  // ============================================================

  const state = {
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
  };

  function getTotalShots() {
    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip4;
    return layout.totalShots || 4;
  }

  function getLayoutConfig() {
    return CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip4;
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
      targetScreen.scrollTop = 0; // 새 화면으로 이동 시 스크롤 상단 리셋 (독립 뷰포트 보장)
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
      // 외부 도메인(Cloudinary 등) 이미지의 캔버스 합성 시 CORS 오염(Tainted Canvas) 에러 방지
      if (dataURL && (dataURL.startsWith('http://') || dataURL.startsWith('https://'))) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataURL;
    });
  }


  // ============================================================
  // === CAMERA MODULE (카메라 모듈) ===
  // ============================================================

  // ============================================================
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

  async function saveCustomTemplate(key, dataURL, name, layout) {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ key, dataURL, name, layout });
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
        const layout = state.frame.layout; // 현재 레이아웃 저장
        await saveCustomTemplate(key, dataURL, name, layout);
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

    // 기존 스트림이 남아있다면 정지 후 OS 해제 대기
    stopCamera();
    await new Promise(r => setTimeout(r, 300));

    // PC vs 모바일 구분 (facingMode는 PC 웹캠에서 AbortError 유발)
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 시도할 constraints 목록 (우선순위 순)
    const constraintCandidates = [];
    if (state.selectedCameraId) {
      constraintCandidates.push({ video: { deviceId: { exact: state.selectedCameraId } }, audio: false });
      constraintCandidates.push({ video: { deviceId: state.selectedCameraId }, audio: false });
    } else if (isMobile) {
      const facing = state.facingMode || 'user';
      constraintCandidates.push({ video: { width: CONFIG.camera.width, height: CONFIG.camera.height, facingMode: facing }, audio: false });
      constraintCandidates.push({ video: { facingMode: facing }, audio: false });
    } else {
      // PC: facingMode 없이 요청
      constraintCandidates.push({ video: { width: CONFIG.camera.width, height: CONFIG.camera.height }, audio: false });
      constraintCandidates.push({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    }
    // 최후 수단
    constraintCandidates.push({ video: true, audio: false });

    let stream = null;
    let lastError = null;
    for (const c of constraintCandidates) {
      try {
        console.log('[camera] trying:', JSON.stringify(c.video));
        stream = await navigator.mediaDevices.getUserMedia(c);
        break;
      } catch (e) {
        console.warn('[camera] failed:', e.name, e.message);
        lastError = e;
        if (e.name === 'NotAllowedError' || e.name === 'SecurityError') break;
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (!stream) {
      console.error('카메라 최종 실패:', lastError);
      const isNotAllowed = lastError && (lastError.name === 'NotAllowedError' || lastError.name === 'SecurityError');
      const isNotFound   = lastError && (lastError.name === 'NotFoundError'   || lastError.name === 'DevicesNotFoundError');
      let msg;
      if (isNotAllowed) {
        msg = '카메라 접근이 거부되었습니다.\n브라우저 주소창 옆 자물쇠 아이콘 → 카메라 → 허용 후 새로고침해 주세요.';
      } else if (isNotFound) {
        msg = '카메라를 찾을 수 없습니다.\n웹캠이 PC에 연결되어 있는지 확인해 주세요.';
      } else {
        const n = lastError ? lastError.name : 'Unknown';
        msg = '카메라를 시작할 수 없습니다 (' + n + ').\n\nZoom, OBS 등 다른 프로그램이 카메라를 점유 중이라면 종료 후 [다시 연결] 버튼을 눌러주세요.';
      }
      const container = document.querySelector('.camera-aspect-box');
      if (container) {
        let retryBtn = document.getElementById('btn-camera-retry');
        if (!retryBtn) {
          retryBtn = document.createElement('button');
          retryBtn.id = 'btn-camera-retry';
          retryBtn.className = 'btn-primary';
          retryBtn.innerText = '📸 카메라 다시 연결하기';
          retryBtn.style.cssText = 'position:absolute;z-index:100;top:50%;left:50%;transform:translate(-50%,-50%);';
          retryBtn.onclick = () => { retryBtn.remove(); initCamera(); };
          container.appendChild(retryBtn);
        }
      }
      alert(msg);
      return;
    }

    state.cameraStream = stream;
    const video = $('#camera-preview');
    if (video) {
      // playsinline 및 muted 속성을 스트림 연결 전에 먼저 세팅하여 iOS/Safari 블랙아웃 차단
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.muted = true;
      video.autoplay = true;

      // 스트림 연결
      video.srcObject = stream;

      // 비디오가 실제로 재생 시작했을 때 스케일링 설정
      video.onloadedmetadata = () => {
        const _track = stream.getVideoTracks()[0];
        const _facing = _track ? (_track.getSettings().facingMode || '') : '';
        const _isRear = _facing === 'environment' || (!_facing && state.facingMode === 'environment');
        video.style.transform = _isRear ? 'scaleX(1)' : 'scaleX(-1)';
      };

      // 안전 재생 호출 및 자동재생 차단 해제 fallback 설정
      video.load();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('카메라 비디오 자동 재생 차단됨. 다음 터치 시 재생 연동 설정:', error);
          const playOnTouch = () => {
            video.play();
            document.removeEventListener('touchstart', playOnTouch);
            document.removeEventListener('click', playOnTouch);
          };
          document.addEventListener('touchstart', playOnTouch);
          document.addEventListener('click', playOnTouch);
        });
      }
    }
    await populateCameraDevices();
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

      // 전면/후면으로 그룹핑 (중복 제거)
      const frontDevice = videoDevices.find(d =>
        d.label.toLowerCase().includes('front') || d.label.toLowerCase().includes('전면') || d.label.toLowerCase().includes('user')
      );
      const rearDevice = videoDevices.find(d =>
        d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('후면') || d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('rear')
      );

      const grouped = [];
      if (frontDevice) grouped.push({ device: frontDevice, label: '전면 카메라', facing: 'user' });
      if (rearDevice  && rearDevice.deviceId !== (frontDevice ? frontDevice.deviceId : '')) {
        grouped.push({ device: rearDevice, label: '후면 카메라', facing: 'environment' });
      }
      // 분류 안 된 경우 모두 포함
      if (grouped.length === 0) {
        videoDevices.forEach((d, i) => grouped.push({ device: d, label: d.label || `카메라 ${i+1}`, facing: null }));
      } else if (!frontDevice && !rearDevice) {
        videoDevices.forEach((d, i) => grouped.push({ device: d, label: d.label || `카메라 ${i+1}`, facing: null }));
      }

      grouped.forEach(({ device, label, facing }) => {
        const opt = document.createElement('option');
        opt.value = device.deviceId;
        opt.dataset.facing = facing || '';
        opt.innerText = label;
        if (state.selectedCameraId === device.deviceId) {
          opt.selected = true;
        } else if (!state.selectedCameraId) {
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

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // 기기 회전 각도 감지 (일부 안드로이드에서 스트림이 회전 미보정)
    let orientAngle = 0;
    if (window.screen && window.screen.orientation) {
      orientAngle = window.screen.orientation.angle || 0;
    } else if (typeof window.orientation !== 'undefined') {
      orientAngle = window.orientation;
    }
    // 90/270도 회전된 경우 캔버스 가로세로를 뒤집어 저장
    const rotated = (orientAngle === 90 || orientAngle === -90 || orientAngle === 270);

    const canvas = document.createElement('canvas');
    canvas.width  = rotated ? vh : vw;
    canvas.height = rotated ? vw : vh;

    const ctx = canvas.getContext('2d');

    const activeTrack = state.cameraStream ? state.cameraStream.getVideoTracks()[0] : null;
    const trackSettings = activeTrack ? activeTrack.getSettings() : {};
    const isRearCamera = trackSettings.facingMode === 'environment';

    ctx.save();
    if (rotated) {
      // 캔버스 중심으로 이동 후 회전
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((orientAngle * Math.PI) / 180);
      if (!isRearCamera) ctx.scale(-1, 1);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      if (!isRearCamera) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, vw, vh);
    }
    ctx.restore();

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
    state.instantShootCallback = null;

    const countdownEl = $('#countdown-number');
    if (countdownEl) {
      countdownEl.style.display = 'none';
      countdownEl.classList.remove('visible', 'countdown-pop');
    }

    const shootNowBtn = $('#btn-shoot-now');
    if (shootNowBtn) shootNowBtn.classList.add('hidden');
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

    // 배경 설정 (skipOverlay=true)
    drawBackground(ctx, canvas.width, canvas.height, frameConfig.bg, frameConfig.color, false);

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

      // 모든 사진 프레임별로 1px 검은색 테두리 및 3px 우측 하단 그림자 적용
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
      ctx.restore();

      ctx.restore();
    }

    // 데코 및 커스텀 템플릿 이미지 그리기 (사진 위, 스티커 아래)
    const composeBgKey = frameConfig.bg;
    if (composeBgKey && composeBgKey.startsWith('custom_') && state.bgImages && state.bgImages[composeBgKey]) {
      ctx.drawImage(state.bgImages[composeBgKey], 0, 0, canvas.width, canvas.height);
    }

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
    const total = layout.totalShots || getTotalShots();
    const pw = layout.photoWidth;
    const ph = layout.photoHeight;
    const pad = layout.padding;
    const gap = layout.gap;

    if (layoutName === 'grid22' || layoutName === 'grid22v') {
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

  // ============================================================
  // === BACKGROUND STYLES MODULE (배경 스타일 모듈) ===
  // ============================================================

  /**
   * 배경 스타일 정의 목록
   */
  const BG_STYLES = [
    { key: 'none',           label: 'ដើម\nSolid',         deco: 'none',  thumb: null },
    { key: 'gradient_pink',  label: 'ផ្កា\nPink Gradient', deco: 'none',  thumb: null },
    { key: 'gradient_blue',  label: 'ពណ៌ខៀវ\nBlue Gradient', deco: 'none',  thumb: null },
    { key: 'gradient_gold',  label: 'មាស\nGold Glam',     deco: 'none',  thumb: null },
    { key: 'film_noir',      label: 'ហ្វីល\nFilm Noir',   deco: 'none',  thumb: null },
    { key: 'pastel_bloom',   label: 'ផ្ការ\nPastel Bloom', deco: 'none',  thumb: null },
    { key: 'minimal_dots',   label: 'ចំណុច\nMinimal Dots', deco: 'none',  thumb: null },
    { key: 'vert4_bg1',      label: 'Template 1',          deco: 'vert4_deco1', thumb: null },
    { key: 'vert4_bg2',      label: 'Template 2',          deco: 'vert4_deco2', thumb: null }
  ];

  /**
   * 배경 스타일을 Canvas에 렌더링합니다.
   */
  function drawBackground(ctx, w, h, bgKey, solidColor, skipOverlay = false) {
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
      case 'vert4_bg1':
      case 'vert4_bg2':
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = solidColor || state.frame.color || '#ffffff';
        ctx.fillRect(0, 0, w, h);
        if (!skipOverlay && state.bgImages && state.bgImages[bgKey]) {
          ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
        }
        break;
      default:
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = solidColor || state.frame.color || '#000000';
        ctx.fillRect(0, 0, w, h);
        if (!skipOverlay) {
          if (bgKey && bgKey.startsWith('custom_') && state.bgImages && state.bgImages[bgKey]) {
            ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
          } else if (bgKey !== 'none' && state.bgImages && state.bgImages[bgKey]) {
            ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
          }
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
      // vert4_ 템플릿은 세로 네컷(strip4)에서만 표시
      if (state.frame.layout !== 'strip4' && style.key.startsWith('vert4_')) return;
      // strip4에서는 vert4_ 스타일과 기본 스타일(none 포함) 모두 표시
      
      const item = document.createElement('div');
      item.className = 'style-option-item' + (state.frame.bg === style.key ? ' active' : '');
      item.dataset.bg = style.key;

      // 썸네일 캔버스
      const thumb = document.createElement('canvas');
      thumb.width  = 60;
      thumb.height = 60;
      drawBackground(thumb.getContext('2d'), 60, 60, style.key, state.frame.color);

      const lbl = document.createElement('span');
      lbl.innerHTML = style.label.replace('\n', '<br>');

      item.appendChild(thumb);
      item.appendChild(lbl);
      item.addEventListener('click', () => {
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        state.frame.bg = style.key;
        state.frame.deco = style.deco || 'none';
        renderEditCanvas();
      });
      container.appendChild(item);
    });

    // 커스텀 템플릿들 (IndexedDB에서 로드, 현재 레이아웃 필터)
    loadCustomTemplatesFromDB().then(templates => {
      templates
        .filter(t => !t.layout || t.layout === state.frame.layout)
        .forEach(t => {
          addCustomTemplateOption(container, t);
        });
    });
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
    let textColor = '#000000';
    if (bgColor && bgColor.startsWith('#')) {
      const brightness = getColorBrightness(bgColor);
      textColor = brightness < 100 ? '#ffffff' : '#000000';
    }

    // 레이아웃 정보로 하단 여백 계산
    const layout = CONFIG.layouts[state.frame.layout] || CONFIG.layouts.strip;
    const positions = getPhotoPositions(state.frame.layout, layout);
    const lastPos = positions[positions.length - 1] || { y: 0, height: h * 0.8 };
    const photoBottom = lastPos.y + lastPos.height; // 마지막 사진 하단 px
    const bottomMargin = h - photoBottom;           // 여백 px

    // 텍스트 2줄이 들어갈 수 있는 최대 폰트 크기 계산
    const usable = bottomMargin - 12; // 상하 6px 마진만 확보
    if (usable < 20) return;          // 여백 부족 시 생략

    const maxFontSize = Math.floor(usable / 2.3);  // 텍스트 크기 비율 확대 (2.8 -> 2.3)
    const fontSize    = Math.min(maxFontSize, Math.round(w * 0.07)); // 최대 캔버스 너비의 7%

    if (fontSize < 14) return; // 너무 작으면 생략

    const brandSize = Math.round(fontSize * 1.1);
    const dateSize  = fontSize;
    const gap       = Math.round(fontSize * 0.3);
    const bottomPad = Math.round(fontSize * 0.15) + 6;

    ctx.save();
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // 날짜 텍스트 (맨 아래)
    ctx.font = `900 ${dateSize}px "Outfit", "Pretendard", sans-serif`;
    const dateY = h - bottomPad;
    ctx.fillText(date, w / 2, dateY);

    // 브랜드 텍스트 (날짜 위)
    ctx.font = `700 ${brandSize}px "Outfit", "Pretendard", sans-serif`;
    ctx.fillText('Life Four Cuts', w / 2, dateY - dateSize - gap);

    ctx.restore();
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

    // 1) 캔버스 배경 설정 (skipOverlay=true)
    drawBackground(ctx, canvas.width, canvas.height, state.frame.bg, state.frame.color, true);

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

      // 모든 사진 프레임별로 1px 검은색 테두리 및 3px 우측 하단 그림자 적용
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
      ctx.restore();

      ctx.restore();
    }

    // 오버레이 템플릿 덧그리기 (사진 위)
    const bgKey = state.frame.bg;
    if (bgKey === 'vert4_bg1' || bgKey === 'vert4_bg2' || (bgKey && bgKey.startsWith('custom_'))) {
      if (state.bgImages && state.bgImages[bgKey]) {
        ctx.drawImage(state.bgImages[bgKey], 0, 0, canvas.width, canvas.height);
      }
    }
    // 기존 데코 이미지 그리기 (사진 위, 스티커 아래)
    if (state.frame.deco !== 'none' && state.decoImages && state.decoImages[state.frame.deco]) {
      ctx.drawImage(state.decoImages[state.frame.deco], 0, 0, canvas.width, canvas.height);
    }

    // 스티커 (선택 UI 포함, 최상단)
    renderStickersOnCanvas(ctx, state.stickers, canvas.width, canvas.height, true);

    // 날짜 워터마크
    const watermarkToggle = document.getElementById('toggle-watermark');
    if (!watermarkToggle || watermarkToggle.checked) {
      drawDateWatermark(ctx, canvas.width, canvas.height, state.frame.color);
    }
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
    const watermarkToggle = document.getElementById('toggle-watermark');
    if (!watermarkToggle || watermarkToggle.checked) {
      drawDateWatermark(ctx, canvas.width, canvas.height, state.frame.color);
    }
  }

  // 이미지 미리 로드
  async function preloadBackgrounds() {
    
    const decos = [
      { key: 'vert4_deco1', path: 'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784012757/vert4_template_deco_01_scqvmr.png' },
      { key: 'vert4_deco2', path: 'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008121/vert4_template_deco_02_gxvmmn.png' }
    ];


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
    if (state.frame.layout === 'strip4') {
      options = [
        { label: 'Solid<br>단색', bg: 'none', deco: 'none' },
        { label: 'Template 1', bg: 'vert4_bg1', deco: 'vert4_deco1' },
        { label: 'Template 2', bg: 'vert4_bg2', deco: 'vert4_deco2' }
      ];
    } else {
      options = [
        { label: 'Solid<br>단색', bg: 'none', deco: 'none' },
        { label: 'Pink Gradient', bg: 'gradient_pink', deco: 'none' },
        { label: 'Blue Gradient', bg: 'gradient_blue', deco: 'none' },
        { label: 'Gold Glam', bg: 'gradient_gold', deco: 'none' },
        { label: 'Film Noir', bg: 'film_noir', deco: 'none' },
        { label: 'Pastel Bloom', bg: 'pastel_bloom', deco: 'none' },
        { label: 'Minimal Dots', bg: 'minimal_dots', deco: 'none' }
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
  }

  /**
   * 촬영 화면 초기화
   */
  async function initShootScreen() {
    // 상태 초기화
    state.adjustments = { brightness: 50, saturation: 50, contrast: 50 };

    // 레이아웃별 카메라 영역 비율 설정 (3번 피드백 반영)
    const aspectBox = document.querySelector('.camera-aspect-box');
    if (aspectBox) {
      if (state.frame.layout === 'grid22v') {
        aspectBox.style.aspectRatio = '3 / 4';
        aspectBox.style.width = 'auto';
        aspectBox.style.height = '100%';
        aspectBox.style.maxHeight = '72vh'; // 모바일 화면에서 잘리지 않도록 안전 높이 설정
      } else if (state.frame.layout === 'grid22') {
        aspectBox.style.aspectRatio = '1 / 1';
        aspectBox.style.width = 'auto';
        aspectBox.style.height = '100%';
        aspectBox.style.maxHeight = '72vh';
      } else {
        aspectBox.style.aspectRatio = '540 / 380';
        aspectBox.style.width = '100%';
        aspectBox.style.height = 'auto';
        aspectBox.style.maxHeight = '100%';
      }
    }
    state.currentShot = 0;
    state.retakeIndex = -1;
    state.photos = [];
    state.loadedPhotos = [];
    state.shootingStarted = false;
    state.instantShootCallback = null;

    // 썸네일 컨테이너 초기 빈 상태로 채우기
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

    // Next 버튼 숨기기
    const nextBtn = document.getElementById('btn-shoot-next');
    if (nextBtn) nextBtn.classList.add('hidden');
    
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
  }

  /**
   * 촬영 시퀀스: 카운트다운 → 캡처 → 다음 촬영 또는 완료
   */
  function startShootingSequence() {
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

        // 5번 피드백 반영: 재촬영된 뒤 바로 다음 페이지로 넘어가지 않고 다음 버튼을 보여줍니다.
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            showRetakeTooltip();
            const nextBtn = document.getElementById('btn-shoot-next');
            if (nextBtn) {
              nextBtn.classList.remove('hidden');
              nextBtn.onclick = () => showScreen('edit');
            }
          }
        }, 1200);
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
        // 촬영 완료 → 재촬영 말풍선 및 Next 버튼 표시
        setTimeout(() => {
          if (state.currentScreen === 'shoot') {
            showRetakeTooltip();
            const nextBtn = document.getElementById('btn-shoot-next');
            if (nextBtn) {
              nextBtn.classList.remove('hidden');
              nextBtn.onclick = () => showScreen('edit');
            }
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
  }

  /**
   * 촬영 표시기를 업데이트합니다.
   */
  function updateShotIndicator(overrideShot) {
    const currentEl = document.querySelector('.shot-current');
    const totalEl   = document.querySelector('.shot-total');
    const totalShots = getTotalShots();

    const current = overrideShot !== undefined
      ? overrideShot
      : Math.min(state.currentShot + 1, totalShots);

    if (currentEl) currentEl.textContent = current;
    if (totalEl) totalEl.textContent = ` / ${totalShots}`;
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
    
    // 일반 촬영과 재촬영(retake) 분기 업데이트
    if (index >= state.photos.length) {
      state.photos.push(dataURL);
      const imgObj = new Image();
      imgObj.src = dataURL;
      state.loadedPhotos.push(imgObj);
    } else {
      state.photos[index] = dataURL;
      const imgObj = new Image();
      imgObj.src = dataURL;
      state.loadedPhotos[index] = imgObj;
    }

    // 썸네일 슬롯 이미지 갱신
    const slot = document.querySelector(`.thumb-slot[data-index="${index}"]`);
    if (slot) {
      slot.classList.add('active');
      const oldImg = slot.querySelector('img');
      if (oldImg) oldImg.remove();
      const img = createElement('img');
      img.src = dataURL;
      slot.appendChild(img);
    }

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

    // 배경 스타일 옵션 렌더링
    renderBgOptions();

    // 커스텀 템플릿 업로드 설정
    setupCustomTemplateUpload();

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
        state.frame.bg = 'none'; // ADDED: clear background image
        // Update bg UI to remove active state
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        const noneOption = document.querySelector('.style-option-item[data-bg="none"]');
        if (noneOption) noneOption.classList.add('active');
        renderEditCanvas();
      });

      if (clone.dataset.color === state.frame.color) {
        clone.classList.add('active');
      }
    });

    // RGB 커스텀 색상 피커 이벤트
    const colorCustomEl = document.getElementById('color-custom');
    if (colorCustomEl) {
      colorCustomEl.addEventListener('input', (e) => {
        state.frame.color = e.target.value;
        state.frame.bg = 'none';
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        const noneOpt = document.querySelector('.style-option-item[data-bg="none"]');
        if (noneOpt) noneOpt.classList.add('active');
        renderEditCanvas();
      });
    }

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
    // let fullscreenAttempted = false; removed
    document.addEventListener('click', () => {
      if (fullscreenAttempted) return;
      // fullscreenAttempted = true; removed

      const el = document.documentElement;
      // Fullscreen auto-transition removed per user request.

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
      btnFrameBack.addEventListener('click', () => {
        resetAll();
        showScreen('start');
      });
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

    // 썸네일 클릭 → 해당 슬롯만 재촬영
    const thumbsContainer = $('#photo-thumbs');
    if (thumbsContainer) {
      thumbsContainer.addEventListener('click', (e) => {
        const slot = e.target.closest('.thumb-slot');
        if (!slot) return;
        const idx = parseInt(slot.dataset.index, 10);
        if (isNaN(idx)) return;
        // 해당 슬롯에 사진이 있을 때만 재촬영 가능
        if (idx >= state.photos.length) return;
        // 이미 카운트다운 중이면 무시
        if (state.countdownTimer) return;
        state.retakeIndex = idx;
        cancelCountdown();
        // 0.3초 후 해당 슬롯만 재촬영 시작
        setTimeout(() => {
          if (state.currentScreen === 'shoot') startShootingSequence();
        }, 300);
      });
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
