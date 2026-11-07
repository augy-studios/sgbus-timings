# Builds the signed Android apps into release/<version>/ at the project root:
#
#     powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
#
# From 2.4.0 the app is Flutter (lib/, android/): `flutter build apk` builds the phone's app,
# for ARM phones (32 and 64 bit, one APK, as the app's updater fetches the one file), then
# Gradle the Wear OS watch's (android/wear/), both signed with android.keystore using the
# passwords in keystore.properties, and each signature is checked before they're copied out:
# sg-bus-timings-<version>.apk and sg-bus-timings-<version>-watch.apk. The version is
# pubspec.yaml's.
#
# With -Aab, instead: the Android App Bundle for Google Play, sg-bus-timings-<version>.aab, kept out
# of git as the APKs are. It's the phone's app only, signed with the same key, and with no updater of
# its own, as Play doesn't allow one: its manifest (android/app/src/play/) and SGBUS_PLAY take it
# out, and that's checked here. Build the APKs first: a bundle doesn't replace them.
#
# Needs Flutter on the PATH (or FLUTTER_ROOT), a JDK 21 or later and the Android SDK. It finds
# the JDK and SDK in JAVA_HOME and ANDROID_HOME if they're set, or else the newest JDK under
# Program Files and the SDK in %LOCALAPPDATA%\Android\Sdk.

param([switch]$Aab)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent

if (-not (Test-Path "$here\keystore.properties") -or -not (Test-Path "$here\android.keystore")) {
    throw "android.keystore and keystore.properties are missing from $here. They're not in git: restore them from your backup."
}

function Find-Jdk {
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
        $v = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Out-String
        if ($v -match 'version "(\d+)' -and [int]$Matches[1] -ge 21) { return $env:JAVA_HOME }
    }
    $candidates = @('C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Java', 'C:\Program Files\Microsoft') |
        Where-Object { Test-Path $_ } |
        ForEach-Object { Get-ChildItem $_ -Directory -Filter 'jdk*' } |
        Where-Object { $_.Name -match 'jdk-?(\d+)' -and [int]$Matches[1] -ge 21 -and (Test-Path "$($_.FullName)\bin\java.exe") } |
        Sort-Object { [int]([regex]::Match($_.Name, 'jdk-?(\d+)').Groups[1].Value) }
    if ($candidates) { return ($candidates | Select-Object -Last 1).FullName }
    throw 'No JDK 21 or later found. Install one (https://adoptium.net) or set JAVA_HOME to it.'
}

$env:JAVA_HOME = Find-Jdk
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
if (-not $env:ANDROID_HOME) {
    $bw = "$env:USERPROFILE\.bubblewrap\config.json"
    if (Test-Path $bw) { $env:ANDROID_HOME = (Get-Content $bw -Raw | ConvertFrom-Json).androidSdkPath }
    elseif (Test-Path "$env:LOCALAPPDATA\Android\Sdk") { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
    else { throw 'No Android SDK found. Set ANDROID_HOME to it.' }
}
$buildTools = Get-ChildItem "$env:ANDROID_HOME\build-tools" -Directory | Sort-Object { [version]$_.Name } | Select-Object -Last 1

$pubspec = Get-Content "$here\pubspec.yaml" -Raw
$version = [regex]::Match($pubspec, '(?m)^version:\s*([0-9.]+)').Groups[1].Value
$flutter = if ($env:FLUTTER_ROOT) { "$env:FLUTTER_ROOT\bin\flutter.bat" } else { 'flutter' }
Write-Host "Building SG Bus Timings $version for Android (JDK: $env:JAVA_HOME)..."

if ($Aab) {
    # Never an old one: with nothing changed, Gradle wouldn't write it again.
    $bundle = "$here\build\app\outputs\bundle\release\app-release.aab"
    Remove-Item $bundle -Force -ErrorAction SilentlyContinue
    $flutterFailed = $false
    Push-Location $here
    try {
        & $flutter pub get
        if ($LASTEXITCODE -ne 0) { throw 'flutter pub get failed.' }
        & $flutter build appbundle --release --target-platform android-arm,android-arm64 --dart-define=SGBUS_PLAY=true --android-project-arg=sgbusPlay=true
        $flutterFailed = $LASTEXITCODE -ne 0
    } finally {
        Pop-Location
    }
    # Flutter's last step looks for debug symbols with apkanalyzer, from the SDK's cmdline-tools, and
    # says it failed if that isn't installed. So a failure counts only if a bundle wasn't just made,
    # or if the same look, at what's stripped into the bundle's metadata, finds them missing.
    if (-not (Test-Path $bundle)) {
        if ($flutterFailed) { throw 'flutter build appbundle failed. Its messages are above.' }
        throw 'Gradle made no bundle.'
    }
    # The same key as every version before.
    $ErrorActionPreference = 'Continue'
    $certs = & "$env:JAVA_HOME\bin\keytool.exe" -printcert -jarfile $bundle 2>&1 | Out-String
    $ErrorActionPreference = 'Stop'
    if ($certs -notmatch 'SHA256:\s*4E:D5:3F:F1:F4:CB:4E:5E:A7:CB:C1:28:46:48:F6:2E:B3:90:47:EB:C2:9B:25:20:F5:7D:FE:5B:76:CB:44:EB') {
        throw "The bundle isn't signed with the app's key: is keystore.properties right?"
    }
    # And nothing of the updater left in what Play reads.
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($bundle)
    try {
        $stream = $zip.GetEntry('base/manifest/AndroidManifest.xml').Open()
        $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::GetEncoding(28591))
        $manifest = $reader.ReadToEnd()
        $reader.Dispose()
        $entries = @($zip.Entries | ForEach-Object { $_.FullName })
    } finally {
        $zip.Dispose()
    }
    if ($manifest -match 'REQUEST_INSTALL_PACKAGES|UpdateActivity') { throw 'The bundle still has the updater in its manifest.' }
    foreach ($lib in 'libflutter', 'libapp') {
        if (-not ($entries -match "^BUNDLE-METADATA/com\.android\.tools\.build\.debugsymbols/.*/$lib\.so\.(sym|dbg)$")) {
            throw "The bundle's $lib.so hasn't had its debug symbols stripped."
        }
    }
    New-Item -ItemType Directory -Force "$root\release\$version" | Out-Null
    $out = "$root\release\$version\sg-bus-timings-$version.aab"
    Copy-Item $bundle $out -Force
    Write-Host "Done: $out"
    return
}

Push-Location $here
try {
    & $flutter pub get
    if ($LASTEXITCODE -ne 0) { throw 'flutter pub get failed.' }
    & $flutter build apk --release --target-platform android-arm,android-arm64
    if ($LASTEXITCODE -ne 0) { throw 'flutter build apk failed. Its messages are above.' }
} finally {
    Pop-Location
}

$gradle = Start-Process -FilePath "$here\android\gradlew.bat" -ArgumentList ':wear:assembleRelease', '--no-daemon', '-q' `
    -WorkingDirectory "$here\android" -NoNewWindow -Wait -PassThru
if ($gradle.ExitCode -ne 0) { throw "Gradle failed for the watch app (exit $($gradle.ExitCode)). Its messages are above." }

function Test-Signed($apk, $what) {
    if (-not (Test-Path $apk)) { throw "Gradle made no signed $what APK: is keystore.properties's storeFile right?" }
    # Its warnings (META-INF/*.version "not protected by signature") come with every Android
    # build and mean nothing here; only a failure matters.
    # Windows PowerShell turns anything a program writes to stderr into an error, so only its
    # exit code is looked at here.
    $ErrorActionPreference = 'Continue'
    $check = & "$($buildTools.FullName)\apksigner.bat" verify --print-certs $apk 2>&1
    $verified = $LASTEXITCODE -eq 0
    $ErrorActionPreference = 'Stop'
    if (-not $verified) { $check | Write-Host; throw "The signed $what app failed its signature check." }
    # The same key as every version before, or phones can't update to it; and the watch's must
    # match the phone's, or the two can't talk.
    $sha = ($check | Out-String) -match 'SHA-256 digest: ([0-9a-f]{64})'
    if ($sha -and $Matches[1] -ne '4ed53ff1f4cb4e5ea7cbc1284648f62eb39047ebc29b2520f57dfe5b76cb44eb') {
        throw "The $what APK is signed with a different key ($($Matches[1])), so it can't update the app already installed."
    }
}

$signed = "$here\build\app\outputs\flutter-apk\app-release.apk"
$watch = "$here\build\wear\outputs\apk\release\wear-release.apk"
Test-Signed $signed 'phone'
Test-Signed $watch 'watch'

# Each version in a folder of its own, beside the desktop installers of the same number.
New-Item -ItemType Directory -Force "$root\release\$version" | Out-Null
$dest = "$root\release\$version\sg-bus-timings-$version.apk"
$watchDest = "$root\release\$version\sg-bus-timings-$version-watch.apk"
Copy-Item $signed $dest -Force
Copy-Item $watch $watchDest -Force
Write-Host "Done: $dest"
Write-Host "      $watchDest (Wear OS: see android/android/wear/README.md to install it on a watch)"
