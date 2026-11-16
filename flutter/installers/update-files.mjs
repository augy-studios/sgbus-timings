// Writes the small update files every copy of the desktop app reads to find a new version:
//
//   latest.yml              Windows: the .exe installer (x64 and Arm64 in one)
//   latest-mac.yml          macOS: the .zip (what the app updates from) and .dmg, both processors
//   latest-linux.yml        Linux x64: the AppImage (what the app updates from), .deb and .rpm
//   latest-linux-arm64.yml  Linux Arm64: the same
//
// They go on the GitHub release beside the installers. The Flutter app (lib/desktop/updater.dart)
// reads them, and so does the Electron app (2.4.x and before, through electron-updater), which is
// how Electron copies update to this one. So they're written exactly as electron-builder wrote
// them: the same keys, order, indentation and quoting, and the files in the same order. The one
// difference: no `blockMapSize` on the AppImage, as these AppImages carry no block map;
// electron-updater then downloads the whole file instead of only the changed parts.
//
// Run it from the flutter folder once that platform's installers are in build/dist/:
//
//   node installers/update-files.mjs windows        (or mac, linux-x64, linux-arm64)
//
// The version comes from pubspec.yaml. Plain Node (18 or later), nothing to install.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flutterDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(flutterDir, 'build', 'dist');

/**
 * Each platform's update file and the installers it lists, in electron-builder's order. The
 * first file is the one an updater installs (also given again as `path` and `sha512`).
 */
const platforms = {
  windows: { yml: 'latest.yml', files: (v) => [`sg-bus-timings-${v}-setup.exe`] },
  mac: {
    yml: 'latest-mac.yml',
    files: (v) => [
      `sg-bus-timings-${v}-mac-x64.zip`,
      `sg-bus-timings-${v}-mac-arm64.zip`,
      `sg-bus-timings-${v}-mac-x64.dmg`,
      `sg-bus-timings-${v}-mac-arm64.dmg`,
    ],
  },
  'linux-x64': {
    yml: 'latest-linux.yml',
    files: (v) => [`sg-bus-timings-${v}-x86_64.AppImage`, `sg-bus-timings-${v}-amd64.deb`, `sg-bus-timings-${v}-x86_64.rpm`],
  },
  'linux-arm64': {
    yml: 'latest-linux-arm64.yml',
    files: (v) => [`sg-bus-timings-${v}-arm64.AppImage`, `sg-bus-timings-${v}-arm64.deb`, `sg-bus-timings-${v}-aarch64.rpm`],
  },
};

/** The app's version from pubspec.yaml's `version: 2.5.0+42` line, without the build number. */
function pubspecVersion() {
  const text = readFileSync(join(flutterDir, 'pubspec.yaml'), 'utf8');
  const match = text.match(/^version:\s*([0-9.]+)/m);
  if (!match) throw new Error('No version line in pubspec.yaml.');
  return match[1];
}

/** A file's SHA-512 in base64, the form the update files use; read in pieces, as it's large. */
function sha512Base64(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', reject);
  });
}

/**
 * The update file's text, line for line as electron-builder writes it. [entries] is a list of
 * { url, sha512, size }; [releaseDate] an ISO time such as 2026-11-09T17:51:05.854Z.
 */
export function updateFileText(version, entries, releaseDate) {
  const lines = [`version: ${version}`, 'files:'];
  for (const entry of entries) {
    lines.push(`  - url: ${entry.url}`, `    sha512: ${entry.sha512}`, `    size: ${entry.size}`);
  }
  lines.push(`path: ${entries[0].url}`, `sha512: ${entries[0].sha512}`, `releaseDate: '${releaseDate}'`);
  return lines.join('\n') + '\n';
}

/** Reads the command line, hashes the platform's installers and writes its update file. */
async function main() {
  const platform = platforms[process.argv[2]];
  if (!platform) {
    console.error(`Which platform? node installers/update-files.mjs <${Object.keys(platforms).join('|')}>`);
    process.exit(2);
  }
  const version = pubspecVersion();
  const entries = [];
  for (const name of platform.files(version)) {
    const file = join(dist, name);
    if (!existsSync(file)) throw new Error(`${name} isn't in ${dist}: build the installers first.`);
    entries.push({ url: name, sha512: await sha512Base64(file), size: statSync(file).size });
  }
  const out = join(dist, platform.yml);
  writeFileSync(out, updateFileText(version, entries, new Date().toISOString()));
  console.log(`Wrote ${out}:\n${readFileSync(out, 'utf8')}`);
}

// Run only when started from the command line, so a test can import updateFileText.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
