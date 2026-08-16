from telethon import Button

from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .favourite_prefs import get_pref, pin_favourites
from .favourites import list_favourites
from .format import escape_md, stop_button_label


def pin_favourite_stops(stops, favourite_codes, pin_position) -> list:
    return pin_favourites(stops, favourite_codes, pin_position, key=lambda stop: stop["code"])


def build_stop_list_keyboard(stops, favourite_codes=None, pin_position="top", back=None):
    """One inline button per row, each opening a stop's live arrivals.
    `favourite_codes` (an optional set of stop codes) stars already-favourited stops
    and, per `pin_position`, pins them to the top or bottom of the list.
    `back` is this list's own context (see `stop_list_context`), carried along on every
    button so the stop view it opens can offer a way back to the list."""
    favourite_codes = favourite_codes or set()
    stops = pin_favourite_stops(stops, favourite_codes, pin_position)
    return [
        [
            Button.inline(
                stop_button_label(
                    stop,
                    stop["distance"] if "distance" in stop.keys() else None,
                    is_favourite=stop["code"] in favourite_codes,
                ),
                make_button("stop", {"code": stop["code"], **({"back": back} if back else {})}),
            )
        ]
        for stop in stops
    ]


def stop_list_context(title: str, stops) -> dict:
    """A list of stops boiled down to what it takes to rebuild it later - its heading and
    the stops' codes, plus their distances where the list had them. Small enough to ride
    along on every button in the list, which is how a stop view knows the way back."""
    return {
        "title": title,
        "stops": [
            {
                "code": stop["code"],
                **({"distance": stop["distance"]} if "distance" in stop.keys() else {}),
            }
            for stop in stops
        ],
    }


def build_stop_list_view(chat_id: int, title: str, stops: list):
    """The "pick a bus stop" message and keyboard shared by name searches and /nearme:
    a heading plus one button per stop, favourites starred and pinned per the user's
    preference. Every button carries the list itself, so the stop it opens can come back."""
    favourite_codes = {f["code"] for f in list_favourites(chat_id)}
    buttons = build_stop_list_keyboard(
        stops, favourite_codes, get_pref(chat_id, "stop"), back=stop_list_context(title, stops)
    )
    return {"markdown": f"**{escape_md(title)}**", "fallback": title}, buttons


def rebuild_stop_list_view(chat_id: int, back: dict):
    """Rebuilds the list a `stop_list_context` describes, resolving its stop codes against
    the current cache so names and favourite stars are up to date."""
    stops = []
    for entry in back.get("stops", []):
        stop = get_bus_stop_by_code(entry["code"])
        if not stop:
            continue
        stop = dict(stop)
        if entry.get("distance") is not None:
            stop["distance"] = entry["distance"]
        stops.append(stop)
    return build_stop_list_view(chat_id, back.get("title", "Bus stops"), stops)
