import time

from .db import db


def start_route_draft(chat_id: int, field: "str | None", **fields) -> None:
    """Starts (or replaces) the route the chat is filling in. `field` is the end the bot is
    waiting to be told - "start" or "end" - and `panel_msg_id` is the route panel doing the
    asking, so the answer can take that panel's buttons away when it supersedes it."""
    with db:
        db.execute("DELETE FROM route_drafts WHERE chat_id = ?", (chat_id,))
        db.execute(
            """
            INSERT INTO route_drafts (chat_id, field, start_code, end_code, panel_msg_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                chat_id,
                field,
                fields.get("start_code"),
                fields.get("end_code"),
                fields.get("panel_msg_id"),
                int(time.time() * 1000),
            ),
        )


def get_route_draft(chat_id: int):
    return db.execute("SELECT * FROM route_drafts WHERE chat_id = ?", (chat_id,)).fetchone()


def panel_awaiting(chat_id: int, panel_msg_id) -> "str | None":
    """Which end of the route the chat is being asked to type, when it's this panel doing
    the asking - so redrawing a panel keeps whatever prompt is already on it."""
    draft = get_route_draft(chat_id)
    return draft["field"] if draft and draft["panel_msg_id"] == panel_msg_id else None


def clear_route_draft(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM route_drafts WHERE chat_id = ?", (chat_id,))
