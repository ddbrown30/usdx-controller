@echo off

REM Start the controller server on its own, without launching USDX.
REM Needs the same elevated environment (venv + USDX bridge plugin dir)
REM as launch_usdx.bat, so route through launch_env.bat.
REM
REM Run via pythonw (no console window) with "start /b" so
REM launch_env.bat's elevated window can exit right away instead of
REM sitting open for as long as the server runs.
start "USDX Controller" "%~dp0launch_env.bat" start /b pythonw app.py
