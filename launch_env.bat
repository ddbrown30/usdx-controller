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

REM Set USDX Bridge directory
set "USDX_BRIDGE_DIR=E:\Projects\USDX\game\plugins\controller_bridge"

REM Activate virtual environment
call "%VENV_PATH%\Scripts\activate.bat"

REM If a command was supplied, run it
if not "%~1"=="" (
%*
exit /b
)

REM Otherwise open an interactive elevated CMD
cmd /k
