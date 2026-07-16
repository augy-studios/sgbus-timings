import re

from telethon import events

from ..bus_stops import get_bus_stop_by_code, search_bus_stops
from ..list_view import build_stop_list_keyboard
from ..reply import send_rich_message
from ..stop_view import build_stop_view

_CODE_RE = re.compile(r"^\d{3,5}$")


def register_search(client):
    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def handler(event):
        text = event.message.text.strip()

        exact = get_bus_stop_by_code(text) if _CODE_RE.match(text) else None
        if exact:
            view = await build_stop_view(exact["code"], event.chat_id)
            await send_rich_message(client, event.chat_id, view["rich"], view["buttons"])
            return

        matches = search_bus_stops(text, 10)
        if not matches:
            await event.respond("No bus stops matched that. Try a bus stop number or part of its name.")
            return
        if len(matches) == 1:
            view = await build_stop_view(matches[0]["code"], event.chat_id)
            await send_rich_message(client, event.chat_id, view["rich"], view["buttons"])
            return

        rich = {"markdown": "**Did you mean**", "fallback": "Did you mean"}
        await send_rich_message(client, event.chat_id, rich, build_stop_list_keyboard(matches))
