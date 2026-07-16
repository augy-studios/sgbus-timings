from telethon import Button

from .buttons import make_button
from .format import stop_button_label


def build_stop_list_keyboard(stops):
    """One inline button per row, each opening a stop's live arrivals."""
    return [
        [
            Button.inline(
                stop_button_label(stop, stop["distance"] if "distance" in stop.keys() else None),
                make_button("stop", {"code": stop["code"]}),
            )
        ]
        for stop in stops
    ]
