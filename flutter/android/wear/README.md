# SG Bus Timings for Wear OS

A small native watch app (Java, no Compose), built alongside the phone's by
`android/build-apk.ps1` into `release/<version>/sg-bus-timings-<version>-watch.apk`. How
people install it is in the guide: `docs-site/content/web/wear-os.md`.

| Part | What it does |
|---|---|
| `TimingsTile` | The **Bus timings** tile: the nearest favourite stop's next buses, the minutes counting down on the watch (ProtoLayout's dynamic time, `DynamicInstant.durationUntil`) between fetches. Fresh for a minute (`setFreshnessIntervalMillis`); a tap opens `MainActivity` |
| `MainActivity` | The watch's screen: the nearest favourite's buses, and every other favourite to pick. Asks for coarse location, once |
| `FavouritesListener` | The favourite stops, from the phone's `WearSync.java` over the Wearable Data Layer (`/favourites`, `{ stops: "[{ code, name, lat, lng }]" }`), then asks the tile to redraw |
| `Store` | The favourites kept, the watch's location, and the timings from the site's `/api/bus-arrivals` |

## Why it's built the way it is

- **Same application id and signing key as the phone's** (`org.uwuapps.sgbus`, the phone's
  keystore): the Data Layer only connects an app to its own copy on the other device. The
  build script checks both APKs carry the usual key.
- **Same version as the phone's**, read from `app/build.gradle` by `wear/build.gradle`, so a
  version is only ever raised there.
- **Standalone** (`com.google.android.wearable.standalone`): it fetches the timings itself,
  through the phone or its own connection; only the favourites come from the phone, and the
  last ones stay if the phone's away.
- **minSdk 30**, Wear OS 3, the first to take other apps' tiles.
- Not on Google Play, so the phone's self-updater (`UpdateActivity`, `api/app-release.js`)
  never offers the watch's APK: it picks `sg-bus-timings-<version>.apk` by name, and skips
  any `-watch` one.
