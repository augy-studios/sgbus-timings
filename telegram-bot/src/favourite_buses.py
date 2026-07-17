import time

from .db import db


def list_favourite_buses(chat_id: int) -> list:
    return db.execute(
        "SELECT service_no FROM favourite_buses WHERE chat_id = ? ORDER BY service_no",
        (chat_id,),
    ).fetchall()


def is_favourite_bus(chat_id: int, service_no: str) -> bool:
    return db.execute(
        "SELECT 1 FROM favourite_buses WHERE chat_id = ? AND service_no = ?", (chat_id, service_no)
    ).fetchone() is not None


def add_favourite_bus(chat_id: int, service_no: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO favourite_buses (chat_id, service_no, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(chat_id, service_no) DO NOTHING
            """,
            (chat_id, service_no, int(time.time() * 1000)),
        )


def remove_favourite_bus(chat_id: int, service_no: str) -> None:
    with db:
        db.execute("DELETE FROM favourite_buses WHERE chat_id = ? AND service_no = ?", (chat_id, service_no))
