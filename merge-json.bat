@echo off
title Skylinks Asia - JSON Merge
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0merge-json.ps1"
echo.
pause