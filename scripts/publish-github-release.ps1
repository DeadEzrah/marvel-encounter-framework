param(
    [switch]$Publish
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$module = Get-Content 'module.json' -Raw | ConvertFrom-Json
$version = $module.version
$tag = "release-$version"
$zipName = "marvel-encounter-framework-$version.zip"
$zipPath = Join-Path $repoRoot $zipName
$staging = Join-Path $env:TEMP "marvel-encounter-framework-release-$version"

npm run validate:release
npm test

if (Test-Path $staging) {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
New-Item -ItemType Directory -Path $staging | Out-Null

$directories = @('encounters', 'scripts', 'styles', 'templates')
foreach ($directory in $directories) {
    Copy-Item -Path (Join-Path $repoRoot $directory) -Destination $staging -Recurse -Force
}

$files = @('CHANGELOG.md', 'README.md', 'module.json')
foreach ($file in $files) {
    Copy-Item -Path (Join-Path $repoRoot $file) -Destination $staging -Force
}

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -CompressionLevel Optimal

if ($Publish) {
    gh release create $tag $zipPath 'module.json' `
        --repo 'DeadEzrah/marvel-encounter-framework' `
        --title "Marvel Encounter Framework $version" `
        --notes-file 'CHANGELOG.md'
}

Write-Output "Release package ready: $zipPath"
