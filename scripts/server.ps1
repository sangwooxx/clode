param(
    [string]$HostName = "localhost",
    [int]$Port = 8080,
    [string]$RootDir = "",
    [string]$ExcelPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RootDir)) {
    $RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$workspaceRoot = Split-Path -Parent $RootDir

$appDir = Join-Path $RootDir "app"
$dataDir = Join-Path $RootDir "data"
$frontendDir = Join-Path $RootDir "frontend-legacy"
$sharedDir = Join-Path $RootDir "shared"
$syncScript = Join-Path $RootDir "scripts\sync-excel.ps1"

if ([string]::IsNullOrWhiteSpace($ExcelPath)) {
    $match = Get-ChildItem -LiteralPath $workspaceRoot -Filter "*.xlsx" |
        Where-Object { $_.Name -like "*2025*kopia*.xlsx" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($null -eq $match) {
        throw "No matching Excel copy found in workspace."
    }

    $ExcelPath = $match.FullName
}

function Invoke-Sync {
    powershell -ExecutionPolicy Bypass -File $syncScript -ExcelPath $ExcelPath -OutputDir $dataDir | Out-Host
}

function Get-ContentType {
    param([string]$Path)
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".css" { return "text/css; charset=utf-8" }
        ".js" { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        default { return "text/plain; charset=utf-8" }
    }
}

function Send-Bytes {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [byte[]]$Bytes,
        [string]$ContentType,
        [int]$StatusCode = 200
    )
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    $Response.ContentLength64 = $Bytes.Length
    $Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Response.OutputStream.Close()
}

function Send-Text {
    param(
        [System.Net.HttpListenerResponse]$Response,
        [string]$Text,
        [string]$ContentType = "text/plain; charset=utf-8",
        [int]$StatusCode = 200
    )
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    Send-Bytes -Response $Response -Bytes $bytes -ContentType $ContentType -StatusCode $StatusCode
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
    } catch {
        Write-Warning "Synchronizacja po zmianie pliku nie powiodła się: $($_.Exception.Message)"
    }
}

$null = Register-ObjectEvent -InputObject $watcher -EventName Changed -Action $syncAction
$null = Register-ObjectEvent -InputObject $watcher -EventName Created -Action $syncAction
$null = Register-ObjectEvent -InputObject $watcher -EventName Renamed -Action $syncAction

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://$HostName`:$Port/")
$listener.Start()

Write-Host "MVP działa pod adresem http://$HostName`:$Port/"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestPath = $context.Request.Url.AbsolutePath

        if ($requestPath -eq "/") {
            $filePath = Join-Path $appDir "index.html"
        } elseif ($requestPath.StartsWith("/app/")) {
            $filePath = Join-Path $appDir ($requestPath.Substring(5).Replace("/", "\"))
        } elseif ($requestPath.StartsWith("/frontend-legacy/")) {
            $filePath = Join-Path $frontendDir ($requestPath.Substring(17).Replace("/", "\"))
        } elseif ($requestPath.StartsWith("/shared/")) {
            $filePath = Join-Path $sharedDir ($requestPath.Substring(8).Replace("/", "\"))
        } elseif ($requestPath.StartsWith("/data/")) {
            $filePath = Join-Path $dataDir ($requestPath.Substring(6).Replace("/", "\"))
        } elseif ($requestPath -eq "/api/refresh") {
            try {
                Invoke-Sync
                Send-Text -Response $context.Response -Text '{"ok":true}' -ContentType "application/json; charset=utf-8"
            } catch {
                $message = $_.Exception.Message.Replace('"', "'")
                Send-Text -Response $context.Response -Text "{""ok"":false,""error"":""$message""}" -ContentType "application/json; charset=utf-8" -StatusCode 500
            }
            continue
        } else {
            Send-Text -Response $context.Response -Text "404 Not Found" -StatusCode 404
            continue
        }

        if (-not (Test-Path -LiteralPath $filePath)) {
            Send-Text -Response $context.Response -Text "404 Not Found" -StatusCode 404
            continue
        }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        Send-Bytes -Response $context.Response -Bytes $bytes -ContentType (Get-ContentType -Path $filePath)
    }
} finally {
    $listener.Stop()
    $listener.Close()
    $watcher.Dispose()
}
