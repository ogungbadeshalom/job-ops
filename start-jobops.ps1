$ErrorActionPreference = 'Stop'

# Kill any existing node processes
if ($PID = Get-Process -Name node -ErrorAction SilentlyContinue) {
    Stop-Process -Id $PID.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped existing Node processes"
}

# Remove existing database if present
if (Test-Path "orchestrator\data\jobs.db") {
    Remove-Item "orchestrator\data\jobs.db" -Force
    Write-Host "Removed existing database"
}

# Rebuild sqlite dependencies
Write-Host "Rebuilding sqlite dependencies..."
Set-Location "orchestrator"
$process = Start-Process -NoNewWindow -PassThru -FilePath "npm" -ArgumentList "--workspace orchestrator rebuild better-sqlite3"
$process.WaitForExit()
Write-Host "Rebuild completed"

# Start the server
Write-Host "Starting JobOps server..."
Set-Location "orchestrator"
$serverProcess = Start-Process -NoNewWindow -PassThru -FilePath "npm" -ArgumentList "--workspace orchestrator run dev:server"

# Write PID to file for cleanup
$process.Id | Out-File "orchestrator\server.pid"

# Monitor server output
$logFile = "$env:TEMP\server-start.log"
Write-Host "Server logs will be written to $logFile"

# Wait for server to be ready
$maxWait = 60
$waited = 0
$serverReady = $false

Write-Host "Waiting for server to start... (timeout: $maxWait seconds)"

while (-not $serverReady -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 2
    $waited += 2
    
    if (Test-Path $logFile) {
        $logs = Get-Content $logFile
        if ($logs -match "Server running at: http://localhost:3001") {
            $serverReady = $true
            Write-Host "✅ Server started successfully!"
            break
        }
    }
}

if (-not $serverReady) {
    Write-Host "⚠️ Server did not start within expected time. Check server.log for errors."
}

# Keep the script running to keep the process alive
while ($true) {
    Start-Sleep -Seconds 1
}
