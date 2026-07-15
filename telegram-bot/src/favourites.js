import { db } from "./db.js";

const listStmt = db.prepare(
  "SELECT stop_code AS code, stop_name AS name FROM favourites WHERE chat_id = ? ORDER BY stop_name"
);
const isFavStmt = db.prepare(
  "SELECT 1 FROM favourites WHERE chat_id = ? AND stop_code = ?"
);
const addStmt = db.prepare(
  `INSERT INTO favourites (chat_id, stop_code, stop_name, created_at)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(chat_id, stop_code) DO UPDATE SET stop_name = excluded.stop_name`
);
const removeStmt = db.prepare(
  "DELETE FROM favourites WHERE chat_id = ? AND stop_code = ?"
);

export function listFavourites(chatId) {
  return listStmt.all(chatId);
}

export function isFavourite(chatId, code) {
  return !!isFavStmt.get(chatId, code);
}

export function addFavourite(chatId, code, name) {
  addStmt.run(chatId, code, name, Date.now());
}

export function removeFavourite(chatId, code) {
  removeStmt.run(chatId, code);
}

export function toggleFavourite(chatId, code, name) {
  if (isFavourite(chatId, code)) {
    removeFavourite(chatId, code);
    return false;
  }
  addFavourite(chatId, code, name);
  return true;
}
