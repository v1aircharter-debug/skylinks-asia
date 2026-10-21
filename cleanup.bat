@echo off
echo Cleaning up old scripts and backups...
if exist .mojibake-backup-* rmdir /s /q .mojibake-backup-*
del /q audit.js 2>nul
del /q data-aircraft.json 2>nul
del /q data-airports.json 2>nul
del /q finalize-import.bat 2>nul
del /q fix-airports.js 2>nul
del /q fix-mobile*.bat 2>nul
del /q merge-json.bat 2>nul
del /q merge-json.ps1 2>nul
del /q restore-airports.bat 2>nul
del /q update-codes.ps1 2>nul
del /q fix-encoding-final.bat 2>nul
del /q fix-airports.bat 2>nul
del /q data\*.bak-* 2>nul
echo Cleanup Complete!
pause