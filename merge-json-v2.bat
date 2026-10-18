@echo off
title Skylinks Asia - JSON Merge v2
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0merge-json-v2.ps1"
echo.
pause