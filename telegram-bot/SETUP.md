# Setup Guide

This covers registering the bot with BotFather, getting an LTA DataMall key,
and running the bot on a Debian VPS under `tmux`.

## 1. Create the bot with BotFather

1. Open a chat with [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot` and follow the prompts:
   - Pick a display name (this is what users see, e.g. "SG Bus Timings").
   - Pick a username ending in `bot` (e.g. `sgbustimingsbot`). This is the
     `@username` used for inline mode.
3. BotFather replies with an API token that looks like
   `123456789:AAExampleTokenAbCdEfGhIjKlMnOpQrStUvW`. Save it, this goes in
   `BOT_TOKEN` in your `.env` file. Treat it like a password.

### About text and description

These show on the bot's profile page.

1. Send `/setabouttext` to BotFather, pick your bot, then send something
   short, e.g.:
   > Live Singapore bus arrival timings. Search a bus stop, find stops near
   > you, and save favourites.
2. Send `/setdescription` to BotFather, pick your bot, then send a longer
   blurb shown before a user first starts a chat, e.g.:
   > Get live bus arrival timings for any bus stop in Singapore. Type a bus
   > stop number or name to search, share your location to find nearby
   > stops, or save your regulars as favourites. Also works inline in any
   > chat, just type @yourbotusername followed by a bus stop.

### Bot profile picture (optional)

Send `/setuserpic` to BotFather, pick your bot, then upload an image.

### Commands list

Send `/setcommands` to BotFather, pick your bot, then paste:

```
start - about the bot and how to use it
nearme - find bus stops near your current location
favs - view your favourite bus stops
help - show the about message again
```

Note none of these mention the bot's own name, as requested. Users interact
with the bot by name only through Telegram's UI (chat title, `@username` in
inline mode), never through the command text itself.

### Enable inline mode

The bot supports inline queries (typing `@yourbotusername ...` in any chat),
which must be turned on explicitly:

1. Send `/setinline` to BotFather, pick your bot.
2. Send a short placeholder text shown in the input box before the user
   types anything, e.g.:
   ```
   Search a bus stop or leave blank for favourites
   ```

Inline results are marked `is_personal`, so each user only ever sees their
own favourites, never another user's.

### Privacy mode (group chats)

By default, Telegram's "privacy mode" stops a bot from seeing plain-text
messages in group chats that aren't a reply or a command. This bot's text
search relies on reading plain messages (a bus stop number or name typed
with no `/` prefix). This works out of the box in private one-on-one chats
with the bot.

If you want the same plain-text search to work when the bot is added to a
group, disable privacy mode:

1. Send `/setprivacy` to BotFather, pick your bot, choose **Disable**.

Only do this for groups you control the membership of, since a bot with
privacy mode disabled receives every message sent in the group, not just
ones addressed to it.

## 2. Get an LTA DataMall API key

1. Go to <https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html>.
2. Register with an email address and request API access. The key is free
   and arrives by email, usually within a few minutes.
3. Save the key, this goes in `LTA_ACCOUNT_KEY` in your `.env` file.

## 3. Configure the bot

```bash
cd telegram-bot
cp .env.example .env
```

Edit `.env`:

```dotenv
BOT_TOKEN=123456789:AAExampleTokenAbCdEfGhIjKlMnOpQrStUvW
LTA_ACCOUNT_KEY=your-lta-account-key
DB_PATH=./data/bot.db
WEBAPP_URL=https://sgbus.uwuapps.org/
DONATE_URL=https://donate.stripe.com/28o2akeAr3hv0DK6oo
BUS_STOPS_REFRESH_HOURS=24
```

## 4. Install and run on a Debian 13 VPS

Node.js 18+ is required (native `fetch`). `better-sqlite3` compiles a native
module, so a build toolchain and Python are needed the first time you
install dependencies.

```bash
# System packages (Node.js from NodeSource, plus a build toolchain for better-sqlite3)
sudo apt update
sudo apt install -y curl build-essential python3
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Get the code
git clone <this-repo-url> sgbus-timings
cd sgbus-timings/telegram-bot
cp .env.example .env
nano .env   # fill in BOT_TOKEN and LTA_ACCOUNT_KEY

# Install dependencies and start
npm install
npm start
```

On first run, the bot downloads the full LTA bus stop list into
`data/bot.db` before it starts polling Telegram, which normally takes under
a minute. After that, it refreshes automatically every
`BUS_STOPS_REFRESH_HOURS` hours (tracked in SQLite, so a restart doesn't
force an unnecessary re-download).

## 5. Running under tmux

Since you're running this on a VPS without a process manager, `tmux` keeps
the bot running after you disconnect:

```bash
tmux new -s sgbus-bot
cd ~/sgbus-timings/telegram-bot
npm start
```

Detach with `Ctrl+b` then `d`. The bot keeps running in the background.

To check on it later:

```bash
tmux attach -t sgbus-bot
```

To stop it, attach to the session and press `Ctrl+c`, or kill the whole
session with:

```bash
tmux kill-session -t sgbus-bot
```

### Updating

```bash
tmux attach -t sgbus-bot
# Ctrl+c to stop the running bot
git pull
npm install
npm start
# Ctrl+b then d to detach again
```

## 6. Verifying it works

1. Open a chat with your bot on Telegram and send `/start`. You should see
   the about message with "Open web app" and "Donate" buttons.
2. Type a bus stop number you know, e.g. `84009`, and confirm live timings
   come back.
3. Send `/nearme`, share your location, and confirm nearby stops appear as
   buttons.
4. Tap a stop's timings, then tap "Add favourite", then send `/favs` and
   confirm it shows up.
5. In any chat, type `@yourbotusername` followed by a bus stop number or
   name and confirm inline results appear.
