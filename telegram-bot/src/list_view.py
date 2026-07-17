from telethon import Button

from .buttons import make_button
from .format import stop_button_label


def build_stop_list_keyboard(stops, favourite_codes=None):
    """One inline button per row, each opening a stop's live arrivals.
    `favourite_codes` (an optional set of stop codes) stars already-favourited stops."""
    favourite_codes = favourite_codes or set()
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
