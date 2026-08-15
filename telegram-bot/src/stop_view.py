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
    expanded: bool = False,
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
    by the /favbuses drill-down), which adds a button widening the view out to
    every service at the stop and a button back to that service's stop list.
    `expanded=True` is that widened view: the service is still the one the user
    came in on, so the button reads the other way round and collapses back to it.
    `stops_page`/`stops_reverse` say which page of the stop list, and which
    direction of the route, the user came from, so going back returns them
    exactly where they were.
    """
    stop = get_bus_stop_by_code(code)
    if not stop:
        return None

    arrivals = await fetch_arrivals(code)
    if service_no and not expanded:
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
        # Whether the view is widened is part of where the user is, so refreshing or
        # favouriting leaves them looking at the same thing.
        here = {**from_stops, **({"expanded": True} if expanded else {})}
        row = [
            Button.inline(
                "⭐ Remove favourite" if favourite else "⭐ Add favourite",
                make_button("fav", {"code": code, "name": stop["name"], **here}),
            ),
            Button.inline("🔄 Refresh", make_button("refresh", {"code": code, **here})),
        ]
        buttons = [row]
        if service_no:
            buttons.append(
                [
                    Button.inline(
                        "🔼 Collapse view" if expanded else "💯 All services",
                        # The same button both ways round, toggling the view it opens.
                        make_button(
                            "stop", {"code": code, **from_stops, **({} if expanded else {"expanded": True})}
                        ),
                    )
                ]
            )
            buttons.append(
                [Button.inline("🔙 Back to bus stop selection", make_button("bus_stops", from_stops))]
            )

    return {"stop": stop, "rich": rich, "buttons": buttons}
