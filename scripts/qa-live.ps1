# qa-live.ps1 - start / stop / status for the Growth Operator dev servers.
# Windows PowerShell 5.1 compatible. ASCII only.
#
# Run from the project root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action status
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action start   [-Target api|web|all]
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action stop    [-Target api|web|all]
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\qa-live.ps1 -Action restart [-Target api|web|all]
#
# Each server runs in its OWN minimized window, so this script ALWAYS returns.
# It never waits for a server to exit. Logs: .qa\logs\api.log and .qa\logs\web.log
# Exit codes: 0 = ok/ready, 1 = not ready in time, 2 = cannot restart (server not started by this script)

param(
  [Parameter(Mandatory = $true)][ValidateSet('start', 'stop', 'status', 'restart')][string]$Action,
  [ValidateSet('api', 'web', 'all')][string]$Target = 'all',
  [int]$WaitSeconds = 90
)

$ErrorActionPreference = 'Continue'
$root   = Split-Path -Parent $PSScriptRoot
$qaDir  = Join-Path $root '.qa'
$logDir = Join-Path $qaDir 'logs'
$pidDir = Join-Path $qaDir 'pids'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $pidDir | Out-Null

$svc = @{
  api = @{ Port = 3001; Filter = '@growth-operator/api'; Url = 'http://localhost:3001/api/v1/health' }
  web = @{ Port = 5173; Filter = '@growth-operator/web'; Url = 'http://localhost:5173/' }
}

function Test-PortOpen([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $client.BeginConnect('localhost', $Port, $null, $null)
    if ($iar.AsyncWaitHandle.WaitOne(1500, $false) -and $client.Connected) { return $true }
    return $false
  } catch { return $false }
  finally { $client.Close() }
}

function Test-Http([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400)
  } catch { return $false }
}

function Get-PidFile([string]$Name) { return (Join-Path $pidDir ($Name + '.pid')) }

function Start-Svc([string]$Name) {
  $s = $svc[$Name]
  if (Test-PortOpen $s.Port) {
    Write-Output ("{0}: port {1} already open - ADOPTING the running server (not restarting it)" -f $Name, $s.Port)
    return
  }
  $log    = Join-Path $logDir ($Name + '.log')
  $runner = Join-Path $qaDir ('run-' + $Name + '.ps1')
  $lines = @(
    "Set-Location -LiteralPath '$root'",
    "`$host.UI.RawUI.WindowTitle = 'growth-operator $Name'",
    "pnpm --filter=$($s.Filter) dev 2>&1 | Tee-Object -FilePath '$log'"
  )
  Set-Content -LiteralPath $runner -Value $lines -Encoding UTF8
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-NoExit', '-File', ('"' + $runner + '"'))
  $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -WindowStyle Minimized -PassThru
  Set-Content -LiteralPath (Get-PidFile $Name) -Value $p.Id
  Write-Output ("{0}: launched in its own window (PID {1}); log: {2}" -f $Name, $p.Id, $log)
}

function Stop-Svc([string]$Name) {
  $pf = Get-PidFile $Name
  if (Test-Path -LiteralPath $pf) {
    $id = [int]((Get-Content -LiteralPath $pf -Raw).Trim())
    & taskkill.exe /PID $id /T /F 2>&1 | Out-Null
    Remove-Item -LiteralPath $pf -Force -ErrorAction SilentlyContinue
    Write-Output ("{0}: stopped (window PID {1} and its child processes)" -f $Name, $id)
    $deadline = (Get-Date).AddSeconds(10)
    while ((Test-PortOpen $svc[$Name].Port) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Seconds 1 }
  } else {
    Write-Output ("{0}: no PID recorded - it was NOT started by this script. Not touching it." -f $Name)
  }
}

function Show-Status {
  foreach ($n in @('api', 'web')) {
    $s = $svc[$n]
    $open = Test-PortOpen $s.Port
    $ok = $false
    if ($open) { $ok = Test-Http $s.Url }
    $owned = Test-Path -LiteralPath (Get-PidFile $n)
    Write-Output ("{0}: port {1} open={2} http_ok={3} started_by_script={4} log=.qa\logs\{0}.log" -f $n, $s.Port, $open, $ok, $owned)
  }
}

function Wait-Ready([string[]]$Names, [int]$TimeoutSec) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $allOk = $true
    foreach ($n in $Names) {
      $s = $svc[$n]
      if (-not ((Test-PortOpen $s.Port) -and (Test-Http $s.Url))) { $allOk = $false }
    }
    if ($allOk) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Start-And-Wait([string[]]$Names) {
  foreach ($n in $Names) { Start-Svc $n }
  if (Wait-Ready $Names $WaitSeconds) {
    Write-Output 'READY'
    Show-Status
    exit 0
  }
  Write-Output 'NOT READY within the time limit. Read the logs: Get-Content .qa\logs\api.log -Tail 40 ; Get-Content .qa\logs\web.log -Tail 40'
  Show-Status
  exit 1
}

$names = @('api', 'web')
if ($Target -ne 'all') { $names = @($Target) }

switch ($Action) {
  'status' { Show-Status; exit 0 }
  'stop'   { foreach ($n in $names) { Stop-Svc $n }; exit 0 }
  'start'  { Start-And-Wait $names }
  'restart' {
    foreach ($n in $names) {
      if (-not (Test-Path -LiteralPath (Get-PidFile $n)) -and (Test-PortOpen $svc[$n].Port)) {
        Write-Output ("{0}: CANNOT RESTART - it was not started by this script. Ask the human to restart it." -f $n)
        exit 2
      }
    }
    foreach ($n in $names) { Stop-Svc $n }
    Start-Sleep -Seconds 3
    Start-And-Wait $names
  }
}
