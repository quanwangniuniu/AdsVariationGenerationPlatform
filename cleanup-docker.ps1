[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$KeepImages,
  [switch]$KeepVolumes,
  [switch]$DryRun
)

function Run {
  param([string]$Command)
  if ($DryRun) {
    Write-Host "DRYRUN> $Command"
  } else {
    Write-Host "RUN> $Command"
    Invoke-Expression $Command
  }
}

Write-Host ">>> Docker cleanup (PowerShell)"

# 1) Stop and remove all containers
$containers = @(docker ps -aq | Where-Object { $_ })
if ($containers.Count -gt 0) {
  Run ("docker stop " + ($containers -join ' '))
  Run ("docker rm -vf " + ($containers -join ' '))
} else {
  Write-Host "No containers to remove."
}

# 2) Remove images (optional)
if (-not $KeepImages) {
  $images = @(docker images -aq | Where-Object { $_ })
  if ($images.Count -gt 0) {
    Run ("docker rmi -f " + ($images -join ' '))
  } else {
    Write-Host "No images to remove."
  }
} else {
  Write-Host "KeepImages set: skipping image removal."
}

# 3) Remove volumes (optional)
if (-not $KeepVolumes) {
  $vols = @(docker volume ls -q | Where-Object { $_ })
  if ($vols.Count -gt 0) {
    Run ("docker volume rm -f " + ($vols -join ' '))
  } else {
    Write-Host "No volumes to remove."
  }
} else {
  Write-Host "KeepVolumes set: skipping volume removal."
}

# 4) Remove custom networks (keeps bridge/host/none)
$nets = @(docker network ls --filter 'type=custom' -q | Where-Object { $_ })
if ($nets.Count -gt 0) {
  Run ("docker network rm " + ($nets -join ' '))
} else {
  Write-Host "No custom networks to remove."
}

# 5) Prune system and build caches
$prune = @('docker','system','prune','-a')
if ($Force) { $prune += '-f' }
if (-not $KeepVolumes) { $prune += '--volumes' }
Run ($prune -join ' ')

$builder = @('docker','builder','prune','-a')
if ($Force) { $builder += '-f' }
Run ($builder -join ' ')

$buildx = @('docker','buildx','prune','-a')
if ($Force) { $buildx += '-f' }
Run ($buildx -join ' ')

Write-Host ">>> Done."
