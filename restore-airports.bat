@echo off
cd /d "%~dp0"

echo ============================================================
echo  RESTORE airports.json from git + verify
echo ============================================================
echo.

if not exist "data\airports.json" (
    echo ERROR: data\airports.json not found. Aborting.
    pause
    exit /b 3
)

echo Current file (destructive replacement):
for %%S in ("data\airports.json") do echo   Size: %%~zS bytes  Modified: %%~tS
echo.

echo Backing up current to data\airports.json.bad ...
copy /Y "data\airports.json" "data\airports.json.bad" >nul
echo   Backup saved.
echo.

echo Trying: git restore from last commit...
git restore --source=HEAD -- "data/airports.json" 2>nul
if errorlevel 1 (
    git checkout HEAD -- data\airports.json 2>nul
)
if errorlevel 1 (
    echo   WARNING: git restore failed.
    echo   File may not be committed. Keeping current.
) else (
    echo   Restored from git HEAD.
)
echo.

echo New file state:
for %%S in ("data\airports.json") do echo   Size: %%~zS bytes  Modified: %%~tS
echo.

echo Checking for known codes...
findstr /C:"LMML" "data\airports.json" >nul 2>&1
if not errorlevel 1 (echo   LMML: present) else (echo   LMML: MISSING)
findstr /C:"LTAI" "data\airports.json" >nul 2>&1
if not errorlevel 1 (echo   LTAI: present) else (echo   LTAI: MISSING)
findstr /C:"LSGG" "data\airports.json" >nul 2>&1
if not errorlevel 1 (echo   LSGG: present) else (echo   LSGG: MISSING)
echo.

echo ============================================================
echo  Next: run audit.bat to see remaining unknowns
echo ============================================================
pause