from telethon import Button

from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .favourite_buses import list_favourite_buses
from .favourite_prefs import get_pref
from .favourites import is_favourite
from .format import format_arrival_message
from .lta import fetch_arrivals


async def build_stop_view(
    code: str,
    chat_id,
    *,
    inline_only: bool = False,
    service_no: "str | None" = None,
    stops_page: int = 0,
    stops_reverse: bool = False,
):
    """
    Builds the rich-message text + inline keyboard for a bus stop's live
    arrivals. Used for chat replies/edits, and for inline query results.
    `chat_id` is only used to mark whether the stop is already a favourite and
    to look up favourite bus services; the favourite/refresh buttons
    themselves resolve the acting user at click time.
    Pass `inline_only=True` for messages living in inline mode (no chat of
    their own), which get just a refresh button - no favourite toggle, since
    whoever taps it may not be the user who ran the query.
    Pass `service_no` to restrict the view to just that one bus service (used
    by the /favbuses drill-down), which adds a "back to all services" button
    and a button back to that service's stop list. `stops_page`/`stops_reverse`
    say which page of that list, and which direction of the route, the user came
    from, so going back returns them exactly where they were.
    """
    stop = get_bus_stop_by_code(code)
    if not stop:
        return None

    arrivals = await fetch_arrivals(code)
    if service_no:
        arrivals = {**arrivals, "services": [s for s in arrivals["services"] if s["serviceNo"] == service_no]}

    favourite = is_favourite(chat_id, code) if chat_id is not None else False
    fav_bus_nos = {row["service_no"] for row in list_favourite_buses(chat_id)} if chat_id is not None else set()
    bus_pin_position = get_pref(chat_id, "bus") if chat_id is not None else "top"
    rich = format_arrival_message(stop, arrivals, favourite, fav_bus_nos, bus_pin_position)

    if inline_only:
        buttons = [[Button.inline("🔄 Refresh", make_button("refresh", {"code": code}))]]
    else:
        # Where the user came from, carried along so a refresh doesn't lose the way back.
        from_stops = (
            {
                "service_no": service_no,
                **({"page": stops_page} if stops_page else {}),
                **({"reverse": True} if stops_reverse else {}),
            }
            if service_no
            else {}
        )
        row = [
            Button.inline(
                "⭐ Remove favourite" if favourite else "⭐ Add favourite",
                make_button("fav", {"code": code, "name": stop["name"], **from_stops}),
            ),
            Button.inline("🔄 Refresh", make_button("refresh", {"code": code, **from_stops})),
        ]
        buttons = [row]
        if service_no:
            buttons.append([Button.inline("💯 All services", make_button("stop", {"code": code}))])
            buttons.append(
                [Button.inline("🔙 Back to bus stop selection", make_button("bus_stops", from_stops))]
            )

    return {"stop": stop, "rich": rich, "buttons": buttons}
