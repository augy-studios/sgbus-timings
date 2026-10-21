// Builds the command-line edition for Linux (README.md), from cli/: `node build.mjs`.
//
//   dist/sgbus                                the one file: sgbus.js with the site's scripts
//                                             it runs (main-site/js) put inside it
//   dist/sg-bus-timings-cli-<version>-all.deb  that file as /usr/bin/sgbus, with the routines'
//                                             systemd timer and bash completion, for any
//                                             architecture: it needs only Node.js 18 or newer
//
// Both are copied to release/<version>/ beside the apps of the same version. The .deb is
// written here, an ar archive of two gzipped tarballs as dpkg-deb makes them, so it builds on
// any computer with Node, Windows included, and in GitHub Actions.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const { version, description, homepage } = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
const desktop = JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8')).version;
if (desktop !== version) throw new Error(`cli/package.json says ${version}, desktop/package.json ${desktop}: the apps share one version number.`);

// ---------- the one file ----------

const source = fs.readFileSync(path.join(here, 'sgbus.js'), 'utf8');
const files = [...source.matchAll(/const SITE_FILES = \[([^\]]+)\]/g)][0][1].match(/'([^']+)'/g).map((s) => s.slice(1, -1));
const scripts = Object.fromEntries(files.map((f) => [f, fs.readFileSync(path.join(root, 'main-site', 'js', f), 'utf8')]));
const marker = "'use strict';\n";
if (!source.includes(marker)) throw new Error("sgbus.js lost its 'use strict': the build puts the site's scripts after it.");
// A function, not a string, to put them in: the scripts are full of "$'" and "$`", which a
// replacement string reads as the text either side of the match.
const bundled = source.replace(/\r\n/g, '\n').replace(marker, () => `${marker}const BUILT_VERSION = ${JSON.stringify(version)};\nconst SITE_SCRIPTS = ${JSON.stringify(scripts)};\n`);

const dist = path.join(here, 'dist');
fs.mkdirSync(dist, { recursive: true });
fs.writeFileSync(path.join(dist, 'sgbus'), bundled, { mode: 0o755 });

// ---------- the .deb ----------

const now = Math.floor(Date.now() / 1000);

// One ustar entry: a 512-byte header, then the file padded to 512.
function tarEntry(name, body, mode, dir = false) {
  const h = Buffer.alloc(512);
  const put = (text, at, len) => h.write(text, at, len, 'utf8');
  const octal = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';
  put(name, 0, 100);
  put(octal(mode, 8), 100, 8);
  put(octal(0, 8), 108, 8);
  put(octal(0, 8), 116, 8);
  put(octal(dir ? 0 : body.length, 12), 124, 12);
  put(octal(now, 12), 136, 12);
  put('        ', 148, 8);
  put(dir ? '5' : '0', 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  put('root', 265, 32);
  put('root', 297, 32);
  let sum = 0;
  for (const b of h) sum += b;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  const padded = dir ? Buffer.alloc(0) : Buffer.concat([body, Buffer.alloc((512 - (body.length % 512)) % 512)]);
  return Buffer.concat([h, padded]);
}

// A gzipped tarball of { path: { body, mode } }, with every folder on the way.
function tarball(entries) {
  const dirs = new Set(['./']);
  for (const p of Object.keys(entries)) {
    const parts = p.split('/').slice(1, -1);
    for (let i = 1; i <= parts.length; i++) dirs.add(`./${parts.slice(0, i).join('/')}/`);
  }
  const blocks = [...dirs].sort().map((d) => tarEntry(d, null, 0o755, true));
  for (const [p, { body, mode }] of Object.entries(entries)) blocks.push(tarEntry(p, body, mode));
  return zlib.gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]), { level: 9 });
}

// An ar archive, as .deb files are.
function ar(members) {
  const parts = [Buffer.from('!<arch>\n')];
  for (const [name, body] of members) {
    const head = name.padEnd(16) + String(now).padEnd(12) + '0'.padEnd(6) + '0'.padEnd(6) + '100644'.padEnd(8) + String(body.length).padEnd(10) + '`\n';
    parts.push(Buffer.from(head), body);
    if (body.length % 2) parts.push(Buffer.from('\n'));
  }
  return Buffer.concat(parts);
}

const read = (p) => Buffer.from(fs.readFileSync(path.join(here, p), 'utf8').replace(/\r\n/g, '\n'));
const copyright = `Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/
Upstream-Name: SG Bus Timings
Source: https://github.com/augy-studios/sgbus-timings

Files: *
Copyright: UwU Apps
License: MIT
 ${fs.readFileSync(path.join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').map((l) => l.trim() || '.').join('\n ')}
`;
const data = {
  './usr/bin/sgbus': { body: Buffer.from(bundled), mode: 0o755 },
  './usr/lib/systemd/user/sgbus-routines.service': { body: read('linux/sgbus-routines.service'), mode: 0o644 },
  './usr/lib/systemd/user/sgbus-routines.timer': { body: read('linux/sgbus-routines.timer'), mode: 0o644 },
  './usr/share/bash-completion/completions/sgbus': { body: read('linux/sgbus.bash-completion'), mode: 0o644 },
  './usr/share/doc/sgbus-timings-cli/README.md': { body: read('README.md'), mode: 0o644 },
  './usr/share/doc/sgbus-timings-cli/copyright': { body: Buffer.from(copyright), mode: 0o644 },
};
const installedKb = Math.ceil(Object.values(data).reduce((sum, f) => sum + f.body.length, 0) / 1024);
const control = `Package: sgbus-timings-cli
Version: ${version}
Architecture: all
Maintainer: UwU Apps <augybiz@gmail.com>
Installed-Size: ${installedKb}
Depends: nodejs (>= 18)
Recommends: libnotify-bin
Section: utils
Priority: optional
Homepage: ${homepage}
Description: Live Singapore bus timings in the terminal
 ${description}
 .
 The command is sgbus: sgbus 84009 for a stop's timings, sgbus help for the rest.
`;
const deb = ar([
  ['debian-binary', Buffer.from('2.0\n')],
  ['control.tar.gz', tarball({ './control': { body: Buffer.from(control), mode: 0o644 } })],
  ['data.tar.gz', tarball(data)],
]);
const debName = `sg-bus-timings-cli-${version}-all.deb`;
fs.writeFileSync(path.join(dist, debName), deb);

// ---------- beside the apps ----------

const release = path.join(root, 'release', version);
fs.mkdirSync(release, { recursive: true });
fs.copyFileSync(path.join(dist, 'sgbus'), path.join(release, 'sgbus'));
fs.copyFileSync(path.join(dist, debName), path.join(release, debName));
console.log(`Built sgbus ${version}:`);
for (const f of ['sgbus', debName]) console.log(`  release/${version}/${f}  ${Math.round(fs.statSync(path.join(release, f)).size / 1024)} KB`);
