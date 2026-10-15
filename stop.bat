@echo off
rem Stops NHL-RPC and clears the Discord status. "stop.bat quiet" = no messages.
curl -sf -o nul -X POST -H "X-NHL-RPC: 1" http://127.0.0.1:47823/quit
if errorlevel 1 (
  if /i not "%~1"=="quiet" echo NHL-RPC was not running.
) else (
  timeout /t 1 /nobreak >nul
  if /i not "%~1"=="quiet" echo NHL-RPC stopped.
)
if /i not "%~1"=="quiet" pause
