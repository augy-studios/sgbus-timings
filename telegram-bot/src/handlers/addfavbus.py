import re

from telethon import events

from ..bus_services import is_valid_service
from ..favourite_buses import add_favourite_bus
from ..flows import get_flow, set_flow

_SPLIT_RE = re.compile(r"[,\s]+")

FLOW = "add_fav_bus"


def register_addfavbus(client):
    @client.on(events.NewMessage(pattern="/addfavbus"))
    async def start(event):
        set_flow(event.chat_id, FLOW)
        await event.respond(
            "Send bus numbers to add as favourites, e.g. `22 228 66`. You can send them across "
            "multiple messages.\n\nWhen you're done, use /done to finish, or /cancel to stop."
        )

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        if get_flow(event.chat_id) != FLOW:
            return

        tokens = [t.upper() for t in _SPLIT_RE.split(event.message.text.strip()) if t]
        if not tokens:
            return

        lines = []
        for token in tokens:
            if is_valid_service(token):
                add_favourite_bus(event.chat_id, token)
                lines.append(f"✅ {token} — saved to favourites")
            else:
                lines.append(f"❌ {token} — not a recognised bus number")

        lines.append("")
        lines.append("Send more bus numbers, or /done to finish (or /cancel to stop).")
        await event.respond("\n".join(lines))
        raise events.StopPropagation
