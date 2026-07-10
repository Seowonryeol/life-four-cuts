import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Revert composeImage to draw at 1200x3600, then scale to 400x1200 at the end
old_compose_top = '''    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth / 3;
    canvas.height = layout.canvasHeight / 3;

    const ctx = canvas.getContext('2d');
    ctx.scale(1/3, 1/3);'''

new_compose_top = '''    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    const ctx = canvas.getContext('2d');'''

text = text.replace(old_compose_top, new_compose_top)

old_compose_bottom = '''    drawDateWatermark(ctx, canvas.width, canvas.height, frameConfig.color);

    return canvas;'''

new_compose_bottom = '''    drawDateWatermark(ctx, canvas.width, canvas.height, frameConfig.color);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = layout.canvasWidth / 3;
    finalCanvas.height = layout.canvasHeight / 3;
    const fCtx = finalCanvas.getContext('2d');
    fCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);

    return finalCanvas;'''

text = text.replace(old_compose_bottom, new_compose_bottom)

# 2. Fix findStickerAt and add getLocalCoords globally
old_findStickerAt = '''  function findStickerAt(normX, normY) {
    // 역순 검색 (가장 위쪽 스티커 우선)
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const s = state.stickers[i];
      const halfSize = s.size / 2;
      if (normX >= s.x - halfSize && normX <= s.x + halfSize &&
          normY >= s.y - halfSize && normY <= s.y + halfSize) {
        return i;
      }
    }
    return -1;
  }'''

new_findStickerAt = '''  function getLocalCoords(s, normX, normY, canvas) {
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const dxPx = normX * canvasW - s.x * canvasW;
    const dyPx = normY * canvasH - s.y * canvasH;
    const angle = s.angle || 0;
    const localX = dxPx * Math.cos(-angle) - dyPx * Math.sin(-angle);
    const localY = dxPx * Math.sin(-angle) + dyPx * Math.cos(-angle);
    return { localX, localY };
  }

  function findStickerAt(normX, normY) {
    const canvas = document.getElementById('edit-canvas');
    if (!canvas) return -1;
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const s = state.stickers[i];
      const { localX, localY } = getLocalCoords(s, normX, normY, canvas);
      const halfSize = (s.size * canvas.width) / 2;
      if (Math.abs(localX) <= halfSize && Math.abs(localY) <= halfSize) {
        return i;
      }
    }
    return -1;
  }'''

text = text.replace(old_findStickerAt, new_findStickerAt)

# Remove the getLocalCoords that was inside setupCanvasTouchEvents
old_getLocalCoords_inner = '''    function getLocalCoords(s, normX, normY) {
      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const dxPx = normX * canvasW - s.x * canvasW;
      const dyPx = normY * canvasH - s.y * canvasH;
      const angle = s.angle || 0;
      const localX = dxPx * Math.cos(-angle) - dyPx * Math.sin(-angle);
      const localY = dxPx * Math.sin(-angle) + dyPx * Math.cos(-angle);
      return { localX, localY };
    }'''

text = text.replace(old_getLocalCoords_inner, "")

# Fix isDeleteButtonHit and isResizeHandleHit to pass canvas
text = text.replace('const { localX, localY } = getLocalCoords(s, normX, normY);', 'const { localX, localY } = getLocalCoords(s, normX, normY, canvas);')

# Remove isRotateHandleHit and isRotating references
old_isRotateHandleHit = '''    function isRotateHandleHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;
      const canvasW = canvas.width;
      const halfSize = (s.size * canvasW) / 2 + 4;
      const { localX, localY } = getLocalCoords(s, normX, normY, canvas);
      return Math.hypot(localX - halfSize, localY - (-halfSize)) < 48; // 우상단
    }'''
text = text.replace(old_isRotateHandleHit, "")
text = text.replace('let isRotating = false;', '')
text = text.replace('isRotating = false;', '')

old_pointer_down = '''      if (state.selectedSticker !== null && isRotateHandleHit(state.selectedSticker, normX, normY)) {
        isRotating = true;
        return;
      }
      
      // 2. 선택된 스티커의 크기 조절 핸들 확인
      if (state.selectedSticker !== null && isResizeHandleHit(state.selectedSticker, normX, normY)) {'''

new_pointer_down = '''      // 2. 선택된 스티커의 크기 조절 핸들 확인
      if (state.selectedSticker !== null && isResizeHandleHit(state.selectedSticker, normX, normY)) {'''
text = text.replace(old_pointer_down, new_pointer_down)

old_pointer_move_rot = '''      if (isRotating && state.selectedSticker !== null) {
        const s = state.stickers[state.selectedSticker];
        const rect = canvas.getBoundingClientRect();
        const pixelDx = (normX - s.x) * rect.width;
        const pixelDy = (normY - s.y) * rect.height;
        // The rotate handle is at the top right (+x, -y). So its natural angle is -PI/4.
        const pointerAngle = Math.atan2(pixelDy, pixelDx);
        s.angle = pointerAngle + Math.PI / 4;
        renderEditCanvas();
        return;
      }'''
text = text.replace(old_pointer_move_rot, "")

old_pointer_move_res = '''      if (isResizing && state.selectedSticker !== null) {
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
      }'''
new_pointer_move_res = '''      if (isResizing && state.selectedSticker !== null) {
        const s = state.stickers[state.selectedSticker];
        const rect = canvas.getBoundingClientRect();
        const pixelDx = (normX - s.x) * rect.width;
        const pixelDy = (normY - s.y) * rect.height;
        const currentDist = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
        
        const scale = currentDist / resizeStartDist;
        s.size = clamp(resizeStartSize * scale, 0.03, 0.80);
        
        // 회전 각도 업데이트 (우하단 ⤡ 핸들이므로 기본 각도는 +PI/4)
        const pointerAngle = Math.atan2(pixelDy, pixelDx);
        s.angle = pointerAngle - Math.PI / 4;
        
        renderEditCanvas();
        return;
      }'''
text = text.replace(old_pointer_move_res, new_pointer_move_res)

# Remove the rotate handle UI rendering
old_ui_render = '''        // 회전 핸들 (우상단)
        ctx.fillStyle = 'rgba(52, 199, 89, 0.9)';
        ctx.beginPath();
        ctx.arc(halfSize, -halfSize, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 32px sans-serif`;
        ctx.fillText('↻', halfSize, -halfSize);'''
text = text.replace(old_ui_render, "")

# 3. Chunk upload logic in uploadImageIfNeeded
old_upload = '''  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    try {
      const dataURL = canvas.toDataURL('image/jpeg', 0.90);
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataURL, clientBaseUrl: window.location.origin })
      });

      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      state.hostedPageUrl = data.url;
      state.uploadedImageUrl = data.imageUrl;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }'''

new_upload = '''  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    try {
      const dataURL = canvas.toDataURL('image/jpeg', 0.90);
      
      const chunkSize = 50 * 1024; // 50KB chunks
      const totalChunks = Math.ceil(dataURL.length / chunkSize);
      const uuid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
      
      for (let i = 0; i < totalChunks; i++) {
        const chunkData = dataURL.slice(i * chunkSize, (i + 1) * chunkSize);
        const chunkRes = await fetch('/api/upload/chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid, chunkIndex: i, totalChunks, chunkData })
        });
        if (!chunkRes.ok) throw new Error('Chunk upload failed');
      }
      
      const response = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, clientBaseUrl: window.location.origin })
      });

      if (!response.ok) throw new Error('Upload complete failed');
      const data = await response.json();
      state.hostedPageUrl = data.url;
      state.uploadedImageUrl = data.imageUrl;
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }'''

text = text.replace(old_upload, new_upload)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("done edit7.py")
