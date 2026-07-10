import re

with open('app.js', 'r', encoding='utf-8') as f:
    app = f.read()

# 1. State sampleImage
app = app.replace('state.bgImages = {};', 'state.bgImages = {};\n    state.sampleImage = null;')

# 2. Load sampleImage in initApp
app = app.replace('await loadAssets();', 'await loadAssets();\n    try { state.sampleImage = await loadImage(\'./assets/sample.png\'); } catch(e) {}')

# 3. renderFramePreview placeholder
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

app = app.replace(old_preview, new_preview)

# 4. Borders and shadow
def replace_border(match):
    return '''      if (''' + match.group(1) + ''') {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 5;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeRect(pos.x, pos.y, pos.width, pos.height);
        ctx.restore();
      }'''

app = re.sub(r'      if \(([^)]+)\) {\s*ctx\.strokeStyle = \'#[a-fA-F0-9]+\';\s*ctx\.lineWidth = 10;\s*ctx\.strokeRect\(pos\.x, pos\.y, pos\.width, pos\.height\);\s*}', replace_border, app)

# 5. Date text color
app = re.sub(r'const textColor = [^;]+;', 'const textColor = \'#000000\';', app)

# 6. Sticker size
app = app.replace('size: 58 / $(\'#edit-canvas\').width', 'size: 370.8 / $(\'#edit-canvas\').width')

# 7. uploadImageIfNeeded
old_upload = re.search(r'  async function uploadImageIfNeeded\(canvas\) \{.*?(?=  function generateQR)', app, re.DOTALL).group(0)

new_upload = '''  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    
    try {
      // 해상도를 절반으로 줄여 용량 감소
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width / 2;
      tempCanvas.height = canvas.height / 2;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      
      const dataURL = tempCanvas.toDataURL('image/jpeg', 0.80);
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
        console.error('업로드 완료 실패:', data.error);
        return false;
      }
    } catch (e) {
      console.error('업로드 중 에러 발생:', e);
      return false;
    }
  }
'''

app = app.replace(old_upload, new_upload)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app)

print('Updated app.js.')
