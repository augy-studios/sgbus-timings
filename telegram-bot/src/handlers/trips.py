"""Live trips (bot_trips.py): Start trip under a way in /nav, the buttons under a trip's widget,
/trip for the trip you're on, and t.me/<bot>?start=eta_<id> links to follow someone's trip."""

import re

from telethon import Button, events, types

from .. import bot_trips
from ..bot_trips import TripError
from ..user_settings import get_display_name

ETA_ID_RE = re.compile(r"^[a-z0-9]{10}$")
PRIVATE_ONLY = "Live trips work in your own chat with the bot. Open it and plan the way there with /nav."

ASK_START = ("📍 For exact updates, share your live location for the trip: tap 📎, then Location, then "
             "Share My Live Location. Or tap Send my location below to put the trip right once. "
             "(Telegram on a computer can't send a location.)")
ASK_REFRESH = ("📍 Tap Send my location to put your trip right where you are, or share your live "
               "location (📎, Location, Share My Live Location) for updates all the way.")
OFF_WAY = ("📍 That's off the way you're taking, so the trip carries on as it was. Anyone following "
           "sees where you are on the map.")


def _ask_button():
    return [Button.request_location("📍 Send my location", single_use=True, resize=True)]


async def ask_location(client, chat_id: int, eta_id: str, text: str) -> None:
    """The 📍 Send my location keyboard: the location it sends puts the trip right (bot_trips.py)."""
    bot_trips.mark_asked(eta_id)
    await client.send_message(chat_id, text, buttons=_ask_button())


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
            eta_id = await bot_trips.start_trip(event.chat_id, await _name(event), payload["from"], payload["to"], payload["option"], payload.get("via"))
        except TripError as err:
            await event.respond(f"⚠️ {err}")
            return
        await ask_location(client, event.chat_id, eta_id, ASK_START)
        return

    if action == "trip_refresh":
        try:
            eta = await bot_trips.refresh(eta_id, client)
        except (TripError, bot_trips.bot_api.BotApiError) as err:
            await event.answer(str(err)[:190] if isinstance(err, TripError) else "Couldn't refresh just now.")
            return
        await event.answer("Up to date" if eta else "This trip has ended")
        # The person on the trip, with no location lately: ask for one, to put it right.
        row = bot_trips.get_trip(eta_id)
        if eta and row and row["owner_chat"] == event.chat_id and not bot_trips.fix_is_fresh(row):
            await ask_location(client, event.chat_id, eta_id, ASK_REFRESH)
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


def _is_live(message) -> bool:
    return isinstance(message.media, types.MessageMediaGeoLive)


def register_trip_location(client):
    """Your location on a trip (bot_trips.py, apply_fix). Registered before every other location
    handler, as /nearme and /nav's ends take a location too: this one only takes a live location
    while you're on a trip, or a location sent soon after the bot asked for one."""

    @client.on(events.NewMessage(func=lambda e: e.is_private and e.message.geo is not None))
    async def on_location(event):
        live = _is_live(event.message)
        row = bot_trips.wants_location(event.chat_id, live)
        if not row:
            return
        geo = event.message.geo
        try:
            got = await bot_trips.apply_fix(row, geo.lat, geo.long, getattr(geo, "accuracy_radius", None), live=False, client=client)
        except Exception as err:
            print(f"[trips] location for {row['eta_id']} failed: {err}")
            got = None
        if live:
            where = f": you're {bot_trips.where_text(got['eta'])}" if got and got.get("on") else ""
            text = f"📡 Following your live location for this trip{where}. It updates by itself until you stop sharing it."
        elif got and got.get("on"):
            text = f"📍 Trip updated: you're {bot_trips.where_text(got['eta'])}."
        elif got:
            text = OFF_WAY
        else:
            text = "📍 Couldn't update the trip just now. It carries on by the clock."
        await event.respond(text, buttons=Button.clear())
        raise events.StopPropagation

    # Each move of a live location comes as an edit of its message.
    @client.on(events.MessageEdited(func=lambda e: e.is_private and e.message.geo is not None))
    async def on_live_move(event):
        if not _is_live(event.message):
            return
        row = bot_trips.wants_location(event.chat_id, True)
        if not row:
            return
        geo = event.message.geo
        try:
            await bot_trips.apply_fix(row, geo.lat, geo.long, getattr(geo, "accuracy_radius", None), live=True, client=client)
        except Exception as err:
            print(f"[trips] live location for {row['eta_id']} failed: {err}")
        raise events.StopPropagation
