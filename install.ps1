param(
    [string]$CodexHome,
    [string]$DataDirectory,
    [string]$CodexPath
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$marketplaceSource = 'https://github.com/Jupiterofyear/codex-reply-explainer.git'
if (-not $CodexHome) {
    if ($env:CODEX_HOME) { $CodexHome = $env:CODEX_HOME }
    else { $CodexHome = Join-Path $env:USERPROFILE '.codex' }
}
$CodexHome = [IO.Path]::GetFullPath($CodexHome)
$NodePath = (Get-Command node.exe -ErrorAction Stop).Source
Get-Command git.exe -ErrorAction Stop | Out-Null
if (-not $CodexPath) {
    if ($env:CODEX_CLI_PATH) { $CodexPath = $env:CODEX_CLI_PATH }
    else { $CodexPath = (Get-Command codex.exe -ErrorAction Stop).Source }
}
$CodexPath = (Get-Item -LiteralPath $CodexPath).FullName
$nodeVersion = (& $NodePath --version).TrimStart('v').Split('.')
if ([int]$nodeVersion[0] -lt 22 -or ([int]$nodeVersion[0] -eq 22 -and [int]$nodeVersion[1] -lt 13)) { throw 'Node.js 22.13 or later is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'dist/open-installed.mjs'))) { throw 'Download the plugin ZIP, or build the source before installing.' }
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-JsonFile($file, $value) {
    [IO.File]::WriteAllText($file, ($value | ConvertTo-Json -Depth 20) + [Environment]::NewLine, $utf8)
}
New-Item -ItemType Directory -Path (Join-Path $CodexHome 'plugins') -Force | Out-Null
$settingsFile = Join-Path $CodexHome 'plugins/reply-explainer-settings.json'
$oldHome = $env:CODEX_HOME
$oldTemp = $env:TEMP
$oldTmp = $env:TMP
try {
    $env:CODEX_HOME = $CodexHome
    $env:TEMP = Join-Path $root '.local/tmp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    $listed = & $CodexPath plugin list --json
    if ($LASTEXITCODE -ne 0) { throw 'Plugin listing failed.' }
    $installed = @(($listed | Out-String | ConvertFrom-Json).installed | Where-Object { $_.pluginId -eq 'reply-explainer@reply-explainer-preview' })
    if (-not $DataDirectory) {
        if (Test-Path -LiteralPath $settingsFile) {
            $DataDirectory = (Get-Content -LiteralPath $settingsFile -Raw -Encoding UTF8 | ConvertFrom-Json).dataDirectory
        } elseif ($installed.Count -gt 0) {
            $previousRoot = Join-Path $CodexHome ('plugins/cache/reply-explainer-preview/reply-explainer/' + $installed[0].version)
            $previousSettings = Get-Content -LiteralPath (Join-Path $previousRoot 'settings.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $DataDirectory = $previousSettings.dataDirectory
            if (-not $DataDirectory) { throw 'Previous data directory is missing. Supply -DataDirectory.' }
            if (-not [IO.Path]::IsPathRooted($DataDirectory)) { $DataDirectory = Join-Path $previousRoot $DataDirectory }
        } else {
            $DataDirectory = Join-Path $root '.local/data'
        }
    }
    $DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
    New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
    $windowFile = Join-Path $DataDirectory 'floating/window.json'
    if (Test-Path -LiteralPath $windowFile) {
        $windowProcessId = (Get-Content -LiteralPath $windowFile -Raw -Encoding UTF8 | ConvertFrom-Json).pid
        if (Get-Process -Id $windowProcessId -ErrorAction SilentlyContinue) {
            throw 'Close the explanation window before installing or updating.'
        }
    }
    $marketplaces = & $CodexPath plugin marketplace list --json
    if ($LASTEXITCODE -ne 0) { throw 'Marketplace listing failed.' }
    $registered = @(($marketplaces | Out-String | ConvertFrom-Json).marketplaces | Where-Object { $_.name -eq 'reply-explainer-preview' })
    $alreadyGit = $registered.Count -gt 0 -and $registered[0].marketplaceSource.sourceType -eq 'git' -and $registered[0].marketplaceSource.source -eq $marketplaceSource
    if ($registered.Count -gt 0 -and -not $alreadyGit) {
        & $CodexPath plugin marketplace remove 'reply-explainer-preview' --json
        if ($LASTEXITCODE -ne 0) { throw 'Previous marketplace registration could not be replaced.' }
    }
    Write-JsonFile $settingsFile @{ dataDirectory = $DataDirectory; cliPath = $CodexPath }
    if ($alreadyGit) {
        & $CodexPath plugin marketplace upgrade 'reply-explainer-preview' --json
    } else {
        & $CodexPath plugin marketplace add $marketplaceSource --ref main --json
    }
    if ($LASTEXITCODE -ne 0) { throw 'Git marketplace registration or update failed.' }
    & $CodexPath plugin add 'reply-explainer@reply-explainer-preview' --json
    if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed.' }
} finally {
    $env:CODEX_HOME = $oldHome
    $env:TEMP = $oldTemp
    $env:TMP = $oldTmp
}
$launcher = @(
    '@echo off',
    'chcp 65001 >nul',
    ('set "REPLY_EXPLAINER_SOURCE_HOME=' + $CodexHome + '"'),
    ('"' + $NodePath + '" "%~dp0..\dist\open-installed.mjs"')
) -join [Environment]::NewLine
[IO.File]::WriteAllText((Join-Path $root '.local/open.cmd'), $launcher + [Environment]::NewLine, $utf8)
Write-JsonFile (Join-Path $root '.local/installation.json') @{ codexHome = $CodexHome; dataDirectory = $DataDirectory; codexPath = $CodexPath; nodePath = $NodePath; marketplace = 'reply-explainer-preview'; automaticUpdates = $true }
Write-Host 'Installed with automatic updates from the GitHub main branch.'
Write-Host 'Review and trust the Stop hook in /hooks, then restart Codex.'
Write-Host 'Open Codex Reply Explainer from + > More tools, or use open.cmd.'
