from telethon import Button, events

from ..buttons import make_button
from ..favourite_routes import list_favourite_routes
from ..pagination import nav_row, paginate
from ..reply import send_rich_message
from ..route_view import route_button_label


def build_favroutes_view(chat_id: int, page: int):
    routes = list_favourite_routes(chat_id)
    page_items, page, total_pages = paginate(routes, page)

    rich = {
        "markdown": "# Your favourite routes\nSelect a route to see the buses that run it.",
        "fallback": "Your favourite routes\nSelect a route to see the buses that run it.",
    }
    # The page rides along, so the route it opens can offer a way back to this exact page.
    buttons = [
        [
            Button.inline(
                route_button_label(route["start_name"], route["end_name"]),
                make_button(
                    "route_view",
                    {"start": route["start_code"], "end": route["end_code"], "from_fav": page},
                ),
            )
        ]
        for route in page_items
    ]
    buttons += nav_row("favroute_page", {}, page, total_pages)
    return rich, buttons, routes


def register_favroutes(client):
    @client.on(events.NewMessage(pattern="/favroutes"))
    async def handler(event):
        rich, buttons, routes = build_favroutes_view(event.chat_id, 0)
        if not routes:
            await event.respond(
                "You have no favourite routes yet. Use /newroute to build one, then star it."
            )
            return
        await send_rich_message(client, event.chat_id, rich, buttons)
