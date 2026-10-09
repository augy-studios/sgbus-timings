import json
import time

from .db import db


def start_route_draft(chat_id: int, field: "str | None", **fields) -> None:
    """Starts (or replaces) the route the chat is filling in. `field` is what the bot is
    waiting to be told - "start" or "end", or "when:leave" / "when:arrive" for a time - and
    `panel_msg_id` is the route panel doing the asking, so the answer can take that panel's
    buttons away when it supersedes it. `when` is the time already picked (when.py)."""
    with db:
        db.execute("DELETE FROM route_drafts WHERE chat_id = ?", (chat_id,))
        db.execute(
            """
            INSERT INTO route_drafts (chat_id, field, start_code, end_code, panel_msg_id, when_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                chat_id,
                field,
                fields.get("start_code"),
                fields.get("end_code"),
                fields.get("panel_msg_id"),
                json.dumps(fields["when"]) if fields.get("when") else None,
                int(time.time() * 1000),
            ),
        )


def get_route_draft(chat_id: int):
    return db.execute("SELECT * FROM route_drafts WHERE chat_id = ?", (chat_id,)).fetchone()


def draft_when(draft) -> "dict | None":
    """The time a draft was started with, None for Leave now."""
    return json.loads(draft["when_json"]) if draft and draft["when_json"] else None


def panel_awaiting(chat_id: int, panel_msg_id) -> "str | None":
    """Which end of the route the chat is being asked to type, when it's this panel doing
    the asking - so redrawing a panel keeps whatever prompt is already on it."""
    draft = get_route_draft(chat_id)
    return draft["field"] if draft and draft["panel_msg_id"] == panel_msg_id and draft["field"] in ("start", "end") else None


def clear_route_draft(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM route_drafts WHERE chat_id = ?", (chat_id,))
