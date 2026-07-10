import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Sticker size to half (432.6 -> 216.3)
text = text.replace("size: 432.6 / $('#edit-canvas').width", "size: 216.3 / $('#edit-canvas').width")

# 2. Upload format from image/jpeg to image/png
text = text.replace("canvas.toDataURL('image/jpeg', 0.90)", "canvas.toDataURL('image/png')")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js updated: sticker size halved, upload uses PNG.')
