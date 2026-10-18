<#
============================================================
 SKYLINKS ASIA - EMPTY LEGS JSON AUDIT v1.1
 Fixed: reads "models" wrapper in aircraft.json
============================================================
#>

param([string]$FlightsPath = "")

$SiteRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir  = Join-Path $SiteRoot "data"
if ([string]::IsNullOrWhiteSpace($FlightsPath)) {
    $FlightsPath = Join-Path $DataDir "flights.json"
} elseif (-not [System.IO.Path]::IsPathRooted($FlightsPath)) {
    $FlightsPath = Join-Path $SiteRoot $FlightsPath
}
$AirportsPath = Join-Path $DataDir "airports.json"
$AircraftPath = Join-Path $DataDir "aircraft.json"

function Write-HR    { param([string]$ch = '=')  Write-Host ($ch * 62) }
function Write-Title { param([string]$t)  Write-HR '='; Write-Host $t -ForegroundColor White; Write-HR '=' }
function Write-Sec   { param([string]$t)  Write-Host ''; Write-Host $t -ForegroundColor Cyan; Write-HR '-' }
function Write-Ok    { param([string]$t)  Write-Host "  [OK] $t" -ForegroundColor Green }
function Write-Warn  { param([string]$t)  Write-Host "  [!!] $t" -ForegroundColor Yellow }
function Write-Fail  { param([string]$t)  Write-Host "  [XX] $t" -ForegroundColor Red }
function Write-Info  { param([string]$t)  Write-Host "       $t" -ForegroundColor DarkGray }
function Write-KV    { param([string]$k, [string]$v)  Write-Host ("  " + $k.PadRight(28) + " " + $v) }
function Get-Bar {
    param([int]$n, [int]$max, [int]$width = 20)
    if ($max -le 0) { return '' }
    $filled = [Math]::Max(1, [int][Math]::Round(($n / $max) * $width))
    return ('#' * $filled).PadRight($width, '.')
}

function Read-JsonFile {
    param([string]$Path, [string]$Label)
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{ Missing = $true; Path = $Path; Label = $Label; Data = $null }
    }
    try {
        $raw  = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
        return @{ Missing = $false; Path = $Path; Label = $Label; Data = ($raw | ConvertFrom-Json) }
    } catch {
        Write-Host ""
        Write-Host ("ERROR: Cannot parse " + $Label) -ForegroundColor Red
        Write-Host ("       " + $_.Exception.Message)
        exit 3
    }
}

function Get-FlightsArray {
    param($Data)
    if ($null -eq $Data) { return $null }
    if ($Data -is [System.Array]) { return @($Data) }
    if ($Data -is [PSCustomObject]) {
        foreach ($prop in @('flights','items','data')) {
            if ($Data.PSObject.Properties.Name -contains $prop) {
                $v = $Data.$prop
                if ($null -ne $v) { return @($v) }
            }
        }
    }
    return $null
}

# ===== FIXED v1.1: handles "models" wrapper in aircraft.json =====
function Get-CodeSet {
    param($Data)
    if ($null -eq $Data) { return $null }
    $set = New-Object 'System.Collections.Generic.HashSet[string]'
    if ($Data -is [System.Array]) {
        foreach ($x in $Data) {
            if ($null -eq $x -or -not ($x -is [PSCustomObject])) { continue }
            foreach ($k in @('icao','iata','code','type','name')) {
                if ($x.PSObject.Properties.Name -contains $k) {
                    $v = $x.$k
                    if ($null -ne $v -and "$v" -ne '') { [void]$set.Add((("" + $v).ToUpper())) }
                }
            }
        }
        return ,$set
    }
    if ($Data -is [PSCustomObject]) {
        foreach ($wrapper in @('models','aircraft','airports','data')) {
            if ($Data.PSObject.Properties.Name -contains $wrapper) {
                $inner = $Data.$wrapper
                if ($null -ne $inner -and $inner -is [PSCustomObject]) {
                    foreach ($p in $inner.PSObject.Properties.Name) { [void]$set.Add($p.ToUpper()) }
                    return ,$set
                }
            }
        }
        foreach ($p in $Data.PSObject.Properties.Name) {
            if (-not $p.StartsWith('_')) { [void]$set.Add($p.ToUpper()) }
        }
    }
    return ,$set
}

function Get-Field {
    param($Obj, [string[]]$Aliases)
    if ($null -eq $Obj -or -not ($Obj -is [PSCustomObject])) { return $null }
    foreach ($a in $Aliases) {
        if ($Obj.PSObject.Properties.Name -contains $a) {
            $v = $Obj.$a
            if ($null -ne $v -and "$v" -ne '') { return $v }
        }
    }
    return $null
}

$F_ORIGIN    = @('origin','from','departure','dep_icao','dep_iata','origin_code')
$F_DEST      = @('destination','to','arrival','arr_icao','arr_iata','dest_code')
$F_DATE      = @('date','departure_date','dep_date','flight_date','departureDate')
$F_AIRCRAFT  = @('aircraft','aircraft_type','type','ac_type','ac')
$F_SEATS     = @('seats','capacity','pax','seat_count')
$F_SEATS_EST = @('seats_est','estimated','seatsEstimated')

$Today = (Get-Date).ToString('yyyy-MM-dd')
$Stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')

Write-Host ''
Write-Title 'SKYLINKS ASIA - EMPTY LEGS JSON AUDIT v1.1'
Write-KV 'Flights file:' $FlightsPath
Write-KV 'Run at:'       $Stamp
Write-KV 'Site root:'    $SiteRoot

$flightSrc = Read-JsonFile -Path $FlightsPath -Label 'flights.json'
if ($flightSrc.Missing) {
    Write-Host 'ERROR: flights.json not found.' -ForegroundColor Red
    Write-Host ('       Expected: ' + $FlightsPath)
    exit 3
}
$flights = Get-FlightsArray -Data $flightSrc.Data
if ($null -eq $flights) { Write-Host 'ERROR: flights.json shape unknown.' -ForegroundColor Red; exit 3 }

$airportsSrc = Read-JsonFile -Path $AirportsPath -Label 'airports.json'
$aircraftSrc = Read-JsonFile -Path $AircraftPath -Label 'aircraft.json'
$validAirports = if ($airportsSrc.Missing) { $null } else { Get-CodeSet -Data $airportsSrc.Data }
$validAircraft = if ($aircraftSrc.Missing) { $null } else { Get-CodeSet -Data $aircraftSrc.Data }

Write-Info ("Airports registry: " + $(if ($validAirports) { $validAirports.Count.ToString() + " codes" } else { "NOT LOADED" }))
Write-Info ("Aircraft registry: " + $(if ($validAircraft) { $validAircraft.Count.ToString() + " types" } else { "NOT LOADED" }))

$issues = @{
    TLV=@(); SameCity=@(); HasOperator=@(); HasReg=@()
    MissOrigin=@(); MissDest=@(); MissDate=@(); MissAircraft=@(); MissSeats=@()
    BadOrigin=@(); BadDest=@(); BadAircraft=@(); PastDate=@(); Dupes=@(); SeatsEstNoValue=@()
}
$origins=@{}; $dests=@{}; $routes=@{}; $acTypes=@{}
$seatActual=0; $seatEstimates=0; $dateMin=$null; $dateMax=$null; $seen=@{}

$idx = 0
foreach ($f in $flights) {
    $idx++
    $o   = Get-Field $f $F_ORIGIN
    $d   = Get-Field $f $F_DEST
    $dt  = Get-Field $f $F_DATE
    $ac  = Get-Field $f $F_AIRCRAFT
    $st  = Get-Field $f $F_SEATS
    $est = Get-Field $f $F_SEATS_EST
    $O = if ($null -ne $o) { ("" + $o).ToUpper() } else { '' }
    $D = if ($null -ne $d) { ("" + $d).ToUpper() } else { '' }
    $A = if ($null -ne $ac) { ("" + $ac).ToUpper() } else { '' }

    if ($null -eq $o) { $issues.MissOrigin += $idx }
    else {
        $origins[$O] = 1 + [int]($origins[$O])
        if ($O -eq 'TLV') { $issues.TLV += $idx }
        if ($null -ne $validAirports -and -not $validAirports.Contains($O)) { $issues.BadOrigin += @{i=$idx;v=$O} }
    }
    if ($null -eq $d) { $issues.MissDest += $idx }
    else {
        $dests[$D] = 1 + [int]($dests[$D])
        if ($D -eq 'TLV') { $issues.TLV += $idx }
        if ($null -ne $validAirports -and -not $validAirports.Contains($D)) { $issues.BadDest += @{i=$idx;v=$D} }
    }
    if ($null -ne $o -and $null -ne $d -and $O -eq $D) { $issues.SameCity += $idx }
    if ($null -ne $o -and $null -ne $d) { $r = "$O->$D"; $routes[$r] = 1 + [int]($routes[$r]) }
    if ($null -eq $dt) { $issues.MissDate += $idx }
    else {
        $ds = ("" + $dt); if ($ds.Length -ge 10) { $ds = $ds.Substring(0,10) }
        if ($null -eq $dateMin -or $ds -lt $dateMin) { $dateMin = $ds }
        if ($null -eq $dateMax -or $ds -gt $dateMax) { $dateMax = $ds }
        if ($ds -lt $Today) { $issues.PastDate += @{i=$idx;d=$ds} }
    }
    if ($null -eq $ac) { $issues.MissAircraft += $idx }
    else {
        $acTypes[$A] = 1 + [int]($acTypes[$A])
        if ($null -ne $validAircraft -and -not $validAircraft.Contains($A)) { $issues.BadAircraft += @{i=$idx;v=$A} }
    }
    $estOn = ($est -eq $true -or "$est" -eq 'true' -or "$est" -eq '1')
    if ($null -eq $st -and -not $estOn) { $issues.MissSeats += $idx }
    elseif ($estOn -and $null -eq $st)  { $issues.SeatsEstNoValue += $idx }
    elseif ($estOn)                      { $seatEstimates++ }
    elseif ($null -ne $st)               { $seatActual++ }
    if ($f -is [PSCustomObject]) {
        $keys = @($f.PSObject.Properties.Name | ForEach-Object { $_.ToLower() })
        if ($keys | Where-Object { @('operator','operator_name','operatorname','operators') -contains $_ }) { $issues.HasOperator += $idx }
        if ($keys | Where-Object { @('registration','reg','tail','tail_number','tailnumber') -contains $_ }) { $issues.HasReg += $idx }
    }
    $ds2 = if ($null -ne $dt) { ("" + $dt).Substring(0, [Math]::Min(10,( "" + $dt).Length)) } else { '' }
    $key = "$O|$D|$ds2|$A"
    if ($seen.ContainsKey($key)) { $issues.Dupes += @{a=$seen[$key];b=$idx;key=$key} } else { $seen[$key] = $idx }
}

$total = $flights.Count
Write-Sec 'SUMMARY'
Write-KV 'Total flights:'            ([string]$total)
Write-KV 'Unique origins:'           ([string]$origins.Count)
Write-KV 'Unique destinations:'      ([string]$dests.Count)
Write-KV 'Unique routes (O->D):'     ([string]$routes.Count)
Write-KV 'Unique aircraft types:'    ([string]$acTypes.Count)
$range = if ($dateMin -and $dateMax) { "$dateMin  ->  $dateMax" } else { '(none)' }
Write-KV 'Date range:'               $range
Write-KV 'Seats: actual / estimated:' ("$seatActual / $seatEstimates")

Write-Sec 'RULE L6 FILTER VIOLATIONS   (must be 0)'
$vChecks = @(
    @{ L='Tel Aviv (TLV) flights:';     A=$issues.TLV },
    @{ L='Same-city flights:';          A=$issues.SameCity },
    @{ L='Operator field present:';     A=$issues.HasOperator },
    @{ L='Registration field present:'; A=$issues.HasReg }
)
foreach ($c in $vChecks) {
    if ($c.A.Count -eq 0) { Write-Ok ($c.L + ' 0') }
    else { Write-Fail ($c.L + ' ' + $c.A.Count) }
}

Write-Sec 'FIELD COMPLETENESS'
$fChecks = @(
    @{ L='Missing origin:';      A=$issues.MissOrigin },
    @{ L='Missing destination:'; A=$issues.MissDest },
    @{ L='Missing date:';        A=$issues.MissDate },
    @{ L='Missing aircraft:';    A=$issues.MissAircraft },
    @{ L='Missing seats:';       A=$issues.MissSeats }
)
foreach ($c in $fChecks) {
    if ($c.A.Count -eq 0) { Write-Ok ($c.L + ' 0') }
    else { Write-Fail ($c.L + ' ' + $c.A.Count) }
}

if ($null -ne $validAirports) {
    Write-Sec 'AIRPORT VALIDATION   (against data/airports.json)'
    if ($issues.BadOrigin.Count -eq 0) { Write-Ok 'All origins recognised' }
    else {
        Write-Fail ('Unknown origins: ' + $issues.BadOrigin.Count)
        $issues.BadOrigin | ForEach-Object { Write-Warn ("Flight #" + $_.i + ": " + $_.v) }
    }
    if ($issues.BadDest.Count -eq 0) { Write-Ok 'All destinations recognised' }
    else {
        Write-Fail ('Unknown destinations: ' + $issues.BadDest.Count)
        $issues.BadDest | ForEach-Object { Write-Warn ("Flight #" + $_.i + ": " + $_.v) }
    }
}

if ($null -ne $validAircraft) {
    Write-Sec 'AIRCRAFT VALIDATION   (against data/aircraft.json)'
    if ($issues.BadAircraft.Count -eq 0) { Write-Ok 'All aircraft types recognised' }
    else {
        Write-Fail ('Unknown aircraft types: ' + $issues.BadAircraft.Count)
        $issues.BadAircraft | Select-Object -First 10 | ForEach-Object { Write-Warn ("Flight #" + $_.i + ": " + $_.v) }
        if ($issues.BadAircraft.Count -gt 10) { Write-Info ("...and " + ($issues.BadAircraft.Count - 10) + " more") }
    }
}

Write-Sec 'WARNINGS'
$warnCount = 0
if ($issues.PastDate.Count -gt 0) {
    $warnCount += $issues.PastDate.Count
    Write-Warn ($issues.PastDate.Count.ToString() + " flight(s) with date in the past (today=" + $Today + ")")
}
if ($issues.Dupes.Count -gt 0) {
    $warnCount += $issues.Dupes.Count
    Write-Warn ($issues.Dupes.Count.ToString() + " duplicate flight(s)")
}
if ($issues.SeatsEstNoValue.Count -gt 0) {
    $warnCount += $issues.SeatsEstNoValue.Count
    Write-Warn ($issues.SeatsEstNoValue.Count.ToString() + " flight(s) with seats_est=true but no seats value")
}
if ($warnCount -eq 0) { Write-Ok 'No warnings.' }

$failCount = 0
foreach ($c in $vChecks) { $failCount += $c.A.Count }
foreach ($c in $fChecks) { $failCount += $c.A.Count }
$failCount += $issues.BadOrigin.Count
$failCount += $issues.BadDest.Count
$failCount += $issues.BadAircraft.Count

Write-Host ''
Write-HR '='
if ($failCount -gt 0) {
    Write-Host ("AUDIT RESULT: FAIL - " + $failCount + " violation(s).") -ForegroundColor Red
    Write-HR '='
    exit 1
} elseif ($warnCount -gt 0) {
    Write-Host ("AUDIT RESULT: WARN - 0 violations, " + $warnCount + " warning(s).") -ForegroundColor Yellow
    Write-HR '='
    exit 2
} else {
    Write-Host 'AUDIT RESULT: PASS - clean.' -ForegroundColor Green
    Write-HR '='
    exit 0
}