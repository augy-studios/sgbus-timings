// A JSON-file-backed map, held in memory: devices in one file, the feeds'
// last state in another. The data is small (a subscription and a mode per
// device), so a database would be more to run than it is worth.
// Copied from alarm-clock's push-server/store.js.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SAVE_DELAY_MS = 1000;

export function createStore(file) {
  const items = new Map(Object.entries(read(file)));
  let timer = null;

  function save() {
    if (timer) return;
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  // Write to a temp file and rename, so a crash mid-write never leaves a
  // half-written file behind.
  function flush() {
    if (timer) clearTimeout(timer);
    timer = null;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(items)));
    renameSync(tmp, file);
  }

  return {
    get: (id) => items.get(id),
    has: (id) => items.has(id),
    set(id, value) {
      items.set(id, value);
      save();
    },
    delete(id) {
      if (items.delete(id)) save();
    },
    entries: () => items.entries(),
    get size() {
      return items.size;
    },
    // Call after changing a value in place.
    touch: save,
    flush,
  };
}

function read(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}
