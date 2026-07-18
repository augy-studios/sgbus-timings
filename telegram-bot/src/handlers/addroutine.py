import re

from telethon import Button, events

from ..bus_stops import get_bus_stop_by_code, search_bus_stops
from ..buttons import make_button
from ..favourites import list_favourites
from ..flows import clear_flow, get_flow, set_flow
from ..frequency import format_frequency, parse_frequency
from ..routine_drafts import clear_draft, get_draft, start_draft, update_draft
from ..routines import add_routine, update_routine_days, update_routine_stop, update_routine_time
from ..time_of_day import parse_time_of_day

FLOW = "routine_wizard"
_CODE_RE = re.compile(r"^\d{3,5}$")

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


async def finalize_stop(client, chat_id, code, name):
    """Completes the routine wizard (or a single-field stop edit) once a bus
    stop has been chosen, either by typed search or by tapping a favourite."""
    draft = get_draft(chat_id)
    if not draft:
        return

    if draft["routine_id"]:
        update_routine_stop(draft["routine_id"], code, name)
        message = f"Updated! This routine now points to {name} ({code})."
    else:
        add_routine(chat_id, draft["hour"], draft["minute"], draft["days"], code, name)
        message = (
            f"Routine saved! {draft['hour']:02d}:{draft['minute']:02d} · {format_frequency(draft['days'])} "
            f"· {name} ({code})\n\nUse /routines to view or manage your routines."
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
