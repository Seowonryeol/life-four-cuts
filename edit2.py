import re

with open('app.js', 'r', encoding='utf-8') as f:
    app = f.read()

old_upload = re.search(r'  async function uploadImageIfNeeded\(canvas\) \{.*?(?=  async function generateQR)', app, re.DOTALL).group(0)

new_upload = """  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width / 2;
      tempCanvas.height = canvas.height / 2;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      const dataURL = tempCanvas.toDataURL('image/jpeg', 0.60);
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
"""

app = app.replace(old_upload, new_upload)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app)

print("uploadImageIfNeeded updated")
