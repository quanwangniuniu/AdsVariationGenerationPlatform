#requires -Version 5.1

<#
.SYNOPSIS
    Synchronise ngrok-dependent configuration values across the project.

.DESCRIPTION
    Prompts for the current HTTPS ngrok tunnel (e.g. https://abc.ngrok-free.dev) and updates:
      - .env billing / Stripe callback URLs and NEXT_PUBLIC_* values
      - .env ALLOWED_HOSTS (appends the host if missing)
      - backend/backend/settings.py domain lists (CSRF_TRUSTED_ORIGINS, CORS_ALLOWED_ORIGINS)

    After running the script, restart the backend service so Django reloads the environment.
#>

param(
    [string]$NgrokUrl
)

$baseDir = (Get-Item -LiteralPath $PSScriptRoot).Parent.FullName
$envPath = Join-Path $baseDir '.env'
$settingsPath = Join-Path $baseDir 'backend/backend/settings.py'

function Prompt-NgrokUrl {
    param([string]$InputUrl)

    if ([string]::IsNullOrWhiteSpace($InputUrl)) {
        $InputUrl = Read-Host 'Enter new ngrok base URL (e.g. https://example.ngrok-free.dev)'
    }

    $InputUrl = $InputUrl.Trim()
    if ([string]::IsNullOrWhiteSpace($InputUrl)) {
        Write-Error 'No URL provided.'
        exit 1
    }

    if ($InputUrl -notmatch '^https?://') {
        $InputUrl = "https://$InputUrl"
    }

    try {
        $uri = [System.Uri]$InputUrl
    }
    catch {
        Write-Error "Invalid URL: $InputUrl"
        exit 1
    }

    if (-not $uri.Host) {
        Write-Error "Invalid URL: $InputUrl"
        exit 1
    }

    # Normalise: scheme://host (strip trailing slash)
    $base = "{0}://{1}" -f $uri.Scheme, $uri.Host
    return $base.TrimEnd('/')
}

function Set-EnvVar {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$Key,
        [string]$Value
    )

    $pattern = "^$([Regex]::Escape($Key))="
    $replaced = $false
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match $pattern) {
            $Lines[$i] = "$Key=$Value"
            $replaced = $true
            break
        }
    }
    if (-not $replaced) {
        [void]$Lines.Add("$Key=$Value")
    }
}

function Update-AllowedHosts {
    param(
        [System.Collections.Generic.List[string]]$Lines,
        [string]$TargetHost
    )

    $key = 'ALLOWED_HOSTS'
    $pattern = "^$([Regex]::Escape($key))="
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i] -match $pattern) {
            $entries = $Lines[$i].Substring($key.Length + 1).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ }
            if ($entries -notcontains $TargetHost) {
                $entries += $TargetHost
                $Lines[$i] = "$key=$($entries -join ',')"
            }
            return
        }
    }
        [void]$Lines.Add("$key=$TargetHost")
}

$baseUrl = Prompt-NgrokUrl -InputUrl $NgrokUrl
$ngrokHost = ([System.Uri]$baseUrl).Host

$webhookUrl = "$baseUrl/api/billing/webhook/stripe/"
$successUrl = "$baseUrl/billing/success"
$cancelUrl = "$baseUrl/billing/cancel"

$envLines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $envPath)
Set-EnvVar -Lines $envLines -Key 'BILLING_PUBLIC_BASE_URL' -Value $baseUrl
Set-EnvVar -Lines $envLines -Key 'WEBHOOK_PUBLIC_URL' -Value $webhookUrl
Set-EnvVar -Lines $envLines -Key 'STRIPE_WEBHOOK_URL' -Value $webhookUrl
Set-EnvVar -Lines $envLines -Key 'STRIPE_SUCCESS_URL' -Value $successUrl
Set-EnvVar -Lines $envLines -Key 'STRIPE_CANCEL_URL' -Value $cancelUrl
Set-EnvVar -Lines $envLines -Key 'NEXT_PUBLIC_API_BASE' -Value $baseUrl
Set-EnvVar -Lines $envLines -Key 'NEXT_PUBLIC_WS_BASE' -Value $baseUrl
Set-EnvVar -Lines $envLines -Key 'NEXT_PUBLIC_ASSETS_API_URL' -Value $baseUrl
Set-EnvVar -Lines $envLines -Key 'NEXT_PUBLIC_ASSETS_WS_URL' -Value $baseUrl
Update-AllowedHosts -Lines $envLines -Host $ngrokHost
Set-Content -LiteralPath $envPath -Value $envLines -Encoding UTF8
Write-Host "Updated .env"

$settingsText = Get-Content -LiteralPath $settingsPath -Raw -Encoding UTF8
$domainEntry = '"https://' + $ngrokHost + '"'
$settingsUpdated = $false

foreach ($settingName in 'CSRF_TRUSTED_ORIGINS', 'CORS_ALLOWED_ORIGINS') {
    $pattern = "(?s)($([Regex]::Escape($settingName))\s*=\s*\[)(.*?)(\])"
    $match = [regex]::Match($settingsText, $pattern)
    if (-not $match.Success) { continue }

    $body = $match.Groups[2].Value

    $nl = [Environment]::NewLine
    $entries = @()
    foreach ($line in ($body -split '\r?\n')) {
        $trim = $line.Trim()
        if (-not $trim) { continue }
        if ($trim.StartsWith('#')) { $entries += $trim; continue }
        $trim = $trim.TrimEnd(',')
        $entries += $trim
    }

    if ($entries -notcontains $domainEntry) {
        $entries += $domainEntry
    }

    $formatted = @()
    for ($idx = 0; $idx -lt $entries.Count; $idx++) {
        $line = '    ' + $entries[$idx]
        if ($entries[$idx].StartsWith('#')) {
            $formatted += $line
        }
        else {
            $formatted += ($line + ',')
        }
    }

    if ($formatted.Count -gt 0) {
        $body = $nl + ($formatted -join $nl) + $nl
    }
    else {
        $body = $nl
    }

    $replacement = $match.Groups[1].Value + $body + $match.Groups[3].Value
    $settingsText = $settingsText.Substring(0, $match.Index) + $replacement + $settingsText.Substring($match.Index + $match.Length)
    $settingsUpdated = $true
}

if ($settingsUpdated) {
    Set-Content -LiteralPath $settingsPath -Value $settingsText -Encoding UTF8
    Write-Host "Updated backend/backend/settings.py"
} else {
    Write-Host "No changes needed for backend/backend/settings.py"
}

Write-Host "All done. Restart the backend service to apply changes." -ForegroundColor Cyan
Write-Host "If running via Docker:    docker compose -f docker-compose.dev.yml restart backend" -ForegroundColor Yellow
Write-Host "If running locally:       stop the dev server (Ctrl+C) and rerun python manage.py runserver" -ForegroundColor Yellow
