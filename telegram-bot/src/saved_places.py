"""Home, Work and any other place saved, per chat. Home and Work are set in /settings (or
/sethome and /setwork) and /places; the rest, each with a name of its own if you like
("Gym", "Mum's"), only in /places. All of them are offered by the place buttons on the /nav
and /route panels. The web app has the same, kept in the browser.

They share one table: Home and Work under their own kind, the rest under "p:<n>"."""

import re
import time

from .db import db

# The kinds, each with its icon and name.
KINDS = {"home": ("🏠", "Home"), "work": ("💼", "Work")}
CUSTOM_ICON = "📍"
# More than anybody saves, and it keeps the /nav and /route panels to a few rows.
MAX_CUSTOM = 30
_CUSTOM_RE = re.compile(r"^p:(\d+)$")


def is_kind(kind) -> bool:
    """Home, Work, or one of the chat's own places' kinds."""
    return isinstance(kind, str) and (kind in KINDS or bool(_CUSTOM_RE.match(kind)))


def _row(row) -> dict:
    kind = row["kind"]
    fixed = KINDS.get(kind)
    return {
        "kind": kind,
        "name": fixed[1] if fixed else (row["name"] or row["label"]),
        "icon": fixed[0] if fixed else CUSTOM_ICON,
        "label": row["label"],
        "lat": row["lat"],
        "lng": row["lng"],
        **({"stop": row["stop_code"]} if row["stop_code"] else {}),
    }


def get_place(chat_id: int, kind: str) -> "dict | None":
    """{kind, name, icon, label, lat, lng}, with `stop` the stop code when it's a bus stop;
    None while unset (or for a place deleted since)."""
    row = db.execute(
        "SELECT kind, name, label, lat, lng, stop_code FROM saved_places WHERE chat_id = ? AND kind = ?", (chat_id, kind)
    ).fetchone()
    return _row(row) if row else None


def list_places(chat_id: int) -> list:
    """Every place the chat has saved: Home and Work first, then the rest as they were saved."""
    rows = db.execute(
        "SELECT kind, name, label, lat, lng, stop_code FROM saved_places WHERE chat_id = ? ORDER BY rowid", (chat_id,)
    ).fetchall()
    places = [_row(r) for r in rows]
    return sorted(places, key=lambda p: (0 if p["kind"] == "home" else 1 if p["kind"] == "work" else 2))


def custom_count(chat_id: int) -> int:
    return db.execute(
        "SELECT COUNT(*) AS n FROM saved_places WHERE chat_id = ? AND kind LIKE 'p:%'", (chat_id,)
    ).fetchone()["n"]


def set_place(chat_id: int, kind: str, label: str, lat: float, lng: float, stop_code: "str | None" = None) -> None:
    """Saves where a place is, keeping its name."""
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


def add_place(chat_id: int, label: str, lat: float, lng: float, stop_code: "str | None" = None, name: str = "") -> "str | None":
    """Saves a new place of the chat's own, answering its kind, or None when it has as many as
    it can keep."""
    if custom_count(chat_id) >= MAX_CUSTOM:
        return None
    kinds = db.execute("SELECT kind FROM saved_places WHERE chat_id = ? AND kind LIKE 'p:%'", (chat_id,)).fetchall()
    n = max((int(_CUSTOM_RE.match(r["kind"]).group(1)) for r in kinds if _CUSTOM_RE.match(r["kind"])), default=0) + 1
    kind = f"p:{n}"
    set_place(chat_id, kind, label, lat, lng, stop_code)
    if name:
        rename_place(chat_id, kind, name)
    return kind


def rename_place(chat_id: int, kind: str, name: str) -> None:
    """A place of the chat's own named; empty goes back to being called what it is."""
    with db:
        db.execute(
            "UPDATE saved_places SET name = ?, updated_at = ? WHERE chat_id = ? AND kind = ?",
            (name.strip()[:40] or None, int(time.time() * 1000), chat_id, kind),
        )


def clear_place(chat_id: int, kind: str) -> None:
    with db:
        db.execute("DELETE FROM saved_places WHERE chat_id = ? AND kind = ?", (chat_id, kind))


def nav_end(place: dict) -> dict:
    """A saved place as one end of a nav: just its name and point. Your own places go by
    the name you gave them; Home and Work by where they are."""
    label = place["name"] if place.get("kind", "").startswith("p:") else place["label"]
    return {"label": label, "lat": place["lat"], "lng": place["lng"]}
