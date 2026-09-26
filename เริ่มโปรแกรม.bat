@echo off
rem Sub360 launcher.
rem Keep this file ASCII-only with CRLF line endings: cmd.exe misreads batch files
rem that contain multi-byte UTF-8 text (e.g. Thai) after "chcp 65001" and starts
rem running commands from the middle of a line. Thai messages live in
rem scripts\preflight.mjs and server\index.mjs instead.
setlocal EnableExtensions
chcp 65001 >nul
title Sub360
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto node_missing

node scripts\preflight.mjs
if errorlevel 1 goto failed

node server\index.mjs --open
if errorlevel 1 goto failed
goto end

:node_missing
echo.
echo   [Sub360] Node.js was not found on this computer.
echo   Please install Node.js 22 LTS or newer from https://nodejs.org
echo   then double-click this file again.
echo.
start "" "https://nodejs.org/"
pause
exit /b 1

:failed
echo.
echo   [Sub360] Stopped because of the error shown above.
echo.
pause
exit /b 1

:end
endlocal
