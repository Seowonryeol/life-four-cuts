import sys

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

idx = html.find('data-layout="grid22"')
chunk = html[idx-100:idx+600]
# Write to a temp file instead
with open('grid22_context.txt', 'w', encoding='utf-8') as f:
    f.write(chunk)

print('Written to grid22_context.txt, idx =', idx)
