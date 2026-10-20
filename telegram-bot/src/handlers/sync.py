"""/sync <code>: syncs this chat with the web app or the Android app (sync_bot.py), by the code
its Settings shows under Sync with the Telegram bot. That button's Open the bot link says it
for you, as /start sync_<code> (handlers/start.py). /sync stop ends one that's running."""

import httpx
from telethon import events

from ..config import config
from ..sync_bot import CODE_RE, SyncError, join, normalise_code, start, stop

HOW = (
    "🔄 To sync with the web app or the Android app, open its Settings, tap **Sync with the Telegram bot**, "
    "then tap **Open the bot** there, or send me /sync and the code it shows, such as `/sync BX7K2P`.\n\n"
    "What you sync passes through the site's server, kept for 10 minutes at most."
)


async def begin(client, event, raw_code: str) -> None:
    """Joins the device showing this code, and says how it went."""
    if not config.bot_api_token:
        await event.respond("🔄 Syncing isn't set up on this bot yet.")
        return
    code = normalise_code(raw_code)
    if not CODE_RE.match(code):
        await event.respond(f"🔄 That isn't a sync code. {HOW}")
        return
    try:
        expires_at = await join(code, event.chat_id)
    except SyncError as err:
        if str(err) == "not set up":
            await event.respond("🔄 Syncing with the bot isn't set up on the site yet.")
        else:
            await event.respond(
                "🔄 No device is showing that code, or another chat has taken it. "
                "Check it's the one on screen, or tap Sync with the Telegram bot again for a new one."
            )
        return
    except httpx.HTTPError:
        await event.respond("🔄 Couldn't reach the site just now. Please try again shortly.")
        return
    start(client, event.chat_id, code, expires_at)
    await event.respond(
        "🔄 **Connected to your device.** On it, tick what to bring here under Import, or what to send to it "
        "under Export. I'll say what I save. It ends when you stop it there, send /sync stop, or after 10 minutes.",
        parse_mode="md",
    )


def register_sync(client):
    @client.on(events.NewMessage(pattern=r"^/sync(@\w+)?(\s+(?P<arg>.+))?$"))
    async def handler(event):
        arg = (event.pattern_match.group("arg") or "").strip()
        if arg.lower() == "stop":
            await event.respond("🔄 Sync ended." if stop(event.chat_id) else "🔄 No sync is running.")
            return
        if not arg:
            await event.respond(HOW, parse_mode="md")
            return
        await begin(client, event, arg)
