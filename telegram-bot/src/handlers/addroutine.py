import re

from telethon import Button, events

from ..bus_routes import services_for_stop
from ..bus_stops import get_bus_stop_by_code, search_bus_stops
from ..buttons import make_button
from ..favourite_buses import list_favourite_buses
from ..favourite_prefs import get_pref, pin_favourites
from ..favourites import list_favourites
from ..flows import Flow, clear_flow, get_flow, register_flow, set_flow
from ..format import bus_button_label, escape_md
from ..frequency import format_frequency, parse_frequency
from ..pagination import nav_row, paginate
from ..reply import send_rich_message
from ..routine_drafts import clear_draft, get_draft, start_draft, update_draft
from ..routines import (
    add_routine,
    format_services,
    join_services,
    split_services,
    update_routine_days,
    update_routine_stop,
    update_routine_time,
)
from ..stop_buses_view import GRID_COLUMNS, GRID_PAGE_SIZE
from ..time_of_day import parse_time_of_day

# No `finish`: a routine needs every answer before it can be saved, so there's nothing
# for /done to wrap up early. The half-built draft goes when the flow does.
FLOW = register_flow(
    Flow(name="routine_wizard", description="setting up a routine", cleanup=clear_draft)
)
_CODE_RE = re.compile(r"^\d{3,5}$")
_BUS_SPLIT_RE = re.compile(r"[\s,/]+")
_ALL_BUSES = {"all", "every", "any"}

TIME_PROMPT = (
    "What time should this routine run? (GMT+8)\ne.g. `9 AM`, `10 PM`, `0830`, `20:00`\n\nUse /cancel to stop."
)
FREQUENCY_PROMPT = (
    "How often? Reply `daily`, `weekdays`, `weekends`, or a comma-separated list of days (e.g. `Mon, Wed, Fri`)."
)


def _stop_label(stop) -> str:
    label = f"⭐ {stop['name']} ({stop['code']})"
    return label if len(label) <= 64 else f"{label[:61]}..."


async def _prompt_for_stop(client, chat_id):
    favs = list_favourites(chat_id)
    if favs:
        text = "Which bus stop? Pick one of your favourites, or send a bus stop code or part of its name."
        buttons = [
            [Button.inline(_stop_label(f), make_button("routine_stop_pick", {"code": f["code"], "name": f["name"]}))]
            for f in favs
        ]
    else:
        text = "Which bus stop? Send a bus stop code or part of its name."
        buttons = None
    await client.send_message(chat_id, text, buttons=buttons)


def build_bus_picker(chat_id: int, page: int = 0):
    """The grid of buses at the draft's stop, each one a toggle, for picking which of them
    the routine sends. Favourite buses are starred and pinned as they are everywhere else,
    and the ones picked so far are ticked. Returns (rich, buttons), or None once the
    draft has moved on or gone."""
    draft = get_draft(chat_id)
    if not draft or draft["step"] != "buses":
        return None

    services = services_for_stop(draft["stop_code"])
    fav_bus_nos = {row["service_no"] for row in list_favourite_buses(chat_id)}
    services = pin_favourites(services, fav_bus_nos, get_pref(chat_id, "bus"))
    picked = split_services(draft["services"])
    page_items, page, total_pages = paginate(services, page, GRID_PAGE_SIZE)

    heading = f"Buses at {draft['stop_name']} ({draft['stop_code']})"
    detail = (
        "Tap the buses this routine should send, then Done. Leave them all unticked for every bus, "
        "or type the numbers instead, e.g. 15, 25."
    )
    summary = f"Sending: {format_services(draft['services'])}"
    rich = {
        "markdown": f"# {escape_md(heading)}\n\n{escape_md(detail)}\n\n{escape_md(summary)}",
        "fallback": f"{heading}\n{detail}\n\n{summary}",
    }

    buttons = [
        [
            Button.inline(
                f"✅ {service_no}" if service_no in picked else bus_button_label(service_no, service_no in fav_bus_nos),
                make_button("routine_bus_toggle", {"service_no": service_no, "page": page}),
            )
            for service_no in page_items[row : row + GRID_COLUMNS]
        ]
        for row in range(0, len(page_items), GRID_COLUMNS)
    ]
    buttons += nav_row("routine_bus_page", {}, page, total_pages)
    last = [Button.inline("✔️ Done", make_button("routine_bus_done"))]
    if picked:
        last.insert(0, Button.inline("↩️ Clear", make_button("routine_bus_clear", {"page": page})))
    buttons.append(last)
    return rich, buttons


def toggle_bus(chat_id: int, service_no: str) -> bool:
    """Ticks or unticks a bus in the draft, keeping the picks in bus-number order.
    Returns False if the draft isn't picking buses any more."""
    draft = get_draft(chat_id)
    if not draft or draft["step"] != "buses":
        return False
    picked = set(split_services(draft["services"])) ^ {service_no}
    update_draft(chat_id, services=join_services([s for s in services_for_stop(draft["stop_code"]) if s in picked]))
    return True


def clear_buses(chat_id: int) -> bool:
    draft = get_draft(chat_id)
    if not draft or draft["step"] != "buses":
        return False
    update_draft(chat_id, services=None)
    return True


async def prompt_for_buses(client, chat_id) -> bool:
    """Sends the bus picker for the draft's stop. Returns False, sending nothing, if no
    buses are cached for the stop, since there'd be nothing to pick from."""
    draft = get_draft(chat_id)
    if not services_for_stop(draft["stop_code"]):
        return False
    update_draft(chat_id, step="buses")
    rich, buttons = build_bus_picker(chat_id)
    await send_rich_message(client, chat_id, rich, buttons)
    return True


async def finalize_stop(client, chat_id, code, name):
    """Moves the routine wizard (or a stop edit) on to picking buses once a bus stop has
    been chosen, either by typed search or by tapping a favourite. Buses picked for the
    stop being replaced stay picked where they also call at the new one."""
    draft = get_draft(chat_id)
    if not draft:
        return

    at_stop = services_for_stop(code)
    kept = [s for s in at_stop if s in split_services(draft["services"])]
    update_draft(chat_id, stop_code=code, stop_name=name, services=join_services(kept))
    if not await prompt_for_buses(client, chat_id):
        await save_draft(client, chat_id)


async def save_draft(client, chat_id):
    """Completes the routine wizard, or a stop or bus edit, once the buses are picked."""
    draft = get_draft(chat_id)
    if not draft:
        return

    code, name, services = draft["stop_code"], draft["stop_name"], draft["services"]
    if draft["routine_id"]:
        update_routine_stop(draft["routine_id"], code, name, services)
        message = f"Updated! This routine now sends {format_services(services)} at {name} ({code})."
    else:
        add_routine(chat_id, draft["hour"], draft["minute"], draft["days"], code, name, services)
        message = (
            f"Routine saved! {draft['hour']:02d}:{draft['minute']:02d} · {format_frequency(draft['days'])} "
            f"· {name} ({code}) · {format_services(services)}\n\nUse /routines to view or manage your routines."
        )

    clear_draft(chat_id)
    clear_flow(chat_id)
    await client.send_message(chat_id, message, parse_mode=None)


def register_addroutine(client):
    @client.on(events.NewMessage(pattern="/addroutine"))
    async def start(event):
        clear_draft(event.chat_id)
        start_draft(event.chat_id, step="time")
        set_flow(event.chat_id, FLOW)
        await event.respond("Let's set up a new routine! " + TIME_PROMPT)

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        if get_flow(event.chat_id) != FLOW:
            return
        chat_id = event.chat_id
        draft = get_draft(chat_id)
        if not draft:
            return

        text = event.message.text.strip()

        if draft["step"] == "time":
            parsed = parse_time_of_day(text)
            if not parsed:
                await event.respond("I couldn't understand that time. " + TIME_PROMPT)
                raise events.StopPropagation
            hour, minute = parsed
            if draft["routine_id"]:
                update_routine_time(draft["routine_id"], hour, minute)
                clear_draft(chat_id)
                clear_flow(chat_id)
                await event.respond(f"Updated! This routine now runs at {hour:02d}:{minute:02d}.")
            else:
                update_draft(chat_id, hour=hour, minute=minute, step="frequency")
                await event.respond(FREQUENCY_PROMPT)
            raise events.StopPropagation

        if draft["step"] == "frequency":
            days = parse_frequency(text)
            if not days:
                await event.respond("I couldn't understand that. " + FREQUENCY_PROMPT)
                raise events.StopPropagation
            if draft["routine_id"]:
                update_routine_days(draft["routine_id"], days)
                clear_draft(chat_id)
                clear_flow(chat_id)
                await event.respond(f"Updated! This routine now runs {format_frequency(days)}.")
            else:
                update_draft(chat_id, days=days, step="stop")
                await _prompt_for_stop(client, chat_id)
            raise events.StopPropagation

        if draft["step"] == "stop":
            exact = get_bus_stop_by_code(text) if _CODE_RE.match(text) else None
            if exact:
                await finalize_stop(client, chat_id, exact["code"], exact["name"])
                raise events.StopPropagation

            matches = search_bus_stops(text, 10)
            if not matches:
                await event.respond("No bus stops matched that. Try a bus stop code or part of its name.")
                raise events.StopPropagation
            if len(matches) == 1:
                await finalize_stop(client, chat_id, matches[0]["code"], matches[0]["name"])
                raise events.StopPropagation

            buttons = [
                [
                    Button.inline(
                        f"{stop['name']} ({stop['code']})"[:64],
                        make_button("routine_stop_pick", {"code": stop["code"], "name": stop["name"]}),
                    )
                ]
                for stop in matches
            ]
            await event.respond("Did you mean:", buttons=buttons)
            raise events.StopPropagation

        if draft["step"] == "buses":
            if text.lower() in _ALL_BUSES:
                picked = []
            else:
                at_stop = services_for_stop(draft["stop_code"])
                wanted = {t.upper() for t in _BUS_SPLIT_RE.split(text) if t}
                unknown = sorted(wanted - {s.upper() for s in at_stop})
                if unknown:
                    await event.respond(
                        f"{', '.join(unknown)} {'doesn' if len(unknown) == 1 else 'don'}'t stop at "
                        f"{draft['stop_name']} ({draft['stop_code']}). Tap the buses above, type ones "
                        "that do, or send all for every bus.",
                        parse_mode=None,
                    )
                    raise events.StopPropagation
                picked = [s for s in at_stop if s.upper() in wanted]
            update_draft(chat_id, services=join_services(picked))
            await save_draft(client, chat_id)
            raise events.StopPropagation
