# Releases

The installers built here: `sg-bus-timings-<version>.apk` for Android, made by
`android\build-apk.ps1`. They're kept out of git (too big, and built from the source anyway);
only this README is committed. Share them through a **GitHub Release**, where anyone can
download them from <https://github.com/augy-studios/sgbus-timings/releases>.

## Build the file

In PowerShell, from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

It ends with `Done: ...\release\sg-bus-timings-1.1.0.apk`. For a new version, raise the version
first (see `android/README.md`, "Build the APK"), or phones with the old one won't take it as
an update.

## Put it on GitHub

1. Commit and push your changes, so the release points at the code it was built from.
2. Open <https://github.com/augy-studios/sgbus-timings/releases/new>.
3. **Choose a tag**: type a new one, such as `android-v1.1.0`, and pick
   **Create new tag: android-v1.1.0 on publish**. Leave the target as `main`.
4. **Release title**: `SG Bus Timings for Android 1.1.0`.
5. **Describe this release**: what's new, for the people installing it. For example:

   ```markdown
   Install: download `sg-bus-timings-1.1.0.apk` below on your Android phone and open it.
   If Android asks, allow installing apps from your browser or Files.

   New:
   - Your phone's calendar in Navigate's Calendar tab
   - uwusgbus:// links open the app
   ```

6. Drag `sg-bus-timings-1.1.0.apk` from this folder into the box that says
   **Attach binaries by dropping them here or selecting them**. Wait for it to finish
   uploading.
7. Tick **Set as the latest release**, then **Publish release**.

The file is then at
`https://github.com/augy-studios/sgbus-timings/releases/latest`, which always points at the
newest one: a good link to share. GitHub also adds the source code as zips; those are fine to
leave.

## Before you share it

- **Deploy the site first** if the release changed `main-site/.well-known/assetlinks.json`.
  The app only hides Chrome's address bar once the live site lists its signing key.
- **The repository has to be public** for others to download it. A private repository's
  releases are only visible to people with access to it.
- **Never upload `android.keystore` or `keystore.properties`.** Only the `.apk`.

## If something goes wrong

| What happens | What to do |
|---|---|
| "App not installed" on the phone | An older copy signed with a different key is installed, such as one from PWABuilder. Uninstall SG Bus Timings, then install again. |
| "App not installed as package appears to be invalid" | The download didn't finish. Download it again. |
| The app shows an address bar at the top | The live site doesn't list the app's key yet: deploy the site, then close and reopen the app. |
| You uploaded the wrong file | On the release, **Edit**, delete the file with the bin icon, attach the right one, **Update release**. |
