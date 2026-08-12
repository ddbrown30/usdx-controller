@echo off

REM --- USDX ---
set "USDX_DIR=E:\Projects\USDX\game"
set "USDX_EXE=%USDX_DIR%\ultrastardx.exe"

REM --- Controller app readiness ---
REM app.py loads the song database (song_database.load()) BEFORE
REM calling app.run(), so the very first successful response from the
REM server means song scanning is already finished - no separate
REM "ready" signal needed, just poll until it answers.
set "APP_URL=http://localhost:5000/"
set "MAX_WAIT_SECONDS=60"

echo Starting controller app...

REM Launched with "start" (not "call") so this script doesn't block:
REM launch_env.bat's elevation relaunch is fire-and-forget anyway, so
REM blocking here wouldn't reliably tell us when app.py is actually up -
REM polling the HTTP server below is what actually tells us that.
start "USDX Controller" "%~dp0launch_env.bat" py app.py

echo Waiting for controller app to finish loading songs...

set /a "ELAPSED=0"

:WAIT_FOR_APP
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto APP_READY

set /a "ELAPSED+=1"
if %ELAPSED% GEQ %MAX_WAIT_SECONDS% (
    echo Controller app did not respond after %MAX_WAIT_SECONDS% seconds - launching USDX anyway.
    goto LAUNCH_USDX
)

timeout /t 1 /nobreak >nul
goto WAIT_FOR_APP

:APP_READY
echo Controller app is ready.

:LAUNCH_USDX
echo Launching UltraStar Deluxe...
cd /d "%USDX_DIR%"
start "" "%USDX_EXE%"
