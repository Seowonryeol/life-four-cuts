with open('app.js', 'r', encoding='utf-8') as f:
    js = f.read()

lines = js.split('\n')

# Find CONFIG object
for i, l in enumerate(lines):
    if 'const CONFIG' in l or 'CONFIG =' in l:
        print(i+1, l[:80])

# Find layouts block
idx = js.find('layouts:')
if idx >= 0:
    chunk = js[idx:idx+2000]
    print('\n--- LAYOUTS ---')
    print(chunk.encode('ascii', errors='replace').decode('ascii'))

# Find populateCameraDevices
idx2 = js.find('function populateCameraDevices')
print('\npopulateCameraDevices at line:', js[:idx2].count('\n')+1)
chunk2 = js[idx2:idx2+1000]
print(chunk2.encode('ascii', errors='replace').decode('ascii'))
