param(
  [Parameter(Mandatory=$true)][string]$Action,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$ManagerArgs
)
$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Candidate = $ScriptDir
if (-not (Test-Path (Join-Path $Candidate 'runtime\node\node.exe'))) {
  $Candidate = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
}
$Node = Join-Path $Candidate 'runtime\node\node.exe'
$Manager = Join-Path $Candidate 'runtime\manager.mjs'
if (-not (Test-Path $Node)) { throw "Bundled Node runtime is missing: $Node" }
& $Node $Manager $Action --bundle $Candidate @ManagerArgs
exit $LASTEXITCODE
