param(
    [string]$RootDir = "C:\Users\kubaz\Documents\Codex\agent_excel_mvp",
    [string]$ExcelPath = "",
    [int]$Port = 8082,
    [string]$BindHost = "127.0.0.1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$watchScript = Join-Path $RootDir "scripts\watch-sync.ps1"
$backendScript = Join-Path $RootDir "scripts\start-backend.ps1"
$frontendScript = Join-Path $RootDir "scripts\start-frontend.ps1"
$watchArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $watchScript,
    "-RootDir", $RootDir
)

if (-not [string]::IsNullOrWhiteSpace($ExcelPath)) {
    $watchArgs += @("-ExcelPath", $ExcelPath)
}

Start-Process powershell -ArgumentList $watchArgs | Out-Null
Start-Sleep -Seconds 2
& powershell -NoProfile -ExecutionPolicy Bypass -File $backendScript -ProjectRoot $RootDir -BindHost $BindHost | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Backend nie uruchomil sie poprawnie."
}
& powershell -NoProfile -ExecutionPolicy Bypass -File $frontendScript -ProjectRoot $RootDir -Port $Port -BindHost $BindHost | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Frontend nie uruchomil sie poprawnie."
}
Start-Process "http://$BindHost`:$Port/app/index.html" | Out-Null
Write-Host "Uruchomiono backend, watcher synchronizacji i lokalne MVP pod http://$BindHost`:$Port/app/index.html"
