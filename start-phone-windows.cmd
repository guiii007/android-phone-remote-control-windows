@echo off
cd /d "%~dp0"
set BIND=0.0.0.0
set RELAY_URL=
echo Real Windows control - close this window to stop.
echo Pairing key: .pairing-token in this folder.
node --input-type=module -e "import { remotePort } from './src/local-settings.mjs'; process.env.PORT=String(remotePort()); await import('./src/host.mjs');"
pause
