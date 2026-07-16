"""
patch_v3.py - 4가지 기능 구현
1. 커스텀 템플릿 최종 사진 적용 버그 수정 (composeImage skipOverlay 제거 + custom bg 처리)
2. 세로 2x2 레이아웃 (grid22v) 추가
3. 카메라 좌우반전: 후면카메라 제외, 카메라 목록 통합
4. 버그/피드백 신고 모달 폼 추가 (FormSubmit)
"""
import re
import time

# ============================
# 1. Read files
# ============================
with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ============================
# 2. Fix 1: composeImage - 커스텀 템플릿 최종 적용 버그
# ============================
# drawBackground is called with skipOverlay=true, which skips custom templates
# Change to skipOverlay=false (or remove it) so bg image is drawn
old_bg_call = 'drawBackground(ctx, canvas.width, canvas.height, frameConfig.bg, frameConfig.color, true);'
new_bg_call  = 'drawBackground(ctx, canvas.width, canvas.height, frameConfig.bg, frameConfig.color, false);'
if old_bg_call in js:
    js = js.replace(old_bg_call, new_bg_call)
    print('[1] composeImage skipOverlay fixed.')
else:
    print('[1] WARN: could not find old_bg_call')

# Also ensure deco is applied after photos (it already is at line ~1441 - verify)
if "ctx.drawImage(state.decoImages[frameConfig.deco], 0, 0, canvas.width, canvas.height)" in js:
    print('[1] deco drawImage present in composeImage. OK.')
else:
    print('[1] WARN: deco drawImage missing from composeImage!')

# ============================
# 3. Fix 2: Add grid22v layout to CONFIG.layouts
# ============================
old_layouts_end = """      // 구형 호환
      strip: {
        canvasWidth:  1200,
        canvasHeight: 3600,
        photoWidth:   1080,
        photoHeight:  760,
        padding: 60,
        gap:     30,
        totalShots: 4
      }
    },"""

new_layouts_end = """      // 구형 호환
      strip: {
        canvasWidth:  1200,
        canvasHeight: 3600,
        photoWidth:   1080,
        photoHeight:  760,
        padding: 60,
        gap:     30,
        totalShots: 4
      },
      // 세로 2x2 (스마트폰 세로 사진 4장)
      grid22v: {
        canvasWidth:  1200,
        canvasHeight: 1600,
        photoWidth:   555,
        photoHeight:  710,
        padding: 45,
        gap:     30,
        totalShots: 4
      }
    },"""

if 'grid22v' not in js:
    if old_layouts_end in js:
        js = js.replace(old_layouts_end, new_layouts_end)
        print('[2] grid22v layout added to CONFIG.layouts.')
    else:
        print('[2] WARN: could not find layouts end block. Trying alternate match...')
        # Try simpler replace
        js = js.replace(
            '      // 구형 호환\n      strip:',
            '      // 세로 2x2 (스마트폰 세로 사진 4장)\n      grid22v: {\n        canvasWidth:  1200,\n        canvasHeight: 1600,\n        photoWidth:   555,\n        photoHeight:  710,\n        padding: 45,\n        gap:     30,\n        totalShots: 4\n      },\n      // 구형 호환\n      strip:'
        )
        print('[2] grid22v layout added (fallback method).')
else:
    print('[2] grid22v already exists.')

# Add getPhotoPositions case for grid22v
old_positions_end = """    if (layoutName === 'grid22') {
      // 2×2 격자 레이아웃
      const cols = 2;
      const rows = 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          if (idx >= total) break;
          positions.push({
            x: pad + c * (pw + gap),
            y: pad + r * (ph + gap),"""

if 'grid22v' not in js[js.find('function getPhotoPositions'):js.find('function getPhotoPositions')+2000]:
    # Find where getPhotoPositions handles grid22 and add grid22v after
    gpp_idx = js.find('function getPhotoPositions')
    gpp_end = js.find('\n  }', js.find('return positions;', gpp_idx)) + 4
    gpp_block = js[gpp_idx:gpp_end]
    
    # Add grid22v as alias for grid22
    new_gpp_block = gpp_block.replace(
        "if (layoutName === 'grid22') {",
        "if (layoutName === 'grid22' || layoutName === 'grid22v') {"
    )
    js = js[:gpp_idx] + new_gpp_block + js[gpp_end:]
    print('[2] grid22v added to getPhotoPositions.')
else:
    print('[2] grid22v already in getPhotoPositions.')

# Add grid22v to getTotalShots function
if "'grid22v'" not in js[js.find('function getTotalShots'):js.find('function getTotalShots')+500]:
    js = js.replace(
        "case 'grid22': return 4;",
        "case 'grid22': return 4;\n      case 'grid22v': return 4;"
    )
    print('[2] grid22v added to getTotalShots.')

# ============================
# 4. Fix 3: Camera - rear camera no flip, camera list simplification
# ============================

# 4a. captureFrame - only flip for front camera
old_capture = """    // 좌우 반전 (미러링) — 미리보기와 동일하게 보이도록
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);"""

new_capture = """    // 전면 카메라만 좌우 반전 (후면 카메라는 반전 없음)
    const activeTrack = state.cameraStream ? state.cameraStream.getVideoTracks()[0] : null;
    const trackSettings = activeTrack ? activeTrack.getSettings() : {};
    const isRearCamera = trackSettings.facingMode === 'environment';
    if (!isRearCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);"""

if 'isRearCamera' not in js:
    if old_capture in js:
        js = js.replace(old_capture, new_capture)
        print('[3] captureFrame mirror fixed (front-only).')
    else:
        print('[3] WARN: could not find old_capture block')
else:
    print('[3] captureFrame already has isRearCamera.')

# 4b. Also fix video preview CSS - only apply scaleX(-1) for front camera
# This is done in CSS typically via the class; we'll add logic to initCamera
# Find where video element gets its CSS transform (check index.html for camera-preview class)

# 4c. populateCameraDevices - group to front/rear only
old_populate = """      videoDevices.forEach((device, index) => {
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
      });"""

new_populate = """      // 전면/후면으로 그룹핑 (중복 제거)
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
      });"""

if 'grouped' not in js[js.find('function populateCameraDevices'):js.find('function populateCameraDevices')+2000]:
    if old_populate in js:
        js = js.replace(old_populate, new_populate)
        print('[3] populateCameraDevices simplified to front/rear.')
    else:
        print('[3] WARN: could not find old_populate block')
else:
    print('[3] populateCameraDevices already simplified.')

# Also fix video preview mirror: add class based on facing mode after camera starts
# Find where video.play() succeeds and add mirror class
old_video_play = "      try { await video.play(); } catch(e) { console.warn('autoplay blocked:', e.message); }"
new_video_play = """      try { await video.play(); } catch(e) { console.warn('autoplay blocked:', e.message); }
      // 전면 카메라만 좌우 반전 미리보기
      const _track = stream.getVideoTracks()[0];
      const _facing = _track ? (_track.getSettings().facingMode || '') : '';
      const _isRear = _facing === 'environment' || (!_facing && state.facingMode === 'environment');
      video.style.transform = _isRear ? 'scaleX(1)' : 'scaleX(-1)';"""

if 'video.style.transform = _isRear' not in js:
    if old_video_play in js:
        js = js.replace(old_video_play, new_video_play)
        print('[3] Video preview mirror fixed.')
    else:
        print('[3] WARN: could not find old_video_play')
else:
    print('[3] Video preview mirror already fixed.')

# ============================
# 5. Write app.js
# ============================
with open('app.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('app.js written.')

# ============================
# 6. Fix 2: Add grid22v to HTML layout selection
# ============================
# Find existing layout cards and add new one
grid22v_card = """              <div class="layout-card" data-layout="grid22v" role="button" tabindex="0" aria-pressed="false">
                <div class="layout-icon">📱</div>
                <div class="layout-name">세로 2×2</div>
                <div class="layout-desc">세로사진 4컷<br>2×2 격자</div>
              </div>"""

if 'grid22v' not in html:
    # Insert after grid22 card
    grid22_card_match = re.search(r'<div class="layout-card" data-layout="grid22".*?</div>\s*</div>\s*</div>', html, re.DOTALL)
    if grid22_card_match:
        insert_at = grid22_card_match.end()
        html = html[:insert_at] + '\n' + grid22v_card + html[insert_at:]
        print('[2] grid22v card added to HTML.')
    else:
        print('[2] WARN: could not find grid22 card in HTML')
else:
    print('[2] grid22v already in HTML.')

# ============================
# 7. Fix 4: Add feedback modal to HTML
# ============================
feedback_modal = """
  <!-- ===== 버그/피드백 신고 모달 ===== -->
  <div id="feedback-modal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.7); align-items:center; justify-content:center;">
    <div style="background:#161640; border:1px solid rgba(255,255,255,0.12); border-radius:20px; padding:32px; width:min(480px,90vw); max-height:90vh; overflow-y:auto; position:relative;">
      <button onclick="document.getElementById('feedback-modal').style.display='none';" style="position:absolute;top:14px;right:16px;background:none;border:none;color:#8888aa;font-size:22px;cursor:pointer;">✕</button>
      <h3 style="font-size:18px;font-weight:700;color:#f0f0ff;margin-bottom:20px;">🐞 버그 / 피드백 신고</h3>
      <form id="feedback-form" action="https://formsubmit.co/dnjsfuf123456@gmail.com" method="POST" target="_blank">
        <input type="hidden" name="_subject" value="[Life Four Cuts] 버그/피드백 신고">
        <input type="hidden" name="_captcha" value="false">
        <input type="hidden" name="_template" value="box">
        <div style="margin-bottom:14px;">
          <label style="font-size:13px;color:#8888aa;display:block;margin-bottom:6px;">유형 선택</label>
          <select name="type" required style="width:100%;padding:10px 12px;background:#0f0f2e;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#f0f0ff;font-size:14px;outline:none;">
            <option value="bug">🐞 버그 신고</option>
            <option value="feature">💡 기능 건의</option>
            <option value="other">💬 기타</option>
          </select>
        </div>
        <div style="margin-bottom:20px;">
          <label style="font-size:13px;color:#8888aa;display:block;margin-bottom:6px;">내용</label>
          <textarea name="message" required placeholder="버그 상황이나 건의 내용을 자세히 적어주세요..." rows="5" style="width:100%;padding:10px 12px;background:#0f0f2e;border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:#f0f0ff;font-size:14px;outline:none;resize:vertical;font-family:inherit;"></textarea>
        </div>
        <button type="submit" style="width:100%;padding:14px;background:linear-gradient(135deg,#00d4ff,#b44dff);border:none;border-radius:10px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;">📩 제출하기</button>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('feedback-form').addEventListener('submit', function() {
      setTimeout(function() {
        document.getElementById('feedback-modal').style.display = 'none';
      }, 500);
    });
  </script>"""

if 'feedback-modal' not in html:
    html = html.replace('</body>', feedback_modal + '\n</body>')
    print('[4] Feedback modal added to HTML.')
else:
    print('[4] Feedback modal already in HTML.')

# Add feedback button to result screen
feedback_btn = '<button class="btn-secondary" onclick="document.getElementById(\'feedback-modal\').style.display=\'flex\';" style="margin-top:8px;font-size:13px;opacity:0.8;">🐞 버그/피드백 신고</button>'

if 'feedback-modal' in html and 'btn-secondary" onclick="document.getElementById(\'feedback-modal\')' not in html:
    # Insert in action-buttons area of result screen
    result_action_match = re.search(r'(<div class="action-buttons"[^>]*>)', html)
    if result_action_match:
        insert_at = result_action_match.end()
        html = html[:insert_at] + '\n              ' + feedback_btn + html[insert_at:]
        print('[4] Feedback button added to action-buttons.')
    else:
        print('[4] WARN: could not find action-buttons in HTML')

# Cache busting
ts = int(time.time())
html = re.sub(r'app\.js\?v=\d+', f'app.js?v={ts}', html)
html = re.sub(r'style\.css\?v=\d+', f'style.css?v={ts}', html)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('index.html written.')
print('\nAll done!')
