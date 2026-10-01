$ErrorActionPreference = 'Stop'
$explorerRoot = $PSScriptRoot
$pythonPath = Join-Path $explorerRoot '.venv\Scripts\python.exe'
$indexPath = Join-Path $explorerRoot 'abg-explorer\dist\client\index.html'
if (-not (Test-Path -LiteralPath $pythonPath)) { throw 'Python dependencies are missing. Follow the setup steps in README.md.' }
if (-not (Test-Path -LiteralPath $indexPath)) { throw 'Build the interface first using npm run build in abg-explorer.' }
Set-Location -LiteralPath $explorerRoot
# If this project's server is already running, reuse it.
$isRunning = $false
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8011/api/health' -TimeoutSec 2
    $isRunning = $health.status -eq 'ok' -and $health.app -eq 'ABG Pricing Explorer' -and $health.coefficient_count -eq 42
} catch { }
if ($isRunning) {
    Start-Process 'http://127.0.0.1:8011/'
    Write-Host 'ABG Pricing Explorer is already running at http://127.0.0.1:8011/'
    return
}
$serverProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-m','uvicorn','backend.app:app','--host','127.0.0.1','--port','8011') -WorkingDirectory $explorerRoot -WindowStyle Hidden -PassThru
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($serverProcess.HasExited) { throw 'The pricing service stopped during startup. Check that port 8011 is available.' }
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8011/api/health' -TimeoutSec 1
            if ($health.status -eq 'ok') { $ready = $true; break }
        } catch { }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'The pricing service did not become ready.' }
    Start-Process 'http://127.0.0.1:8011/'
    Write-Host 'ABG Pricing Explorer is running. Keep this window open; close it or press Ctrl+C to stop the server.'
    $serverProcess.WaitForExit()
} finally {
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
}
