import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find layout cards
matches = list(re.finditer(r'data-layout="[^"]*"', html))
for m in matches:
    start = max(0, m.start()-20)
    end = min(len(html), m.end()+80)
    print(f'Pos {m.start()}: ...{html[start:end]}...')
    print()
