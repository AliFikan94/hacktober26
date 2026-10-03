@echo off
REM One-click start for Windows. Double-click this file.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required. Install it from https://nodejs.org then run this again. & pause & exit /b 1)
if not exist node_modules (echo Installing TeachBack for the first time... & call npm install)
if "%LLM_MODEL%"=="" echo Tip: set LLM_MODEL=gemma3:4b before running, or pick a model inside the app.
start "" http://localhost:3000
call npm start
pause
