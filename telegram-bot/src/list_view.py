from telethon import Button

from .buttons import make_button
from .format import stop_button_label


def _pin_favourite_stops(stops, favourite_codes, pin_position) -> list:
    """Stable-partitions stops into favourited/non-favourited groups, ordering
    per pin_position ('top' or 'bottom'), preserving each group's existing order."""
    if not favourite_codes:
        return stops
    fav = [s for s in stops if s["code"] in favourite_codes]
    rest = [s for s in stops if s["code"] not in favourite_codes]
    return [*fav, *rest] if pin_position != "bottom" else [*rest, *fav]


def build_stop_list_keyboard(stops, favourite_codes=None, pin_position="top"):
    """One inline button per row, each opening a stop's live arrivals.
    `favourite_codes` (an optional set of stop codes) stars already-favourited stops
    and, per `pin_position`, pins them to the top or bottom of the list."""
    favourite_codes = favourite_codes or set()
    stops = _pin_favourite_stops(stops, favourite_codes, pin_position)
    return [
        [
            Button.inline(
                stop_button_label(
                    stop,
                    stop["distance"] if "distance" in stop.keys() else None,
                    is_favourite=stop["code"] in favourite_codes,
                ),
                make_button("stop", {"code": stop["code"]}),
            )
        ]
        for stop in stops
    ]
