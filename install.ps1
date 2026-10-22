param(
    [string]$CodexHome,
    [string]$DataDirectory,
    [string]$CodexPath
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not $CodexHome) {
    if ($env:CODEX_HOME) { $CodexHome = $env:CODEX_HOME }
    else { $CodexHome = Join-Path $env:USERPROFILE '.codex' }
}
if (-not $DataDirectory) { $DataDirectory = Join-Path $root '.local/data' }
$NodePath = (Get-Command node.exe -ErrorAction Stop).Source
if (-not $CodexPath) {
    if ($env:CODEX_CLI_PATH) { $CodexPath = $env:CODEX_CLI_PATH }
    else { $CodexPath = (Get-Command codex.exe -ErrorAction Stop).Source }
}
$CodexHome = [IO.Path]::GetFullPath($CodexHome)
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)
New-Item -ItemType Directory -Path $CodexHome -Force | Out-Null
$NodePath = (Get-Item -LiteralPath $NodePath).FullName
$CodexPath = (Get-Item -LiteralPath $CodexPath).FullName
$nodeVersion = (& $NodePath --version).TrimStart('v').Split('.')
if ([int]$nodeVersion[0] -lt 22 -or ([int]$nodeVersion[0] -eq 22 -and [int]$nodeVersion[1] -lt 13)) { throw 'Node.js 22.13 or later is required.' }
if (-not (Test-Path -LiteralPath (Join-Path $root 'dist/server.mjs'))) {
    throw 'Missing dist files. Download the plugin ZIP, or run npm ci and npm run build first.'
}
$stage = Join-Path $root '.local/install-source'
$plugin = Join-Path $stage 'plugin'
if (Test-Path -LiteralPath $stage) {
    $resolved = (Get-Item -LiteralPath $stage).FullName
    if ($resolved -ne [IO.Path]::GetFullPath((Join-Path $root '.local/install-source'))) { throw 'Unexpected staging path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
New-Item -ItemType Directory -Path $plugin -Force | Out-Null
foreach ($name in @('.codex-plugin', '.mcp.json', 'hooks', 'settings.json', 'dist', 'assets', 'README.md', 'README.en.md', 'LICENSE', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'VALIDATION.md', 'open.cmd')) {
    Copy-Item -LiteralPath (Join-Path $root $name) -Destination $plugin -Recurse
}
$utf8 = New-Object Text.UTF8Encoding($false)
function Write-JsonFile($file, $value) { [IO.File]::WriteAllText($file, ($value | ConvertTo-Json -Depth 20) + "`n", $utf8) }
Write-JsonFile (Join-Path $plugin 'settings.json') @{ dataDirectory = $DataDirectory; cliPath = $CodexPath }
$mcp = Get-Content -LiteralPath (Join-Path $plugin '.mcp.json') -Raw | ConvertFrom-Json
$mcp.mcpServers.'reply-explainer'.command = $NodePath
Write-JsonFile (Join-Path $plugin '.mcp.json') $mcp
[IO.File]::WriteAllText((Join-Path $plugin 'open.cmd'), "@echo off`r`nchcp 65001 >nul`r`nset `"REPLY_EXPLAINER_SOURCE_HOME=$CodexHome`"`r`n`"$NodePath`" `"%~dp0dist\start.mjs`"`r`n", $utf8)
[IO.File]::WriteAllText((Join-Path $root '.local/open.cmd'), "@echo off`r`nchcp 65001 >nul`r`nset `"REPLY_EXPLAINER_SOURCE_HOME=$CodexHome`"`r`nset `"REPLY_EXPLAINER_DATA_DIR=$DataDirectory`"`r`nset `"CODEX_CLI_PATH=$CodexPath`"`r`n`"$NodePath`" `"%~dp0..\dist\start.mjs`"`r`n", $utf8)
$marketDirectory = Join-Path $stage '.agents/plugins'
New-Item -ItemType Directory -Path $marketDirectory -Force | Out-Null
Write-JsonFile (Join-Path $marketDirectory 'marketplace.json') @{
    name = 'reply-explainer-preview'
    interface = @{ displayName = 'Codex Reply Explainer' }
    plugins = @(@{ name = 'reply-explainer'; source = @{ source = 'local'; path = './plugin' }; policy = @{ installation = 'AVAILABLE'; authentication = 'ON_INSTALL' }; category = 'Productivity' })
}
$oldHome = $env:CODEX_HOME
$oldTemp = $env:TEMP
$oldTmp = $env:TMP
try {
    $env:CODEX_HOME = $CodexHome
    $env:TEMP = Join-Path $root '.local/tmp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
    $marketplaces = & $CodexPath plugin marketplace list --json
    if ($LASTEXITCODE -ne 0) { throw 'Marketplace listing failed.' }
    $registered = @(($marketplaces | Out-String | ConvertFrom-Json).marketplaces | Where-Object { $_.name -eq 'reply-explainer-preview' })
    if ($registered.Count -gt 0 -and [IO.Path]::GetFullPath($registered[0].root) -ne [IO.Path]::GetFullPath($stage)) {
        & $CodexPath plugin marketplace remove 'reply-explainer-preview' --json
        if ($LASTEXITCODE -ne 0) { throw 'Previous marketplace registration could not be replaced.' }
    }
    & $CodexPath plugin marketplace add $stage --json
    if ($LASTEXITCODE -ne 0) { throw 'Marketplace registration failed.' }
    & $CodexPath plugin add 'reply-explainer@reply-explainer-preview' --json
    if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed.' }
} finally {
    $env:CODEX_HOME = $oldHome
    $env:TEMP = $oldTemp
    $env:TMP = $oldTmp
}
Write-JsonFile (Join-Path $root '.local/installation.json') @{ codexHome = $CodexHome; dataDirectory = $DataDirectory; codexPath = $CodexPath; nodePath = $NodePath; marketplace = 'reply-explainer-preview' }
Write-Host 'Installed. Review and trust the Stop hook in /hooks before expecting automatic updates.'
Write-Host "Restart Codex when convenient. Open Codex Reply Explainer from + > More tools in the chat's top-right corner."
Write-Host 'Only the selected Codex home was changed. Keep this folder for future updates.'
