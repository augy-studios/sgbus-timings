# SG Bus Timings: notes for Claude

The root `README.md` says what the project is, and each part's README has the full steps. This file
is the short list to know before changing anything.

The project is Augy's (`augyteo`). Decisions on features, releases and what goes into `main` are
his: ask, don't assume.

## This file

- **It's the source of truth for this repo.** Every session and every agent reads it first. Don't
  re-explore what it already says. Brief agents with it, so they don't have to.
- **Keep it true.** When a change makes anything here wrong, fix this file in the same commit: a
  new command, a moved folder, a new rule.
- **Keep it short.** Every session pays for every line. Put the full steps in the READMEs and point
  to them from here.

## Never

- Never read, write, print or commit a `.env` or `.env.local` file. The variable names are in
  `main-site/.env.example` and `telegram-bot/.env.example`; ask the owner to run anything that needs
  the real values.
- Never open, commit or upload the Android signing files (`flutter/android.keystore`,
  `flutter/keystore.properties`), `google-services.json` or the Firebase service account.
- Never open or commit the bot's database (`telegram-bot/data/bot.db`: users' chat IDs, names,
  birthdays and private calendar links) or its session files (`*.session`). A bot test run
  without its own `DB_PATH` can write into it: see *Tests and CI*.
- This repo is public. No tokens, keys, chat IDs or anyone's personal data in code, commits, docs,
  test fixtures or screenshots.
- Never run a second copy of the Telegram bot on the live bot's token.
- Never force-push.

## The parts

| Folder | What | Made with | Read first |
| --- | --- | --- | --- |
| `main-site/` | The website (a PWA, sgbus.uwuapps.org) and its API in `api/` | HTML, CSS and JavaScript, no framework or bundler; Vercel Functions | `main-site/README.md` |
| `flutter/` | The Android app and the desktop app (Windows, macOS, Linux) | Flutter 3.50.0, Java for Android's native parts | `flutter/README.md` |
| `flutter/android/wear/` | The Wear OS watch app | Native Java, not Flutter | `flutter/android/wear/README.md` |
| `cli/` | `sgbus`, the command line for Linux | Node.js 18+, running the website's own scripts | `cli/README.md` |
| `telegram-bot/` | The bot, @sgbus_app, and its Mini App | Python 3.10+, Telethon, SQLite | `telegram-bot/README.md`, `SETUP.md` |
| `docs-site/` | The guide, guide.sgbus.uwuapps.org | Markdown and `build.mjs` | `docs-site/README.md` |
| `migrations/` | The website's Supabase SQL | | the file headers |
| `scripts/` | Checks and tests, and the scripts that make the vendored data | | `main-site/README.md`, "Checks" |
| `release/`, `announcement/` | Each version's CLI files, release notes and announcements | | `release/README.md` |
| `docs/` | Specs for the apps' parts (`android-app-spec.md` is the old Capacitor one) | | |

**The website is the spec.** The apps, the bot and the command line follow it feature for feature.
When porting, keep its storage keys, words and API calls (`flutter/PORTING.md`).

## One version everywhere

Every app shares one version number. Raise it in all three places together, or the builds stop:

- `version:` in `flutter/pubspec.yaml`: the name, then `+` and a versionCode that is always higher
  than the last (phones won't take it as an update otherwise).
- `appVersion` in `flutter/lib/app/version.dart` (`flutter/test/desktop/version_test.dart` checks
  it matches).
- `version` in `cli/package.json` (`cli/build.mjs` stops if it differs).

## Website (`main-site/`)

- **Run it:** from `main-site/`, `npm install`, then `vercel dev`, which runs the API too. The owner
  puts `LTA_ACCOUNT_KEY` in `.env.local`.
- One plain script per feature in `js/`, loaded by `<script>` tags; the shared Navigate engine is in
  `js/nav-core/`. The API is one Vercel Function per file in `api/`. Folders starting with `_` are
  helpers, not routes.
- **Service worker:** raise `VERSION` at the top of `sw.js` on every change to anything it serves,
  and add new files to its `ASSETS` list. Without the raise, nobody gets the update bar and the old
  cache keeps answering.
- **Words:** mark text in `index.html` with `data-i18n="key"` (or `data-i18n-title`,
  `-aria-label`, `-placeholder`, `-alt`), and in scripts with `tr('key', 'English')` or
  `I18n.t(…)`. Then, from the repo root, `node scripts/i18n-check.mjs --write`: it rewrites
  `main-site/i18n/en.json` and `WORDS_REV` in `js/i18n.js`, and says what each other language is
  missing. It only reads `index.html`, `script.js` and the scripts directly in `js/`, not
  `js/nav-core/`. Translations keep every `{placeholder}`, or the check fails. Then, from
  `flutter/`, `dart run tool/sync_i18n.dart`, so the app says the same.
  - Languages: English, Chinese (`zh-SG`), Malay (`ms`) and Tamil (`ta`). A missing translation
    falls back to English. The translations weren't made by native speakers.
- **Keep in step:** comments saying "in step with …" (the wording varies; search for it without
  regard to case) name code that must change together across the site, the API, the app and the
  bot. Search for them before changing shared logic. For example, the public holidays are in four
  places, and each year's go into all four: `js/when.js`, `js/nav-core/when.js`,
  `telegram-bot/src/when.py` and `flutter/lib/data/when.dart`. Each academic year's term dates go
  into `data/campus/config.json`.
- **Vendored data** is made by scripts, never edited by hand. Run them from the repo root:
  - `data/rail.json`, and `rail-stations.json`, which the bot shares (`scripts/vendor-rail.mjs`);
  - `data/rail-tracks.json` (`scripts/vendor-rail-tracks.mjs`);
  - `data/campus/roads.json` (`scripts/shuttle-roads.mjs`; run it again when a route's stops
    change);
  - the bot's `planning_areas.json` (`scripts/vendor-planning-areas.mjs`).
- **Database:** Supabase, reached only from the API. `migrations/` holds numbered SQL files that
  the owner runs by hand in Supabase's SQL editor. Never edit one once written: add the next number.
- **Settings:** the API's environment variables are set in Vercel by the owner. Keys that are only
  for the server never go into the page.

## Apps (`flutter/`)

- **Flutter 3.50.0**, as CI pins it. Older Flutters can't get the desktop packages.
- Import `package:material_ui/material_ui.dart`, never `package:flutter/material.dart` (Flutter 3.50
  moved Material out; Cupertino is `cupertino_ui`).
- One `lib/main.dart` serves phone and desktop. Desktop-only code lives in `lib/desktop/`. Shared
  screens never import it: they ask `Native.has('desktop')`. A new screen goes in
  `lib/features/` and is registered in `lib/features/registry.dart`.
- **Commands,** from `flutter/`: `flutter pub get`, `flutter analyze --no-fatal-infos`, `flutter
  run` (add `-d windows`, `-d macos` or `-d linux` for the desktop app).
- **Tests:** leave out `test/shots/` unless you mean to retake the guide's screenshots. In bash:
  `flutter test test/desktop test/*_test.dart`. The shots redraw the committed PNGs in
  `docs-site/public/screenshots/android/` and `desktop/`. If they ran by accident, restore those
  two folders with `git checkout --` and delete any new PNGs there. The committed desktop set was
  rendered on a Mac; the final one is to be rendered on Windows (`docs-site/README.md`).
- **The app's own words** are in `assets/i18n_app/<language>.json`. Every key goes into all four
  languages. `test/i18n_test.dart` checks that, and that every `tr('key'` exists and the app has the
  site's words. A failing `flutter test` stops the release workflow building any desktop installer.
- **APK:** `powershell -ExecutionPolicy Bypass -File flutter\build-apk.ps1` (the `-Aab` switch makes
  the Play bundle). It needs the signing key, which isn't in git. The `.aab` and the `-mapping.txt`
  never go on a GitHub release.
- **Check anything native on a release build:** R8 only shrinks release builds, so a debug build
  hides what it breaks. Anything found by reflection outside the plugins needs a rule in
  `android/app/proguard-rules.pro`.
- **Desktop installers:** never change their names, ids, registry keys, the `.msi` UpgradeCode or
  the settings folders (such as `%APPDATA%\SG Bus Timings`). They're the old Electron app's, and
  changing them stops old copies updating or loses people's settings
  (`flutter/installers/README.md`). Every release needs its `latest*.yml` files, or no desktop copy
  can see the new version.
- Flutter can't cross-build: each system builds its own installers, which is why CI does them.

## Telegram bot (`telegram-bot/`)

- **Run it:** from `telegram-bot/`, a virtual environment, `pip install -r requirements.txt`, then
  `python -m src.main`. The live bot runs on a server in `tmux` and is updated by hand
  (`SETUP.md`).
- The database's tables are made in `src/db.py`; new columns are added there with an
  `ALTER TABLE` check. There's no migration tool.
- A leftover `data/bot.session` makes Telethon ignore a new bot token (`MIGRATION.md`).
- Cards are HTML widgets sent through the Bot API, to private chats only.

## Command line (`cli/`)

- `node cli/build.mjs` builds `sgbus` and the `.deb` in `cli/dist/`, and copies both into
  `release/<version>/`, where they're committed. It works on Windows too.
- Its commands are the website's (`main-site/js/sgbus-core.js` and the scripts it loads), so a
  change there changes the command line too.

## Guide (`docs-site/`)

- From `docs-site/`: `npm run dev` (port 4321) or `npm run build`. Every page must be listed in
  `content/SUMMARY.md`, and a broken link or heading anchor fails the build.
- Screenshots: `docs-site/README.md`, "Screenshots".

## Tests and CI

- No one command runs everything:
  - Website: the checks listed in `main-site/README.md`, "Checks", run from the repo root as
    `node scripts/<name>`. The `.cjs` ones need Playwright with Chrome, installed outside the repo.
  - Apps: as above.
  - Bot: `python3 scripts/bot-<name>-test.py` from the repo root. They fake Telegram and the site,
    and some need Node. Five make their own throwaway database. `bot-saved-navs-test.py` doesn't:
    set `DB_PATH` (and the dummy values in its header) yourself, or it writes into the real
    `data/bot.db`.
- **CI doesn't check `main` or pull requests.** `build-desktop.yml` runs `flutter test`, then builds
  the desktop installers, the CLI and the apt repository. It runs when a release is published, or by
  hand: with a `release_tag` the files go onto that release; left empty, they stay on the run for
  30 days. `desktop-check.yml` only watches the old `desktop-flutter-rewrite` branch. So run the
  tests for what you changed before you push.

## Releases

Follow `release/README.md` step by step: its notes format, title and checks matter, because the
Android app's update page reads the notes. In short:

1. Raise the version in the three places.
2. Write the notes in `announcement/release-notes-<version>.md`, and add them to
   `main-site/PATCHNOTES.md`.
3. Commit and push, and let the website deploy before sharing the release.
4. Publish a GitHub release tagged `android-v<version>`, targeting `main`. The Android app's
   updater finds releases by that prefix.
5. Attach the APKs before you publish.
6. Within the hour, check that the Actions run is green and the assets are complete.

From 2.4.1 the APKs and desktop installers stay out of git; the ones up to 2.4.0 are committed.

## Git

- **`main` deploys:** the website and the guide go live on Vercel from it, and every pushed branch
  gets a preview. Ask before pushing to `main`.
- Commit subjects are plain English in sentence case, often with the area first: "Desktop: …",
  "Android: …", "Guide: …", "Docs: …", "CI: …", "Navigate: …". Releases are "Release X.Y.Z: <headline>".
  Add a bullet list in the body when there's more to say.

## Writing

- Docs, notes and the apps' words are in plain English with British spelling (colour,
  favourites), in short sentences.
- When a README and the code disagree, the code is right. Fix the README in the same change.
