import time

from .db import db


def list_favourite_routes(chat_id: int) -> list:
    return db.execute(
        """
        SELECT start_code, start_name, end_code, end_name
        FROM favourite_routes
        WHERE chat_id = ?
        ORDER BY start_name, end_name
        """,
        (chat_id,),
    ).fetchall()


def is_favourite_route(chat_id: int, start_code: str, end_code: str) -> bool:
    return db.execute(
        "SELECT 1 FROM favourite_routes WHERE chat_id = ? AND start_code = ? AND end_code = ?",
        (chat_id, start_code, end_code),
    ).fetchone() is not None


def add_favourite_route(chat_id: int, start_code: str, start_name: str, end_code: str, end_name: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO favourite_routes (chat_id, start_code, start_name, end_code, end_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(chat_id, start_code, end_code) DO UPDATE SET
                start_name = excluded.start_name,
                end_name = excluded.end_name
            """,
            (chat_id, start_code, start_name, end_code, end_name, int(time.time() * 1000)),
        )


def remove_favourite_route(chat_id: int, start_code: str, end_code: str) -> None:
    with db:
        db.execute(
            "DELETE FROM favourite_routes WHERE chat_id = ? AND start_code = ? AND end_code = ?",
            (chat_id, start_code, end_code),
        )


def toggle_favourite_route(chat_id: int, start_code: str, start_name: str, end_code: str, end_name: str) -> bool:
    """Stars or unstars a route, returning whether it's a favourite now. A route runs one
    way, so A to B and B to A are two different favourites."""
    if is_favourite_route(chat_id, start_code, end_code):
        remove_favourite_route(chat_id, start_code, end_code)
        return False
    add_favourite_route(chat_id, start_code, start_name, end_code, end_name)
    return True
