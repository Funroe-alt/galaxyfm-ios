@echo off
cd /d "%~dp0"
if not exist node_modules call npm install
call npx vite build
if not exist android call npx cap add android
call npx cap sync android
copy /Y android-extra\MainActivity.java android\app\src\main\java\com\galaxyfm\app\MainActivity.java
call npx cap open android
pause
