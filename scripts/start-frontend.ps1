param(
    [string]$ProjectRoot = "",
    [int]$Port = 3100,
    [string]$BindHost = "127.0.0.1",
    [int]$StartupTimeoutSec = 90,
    [ValidateSet("prod", "dev")]
    [string]$Mode = "dev"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$frontendRoot = Join-Path $ProjectRoot "frontend-next"
$packageJsonPath = Join-Path $frontendRoot "package.json"

if (-not (Test-Path -LiteralPath $packageJsonPath)) {
    throw "Nie znaleziono frontend-next pod $frontendRoot."
}

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    $npmCommand = Get-Command npm -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
}
if (-not $npmCommand) {
    throw "npm runtime not found."
}

$frontendUrl = "http://$BindHost`:$Port/login"
function Test-FrontendReady {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-PortListenerPids {
    param([int]$TargetPort)

    $pattern = "^\s*TCP\s+\S+:$TargetPort\s+\S+\s+LISTENING\s+(\d+)\s*$"
    $matches = netstat -ano -p tcp | Select-String -Pattern $pattern
    $pids = @()
    foreach ($match in $matches) {
        if ($match.Matches.Count -gt 0) {
            $pids += [int]$match.Matches[0].Groups[1].Value
        }
    }
    return $pids | Select-Object -Unique
}

function Stop-PortListeners {
    param([int]$TargetPort)

    foreach ($listenerPid in Get-PortListenerPids -TargetPort $TargetPort) {
        try {
            Stop-Process -Id $listenerPid -Force -ErrorAction Stop
        } catch {
            Write-Warning "Nie udalo sie zatrzymac procesu PID $listenerPid na porcie ${TargetPort}: $($_.Exception.Message)"
        }
    }
}

function Stop-NextFrontendProcesses {
    param([string]$FrontendPath)

    $normalizedPath = [System.IO.Path]::GetFullPath($FrontendPath)
    $processes = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "node.exe" -and
        $_.CommandLine -and
        $_.CommandLine.Contains($normalizedPath) -and
        $_.CommandLine -like "*next*"
    }

    foreach ($process in $processes) {
        try {
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        } catch {
            Write-Warning "Nie udalo sie zatrzymac procesu PID $($process.ProcessId) dla frontend-next: $($_.Exception.Message)"
        }
    }
}

function Wait-FrontendReady {
    param(
        [string]$Url,
        [int]$TimeoutSec
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        if (Test-FrontendReady -Url $Url) {
            return $true
        }
        Start-Sleep -Milliseconds 750
    } while ((Get-Date) -lt $deadline)

    return $false
}

Stop-PortListeners -TargetPort $Port
Stop-NextFrontendProcesses -FrontendPath $frontendRoot

if ($Mode -eq "prod") {
    Push-Location $frontendRoot
    try {
        & $npmCommand "run" "build"
        if ($LASTEXITCODE -ne 0) {
            throw "Build frontend-next zakonczyl sie bledem."
        }
    } finally {
        Pop-Location
    }

    $startCommand = "Set-Location -LiteralPath '$frontendRoot'; npm run start -- --hostname $BindHost --port $Port"
    Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-Command", $startCommand) -WorkingDirectory $frontendRoot | Out-Null
} else {
    $startCommand = "Set-Location -LiteralPath '$frontendRoot'; npm run dev -- --hostname $BindHost --port $Port"
    Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-Command", $startCommand) -WorkingDirectory $frontendRoot | Out-Null
}

if (-not (Wait-FrontendReady -Url $frontendUrl -TimeoutSec $StartupTimeoutSec)) {
    throw "Frontend-next nie zglosil gotowosci pod $frontendUrl w ciagu $StartupTimeoutSec s."
}

Write-Host "Uruchomiono frontend-next pod $frontendUrl"
