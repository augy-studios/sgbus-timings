<#
  Gets one Windows build ready to be packed into the installers.

  Run it from the flutter folder on the machine that built it, after
  `flutter build windows --release`:

      pwsh installers/windows/stage-windows.ps1 -Arch x64      (on an x64 PC)
      pwsh installers/windows/stage-windows.ps1 -Arch arm64    (on an Arm64 PC)

  It copies build\windows\<arch>\runner\Release\ to build\installers\windows\<arch>\ and renames
  sgbus_timings.exe to "SG Bus Timings.exe": the name the Electron app had, which its shortcuts,
  Jump List, uwu:// links and updater all point at. (Flutter's CMake can't give the program a name
  with spaces, so it's renamed here.) package-windows.ps1 then packs both into the installers.
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('x64', 'arm64')]
  [string]$Arch
)

$ErrorActionPreference = 'Stop'
$flutterDir = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$release = Join-Path $flutterDir "build\windows\$Arch\runner\Release"
$stage = Join-Path $flutterDir "build\installers\windows\$Arch"

if (-not (Test-Path (Join-Path $release 'sgbus_timings.exe'))) {
  throw "No build in $release. Run 'flutter build windows --release' on an $Arch PC first."
}

# Reads the processor a Windows program was built for, from its PE header: 0x8664 is x64,
# 0xAA64 is Arm64. Catches an x64 build packed as the Arm64 one, or the other way round.
function Get-ExeMachine([string]$path) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $peOffset = [BitConverter]::ToInt32($bytes, 0x3C)
  return [BitConverter]::ToUInt16($bytes, $peOffset + 4)
}

$expected = @{ 'x64' = 0x8664; 'arm64' = 0xAA64 }[$Arch]
$machine = Get-ExeMachine (Join-Path $release 'sgbus_timings.exe')
if ($machine -ne $expected) {
  throw ("sgbus_timings.exe is built for machine type 0x{0:X4}, not {1}." -f $machine, $Arch)
}

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null
Copy-Item -Path (Join-Path $release '*') -Destination $stage -Recurse
Rename-Item -Path (Join-Path $stage 'sgbus_timings.exe') -NewName 'SG Bus Timings.exe'

Write-Host "Staged the $Arch build in $stage"
Get-ChildItem $stage | Format-Table Name, Length -AutoSize
