@echo off
rem Starts OnHockey.tv RPC with a visible window to see the logs (stops the background instance first).
cd /d "%~dp0"
title OnHockey.tv RPC
call "%~dp0stop.bat" quiet
node src\index.js
pause
