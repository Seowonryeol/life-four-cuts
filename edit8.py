import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Revert addSticker (remove angle)
text = text.replace('emoji: emoji,\n      angle: 0,', 'emoji: emoji,')

# 2. Revert renderStickersOnCanvas rotation and UI
old_render_ui = '''        // 삭제 버튼 (좌상단)
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
        ctx.fillText('⤡', halfSize, halfSize);'''

new_render_ui = '''        // 삭제 버튼 (우상단)
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

if old_render_ui in text:
    text = text.replace(old_render_ui, new_render_ui)

text = text.replace('ctx.rotate(sticker.angle || 0);', 'ctx.rotate((sticker.rotation || 0) * Math.PI / 180);')

# 3. Revert findStickerAt and getLocalCoords
old_findStickerAt = '''  function getLocalCoords(s, normX, normY, canvas) {
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

new_findStickerAt = '''  function findStickerAt(normX, normY) {
    const canvas = document.getElementById('edit-canvas');
    if (!canvas) return -1;
    const canvasRatio = canvas.height / canvas.width;
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const s = state.stickers[i];
      const halfWidth = s.size / 2;
      const halfHeight = (s.size / canvasRatio) / 2;
      if (normX >= s.x - halfWidth && normX <= s.x + halfWidth &&
          normY >= s.y - halfHeight && normY <= s.y + halfHeight) {
        return i;
      }
    }
    return -1;
  }'''

if old_findStickerAt in text:
    text = text.replace(old_findStickerAt, new_findStickerAt)

# 4. Revert isDeleteButtonHit and isResizeHandleHit
old_hit_checks = '''    function isDeleteButtonHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;
      const canvasW = canvas.width;
      const halfSize = (s.size * canvasW) / 2 + 4;
      const { localX, localY } = getLocalCoords(s, normX, normY, canvas);
      return Math.hypot(localX - (-halfSize), localY - (-halfSize)) < 48; // 좌상단
    }

    function isResizeHandleHit(stickerIndex, normX, normY) {
      const s = state.stickers[stickerIndex];
      if (!s) return false;
      const canvasW = canvas.width;
      const halfSize = (s.size * canvasW) / 2 + 4;
      const { localX, localY } = getLocalCoords(s, normX, normY, canvas);
      return Math.hypot(localX - halfSize, localY - halfSize) < 48; // 우하단
    }'''

new_hit_checks = '''    function isDeleteButtonHit(stickerIndex, normX, normY) {
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
    }'''

if old_hit_checks in text:
    text = text.replace(old_hit_checks, new_hit_checks)

# 5. Revert pointer move resize logic
old_pointer_move_res = '''      if (isResizing && state.selectedSticker !== null) {
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

new_pointer_move_res = '''      if (isResizing && state.selectedSticker !== null) {
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

if old_pointer_move_res in text:
    text = text.replace(old_pointer_move_res, new_pointer_move_res)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js successfully reverted rotation logic.')
