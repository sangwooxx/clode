param(
    [string]$ProjectRoot = "",
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8787,
    [int]$StartupTimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$pythonCandidates = @(@(
    (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
    (Get-Command py -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)

if (-not $pythonCandidates -or $pythonCandidates.Count -eq 0) {
    throw "Python runtime not found."
}

$python = $pythonCandidates[0]
$serverScript = Join-Path $ProjectRoot "backend\run_server.py"
$healthUrl = "http://$BindHost`:$Port/api/health"

function Test-BackendHealthy {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
        if ($response.StatusCode -ne 200) {
            return $false
        }
        $payload = $response.Content | ConvertFrom-Json
        return $payload.ok -eq $true -and $payload.service -eq "clode-backend"
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

function Wait-BackendReady {
    param(
        [string]$Url,
        [int]$TimeoutSec
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    do {
        if (Test-BackendHealthy -Url $Url) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return $false
}

if (-not (Test-Path -LiteralPath $serverScript)) {
    throw "Backend entrypoint not found at $serverScript"
}

Stop-PortListeners -TargetPort $Port
$allowedOrigins = "http://127.0.0.1:8082,http://localhost:8082,http://127.0.0.1:8080,http://localhost:8080"
$backendEnv = @"
`$env:CLODE_ALLOWED_ORIGINS = '$allowedOrigins'
& '$python' '$serverScript'
"@
Start-Process powershell -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendEnv) -WorkingDirectory $ProjectRoot | Out-Null
if (-not (Wait-BackendReady -Url $healthUrl -TimeoutSec $StartupTimeoutSec)) {
    throw "Backend nie zglosil gotowosci pod $healthUrl w ciagu $StartupTimeoutSec s."
}

Write-Host "Uruchomiono backend Clode pod $healthUrl"

