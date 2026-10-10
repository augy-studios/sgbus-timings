"""Home and Work: a place each per chat, set in /settings (or /sethome and /setwork), and
offered by the Home and Work buttons on the /nav and /route panels. The web app has the
same, kept in the browser."""

import time

from .db import db

# The kinds, each with its icon and name.
KINDS = {"home": ("🏠", "Home"), "work": ("💼", "Work")}


def get_place(chat_id: int, kind: str) -> "dict | None":
    """{label, lat, lng}, with `stop` the stop code when it's a bus stop; None while unset."""
    row = db.execute(
        "SELECT label, lat, lng, stop_code FROM saved_places WHERE chat_id = ? AND kind = ?", (chat_id, kind)
    ).fetchone()
    if not row:
        return None
    return {"label": row["label"], "lat": row["lat"], "lng": row["lng"], **({"stop": row["stop_code"]} if row["stop_code"] else {})}


def set_place(chat_id: int, kind: str, label: str, lat: float, lng: float, stop_code: "str | None" = None) -> None:
    with db:
        db.execute(
            """
            INSERT INTO saved_places (chat_id, kind, label, lat, lng, stop_code, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chat_id, kind) DO UPDATE SET
                label = excluded.label, lat = excluded.lat, lng = excluded.lng,
                stop_code = excluded.stop_code, updated_at = excluded.updated_at
            """,
            (chat_id, kind, label[:120], lat, lng, stop_code, int(time.time() * 1000)),
        )


def clear_place(chat_id: int, kind: str) -> None:
    with db:
        db.execute("DELETE FROM saved_places WHERE chat_id = ? AND kind = ?", (chat_id, kind))


def nav_end(place: dict) -> dict:
    """A saved place as one end of a nav: just its name and point."""
    return {"label": place["label"], "lat": place["lat"], "lng": place["lng"]}
