from datetime import datetime

from telethon import Button, events

from ..buttons import make_button
from ..flows import clear_flow, get_flow, set_flow
from ..format import escape_md
from ..reply import send_rich_message
from ..user_settings import (
    get_birthday,
    get_display_name,
    get_notifications_enabled,
    set_birthday,
    set_display_name,
)

FLOW_PREFIX = "settings_edit:"

NAME_PROMPT = "What would you like me to call you? Send a name, or /cancel to stop."
BIRTHDAY_PROMPT = "When's your birthday? Send it as `YYYY-MM-DD` (e.g. `1998-04-23`), or /cancel to stop."


def _parse_birthday(text: str) -> "str | None":
    try:
        return datetime.strptime(text, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def build_settings_view(chat_id: int, sender):
    fallback = sender.first_name if sender and sender.first_name else "there"
    name = get_display_name(chat_id, fallback)
    name_is_set = name != fallback
    birthday = get_birthday(chat_id)
    notifications_on = get_notifications_enabled(chat_id)

    lines = [
        "# Settings",
        f"- **Name**: {escape_md(name) if name_is_set else '_not set_'}",
        f"- **Birthday**: {birthday if birthday else '_not set_'}",
        f"- **Routine notifications**: {'Enabled' if notifications_on else 'Disabled'}",
    ]
    markdown = "\n".join(lines)
    fallback_text = markdown.replace("#", "").replace("*", "").replace("_", "")
    rich = {"markdown": markdown, "fallback": fallback_text}

    birthday_row = [Button.inline("🎂 Set birthday", make_button("settings_edit_birthday", {}))]
    if birthday:
        birthday_row.append(Button.inline("🗑 Clear birthday", make_button("settings_clear_birthday", {})))

    buttons = [
        [Button.inline("✏️ Set name", make_button("settings_edit_name", {}))],
        birthday_row,
        [
            Button.inline(
                "🔕 Disable notifications" if notifications_on else "🔔 Enable notifications",
                make_button("settings_toggle_notifications", {}),
            )
        ],
    ]
    return rich, buttons


async def start_edit_name(client, chat_id):
    set_flow(chat_id, FLOW_PREFIX + "name")
    await client.send_message(chat_id, NAME_PROMPT)


async def start_edit_birthday(client, chat_id):
    set_flow(chat_id, FLOW_PREFIX + "birthday")
    await client.send_message(chat_id, BIRTHDAY_PROMPT)


def register_settings(client):
    @client.on(events.NewMessage(pattern="/settings"))
    async def handler(event):
        sender = await event.get_sender()
        rich, buttons = build_settings_view(event.chat_id, sender)
        await send_rich_message(client, event.chat_id, rich, buttons)

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
