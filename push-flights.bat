@echo off
title Push Flights to Live
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo  DEPLOYING EMPTY-LEGS DATA TO NETLIFY
echo ====================================================
echo.

echo 1. Running Audit...
call audit.bat
if errorlevel 1 (
    echo AUDIT FAILED. FIX DATA BEFORE PUSHING.
    pause
    exit /b 1
)

echo.
echo 2. Committing and Pushing...
git add data/flights.json
git commit -m "Update: Flight data push (%date%)"
git pull --rebase origin main
git push origin main

echo.
echo ====================================================
echo  DONE! Netlify is now building. Check in 15 seconds:
echo  https://www.skylinks.asia/empty-legs.html
echo ====================================================
pause