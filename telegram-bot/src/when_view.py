"""The time picker for /nav and /route: Leave now, Leave at or Arrive by, then a time typed or
picked from a few quick ones. Telegram has no time picker, so a time is typed the way people
write one ("8:30", "8.30pm", "tmr 8am"); when.py reads it.

Both commands use the same messages, told apart by `prefix` ("nav" or "route"), whose
handlers take the actions: `<prefix>_when_mode` arms the typed answer for a mode, and
`<prefix>_when_set` sets a time from the payload's `pick`, {"mode", "minutes"} for a quick
one or None for Leave now. `payload` is the panel's own button payload, so either can redraw
it, and `back` is the (action, label) that returns to it unchanged."""

from telethon import Button

from .buttons import make_button
from .format import escape_md
from .when import describe

QUICK_MINUTES = ((15, "In 15 min"), (30, "In 30 min"), (60, "In 1 h"), (120, "In 2 h"))

EXAMPLES = "8:30, 8.30pm or 2030, or with a day: tmr 8am, sat 9:15"


def _rich(lines: list) -> dict:
    return {"markdown": "\n".join(escape_md(line) if line else "" for line in lines), "fallback": "\n".join(lines)}


def build_when_menu(prefix: str, payload: dict, back: tuple):
    """Leave now, Leave at or Arrive by."""
    current = describe(payload.get("when"))
    rich = _rich([
        f"🕒 When: {current}",
        "",
        "Leave now, or pick a time to leave at or arrive by, up to a week ahead. "
        "Only buses and trains running then are used.",
    ])
    buttons = [
        [Button.inline("🕒 Leave now", make_button(f"{prefix}_when_set", {**payload, "pick": None}))],
        [
            Button.inline("🚶 Leave at…", make_button(f"{prefix}_when_mode", {**payload, "mode": "leave"})),
            Button.inline("🏁 Arrive by…", make_button(f"{prefix}_when_mode", {**payload, "mode": "arrive"})),
        ],
        [Button.inline(back[1], make_button(back[0], payload))],
    ]
    return rich, buttons


def build_when_prompt(prefix: str, payload: dict, mode: str, back: tuple):
    """Asks for the time, armed by the caller so the next message answers it, with a few
    quick ones as buttons. Those are worked out when tapped, so an old one is still right."""
    verb = "arrive by" if mode == "arrive" else "leave at"
    rich = _rich([f"✏️ Send the time to {verb}: {EXAMPLES}. Or pick one:"])
    quick = [
        Button.inline(label, make_button(f"{prefix}_when_set", {**payload, "pick": {"mode": mode, "minutes": minutes}}))
        for minutes, label in QUICK_MINUTES
    ]
    buttons = [quick[:2], quick[2:], [Button.inline(back[1], make_button(back[0], payload))]]
    return rich, buttons


TYPED_HINT = f"Couldn't read that as a time. Send one like {EXAMPLES}."
