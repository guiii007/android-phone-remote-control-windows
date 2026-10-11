@echo off
cd /d "%~dp0"
node --input-type=module -e "import { phoneAddresses } from './src/addresses.mjs'; import { remotePort } from './src/local-settings.mjs'; for (const a of phoneAddresses(remotePort())) console.log(a.name + ': ' + a.url);"
pause
