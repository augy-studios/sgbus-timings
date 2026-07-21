from .db import db

DEFAULT_NOTIFICATIONS_ENABLED = True


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
        db.execute("UPDATE user_settings SET display_name = NULL WHERE chat_id = ?", (chat_id,))


def get_birthday(chat_id: int) -> "str | None":
    row = db.execute("SELECT birthday FROM user_settings WHERE chat_id = ?", (chat_id,)).fetchone()
    return row["birthday"] if row and row["birthday"] else None


def set_birthday(chat_id: int, birthday: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO user_settings (chat_id, birthday) VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET birthday = excluded.birthday
            """,
            (chat_id, birthday),
        )


def clear_birthday(chat_id: int) -> None:
    with db:
        db.execute("UPDATE user_settings SET birthday = NULL WHERE chat_id = ?", (chat_id,))


def get_notifications_enabled(chat_id: int) -> bool:
    row = db.execute(
        "SELECT notifications_enabled FROM user_settings WHERE chat_id = ?", (chat_id,)
    ).fetchone()
    if row is None:
        return DEFAULT_NOTIFICATIONS_ENABLED
    return bool(row["notifications_enabled"])


def set_notifications_enabled(chat_id: int, enabled: bool) -> None:
    with db:
        db.execute(
            """
            INSERT INTO user_settings (chat_id, notifications_enabled) VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET notifications_enabled = excluded.notifications_enabled
            """,
            (chat_id, int(enabled)),
        )
