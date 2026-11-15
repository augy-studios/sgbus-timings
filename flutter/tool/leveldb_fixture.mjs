// A localStorage database written by a real Chromium, as test/fixtures/desktop/leveldb/, for
// test/desktop/leveldb_test.dart to hold lib/desktop/leveldb.dart to (the reader that brings the
// Electron app's data across). Chromium writes it under the site's own origin
// (https://sgbus.uwuapps.org, served here by a tiny page of our own, never the real site), in two
// sittings, so the folder has both kinds of LevelDB file: what the first sitting wrote is folded
// into a .ldb table when the second opens the database, and the second's writes are in the .log.
// What Chromium itself reads back at the end goes to test/fixtures/desktop/leveldb_expected.json.
//
// The keys cover: plain Latin-1 text, non-Latin-1 text (Chinese, Tamil, an emoji) in keys and
// values, a key deleted in the same sitting, one deleted in the next (so the deletion in the .log
// hides the value in the .ldb), one overwritten, an empty value, a value in the .log bigger than a
// log block (32 KiB, so it's split across blocks), and another origin's key, which must be left
// out. The first sitting writes enough to fill LevelDB's memory buffer, which makes the .ldb.
//
// To regenerate (needs Playwright with Chromium, installed globally), from flutter/:
//   NODE_PATH="$(npm root -g)" node tool/leveldb_fixture.mjs
// then run flutter test test/desktop/leveldb_test.dart. Don't hand-edit the fixture.
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Through require, as ES module imports don't look in NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const SITE = 'https://sgbus.uwuapps.org';
const OTHER = 'https://example.org';
const OUT = 'test/fixtures/desktop/leveldb';
const EXPECTED = 'test/fixtures/desktop/leveldb_expected.json';

const profile = mkdtempSync(join(tmpdir(), 'sgbus-leveldb-'));

// One sitting: Chromium opens the profile, runs [write] on the site's page (and [other] on
// another origin's), and closes, which writes localStorage to disk.
async function sitting(write, other) {
  const context = await chromium.launchPersistentContext(profile, { headless: true });
  // Every request answered here, so nothing reaches the network.
  await context.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fixture</title>' }));
  const page = await context.newPage();
  await page.goto(`${SITE}/`);
  await page.evaluate(write);
  if (other) {
    await page.goto(`${OTHER}/`);
    await page.evaluate(other);
    await page.goto(`${SITE}/`);
  }
  const all = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  await context.close();
  return all;
}

await sitting(
  () => {
    localStorage.setItem('sgbus.favs', JSON.stringify([{ code: '84009', name: 'Bedok Int' }]));
    localStorage.setItem('sgbus.cafe', 'Café au lait');
    localStorage.setItem('sgbus.name.zh', '勿洛巴士转换站');
    localStorage.setItem('sgbus.name.ta', 'பேருந்து நிலையம்');
    localStorage.setItem('sgbus.emoji', '🚌 on its way');
    localStorage.setItem('巴士', 'a key in Chinese');
    localStorage.setItem('sgbus.empty', '');
    localStorage.setItem('sgbus.gone', 'deleted in the same sitting');
    localStorage.removeItem('sgbus.gone');
    localStorage.setItem('sgbus.later-gone', 'deleted in the next sitting');
    localStorage.setItem('sgbus.changed', 'first');
    // Enough to fill LevelDB's memory buffer, so the first sitting's writes go to a .ldb table.
    for (let i = 0; i < 8; i++) localStorage.setItem(`sgbus.pad.${i}`, `${i} abcdefghijklmnopqrstuvwxyz `.repeat(1500));
  },
  () => localStorage.setItem('sgbus.elsewhere', 'another origin'),
);
const expected = await sitting(() => {
  localStorage.removeItem('sgbus.later-gone');
  localStorage.setItem('sgbus.changed', 'second');
  localStorage.setItem('sgbus.second', 'from the second sitting');
  localStorage.setItem('sgbus.big', 'x'.repeat(40000));
});

rmSync(OUT, { recursive: true, force: true });
const db = join(profile, 'Default', 'Local Storage', 'leveldb');
// The database's own files: not LOCK, which only says a Chromium has it open, nor LevelDB's
// text logs (LOG, LOG.old), which name this computer's temporary folder.
cpSync(db, OUT, { recursive: true, filter: (src) => !/[\\/](LOCK|LOG|LOG\.old)$/.test(src) });
writeFileSync(EXPECTED, `${JSON.stringify(expected, null, 2)}\n`);
rmSync(profile, { recursive: true, force: true });
console.log(`${OUT}: ${readdirSync(OUT).join(', ')}`);
console.log(`${EXPECTED}: ${Object.keys(expected).length} keys`);
