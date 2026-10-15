@echo off
setlocal
cd /d "%~dp0"
title OnHockey.tv RPC setup
set "EXT=%~dp0extension"

echo.
echo  ==========================================
echo    OnHockey.tv RPC setup
echo    Discord Rich Presence for onhockey.tv
echo  ==========================================
echo.

rem ---- 1. Node.js -------------------------------------------------------
echo [1/5] Checking Node.js...
where node >nul 2>nul
if errorlevel 1 goto :no_node
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)"
if errorlevel 1 goto :old_node
for /f %%v in ('node -v') do echo       Node.js %%v found.
goto :deps

:no_node
echo       Node.js is not installed.
goto :get_node
:old_node
for /f %%v in ('node -v') do echo       Node.js %%v is too old, version 20 or newer is required.
:get_node
where winget >nul 2>nul
if errorlevel 1 goto :manual_node
echo.
choice /m "      Install Node.js LTS now (winget)"
if errorlevel 2 goto :manual_node
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
echo.
echo  Node.js is installed. Close this window and run install.bat again.
pause
exit /b 1
:manual_node
echo.
echo  Install Node.js LTS from https://nodejs.org then run install.bat again.
start "" https://nodejs.org/
pause
exit /b 1

rem ---- 2. Dependencies --------------------------------------------------
:deps
echo.
echo [2/5] Installing dependencies (about 1 minute)...
call npm install --omit=dev --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo.
  echo  npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo       Done.

rem ---- 3. Start with Windows --------------------------------------------
echo.
echo [3/5] Start with Windows
choice /m "      Start OnHockey.tv RPC automatically when Windows starts (recommended)"
if errorlevel 2 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\autostart.ps1" -Remove
  echo       Skipped.
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\autostart.ps1"
  echo       Enabled.
)

rem ---- 4. Launch --------------------------------------------------------
echo.
echo [4/5] Starting OnHockey.tv RPC in the background...
call "%~dp0stop.bat" quiet
wscript "%~dp0scripts\start-hidden.vbs"
timeout /t 4 /nobreak >nul
curl -sf -o nul http://127.0.0.1:47823/status
if errorlevel 1 (
  echo       OnHockey.tv RPC did not start. Run start.bat to see the error.
) else (
  echo       OnHockey.tv RPC is running.
)

rem ---- 5. Browser extension ---------------------------------------------
echo.
echo [5/5] Browser extension
<nul set /p "=%EXT%" | clip
echo       The extension folder path is copied to your clipboard:
echo         %EXT%
echo.
echo       In the extensions page that opens:
echo         1. Turn on "Developer mode"
echo         2. Click "Load unpacked"
echo         3. Paste the path (Ctrl+V) in the folder box and confirm
echo         4. Pin the OnHockey.tv RPC extension (puzzle icon) to check its status
echo.
choice /c 123 /n /m "      Which browser do you use?  [1] Chrome  [2] Edge  [3] Other (Brave, Opera...): "
if errorlevel 3 goto :other_browser
if errorlevel 2 start "" msedge "edge://extensions" & goto :done
start "" chrome "chrome://extensions"
goto :done

:other_browser
echo.
echo       Open your browser's extensions page yourself,
echo       for example brave://extensions or opera://extensions
explorer "%EXT%"

:done
echo.
echo  ==========================================
echo    All set!
echo    Open Discord, go to onhockey.tv, click a game
echo    then a stream link: your status will update.
echo  ==========================================
echo.
pause
