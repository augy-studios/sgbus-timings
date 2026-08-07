from telethon import Button

from .bus_routes import stops_for_service
from .buttons import make_button
from .favourite_prefs import get_pref
from .favourites import list_favourites
from .format import stop_button_label
from .pagination import nav_row, paginate_sections


def build_bus_stops_view(chat_id: int, service_no: str, page: int):
    """Paginated bus stop keyboard for a single service, shared by /favbuses and by
    sending a bus number in chat. The user's favourited stops along the route get
    pages of their own, before (or after, per their favourite preference) the pages
    listing the full route - in which those same stops still appear, in the order the
    bus travels."""
    stops = stops_for_service(service_no)
    fav_codes = {f["code"] for f in list_favourites(chat_id)}
    favourite_stops = [stop for stop in stops if stop["code"] in fav_codes]

    sections = [("favourites", favourite_stops), ("route", stops)]
    if get_pref(chat_id, "stop") == "bottom":
        sections.reverse()
    page_items, page, total_pages, section = paginate_sections(sections, page)

    heading = (
        f"Your favourite stops on {service_no}"
        if section == "favourites"
        else f"Stops served by {service_no}"
    )
    rich = {"markdown": f"# {heading}", "fallback": heading}
    buttons = [
        [
            Button.inline(
                stop_button_label(stop, is_favourite=stop["code"] in fav_codes),
                make_button("bus_stop_view", {"service_no": service_no, "code": stop["code"]}),
            )
        ]
        for stop in page_items
    ]
    buttons += nav_row("bus_stops", {"service_no": service_no}, page, total_pages)
    return rich, buttons, stops
