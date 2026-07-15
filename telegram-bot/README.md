# SG Bus Timings Telegram Bot

A Telegram bot for live Singapore bus arrival timings, built on the same
LTA DataMall data as the [sgbus-timings web app](https://sgbus.uwuapps.org/).
Written in Node.js with a local SQLite database for favourites, scheduling,
and persistent inline buttons.

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
| `/help` | Same as `/start` |

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
a result posts a live timings message with the same favourite/refresh
buttons.

## Data source

All bus stop and arrival data comes from LTA DataMall's `BusStops` and
`v3/BusArrival` endpoints. The bus stop list is cached locally in SQLite and
refreshed automatically on a schedule (see `BUS_STOPS_REFRESH_HOURS` in
`.env`); arrival timings are always fetched live.

## Running it

See [SETUP.md](SETUP.md) for full instructions, including registering the
bot with BotFather. Quick start:

```bash
git clone <this-repo-url>
cd sgbus-timings/telegram-bot
cp .env.example .env
# fill in BOT_TOKEN and LTA_ACCOUNT_KEY in .env
npm install
npm start
```

For running on a VPS under `tmux`, see the "Running under tmux" section in
[SETUP.md](SETUP.md).

## Project layout

```
telegram-bot/
  src/
    index.js          entrypoint: wires up handlers, scheduler, launches the bot
    config.js          reads and validates .env
    db.js               SQLite connection and schema
    lta.js               LTA DataMall API client
    busStops.js         bus stop cache, search, nearest-stop lookup
    favourites.js         per-user favourites (SQLite)
    buttons.js            persistent inline-button registry (SQLite)
    scheduler.js         SQLite-backed periodic job runner
    format.js             MarkdownV2 message formatting
    reply.js               MarkdownV2 send/edit helpers with plain-text fallback
    stopView.js            builds a stop's timings message + keyboard
    listView.js             builds a list-of-stops keyboard
    refreshStops.js         one-off script: refresh the bus stop cache
    handlers/
      start.js, nearme.js, favs.js, search.js, callbacks.js, inline.js
  data/                   SQLite database file lives here (gitignored)
```

## License

Same license as the parent [sgbus-timings](../LICENSE) repository.
