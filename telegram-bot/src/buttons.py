import base64
import json
import os
import time
from typing import Optional

from .db import db


def make_button(action: str, payload: Optional[dict] = None) -> bytes:
    """
    Persists a button's action/payload to SQLite and returns Telegram
    callback_data referencing it. Rows are never expired, so buttons keep
    working across bot restarts and Telegram's 64-byte callback_data limit
    never becomes a problem regardless of payload size.
    """
    button_id = base64.urlsafe_b64encode(os.urandom(6)).decode().rstrip("=")
    with db:
        db.execute(
            "INSERT INTO buttons (id, action, payload, created_at) VALUES (?, ?, ?, ?)",
            (button_id, action, json.dumps(payload or {}), int(time.time() * 1000)),
        )
    return f"b:{button_id}".encode()


def resolve_button(callback_data: Optional[bytes]) -> Optional[dict]:
    """Resolves callback_data created by make_button() back into {action, payload}."""
    if not callback_data or not callback_data.startswith(b"b:"):
        return None
    button_id = callback_data[2:].decode()
    row = db.execute("SELECT * FROM buttons WHERE id = ?", (button_id,)).fetchone()
    if not row:
        return None
    return {"action": row["action"], "payload": json.loads(row["payload"])}
