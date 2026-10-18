@echo off
title Skylinks Asia - Empty Legs Audit
cd /d "%~dp0"

if not exist "audit.ps1" (
  echo.
  echo ERROR: audit.ps1 not found next to this .bat file.
  echo Expected in: %~dp0
  echo.
  pause
  exit /b 3
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0audit.ps1" %*
set RC=%errorlevel%

echo.
if "%RC%"=="0" echo RESULT: PASS  -  Safe to push.
if "%RC%"=="1" echo RESULT: FAIL  -  Fix data/flights.json before pushing.
if "%RC%"=="2" echo RESULT: WARN  -  Review warnings above.
if "%RC%"=="3" echo RESULT: ERROR -  File read or JSON parse error.
echo.
pause
exit /b %RC%