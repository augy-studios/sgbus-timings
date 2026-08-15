import time
from dataclasses import dataclass
from typing import Callable, Optional

from .db import db


@dataclass(frozen=True)
class Flow:
    """A multi-step conversation a command starts and the bot remembers between messages.

    Registering one is all it takes for /done and /cancel to handle it: neither command
    knows anything about any particular flow, so a new command that keeps chat state only
    has to declare itself here, next to its own handler.

    `description` completes sentences like "You're in the middle of ..." and "Cancelled
    ...", so phrase it as an activity: "adding favourite buses".
    `finish` is what /done runs - it returns the reply to send, and its absence means the
    flow can't be wrapped up early (the wizards that need every answer before they can
    save anything), so /done says so and points at /cancel instead.
    `cleanup` drops any other state the flow left lying around, beyond the flow marker
    itself, whichever way the flow ends.
    """

    name: str
    description: str
    finish: Optional[Callable[[int], str]] = None
    cleanup: Optional[Callable[[int], None]] = None


# Flows register themselves as their handler module is imported, which main.py does for
# every handler before it starts the client.
_flows: "dict[str, Flow]" = {}


def register_flow(flow: Flow) -> str:
    """Declares a flow and hands back its name, for the handler to store with set_flow()."""
    _flows[flow.name] = flow
    return flow.name


def flow_definition(name: str) -> "Flow | None":
    """The Flow a stored flow name belongs to. A name may carry a per-step suffix after a
    colon ("settings_edit:birthday") - the flow itself is registered under the part in
    front of it. Unknown names (a flow left behind by an older version of the bot) resolve
    to None, and the callers treat them as an unrecognised thing to be cleared away."""
    return _flows.get(name) or _flows.get(name.split(":", 1)[0])


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


def end_flow(chat_id: int, name: "str | None" = None) -> None:
    """Ends whatever the chat is in the middle of: runs the flow's own cleanup, then
    forgets the flow. Safe to call on a name no flow claims. Pass `name` if it's already
    been read, to save a second lookup."""
    name = name if name is not None else get_flow(chat_id)
    if not name:
        return
    flow = flow_definition(name)
    if flow and flow.cleanup:
        flow.cleanup(chat_id)
    clear_flow(chat_id)
