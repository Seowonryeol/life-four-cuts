@echo off
chcp 65001 > nul
echo ==============================================================
echo  Life Four Cuts Photo Booth Local Tunnel (localtunnel)
echo ==============================================================
echo.
echo Forwarding port 3000 using npx localtunnel.
echo.
echo When the tunnel is connected, look for "your url is: https://..."
echo and connect to that URL from your phone or tablet!
echo.
echo (Note: A "Click to Continue" page may appear on first visit)
echo.
npx localtunnel --port 3000
pause
