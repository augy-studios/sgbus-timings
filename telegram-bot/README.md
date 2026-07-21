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
- Save bus numbers as favourites too - they're pinned and starred wherever
  they show up in a stop's timings, and you can browse straight to the stops
  they serve.
- Choose whether favourites (buses or stops) pin to the top or bottom of the
  list.
- Set up routines to have a bus stop's timings sent to you automatically at a
  time and frequency you choose, with a personalised greeting.
- Set a custom name for the bot to call you by, save your birthday, and
  toggle routine notifications on or off, all from one `/settings` command.
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
| `/favstops` | Lists your favourite bus stops as buttons |
| `/unfavstop` | Lists your favourite bus stops as paginated buttons to remove |
| `/addfavbus` | Starts a flow to add bus numbers to your favourites - send numbers as text, `/done` to finish |
| `/favbuses` | Lists your favourite bus numbers as paginated buttons; tap one to browse the stops it serves |
| `/unfavbus` | Lists your favourite bus numbers as paginated buttons to remove |
| `/favouritepref` | Choose whether favourite buses/stops pin to the top or bottom of the list |
| `/addroutine` | Starts a flow to set up a routine (time, frequency, bus stop) that sends you timings on a schedule |
| `/routines` | Lists your routines as numbered buttons; tap one to view, edit, or delete it |
| `/setname` | Sets (or clears) the name the bot calls you by |
| `/settings` | Lists your settings (name, birthday, routine notifications) with buttons to change them |
| `/done` | Finishes the current multi-step flow (e.g. `/addfavbus`) |
| `/cancel` | Cancels the current multi-step flow |

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

Any bus service in the table that's in your favourite buses is starred (⭐)
and pinned to the top or bottom of the list, per your `/favouritepref`
setting.

### Favourite buses

Send `/addfavbus`, then type bus numbers (space or comma separated, across
as many messages as you like) - each one is validated against LTA's live
service list and confirmed as saved. Send `/done` when finished, or `/cancel`
to abort.

`/favbuses` shows your favourite buses as paginated buttons; tapping one
shows the stops it serves as another paginated list, and tapping a stop opens
a timings view filtered to just that service. `/unfavbus` shows the same
paginated buttons but tapping one removes it instead.

`/unfavstop` does the paginated-removal equivalent for favourite bus stops
(the star toggle on a stop's timings view still works too).

### Nearest stops

`/nearme` asks Telegram for your location (via the native "share location"
button, so your coordinates never go through free text). The bot then shows
up to 8 nearby bus stops as buttons, each labelled with the stop name,
number, and distance in metres, sorted by distance within your `/favouritepref`
pin position (favourites first by default, or last if you've set it to
"bottom").

### Routines

`/addroutine` walks you through three questions, one at a time: what time (24-
or 12-hour, e.g. `9 AM`, `10 PM`, `0830`, `20:00`, always interpreted as
GMT+8), how often (`daily`, `weekdays`, `weekends`, or a comma-separated list
of days like `Mon, Wed, Fri`), and which bus stop - pick one of your
favourites from the buttons shown, or type a bus stop code or part of its
name. Send `/cancel` at any point to abort.

`/routines` lists your saved routines as a numbered list of buttons; tapping
one shows its details with **Edit** and **Delete** buttons. Edit opens a
sub-menu to change just the time, frequency, or bus stop - editing the time
lets a routine fire again later the same day even if it already ran once.

When a routine's scheduled time and day arrive, the bot sends that stop's
live timings automatically, prefixed with a greeting based on the time of day
("Good morning/afternoon/evening") and your name - either your Telegram first
name, or a custom one set via `/setname`.

### Settings

`/settings` shows every custom setting the bot keeps for you, and whether
each one is set:

- **Name** - what the bot calls you (also settable directly via `/setname`).
- **Birthday** - tap **Set birthday** and reply with a date in pretty much any
  common format (e.g. `1998-04-23`, `23/04/1998`, `23 Apr 1998`, or
  `Apr 23rd 1998`), or **Clear birthday** to unset it. If set, the bot sends a
  "Happy birthday" message at 9 AM GMT+8 on that date every year.
- **Routine notifications** - on by default; toggling it off pauses all
  `/addroutine` deliveries without deleting the routines themselves, and
  toggling it back on resumes them.
- **Favourite buses / bus stops** - lists every service number (added via
  `/addfavbus`) and bus stop (added by tapping "Add favourite" on a stop's
  timings) you've favourited, along with whether each list is currently
  pinned to the **top** or **bottom** of arrival views (set via
  `/favouritepref`).

Tapping **Set name** or **Set birthday** starts a one-message flow, same as
`/addfavbus` or `/addroutine` - reply with the value, or `/cancel` to abort.

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

All bus stop and arrival data comes from LTA DataMall's `BusStops`,
`BusServices`, `BusRoutes`, and `v3/BusArrival` endpoints. The bus stop,
service, and route lists are cached locally in SQLite and refreshed
automatically on a schedule (see `BUS_STOPS_REFRESH_HOURS` in `.env`, which
governs all three caches); arrival timings are always fetched live.

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
    bus_services.py        bus service number cache + validation
    bus_routes.py          bus service <-> stop cache (which stops a service visits)
    favourites.py          per-user favourite bus stops (SQLite)
    favourite_buses.py     per-user favourite bus numbers (SQLite)
    favourite_prefs.py     per-user pin position (top/bottom) per favourite kind
    flows.py               per-user multi-step flow state (e.g. mid-/addfavbus)
    routines.py             per-user scheduled routines (SQLite)
    routine_drafts.py       per-user in-progress routine wizard state (SQLite)
    frequency.py            parses/formats routine frequency (daily/weekdays/weekends/day list)
    time_of_day.py          parses time-of-day input; time-of-day greeting text
    user_settings.py        per-user custom display name, birthday (+ wish tracking), notification preference (SQLite)
    pagination.py          generic paginated inline-keyboard helper
    buttons.py             persistent inline-button registry (SQLite)
    scheduler.py           SQLite-backed periodic job runner (asyncio)
    format.py              rich-message Markdown formatting (headings + tables)
    reply.py               rich-message send/edit helpers with plain-text fallback
    stop_view.py           builds a stop's timings message + keyboard
    list_view.py           builds a list-of-stops keyboard (with favourite pinning)
    refresh_stops.py       one-off script: refresh the bus stop cache
    handlers/
      start.py, nearme.py, favstops.py, unfavstop.py, addfavbus.py,
      favbuses.py, unfavbus.py, favouritepref.py, flow_control.py,
      addroutine.py, routines.py, setname.py, settings.py,
      search.py, callbacks.py, inline.py
  data/                   SQLite database + Telethon session file (gitignored)
```

## License

Same license as the parent [sgbus-timings](../LICENSE) repository.
