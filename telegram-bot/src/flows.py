import time

from .db import db


def get_flow(chat_id: int) -> "str | None":
    row = db.execute("SELECT flow FROM user_flows WHERE chat_id = ?", (chat_id,)).fetchone()
    return row["flow"] if row else None


def set_flow(chat_id: int, flow: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO user_flows (chat_id, flow, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET flow = excluded.flow, updated_at = excluded.updated_at
            """,
            (chat_id, flow, int(time.time() * 1000)),
        )


def clear_flow(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM user_flows WHERE chat_id = ?", (chat_id,))
