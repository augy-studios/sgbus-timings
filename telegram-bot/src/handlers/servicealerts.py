import asyncio
from datetime import datetime, timedelta, timezone

from telethon import events
from telethon.errors import (
    ChatWriteForbiddenError,
    InputUserDeactivatedError,
    PeerIdInvalidError,
    UserIsBlockedError,
)

from ..lta import fetch_traffic_incidents, fetch_train_alerts
from ..notices import changes_service, fetch_notices
from ..reply import send_rich_message
from ..service_alerts import (
    diff_newsfeed,
    diff_traffic,
    diff_train,
    get_modes,
    list_subscribers,
    subscribe,
    unsubscribe,
    update_for,
)
from ..service_alerts_view import (
    alerts_buttons,
    format_alert_update,
    format_alerts_now,
    format_newsfeed_update,
    format_subscription,
    sub_mode_buttons,
)

GMT8 = timezone(timedelta(hours=8))

# Errors that mean the chat can't be reached any more: the user blocked the bot or
# deleted their account. Their subscription goes, as in sgmrt-alerts.
_GONE = (UserIsBlockedError, InputUserDeactivatedError, PeerIdInvalidError, ChatWriteForbiddenError)

# A pause between sends keeps a broadcast inside Telegram's ~30 messages a second.
_SEND_GAP_SECONDS = 0.05

UNSUBSCRIBED = "🔕 Unsubscribed from Service Alerts. You won't receive them anymore. Send /sub to start again."


async def fetch_alerts_now() -> tuple:
    """(train alerts, traffic incidents, newsfeed), any one None if it couldn't be reached."""
    train, traffic, notices = await asyncio.gather(fetch_train_alerts(), fetch_traffic_incidents(), fetch_notices(), return_exceptions=True)
    gone = lambda v: None if isinstance(v, Exception) else v  # noqa: E731
    return gone(train), gone(traffic), gone(notices)


def register_servicealerts(client):
    @client.on(events.NewMessage(pattern=r"^/sub(@\w+)?$"))
    async def sub(event):
        # Re-sending /sub keeps the existing mode and just shows the picker again.
        subscribe(event.chat_id)
        modes = get_modes(event.chat_id)
        await event.respond(format_subscription(modes), buttons=sub_mode_buttons(modes))

    @client.on(events.NewMessage(pattern=r"^/unsub(@\w+)?$"))
    async def unsub(event):
        unsubscribe(event.chat_id)
        await event.respond(UNSUBSCRIBED)

    @client.on(events.NewMessage(pattern=r"^/alerts(@\w+)?$"))
    async def alerts(event):
        train, traffic, notices = await fetch_alerts_now()
        await send_rich_message(client, event.chat_id, format_alerts_now(train, traffic, notices), alerts_buttons())


# ---------- polling ----------

# The last failure per feed, so an LTA outage is logged once when it starts and once when
# it clears rather than on every poll.
_last_error: dict[str, "str | None"] = {"train": None, "traffic": None}


def _note_feed(feed: str, result) -> bool:
    stamp = datetime.now(GMT8).strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(result, Exception):
        message = str(result) or type(result).__name__
        if message != _last_error[feed]:
            print(f"[{stamp}] [service-alerts] {feed} fetch failed (will keep retrying quietly): {message}")
            _last_error[feed] = message
        return False
    if _last_error[feed]:
        print(f"[{stamp}] [service-alerts] {feed} fetch recovered")
        _last_error[feed] = None
    return True


async def poll_service_alerts(client) -> None:
    train, traffic = await asyncio.gather(fetch_train_alerts(), fetch_traffic_incidents(), return_exceptions=True)

    # Each feed is diffed on its own, so one being down doesn't hold the other back.
    train_update = diff_train(train) if _note_feed("train", train) else None
    new_incidents = diff_traffic(traffic) if _note_feed("traffic", traffic) else []
    if not train_update and not new_incidents:
        return

    # Sent in the background, so a long subscriber list doesn't hold up routines.
    asyncio.get_event_loop().create_task(_broadcast(client, train_update, new_incidents))


async def poll_newsfeed(client) -> None:
    """The site's newsfeed, kept for stop notes (notices.py), and what's new in it sent to the
    chats with it on."""
    notices = await fetch_notices()
    if not notices:
        return
    fresh = diff_newsfeed(notices.get("items") or [])
    if fresh:
        asyncio.get_event_loop().create_task(_broadcast_newsfeed(client, fresh, notices.get("sources") or {}))


async def _broadcast_newsfeed(client, fresh: list, sources: dict) -> None:
    messages = {
        "all": format_newsfeed_update(fresh, sources),
        "disruptions": format_newsfeed_update([n for n in fresh if changes_service(n)], sources) if any(changes_service(n) for n in fresh) else None,
    }
    for row in list_subscribers():
        rich = messages.get(row["newsfeed_mode"])
        if not rich:
            continue
        try:
            await send_rich_message(client, row["chat_id"], rich)
        except _GONE:
            unsubscribe(row["chat_id"])
        except Exception as err:
            print(f"[service-alerts] newsfeed to chat {row['chat_id']} failed: {err}")
        await asyncio.sleep(_SEND_GAP_SECONDS)


async def _broadcast(client, train_update, new_incidents) -> None:
    messages = {}
    for row in list_subscribers():
        chat_id = row["chat_id"]
        modes = {"train": row["train_mode"], "traffic": row["traffic_mode"]}
        key = (modes["train"], modes["traffic"])
        if key not in messages:
            train, incidents = update_for(modes, train_update, new_incidents)
            messages[key] = (
                format_alert_update(train["value"] if train else None, incidents) if (train or incidents) else None
            )
        rich = messages[key]
        if not rich:
            continue
        try:
            # send_rich_message falls back to plain text itself; anything that still
            # raises here failed on both paths.
            await send_rich_message(client, chat_id, rich)
        except _GONE:
            unsubscribe(chat_id)
        except Exception as err:
            print(f"[service-alerts] update to chat {chat_id} failed: {err}")
        await asyncio.sleep(_SEND_GAP_SECONDS)
