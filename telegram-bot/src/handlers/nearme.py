from telethon import Button, events

from ..bus_stops import nearest_bus_stops
from ..favourite_prefs import get_pref
from ..favourites import list_favourites
from ..list_view import build_stop_list_keyboard
from ..reply import send_rich_message


def register_nearme(client):
    @client.on(events.NewMessage(pattern="/nearme"))
    async def ask_location(event):
        await event.respond(
            "Tap the button below to share your location and find nearby bus stops.",
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

        fav_codes = {f["code"] for f in list_favourites(event.chat_id)}
        pin_position = get_pref(event.chat_id, "stop")
        nearby.sort(key=lambda s: s["distance"])

        rich = {
            "markdown": "**Nearby bus stops**",
            "fallback": "Nearby bus stops",
        }
        await send_rich_message(
            client, event.chat_id, rich, build_stop_list_keyboard(nearby, fav_codes, pin_position)
        )
