@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run pc:exe
echo. & echo Your exe is in the release folder.
explorer release
pause
