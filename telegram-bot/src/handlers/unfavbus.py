from telethon import Button, events

from ..buttons import make_button
from ..favourite_buses import list_favourite_buses
from ..format import bus_button_label
from ..lta import _natural_sort_key
from ..pagination import nav_row, paginate
from ..reply import send_rich_message


def build_unfavbus_view(chat_id: int, page: int):
    buses = sorted((row["service_no"] for row in list_favourite_buses(chat_id)), key=_natural_sort_key)
    page_items, page, total_pages = paginate(buses, page)

    rich = {
        "markdown": "# Remove favourite buses\nTap a bus number to remove it.",
        "fallback": "Remove favourite buses. Tap a bus number to remove it.",
    }
    buttons = [
        [Button.inline(bus_button_label(service_no, is_favourite=True), make_button("unfavbus_remove", {"service_no": service_no, "page": page}))]
        for service_no in page_items
    ]
    buttons += nav_row("unfavbus_page", {}, page, total_pages)
    return rich, buttons, buses


def register_unfavbus(client):
    @client.on(events.NewMessage(pattern="/unfavbus"))
    async def handler(event):
        rich, buttons, buses = build_unfavbus_view(event.chat_id, 0)
        if not buses:
            await event.respond("You have no favourite buses to remove.")
            return
        await send_rich_message(client, event.chat_id, rich, buttons)
