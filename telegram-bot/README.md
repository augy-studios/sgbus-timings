# SG Bus Timings Telegram Bot

A Telegram bot for live Singapore bus arrival timings, built on the same
LTA DataMall data as the [sgbus-timings web app](https://sgbus.uwuapps.org/).
Written in Python with [Telethon](https://docs.telethon.dev/), using a local
SQLite database for favourites, scheduling, and persistent inline buttons.
Timings are sent as real Telegram rich messages (Bot API 10.1+) - proper
headings and tables, not a Markdown approximation.

## What it does

- Look up live bus arrival timings for any bus stop, by number or by name.
- Find the bus stops nearest to your current location.
- Save bus stops as favourites for quick access, from any chat.
- Works inline: type `@your_bot_username` in any chat to search or pull up
  your favourites without switching to the bot's chat.

Data comes directly from [LTA DataMall](https://datamall.lta.gov.sg/) - bus
stop locations, arrival ETAs, load, wheelchair accessibility, and deck type.

## Using the bot

### Commands

| Command | What it does |
|---|---|
| `/start` | Shows what the bot does, all commands, and buttons for the web app and donations |
| `/nearme` | Asks for your location, then lists the nearest bus stops as buttons |
| `/favs` | Lists your favourite bus stops as buttons |

### Searching for a bus stop

You don't need a command to search. Just type into the chat:

- A bus stop number, e.g. `84009`, to jump straight to it (or see a shortlist
  if there's more than one match on the prefix).
- Part of a bus stop's name or road, e.g. `bedok` or `changi`, to see a list
  of matching stops as buttons.

If there's exactly one match, the bot shows its live timings immediately. If
there's more than one, tap the bus stop you meant from the list.

### Viewing timings

Every timings message has two buttons:

- **Add favourite / Remove favourite** - toggle the bus stop in your
  favourites list.
- **Refresh** - re-fetch live timings for that stop.

These buttons keep working even after the bot restarts, since the button
actions are stored in SQLite rather than only in memory.

### Nearest stops

`/nearme` asks Telegram for your location (via the native "share location"
button, so your coordinates never go through free text). The bot then shows
up to 8 nearby bus stops as buttons, each labelled with the stop name,
number, and distance in metres. Any of those stops that are already in your
favourites are bumped to the top of the list.

### Inline mode

In any chat (not just with the bot), type:

```
@your_bot_username 84009
@your_bot_username bedok
@your_bot_username
```

An empty query after the bot's username shows your favourites; anything else
is treated as a search, same as typing directly into the bot's chat. Picking
a result posts a live timings message with just a refresh button - no
favourite toggle, since the message can be posted into any chat.

## Data source

All bus stop and arrival data comes from LTA DataMall's `BusStops` and
`v3/BusArrival` endpoints. The bus stop list is cached locally in SQLite and
refreshed automatically on a schedule (see `BUS_STOPS_REFRESH_HOURS` in
`.env`); arrival timings are always fetched live.

## Running it

Registering the bot with BotFather gives you `BOT_TOKEN`. Because this bot
talks to Telegram over MTProto (via Telethon) rather than only the plain Bot
API, it also needs an `API_ID`/`API_HASH` pair - get one at
[my.telegram.org/apps](https://my.telegram.org/apps) (any account can create
one; it's not tied to the bot account itself). Quick start:

```bash
git clone <this-repo-url>
cd sgbus-timings/telegram-bot
python -m venv .venv
source .venv/bin/activate   # .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
# fill in BOT_TOKEN, API_ID, API_HASH, and LTA_ACCOUNT_KEY in .env
python -m src.main
```

The first `python -m src.main` run creates a Telethon session file
(`data/bot.session`) alongside the SQLite database - keep both around between
restarts so the bot doesn't have to re-authenticate.

To refresh the cached bus stop list without starting the bot:

```bash
python -m src.refresh_stops
```

For running on a VPS, run `python -m src.main` under `tmux`, `screen`, or a
systemd unit, same as any long-running Python process.

## Project layout

```
telegram-bot/
  src/
    main.py               entrypoint: wires up handlers, scheduler, starts the client
    config.py              reads and validates .env
    db.py                  SQLite connection and schema
    lta.py                 LTA DataMall API client (async, httpx)
    bus_stops.py           bus stop cache, search, nearest-stop lookup
    favourites.py          per-user favourites (SQLite)
    buttons.py             persistent inline-button registry (SQLite)
    scheduler.py           SQLite-backed periodic job runner (asyncio)
    format.py              rich-message Markdown formatting (headings + tables)
    reply.py               rich-message send/edit helpers with plain-text fallback
    stop_view.py           builds a stop's timings message + keyboard
    list_view.py           builds a list-of-stops keyboard
    refresh_stops.py       one-off script: refresh the bus stop cache
    handlers/
      start.py, nearme.py, favs.py, search.py, callbacks.py, inline.py
  data/                   SQLite database + Telethon session file (gitignored)
```

## License

Same license as the parent [sgbus-timings](../LICENSE) repository.
