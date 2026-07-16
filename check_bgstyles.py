with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

idx = js.find('BG_STYLES')
chunk = js[idx:idx+2000]
print(chunk.encode('ascii', errors='replace').decode('ascii'))
