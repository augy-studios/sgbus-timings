import re

import httpx
from telethon import events

from ..bus_route_view import build_bus_stops_view
from ..bus_services import is_valid_service
from ..bus_stops import get_bus_stop_by_code, nearest_bus_stops, search_bus_stops, search_note
from ..list_view import build_stop_list_view
from ..postal import POSTAL_CODE_RE, lookup_postal_code
from ..reply import send_rich_message
from ..routines import bus_filter
from ..stations import find_station, station_label
from ..stop_view import build_stop_view

# Bus stop codes are always 5 digits and postal codes 6; bus service numbers are
# shorter and may carry letters (e.g. 22, 971E, NR7), so none of them collide.
_STOP_CODE_RE = re.compile(r"^\d{5}$")
_SERVICE_RE = re.compile(r"^[0-9A-Z]{1,4}$")
# A stop's code and the buses to narrow it to, "84009 174, 175" or "84009 22*", as the web
# app and the Linux CLI take them.
_STOP_BUSES_RE = re.compile(r"^(\d{5})[\s,]+(.+)$")
BUSES_HINT = "174, or 174, 175, or 22* for every bus starting 22"


def stop_and_buses(text: str):
    """A stop's code with buses after it, as (stop, buses, error): the stop and the buses
    when both are good, an error to say when either isn't, or (None, None, None) when the
    text isn't a code with something after it at all."""
    m = _STOP_BUSES_RE.match(text)
    if not m:
        return None, None, None
    stop = get_bus_stop_by_code(m[1])
    if not stop:
        return None, None, f"There's no bus stop {m[1]}."
    buses = bus_filter(m[2])
    if not buses:
        return None, None, f'"{m[2]}" isn\'t a list of buses: {BUSES_HINT}.'
    return stop, buses, None

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

        stop, buses, error = stop_and_buses(text)
        if error:
            await event.respond(error, parse_mode=None)
            return
        if stop:
            view = await build_stop_view(stop["code"], event.chat_id, services=buses)
            await send_rich_message(client, event.chat_id, view["rich"], view["buttons"])
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

        station = find_station(text)
        if station and "distance" in matches[0].keys():
            title = f"Bus stops at {station_label(station)}"
        else:
            # Saying which shortened forms were searched too, as LTA's names use them.
            note = search_note(text, matches)
            title = f"Did you mean ({note[0].lower()}{note[1:]})" if note else "Did you mean"
        rich, buttons = build_stop_list_view(event.chat_id, title, matches)
        await send_rich_message(client, event.chat_id, rich, buttons)
