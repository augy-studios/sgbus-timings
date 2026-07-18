import time
from datetime import datetime

from .db import db


def add_routine(chat_id: int, hour: int, minute: int, days: str, stop_code: str, stop_name: str) -> int:
    with db:
        cursor = db.execute(
            """
            INSERT INTO routines (chat_id, hour, minute, days, stop_code, stop_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (chat_id, hour, minute, days, stop_code, stop_name, int(time.time() * 1000)),
        )
        return cursor.lastrowid


def list_routines(chat_id: int) -> list:
    return db.execute(
        "SELECT * FROM routines WHERE chat_id = ? ORDER BY hour, minute", (chat_id,)
    ).fetchall()


def get_routine(routine_id: int):
    return db.execute("SELECT * FROM routines WHERE id = ?", (routine_id,)).fetchone()


def update_routine_time(routine_id: int, hour: int, minute: int) -> None:
    with db:
        db.execute(
            "UPDATE routines SET hour = ?, minute = ?, last_fired_key = NULL WHERE id = ?",
            (hour, minute, routine_id),
        )


def update_routine_days(routine_id: int, days: str) -> None:
    with db:
        db.execute("UPDATE routines SET days = ? WHERE id = ?", (days, routine_id))


def update_routine_stop(routine_id: int, stop_code: str, stop_name: str) -> None:
    with db:
        db.execute(
            "UPDATE routines SET stop_code = ?, stop_name = ? WHERE id = ?",
            (stop_code, stop_name, routine_id),
        )


def delete_routine(routine_id: int) -> None:
    with db:
        db.execute("DELETE FROM routines WHERE id = ?", (routine_id,))


def _routine_key(now: datetime, hour: int, minute: int) -> str:
    return f"{now:%Y-%m-%d}T{hour:02d}{minute:02d}"


def due_routines(now: datetime) -> list:
    """Returns routines whose scheduled day-of-week and time match `now`
    (GMT+8) and that have not already fired for this exact date+time slot."""
    weekday = str(now.isoweekday())
    rows = db.execute(
        "SELECT * FROM routines WHERE hour = ? AND minute = ?", (now.hour, now.minute)
    ).fetchall()
    due = []
    for row in rows:
        if weekday not in row["days"].split(","):
            continue
        if row["last_fired_key"] == _routine_key(now, row["hour"], row["minute"]):
            continue
        due.append(row)
    return due


def mark_fired(routine_id: int, now: datetime, hour: int, minute: int) -> None:
    with db:
        db.execute(
            "UPDATE routines SET last_fired_key = ? WHERE id = ?",
            (_routine_key(now, hour, minute), routine_id),
        )
