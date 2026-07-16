import time

from .db import db


def list_favourites(chat_id: int) -> list:
    return db.execute(
        "SELECT stop_code AS code, stop_name AS name FROM favourites WHERE chat_id = ? ORDER BY stop_name",
        (chat_id,),
    ).fetchall()


def is_favourite(chat_id: int, code: str) -> bool:
    return db.execute(
        "SELECT 1 FROM favourites WHERE chat_id = ? AND stop_code = ?", (chat_id, code)
    ).fetchone() is not None


def add_favourite(chat_id: int, code: str, name: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO favourites (chat_id, stop_code, stop_name, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(chat_id, stop_code) DO UPDATE SET stop_name = excluded.stop_name
            """,
            (chat_id, code, name, int(time.time() * 1000)),
        )


def remove_favourite(chat_id: int, code: str) -> None:
    with db:
        db.execute("DELETE FROM favourites WHERE chat_id = ? AND stop_code = ?", (chat_id, code))


def toggle_favourite(chat_id: int, code: str, name: str) -> bool:
    if is_favourite(chat_id, code):
        remove_favourite(chat_id, code)
        return False
    add_favourite(chat_id, code, name)
    return True
