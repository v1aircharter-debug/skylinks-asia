<#
 SKYLINKS ASIA - ADDITIVE JSON MERGE (v1.0)
 Adds missing keys, never deletes existing ones, backs up first.
 Run via merge-json.bat, or: powershell -File merge-json.ps1
#>

$SiteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir  = Join-Path $SiteRoot "data"
$AirportsPath = Join-Path $DataDir "airports.json"
$AircraftPath = Join-Path $DataDir "aircraft.json"

if (-not (Test-Path $AirportsPath)) { Write-Host "ERROR: airports.json missing" -ForegroundColor Red; exit 3 }
if (-not (Test-Path $AircraftPath)) { Write-Host "ERROR: aircraft.json missing" -ForegroundColor Red; exit 3 }

# ---------- Backups ----------
$Stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
Copy-Item $AirportsPath "$AirportsPath.bak-$Stamp" -Force
Copy-Item $AircraftPath "$AircraftPath.bak-$Stamp" -Force
Write-Host "Backups written with suffix .bak-$Stamp" -ForegroundColor DarkGray
Write-Host ""

# ---------- Airports ----------
$airports  = Get-Content $AirportsPath -Raw -Encoding UTF8 | ConvertFrom-Json
$startAp   = @($airports.PSObject.Properties).Count

$newAirports = @{
    "LMML" = @{ city = "Malta (Luqa)"; country = "Malta" }
    "LIPZ" = @{ city = "Venice"; country = "Italy" }
    "ELLX" = @{ city = "Luxembourg"; country = "Luxembourg" }
    "HESN" = @{ city = "Aswan"; country = "Egypt" }
    "EDDN" = @{ city = "Nuremberg"; country = "Germany" }
    "VRDA" = @{ city = "Maafaru"; country = "Maldives" }
    "FCOO" = @{ city = "Owando"; country = "Congo" }
    "MMMX" = @{ city = "Mexico City"; country = "Mexico" }
    "KPVD" = @{ city = "Providence"; country = "United States" }
    "EKCH" = @{ city = "Copenhagen"; country = "Denmark" }
    "LIBD" = @{ city = "Bari"; country = "Italy" }
    "LBSF" = @{ city = "Sofia"; country = "Bulgaria" }
    "LICD" = @{ city = "Lampedusa"; country = "Italy" }
    "HEGZ" = @{ city = "El Gorah"; country = "Egypt" }
    "LIRP" = @{ city = "Pisa"; country = "Italy" }
    "LUKK" = @{ city = "Chisinau"; country = "Moldova" }
    "EGNL" = @{ city = "Barrow-in-Furness"; country = "United Kingdom" }
    "ESSA" = @{ city = "Stockholm"; country = "Sweden" }
    "OEGS" = @{ city = "Buraydah"; country = "Saudi Arabia" }
}

$addedAp = 0; $skippedAp = 0
foreach ($code in $newAirports.Keys) {
    if ($airports.PSObject.Properties.Name -contains $code) {
        $skippedAp++
    } else {
        $e = $newAirports[$code]
        $obj = [PSCustomObject]@{ city = $e.city; country = $e.country }
        $airports | Add-Member -NotePropertyName $code -NotePropertyValue $obj
        $addedAp++
    }
}

$json = $airports | ConvertTo-Json -Depth 10
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($AirportsPath, $json, $utf8)

$endAp = @($airports.PSObject.Properties).Count
Write-Host ("Airports: " + $startAp + " -> " + $endAp + "  (added " + $addedAp + ", skipped " + $skippedAp + ")") -ForegroundColor Cyan

# ---------- Aircraft ----------
$aircraft = Get-Content $AircraftPath -Raw -Encoding UTF8 | ConvertFrom-Json
$startAc  = @($aircraft.models.PSObject.Properties).Count

$newAircraft = @{
    "FALCON 2000LXS EASY II" = @{ category = "Super midsize"; seats = 10 }
    "FALCON 2000EX"          = @{ category = "Super midsize"; seats = 9 }
    "FALCON 50EX"            = @{ category = "Midsize"; seats = 9 }
    "CITATION X"             = @{ category = "Midsize"; seats = 9 }
    "CHALLENGER 3500"        = @{ category = "Super midsize"; seats = 9 }
    "BOEING 767 BBJ"         = @{ category = "VIP airliner"; seats = 30 }
    "AIRBUS ACJ A319 NEO"    = @{ category = "VIP airliner"; seats = 19 }
    "NEXTANT 400XT"          = @{ category = "Light"; seats = 7 }
}

$addedAc = 0; $skippedAc = 0
foreach ($type in $newAircraft.Keys) {
    if ($aircraft.models.PSObject.Properties.Name -contains $type) {
        $skippedAc++
    } else {
        $e = $newAircraft[$type]
        $obj = [PSCustomObject]@{ category = $e.category; seats = $e.seats }
        $aircraft.models | Add-Member -NotePropertyName $type -NotePropertyValue $obj
        $addedAc++
    }
}

$json = $aircraft | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($AircraftPath, $json, $utf8)

$endAc = @($aircraft.models.PSObject.Properties).Count
Write-Host ("Aircraft: " + $startAc + " -> " + $endAc + "  (added " + $addedAc + ", skipped " + $skippedAc + ")") -ForegroundColor Cyan

Write-Host ""
Write-Host "Merge complete. Next: double-click audit.bat" -ForegroundColor Green