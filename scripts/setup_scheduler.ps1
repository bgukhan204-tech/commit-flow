# CommitFlow - Windows Task Scheduler Setup
# Registers a daily background task to make 10 commits automatically

$TaskName = "CommitFlowDaily"
$ScriptPath = Join-Path $PSScriptRoot "daily.js"
$NodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source

if (-not $NodeExe) {
    Write-Host "❌ Node.js was not found in PATH. Please install Node.js." -ForegroundColor Red
    Exit 1
}

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host " CommitFlow - Windows Task Scheduler Configurator" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "Task Name: $TaskName"
Write-Host "Node Path: $NodeExe"
Write-Host "Script:    $ScriptPath"
Write-Host "Schedule:  Daily at 20:00 (8:00 PM)"

$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$ScriptPath`"" -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$Trigger = New-ScheduledTaskTrigger -Daily -At 8:00PM
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

try {
    # Unregister existing task if present
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Automated 10 Daily Commits for GitHub"
    Write-Host "`n✅ Scheduled Task '$TaskName' registered successfully!" -ForegroundColor Green
    Write-Host "It will run every day at 8:00 PM in the background." -ForegroundColor Yellow
} catch {
    Write-Host "`n⚠️ Could not register task automatically. You can run as Administrator or use GitHub Actions instead." -ForegroundColor Red
    Write-Host "Error: $_"
}
