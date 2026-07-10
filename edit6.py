import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Size
text = text.replace("size: 1297.8 / $('#edit-canvas').width", "size: 432.6 / $('#edit-canvas').width")
text = text.replace("size: 370.8 / $('#edit-canvas').width", "size: 432.6 / $('#edit-canvas').width")
text = text.replace("size: 1112.4 / $('#edit-canvas').width", "size: 432.6 / $('#edit-canvas').width")

# 2. Angle
text = text.replace('emoji: emoji,', 'emoji: emoji,\n      angle: 0,')

# 3. Resolution
old_compose = '''    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;

    const ctx = canvas.getContext('2d');'''

new_compose = '''    const canvas = document.createElement('canvas');
    canvas.width = layout.canvasWidth / 3;
    canvas.height = layout.canvasHeight / 3;

    const ctx = canvas.getContext('2d');
    ctx.scale(1/3, 1/3);'''

if old_compose in text:
    text = text.replace(old_compose, new_compose)
elif "canvas.width = layout.canvasWidth;\n    canvas.height = layout.canvasHeight;\n\n    const ctx = canvas.getContext('2d');" in text:
    text = text.replace("canvas.width = layout.canvasWidth;\n    canvas.height = layout.canvasHeight;\n\n    const ctx = canvas.getContext('2d');", new_compose)

# 4. renderStickersOnCanvas
# Replace ctx.rotate(sticker.rotation * Math.PI / 180); with ctx.rotate(sticker.angle || 0);
text = text.replace('ctx.rotate(sticker.rotation * Math.PI / 180);', 'ctx.rotate(sticker.angle || 0);')

# Replace the UI rendering inside renderStickersOnCanvas to add rotate handle
old_render_ui = '''        // 삭제 버튼 (우상단)
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
        });'''

new_render_ui = '''        // 삭제 버튼 (좌상단)
        const btnSize = 80;
        ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
        ctx.beginPath();
        ctx.arc(-halfSize, -halfSize, btnSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${btnSize * 0.7}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕', -halfSize, -halfSize);

        // 크기 조절 핸들 (우하단)
        ctx.fillStyle = 'rgba(100, 180, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 32px sans-serif`;
        ctx.fillText('⤡', halfSize, halfSize);

        // 회전 핸들 (우상단)
        ctx.fillStyle = 'rgba(52, 199, 89, 0.9)';
        ctx.beginPath();
        ctx.arc(halfSize, -halfSize, 32, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 32px sans-serif`;
        ctx.fillText('↻', halfSize, -halfSize);'''

if old_render_ui in text:
    text = text.replace(old_render_ui, new_render_ui)


# 5. setupCanvasTouchEvents
old_hit = '''    // 삭제 버튼 히트 테스트  (우상단)
    function isDeleteButtonHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;

      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const fontSize = s.size * canvasW;
      const halfSize = fontSize / 2 + 4;   // px
      const btnR     = 40;                  // px — 원 반지름

      // 캔버스 px 좌표 (translate 기준)
      const btnCxPx = s.x * canvasW + halfSize;   // 우상단
      const btnCyPx = s.y * canvasH - halfSize;

      // norm 좌표로 변환
      const btnCxN = btnCxPx / canvasW;
      const btnCyN = btnCyPx / canvasH;
      const hitR   = (btnR + 8) / canvasW;  // 여유 범위 추가

      const dx = normX - btnCxN;
      const dy = normY - btnCyN;
      return Math.sqrt(dx * dx + dy * dy) < hitR;
    }

    // 크기 조절 핸들 히트 테스트 (우하단, 좌하단, 좌상단)
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
    let resizeStartSize = 0;'''

new_hit = '''    function getLocalCoords(s, normX, normY) {
      const canvasW = canvas.width;
      const canvasH = canvas.height;
      const dxPx = normX * canvasW - s.x * canvasW;
      const dyPx = normY * canvasH - s.y * canvasH;
      const angle = s.angle || 0;
      const localX = dxPx * Math.cos(-angle) - dyPx * Math.sin(-angle);
      const localY = dxPx * Math.sin(-angle) + dyPx * Math.cos(-angle);
      return { localX, localY };
    }

    function isDeleteButtonHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;
      const canvasW = canvas.width;
      const halfSize = (s.size * canvasW) / 2 + 4;
      const { localX, localY } = getLocalCoords(s, normX, normY);
      return Math.hypot(localX - (-halfSize), localY - (-halfSize)) < 48; // 좌상단
    }

    function isResizeHandleHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;
      const canvasW = canvas.width;
      const halfSize = (s.size * canvasW) / 2 + 4;
      const { localX, localY } = getLocalCoords(s, normX, normY);
      return Math.hypot(localX - halfSize, localY - halfSize) < 48; // 우하단
    }
    
    function isRotateHandleHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;
      const canvasW = canvas.width;
      const halfSize = (s.size * canvasW) / 2 + 4;
      const { localX, localY } = getLocalCoords(s, normX, normY);
      return Math.hypot(localX - halfSize, localY - (-halfSize)) < 48; // 우상단
    }

    let isResizing = false;
    let isRotating = false;
    let resizeStartDist = 0;
    let resizeStartSize = 0;'''

if old_hit in text:
    text = text.replace(old_hit, new_hit)

old_pointer_down = '''      // 2. 선택된 스티커의 크기 조절 핸들 확인
      if (state.selectedSticker !== null && isResizeHandleHit(state.selectedSticker, normX, normY)) {
        isResizing = true;
        const s = state.stickers[state.selectedSticker];
        // 픽셀 단위로 스티커 중심에서 터치 포인트까지의 거리 계산
        const rect = canvas.getBoundingClientRect();
        const pixelDx = (normX - s.x) * rect.width;
        const pixelDy = (normY - s.y) * rect.height;
        resizeStartDist = Math.sqrt(pixelDx * pixelDx + pixelDy * pixelDy);
        if (resizeStartDist < 0.001) resizeStartDist = 0.001; // 0 나누기 방지
        resizeStartSize = s.size;
        return;
      }'''

new_pointer_down = '''      if (state.selectedSticker !== null && isRotateHandleHit(state.selectedSticker, normX, normY)) {
        isRotating = true;
        return;
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
      }'''

if old_pointer_down in text:
    text = text.replace(old_pointer_down, new_pointer_down)

old_pointer_move = '''      if (isResizing && state.selectedSticker !== null) {
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

new_pointer_move = '''      if (isRotating && state.selectedSticker !== null) {
        const s = state.stickers[state.selectedSticker];
        const rect = canvas.getBoundingClientRect();
        const pixelDx = (normX - s.x) * rect.width;
        const pixelDy = (normY - s.y) * rect.height;
        // The rotate handle is at the top right (+x, -y). So its natural angle is -PI/4.
        const pointerAngle = Math.atan2(pixelDy, pixelDx);
        s.angle = pointerAngle + Math.PI / 4;
        renderEditCanvas();
        return;
      }
      
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
      }'''

if old_pointer_move in text:
    text = text.replace(old_pointer_move, new_pointer_move)

text = text.replace('isResizing = false;', 'isResizing = false;\n      isRotating = false;')

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js updated successfully!')
