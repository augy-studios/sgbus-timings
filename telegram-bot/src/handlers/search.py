import re

import httpx
from telethon import events

from ..bus_route_view import build_bus_stops_view
from ..bus_services import is_valid_service
from ..bus_stops import get_bus_stop_by_code, nearest_bus_stops, search_bus_stops
from ..list_view import build_stop_list_view
from ..postal import POSTAL_CODE_RE, lookup_postal_code
from ..reply import send_rich_message
from ..stop_view import build_stop_view

# Bus stop codes are always 5 digits and postal codes 6; bus service numbers are
# shorter and may carry letters (e.g. 22, 971E, NR7), so none of them collide.
_STOP_CODE_RE = re.compile(r"^\d{5}$")
_SERVICE_RE = re.compile(r"^[0-9A-Z]{1,4}$")

# As many stops as /nearme lists, so an address means the same thing as a location.
NEARBY_LIMIT = 8


async def find_postal_stops(event, code):
    """The stops nearest the address with this postal code, and the address, as
    (stops, address). Says what went wrong and returns None when there's nothing to list."""
    try:
        place = await lookup_postal_code(code)
    except httpx.HTTPError:
        await event.respond("Couldn't look up that postal code right now. Please try again shortly.")
        return None
    if not place:
        await event.respond(f"No address has the postal code {code}.")
        return None
    nearby = nearest_bus_stops(place["lat"], place["lng"], NEARBY_LIMIT)
    if not nearby:
        await event.respond(
            "No bus stops found nearby. The bus stop cache may still be loading, please try again shortly."
        )
        return None
    return nearby, f"{place['address']} ({code})"


def register_search(client):
    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def handler(event):
        text = event.message.text.strip()

        if POSTAL_CODE_RE.match(text):
            found = await find_postal_stops(event, text)
            if found:
                nearby, address = found
                rich, buttons = build_stop_list_view(event.chat_id, f"Bus stops near {address}", nearby)
                await send_rich_message(client, event.chat_id, rich, buttons)
            return

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
            await event.respond("No bus stops matched that. Try a bus stop number, part of its name, or a postal code.")
            return
        if len(matches) == 1:
            view = await build_stop_view(matches[0]["code"], event.chat_id)
            await send_rich_message(client, event.chat_id, view["rich"], view["buttons"])
            return

        rich, buttons = build_stop_list_view(event.chat_id, "Did you mean", matches)
        await send_rich_message(client, event.chat_id, rich, buttons)
