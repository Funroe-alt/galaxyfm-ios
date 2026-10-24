@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npx vite build
echo. & echo Upload EVERYTHING inside this dist folder to your GitHub repo.
explorer dist
pause
