import re

with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

old_initEdit = '''  async function initEditScreen() {
    // 1. 1번 캔버스 렌더링'''

new_initEdit = '''  async function initEditScreen() {
    // 우측 패널 스크롤 맨 위로 초기화
    const editControls = document.querySelector('.edit-controls');
    if (editControls) {
      editControls.scrollTop = 0;
    }

    // 1. 1번 캔버스 렌더링'''

if old_initEdit in text:
    text = text.replace(old_initEdit, new_initEdit)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)

print('app.js updated with scroll reset.')

bat_content = """@echo off
chcp 65001 > nul
echo ==============================================================
echo  Life Four Cuts Photo Booth Local Tunnel (Cloudflare)
echo ==============================================================
echo.
echo Forwarding port 3000 using Cloudflare Tunnel.
echo.
echo Please wait... Look for the "trycloudflare.com" URL below!
echo.
npx --yes cloudflared tunnel --url http://localhost:3000
pause
"""

with open('run_cloudflared.bat', 'w', encoding='utf-8') as f:
    f.write(bat_content)

print('run_cloudflared.bat created.')
