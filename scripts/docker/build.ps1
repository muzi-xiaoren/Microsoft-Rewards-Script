param([switch]$Update)

$ErrorActionPreference = 'Stop'
$taskProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$taskOriginalHttpProxy = $env:HTTP_PROXY
$taskOriginalHttpsProxy = $env:HTTPS_PROXY
$taskDockerSettingsPath = Join-Path $env:APPDATA 'Docker\settings-store.json'

try {
    # BuildKit's token requests run in the Windows client. Reuse Desktop's manual proxy for this command only.
    if (Test-Path -LiteralPath $taskDockerSettingsPath) {
        $taskDockerSettings = Get-Content -LiteralPath $taskDockerSettingsPath -Raw | ConvertFrom-Json
        if ($taskDockerSettings.ProxyHTTPMode -eq 'manual') {
            if ($taskDockerSettings.OverrideProxyHttp) { $env:HTTP_PROXY = $taskDockerSettings.OverrideProxyHttp }
            if ($taskDockerSettings.OverrideProxyHttps) { $env:HTTPS_PROXY = $taskDockerSettings.OverrideProxyHttps }
        }
    }
    Push-Location -LiteralPath $taskProjectRoot
    try {
        docker compose build --pull
        if ($LASTEXITCODE -ne 0) { throw 'Docker build failed; the running container was not updated.' }
        if ($Update) {
            docker compose up -d --no-build
            if ($LASTEXITCODE -ne 0) { throw 'Container update failed.' }
        }
    } finally {
        Pop-Location
    }
} finally {
    $env:HTTP_PROXY = $taskOriginalHttpProxy
    $env:HTTPS_PROXY = $taskOriginalHttpsProxy
}
