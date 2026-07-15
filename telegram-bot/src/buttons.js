import crypto from "node:crypto";
import { db } from "./db.js";

const insertStmt = db.prepare(
  "INSERT INTO buttons (id, action, payload, created_at) VALUES (?, ?, ?, ?)"
);
const getStmt = db.prepare("SELECT * FROM buttons WHERE id = ?");

/**
 * Persists a button's action/payload to SQLite and returns Telegram
 * callback_data referencing it. Rows are never expired, so buttons keep
 * working across bot restarts and Telegram's 64-byte callback_data limit
 * never becomes a problem regardless of payload size.
 */
export function makeButton(action, payload) {
  const id = crypto.randomBytes(6).toString("base64url");
  insertStmt.run(id, action, JSON.stringify(payload ?? {}), Date.now());
  return `b:${id}`;
}

/** Resolves callback_data created by makeButton() back into { action, payload }. */
export function resolveButton(callbackData) {
  if (!callbackData || !callbackData.startsWith("b:")) return null;
  const id = callbackData.slice(2);
  const row = getStmt.get(id);
  if (!row) return null;
  return { action: row.action, payload: JSON.parse(row.payload) };
}
