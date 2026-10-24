@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npm run pc
if errorlevel 1 pause
