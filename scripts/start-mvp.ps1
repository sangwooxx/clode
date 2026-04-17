param(
    [string]$RootDir = "",
    [string]$ExcelPath = "",
    [int]$Port = 0,
    [string]$BindHost = "127.0.0.1",
    [ValidateSet("next", "legacy")]
    [string]$Frontend = "next"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$watchScript = Join-Path $RootDir "scripts\watch-sync.ps1"
$backendScript = Join-Path $RootDir "scripts\start-backend.ps1"
$frontendScript = if ($Frontend -eq "legacy") {
    Join-Path $RootDir "scripts\start-frontend-legacy.ps1"
} else {
    Join-Path $RootDir "scripts\start-frontend.ps1"
}
$watchArgs = @(
    "-ExecutionPolicy", "Bypass",
    "-File", $watchScript,
    "-RootDir", $RootDir
)

if ($Port -le 0) {
    $Port = if ($Frontend -eq "legacy") { 8082 } else { 3100 }
}

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
$frontendUrl = if ($Frontend -eq "legacy") {
    "http://$BindHost`:$Port/app/index.html"
} else {
    "http://$BindHost`:$Port/login"
}
Start-Process $frontendUrl | Out-Null
Write-Host "Uruchomiono Clode MVP pod $frontendUrl"
