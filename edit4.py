import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add sampleImage to state
if 'state.sampleImage = null;' not in text:
    text = text.replace('state.bgImages = {};', 'state.bgImages = {};\n    state.sampleImage = null;')

# 2. Add load sample.png in init
init_match = re.search(r'async function init\(\)\s*\{', text)
if init_match and 'state.sampleImage = await loadImage' not in text:
    text = text[:init_match.end()] + '\n    try { state.sampleImage = await loadImage(\'./assets/sample.png\'); } catch(e) {}' + text[init_match.end():]

# 3. Update renderFramePreview
old_preview = '''      // 사진 자리 표시
      ctx.fillStyle = '#e8e8ea';
      ctx.fillRect(pos.x, pos.y, pos.width, pos.height);

      // 더미 아이콘/텍스트 (간단히)
      ctx.fillStyle = '#a0a0ab';
      ctx.font = '72px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('📷', pos.x + pos.width / 2, pos.y + pos.height / 2 - 20);

      ctx.font = 'bold 36px "Pretendard", sans-serif';
      ctx.fillText(`Sample Photo ${index + 1}`, pos.x + pos.width / 2, pos.y + pos.height / 2 + 40);'''

new_preview = '''      // 사진 자리 표시
      if (state.sampleImage) {
        drawImageCover(ctx, state.sampleImage, pos.x, pos.y, pos.width, pos.height);
      } else {
        ctx.fillStyle = '#e8e8ea';
        ctx.fillRect(pos.x, pos.y, pos.width, pos.height);
      }'''

if old_preview in text:
    text = text.replace(old_preview, new_preview)

# 4. Multiply sticker size by 3.5 (from 370.8)
if "size: 370.8 / $('#edit-canvas').width" in text:
    text = text.replace("size: 370.8 / $('#edit-canvas').width", "size: 1297.8 / $('#edit-canvas').width")
elif "size: 58 / $('#edit-canvas').width" in text:
    text = text.replace("size: 58 / $('#edit-canvas').width", "size: 1297.8 / $('#edit-canvas').width")

# 5. Resolution 1200*3600 to 480*1440
# Let's change composeImage width/height directly.
# original code:
# composedCanvas.width = frameConfig.width;
# composedCanvas.height = frameConfig.height;
# Change to:
# composedCanvas.width = frameConfig.width * 0.4;
# composedCanvas.height = frameConfig.height * 0.4;
# And ctx.scale(0.4, 0.4) right after getting context.
# Wait, let's see how composeImage handles it:
#     const ctx = composedCanvas.getContext('2d');
# We can just inject the scaling.
scale_inject = '''    composedCanvas.width = frameConfig.width * 0.4;
    composedCanvas.height = frameConfig.height * 0.4;
    const ctx = composedCanvas.getContext('2d');
    ctx.scale(0.4, 0.4);'''

if 'composedCanvas.width = frameConfig.width;\n    composedCanvas.height = frameConfig.height;\n    const ctx = composedCanvas.getContext(\'2d\');' in text:
    text = text.replace(
        'composedCanvas.width = frameConfig.width;\n    composedCanvas.height = frameConfig.height;\n    const ctx = composedCanvas.getContext(\'2d\');',
        scale_inject
    )
elif 'composedCanvas.width = frameConfig.width;\r\n    composedCanvas.height = frameConfig.height;\r\n    const ctx = composedCanvas.getContext(\'2d\');' in text:
    text = text.replace(
        'composedCanvas.width = frameConfig.width;\r\n    composedCanvas.height = frameConfig.height;\r\n    const ctx = composedCanvas.getContext(\'2d\');',
        scale_inject
    )

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js updated successfully.')
