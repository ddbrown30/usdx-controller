@echo off

REM Start in the USDX directory
cd /d "E:\Projects\USDX\game"


REM Launch the Python application through the environment launcher
call "%~dp0launch_env.bat" py app.py
