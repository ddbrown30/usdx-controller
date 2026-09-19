@echo off

REM Start the controller server on its own, without launching USDX.
REM
REM Opens a visible console window titled "USDX Controller" running the
REM server in the foreground, so you can see its logs and stop it with
REM Ctrl+C (or by just closing the window).
REM
REM Doesn't need administrator rights: the server only reads USDX's
REM config.ini and reads/writes the bridge files under USDX_BRIDGE_DIR
REM below (not anywhere under Program Files), so it can run as the
REM normal user. That also sidesteps a bug where routing through
REM launch_env.bat's UAC elevation from this folder's UNC path
REM (\\pox-box\...) opened a bare elevated command prompt instead of
REM actually running the script - cmd can't use a UNC path as an
REM elevated process's starting directory.
REM
REM This also deliberately does NOT cd/pushd into this folder: app.py
REM resolves its templates/static/config paths from its own file
REM location, not the process's current directory, so passing
REM fully-qualified paths below is enough - no working directory needed.

REM Get the folder of this batch file
set "BATCH_DIR=%~dp0"

REM Set venv path
set "VENV_PATH=%BATCH_DIR%.venv"

REM Set USDX Bridge directory
set "USDX_BRIDGE_DIR=E:\Projects\USDX\game\plugins\controller_bridge"

REM Run the venv's own python.exe directly by path rather than relying
REM on activate.bat + PATH: activate.bat bakes in the absolute path the
REM venv was created at, which goes stale if this folder is ever moved
REM or renamed (as happened here), silently falling back to whatever
REM other Python is first on PATH instead of this project's venv.
start "USDX Controller" "%VENV_PATH%\Scripts\python.exe" "%BATCH_DIR%app.py"
