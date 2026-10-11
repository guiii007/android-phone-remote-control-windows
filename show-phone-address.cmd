@echo off
cd /d "%~dp0"
node --input-type=module -e "import { phoneAddresses } from './src/addresses.mjs'; for (const a of phoneAddresses()) console.log(a.name + ': ' + a.url);"
pause
