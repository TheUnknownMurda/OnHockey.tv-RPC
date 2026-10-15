@echo off
cd /d "%~dp0"
title OnHockey.tv RPC uninstall
call "%~dp0stop.bat" quiet
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\autostart.ps1" -Remove
echo.
echo  OnHockey.tv RPC is stopped and will no longer start with Windows.
echo.
echo  To finish:
echo    1. Remove the extension from your browser's extensions page
echo    2. Delete this folder
echo.
pause
