@echo off
:loop
echo Starting localhost.run tunnel...
ssh -R 80:localhost:3000 nokey@localhost.run
echo Tunnel crashed. Restarting in 3 seconds...
timeout /t 3
goto loop