"""/nav's state: the journey a chat is planning, and the navs it has starred (/mynavs)."""

import json
import time

from .db import db


def _now_ms() -> int:
    return int(time.time() * 1000)


# ---------- the nav being planned ----------


def get_nav_draft(chat_id: int):
    return db.execute("SELECT * FROM nav_drafts WHERE chat_id = ?", (chat_id,)).fetchone()


def start_nav_draft(chat_id: int, field: "str | None", from_place: "dict | None" = None, to_place: "dict | None" = None, when: "dict | None" = None, via: "dict | None" = None) -> None:
    """Starts (or replaces) the nav the chat is planning. `field` is what the bot is waiting
    to be told: the end, "from" or "to", "when:leave" / "when:arrive" for a time, or None
    when both ends are set. `when` is the time already picked (when.py), `via` a stop on the
    way, from a starred nav."""

    def parts(p):
        return (p["label"], p["lat"], p["lng"]) if p else (None, None, None)

    with db:
        db.execute("DELETE FROM nav_drafts WHERE chat_id = ?", (chat_id,))
        db.execute(
            """
            INSERT INTO nav_drafts (chat_id, field, from_label, from_lat, from_lng, to_label, to_lat, to_lng, via_label, via_lat, via_lng, when_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (chat_id, field, *parts(from_place), *parts(to_place), *parts(via), json.dumps(when) if when else None, _now_ms()),
        )


def draft_place(draft, field: str) -> "dict | None":
    if not draft or draft[f"{field}_label"] is None:
        return None
    return {"label": draft[f"{field}_label"], "lat": draft[f"{field}_lat"], "lng": draft[f"{field}_lng"]}


def draft_when(draft) -> "dict | None":
    """The time a draft was started with, None for Leave now."""
    return json.loads(draft["when_json"]) if draft and draft["when_json"] else None


def clear_nav_draft(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM nav_drafts WHERE chat_id = ?", (chat_id,))


def draft_via(draft) -> "dict | None":
    """The draft's stop on the way, None without one."""
    return draft_place(draft, "via") if draft and "via_label" in draft.keys() else None


def row_via(row) -> "dict | None":
    """A starred nav's stop on the way, as a place, None without one."""
    if row is None or "via_label" not in row.keys() or row["via_label"] is None or row["via_lat"] is None:
        return None
    return {"label": row["via_label"], "lat": row["via_lat"], "lng": row["via_lng"]}


# ---------- favourite navs ----------

# A nav is its two ends and its stop on the way: A to B, and A to B by way of C, are two
# favourites, as on the web app.
_SAME = (
    "chat_id = ? AND ROUND(from_lat, 5) = ROUND(?, 5) AND ROUND(from_lng, 5) = ROUND(?, 5) "
    "AND ROUND(to_lat, 5) = ROUND(?, 5) AND ROUND(to_lng, 5) = ROUND(?, 5) "
    "AND ((? IS NULL AND via_lat IS NULL) OR (ROUND(via_lat, 5) = ROUND(?, 5) AND ROUND(via_lng, 5) = ROUND(?, 5)))"
)


def _same_args(chat_id, a, b, via):
    v = via or {}
    return (chat_id, a["lat"], a["lng"], b["lat"], b["lng"], v.get("lat"), v.get("lat"), v.get("lng"))


def is_favourite_nav(chat_id: int, a: dict, b: dict, via: "dict | None" = None) -> bool:
    return db.execute(f"SELECT 1 FROM favourite_navs WHERE {_SAME}", _same_args(chat_id, a, b, via)).fetchone() is not None


def toggle_favourite_nav(chat_id: int, a: dict, b: dict, via: "dict | None" = None) -> bool:
    """Stars or unstars a nav, with its stop on the way if it has one. True when it's now a
    favourite."""
    with db:
        if is_favourite_nav(chat_id, a, b, via):
            db.execute(f"DELETE FROM favourite_navs WHERE {_SAME}", _same_args(chat_id, a, b, via))
            return False
        v = via or {}
        db.execute(
            """
            INSERT INTO favourite_navs (chat_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, via_label, via_lat, via_lng, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (chat_id, a["label"], a["lat"], a["lng"], b["label"], b["lat"], b["lng"], v.get("label"), v.get("lat"), v.get("lng"), _now_ms()),
        )
        return True


def list_favourite_navs(chat_id: int) -> list:
    return db.execute("SELECT * FROM favourite_navs WHERE chat_id = ? ORDER BY created_at", (chat_id,)).fetchall()


def get_favourite_nav(chat_id: int, nav_id: int):
    return db.execute("SELECT * FROM favourite_navs WHERE chat_id = ? AND id = ?", (chat_id, nav_id)).fetchone()
