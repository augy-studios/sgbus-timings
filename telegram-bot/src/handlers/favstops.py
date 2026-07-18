from telethon import events

from ..favourite_prefs import get_pref
from ..favourites import list_favourites
from ..list_view import build_stop_list_keyboard
from ..reply import send_rich_message


def register_favstops(client):
    @client.on(events.NewMessage(pattern="/favstops"))
    async def handler(event):
        favs = list_favourites(event.chat_id)
        if not favs:
            await event.respond(
                'You have no favourite bus stops yet. Search for a bus stop or use /nearme, then tap "Add favourite" on its timings.'
            )
            return

        rich = {
            "markdown": "# Your favourite bus stops\nSelect a bus stop number to view the bus timings for that stop.",
            "fallback": "Your favourite bus stops\nSelect a bus stop number to view the bus timings for that stop.",
        }
        favourite_codes = {f["code"] for f in favs}
        pin_position = get_pref(event.chat_id, "stop")
        await send_rich_message(
            client, event.chat_id, rich, build_stop_list_keyboard(favs, favourite_codes, pin_position)
        )
