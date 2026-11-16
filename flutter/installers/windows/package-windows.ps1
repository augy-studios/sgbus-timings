<#
  Packs the staged Windows builds into the two Windows installers:

      build\dist\sg-bus-timings-<version>-setup.exe   x64 and Arm64 in one (NSIS, sgbus-timings.nsi)
      build\dist\sg-bus-timings-<version>.msi         x64 (WiX, sgbus-timings.wxs)

  Run it from the flutter folder on Windows, once stage-windows.ps1 has staged both builds in
  build\installers\windows\x64\ and build\installers\windows\arm64\:

      pwsh installers/windows/package-windows.ps1

  It needs NSIS 3 (makensis) and the WiX Toolset 5 command line with its UI extension:

      choco install nsis
      dotnet tool install --global wix --version 5.0.2
      wix extension add --global WixToolset.UI.wixext/5.0.2

  The version comes from pubspec.yaml unless -Version is given. Then write latest.yml with
  `node installers/update-files.mjs windows`.
#>
param(
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$flutterDir = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$stageRoot = Join-Path $flutterDir 'build\installers\windows'
$dist = Join-Path $flutterDir 'build\dist'
$icon = Join-Path $flutterDir 'windows\runner\resources\app_icon.ico'

# The app's version from pubspec.yaml's "version: 2.5.0+42" line, without the build number.
function Get-PubspecVersion {
  $line = Select-String -Path (Join-Path $flutterDir 'pubspec.yaml') -Pattern '^version:\s*([0-9.]+)' | Select-Object -First 1
  if (-not $line) { throw 'No version line in pubspec.yaml.' }
  return $line.Matches[0].Groups[1].Value
}

# Writes app-files.nsh: one Delete or RMDir line for each file and folder at the top of either
# build. The installer runs it to clear an earlier version, the uninstaller to remove the app, so
# both always match what's actually installed, whichever plugins the build has.
function Write-AppFilesList([string]$path) {
  $names = @()
  foreach ($arch in 'x64', 'arm64') {
    $names += Get-ChildItem (Join-Path $stageRoot $arch) | ForEach-Object {
      if ($_.PSIsContainer) { "  RMDir /r `"`$INSTDIR\$($_.Name)`"" } else { "  Delete `"`$INSTDIR\$($_.Name)`"" }
    }
  }
  $lines = @(
    '; Written by package-windows.ps1: every file and folder at the top of the app''s folder.'
    '!macro DeleteAppFiles'
  ) + ($names | Sort-Object -Unique) + @('!macroend')
  Set-Content -Path $path -Value $lines -Encoding utf8
}

# makensis from the PATH, or where the NSIS installer puts it.
function Find-Makensis {
  $onPath = Get-Command makensis -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $default = Join-Path ${env:ProgramFiles(x86)} 'NSIS\makensis.exe'
  if (Test-Path $default) { return $default }
  throw 'makensis not found: install NSIS 3 (choco install nsis).'
}

if (-not $Version) { $Version = Get-PubspecVersion }
foreach ($arch in 'x64', 'arm64') {
  if (-not (Test-Path (Join-Path $stageRoot "$arch\SG Bus Timings.exe"))) {
    throw "No staged $arch build in $stageRoot\$arch. Run stage-windows.ps1 -Arch $arch first."
  }
}
New-Item -ItemType Directory -Path $dist -Force | Out-Null

# ---------- the .exe ----------

$appFiles = Join-Path $stageRoot 'app-files.nsh'
Write-AppFilesList $appFiles
$exe = Join-Path $dist "sg-bus-timings-$Version-setup.exe"
& (Find-Makensis) -V3 -WX `
  "/DVERSION=$Version" `
  "/DPAYLOAD_X64=$(Join-Path $stageRoot 'x64')" `
  "/DPAYLOAD_ARM64=$(Join-Path $stageRoot 'arm64')" `
  "/DAPP_FILES=$appFiles" `
  "/DOUT_FILE=$exe" `
  (Join-Path $PSScriptRoot 'sgbus-timings.nsi')
if ($LASTEXITCODE -ne 0) { throw "makensis failed ($LASTEXITCODE)." }

# ---------- the .msi ----------

$msi = Join-Path $dist "sg-bus-timings-$Version.msi"
$appDir = Join-Path $stageRoot 'x64'
wix build -arch x64 -ext WixToolset.UI.wixext `
  -d "Version=$Version" `
  -d "AppDir=$appDir" `
  -d "IconFile=$icon" `
  -o $msi `
  (Join-Path $PSScriptRoot 'sgbus-timings.wxs')
if ($LASTEXITCODE -ne 0) { throw "wix build failed ($LASTEXITCODE)." }
# WiX leaves a .wixpdb (debug symbols) beside it; it isn't released.
Remove-Item (Join-Path $dist "sg-bus-timings-$Version.wixpdb") -ErrorAction SilentlyContinue

Get-Item $exe, $msi | Format-Table Name, Length -AutoSize
