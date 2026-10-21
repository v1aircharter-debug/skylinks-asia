$SiteRoot = "C:\Users\moham\sites\Documents\skylinks-asia"
if (-not (Test-Path $SiteRoot)) {
    $SiteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$DataDir  = Join-Path $SiteRoot "data"
$AirportsPath = Join-Path $DataDir "airports.json"
$AircraftPath = Join-Path $DataDir "aircraft.json"

$utf8 = New-Object System.Text.UTF8Encoding($false)

# --- Airports ---
$ap = Get-Content $AirportsPath -Raw -Encoding UTF8 | ConvertFrom-Json
$apHash = @{}
foreach ($p in $ap.PSObject.Properties) { $apHash[$p.Name] = $p.Value }

$newAirports = @{
    "EGWU" = @{ city = "London Northolt"; country = "United Kingdom" }
    "EPWA" = @{ city = "Warsaw"; country = "Poland" }
    "LGIR" = @{ city = "Heraklion"; country = "Greece" }
    "LIRQ" = @{ city = "Florence"; country = "Italy" }
    "LYBE" = @{ city = "Belgrade"; country = "Serbia" }
    "YBBN" = @{ city = "Brisbane"; country = "Australia" }
    "VVDN" = @{ city = "Da Nang"; country = "Vietnam" }
    "EKSB" = @{ city = "Sonderborg"; country = "Denmark" }
    "EDDF" = @{ city = "Frankfurt"; country = "Germany" }
}
$addedAp = 0
foreach ($k in $newAirports.Keys) {
    if (-not $apHash.ContainsKey($k)) {
        $v = $newAirports[$k]
        $apHash[$k] = [PSCustomObject]@{ city = $v.city; country = $v.country }
        $addedAp++
    }
}
$sortedAp = [ordered]@{}
$apHash.Keys | Sort-Object | ForEach-Object { $sortedAp[$_] = $apHash[$_] }
[System.IO.File]::WriteAllText($AirportsPath, ($sortedAp | ConvertTo-Json -Depth 10), $utf8)

# --- Aircraft ---
$ac = Get-Content $AircraftPath -Raw -Encoding UTF8 | ConvertFrom-Json
$acHash = @{}
foreach ($p in $ac.models.PSObject.Properties) { $acHash[$p.Name] = $p.Value }

$newAircraft = @{
    "YAK-40" = @{ category = "Light Jet"; seats = 32 }
}
$addedAc = 0
foreach ($k in $newAircraft.Keys) {
    if (-not $acHash.ContainsKey($k)) {
        $v = $newAircraft[$k]
        $acHash[$k] = [PSCustomObject]@{ category = $v.category; seats = $v.seats }
        $addedAc++
    }
}
$sortedAc = [ordered]@{}
$acHash.Keys | Sort-Object | ForEach-Object { $sortedAc[$_] = $acHash[$_] }
$ac.models = $sortedAc
[System.IO.File]::WriteAllText($AircraftPath, ($ac | ConvertTo-Json -Depth 10), $utf8)

Write-Host "Registries updated: Added $addedAp airports, $addedAc aircraft." -ForegroundColor Green