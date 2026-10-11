# Builds the signed Android app into release/ at the project root:
#
#     powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
#
# Does what `bubblewrap build` would (it fails on Windows with newer Node: "spawn EINVAL"):
# Gradle builds the app, zipalign lines it up, apksigner signs it with android.keystore using
# the passwords in keystore.properties, and the signature is checked before it's copied out.
# Needs the 64-bit JDK and Android SDK that Bubblewrap keeps in ~/.bubblewrap (config.json).

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent

$bw = Get-Content "$env:USERPROFILE\.bubblewrap\config.json" -Raw | ConvertFrom-Json
$env:JAVA_HOME = $bw.jdkPath
$env:ANDROID_HOME = $bw.androidSdkPath
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$buildTools = Get-ChildItem "$env:ANDROID_HOME\build-tools" -Directory | Sort-Object { [version]$_.Name } | Select-Object -Last 1

if (-not (Test-Path "$here\keystore.properties") -or -not (Test-Path "$here\android.keystore")) {
    throw "android.keystore and keystore.properties are missing from $here. They're not in git: restore them from your backup."
}
$props = @{}
Get-Content "$here\keystore.properties" | ForEach-Object { $k, $v = $_.Split('=', 2); $props[$k] = $v }

$version = (Get-Content "$here\twa-manifest.json" -Raw | ConvertFrom-Json).appVersion
Write-Host "Building SG Bus Timings $version for Android..."

$gradle = Start-Process -FilePath "$here\gradlew.bat" -ArgumentList 'assembleRelease', '--no-daemon', '-q' `
    -WorkingDirectory $here -NoNewWindow -Wait -PassThru
if ($gradle.ExitCode -ne 0) { throw "Gradle failed (exit $($gradle.ExitCode)). Its messages are above." }

$out = "$here\app\build\outputs\apk\release"
$aligned = "$out\app-release-aligned.apk"
& "$($buildTools.FullName)\zipalign.exe" -f -p 4 "$out\app-release-unsigned.apk" $aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed.' }

$signed = "$out\app-release-signed.apk"
$env:SGBUS_KS_PASS = $props.storePassword
$env:SGBUS_KEY_PASS = $props.keyPassword
& "$($buildTools.FullName)\apksigner.bat" sign --ks "$here\$($props.storeFile)" --ks-key-alias $props.keyAlias `
    --ks-pass env:SGBUS_KS_PASS --key-pass env:SGBUS_KEY_PASS --out $signed $aligned
$signExit = $LASTEXITCODE
Remove-Item Env:SGBUS_KS_PASS, Env:SGBUS_KEY_PASS
if ($signExit -ne 0) { throw 'apksigner failed to sign the app.' }
# Its warnings (META-INF/*.version "not protected by signature") come with every Android build
# and mean nothing here; only a failure matters.
$check = & "$($buildTools.FullName)\apksigner.bat" verify $signed 2>&1
if ($LASTEXITCODE -ne 0) { $check | Write-Host; throw 'The signed app failed its signature check.' }

New-Item -ItemType Directory -Force "$root\release" | Out-Null
$dest = "$root\release\sg-bus-timings-$version.apk"
Copy-Item $signed $dest -Force
Remove-Item "$here\app\build\outputs\apk\release\*.idsig" -ErrorAction SilentlyContinue
Write-Host "Done: $dest"
