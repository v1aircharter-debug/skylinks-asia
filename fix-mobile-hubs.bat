@echo off
cd /d "C:\Users\moham\sites\Documents\skylinks-asia"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$files = @('empty-legs-middle-east.html', 'empty-legs-asia.html'); foreach ($f in $files) { if (Test-Path $f) { $c = Get-Content $f -Raw; $c = $c -replace '{ threshold: 0.1 }', '{ threshold: 0 }'; $c = $c -replace '</style>', '  /* Mobile Fix: Force tall grids to render */`n  .grid.fade-in { opacity: 1 !important; transform: translateY(0) !important; }`n</style>'; [System.IO.File]::WriteAllText((Resolve-Path $f), $c, (New-Object System.Text.UTF8Encoding($false))); Write-Host ('Patched: ' + $f) } }"
echo.
echo Hub pages patched for mobile visibility!
pause