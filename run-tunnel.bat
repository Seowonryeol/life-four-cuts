@echo off
:loop
echo Starting localtunnel...
call lt --port 3000 --subdomain my-life-4cuts
echo Tunnel crashed. Restarting in 3 seconds...
timeout /t 3
goto loop