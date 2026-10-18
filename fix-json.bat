@echo off
cd /d "%~dp0"
setlocal enabledelayedexpansion

echo ============================================================
echo  JSON REPAIR v3 - diagnose + auto-install
echo ============================================================
echo.

REM ======== STEP 1: Current state of data\ ========
echo --- STEP 1: Current state of data\ folder ---
echo.
if exist "data\airports.json" (
  for %%S in ("data\airports.json") do echo   data\airports.json: %%~zS bytes  %%~tS
  findstr /C:"LMML" "data\airports.json" >nul 2>&1
  if not errorlevel 1 (echo   Content: HAS LMML - NEW - OK) else (echo   Content: MISSING LMML - OLD - needs fix)
) else (
  echo   data\airports.json: MISSING
)
if exist "data\aircraft.json" (
  for %%S in ("data\aircraft.json") do echo   data\aircraft.json: %%~zS bytes  %%~tS
  findstr /C:"FALCON 6X" "data\aircraft.json" >nul 2>&1
  if not errorlevel 1 (echo   Content: HAS FALCON 6X - NEW - OK) else (echo   Content: MISSING FALCON 6X - OLD - needs fix)
) else (
  echo   data\aircraft.json: MISSING
)
echo.

REM ======== STEP 2: Scan for source candidates ========
echo --- STEP 2: Scanning root for source files ---
echo.
set "SRC_AIRPORTS="
set "SRC_AIRCRAFT="
for %%F in ("*.json" "*.json.txt" "*.txt" "data\*.txt") do (
  if exist "%%~F" (
    findstr /C:"LMML" "%%~F" >nul 2>&1
    if not errorlevel 1 set "SRC_AIRPORTS=%%~F"
    findstr /C:"FALCON 6X" "%%~F" >nul 2>&1
    if not errorlevel 1 set "SRC_AIRCRAFT=%%~F"
  )
)
if defined SRC_AIRPORTS (echo   Airports source: !SRC_AIRPORTS!) else (echo   Airports source: NOT FOUND)
if defined SRC_AIRCRAFT (echo   Aircraft source: !SRC_AIRCRAFT!) else (echo   Aircraft source: NOT FOUND)
echo.

REM ======== STEP 3: List root files ========
echo --- STEP 3: All .json/.txt files in root ---
echo.
for %%F in ("*.json" "*.json.txt" "*.txt") do (
  if exist "%%~F" for %%S in ("%%~F") do echo   %%~nxF   %%~zS bytes
) 2>nul
echo.

REM ======== STEP 4: Auto-install ========
echo --- STEP 4: Install ---
echo.
if not exist "data\" mkdir data
if defined SRC_AIRPORTS (
  copy /Y "!SRC_AIRPORTS!" "data\airports.json" >nul
  echo   Installed: !SRC_AIRPORTS! -^> data\airports.json
) else (
  echo   SKIP: no source for airports.json found
)
if defined SRC_AIRCRAFT (
  copy /Y "!SRC_AIRCRAFT!" "data\aircraft.json" >nul
  echo   Installed: !SRC_AIRCRAFT! -^> data\aircraft.json
) else (
  echo   SKIP: no source for aircraft.json found
)
echo.

REM ======== STEP 5: Verify ========
echo --- STEP 5: Final state ---
echo.
if exist "data\airports.json" (
  findstr /C:"LMML" "data\airports.json" >nul 2>&1
  if not errorlevel 1 (echo   data\airports.json: PASS) else (echo   data\airports.json: FAIL - no LMML)
)
if exist "data\aircraft.json" (
  findstr /C:"FALCON 6X" "data\aircraft.json" >nul 2>&1
  if not errorlevel 1 (echo   data\aircraft.json: PASS) else (echo   data\aircraft.json: FAIL - no FALCON 6X)
)
echo.

echo ============================================================
echo  Screenshot this whole window and send to DeepSeek.
echo ============================================================
pause