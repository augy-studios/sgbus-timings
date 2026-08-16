from .db import db

DEFAULT_POSITION = "top"


def get_pref(chat_id: int, kind: str) -> str:
    row = db.execute(
        "SELECT position FROM favourite_prefs WHERE chat_id = ? AND kind = ?", (chat_id, kind)
    ).fetchone()
    return row["position"] if row else DEFAULT_POSITION


def pin_favourites(items: list, favourites, position: str, key=lambda item: item) -> list:
    """Stable-partitions items into favourited/non-favourited groups, ordering per
    `position` ('top' or 'bottom'), preserving each group's existing order.
    `key` pulls the value to look up in `favourites` out of each item, and defaults to
    the item itself for plain lists of codes or service numbers."""
    if not favourites:
        return items
    fav = [item for item in items if key(item) in favourites]
    rest = [item for item in items if key(item) not in favourites]
    return [*fav, *rest] if position != "bottom" else [*rest, *fav]


def set_pref(chat_id: int, kind: str, position: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO favourite_prefs (chat_id, kind, position)
            VALUES (?, ?, ?)
            ON CONFLICT(chat_id, kind) DO UPDATE SET position = excluded.position
            """,
            (chat_id, kind, position),
        )
