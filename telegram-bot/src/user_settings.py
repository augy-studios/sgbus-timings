from .db import db


def get_display_name(chat_id: int, fallback: str) -> str:
    row = db.execute("SELECT display_name FROM user_settings WHERE chat_id = ?", (chat_id,)).fetchone()
    if row and row["display_name"]:
        return row["display_name"]
    return fallback


def set_display_name(chat_id: int, name: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO user_settings (chat_id, display_name) VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET display_name = excluded.display_name
            """,
            (chat_id, name),
        )


def clear_display_name(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM user_settings WHERE chat_id = ?", (chat_id,))
