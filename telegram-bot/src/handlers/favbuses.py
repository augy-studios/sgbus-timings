from telethon import Button, events

from ..bus_routes import stops_for_service
from ..favourite_buses import list_favourite_buses
from ..buttons import make_button
from ..format import bus_button_label, stop_button_label
from ..lta import _natural_sort_key
from ..pagination import nav_row, paginate
from ..reply import send_rich_message


def build_favbuses_view(chat_id: int, page: int):
    buses = sorted((row["service_no"] for row in list_favourite_buses(chat_id)), key=_natural_sort_key)
    page_items, page, total_pages = paginate(buses, page)

    rich = {"markdown": "# Your favourite buses", "fallback": "Your favourite buses"}
    buttons = [
        [Button.inline(bus_button_label(service_no, is_favourite=True), make_button("favbus_stops", {"service_no": service_no, "page": 0}))]
        for service_no in page_items
    ]
    buttons += nav_row("favbus_page", {}, page, total_pages)
    return rich, buttons, buses


def build_favbus_stops_view(service_no: str, page: int):
    stops = stops_for_service(service_no)
    page_items, page, total_pages = paginate(stops, page)

    rich = {
        "markdown": f"# Stops served by {service_no}",
        "fallback": f"Stops served by {service_no}",
    }
    buttons = [
        [
            Button.inline(
                stop_button_label(stop),
                make_button("favbus_stop_view", {"service_no": service_no, "code": stop["code"]}),
            )
        ]
        for stop in page_items
    ]
    buttons += nav_row("favbus_stops", {"service_no": service_no}, page, total_pages)
    return rich, buttons, stops


def register_favbuses(client):
    @client.on(events.NewMessage(pattern="/favbuses"))
    async def handler(event):
        rich, buttons, buses = build_favbuses_view(event.chat_id, 0)
        if not buses:
            await event.respond(
                "You have no favourite buses yet. Use /addfavbus to add some."
            )
            return
        await send_rich_message(client, event.chat_id, rich, buttons)
