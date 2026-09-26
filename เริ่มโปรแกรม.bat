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

rem Portable Node.js and Git that the installer (scripts\install.ps1) put in
rem runtime\ win over whatever is (or is not) installed system-wide.
if exist "runtime\node\node.exe" set "PATH=%CD%\runtime\node;%PATH%"
if exist "runtime\git\cmd\git.exe" set "PATH=%CD%\runtime\git\cmd;%PATH%"

where node >nul 2>nul
if errorlevel 1 goto node_missing

rem Update to the latest version with git pull (scripts\update.mjs), then start.
rem Exit code 3 means new code was pulled: this file may have been rewritten while
rem cmd.exe is still reading it, so restart it from the top on the SAME line
rem (cmd parses the whole line before running it). "--updated" stops a loop.
if /i "%~1"=="--updated" goto preflight
node scripts\update.mjs & if errorlevel 3 "%~f0" --updated

:preflight
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
