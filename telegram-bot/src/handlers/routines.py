from telethon import Button, events

from ..buttons import make_button
from ..flows import set_flow
from ..frequency import format_frequency
from ..pagination import nav_row, paginate
from ..reply import send_rich_message
from ..routine_drafts import start_draft
from ..routines import get_routine, list_routines
from .addroutine import FLOW, FREQUENCY_PROMPT, TIME_PROMPT, _prompt_for_stop

FIELD_PROMPTS = {
    "time": TIME_PROMPT,
    "frequency": FREQUENCY_PROMPT,
}


def _routine_line(routine) -> str:
    return f"{routine['hour']:02d}:{routine['minute']:02d} · {format_frequency(routine['days'])} · {routine['stop_name']} ({routine['stop_code']})"


def build_routines_view(chat_id: int, page: int):
    routines = list_routines(chat_id)
    page_items, page, total_pages = paginate(routines, page)

    lines = ["# Your routines"]
    buttons = []
    for routine in page_items:
        idx = routines.index(routine) + 1
        lines.append(f"{idx}. {_routine_line(routine)}")
        buttons.append(
            [Button.inline(f"{idx}. {routine['stop_name']}"[:64], make_button("routine_view", {"id": routine["id"]}))]
        )
    buttons += nav_row("routines_page", {}, page, total_pages)

    text = "\n".join(lines)
    rich = {"markdown": text, "fallback": text.replace("#", "")}
    return rich, buttons, routines


def build_routine_detail_view(routine_id: int):
    routine = get_routine(routine_id)
    if not routine:
        return None

    rich = {
        "markdown": f"# Routine\n{_routine_line(routine)}",
        "fallback": _routine_line(routine),
    }
    buttons = [
        [
            Button.inline("✏️ Edit", make_button("routine_edit_menu", {"id": routine_id})),
            Button.inline("🗑 Delete", make_button("routine_delete", {"id": routine_id})),
        ],
        [Button.inline("🔙 Back", make_button("routines_page", {"page": 0}))],
    ]
    return rich, buttons


def build_routine_edit_menu_view(routine_id: int):
    routine = get_routine(routine_id)
    if not routine:
        return None

    rich = {
        "markdown": f"# Edit routine\nWhat would you like to change?\n{_routine_line(routine)}",
        "fallback": f"Edit routine\n{_routine_line(routine)}",
    }
    buttons = [
        [
            Button.inline("🕐 Time", make_button("routine_edit_field", {"id": routine_id, "field": "time"})),
            Button.inline("📅 Frequency", make_button("routine_edit_field", {"id": routine_id, "field": "frequency"})),
        ],
        [Button.inline("🚌 Bus stop", make_button("routine_edit_field", {"id": routine_id, "field": "stop"}))],
        [Button.inline("🔙 Back", make_button("routine_view", {"id": routine_id}))],
    ]
    return rich, buttons


async def start_field_edit(client, chat_id, routine_id, field):
    routine = get_routine(routine_id)
    if not routine:
        return
    start_draft(
        chat_id,
        step=field,
        routine_id=routine_id,
        hour=routine["hour"],
        minute=routine["minute"],
        days=routine["days"],
    )
    set_flow(chat_id, FLOW)
    if field == "stop":
        await _prompt_for_stop(client, chat_id)
    else:
        await client.send_message(chat_id, FIELD_PROMPTS[field])


def register_routines(client):
    @client.on(events.NewMessage(pattern="/routines"))
    async def handler(event):
        rich, buttons, routines = build_routines_view(event.chat_id, 0)
        if not routines:
            await event.respond("You have no routines yet. Use /addroutine to set one up.")
            return
        await send_rich_message(client, event.chat_id, rich, buttons)
