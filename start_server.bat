@echo off

REM Start the controller server on its own, without launching USDX.
REM
REM Opens a visible console window titled "USDX Controller" running the
REM server in the foreground, so you can see its logs and stop it with
REM Ctrl+C (or by just closing the window).
REM
REM Doesn't need administrator rights: the USDX install's
REM plugins\controller_bridge folder (where the server reads/writes
REM its bridge files, and reads config.ini from the install root) has
REM permissive enough ACLs that a normal user can write there without
REM elevation - confirmed directly, not assumed. That also sidesteps a
REM bug where routing through launch_env.bat's UAC elevation from this
REM folder's UNC path (\\pox-box\...) opened a bare elevated command
REM prompt instead of actually running the script - cmd can't use a
REM UNC path as an elevated process's starting directory.
REM
REM This also deliberately does NOT cd/pushd into this folder: app.py
REM resolves its templates/static/config paths from its own file
REM location, not the process's current directory, so passing
REM fully-qualified paths below is enough - no working directory needed.

REM Get the folder of this batch file
set "BATCH_DIR=%~dp0"

REM Set venv path
set "VENV_PATH=%BATCH_DIR%.venv"

REM USDX_BRIDGE_DIR is deliberately left unset here: app.py's default
REM (C:\Program Files (x86)\UltraStar Deluxe\plugins\controller_bridge)
REM already points at the actual installed game. Only override it if
REM USDX is installed somewhere else.

REM Run the venv's own python.exe directly by path rather than relying
REM on activate.bat + PATH: activate.bat bakes in the absolute path the
REM venv was created at, which goes stale if this folder is ever moved
REM or renamed (as happened here), silently falling back to whatever
REM other Python is first on PATH instead of this project's venv.
start "USDX Controller" "%VENV_PATH%\Scripts\python.exe" "%BATCH_DIR%app.py"
