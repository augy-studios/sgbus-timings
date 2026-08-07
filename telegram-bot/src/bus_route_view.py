import re

from telethon import Button

from .bus_routes import route_terminals, stops_for_service
from .bus_services import service_terminals
from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .favourite_prefs import get_pref
from .favourites import list_favourites
from .format import escape_md, stop_button_label
from .pagination import nav_row, paginate_sections


# Interchanges, bus terminals, MRT/LRT stations and hospitals, as LTA abbreviates them
# in bus stop names ("Pasir Ris Int", "Opp Tampines Stn/Int", "Tan Tock Seng Hosp").
# "Ter" is safe to read as a bus terminal: road names spell Terrace as "Terr".
_LANDMARK_RE = re.compile(r"\b(?:Int|Ter|Stn|Hosp)\b", re.IGNORECASE)
# "Stn" is also how LTA abbreviates stations that aren't rail stations at all
# ("Airport Police Stn", "Central Fire Stn") - those are stripped out before the
# landmark check, so they never make the list.
_NOT_A_STATION_RE = re.compile(
    r"\b(?:police|fire|pumping|power|petrol|radio|coast\s*guard|civil\s*defence|bus)\s+stn\b",
    re.IGNORECASE,
)
# Which side of the road a stop is on doesn't change which landmark it is.
_SIDE_PREFIX_RE = re.compile(r"^(?:opp|aft|bef|bet|opposite)\s+", re.IGNORECASE)
MAX_LANDMARKS = 10


def _terminal_label(code: str) -> str:
    stop = get_bus_stop_by_code(code)
    return f"{stop['name']} ({code})" if stop else code


def route_summary_line(service_no: str) -> "str | None":
    """One line naming a service's start and end terminals - or, for a loop service, the
    single terminal it starts and ends at, and where it turns around. Falls back to the
    ends of the cached route when LTA's service list has no terminals for the service."""
    info = service_terminals(service_no) or {}
    derived = route_terminals(service_no)
    origin_code = info.get("origin_code") or derived.get("origin_code")
    destination_code = info.get("destination_code") or derived.get("destination_code")
    if not origin_code or not destination_code:
        return None

    loop_desc = info.get("loop_desc")
    if loop_desc or origin_code == destination_code:
        line = f"🔁 Loop service, starting and ending at {_terminal_label(origin_code)}"
        return f"{line} (loops at {loop_desc})" if loop_desc else line

    line = f"🚏 {_terminal_label(origin_code)} → {_terminal_label(destination_code)}"
    return f"{line} (and back)" if derived.get("directions", 1) > 1 else line


def _landmark_key(name: str) -> str:
    """The landmark a stop name points at, ignoring which side of the road or which exit
    the stop itself sits at: "Opp Tampines Stn/Int" and "Tampines Stn Exit B" both key on
    "tampines stn"."""
    stripped = _NOT_A_STATION_RE.sub("", _SIDE_PREFIX_RE.sub("", name))
    match = _LANDMARK_RE.search(stripped)
    return (stripped[: match.end()] if match else stripped).lower()


def landmark_stops(stops: list) -> list:
    """The landmark stops along a route in travel order - interchanges, terminals, MRT/LRT
    stations and hospitals, but not police/fire/pumping stations - with consecutive stops
    for the same landmark collapsed into the first of them."""
    landmarks = []
    for stop in stops:
        name = stop["name"]
        if not _LANDMARK_RE.search(_NOT_A_STATION_RE.sub("", name)):
            continue
        if landmarks and _landmark_key(landmarks[-1]) == _landmark_key(name):
            continue
        landmarks.append(name)
    return landmarks


def _thin(items: list, limit: int) -> list:
    """Drops evenly spaced items until at most `limit` remain, always keeping the first
    and last, so what's left still reads in order from one end of the route to the other."""
    if len(items) <= limit:
        return items
    step = (len(items) - 1) / (limit - 1)
    return [items[round(i * step)] for i in range(limit)]


def route_landmarks_line(service_no: str) -> "str | None":
    """One line tracing a service's route through its landmark stops, e.g.
    "Pasir Ris Int → Opp Tampines Stn/Int → Kallang Stn → ...". Follows the outbound
    direction only, and thins long routes down to a readable handful of landmarks."""
    landmarks = _thin(landmark_stops(stops_for_service(service_no, outbound_only=True)), MAX_LANDMARKS)
    if len(landmarks) < 2:
        return None
    return "🗺 " + " → ".join(landmarks)


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
    detail_lines = [line for line in (route_summary_line(service_no), route_landmarks_line(service_no)) if line]
    rich = {
        # Blank lines between blocks: a single newline collapses into the previous
        # paragraph in Telegram's rich-message Markdown.
        "markdown": "\n\n".join([f"# {heading}", *(escape_md(line) for line in detail_lines)]),
        "fallback": "\n".join([heading, *detail_lines]),
    }
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
