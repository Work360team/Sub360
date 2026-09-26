@echo off
rem Sub360 installer for Windows 10/11 - double-click to install.
rem It downloads and runs scripts/install.ps1 from GitHub, which puts portable
rem Node.js + Git and the app in %LOCALAPPDATA%\Sub360 and adds a desktop icon.
rem Keep this file ASCII-only with CRLF line endings (see the launcher .bat).
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/Work360team/Sub360/main/scripts/install.ps1|iex"
