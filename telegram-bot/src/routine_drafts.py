import time

from .db import db


def start_draft(chat_id: int, step: str, routine_id: "int | None" = None, **fields) -> None:
    with db:
        db.execute("DELETE FROM routine_drafts WHERE chat_id = ?", (chat_id,))
        db.execute(
            """
            INSERT INTO routine_drafts (chat_id, routine_id, step, hour, minute, days, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chat_id,
                routine_id,
                step,
                fields.get("hour"),
                fields.get("minute"),
                fields.get("days"),
                int(time.time() * 1000),
            ),
        )


def get_draft(chat_id: int):
    return db.execute("SELECT * FROM routine_drafts WHERE chat_id = ?", (chat_id,)).fetchone()


def update_draft(chat_id: int, **fields) -> None:
    if not fields:
        return
    columns = ", ".join(f"{key} = ?" for key in fields)
    with db:
        db.execute(
            f"UPDATE routine_drafts SET {columns}, updated_at = ? WHERE chat_id = ?",
            (*fields.values(), int(time.time() * 1000), chat_id),
        )


def clear_draft(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM routine_drafts WHERE chat_id = ?", (chat_id,))
