@echo off
title Skylinks Asia - Prune Past-Dated Flights
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0prune-flights.ps1"
echo.
pause