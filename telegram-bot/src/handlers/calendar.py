"""/calendar: your events with a location, today and the next two weeks, each a button that
plans the way there to arrive by its start, as the web app's Calendar tab has them.

Telegram can't read a phone's calendar, so it's linked once by its private iCal link
(calendar_events.py), kept in the bot's database for this chat only and read again each time
/calendar is used. The message the link was sent in is deleted once it's saved, so it isn't
left in the chat. /calendar's Remove forgets it."""

from telethon import Button, events

from ..buttons import make_button
from ..calendar_events import DAYS, CalendarError, clear_link, fetch_calendar, get_link, hide_event, parse_ics, place_for, set_link, upcoming
from ..flows import Flow, clear_flow, get_flow, register_flow, set_flow
from ..format import escape_md
from ..reply import edit_rich_message, send_rich_message
from ..when import clock, day_label, dt_to_at, problem
from .nav import send_nav_panel

FLOW = register_flow(Flow(name="calendar_link", description="linking your calendar"))

LINK_PROMPT = """\
# 📅 Link your calendar

Your events with a location show here, each with a button to plan the way there, arriving by its start. Telegram can't read your phone's calendar, so send me its **private iCal link** instead:

- **Google Calendar**, on a computer: Settings, then your calendar under "Settings for my calendars", then Integrate calendar. Copy **Secret address in iCal format**.
- **Outlook**: Settings, Calendar, Shared calendars. Under Publish a calendar, pick the calendar and "Can view all details", Publish, then copy the **ICS** link.
- **iCloud**: in Calendar, share the calendar and turn on **Public Calendar**, then copy its link.

The link is kept in this bot's database for this chat only, and read each time you use /calendar. Anyone with the link can see your calendar, so I delete your message once it's saved. /calendar's Remove forgets it.

Send the link, or /cancel to stop."""


async def _list_view(chat_id: int):
    """The events as a message and buttons, or raises CalendarError."""
    link = get_link(chat_id)
    events_ = upcoming(parse_ics(await fetch_calendar(link["url"])), link["hidden"])
    md = ["# 📅 Calendar", ""]
    buttons = []
    group = None
    for ev in events_:
        when_word = "Today" if day_label(ev["start"]) == "today" else "Later"
        if when_word != group:
            group = when_word
            md += ["", f"**{group}**"]
        place = await place_for(ev["location"])
        time_text = f"all day {day_label(ev['start'])}" if ev["all_day"] else f"arrive {clock(ev['start'])} {day_label(ev['start'])}"
        md.append(f"- **{escape_md(ev['title'])}**, {time_text}: {escape_md(ev['location'])}" + ("" if place else " _(location not found)_"))
        short = "All day" if ev["all_day"] else clock(ev["start"])
        payload = {
            "title": ev["title"][:80], "location": ev["location"][:150], "at": dt_to_at(ev["start"]),
            "all_day": ev["all_day"], "place": place,
        }
        buttons.append([
            Button.inline(f"🧭 {short} {ev['title']}"[:64], make_button("cal_go", payload)),
            Button.inline("🙈 Hide", make_button("cal_hide", {"key": ev["key"]})),
        ])
    if not events_:
        md.append(f"_No events with a location in the next {DAYS} days._")
    buttons += [
        [Button.inline("🔄 Refresh", make_button("cal_refresh", {})), Button.inline("🔗 Change link", make_button("cal_change", {}))],
        [Button.inline("🗑 Remove calendar", make_button("cal_remove", {}))],
    ]
    markdown = "\n".join(md).replace("\n\n\n", "\n\n")
    return {"markdown": markdown, "fallback": markdown.replace("#", "").replace("*", "").replace("_", "")}, buttons


async def ask_link(client, chat_id: int):
    set_flow(chat_id, FLOW)
    await send_rich_message(client, chat_id, {"markdown": LINK_PROMPT, "fallback": LINK_PROMPT.replace("#", "").replace("*", "")})


async def send_calendar(client, chat_id: int):
    if not get_link(chat_id):
        await ask_link(client, chat_id)
        return
    try:
        rich, buttons = await _list_view(chat_id)
    except CalendarError as err:
        await client.send_message(chat_id, f"{err} Use /calendar to try again, or its Change link.", parse_mode=None,
                                  buttons=[[Button.inline("🔗 Change link", make_button("cal_change", {})),
                                            Button.inline("🗑 Remove calendar", make_button("cal_remove", {}))]])
        return
    await send_rich_message(client, chat_id, rich, buttons)


async def handle_calendar_callback(client, event, action: str, payload: dict):
    chat_id = event.chat_id
    if action == "cal_go":
        when ={"mode": "arrive", "at": payload["at"]} if not payload.get("all_day") else None
        if when and problem(when):
            when = None
        place = payload.get("place")
        await event.answer()
        if place:
            await send_nav_panel(client, chat_id, None, {"label": place["label"], "lat": place["lat"], "lng": place["lng"]}, awaiting="from", when=when)
        else:
            await client.send_message(chat_id, f"I couldn't find \"{payload['location']}\" on the map. Send the place to go to for {payload['title']}:", parse_mode=None)
            await send_nav_panel(client, chat_id, None, None, awaiting="to", when=when)
        return
    if action == "cal_hide":
        hide_event(chat_id, payload["key"])
        await event.answer("Hidden")
    elif action == "cal_change":
        await event.answer()
        await ask_link(client, chat_id)
        return
    elif action == "cal_remove":
        clear_link(chat_id)
        await event.answer("Calendar removed")
        await edit_rich_message(client, event, {"markdown": "Your calendar link is forgotten. Use /calendar to link one again.",
                                                "fallback": "Your calendar link is forgotten. Use /calendar to link one again."})
        return
    else:
        await event.answer("Reading your calendar…")
    # Hide and Refresh redraw the list where it is.
    if not get_link(chat_id):
        return
    try:
        rich, buttons = await _list_view(chat_id)
    except CalendarError as err:
        await client.send_message(chat_id, str(err), parse_mode=None)
        return
    await edit_rich_message(client, event, rich, buttons)


def register_calendar(client):
    @client.on(events.NewMessage(pattern=r"^/calendar(@\w+)?(\s|$)"))
    async def show(event):
        await send_calendar(client, event.chat_id)

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect_link(event):
        if get_flow(event.chat_id) != FLOW:
            return
        url = event.message.text.strip()
        try:
            text = await fetch_calendar(url)
        except CalendarError as err:
            await event.respond(f"{err} Send the link again, or /cancel to stop.", parse_mode=None)
            raise events.StopPropagation
        parse_ics(text)
        set_link(event.chat_id, url)
        clear_flow(event.chat_id)
        # Not left lying in the chat, since it unlocks the calendar.
        try:
            await event.delete()
        except Exception:
            pass
        await event.respond("Linked your calendar, and deleted your message with the link.", parse_mode=None)
        await send_calendar(client, event.chat_id)
        raise events.StopPropagation
