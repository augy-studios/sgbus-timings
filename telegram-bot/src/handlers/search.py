import re

from telethon import events

from ..bus_route_view import build_bus_stops_view
from ..bus_services import is_valid_service
from ..bus_stops import get_bus_stop_by_code, search_bus_stops
from ..favourite_prefs import get_pref
from ..favourites import list_favourites
from ..list_view import build_stop_list_keyboard
from ..reply import send_rich_message
from ..stop_view import build_stop_view

# Bus stop codes are always 5 digits; bus service numbers are shorter and may
# carry letters (e.g. 22, 971E, NR7), so the two never collide.
_STOP_CODE_RE = re.compile(r"^\d{5}$")
_SERVICE_RE = re.compile(r"^[0-9A-Z]{1,4}$")


def register_search(client):
    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def handler(event):
        text = event.message.text.strip()

        exact = get_bus_stop_by_code(text) if _STOP_CODE_RE.match(text) else None
        if exact:
            view = await build_stop_view(exact["code"], event.chat_id)
            await send_rich_message(client, event.chat_id, view["rich"], view["buttons"])
            return

        service_no = text.upper()
        if _SERVICE_RE.match(service_no) and is_valid_service(service_no):
            rich, buttons, stops = build_bus_stops_view(event.chat_id, service_no, 0)
            if stops:
                await send_rich_message(client, event.chat_id, rich, buttons)
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
        fav_codes = {f["code"] for f in list_favourites(event.chat_id)}
        pin_position = get_pref(event.chat_id, "stop")
        await send_rich_message(
            client, event.chat_id, rich, build_stop_list_keyboard(matches, fav_codes, pin_position)
        )
