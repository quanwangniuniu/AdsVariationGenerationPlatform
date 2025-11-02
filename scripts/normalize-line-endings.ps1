#requires -Version 5.1

<#!
.SYNOPSIS
    Convert selected project scripts to Unix-style LF line endings.

.DESCRIPTION
    Normalises newline characters for commonly shared shell scripts so they run
    correctly inside Linux-based containers. By default it targets:
      - backend/entrypoint-dev-b.sh
      - update/update_ngrok_env.sh

    Additional paths can be supplied via the -Paths parameter. Paths are
    treated as repository-relative.
#>

param(
    [string[]]$Paths
)

$defaultTargets = @(
    'backend/entrypoint-dev-b.sh',
    'update/update_ngrok_env.sh'
)

$baseDir = (Get-Item -LiteralPath $PSScriptRoot).Parent.FullName

if (-not $Paths -or $Paths.Count -eq 0) {
    $Paths = $defaultTargets
}

function Convert-ToLf {
    param([string]$RelativePath)

    $fullPath = Join-Path $baseDir $RelativePath
    if (-not (Test-Path -LiteralPath $fullPath)) {
        Write-Warning "Skipping missing file: $RelativePath"
        return
    }

    # Read file as raw bytes to detect BOM
    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
    $hasBOM = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF

    # Read content without BOM
    $content = Get-Content -LiteralPath $fullPath -Raw -Encoding UTF8

    # Check if conversion is needed
    $hasCRLF = $content.Contains("`r")

    if (-not $hasCRLF -and -not $hasBOM) {
        Write-Host "Already normalized: $RelativePath"
        return
    }

    # Normalize line endings
    $normalized = $content -replace "`r?\n", "`n"

    # Write without BOM using UTF8NoBOM encoding
    $utf8NoBOM = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($fullPath, $normalized, $utf8NoBOM)

    $changes = @()
    if ($hasCRLF) { $changes += "CRLF→LF" }
    if ($hasBOM) { $changes += "removed BOM" }
    Write-Host "Normalized $RelativePath ($($changes -join ', '))" -ForegroundColor Green
}

foreach ($path in $Paths) {
    Convert-ToLf -RelativePath $path
}

Write-Host "Done."
