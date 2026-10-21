@echo off
cd /d "C:\Users\moham\sites\Documents\skylinks-asia"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$files = @('empty-legs-middle-east.html', 'empty-legs-asia.html'); foreach ($f in $files) { if (Test-Path $f) { $c = Get-Content $f -Raw; $c = $c -replace 'gap-6 fade-in', 'gap-6'; [System.IO.File]::WriteAllText((Resolve-Path $f), $c, (New-Object System.Text.UTF8Encoding($false))); Write-Host ('Fixed mobile visibility: ' + $f) } }"
echo.
echo All HTML hub pages patched!
pause