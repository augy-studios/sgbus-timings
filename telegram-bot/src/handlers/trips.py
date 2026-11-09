"""Live trips (bot_trips.py): Start trip under a way in /nav, the buttons under a trip's widget,
/trip for the trip you're on, and t.me/<bot>?start=eta_<id> links to follow someone's trip."""

import re

from telethon import events

from .. import bot_trips
from ..bot_trips import TripError
from ..user_settings import get_display_name

ETA_ID_RE = re.compile(r"^[a-z0-9]{10}$")
PRIVATE_ONLY = "Live trips work in your own chat with the bot. Open it and plan the way there with /nav."


async def _name(event) -> str:
    sender = await event.get_sender()
    first = getattr(sender, "first_name", None) or ""
    return get_display_name(event.sender_id, first)


async def follow_link(client, event, eta_id: str) -> None:
    """/start eta_<id>: the trip's widget in this chat."""
    if not event.is_private:
        await event.respond(PRIVATE_ONLY)
        return
    if not ETA_ID_RE.match(eta_id):
        await event.respond("That isn't a trip link.")
        return
    try:
        answer = await bot_trips.follow(event.chat_id, eta_id)
    except (TripError, bot_trips.bot_api.BotApiError) as err:
        print(f"[trips] following {eta_id} failed: {err}")
        await event.respond(str(err) if isinstance(err, TripError) else "Couldn't show that trip here. Live trips need an up-to-date Telegram app.")
        return
    if not answer.sent:
        await event.respond(answer.text)


async def handle_trip_callback(client, event, action: str, payload: dict) -> None:
    eta_id = payload.get("eta")
    if action == "trip_start":
        if not event.is_private:
            await event.answer(PRIVATE_ONLY, alert=True)
            return
        await event.answer("Starting your trip…")
        try:
            await bot_trips.start_trip(event.chat_id, await _name(event), payload["from"], payload["to"], payload["option"])
        except TripError as err:
            await event.respond(f"⚠️ {err}")
        return

    if action == "trip_refresh":
        try:
            eta = await bot_trips.refresh(eta_id, client)
        except (TripError, bot_trips.bot_api.BotApiError) as err:
            await event.answer(str(err)[:190] if isinstance(err, TripError) else "Couldn't refresh just now.")
            return
        await event.answer("Up to date" if eta else "This trip has ended")
        return

    if action == "trip_end":
        try:
            ended = await bot_trips.end_trip(eta_id, event.chat_id, client)
        except TripError as err:
            await event.answer(str(err)[:190], alert=True)
            return
        await event.answer("Trip ended" if ended else "This trip's over already")
        return

    if action == "trip_unfollow":
        await bot_trips.unfollow(event.chat_id, eta_id)
        await event.answer("You've stopped following this trip")
        return

    await event.answer()


def register_trips(client):
    @client.on(events.NewMessage(pattern=r"^/trip(@\w+)?$"))
    async def my_trip(event):
        if not event.is_private:
            await event.respond(PRIVATE_ONLY)
            return
        row = bot_trips.own_live_trip(event.chat_id)
        if not row:
            await event.respond("You're not on a trip. Plan the way with /nav, pick a way, then tap ▶️ Start trip.")
            return
        await follow_link(client, event, row["eta_id"])
