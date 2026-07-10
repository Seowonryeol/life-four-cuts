@echo off
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
