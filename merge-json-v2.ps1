<#
 MERGE JSON V2 - bulletproof
 Uses hashtable round-trip (no Add-Member). Self-verifies after write.
#>

$SiteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir  = Join-Path $SiteRoot "data"
$AirportsPath = Join-Path $DataDir "airports.json"
$AircraftPath = Join-Path $DataDir "aircraft.json"

if (-not (Test-Path $AirportsPath)) { Write-Host "FATAL: airports.json not found at $AirportsPath" -ForegroundColor Red; exit 3 }
if (-not (Test-Path $AircraftPath)) { Write-Host "FATAL: aircraft.json not found at $AircraftPath" -ForegroundColor Red; exit 3 }

$Stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
Copy-Item $AirportsPath "$AirportsPath.bak-$Stamp" -Force
Copy-Item $AircraftPath "$AircraftPath.bak-$Stamp" -Force
Write-Host ("Backups: .bak-" + $Stamp) -ForegroundColor DarkGray
Write-Host ""

$utf8 = New-Object System.Text.UTF8Encoding($false)

# ============================================================
# AIRPORTS - hashtable round-trip
# ============================================================
$raw = Get-Content $AirportsPath -Raw -Encoding UTF8
$obj = $raw | ConvertFrom-Json

$hash = @{}
foreach ($p in $obj.PSObject.Properties) {
    $hash[$p.Name] = $p.Value
}
$startCount = $hash.Count
Write-Host ("airports.json: reading " + $startCount + " codes") -ForegroundColor Gray

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

$addedAp = 0
foreach ($code in $newAirports.Keys) {
    if ($hash.ContainsKey($code)) {
        Write-Host ("  skip " + $code + " (already present)") -ForegroundColor DarkGray
    } else {
        $e = $newAirports[$code]
        $hash[$code] = [PSCustomObject]@{ city = $e.city; country = $e.country }
        $addedAp++
    }
}

# Sort alphabetically for clean JSON
$sortedAirports = [ordered]@{}
$hash.Keys | Sort-Object | ForEach-Object { $sortedAirports[$_] = $hash[$_] }

$json = $sortedAirports | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($AirportsPath, $json, $utf8)

# VERIFY
$recheck = Get-Content $AirportsPath -Raw -Encoding UTF8 | ConvertFrom-Json
$endCount = @($recheck.PSObject.Properties).Count
$verified = if ($recheck.PSObject.Properties.Name -contains "LMML") { "PASS" } else { "FAIL" }
Write-Host ("airports.json: " + $startCount + " -> " + $endCount + "  added " + $addedAp + "  VERIFY: " + $verified) -ForegroundColor Cyan
if ($verified -eq "FAIL") {
    Write-Host "  ERROR: write did not persist. File may be locked." -ForegroundColor Red
    Write-Host "  Restoring from backup..." -ForegroundColor Yellow
    Copy-Item "$AirportsPath.bak-$Stamp" $AirportsPath -Force
    exit 1
}

# ============================================================
# AIRCRAFT - hashtable round-trip on .models
# ============================================================
$raw = Get-Content $AircraftPath -Raw -Encoding UTF8
$obj = $raw | ConvertFrom-Json

$modelsHash = @{}
foreach ($p in $obj.models.PSObject.Properties) {
    $modelsHash[$p.Name] = $p.Value
}
$startAc = $modelsHash.Count
Write-Host ("aircraft.json: reading " + $startAc + " models") -ForegroundColor Gray

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

$addedAc = 0
foreach ($type in $newAircraft.Keys) {
    if ($modelsHash.ContainsKey($type)) {
        Write-Host ("  skip " + $type + " (already present)") -ForegroundColor DarkGray
    } else {
        $e = $newAircraft[$type]
        $modelsHash[$type] = [PSCustomObject]@{ category = $e.category; seats = $e.seats }
        $addedAc++
    }
}

# Rebuild aircraft.json with sorted models
$newModels = [ordered]@{}
$modelsHash.Keys | Sort-Object | ForEach-Object { $newModels[$_] = $modelsHash[$_] }

$aircraftOut = [ordered]@{}
foreach ($p in $obj.PSObject.Properties) {
    if ($p.Name -eq 'models') {
        $aircraftOut['models'] = $newModels
    } else {
        $aircraftOut[$p.Name] = $p.Value
    }
}

$json = $aircraftOut | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($AircraftPath, $json, $utf8)

# VERIFY
$recheck = Get-Content $AircraftPath -Raw -Encoding UTF8 | ConvertFrom-Json
$endAc = @($recheck.models.PSObject.Properties).Count
$verified = if ($recheck.models.PSObject.Properties.Name -contains "CITATION X") { "PASS" } else { "FAIL" }
Write-Host ("aircraft.json: " + $startAc + " -> " + $endAc + "  added " + $addedAc + "  VERIFY: " + $verified) -ForegroundColor Cyan
if ($verified -eq "FAIL") {
    Write-Host "  ERROR: write did not persist." -ForegroundColor Red
    Copy-Item "$AircraftPath.bak-$Stamp" $AircraftPath -Force
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " MERGE V2 COMPLETE - both files verified" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: run audit.bat" -ForegroundColor Yellow