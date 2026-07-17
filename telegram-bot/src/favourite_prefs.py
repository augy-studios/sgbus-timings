from .db import db

DEFAULT_POSITION = "top"


def get_pref(chat_id: int, kind: str) -> str:
    row = db.execute(
        "SELECT position FROM favourite_prefs WHERE chat_id = ? AND kind = ?", (chat_id, kind)
    ).fetchone()
    return row["position"] if row else DEFAULT_POSITION


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
