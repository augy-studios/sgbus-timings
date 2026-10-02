"""/nav's state: the journey a chat is planning, and the navs it has starred (/mynavs)."""

import time

from .db import db


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------- the nav being planned ----------


def get_nav_draft(chat_id: int):
    return db.execute("SELECT * FROM nav_drafts WHERE chat_id = ?", (chat_id,)).fetchone()


def start_nav_draft(chat_id: int, field: "str | None", from_place: "dict | None" = None, to_place: "dict | None" = None) -> None:
    """Starts (or replaces) the nav the chat is planning. `field` is the end the bot is
    waiting to be told, "from" or "to", or None when both are set."""

    def parts(p):
        return (p["label"], p["lat"], p["lng"]) if p else (None, None, None)

    with db:
        db.execute("DELETE FROM nav_drafts WHERE chat_id = ?", (chat_id,))
        db.execute(
            """
            INSERT INTO nav_drafts (chat_id, field, from_label, from_lat, from_lng, to_label, to_lat, to_lng, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (chat_id, field, *parts(from_place), *parts(to_place), _now_ms()),
        )


def draft_place(draft, field: str) -> "dict | None":
    if not draft or draft[f"{field}_label"] is None:
        return None
    return {"label": draft[f"{field}_label"], "lat": draft[f"{field}_lat"], "lng": draft[f"{field}_lng"]}


def clear_nav_draft(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM nav_drafts WHERE chat_id = ?", (chat_id,))


# ---------- favourite navs ----------

_SAME = (
    "chat_id = ? AND ROUND(from_lat, 5) = ROUND(?, 5) AND ROUND(from_lng, 5) = ROUND(?, 5) "
    "AND ROUND(to_lat, 5) = ROUND(?, 5) AND ROUND(to_lng, 5) = ROUND(?, 5)"
)


def is_favourite_nav(chat_id: int, a: dict, b: dict) -> bool:
    return db.execute(f"SELECT 1 FROM favourite_navs WHERE {_SAME}", (chat_id, a["lat"], a["lng"], b["lat"], b["lng"])).fetchone() is not None


def toggle_favourite_nav(chat_id: int, a: dict, b: dict) -> bool:
    """Stars or unstars a nav. True when it's now a favourite."""
    with db:
        if is_favourite_nav(chat_id, a, b):
            db.execute(f"DELETE FROM favourite_navs WHERE {_SAME}", (chat_id, a["lat"], a["lng"], b["lat"], b["lng"]))
            return False
        db.execute(
            """
            INSERT INTO favourite_navs (chat_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (chat_id, a["label"], a["lat"], a["lng"], b["label"], b["lat"], b["lng"], _now_ms()),
        )
        return True


def list_favourite_navs(chat_id: int) -> list:
    return db.execute("SELECT * FROM favourite_navs WHERE chat_id = ? ORDER BY created_at", (chat_id,)).fetchall()


def get_favourite_nav(chat_id: int, nav_id: int):
    return db.execute("SELECT * FROM favourite_navs WHERE chat_id = ? AND id = ?", (chat_id, nav_id)).fetchone()
