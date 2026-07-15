import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find layout keys
matches = re.findall(r'data-layout="([^"]+)"', html)
print('Layout keys in HTML:', matches)

with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Find how renderEditCanvas calls drawBackground
idx = js.find('function renderEditCanvas')
print('\nrenderEditCanvas found at line:', js[:idx].count('\n') + 1)

# Find drawBackground calls
for m in re.finditer(r'drawBackground\(', js):
    start = m.start()
    line_no = js[:start].count('\n') + 1
    snippet = js[start:start+120].replace('\n', ' ')
    print(f'Line {line_no}: {snippet}')
