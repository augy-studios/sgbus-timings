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
    picked_service_no: "str | None" = None,
    expanded: bool = False,
    stops_page: int = 0,
    stops_reverse: bool = False,
    back: "dict | None" = None,
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
    Two arguments narrow the view to a single bus service, and which one is used
    says where the user came in from, which decides the way back on offer:
    `service_no` for the bus-first route (a bus number search or the /favbuses
    drill-down), which gets a button back to that service's stop list, and
    `picked_service_no` for a service chosen at the stop itself, which keeps the
    button for picking a different one.
    `expanded=True` widens either of those back out to every service at the stop,
    remembering the service the user came in on so the button collapses back to it.
    `stops_page`/`stops_reverse` say which page of the stop list, and which
    direction of the route, the user came from, so going back returns them
    exactly where they were.
    `back` is the list of stops the user picked this one from (a name search or
    /nearme), carried along so they can go back and pick a different one.
    """
    stop = get_bus_stop_by_code(code)
    if not stop:
        return None

    # Whichever way the user got here, this is the service the view is narrowed to.
    only_service = service_no or picked_service_no
    arrivals = await fetch_arrivals(code)
    if only_service and not expanded:
        arrivals = {**arrivals, "services": [s for s in arrivals["services"] if s["serviceNo"] == only_service]}

    favourite = is_favourite(chat_id, code) if chat_id is not None else False
    fav_bus_nos = {row["service_no"] for row in list_favourite_buses(chat_id)} if chat_id is not None else set()
    bus_pin_position = get_pref(chat_id, "bus") if chat_id is not None else "top"
    rich = format_arrival_message(stop, arrivals, favourite, fav_bus_nos, bus_pin_position)

    if inline_only:
        return {"stop": stop, "rich": rich, "buttons": [[Button.inline("🔄 Refresh", make_button("refresh", {"code": code}))]]}

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
    # Whether the view is widened, and which service it was narrowed to, are part of where
    # the user is, so refreshing or favouriting leaves them looking at the same thing.
    here = {
        **from_stops,
        **({"bus_no": picked_service_no} if picked_service_no else {}),
        **({"expanded": True} if expanded else {}),
        **({"back": back} if back else {}),
    }
    # This exact view, as a payload - what the screens opened from here come back to.
    origin = {"code": code, **here}

    buttons = [
        [
            Button.inline(
                "⭐ Remove favourite" if favourite else "⭐ Add favourite",
                make_button("fav", {"code": code, "name": stop["name"], **here}),
            ),
            Button.inline("🔄 Refresh", make_button("refresh", {"code": code, **here})),
        ]
    ]
    if only_service:
        buttons.append(
            [
                Button.inline(
                    "🔼 Collapse view" if expanded else "💯 All services",
                    # The same button both ways round, toggling the view it opens.
                    make_button("stop", {**origin, **({} if expanded else {"expanded": True})}),
                )
            ]
        )
    if service_no:
        buttons.append([Button.inline("🔙 Back to bus stop selection", make_button("bus_stops", from_stops))])
    else:
        # Nothing to go back to on the bus-first route: the user already has a service in
        # hand, and the stop list they picked from is a tap away on the button above.
        buttons.append(
            [Button.inline("🚌 Select Bus Number", make_button("stop_buses", {"code": code, "from": origin}))]
        )
    if only_service and not expanded:
        buttons.append(
            [
                Button.inline(
                    "🛣 View route from here",
                    make_button(
                        "route_from",
                        {
                            "service_no": only_service,
                            "code": code,
                            **({"reverse": True} if stops_reverse else {}),
                            "from": origin,
                        },
                    ),
                )
            ]
        )
    if back:
        buttons.append([Button.inline("🔙 Back", make_button("stop_list", back))])

    return {"stop": stop, "rich": rich, "buttons": buttons}
