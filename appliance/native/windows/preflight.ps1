param([Parameter(ValueFromRemainingArguments=$true)][string[]]$ManagerArgs)
& (Join-Path $PSScriptRoot 'Invoke-ApplianceManager.ps1') -Action preflight -ManagerArgs $ManagerArgs
exit $LASTEXITCODE
