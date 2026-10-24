import re
from datetime import datetime

from telethon import Button, events

from ..buttons import make_button
from ..favourite_buses import list_favourite_buses
from ..favourite_prefs import get_pref
from ..favourites import list_favourites
from ..flows import Flow, clear_flow, get_flow, register_flow, set_flow
from ..format import escape_md
from ..nav_api import NavError, places
from ..nav_view import NO_MATCH, place_button_text
from ..reply import send_rich_message
from ..saved_places import KINDS as PLACE_KINDS
from ..saved_places import get_place, set_place
from ..service_alerts import get_modes as get_alert_modes
from ..service_alerts_view import MODE_LABELS
from ..user_settings import (
    get_birthday,
    get_display_name,
    get_has_bike,
    get_notifications_enabled,
    set_birthday,
    set_display_name,
)

_POSITION_LABELS = {"top": "⬆️ Top", "bottom": "⬇️ Bottom"}

# One flow covering every field: the field being edited rides along after the colon, which
# the registry looks past. No `finish` - each edit ends the moment its answer is accepted.
FLOW = register_flow(Flow(name="settings_edit", description="editing your settings"))
FLOW_PREFIX = FLOW + ":"

NAME_PROMPT = "What would you like me to call you? Send a name, or /cancel to stop."
BIRTHDAY_PROMPT = (
    "When's your birthday? Send it in any common format, e.g. `1998-04-23`, "
    "`23/04/1998`, `23 Apr 1998` or `Apr 23rd 1998`, or /cancel to stop."
)

PLACE_PROMPT = (
    "Send your {name}: an address, a building, a postal code, an MRT station, a bus stop, "
    "a Google Maps link, GPS coordinates, a plus code, or your location. Or /cancel to stop."
)

_ORDINAL_SUFFIX_RE = re.compile(r"(\d+)(st|nd|rd|th)\b", re.IGNORECASE)

_BIRTHDAY_FORMATS = [
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%Y/%m/%d",
    "%d-%m-%Y",
    "%m-%d-%Y",
    "%d %B %Y",
    "%d %b %Y",
    "%B %d %Y",
    "%b %d %Y",
    "%d %B, %Y",
    "%d %b, %Y",
    "%B %d, %Y",
    "%b %d, %Y",
]


def _parse_birthday(text: str) -> "str | None":
    cleaned = _ORDINAL_SUFFIX_RE.sub(r"\1", text.strip())
    cleaned = re.sub(r"\s+", " ", cleaned)
    for fmt in _BIRTHDAY_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def build_settings_view(chat_id: int, sender):
    fallback = sender.first_name if sender and sender.first_name else "there"
    name = get_display_name(chat_id, fallback)
    name_is_set = name != fallback
    birthday = get_birthday(chat_id)
    notifications_on = get_notifications_enabled(chat_id)
    has_bike = get_has_bike(chat_id)
    alert_modes = get_alert_modes(chat_id)
    fav_buses = list_favourite_buses(chat_id)
    fav_stops = list_favourites(chat_id)
    bus_position = get_pref(chat_id, "bus")
    stop_position = get_pref(chat_id, "stop")

    saved = {kind: get_place(chat_id, kind) for kind in PLACE_KINDS}

    lines = [
        "# Settings",
        f"- **Name**: {escape_md(name) if name_is_set else '_not set_'}",
        f"- **Birthday**: {birthday if birthday else '_not set_'}",
        *(
            f"- **{label}**: {escape_md(saved[kind]['label']) if saved[kind] else '_not set_'}"
            for kind, (_, label) in PLACE_KINDS.items()
        ),
        f"- **Routine notifications**: {'Enabled' if notifications_on else 'Disabled'}",
        f"- **Cycling**: {'I have a bike: /nav says how long cycling takes too' if has_bike else 'No bike'}",
        f"- **Service Alerts**: "
        + (
            f"trains {MODE_LABELS[alert_modes['train']].lower()}, traffic {MODE_LABELS[alert_modes['traffic']].lower()}"
            if alert_modes
            else "Off"
        )
        + " (/sub, /unsub)",
        "",
        f"## Favourite buses ({_POSITION_LABELS.get(bus_position, bus_position)} pinned)",
    ]
    if fav_buses:
        lines.append(", ".join(escape_md(row["service_no"]) for row in fav_buses))
    else:
        lines.append("_none set_")

    lines.append("")
    lines.append(f"## Favourite bus stops ({_POSITION_LABELS.get(stop_position, stop_position)} pinned)")
    if fav_stops:
        for row in fav_stops:
            lines.append(f"- {escape_md(row['name'])} ({escape_md(row['code'])})")
    else:
        lines.append("_none set_")

    markdown = "\n".join(lines)
    fallback_text = markdown.replace("#", "").replace("*", "").replace("_", "")
    rich = {"markdown": markdown, "fallback": fallback_text}

    birthday_row = [Button.inline("🎂 Set birthday", make_button("settings_edit_birthday", {}))]
    if birthday:
        birthday_row.append(Button.inline("🗑 Clear birthday", make_button("settings_clear_birthday", {})))

    # Home and Work, each with Clear once it's set.
    place_rows = [
        [
            Button.inline(f"{icon} Set {label.lower()}", make_button("settings_edit_place", {"kind": kind})),
            *([Button.inline(f"🗑 Clear {label.lower()}", make_button("settings_clear_place", {"kind": kind}))] if saved[kind] else []),
        ]
        for kind, (icon, label) in PLACE_KINDS.items()
    ]

    buttons = [
        [Button.inline("✏️ Set name", make_button("settings_edit_name", {}))],
        birthday_row,
        *place_rows,
        [
            Button.inline(
                "🔕 Disable notifications" if notifications_on else "🔔 Enable notifications",
                make_button("settings_toggle_notifications", {}),
            )
        ],
        [Button.inline("🚲 I don't have a bike" if has_bike else "🚲 I have a bike", make_button("settings_toggle_bike", {}))],
    ]
    return rich, buttons


async def start_edit_name(client, chat_id):
    set_flow(chat_id, FLOW_PREFIX + "name")
    await client.send_message(chat_id, NAME_PROMPT)


async def start_edit_birthday(client, chat_id):
    set_flow(chat_id, FLOW_PREFIX + "birthday")
    await client.send_message(chat_id, BIRTHDAY_PROMPT)


async def start_edit_place(client, chat_id, kind, from_panel=False):
    """Asks for Home or Work, with a button to send your location. `from_panel` when a /nav
    or /route panel's button found it unset: then it says to tap that button again after."""
    name = PLACE_KINDS[kind][1].lower()
    set_flow(chat_id, FLOW_PREFIX + kind)
    prompt = PLACE_PROMPT.format(name=name)
    if from_panel:
        prompt = f"You haven't set your {name} yet. {prompt}"
    await client.send_message(
        chat_id, prompt, buttons=[Button.request_location("📍 Send my location", single_use=True, resize=True)]
    )


async def save_place(client, chat_id, kind, place: dict):
    """Saves Home or Work from a place (/api/places' shape, or a sent location), ending the edit."""
    stop = place.get("code") if place.get("kind") == "stop" else None
    set_place(chat_id, kind, place["label"], place["lat"], place["lng"], stop)
    clear_flow(chat_id)
    icon, label = PLACE_KINDS[kind]
    await client.send_message(
        chat_id,
        f"Got it, your {label.lower()} is {place['label']}. The {icon} buttons in /nav and /route use it. "
        "Use /settings to view all your settings.",
        parse_mode=None,
        buttons=Button.clear(),
    )


def _place_kind(chat_id) -> "str | None":
    """Home or Work, when the chat is being asked for one; None otherwise."""
    flow = get_flow(chat_id)
    kind = flow[len(FLOW_PREFIX) :] if flow and flow.startswith(FLOW_PREFIX) else None
    return kind if kind in PLACE_KINDS else None


def register_settings(client):
    @client.on(events.NewMessage(pattern=r"^/settings(@\w+)?(\s|$)"))
    async def handler(event):
        sender = await event.get_sender()
        rich, buttons = build_settings_view(event.chat_id, sender)
        await send_rich_message(client, event.chat_id, rich, buttons)

    @client.on(events.NewMessage(pattern=r"^/set(home|work)(@\w+)?(\s|$)"))
    async def set_saved_place(event):
        await start_edit_place(client, event.chat_id, event.pattern_match.group(1))

    # Before /nearme's, which takes any location (main.py registers this first).
    @client.on(events.NewMessage(func=lambda e: e.message.geo is not None))
    async def collect_place_location(event):
        kind = _place_kind(event.chat_id)
        if not kind:
            return
        geo = event.message.geo
        # Named for what it is, since a pinned point has no name of its own.
        await save_place(client, event.chat_id, kind, {"label": PLACE_KINDS[kind][1], "lat": geo.lat, "lng": geo.long})
        raise events.StopPropagation

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        flow = get_flow(event.chat_id)
        if not flow or not flow.startswith(FLOW_PREFIX):
            return

        field = flow[len(FLOW_PREFIX) :]
        chat_id = event.chat_id
        text = event.message.text.strip()

        if field == "name":
            name = text[:64]
            set_display_name(chat_id, name)
            clear_flow(chat_id)
            await event.respond(
                f'Got it, I\'ll call you "{name}" from now on. Use /settings to view all your settings.',
                parse_mode=None,
            )
            raise events.StopPropagation

        if field == "birthday":
            parsed = _parse_birthday(text)
            if not parsed:
                await event.respond("I couldn't understand that date. " + BIRTHDAY_PROMPT)
                raise events.StopPropagation
            set_birthday(chat_id, parsed)
            clear_flow(chat_id)
            await event.respond(f"Got it, I've saved your birthday as {parsed}. Use /settings to view all your settings.")
            raise events.StopPropagation

        if field in PLACE_KINDS:
            if len(text) < 2:
                await event.respond("Send at least two letters of a place, or your location.")
                raise events.StopPropagation
            try:
                found = await places(text)
            except NavError as err:
                await event.respond(str(err))
                raise events.StopPropagation
            if not found:
                await event.respond(NO_MATCH)
                raise events.StopPropagation
            if len(found) == 1:
                await save_place(client, chat_id, field, found[0])
                raise events.StopPropagation
            await event.respond("Did you mean:", buttons=place_pick_buttons(found, field))
            raise events.StopPropagation


def place_pick_buttons(found: list, kind: str) -> list:
    """The places a search found, a button each, to save as Home or Work."""
    return [
        [
            Button.inline(
                place_button_text(p),
                make_button(
                    "settings_place_pick",
                    {"kind": kind, "place": {k: p[k] for k in ("kind", "label", "lat", "lng", "code") if p.get(k) is not None}},
                ),
            )
        ]
        for p in found[:8]
    ]
