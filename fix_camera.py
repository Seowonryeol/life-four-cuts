"""
Fix initCamera with robust multi-step fallback for PC compatibility.
"""
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

OLD_INIT_CAMERA = '''  async function initCamera() {
    // navigator.mediaDevices 가 없는 경우 (HTTP에서 스마트폰/태블릿 접속 등)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = location.protocol === 'http:';
      const msg = isHttp
        ? '카메라를 사용하려면 HTTPS 연결이 필요합니다.\\n\\n' +
          'Wi-Fi 환경에서 같은 주소로 접속하거나,\\n' +
          'localhost.run 터널(https://)을 통해 접속해 주세요.'
        : '이 기기 또는 브라우저에서 카메라를 지원하지 않습니다.\\n카메라 접근 권한을 확인해 주세요.';
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
        constraints.video.facingMode = state.facingMode || 'user';
      }

      // 고해상도 제약 실패 시 최소 제약으로 재시도
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        const retryable = ['AbortError', 'NotReadableError', 'OverconstrainedError', 'TypeError'];
        if (retryable.includes(firstErr.name)) {
          console.warn('카메라 고해상도 요청 실패, 기본 설정으로 재시도:', firstErr.name);
          // facingMode 제거 후 최소 제약으로 재시도 (PC 웹캠 호환성)
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstErr;
        }
      }
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
        ? '카메라 접근이 거부되었거나 화면 오버레이(필터, 팝업 등)가 실행 중입니다.\\n설정에서 오버레이를 끄고 권한을 허용한 뒤 화면의 [다시 연결] 버튼을 눌러주세요.'
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
  }'''

NEW_INIT_CAMERA = '''  async function initCamera() {
    // navigator.mediaDevices 가 없는 경우 (HTTP에서 스마트폰/태블릿 접속 등)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = location.protocol === 'http:';
      const msg = isHttp
        ? '카메라를 사용하려면 HTTPS 연결이 필요합니다.\\n\\n' +
          'Wi-Fi 환경에서 같은 주소로 접속하거나,\\n' +
          'localhost.run 터널(https://)을 통해 접속해 주세요.'
        : '이 기기 또는 브라우저에서 카메라를 지원하지 않습니다.\\n카메라 접근 권한을 확인해 주세요.';
      alert(msg);
      return;
    }

    // 기존 스트림 정지 후 OS 해제 대기
    stopCamera();
    await new Promise(r => setTimeout(r, 300));

    // 모바일 여부 판단 (PC에서는 facingMode 사용 안 함)
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const facing = state.facingMode || 'user';

    // 시도할 constraints 목록 (우선순위 순)
    const constraintsList = [];
    if (state.selectedCameraId) {
      constraintsList.push({ video: { deviceId: { exact: state.selectedCameraId } }, audio: false });
      constraintsList.push({ video: { deviceId: state.selectedCameraId }, audio: false });
      constraintsList.push({ video: true, audio: false });
    } else if (isMobile) {
      constraintsList.push({ video: { width: CONFIG.camera.width, height: CONFIG.camera.height, facingMode: facing }, audio: false });
      constraintsList.push({ video: { facingMode: facing }, audio: false });
      constraintsList.push({ video: true, audio: false });
    } else {
      // PC: facingMode 없이 요청 (facingMode가 PC 웹캠에서 AbortError 유발)
      constraintsList.push({ video: { width: CONFIG.camera.width, height: CONFIG.camera.height }, audio: false });
      constraintsList.push({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      constraintsList.push({ video: true, audio: false });
    }

    let stream = null;
    let lastError = null;

    for (const constraints of constraintsList) {
      try {
        console.log('카메라 시도:', JSON.stringify(constraints.video));
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('카메라 성공');
        break;
      } catch (err) {
        console.warn('카메라 실패:', err.name, '-', err.message);
        lastError = err;
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') break;
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (!stream) {
      console.error('카메라 최종 실패:', lastError);
      const isNotAllowed = lastError && (lastError.name === 'NotAllowedError' || lastError.name === 'SecurityError');
      const isNotFound = lastError && (lastError.name === 'NotFoundError' || lastError.name === 'DevicesNotFoundError');
      let msg;
      if (isNotAllowed) {
        msg = '카메라 접근이 거부되었습니다.\\n브라우저 주소창 옆 🔒 아이콘 → 카메라 → 허용 후 새로고침해 주세요.';
      } else if (isNotFound) {
        msg = '카메라를 찾을 수 없습니다.\\n웹캠이 PC에 연결되어 있는지 확인해 주세요.';
      } else {
        const errName = lastError ? lastError.name : 'Unknown';
        msg = '카메라를 시작할 수 없습니다 (' + errName + ').\\n\\n' +
              'Zoom, OBS, 카카오톡 등 다른 프로그램이 카메라를 사용 중이라면\\n' +
              '종료 후 [다시 연결] 버튼을 눌러주세요.';
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
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.muted = true;
      try { await video.play(); } catch (e) { console.warn('autoplay 차단:', e.message); }
    }
    await populateCameraDevices();
  }'''

if OLD_INIT_CAMERA in js:
    js = js.replace(OLD_INIT_CAMERA, NEW_INIT_CAMERA)
    print('initCamera replaced successfully.')
else:
    print('ERROR: Could not find exact match for OLD_INIT_CAMERA.')
    # Debug: find where the function starts
    idx = js.find('async function initCamera()')
    print(f'initCamera found at index: {idx}')
    print(repr(js[idx:idx+200]))

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)
