import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_compose_bottom = '''    drawDateWatermark(ctx, canvas.width, canvas.height, frameConfig.color);

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = layout.canvasWidth / 3;
    finalCanvas.height = layout.canvasHeight / 3;
    const fCtx = finalCanvas.getContext('2d');
    fCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);

    return finalCanvas;'''

new_compose_bottom = '''    drawDateWatermark(ctx, canvas.width, canvas.height, frameConfig.color);

    return canvas;'''

text = text.replace(old_compose_bottom, new_compose_bottom)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js successfully reverted to 1200x3600 high resolution.')
