param(
    [string]$ProjectRoot = "",
    [int]$Port = 8082,
    [string]$BindHost = "127.0.0.1",
    [int]$StartupTimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$pythonCandidates = @(@(
    (Get-Command python -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue)
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)

if (-not $pythonCandidates -or $pythonCandidates.Count -eq 0) {
    throw "Python runtime not found."
}

$python = $pythonCandidates[0]
$frontendUrl = "http://$BindHost`:$Port/app/index.html"

function Test-FrontendReady {
    param([string]$Url)

    try {
        $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
        if ($response.StatusCode -ne 200) {
            return $false
        }
        return $response.Content -match "shell\.js" -and $response.Content -match "clode-logo\.svg"
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
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    return $false
}

Stop-PortListeners -TargetPort $Port
Start-Process $python -ArgumentList @("-m", "http.server", "$Port", "--bind", $BindHost) -WorkingDirectory $ProjectRoot | Out-Null
if (-not (Wait-FrontendReady -Url $frontendUrl -TimeoutSec $StartupTimeoutSec)) {
    throw "Legacy frontend nie zglosil gotowosci pod $frontendUrl w ciagu $StartupTimeoutSec s."
}

Write-Host "Uruchomiono legacy frontend Clode pod $frontendUrl"
