$line = netstat -ano | Select-String ':8766'
if ($line) { Write-Host "PORT 8766 LISTENING:"; $line | ForEach-Object { Write-Host $_.Line } }
else { Write-Host "PORT 8766 NOT LISTENING" }
