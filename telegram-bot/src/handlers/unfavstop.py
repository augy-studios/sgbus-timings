from telethon import Button, events

from ..buttons import make_button
from ..favourites import list_favourites
from ..format import stop_button_label
from ..pagination import nav_row, paginate
from ..reply import send_rich_message


def build_unfavstop_view(chat_id: int, page: int):
    stops = list_favourites(chat_id)
    page_items, page, total_pages = paginate(stops, page)

    rich = {
        "markdown": "# Remove favourite bus stops\nTap a bus stop to remove it.",
        "fallback": "Remove favourite bus stops. Tap a bus stop to remove it.",
    }
    buttons = [
        [
            Button.inline(
                stop_button_label(stop, is_favourite=True),
                make_button("unfavstop_remove", {"code": stop["code"], "page": page}),
            )
        ]
        for stop in page_items
    ]
    buttons += nav_row("unfavstop_page", {}, page, total_pages)
    return rich, buttons, stops


def register_unfavstop(client):
    @client.on(events.NewMessage(pattern="/unfavstop"))
    async def handler(event):
        rich, buttons, stops = build_unfavstop_view(event.chat_id, 0)
        if not stops:
            await event.respond("You have no favourite bus stops to remove.")
            return
        await send_rich_message(client, event.chat_id, rich, buttons)
