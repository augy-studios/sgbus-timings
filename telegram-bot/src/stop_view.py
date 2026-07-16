from telethon import Button

from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .favourites import is_favourite
from .format import format_arrival_message
from .lta import fetch_arrivals


async def build_stop_view(code: str, chat_id, *, inline_only: bool = False):
    """
    Builds the rich-message text + inline keyboard for a bus stop's live
    arrivals. Used for chat replies/edits, and for inline query results.
    `chat_id` is only used to mark whether the stop is already a favourite; the
    favourite/refresh buttons themselves resolve the acting user at click time.
    Pass `inline_only=True` for messages living in inline mode (no chat of
    their own), which get just a refresh button - no favourite toggle, since
    whoever taps it may not be the user who ran the query.
    """
    stop = get_bus_stop_by_code(code)
    if not stop:
        return None

    arrivals = await fetch_arrivals(code)
    favourite = is_favourite(chat_id, code) if chat_id is not None else False
    rich = format_arrival_message(stop, arrivals, favourite)

    if inline_only:
        buttons = [[Button.inline("🔄 Refresh", make_button("refresh", {"code": code}))]]
    else:
        buttons = [
            [
                Button.inline(
                    "⭐ Remove favourite" if favourite else "⭐ Add favourite",
                    make_button("fav", {"code": code, "name": stop["name"]}),
                ),
                Button.inline("🔄 Refresh", make_button("refresh", {"code": code})),
            ]
        ]

    return {"stop": stop, "rich": rich, "buttons": buttons}
