<#
 SKYLINKS ASIA - PRUNE PAST-DATED FLIGHTS (v1.0)
 Reads data/flights.json, drops flights with date < today, writes back.
 Backs up first, self-verifies, auto-restores on failure.
 Idempotent - safe to re-run.
#>

$SiteRoot    = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir     = Join-Path $SiteRoot "data"
$FlightsPath = Join-Path $DataDir "flights.json"

if (-not (Test-Path $FlightsPath)) {
    Write-Host "FATAL: flights.json not found at $FlightsPath" -ForegroundColor Red
    exit 3
}

$Stamp      = (Get-Date).ToString('yyyyMMdd-HHmmss')
$BackupPath = "$FlightsPath.bak-$Stamp"
Copy-Item $FlightsPath $BackupPath -Force
Write-Host ("Backup: " + (Split-Path -Leaf $BackupPath)) -ForegroundColor DarkGray
Write-Host ""

$utf8 = New-Object System.Text.UTF8Encoding($false)
$raw  = Get-Content $FlightsPath -Raw -Encoding UTF8
$obj  = $raw | ConvertFrom-Json

# ---------- detect wrapper shape ----------
$wrapperKey   = $null
$flightsArray = $null

if ($obj -is [System.Array]) {
    $flightsArray = @($obj)
} elseif ($obj -is [PSCustomObject]) {
    foreach ($k in @('flights','items','data')) {
        if ($obj.PSObject.Properties.Name -contains $k) {
            $candidate = $obj.$k
            if ($null -ne $candidate) {
                $wrapperKey   = $k
                $flightsArray = @($candidate)
                break
            }
        }
    }
}

if ($null -eq $flightsArray) {
    Write-Host "FATAL: cannot detect flights array shape." -ForegroundColor Red
    Write-Host ("       Top-level keys: " + (($obj.PSObject.Properties | ForEach-Object { $_.Name }) -join ", "))
    Write-Host "       Restoring backup..."
    Copy-Item $BackupPath $FlightsPath -Force
    exit 3
}

$startCount = $flightsArray.Count
$today      = (Get-Date).ToString('yyyy-MM-dd')

Write-Host ("flights.json: reading " + $startCount + " flights   (today = " + $today + ")") -ForegroundColor Gray
if ($wrapperKey) { Write-Host ("  wrapper key: ." + $wrapperKey) -ForegroundColor DarkGray }
Write-Host ""

# ---------- field aliases (match audit.ps1) ----------
$dateAliases   = @('date','departure_date','dep_date','flight_date','departureDate')
$originAliases = @('origin','from','departure','dep_icao','dep_iata','origin_code')
$destAliases   = @('destination','to','arrival','arr_icao','arr_iata','dest_code')

function Get-DateValue {
    param($Rec)
    if ($null -eq $Rec -or -not ($Rec -is [PSCustomObject])) { return $null }
    foreach ($a in $dateAliases) {
        if ($Rec.PSObject.Properties.Name -contains $a) {
            $v = $Rec.$a
            if ($null -ne $v -and "$v" -ne '') { return "$v" }
        }
    }
    return $null
}
function Get-StrField {
    param($Rec, [string[]]$Aliases)
    if ($null -eq $Rec -or -not ($Rec -is [PSCustomObject])) { return '' }
    foreach ($a in $Aliases) {
        if ($Rec.PSObject.Properties.Name -contains $a) {
            $v = $Rec.$a
            if ($null -ne $v -and "$v" -ne '') { return "$v" }
        }
    }
    return ''
}

# ---------- partition ----------
$kept    = New-Object System.Collections.ArrayList
$pruned  = New-Object System.Collections.ArrayList
$noDate  = 0

$idx = 0
foreach ($f in $flightsArray) {
    $idx++
    $dv = Get-DateValue $f
    if ($null -eq $dv) {
        # Cannot prove past-date: keep as-is
        [void]$kept.Add($f)
        $noDate++
        continue
    }
    $ds = $dv
    if ($ds.Length -ge 10) { $ds = $ds.Substring(0,10) }
    if ($ds -lt $today) {
        [void]$pruned.Add([PSCustomObject]@{
            Num  = $idx
            Date = $ds
            Route = ((Get-StrField $f $originAliases) + " -> " + (Get-StrField $f $destAliases))
        })
    } else {
        [void]$kept.Add($f)
    }
}

$prunedCount = $pruned.Count
$keptCount   = $kept.Count

Write-Host ("Flights with unparseable date (kept): " + $noDate) -ForegroundColor DarkGray
Write-Host ("Flights pruned (date < " + $today + "): " + $prunedCount) -ForegroundColor Yellow
Write-Host ("Flights kept: " + $keptCount) -ForegroundColor Green
Write-Host ""

if ($prunedCount -eq 0) {
    Write-Host "Nothing to prune - flights.json already clean." -ForegroundColor Green
    Write-Host "Backup will be removed (no changes made)." -ForegroundColor DarkGray
    Remove-Item $BackupPath -Force
    exit 0
}

# ---------- safety guard ----------
if ($keptCount -eq 0) {
    Write-Host "REFUSING to write: prune would remove ALL flights." -ForegroundColor Red
    Write-Host "Backup preserved at: " + $BackupPath -ForegroundColor Yellow
    exit 1
}

# ---------- show pruned list ----------
Write-Host "Pruned flights:" -ForegroundColor Yellow
foreach ($p in $pruned) {
    Write-Host ("  Flight #" + $p.Num.ToString().PadRight(4) + "  " + $p.Date + "  " + $p.Route) -ForegroundColor DarkGray
}
Write-Host ""

# ---------- write ----------
if ($wrapperKey) {
    $newTop = [ordered]@{}
    foreach ($p in $obj.PSObject.Properties) {
        if ($p.Name -eq $wrapperKey) {
            $newTop[$p.Name] = @($kept.ToArray())
        } else {
            $newTop[$p.Name] = $p.Value
        }
    }
    $json = ConvertTo-Json -InputObject $newTop -Depth 10
} else {
    $json = ConvertTo-Json -InputObject @($kept.ToArray()) -Depth 10
}

[System.IO.File]::WriteAllText($FlightsPath, $json, $utf8)
Write-Host ("Written: " + (Split-Path -Leaf $FlightsPath)) -ForegroundColor Cyan
Write-Host ""

# ---------- verify ----------
$recheck = $null
try {
    $recheck = (Get-Content $FlightsPath -Raw -Encoding UTF8) | ConvertFrom-Json
} catch {
    Write-Host "VERIFY FAILED: written file does not parse." -ForegroundColor Red
    Write-Host "Restoring backup..." -ForegroundColor Yellow
    Copy-Item $BackupPath $FlightsPath -Force
    exit 1
}

# Re-detect shape in recheck
$recheckArr = $null
if ($recheck -is [System.Array]) {
    $recheckArr = @($recheck)
} elseif ($recheck -is [PSCustomObject] -and $wrapperKey) {
    $recheckArr = @($recheck.$wrapperKey)
}

if ($null -eq $recheckArr) {
    Write-Host "VERIFY FAILED: re-read shape mismatch." -ForegroundColor Red
    Copy-Item $BackupPath $FlightsPath -Force
    exit 1
}

$stillPast = 0
foreach ($f in $recheckArr) {
    $dv = Get-DateValue $f
    if ($null -ne $dv) {
        $ds = $dv; if ($ds.Length -ge 10) { $ds = $ds.Substring(0,10) }
        if ($ds -lt $today) { $stillPast++ }
    }
}

$verifyCount = $recheckArr.Count
$verifyOk = ($verifyCount -eq $keptCount) -and ($stillPast -eq 0)

Write-Host ("Verify: " + $verifyCount + " flights on disk, " + $stillPast + " still past-dated.") -ForegroundColor $(if ($verifyOk) { "Green" } else { "Red" })
Write-Host ""

if (-not $verifyOk) {
    Write-Host "VERIFY FAILED - restoring backup." -ForegroundColor Red
    Copy-Item $BackupPath $FlightsPath -Force
    exit 1
}

Write-Host "============================================" -ForegroundColor Green
Write-Host " PRUNE COMPLETE - verified" -ForegroundColor Green
Write-Host (" " + $startCount + " -> " + $verifyCount + " flights (" + $prunedCount + " pruned)") -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: double-click audit.bat" -ForegroundColor Yellow
exit 0