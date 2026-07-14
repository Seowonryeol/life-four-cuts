import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update preloadBackgrounds
old_bgs = """  // 이미지 미리 로드
  async function preloadBackgrounds() {
    const bgs = [
      { key: 'bg1', path: 'assets/background_01.png' },
      { key: 'bg2', path: 'assets/background_02.png' },
      { key: 'bg3', path: 'assets/background_03.png' },
      { key: 'vert4_bg1', path: 'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008122/vert4_template_01_ugrmzq.png' },
      { key: 'vert4_bg2', path: 'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008122/vert4_template_02_ugrmzq.png' } // Assume 02 follows pattern, but can be updated later
    ];"""
new_bgs = """  // 이미지 미리 로드
  async function preloadBackgrounds() {
    const bgs = [
      { key: 'bg1', path: 'assets/background_01.png' },
      { key: 'bg2', path: 'assets/background_02.png' },
      { key: 'bg3', path: 'assets/background_03.png' },
      { key: 'vert4_bg1', path: 'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008120/vert4_template_deco_01_wq4jtw.png' },
      { key: 'vert4_bg2', path: 'https://res.cloudinary.com/dv1t8m7k/image/upload/v1784008119/vert4_template_02_phgfmj.png' }
    ];"""
text = text.replace(old_bgs, new_bgs)

# 2. Update drawBackground signature and logic
old_drawBg = """  function drawBackground(ctx, w, h, bgKey, solidColor) {
    ctx.save();
    switch (bgKey) {"""
new_drawBg = """  function drawBackground(ctx, w, h, bgKey, solidColor, skipOverlay = false) {
    ctx.save();
    switch (bgKey) {"""
text = text.replace(old_drawBg, new_drawBg)

old_case2 = """      case 'vert4_bg2':
        if (state.bgImages && state.bgImages['vert4_bg2']) {
          ctx.drawImage(state.bgImages['vert4_bg2'], 0, 0, w, h);
        } else {
          ctx.fillStyle = solidColor || '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        break;"""
new_case2 = """      case 'vert4_bg1':
      case 'vert4_bg2':
        ctx.fillStyle = solidColor || '#ffffff';
        ctx.fillRect(0, 0, w, h);
        if (!skipOverlay && state.bgImages && state.bgImages[bgKey]) {
          ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
        }
        break;"""
text = text.replace(old_case2, new_case2)

old_default = """      default:
        // Custom uploaded template
        if (bgKey && bgKey.startsWith('custom_') && state.bgImages && state.bgImages[bgKey]) {
          ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
        } else if (bgKey !== 'none' && state.bgImages && state.bgImages[bgKey]) {
          ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
        } else {
          ctx.fillStyle = solidColor || '#000000';
          ctx.fillRect(0, 0, w, h);
        }"""
new_default = """      default:
        ctx.fillStyle = solidColor || '#000000';
        ctx.fillRect(0, 0, w, h);
        if (!skipOverlay) {
          if (bgKey && bgKey.startsWith('custom_') && state.bgImages && state.bgImages[bgKey]) {
            ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
          } else if (bgKey !== 'none' && state.bgImages && state.bgImages[bgKey]) {
            ctx.drawImage(state.bgImages[bgKey], 0, 0, w, h);
          }
        }"""
text = text.replace(old_default, new_default)

# 3. Update renderEditCanvas
old_renderCanvas = """    // 1) 캔버스 배경 설정
    drawBackground(ctx, canvas.width, canvas.height, state.frame.bg, state.frame.color);"""
new_renderCanvas = """    // 1) 캔버스 배경 설정 (skipOverlay=true)
    drawBackground(ctx, canvas.width, canvas.height, state.frame.bg, state.frame.color, true);"""
text = text.replace(old_renderCanvas, new_renderCanvas)

old_renderCanvasOverlay = """    // 데코 이미지 그리기 (사진 위, 스티커 아래)
    if (state.frame.deco !== 'none' && state.decoImages && state.decoImages[state.frame.deco]) {
      ctx.drawImage(state.decoImages[state.frame.deco], 0, 0, canvas.width, canvas.height);
    }"""
new_renderCanvasOverlay = """    // 오버레이 템플릿 덧그리기 (사진 위)
    const bgKey = state.frame.bg;
    if (bgKey === 'vert4_bg1' || bgKey === 'vert4_bg2' || (bgKey && bgKey.startsWith('custom_'))) {
      if (state.bgImages && state.bgImages[bgKey]) {
        ctx.drawImage(state.bgImages[bgKey], 0, 0, canvas.width, canvas.height);
      }
    }
    // 기존 데코 이미지 그리기 (사진 위, 스티커 아래)
    if (state.frame.deco !== 'none' && state.decoImages && state.decoImages[state.frame.deco]) {
      ctx.drawImage(state.decoImages[state.frame.deco], 0, 0, canvas.width, canvas.height);
    }"""
text = text.replace(old_renderCanvasOverlay, new_renderCanvasOverlay)

# 4. Update composeImage
old_composeImg = """    // 배경 설정
    drawBackground(ctx, canvas.width, canvas.height, frameConfig.bg, frameConfig.color);"""
new_composeImg = """    // 배경 설정 (skipOverlay=true)
    drawBackground(ctx, canvas.width, canvas.height, frameConfig.bg, frameConfig.color, true);"""
text = text.replace(old_composeImg, new_composeImg)

old_composeImgOverlay = """    // 데코 이미지
    if (frameConfig.deco !== 'none' && state.decoImages && state.decoImages[frameConfig.deco]) {
      ctx.drawImage(state.decoImages[frameConfig.deco], 0, 0, canvas.width, canvas.height);
    }"""
new_composeImgOverlay = """    // 오버레이 템플릿 덧그리기 (사진 위)
    if (frameConfig.bg === 'vert4_bg1' || frameConfig.bg === 'vert4_bg2' || (frameConfig.bg && frameConfig.bg.startsWith('custom_'))) {
      if (state.bgImages && state.bgImages[frameConfig.bg]) {
        ctx.drawImage(state.bgImages[frameConfig.bg], 0, 0, canvas.width, canvas.height);
      }
    }
    // 데코 이미지
    if (frameConfig.deco !== 'none' && state.decoImages && state.decoImages[frameConfig.deco]) {
      ctx.drawImage(state.decoImages[frameConfig.deco], 0, 0, canvas.width, canvas.height);
    }"""
text = text.replace(old_composeImgOverlay, new_composeImgOverlay)

# 5. Add vert4_bg1 to BG_STYLES if missing
if "{ key: 'vert4_bg1'," not in text and "vert4_bg2" in text:
    text = text.replace(
        "{ key: 'vert4_bg2',      label: 'Template 2',          thumb: null }",
        "{ key: 'vert4_bg1',      label: 'Template 1',          thumb: null },\n    { key: 'vert4_bg2',      label: 'Template 2',          thumb: null }"
    )

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js patched.')
