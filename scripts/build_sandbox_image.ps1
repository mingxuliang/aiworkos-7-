# Build the QwenPaw sandbox Docker image (Plan B).
# Usage (from repo root):
#   docker build -t qwenpaw-sandbox:latest -f deploy/Dockerfile.sandbox .
param(
    [string]$ImageTag = "qwenpaw-sandbox:latest"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $RepoRoot
try {
    docker build -t $ImageTag -f deploy/Dockerfile.sandbox .
    if ($LASTEXITCODE -ne 0) {
        throw "docker build failed with exit code $LASTEXITCODE"
    }
    Write-Host "Built $ImageTag"
}
finally {
    Pop-Location
}
