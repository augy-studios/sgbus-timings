# Moving the bot from @UwUsgbus_bot to @sgbus_app

This guide is for moving the Telegram bot to its new, shorter username, **@sgbus_app**
(help desk #13). The bot lives at **@UwUsgbus_bot** today. It covers BotFather, the `.env`
changes, the data, the cut-over order with a way back, what happens to the old bot's links,
every file in this repo that names the old bot, and testing.

Nothing in the code has been switched yet. Change the links before the new bot is live and
they break, so they're listed here (section 9) to change on the day.

**There is no forwarder and no redirect.** Augy's decision: the old bot is stopped, and he
tells people himself to switch over. Section 3 says what that means for them.

---

## What @sgbus_app is

**@sgbus_app is a new bot, made through BotFather.** Augy says a recent BotFather update lets
Telegram Premium users end a bot's username in `app`, `ai` or `agent`, as well as `bot`. I
haven't checked that rule myself. So this is a plain move from one bot to another, and
everything below applies as written. It's a separate bot with its own token, not a second name
on @UwUsgbus_bot.

If BotFather gave the new bot a slightly different username from `sgbus_app`, use that one
everywhere this guide says `sgbus_app`.

---

## 1. How the bot works, for this move

- **Telethon over MTProto, not webhooks.** `src/main.py` logs in with `BOT_TOKEN` (plus
  `API_ID` and `API_HASH`) and stays connected (`run_until_disconnected`). There is no
  webhook to move, and no polling switch: whichever process is logged in with a token gets
  that bot's updates. Two processes on the same token fight over the updates, so never run
  two copies of one bot.
- **The session file is tied to the old bot.** Telethon keeps its login in
  `data/bot.session`, next to `DB_PATH` (`SESSION_PATH = config.db_path.parent / "bot"` in
  `src/main.py`). **Trap:** if that file is still there when you start with the new
  `BOT_TOKEN`, Telethon sees an existing login and carries on as **the old bot**. It only
  prints a warning that it didn't use the token, which is easy to miss in the log. Move the old
  session file aside before the new bot's first start (step 4.3).
- **Everything a user has is keyed by `chat_id`.** In a private chat, `chat_id` is the
  user's own Telegram ID, and that's the same whichever bot they talk to. So when someone
  taps **Start** on @sgbus_app, the new bot, running on the same `data/bot.db`, already has
  their favourites, routines, places, settings and alert choices. There's nothing to import
  and no "re-link" step: their first message to the new bot *is* the re-link.
- **The username is read at run time.** `/start`'s "type @username" line
  (`src/handlers/start.py`) and the Mini App's `t.me/<bot>?startapp=` links
  (`src/mini_app.py`, `_username` from `get_me()`) follow whichever bot is running. Nothing in
  `src/` names the old bot.
- **The web app holds no Telegram token.** The site (Vercel) knows the bot only by its
  links (section 9). The `/api/sync` relay and `/api/nav` let the bot in by `BOT_API_TOKEN`,
  a secret shared with Vercel, not by which bot it is, so nothing changes on Vercel.

### 1.1 The data (`data/bot.db`)

Tables, from `src/db.py` (the schema only: rows hold real users' data, so don't copy the
database anywhere it doesn't need to be):

| Kept per chat (`chat_id`) | |
|---|---|
| `favourites`, `favourite_buses`, `favourite_routes`, `favourite_navs`, `favourite_prefs` | Favourite stops, buses, routes and navs, and top or bottom pinning |
| `saved_places` | Home, Work and own places |
| `user_settings` | Name, birthday, routine notifications on or off, has a bike, last birthday wish |
| `routines` | Scheduled timings: hour, minute, days, stop, buses, `last_fired_key` |
| `service_alert_subs` | `/sub` choices (train, traffic, newsfeed) |
| `calendar_links` | The private iCal link, as good as a password to the calendar |
| `user_flows`, `routine_drafts`, `route_drafts`, `nav_drafts` | Half-done flows; harmless to carry over |

| Shared, not per user | |
|---|---|
| `bus_stops`, `bus_services`, `bus_routes`, `calendar_places`, `jobs` | Caches, refilled from LTA and OneMap by themselves |
| `service_alert_state` | What each alerts feed looked like at the last poll |
| `buttons` | What each inline button does, by its id |

All of it carries over as it is. The one thing that doesn't is **who the bot can message**.

### 1.2 What the new bot can't do

**A bot can't message anyone who hasn't started it.** On the day you switch, @sgbus_app can
reach nobody. For each user, until they tap Start on @sgbus_app:

- **Routines** don't arrive. `_check_routines_job` (`src/main.py`) can't find the chat, logs
  `routine N failed to fire` and marks it fired, so it fails quietly every time it's due.
- **Birthday wishes** (09:00 SGT) and **Service Alerts** (`/sub`) don't arrive either.
- **Buttons on old messages** (Refresh, favourites, pages, inline results posted in other
  chats) belong to the old bot. Telegram sends their taps to @UwUsgbus_bot, never to the new
  one, and once that's stopped nothing answers them.
- **Groups**: someone in each group has to add @sgbus_app. Its favourites (by the group's
  `chat_id`) are there when they do.

With no forwarder, the old bot can't tell them. Augy tells people to switch (section 3).

---

## 2. Set up @sgbus_app in BotFather

In @BotFather, `/mybots`, pick **@sgbus_app**, then the following. They're the same as
SETUP.md section 1, for the new bot.

1. **Name**: `/setname`: `SG Bus Timings`.
2. **About** (`/setabouttext`, shown on the profile), for example:
   > Live Singapore bus arrival timings. Search a bus stop, find stops near you, plan a way
   > by bus and train, and save favourites. Formerly @UwUsgbus_bot.
3. **Description** (`/setdescription`, shown before someone first starts the chat), for
   example:
   > Get live bus arrival timings for any bus stop in Singapore. Type a bus stop number or
   > name, share your location for stops nearby, build a route between two stops, navigate
   > anywhere by bus and train, get train and traffic alerts, or save your regulars as
   > favourites. Coming from @UwUsgbus_bot? Tap Start: your favourites, routines and
   > settings are already here.
4. **Picture** (`/setuserpic`): the same as the old bot's, so people know it's the same
   thing. `main-site/sgbusicon1.png` (2475 × 2475) is the app's icon. Telegram crops it to a
   circle, so check the edges survive.
5. **Commands** (`/setcommands`). This is exactly what `src/handlers/` answers (26
   commands; `/sethome` and `/setwork` are one handler):

   ```
   start - about the bot and how to use it
   nearme - find bus stops near your current location
   favstops - view your favourite bus stops
   unfavstop - remove favourite bus stops
   addfavbus - add bus numbers to your favourites
   favbuses - view your favourite buses
   unfavbus - remove favourite buses
   favouritepref - choose top or bottom pin position for favourites
   route - build a route between two bus stops and see the buses that run it
   myroutes - view your favourite routes
   nav - get from any place to any other by bus and train
   mynavs - view your favourite navs
   alerts - train service alerts and traffic incidents right now
   sub - get train service and traffic alerts, all or disruptions only
   unsub - stop train service and traffic alerts
   addroutine - set up a routine that sends bus stop timings on a schedule
   routines - view, edit, or delete your routines
   setname - set the name the bot calls you by
   sethome - set your home, for the Home buttons in nav and route
   setwork - set your work, for the Work buttons in nav and route
   places - your home, work and other places: get there, share or change them
   addplace - save a new place, with a name of your own
   calendar - your calendar's events with a location, to plan the way there
   settings - view and change your settings
   sync - sync with the web app or the Android app, by the code its Settings shows
   done - finish whatever you're in the middle of
   cancel - cancel the current operation
   ```

6. **Inline mode** (`/setinline`): it's used (`src/handlers/inline.py`), so turn it on with
   the placeholder `Search a bus stop or leave blank for favourites`. Check what the old bot
   has for **inline feedback** (`/setinlinefeedback`) and **inline location**
   (`/setinlinegeo`), and give the new one the same.
7. **Privacy mode** (`/setprivacy`): copy whatever the old bot has. Plain-text search in
   groups only works with it **disabled** (SETUP.md, Privacy mode). It makes no difference in
   private chats.
8. **Allow groups** (`/setjoingroups`): the same as the old bot, so groups can add it.
9. **Mini App**: the menu button needs nothing; the bot sets it on every start from
   `MINI_APP_MENU_TEXT`. If the old bot has a **Main Mini App** (Bot Settings, Configure Mini
   App, `https://sgbus.uwuapps.org/`), set the same on the new one **before** turning
   `MINI_APP_LINKS` on, or the Live map's `t.me/sgbus_app?startapp=` links go nowhere.
10. **Domain** (`/setdomain`): not needed. It's for the Telegram Login Widget, and the site
    doesn't use one.
11. Keep the token BotFather gives you safe. It goes in `BOT_TOKEN` where the bot runs (on
    the server, in `telegram-bot/.env`), and nowhere else: not in a doc, a chat or a commit.

---

## 3. The plan: switch, then tell people

- **@sgbus_app becomes the real bot**, on the same server, the same code and the same
  `data/bot.db`. Users who start it find everything where they left it.
- **@UwUsgbus_bot is stopped.** It isn't kept running as a forwarder, and nothing redirects
  people to the new bot (Augy's decision). He tells them himself to switch.
- Only one bot runs at a time, so nothing in the code needs to change: no second session file,
  no second process on the database, and Service Alerts are polled by the new bot alone.
- **Never delete the old bot.** Keep the account, with its name and about text pointing at
  @sgbus_app (step 4.6), so no-one else can take the username and pose as the app.

### 3.1 What stops working, and what to tell people

Once @UwUsgbus_bot is stopped, it answers nothing. For anyone who hasn't moved:

| What | What happens |
|---|---|
| Messaging @UwUsgbus_bot, or its buttons on old messages | No reply. Nothing says it has moved |
| `@UwUsgbus_bot 84009` inline, in any chat | No results. They type `@sgbus_app 84009` |
| Routines, birthday wishes, Service Alerts (`/sub`) | Stop arriving. They start again, from @sgbus_app, once the person taps **Start** on it (section 1.2) |
| Old `t.me/UwUsgbus_bot` links, and `t.me/UwUsgbus_bot?start=sync_<code>` sync links | Open the old bot, which doesn't answer. They use `t.me/sgbus_app` |
| Groups with @UwUsgbus_bot in them | Go quiet. An admin adds @sgbus_app |

Their data isn't affected: it's still in `data/bot.db`, and it's there the moment they start
the new bot.

Because the old bot can't say where it went, the news has to come from Augy, ahead of the
switch and again on the day: wherever his users are (the Telegram groups and channels he
runs, socials, pinned posts), plus the web app's patch notes (section 9). A short message he
can post, in his own words if he'd rather:

> SG Bus Timings has a new Telegram bot: **@sgbus_app** (t.me/sgbus_app). The old
> @UwUsgbus_bot has been switched off. Tap **Start** on @sgbus_app and your favourites,
> routines, places and alerts are already there. Until you do, your routines and alerts won't
> arrive. In a group, add @sgbus_app. For inline search, type `@sgbus_app` instead.

---

## 4. Cut-over, step by step

Pick a quiet time. Routines only fire in their own minute (`due_routines` in
`src/routines.py`), so one due while no bot is running is missed, not sent late, and
birthday wishes go at 09:00 SGT. Between about 01:00 and 05:00 SGT is quietest. Allow half an
hour. Steps 4.1 to 4.5 are on the server, in the `tmux` session from SETUP.md section 6.

**Before the day:**

- Section 2 done for @sgbus_app.
- The new bot tried on its own (section 10, "Before the day"), then stopped.
- Section 9's changes ready on a branch, **not merged**.
- The message for users (section 3.1) written, and posted ahead of the day if Augy wants
  people to have warning.

**On the day:**

1. **Stop the old bot.** In `tmux attach -t sgbus-bot`, press `Ctrl+c` and wait for it to
   exit. That leaves the database whole, with nothing half-written.
2. **Back up.** In `telegram-bot/`:
   ```bash
   mkdir -p ~/sgbus-backup
   sqlite3 data/bot.db ".backup $HOME/sgbus-backup/bot-before-move.db"
   ```
   then copy `data/bot.session` to `~/sgbus-backup/` too. Both hold real users' data and the
   old bot's login, so keep them on the server, where only you can read them, and nowhere
   else.
3. **Move the old bot's login aside** (the trap in section 1):
   ```bash
   mv data/bot.session data/old-bot.session
   ```
4. **Point the bot at the new token.** In `telegram-bot/.env` on the server, set `BOT_TOKEN`
   to @sgbus_app's token. Leave `MINI_APP_LINKS` as it was if you set up the Main Mini App
   (section 2.9), or `0` until you do. Nothing else changes (section 5).
5. **Start the new bot** (`python -m src.main`) and wait for `Bot started.`. A new
   `data/bot.session` appears, logged in as @sgbus_app. From your own Telegram, start
   @sgbus_app and run section 10's quick checks: `/start`, `84009`, `/favstops` (yours
   should be there), `/routines`. **Don't go on until they work**, since what comes next tells
   everyone to move. Then detach (`Ctrl+b`, `d`).
6. **The old bot's profile, in BotFather** (`/mybots`, @UwUsgbus_bot). Optional, and a
   BotFather setting rather than code, but it's the one place the old bot can still point
   people on:
   - `/setname`: `SG Bus Timings (moved to @sgbus_app)`
   - `/setabouttext` and `/setdescription`: `SG Bus Timings has moved to @sgbus_app. Tap
     t.me/sgbus_app and your favourites, routines and settings come with you.` The
     description is what someone sees on opening the old bot's empty chat, so it reaches
     anyone who still follows an old link.
   - If it has a Main Mini App, leave it there: it's set in BotFather, not run by the bot, so
     old `startapp` links should still open the web app (not tried).
7. **Deploy the links** (section 9): merge the branch, then `dev` into `main` (that's the
   web app's deploy, and the Android and desktop apps follow, since they load the site), the
   guide, and a Linux `sgbus` release when one's next due.
8. **Tell people** (section 3.1): post Augy's message wherever his users are.

After that, the old bot stays stopped. Keep its account (section 3), and keep its token safe
like any other, in case you ever need to roll back.

### 4.1 Rollback

Up to step 8, rolling back loses nothing: the database is the same one, and anything the new
bot saved meanwhile is under the same `chat_id`s.

1. Stop the new bot (`Ctrl+c` in its `tmux` session).
2. `mv data/bot.session data/new-bot.session`, then `mv data/old-bot.session data/bot.session`.
3. Put the old `BOT_TOKEN` back in `telegram-bot/.env`.
4. Start the bot as before. It's @UwUsgbus_bot again, as it was.
5. If section 9 was deployed, revert it on `dev` and release, so the links point back.
6. If step 6 was done, put back the old bot's name, about and description in BotFather.

The database itself only needs restoring (from `~/sgbus-backup/bot-before-move.db`, with
the bot stopped) if something went wrong in it, not just because you rolled back. After
step 8 the message is out and can't be taken back, so fix forward if you can, or post a
short "not yet: stay on @UwUsgbus_bot for now".

---

## 5. Settings to change (`telegram-bot/.env`, where the bot runs)

Names only, never the values. Set them on the server, in `telegram-bot/.env` (see
`.env.example`).

| Setting | Change |
|---|---|
| `BOT_TOKEN` | **@sgbus_app's token** |
| `API_ID`, `API_HASH` | unchanged (they're the app's, from my.telegram.org, not a bot's) |
| `LTA_ACCOUNT_KEY`, `ONEMAP_EMAIL`, `ONEMAP_PASSWORD` | unchanged |
| `DB_PATH` | unchanged |
| `BOT_API_TOKEN` | unchanged (it's shared with Vercel, not Telegram) |
| `MINI_APP_LINKS` | `1` only once @sgbus_app's Main Mini App is set up, otherwise `0` |
| `WEBAPP_URL`, `MINI_APP_URL`, `MINI_APP_MENU_TEXT`, `NAV_API_URL`, `DONATE_URL`, `GUIDE_URL` | unchanged |

**Vercel:** nothing changes. The site holds no Telegram token, and `BOT_API_TOKEN` stays the
same on both sides.

---

## 6. Deep links and the web app

| Link | Who makes it | After the move |
|---|---|---|
| `t.me/<bot>` | the site's Telegram button, the guide, the README | changed to `t.me/sgbus_app` (section 9). Old links open @UwUsgbus_bot, which no longer answers |
| `t.me/<bot>?start=sync_<code>` | `main-site/js/sync.js` (`SYNC_BOT`) | changed to `sgbus_app`. A tab or phone still showing the old page keeps the old link until it reloads, and that link now goes nowhere: they open the web app again for a new one |
| `t.me/<bot>?startapp=<page>` | the bot itself (`src/mini_app.py`) | follows the running bot by itself; needs @sgbus_app's Main Mini App |
| `@<bot> 84009` inline | users | they type the new name. `@UwUsgbus_bot` gets no results |
| Telegram's **Open web app** and menu button | the bot (`setup_mini_app`) | set again on every start, for whichever bot it is |

---

## 7. What users go through

1. They see Augy's message (section 3.1), or find @UwUsgbus_bot no longer answering.
2. They open @sgbus_app and tap **Start**.
3. The new bot answers `/start`. Favourites, routines, places, `/sub`, calendar and settings
   are all already there.
4. From then on their routines, birthday wish and alerts come from @sgbus_app. Until they
   start it, none of those arrive (section 1.2).
5. In a group, an admin adds @sgbus_app (and can remove the old one).

---

## 8. A single place for the username (proposed, not done)

`src/` already reads the username from Telegram at run time, so the bot needs no change. The
web app names it in four places (section 9). It could read one constant instead (a
`TELEGRAM_BOT` in an always-loaded script, with `index.html`'s two links filled from it),
but the static links in `index.html` should stay real links for crawlers and in case the
script doesn't run, so it saves little. The guide (`docs-site/`) has a `SITE.bot` already,
but its pages say `@UwUsgbus_bot` in their text. A search and replace on the day is simpler
and safer than either, with `git grep -n -i uwusgbus_bot` to check nothing's left.

---

## 9. Every place in the repo that names the old bot

Found with `git grep -n -i "uwusgbus\|t\.me/"` on `main` at e9ce39e. Change the ones marked
**change** on the day (step 4.7), in one commit; leave the rest.

### Web app (`main-site/`): deploys with `main`, and the Android and desktop apps load it

| File:line | What | |
|---|---|---|
| `main-site/index.html:189` | The sidebar's Telegram button, `href="https://t.me/UwUsgbus_bot"` | **change** |
| `main-site/index.html:860` | Settings, Sync with the Telegram bot, **Open the bot** (`#syncBotOpen`), `href` | **change** |
| `main-site/js/sync.js:660` | `const SYNC_BOT = 'UwUsgbus_bot';` (the `?start=sync_<code>` link and its QR code) | **change** |
| `main-site/js/sgbus-core.js:31` | `const BOT = '@UwUsgbus_bot';` (the terminal's and the Linux app's `help` line) | **change** |
| `main-site/llms.txt:64` | "The Telegram bot, for chat: https://t.me/UwUsgbus_bot" | **change** |
| `main-site/PATCHNOTES.md:6` | The header's "Telegram bot: https://t.me/UwUsgbus_bot" | **change**, plus a new entry saying it moved |
| `main-site/PATCHNOTES.md:201`, `:829` | An inline example in an old entry, and "Launched at @UwUsgbus_bot" | leave: it's history |
| `main-site/PATCHNOTES.md:707`, `:734` | `uwusgbus://` app links | leave: an old Android link scheme, not the bot |
| `main-site/sw.js` | `VERSION` | **bump**, as `sgbus-core.js` and `sync.js` change |

### Guide (`docs-site/`): deployed on its own, at guide.sgbus.uwuapps.org

| File:line | What | |
|---|---|---|
| `docs-site/build.mjs:27` | `bot: "https://t.me/UwUsgbus_bot"` (the top bar's Telegram bot link) | **change** |
| `docs-site/build.mjs:368` | The sidebar link's text, `@UwUsgbus_bot` | **change** |
| `docs-site/content/README.md:15`, `:64` | The bot card's text, and "Open @UwUsgbus_bot" | **change** |
| `docs-site/content/bot/start.md:3`, `:7`, `:12`, `:13` | Description, the link, "search for UwUsgbus_bot" | **change**, and add a line: "Used @UwUsgbus_bot? Tap Start on @sgbus_app; everything's there" |
| `docs-site/content/bot/commands.md:49` | "Type `@UwUsgbus_bot`" | **change** |
| `docs-site/content/bot/inline.md:11`, `:15`, `:16`, `:17` | Inline examples | **change** |
| `docs-site/content/bot/search.md:61` | Inline example | **change** |
| `docs-site/content/help/troubleshooting.md:91` | "you are in the chat with @UwUsgbus_bot" | **change** |
| `docs-site/public/screenshots/` | Any screenshot showing the bot's name | check by eye; retake if it shows |

### Repo, bot and apps

| File:line | What | |
|---|---|---|
| `README.md:19` | `[@UwUsgbus_bot](https://t.me/UwUsgbus_bot)` | **change** |
| `cli/` | The Linux `sgbus` bundles `main-site/js/sgbus-core.js` when it's built (`cli/build.mjs`), so it says the new name from its next release | release it |
| `release/2.2.2/sgbus:34` to `release/2.2.7/sgbus` | Built releases, already out | leave |
| `telegram-bot/src/` | Nothing: the username comes from `get_me()` | none |
| `telegram-bot/SETUP.md`, `README.md`, `.env.example` | Only `yourbotusername` and `<bot>` placeholders | none; add a line to SETUP.md pointing here |
| `android/`, `desktop/` | Nothing: both load sgbus.uwuapps.org | none |
| `docs/android-app-spec.md:426` | `@<bot>`, a placeholder | none |
| `main-site/i18n/*.json` | No bot name in any language | none |
| `GOOGLE-PLAY.md` | Doesn't name the bot | none |

### Outside this repo

- `augy-assets-share/projects/sgbus/PROJECT.md:15` and
  `augy-assets-share/projects/sgbus/assets/2026-10-17-new-logo/request.md:18` (in the
  workspace) name `@UwUsgbus_bot`.
- Anywhere else you've linked the bot: the Play Store listing, links.gftv.asia, socials,
  GitHub's repo description, pinned posts.

After the change, `git grep -n -i uwusgbus_bot` should only find `PATCHNOTES.md`'s history,
`release/`, and this file.

---

## 10. Testing

### Before the day: the new bot on its own

Try @sgbus_app with a **fresh, empty database**, so no copy of real users' data is made and
the new bot can't send anyone's routines: a separate folder (a second clone of the repo), its
own `.env` with the new `BOT_TOKEN`, and `DB_PATH=./data/bot.db` there. It fills the bus
caches from LTA on its first start. Then, from your own Telegram, go through SETUP.md
section 7, steps 1 to 16. In particular:

- `/start` says "type @sgbus_app" in its inline line, and **Open web app** opens the Mini App.
- The menu button reads **Open app**.
- `@sgbus_app 84009` in another chat gives inline results.
- Settings, Sync with the Telegram bot in the web app (pointed at the new name, from the
  section 9 branch on a preview deploy) opens @sgbus_app with `/start sync_<code>` and syncs.
- With `MINI_APP_LINKS=1`, the Live map button opens `t.me/sgbus_app?startapp=map-84009`.

Then stop it and delete that folder's `data/`.

### On the day (step 4.5)

- `/start`, then `84009`: timings come back.
- `/favstops`, `/routines`, `/places`, `/settings`: yours are there, as on the old bot.
- Set a routine for two minutes away: it arrives from @sgbus_app.
- `/sub`: your alert choices are there.

### After the switch (steps 4.1 to 4.6)

- Message @UwUsgbus_bot: no reply, as expected. If you did step 4.6, open its empty chat and
  check the description points at @sgbus_app.
- From an account that hasn't started @sgbus_app, a routine that falls due doesn't arrive
  (the bot logs `routine N failed to fire` and carries on). Tap Start on @sgbus_app and the
  next one does.

### After the links are deployed (step 4.7)

- On sgbus.uwuapps.org (and in the Android app): the Telegram button and Sync's Open the bot
  link and QR code go to @sgbus_app.
- In the terminal (`sgbus` in the browser's console, then `help`): the help names @sgbus_app.
- On guide.sgbus.uwuapps.org: the top bar and sidebar links, and the bot pages.
