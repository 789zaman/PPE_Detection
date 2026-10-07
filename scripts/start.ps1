Param(
  [switch]$Build
)
Set-Location $PSScriptRoot\..
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if ($Build) { docker compose up -d --build } else { docker compose up -d --build }
docker compose ps
