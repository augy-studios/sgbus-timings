from telethon import Button, events

from ..bus_stops import nearest_bus_stops
from ..list_view import build_stop_list_view
from ..reply import send_rich_message


def register_nearme(client):
    @client.on(events.NewMessage(pattern="/nearme"))
    async def ask_location(event):
        # The location handler below listens for any location message, so /nearme is only
        # ever a shortcut to the share button - worth saying, since sending a location
        # straight away is one tap fewer.
        await event.respond(
            "Tap the button below to share your location and find nearby bus stops."
            "\n\nYou don't actually need /nearme for this - just send me your location any"
            " time and I'll list the bus stops near you.",
            buttons=[Button.request_location("📍 Share my location", single_use=True, resize=True)],
        )

    @client.on(events.NewMessage(func=lambda e: e.message.geo is not None))
    async def on_location(event):
        geo = event.message.geo
        await event.respond("Looking for bus stops near you...", buttons=Button.clear())

        nearby = nearest_bus_stops(geo.lat, geo.long, 8)
        if not nearby:
            await event.respond(
                "No bus stops found nearby. The bus stop cache may still be loading, please try again shortly."
            )
            return

        nearby.sort(key=lambda s: s["distance"])
        rich, buttons = build_stop_list_view(event.chat_id, "Nearby bus stops", nearby)
        await send_rich_message(client, event.chat_id, rich, buttons)
