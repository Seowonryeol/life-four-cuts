import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Remove the half-scaling in uploadImageIfNeeded
old_upload = """  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width / 2;
      tempCanvas.height = canvas.height / 2;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      const dataURL = tempCanvas.toDataURL('image/jpeg', 0.60);
      const response = await fetch('/api/upload', {"""

new_upload = """  async function uploadImageIfNeeded(canvas) {
    if (state.hostedPageUrl && state.uploadedImageUrl) return true;
    try {
      const dataURL = canvas.toDataURL('image/jpeg', 0.90);
      const response = await fetch('/api/upload', {"""

if old_upload in text:
    text = text.replace(old_upload, new_upload)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print("upload logic fixed")
