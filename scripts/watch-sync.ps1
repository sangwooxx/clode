param(
    [string]$RootDir = "C:\Users\kubaz\Documents\Codex\agent_excel_mvp",
    [string]$ExcelPath = "",
    [string]$HoursExcelPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$syncScript = Join-Path $RootDir "scripts\sync-excel.ps1"
$hoursScript = Join-Path $RootDir "scripts\sync-hours.ps1"
$salesScript = Join-Path $RootDir "scripts\sync-sales.ps1"
$buildScript = Join-Path $RootDir "scripts\build-app-data.ps1"
$dataDir = Join-Path $RootDir "data"

if ([string]::IsNullOrWhiteSpace($ExcelPath)) {
    $match = Get-ChildItem -LiteralPath "C:\Users\kubaz\Documents\Codex" -Filter "*.xlsx" |
        Where-Object { $_.Name -like "*2025*kopia*.xlsx" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $match) {
        throw "No matching Excel copy found in workspace."
    }

    $ExcelPath = $match.FullName
}

if ([string]::IsNullOrWhiteSpace($HoursExcelPath)) {
    $hoursMatch = Get-ChildItem -LiteralPath "C:\Users\kubaz\Documents\Codex" -Filter "*.xlsx" |
        Where-Object { $_.Name -like "Zestawienie godzin*" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $hoursMatch) {
        throw "No hours workbook found in workspace."
    }

    $HoursExcelPath = $hoursMatch.FullName
}

$salesMatch = Get-ChildItem -LiteralPath "C:\Users\kubaz\Documents\Codex" -Filter "*.xlsx" |
    Where-Object { $_.Name -like "Plik sprzeda*AGZ*" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($null -eq $salesMatch) {
    throw "No sales workbook found in workspace."
}

$SalesExcelPath = $salesMatch.FullName

function Invoke-Sync {
    powershell -ExecutionPolicy Bypass -File $syncScript -ExcelPath $ExcelPath -OutputDir $dataDir | Out-Host
    powershell -ExecutionPolicy Bypass -File $hoursScript -HoursExcelPath $HoursExcelPath -OutputDir $dataDir | Out-Host
    powershell -ExecutionPolicy Bypass -File $salesScript -SalesExcelPath $SalesExcelPath -OutputDir $dataDir | Out-Host
    powershell -ExecutionPolicy Bypass -File $buildScript -RootDir $RootDir | Out-Host
}

Invoke-Sync

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = Split-Path -Path $ExcelPath -Parent
$watcher.Filter = Split-Path -Path $ExcelPath -Leaf
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
$watcher.EnableRaisingEvents = $true

$syncAction = {
    Start-Sleep -Milliseconds 800
    try {
        powershell -ExecutionPolicy Bypass -File $using:syncScript -ExcelPath $using:ExcelPath -OutputDir $using:dataDir | Out-Host
        powershell -ExecutionPolicy Bypass -File $using:hoursScript -HoursExcelPath $using:HoursExcelPath -OutputDir $using:dataDir | Out-Host
        powershell -ExecutionPolicy Bypass -File $using:salesScript -SalesExcelPath $using:SalesExcelPath -OutputDir $using:dataDir | Out-Host
        powershell -ExecutionPolicy Bypass -File $using:buildScript -RootDir $using:RootDir | Out-Host
    } catch {
        Write-Warning "Auto-sync failed: $($_.Exception.Message)"
    }
}

$null = Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $syncAction
$null = Register-ObjectEvent -InputObject $watcher -EventName Created -Action $syncAction
$null = Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $syncAction

$hoursWatcher = New-Object System.IO.FileSystemWatcher
$hoursWatcher.Path = Split-Path -Path $HoursExcelPath -Parent
$hoursWatcher.Filter = Split-Path -Path $HoursExcelPath -Leaf
$hoursWatcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
$hoursWatcher.EnableRaisingEvents = $true

$null = Register-ObjectEvent -InputObject $hoursWatcher -EventName Changed -Action $syncAction
$null = Register-ObjectEvent -InputObject $hoursWatcher -EventName Created -Action $syncAction
$null = Register-ObjectEvent -InputObject $hoursWatcher -EventName Renamed -Action $syncAction

$salesWatcher = New-Object System.IO.FileSystemWatcher
$salesWatcher.Path = Split-Path -Path $SalesExcelPath -Parent
$salesWatcher.Filter = Split-Path -Path $SalesExcelPath -Leaf
$salesWatcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
$salesWatcher.EnableRaisingEvents = $true

$null = Register-ObjectEvent -InputObject $salesWatcher -EventName Changed -Action $syncAction
$null = Register-ObjectEvent -InputObject $salesWatcher -EventName Created -Action $syncAction
$null = Register-ObjectEvent -InputObject $salesWatcher -EventName Renamed -Action $syncAction

Write-Host "Watching Excel file: $ExcelPath"
Write-Host "Watching hours file: $HoursExcelPath"
Write-Host "Watching sales file: $SalesExcelPath"

while ($true) {
    Start-Sleep -Seconds 5
}
