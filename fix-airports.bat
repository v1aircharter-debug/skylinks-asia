@echo off
echo Adding missing airports to data\airports.json...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p='data\airports.json';" ^
  "$j=Get-Content $p -Raw | ConvertFrom-Json;" ^
  "$a=@{" ^
  "  'BIKF'=@{city='Reykjavik';country='Iceland'};" ^
  "  'EBBR'=@{city='Brussels';country='Belgium'};" ^
  "  'KJFK'=@{city='New York';country='United States'};" ^
  "  'LERL'=@{city='Ciudad Real';country='Spain'};" ^
  "  'LIMZ'=@{city='Cuneo';country='Italy'};" ^
  "  'LROP'=@{city='Bucharest';country='Romania'};" ^
  "  'OPLA'=@{city='Lahore';country='Pakistan'};" ^
  "  'ORER'=@{city='Erbil';country='Iraq'};" ^
  "  'RJFF'=@{city='Fukuoka';country='Japan'};" ^
  "  'UTSS'=@{city='Samarkand';country='Uzbekistan'};" ^
  "  'VMMC'=@{city='Macau';country='China'};" ^
  "  'ZBTJ'=@{city='Tianjin';country='China'}" ^
  "};" ^
  "$c=0;" ^
  "foreach($k in $a.Keys){" ^
  "  if(-not ($j.PSObject.Properties.Name -contains $k)){" ^
  "    $j | Add-Member -MemberType NoteProperty -Name $k -Value $a[$k];" ^
  "    $c++" ^
  "  }" ^
  "};" ^
  "$j | ConvertTo-Json -Depth 10 | Out-File $p -Encoding utf8;" ^
  "Write-Host \"Success! Added $c airports.\""
echo.
echo Next: run audit.bat to verify.
pause