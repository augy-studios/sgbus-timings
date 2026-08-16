# SG Bus Timings Telegram Bot

A Telegram bot for live Singapore bus arrival timings, built on the same
LTA DataMall data as the [sgbus-timings web app](https://sgbus.uwuapps.org/).
Written in Python with [Telethon](https://docs.telethon.dev/), using a local
SQLite database for favourites, scheduling, and persistent inline buttons.
Timings are sent as real Telegram rich messages (Bot API 10.1+) - proper
headings and tables, not a Markdown approximation.

## What it does

- Look up live bus arrival timings for any bus stop, by number or by name.
- Send a bus number to browse every stop along its route, with your
  favourited stops given pages of their own up front.
- Narrow any stop's timings down to a single bus, picked from a grid of every
  service that calls there.
- Follow a service on from where you are - every stop it still calls at,
  through to the terminus.
- Find the bus stops nearest to your current location, by sending your location
  or with `/nearme`.
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
| `/nearme` | Asks for your location, then lists the nearest bus stops as buttons - sending a location does the same thing without the command |
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
| `/done` | Finishes whatever multi-step flow the chat is in the middle of |
| `/cancel` | Stops whatever multi-step flow the chat is in the middle of |

### Paginated lists

Any list too long for one screen (bus stops along a route, favourite buses,
routines, and so on) is split into pages with a **◀ Prev · 2/5 · Next ▶** row
underneath. The row wraps around, so there's never a dead end: on the first
page the left button jumps to the last page (**◀ Last**), and on the last page
the right button jumps back to the first (**First ▶**).

### Multi-step flows

Some commands ask a question and wait for the reply - `/addfavbus` collecting
bus numbers, `/addroutine` walking through time, frequency and stop, `/settings`
asking for a name or birthday. While one of those is in progress the chat is
"in a flow", and `/done` and `/cancel` apply to whichever one it happens to be:

- `/cancel` always works. It stops the flow and clears anything it had half
  built (a part-finished routine draft, say), replying with what it stopped -
  "Cancelled setting up a routine."
- `/done` works on flows there's something to finish. `/addfavbus` saves buses
  as you send them, so `/done` reads back the resulting list. The wizards need
  every answer before they can save anything, so there's nothing to finish
  early - `/done` says as much and points at `/cancel`.
- With nothing in progress, both say so and do nothing.

Neither command knows anything about any individual flow. A flow declares
itself to `src/flows.py` next to its own handler:

```python
FLOW = register_flow(Flow(
    name="add_fav_bus",
    description="adding favourite buses",   # completes "Cancelled ..."
    finish=_finish,                         # what /done replies; omit if it can't finish early
    cleanup=clear_draft,                    # other state to drop, whichever way it ends
))
```

so any command added later gets both commands' behaviour by registering, with
nothing to change in `/done` or `/cancel` themselves. A flow name may carry a
per-step suffix after a colon (`settings_edit:birthday`) when one flow covers
several fields; the registry looks past it. A flow left in the database by an
older version of the bot resolves to nothing registered, and both commands just
clear it rather than leaving the chat stuck mid-flow.

### Searching for a bus stop or a bus

You don't need a command to search. Just type into the chat:

- A bus stop number, e.g. `84009`, to jump straight to it.
- A bus number, e.g. `22`, `971E` or `NR7`, to browse the stops that service
  visits (see [Bus routes](#bus-routes) below).
- Part of a bus stop's name or road, e.g. `bedok` or `changi`, to see a list
  of matching stops as buttons.

Bus stop numbers and bus numbers never collide: a bus stop number is always
exactly 5 digits, while a bus number is shorter and may contain letters, so
the bot can tell which one you meant without asking. Bus numbers are matched
against LTA's live service list, and anything that isn't a real service falls
through to the name search.

If there's exactly one match, the bot shows its live timings immediately. If
there's more than one, tap the bus stop you meant from the list.

Picking one off that list isn't a one-way door: the timings that open carry a
**🔙 Back** button as the very last row, which puts the same list of matches
back on screen to pick from again. The list is rebuilt against the current
cache each time, so names and favourite stars are up to date, and the way back
survives refreshing, favouriting, or narrowing the view down to a single bus.

### Bus routes

Sending a bus number - or tapping a bus in `/favbuses` - shows the stops that
service visits, as a paginated list of buttons. Tapping a stop opens a timings
view filtered to just that service, with a **💯 All services** button to widen
it back out to the whole stop, and a **🔙 Back to bus stop selection** button
returning to the stop list - on the same page, and in the same direction, that
the stop was tapped from.

Widening the view doesn't throw the first button away: it stays put and turns
into **🔼 Collapse view**, dropping back to just the one service, so the two
readings of the stop are a tap apart either way. Refreshing or favouriting keeps
whichever of the two you're looking at, along with the way back to the stop
list.

While the view is down to the one service, it also offers **🛣 View route from
here** - the rest of that service's run onward from the stop you're at (see
[Following the route on from here](#following-the-route-on-from-here)). Where
the stop list covers the route end to end, that one covers only what's still
ahead of you.

Above the buttons, the message names where the service starts and ends: either
`🚏 Origin → Destination` (with `(and back)` appended if it runs the reverse
direction too), or, for a loop service, `🔁 Loop service, starting and ending
at ...` along with the point it loops at. Terminals come from LTA's bus service list, falling back to the ends
of the cached route if LTA doesn't report them.

Under that is a `🗺` line tracing the route through its landmarks, so you
can see where the bus actually goes at a glance:

```
🗺 Pasir Ris Int → Tampines Stn → Kallang Stn → Farrer Pk Stn → ...
```

Landmarks are the interchanges, bus terminals, MRT/LRT stations and hospitals
along the direction being shown, in travel order - stops that only look the part
are left out, whether they're a `Stn` that isn't a rail station (`Airport Police
Stn`, `Central Fire Stn`, pumping stations and the like) or a road named after
one (`Aft Hosp Dr` is Hospital Drive, not a hospital). Each one is named as the
landmark rather than as the stop
that serves it, so the side of the road and the exit are trimmed off
(`Opp Tampines Stn/Int` and `Tampines Stn Exit B` both read as `Tampines Stn`).
Consecutive stops for the same landmark are collapsed into one, and long routes
are thinned down to at most ten evenly-spread landmarks, always keeping both
ends.

Your favourited stops along that route get pages of their own, before the rest
of the list (or after it, if `/favouritepref` is set to "bottom"), so the ones
you actually use are a tap away on a long route. The pages that follow list the
entire route in the order the bus travels, with those favourited stops still in
their proper positions along it, starred (⭐).

A service that runs both ways gets an **↔️ Swap Directions** button under the
pager, which turns the route around: the stop buttons list the return direction
first, and the `🚏` and `🗺` lines above them describe that direction instead.
Swapping starts again at page 1, since the two directions don't line up page for
page. Loop services don't get the button - they only ever run one way.

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

Underneath those two sit whichever of the buttons below apply to the view you're
looking at, with any **🔙 Back** always last, so the way out of a screen is
always in the same place.

#### Picking a single bus at the stop

Unless you arrived from a bus number - in which case the view is already down to
one service, and **🔙 Back to bus stop selection** is the button on offer - the
message carries a **🚌 Select Bus Number** button, in the expanded view as well
as the collapsed one. Tapping it swaps the keyboard for a grid of every service
that calls at the stop, four across and five rows deep, so even an interchange
is a page or two rather than a long scroll through them. Favourite buses are
starred and pinned to the top or bottom per `/favouritepref`, the same way they
are in the timings themselves.

Tap one and the message comes back showing only that service's timings, with
**Select Bus Number** still there to pick a different one; **🔙 Back to
timings** leaves the stop as it was. The grid is built from the cached route
data rather than from live arrivals, so a service that isn't running right now
is still there to pick.

#### Following the route on from here

Any timings view narrowed to a single bus carries a **🛣 View route from here**
button - however you got there, whether from a bus number, from **Select Bus
Number**, or from another route list. It lists, as paginated buttons, every stop
that service still calls at: the one you're standing at first, then the rest of
the run through to the terminus, under a heading counting what's left
(`🏁 27 stops to go, ending at Changi Village Ter (99009)`).

It follows whichever direction you're already looking at, falling back to the
other one for a stop that direction doesn't serve. Favourited stops are starred,
tapping any stop down the line opens its timings for the same service - so you
can walk the route ahead a stop at a time - and **🔙 Back to timings** returns
to where you started. At a terminus there's nothing ahead, and the button says
so rather than opening an empty list.

### Favourite buses

Send `/addfavbus`, then type bus numbers (space or comma separated, across
as many messages as you like) - each one is validated against LTA's live
service list and confirmed as saved. Send `/done` when finished, or `/cancel`
to abort.

`/favbuses` shows your favourite buses as paginated buttons; tapping one opens
that service's stops, exactly as sending its bus number does (see
[Bus routes](#bus-routes)). `/unfavbus` shows the same paginated buttons but
tapping one removes it instead.

`/unfavstop` does the paginated-removal equivalent for favourite bus stops
(the star toggle on a stop's timings view still works too).

### Nearest stops

`/nearme` asks Telegram for your location (via the native "share location"
button, so your coordinates never go through free text). The bot then shows
up to 8 nearby bus stops as buttons, each labelled with the stop name,
number, and distance in metres, sorted by distance within your `/favouritepref`
pin position (favourites first by default, or last if you've set it to
"bottom"). As with a name search, the timings a stop opens carry a **🔙 Back**
button returning to the list.

The command is only ever a shortcut to that share button - any location sent to
the bot is answered with the stops near it, whether `/nearme` asked for it or
not - so `/nearme` says as much when you use it.

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
    bus_services.py        bus service cache: number validation, terminals, loop info
    bus_routes.py          bus service <-> stop cache (which stops a service visits)
    favourites.py          per-user favourite bus stops (SQLite)
    favourite_buses.py     per-user favourite bus numbers (SQLite)
    favourite_prefs.py     per-user pin position (top/bottom) per favourite kind
    flows.py               per-user multi-step flow state (SQLite) + the flow registry /done and /cancel work off
    routines.py             per-user scheduled routines (SQLite)
    routine_drafts.py       per-user in-progress routine wizard state (SQLite)
    frequency.py            parses/formats routine frequency (daily/weekdays/weekends/day list)
    time_of_day.py          parses time-of-day input; time-of-day greeting text
    user_settings.py        per-user custom display name, birthday (+ wish tracking), notification preference (SQLite)
    pagination.py          generic paginated inline-keyboard helper (flat or sectioned)
    buttons.py             persistent inline-button registry (SQLite)
    scheduler.py           SQLite-backed periodic job runner (asyncio)
    format.py              rich-message Markdown formatting (headings + tables)
    reply.py               rich-message send/edit helpers with plain-text fallback
    stop_view.py           builds a stop's timings message + keyboard
    list_view.py           builds a list-of-stops keyboard (with favourite pinning), and the context a stop view goes back by
    stop_buses_view.py     builds the grid of every bus number serving a stop
    bus_route_view.py      builds a service's paginated stop keyboards: the whole route, or the rest of the run from one stop
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
