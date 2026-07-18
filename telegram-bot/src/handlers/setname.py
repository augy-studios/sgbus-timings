from telethon import events

from ..user_settings import clear_display_name, get_display_name, set_display_name

MAX_NAME_LENGTH = 64


def register_setname(client):
    @client.on(events.NewMessage(pattern="/setname"))
    async def handler(event):
        arg = event.message.text[len("/setname") :].strip()

        if not arg:
            sender = await event.get_sender()
            fallback = sender.first_name if sender and sender.first_name else "there"
            current = get_display_name(event.chat_id, fallback)
            await event.respond(
                f'I currently call you "{current}".\n\n'
                "Send /setname <name> to change it, or /setname clear to go back to your Telegram first name.",
                parse_mode=None,
            )
            return

        if arg.lower() == "clear":
            clear_display_name(event.chat_id)
            await event.respond("Done! I'll call you by your Telegram first name from now on.")
            return

        name = arg[:MAX_NAME_LENGTH]
        set_display_name(event.chat_id, name)
        await event.respond(f'Got it, I\'ll call you "{name}" from now on.', parse_mode=None)
