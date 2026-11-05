@echo off
rem Starts the Gate Check In app: installs any new packages, then opens it in your browser.
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
rem Runs every time so packages added to package.json later (e.g. d3 for the charts) get installed;
rem when nothing changed it only takes a few seconds.
echo Checking packages...
call npm install --no-audit --no-fund --loglevel=error || (pause & exit /b 1)
echo Starting the app at http://localhost:5173 - keep this window open while you use it.
call npm run dev -- --open
pause
