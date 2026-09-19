@echo off

REM Check for administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
if "%~1"=="" (
powershell -Command "Start-Process '%~f0' -Verb RunAs"
) else (
powershell -Command "Start-Process '%~f0' -ArgumentList '%*' -Verb RunAs"
)
exit /b
)

REM Get the folder of this batch file
set "BATCH_DIR=%~dp0"

REM Start in the batch file's directory. Use pushd rather than cd /d:
REM cd can't set a UNC path as the current directory ("CMD does not
REM support UNC paths as current directory"), but pushd works around
REM that by mapping a temporary drive letter to the share.
pushd "%BATCH_DIR%"

REM Set venv path
set "VENV_PATH=%BATCH_DIR%.venv"

REM USDX_BRIDGE_DIR is deliberately left unset here: app.py's default
REM (C:\Program Files (x86)\UltraStar Deluxe\plugins\controller_bridge)
REM already points at the actual installed game. Only override it if
REM USDX is installed somewhere else.

REM Activate virtual environment
call "%VENV_PATH%\Scripts\activate.bat"

REM activate.bat bakes in the absolute path the venv was created at, as
REM VIRTUAL_ENV, and prepends "%VIRTUAL_ENV%\Scripts" to PATH. If this
REM folder has since been moved or renamed, that path goes stale and
REM silently fails to put this project's venv first on PATH. Force the
REM correct, current location to the front of PATH ourselves so bare
REM "python"/"pip"/etc. below (and in whatever a forwarded command
REM below runs) reliably resolve to this venv.
set "PATH=%VENV_PATH%\Scripts;%PATH%"

REM If a command was supplied, run it
if not "%~1"=="" (
%*
exit /b
)

REM Otherwise open an interactive elevated CMD
cmd /k
