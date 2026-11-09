"""The time picker for /nav and /route: Leave now, Leave at or Arrive by, then a time typed,
picked from the quick ones (5 minutes to 3 hours on), or picked day, hour and minutes with
📅 Pick a day and time, up to a week ahead. Telegram has no time picker, so a time is typed the way people
write one ("8:30", "8.30pm", "tmr 8am"); when.py reads it.

Both commands use the same messages, told apart by `prefix` ("nav" or "route"), whose
handlers take the actions: `<prefix>_when_mode` arms the typed answer for a mode, and
`<prefix>_when_set` sets a time from the payload's `pick`, {"mode", "minutes"} for a quick
one or None for Leave now. `payload` is the panel's own button payload, so either can redraw
it, and `back` is the (action, label) that returns to it unchanged."""

from telethon import Button

from .buttons import make_button
from .format import escape_md
from .when import at_to_dt, day_label, describe, pick_days, pick_hours, pick_minutes, at_of

QUICK_MINUTES = ((5, "In 5 min"), (10, "In 10 min"), (15, "In 15 min"), (20, "In 20 min"), (30, "In 30 min"), (45, "In 45 min"),
                 (60, "In 1 h"), (90, "In 1½ h"), (120, "In 2 h"), (180, "In 3 h"))

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
    buttons = [quick[k:k + 3] for k in range(0, len(quick), 3)]
    buttons.append([Button.inline("📅 Pick a day and time", make_button(f"{prefix}_when_day", {**payload, "mode": mode}))])
    buttons.append([Button.inline(back[1], make_button(back[0], payload))])
    return rich, buttons


def _verb(mode: str) -> str:
    return "arrive by" if mode == "arrive" else "leave at"


def _day_name(day: str) -> str:
    """"Today", "Tomorrow" or "Thu 12 Nov"."""
    label = day_label(at_to_dt(f"{day}T12:00"))
    return label.capitalize() if label in ("today", "tomorrow") else label


def build_day_picker(prefix: str, payload: dict, mode: str, back: tuple):
    """The first of three steps: the day, today to a week ahead."""
    rich = _rich([f"📅 Which day to {_verb(mode)}?"])
    days = [Button.inline(_day_name(d), make_button(f"{prefix}_when_hour", {**payload, "mode": mode, "day": d}))
            for d in pick_days() if pick_hours(d)]
    buttons = [days[k:k + 2] for k in range(0, len(days), 2)]
    buttons.append([Button.inline("🔙 Back to the quick times", make_button(f"{prefix}_when_mode", {**payload, "mode": mode}))])
    buttons.append([Button.inline(back[1], make_button(back[0], payload))])
    return rich, buttons


def build_hour_picker(prefix: str, payload: dict, mode: str, day: str, back: tuple):
    """The second step: the hour, those still to come on that day."""
    rich = _rich([f"🕒 {_day_name(day)}: what time to {_verb(mode)}? Pick the hour."])
    hours = [Button.inline(f"{h:02d}:00", make_button(f"{prefix}_when_minute", {**payload, "mode": mode, "day": day, "hour": h}))
             for h in pick_hours(day)]
    buttons = [hours[k:k + 4] for k in range(0, len(hours), 4)]
    buttons.append([Button.inline("🔙 Another day", make_button(f"{prefix}_when_day", {**payload, "mode": mode}))])
    buttons.append([Button.inline(back[1], make_button(back[0], payload))])
    return rich, buttons


def build_minute_picker(prefix: str, payload: dict, mode: str, day: str, hour: int, back: tuple):
    """The last step: the minutes, in fives. Picking one sets the time."""
    rich = _rich([f"🕒 {_day_name(day)}, {hour:02d}:… to {_verb(mode)}. Pick the minutes."])
    pick = {k: v for k, v in payload.items() if k not in ("mode", "day", "hour")}
    mins = [Button.inline(f"{hour:02d}:{m:02d}", make_button(f"{prefix}_when_set", {**pick, "pick": {"mode": mode, "at": at_of(day, hour, m)}}))
            for m in pick_minutes(day, hour)]
    buttons = [mins[k:k + 4] for k in range(0, len(mins), 4)]
    buttons.append([Button.inline("🔙 Another hour", make_button(f"{prefix}_when_hour", {**pick, "mode": mode, "day": day}))])
    buttons.append([Button.inline(back[1], make_button(back[0], pick))])
    return rich, buttons


TYPED_HINT = f"Couldn't read that as a time. Send one like {EXAMPLES}."
