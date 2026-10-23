from telethon import Button, events

from ..config import config
from ..format import escape_md
from ..mini_app import open_button
from ..reply import send_rich_message
from .sync import begin as begin_sync

ABOUT = """\
# SG Bus Timings

Live bus arrival timings for Singapore, powered by LTA DataMall.

## What you can do

- Send a bus stop number (5 digits) or name to search for it directly
- Add buses after the number for just those, e.g. 84009 174, 175, or 84009 22* for every bus starting 22
- Send a bus number (e.g. 22 or 971E) to browse every stop along its route
- Just send your location (no command needed) to find the nearest bus stops
- Build a route between two bus stops to see every bus that runs the whole way without a change
- Navigate between any two places by bus and train, with every mix of the two to choose from
- Save places (home, work and your own, named as you like) and share them as links
- Link your calendar to plan the way to each event, arriving on time
- Save bus stops and bus numbers as favourites for quick access; favourites are pinned and starred wherever they're shown
- Choose whether favourites pin to the top or bottom of the list
- Tap Directions on any stop's timings, then pick Live map (walking directions in the web app) or Citymapper to get there
- Set up routines to get a bus stop's timings sent to you automatically at a time you choose
- Subscribe to Service Alerts: train service alerts and traffic alerts, each all updates or disruptions only
- Use this bot inline in any chat: type @{username} then a bus stop number or name
- Open the full web app without leaving Telegram: tap Open web app below, in a chat with the bot
- Sync your favourites, places, routines and calendar with the web app or the Android app

## Commands

- /start - show this message
- /nearme - find bus stops near your current location
- /favstops - view and jump to your favourite bus stops
- /unfavstop - remove favourite bus stops
- /addfavbus - add bus numbers to your favourites
- /favbuses - view your favourite buses and jump to their stops
- /unfavbus - remove favourite buses
- /route - pick a start and end bus stop to see the buses that run between them
- /myroutes - view your favourite routes
- /nav - get from any place to any other by bus and train
- /mynavs - view your favourite navs
- /favouritepref - choose whether favourites pin to the top or bottom
- /addroutine - set up a routine that sends you a bus stop's timings on a schedule
- /routines - view, edit, or delete your routines
- /alerts - train service alerts and traffic incidents right now
- /sub - get train and traffic alerts (all, or disruptions only, for each)
- /unsub - stop those alerts
- /setname - set the name you want the bot to call you by
- /sethome - set your home, for the Home buttons in /nav and /route
- /setwork - set your work, for the Work buttons in /nav and /route
- /places - your home, work and other places: get there, share, rename, move or delete
- /addplace - save a new place, with a name of your own
- /calendar - your calendar's events with a location, to plan the way there
- /settings - view and change your settings (name, birthday, home, work, routine notifications)
- /sync - sync with the web app or the Android app, by the code its Settings shows
- /done - finish whatever you're in the middle of
- /cancel - stop whatever you're in the middle of
"""


def register_start(client):
    @client.on(events.NewMessage(pattern=r"^/start(@\w+)?(\s|$)"))
    async def handler(event):
        # The web app's Sync with the Telegram bot links here as t.me/<bot>?start=sync_<code>.
        param = event.raw_text.split(maxsplit=1)[1].strip() if len(event.raw_text.split()) > 1 else ""
        if param.lower().startswith("sync_"):
            await begin_sync(client, event, param[5:])
            return
        me = await client.get_me()
        username = escape_md(me.username) if me.username else "this bot"
        rich = {
            "markdown": ABOUT.format(username=username),
            "fallback": ABOUT.format(username=username).replace("#", "").replace("*", ""),
        }
        buttons = [
            [open_button("🌐 Open web app", private=event.is_private)],
            [Button.url("📖 How to use this bot", config.guide_url)],
            [Button.url("💖 Donate", config.donate_url)],
        ]
        await send_rich_message(client, event.chat_id, rich, buttons)
