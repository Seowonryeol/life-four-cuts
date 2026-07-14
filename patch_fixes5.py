import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Add event listener for color-custom and fix color-swatch to reset deco
old_color_code = """    // 프레임 색상 스와치 이벤트 설정
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
    });"""

new_color_code = """    // 프레임 색상 스와치 이벤트 설정
    const colorSwatches = $$('.color-swatch[data-color]');
    colorSwatches.forEach(swatch => {
      const clone = swatch.cloneNode(true);
      swatch.parentNode.replaceChild(clone, swatch);

      clone.addEventListener('click', () => {
        $$('.color-swatch').forEach(s => s.classList.remove('active'));
        clone.classList.add('active');
        state.frame.color = clone.dataset.color;
        state.frame.bg = 'none'; // clear background image
        state.frame.deco = 'none'; // clear deco template
        
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

    // RGB 커스텀 색상 피커 이벤트 설정
    const colorCustom = $('#color-custom');
    if (colorCustom) {
      colorCustom.addEventListener('input', (e) => {
        state.frame.color = e.target.value;
        state.frame.bg = 'none';
        state.frame.deco = 'none';
        
        $$('.color-swatch').forEach(s => s.classList.remove('active'));
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        const noneOption = document.querySelector('.style-option-item[data-bg="none"]');
        if (noneOption) noneOption.classList.add('active');
        renderEditCanvas();
      });
    }"""

if "RGB 커스텀 색상 피커 이벤트 설정" not in text:
    text = text.replace(old_color_code, new_color_code)

# 2. In renderBgOptions, the button click also needs state.frame.deco = 'none' if we replaced it earlier but maybe failed.
# Wait, let's just make sure renderBgOptions resets deco when clicking a style.
def replace_render_bg_click(match):
    body = match.group(0)
    if "state.frame.deco = opt.deco;" not in body and "state.frame.deco = 'none';" not in body:
        # If it was setting bg but not deco, we fix it, but actually the original sets deco = opt.deco!
        pass
    return body

old_btn_click = """      btn.addEventListener('click', () => {
        $$('.style-option-item', container).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.frame.bg = opt.bg;
        state.frame.deco = opt.deco;
        
        if (state.currentScreen === 'edit') {
          renderEditCanvas();
        } else {
          renderFramePreview();
        }
      });"""
# Wait, renderBgOptions() in app.js doesn't use updateBgOptionsUI!
# Let's check renderBgOptions click event.
old_thumb_click = """      item.addEventListener('click', () => {
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        state.frame.bg = style.key;
        renderEditCanvas();
      });"""

new_thumb_click = """      item.addEventListener('click', () => {
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        state.frame.bg = style.key;
        state.frame.deco = 'none';
        renderEditCanvas();
      });"""

if "state.frame.bg = style.key;\n        renderEditCanvas();" in text:
    text = text.replace(old_thumb_click, new_thumb_click)

# Also fix the custom upload listener to reset deco
old_upload_click = """      div.addEventListener('click', () => {
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        $$('.custom-template-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        state.frame.bg = key;
        renderEditCanvas();
      });"""
new_upload_click = """      div.addEventListener('click', () => {
        $$('.style-option-item').forEach(el => el.classList.remove('active'));
        $$('.custom-template-item').forEach(el => el.classList.remove('active'));
        div.classList.add('active');
        state.frame.bg = key;
        state.frame.deco = 'none';
        renderEditCanvas();
      });"""
if "state.frame.bg = key;\n        renderEditCanvas();" in text:
    text = text.replace(old_upload_click, new_upload_click)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)
