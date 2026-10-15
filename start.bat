@echo off
rem Starts NHL-RPC with a visible window to see the logs (stops the background instance first).
cd /d "%~dp0"
title NHL-RPC
call "%~dp0stop.bat" quiet
node src\index.js
pause
