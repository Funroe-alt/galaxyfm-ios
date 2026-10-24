@echo off
cd /d "%~dp0"
echo Installing Galaxy.FM (first time takes a few minutes)...
call npm install
if errorlevel 1 (echo. & echo Install failed. Is Node.js installed? https://nodejs.org & pause & exit /b 1)
echo. & echo Done! Now double-click run-pc.bat
pause
