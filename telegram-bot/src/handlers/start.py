from telethon import Button, events

from ..config import config
from ..format import escape_md
from ..reply import send_rich_message

ABOUT = """\
# SG Bus Timings

Live bus arrival timings for Singapore, powered by LTA DataMall.

## What you can do

- Send a bus stop number or name to search for it directly
- Just send your location (no command needed) to find the nearest bus stops
- Save bus stops and bus numbers as favourites for quick access; favourites are pinned and starred wherever they're shown
- Choose whether favourites pin to the top or bottom of the list
- Use this bot inline in any chat: type @{username} then a bus stop number or name

## Commands

- /start - show this message
- /nearme - find bus stops near your current location
- /favstops - view and jump to your favourite bus stops
- /unfavstop - remove favourite bus stops
- /addfavbus - add bus numbers to your favourites
- /favbuses - view your favourite buses and jump to their stops
- /unfavbus - remove favourite buses
- /favouritepref - choose whether favourites pin to the top or bottom
- /done - finish adding favourite buses
- /cancel - cancel the current operation
"""


def register_start(client):
    @client.on(events.NewMessage(pattern="/start"))
    async def handler(event):
        me = await client.get_me()
        username = escape_md(me.username) if me.username else "this bot"
        rich = {
            "markdown": ABOUT.format(username=username),
            "fallback": ABOUT.format(username=username).replace("#", "").replace("*", ""),
        }
        buttons = [
            [Button.url("🌐 Open web app", config.webapp_url)],
            [Button.url("💖 Donate", config.donate_url)],
        ]
        await send_rich_message(client, event.chat_id, rich, buttons)
