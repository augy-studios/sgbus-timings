# Builds the signed Android apps into release/<version>/ at the project root:
#
#     powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
#
# Installs the Capacitor packages if they're missing, syncs them into the Android project
# (native/), then Gradle builds the release APKs, the phone's (native/app/) and, from 2.1.0,
# the Wear OS watch's (native/wear/), both signed with android.keystore using the passwords
# in keystore.properties, and each signature is checked before they're copied out:
# sg-bus-timings-<version>.apk and sg-bus-timings-<version>-watch.apk.
#
# Needs a JDK 21 or later and the Android SDK. It finds them in JAVA_HOME and ANDROID_HOME if
# they're set, or else the newest JDK under Program Files and the SDK Bubblewrap kept in
# ~/.bubblewrap. Gradle fetches any SDK platform it's missing on the first build.

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

$gradleFile = Get-Content "$here\native\app\build.gradle" -Raw
$version = [regex]::Match($gradleFile, 'versionName "([^"]+)"').Groups[1].Value
Write-Host "Building SG Bus Timings $version for Android (JDK: $env:JAVA_HOME)..."

Push-Location $here
try {
    if (-not (Test-Path "$here\node_modules\@capacitor\android")) {
        & npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    }
    & npx cap sync android
    if ($LASTEXITCODE -ne 0) { throw 'cap sync failed.' }
} finally {
    Pop-Location
}

$gradle = Start-Process -FilePath "$here\native\gradlew.bat" -ArgumentList 'assembleRelease', '--no-daemon', '-q' `
    -WorkingDirectory "$here\native" -NoNewWindow -Wait -PassThru
if ($gradle.ExitCode -ne 0) { throw "Gradle failed (exit $($gradle.ExitCode)). Its messages are above." }

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

$signed = "$here\native\app\build\outputs\apk\release\app-release.apk"
$watch = "$here\native\wear\build\outputs\apk\release\wear-release.apk"
Test-Signed $signed 'phone'
Test-Signed $watch 'watch'

# Each version in a folder of its own, beside the desktop installers of the same number.
New-Item -ItemType Directory -Force "$root\release\$version" | Out-Null
$dest = "$root\release\$version\sg-bus-timings-$version.apk"
$watchDest = "$root\release\$version\sg-bus-timings-$version-watch.apk"
Copy-Item $signed $dest -Force
Copy-Item $watch $watchDest -Force
Write-Host "Done: $dest"
Write-Host "      $watchDest (Wear OS: see android/native/wear/README.md to install it on a watch)"
