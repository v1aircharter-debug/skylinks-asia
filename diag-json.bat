@echo off
cd /d "%~dp0"
echo ============================================================
echo  JSON DIAGNOSTIC - read only
echo ============================================================
echo.

echo === Files in data\ ===
for %%F in (data\*.json) do (
  if exist "%%F" for %%S in ("%%F") do echo   %%~nxF   %%~zS bytes   %%~tS
)
echo.

echo === Backup files in data\ (proof merge ran) ===
set "FOUND_BAK=0"
for %%F in (data\*.bak-*) do (
  if exist "%%F" (
    echo   %%~nxF
    set "FOUND_BAK=1"
  )
)
if "%FOUND_BAK%"=="0" echo   (no .bak-* files - merge-json has NEVER run)
echo.

echo === Content checks on data\airports.json ===
findstr /C:"LMML" "data\airports.json" >nul 2>&1
if not errorlevel 1 (echo   LMML: PRESENT) else (echo   LMML: MISSING - merge did not take effect)
findstr /C:"VRDA" "data\airports.json" >nul 2>&1
if not errorlevel 1 (echo   VRDA: PRESENT) else (echo   VRDA: MISSING)
findstr /C:"EGNL" "data\airports.json" >nul 2>&1
if not errorlevel 1 (echo   EGNL: PRESENT) else (echo   EGNL: MISSING)
echo.

echo === Content checks on data\aircraft.json ===
findstr /C:"CITATION X" "data\aircraft.json" >nul 2>&1
if not errorlevel 1 (echo   CITATION X: PRESENT) else (echo   CITATION X: MISSING - merge did not take effect)
findstr /C:"CHALLENGER 3500" "data\aircraft.json" >nul 2>&1
if not errorlevel 1 (echo   CHALLENGER 3500: PRESENT) else (echo   CHALLENGER 3500: MISSING)
findstr /C:"NEXTANT 400XT" "data\aircraft.json" >nul 2>&1
if not errorlevel 1 (echo   NEXTANT 400XT: PRESENT) else (echo   NEXTANT 400XT: MISSING)
echo.

echo ============================================================
echo  Screenshot and send to DeepSeek.
echo ============================================================
pause