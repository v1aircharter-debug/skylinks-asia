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
echo 2. Saving changes...
git add data scripts admin audit.ps1 audit.bat prune-flights.ps1 prune-flights.bat push-flights.bat
git commit -m "Update: Flight data push (%date%)"

echo.
echo 3. Syncing with GitHub...
git pull --rebase --autostash origin main
if errorlevel 1 (
    echo.
    echo SYNC FAILED. NOTHING WAS PUSHED. Copy the red text above and send it to Claude.
    pause
    exit /b 1
)

echo.
echo 4. Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo.
    echo PUSH FAILED. NOTHING IS LIVE. Copy the red text above and send it to Claude.
    pause
    exit /b 1
)

echo.
echo Latest saved version on GitHub:
git log -1 --format="%%h  %%s"
echo.
echo ====================================================
echo  PUSHED. Netlify is now building. Check Deploys in 30 seconds.
echo  https://www.skylinks.asia/empty-legs.html
echo ====================================================
pause