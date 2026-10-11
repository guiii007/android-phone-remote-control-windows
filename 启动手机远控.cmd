@echo off
cd /d "%~dp0"
if not exist "PalmRemote.exe" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\build-launcher.ps1"
if not exist "PalmRemote.exe" exit /b 1
start "" "%~dp0PalmRemote.exe"
