@echo off
cd /d "%~dp0"
set BIND=0.0.0.0
call npm run demo
pause
