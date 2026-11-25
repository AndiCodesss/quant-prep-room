# Supervisor for Quant Prep Room on Windows: keeps the Node server and the Cloudflare tunnel running.
# - Server: restarted when its port stops listening, or when /healthz fails three checks in a row.
# - Tunnel: restarted when its process is gone.
# - Single instance: a mutex makes extra copies exit at once, so the scheduled task can relaunch it every 5 minutes.
# - Touch deploy\restart.flag to restart the server after an update.
# Autostart: deploy\windows\install-autostart.ps1
$ErrorActionPreference = 'Continue'
$mutex = New-Object System.Threading.Mutex($false, 'Global\quant-prep-room-supervisor')
try { if (-not $mutex.WaitOne(0)) { exit 0 } } catch [System.Threading.AbandonedMutexException] { }

$proj = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$cf   = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source
$cfg  = Join-Path $proj 'deploy\tunnel.yml'
$logs = Join-Path $proj 'deploy\logs'
$flag = Join-Path $proj 'deploy\restart.flag'
$port = 5190
$envLine = Select-String -Path (Join-Path $proj '.env') -Pattern '^PORT=(\d+)' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($envLine) { $port = [int]$envLine.Matches[0].Groups[1].Value }
New-Item -ItemType Directory -Force $logs | Out-Null
Set-Location $proj

# The server must not inherit another tool's Claude session: it signs in to Claude as this Windows user.
Get-ChildItem Env: | Where-Object { $_.Name -match '^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_AGENT_SDK_|ANTHROPIC_BASE_URL|AI_AGENT)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" }

function Log($msg) {
  $file = Join-Path $logs 'supervisor.log'
  try {
    if ((Test-Path $file) -and (Get-Item $file).Length -gt 1MB) { Move-Item -Force $file "$file.1" }
    Add-Content -Path $file -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $msg)
  } catch { }
}
function Keep($name) {
  # Keep the previous run's log so a crash reason survives the restart.
  foreach ($s in 'out', 'err') {
    $f = Join-Path $logs "$name.$s.log"
    if (Test-Path $f) { Move-Item -Force $f (Join-Path $logs "$name.$s.prev.log") }
  }
}
function Launch($name, $exe, $arguments) {
  Keep $name
  Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $proj -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs "$name.out.log") -RedirectStandardError (Join-Path $logs "$name.err.log")
}
function Healthy { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 "http://127.0.0.1:$port/healthz").StatusCode -eq 200 } catch { $false } }
function TunnelProc { Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | Where-Object { $_.CommandLine -like "*$cfg*" } }
function ServerPid { (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess }

Log "supervisor started (pid $PID)"
$self = (Get-Item $PSCommandPath).LastWriteTime
$fails = 0
while ($true) {
  try {
    # This script was edited: exit, and the scheduled task relaunches the new version.
    if ((Get-Item $PSCommandPath).LastWriteTime -ne $self) { Log 'serve.ps1 changed, exiting for reload'; $mutex.ReleaseMutex(); exit 0 }

    $serverPid = ServerPid
    if ($serverPid -and (Test-Path $flag)) {
      Log 'restart.flag found, restarting the server'
      Remove-Item -Force $flag
      Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 1
      $serverPid = $null
    }
    if (-not $serverPid) {
      Log 'starting the server'
      Launch 'server' $node 'server\server.mjs'
      $fails = 0
      Start-Sleep -Seconds 3
    } elseif (Healthy) { $fails = 0 }
    else {
      $fails++
      if ($fails -ge 3) { Log 'server is not answering, restarting it'; Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue; $fails = 0 }
    }

    if ((Test-Path $cfg) -and $cf -and -not (TunnelProc)) {
      Log 'starting the tunnel'
      Launch 'tunnel' $cf "tunnel --no-autoupdate --config `"$cfg`" run"
    }
  } catch { Log "supervisor error: $_" }
  Start-Sleep -Seconds 20
}
