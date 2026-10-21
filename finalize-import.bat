@echo off
cd /d "C:\Users\moham\sites\Documents\skylinks-asia"
title Skylinks Asia - Finalize Import

echo ============================================================
echo  FINALIZING CLEAN SLATE
echo ============================================================
echo.

echo === 1. Moving new flight data to data\flights.json ===
if exist "data-flights.json" (
    move /Y "data-flights.json" "data\flights.json" >nul
    echo   SUCCESS: data-flights.json -^> data\flights.json
) else if exist "data-flights.json.txt" (
    move /Y "data-flights.json.txt" "data\flights.json" >nul
    echo   SUCCESS: data-flights.json.txt -^> data\flights.json
) else if exist "data\data-flights.json" (
    move /Y "data\data-flights.json" "data\flights.json" >nul
    echo   SUCCESS: data\data-flights.json -^> data\flights.json
) else (
    echo   NOTE: Could not find a stray data-flights.json file. Assuming flights.json is already correct.
)
echo.

echo === 2. Adding missing airports and aircraft ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-codes.ps1"
echo.

echo === 3. Running Audit ===
call audit.bat

echo.
echo ============================================================
echo  DONE. If Audit says PASS, run the push commands.
echo ============================================================
pause