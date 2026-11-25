# Registers the scheduled task "QuantPrepRoom": runs the supervisor (serve.ps1) hidden when you log on,
# and every 5 minutes as a safety net (extra copies exit at once). No administrator rights needed.
# Remove it again with:  Unregister-ScheduledTask -TaskName QuantPrepRoom -Confirm:$false
$serve = Join-Path $PSScriptRoot 'serve.ps1'
$action = New-ScheduledTaskAction -Execute 'conhost.exe' `
  -Argument "--headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$serve`""
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 5))
)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'QuantPrepRoom' -Action $action -Trigger $triggers -Settings $settings `
  -Description 'Quant Prep Room: Node server and Cloudflare tunnel supervisor' -Force | Out-Null
Start-ScheduledTask -TaskName 'QuantPrepRoom'
Get-ScheduledTask -TaskName 'QuantPrepRoom' | Select-Object TaskName, State
