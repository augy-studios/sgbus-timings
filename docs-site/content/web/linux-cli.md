---
title: The command line on Linux
description: sgbus, SG Bus Timings in a Linux terminal: timings, search, routes, Navigate, favourites, routines, service alerts and the weather, on a desktop, a server or a Raspberry Pi.
---

**sgbus** is SG Bus Timings in a terminal, for Linux: everything the web app and the
[Telegram bot](../bot/start.md) do that doesn't need a screen. It works on a desktop, over
SSH on a server, or on a Raspberry Pi, and finds the same journeys as the web app, as it runs
the same route planner and search.

## Install it

It needs Node.js 18 or newer. Debian 12 and later and Ubuntu 24.04 and later have it; on
Ubuntu 22.04, install Node.js 20 from [NodeSource](https://github.com/nodesource/distributions)
first.

**Debian, Ubuntu, Mint, Raspberry Pi OS**: download
`sg-bus-timings-cli-2.2.4-all.deb` from the
[latest release](https://github.com/augy-studios/sgbus-timings/releases/latest), then:

```bash
sudo apt install ./sg-bus-timings-cli-2.2.4-all.deb
```

**Any other Linux**, or without `sudo`: it's one file.

```bash
mkdir -p ~/.local/bin
curl -Lo ~/.local/bin/sgbus https://github.com/augy-studios/sgbus-timings/releases/latest/download/sgbus
chmod +x ~/.local/bin/sgbus
```

`sgbus help` lists everything, and `sgbus update` gets a newer version.

## Its own prompt

<figure>
<img src="/screenshots/web/cli-prompt.png" alt="A terminal: sgbus on its own opens a prompt, sgbus>, with a welcome; at it, 84009 14,60 shows Bedok Int's 14 and 60, and nav home 84031 lists nine ways from Home to Bedok Stn Exit B with the first step by step; then exit." width="881" height="731" loading="lazy">
<figcaption>sgbus on its own: type each command without it, like a chat with the bot.</figcaption>
</figure>

Type `sgbus` on its own and it opens a prompt of its own, `sgbus>`, where each command
goes without `sgbus` in front: `84009`, `nav home work`, `favs`. Up and down bring back
what you typed before, even from last time, and Tab finishes a command or a place's
name. Ctrl+C stops timings kept on screen with `-w` and goes back to the prompt.
`help` lists the commands, and `exit` or Ctrl+D leaves. Everything below works there as
it does on its own line.

## A stop's timings

<figure>
<img src="/screenshots/web/cli-timings.png" alt="A terminal: sgbus 84009 '22*' lists Bedok Int's buses starting 22, 222 starred as a favourite, each with its next three buses in green; then sgbus 66271 136 73 -d lists 73 out to Lor 6 Toa Payoh and back to Ang Mo Kio Int, and 136 to Ang Mo Kio Int and to Punggol Int, each way in its own colour, with the operator, decks, and first and last bus under each." width="619" height="427" loading="lazy">
<figcaption>A stop narrowed to the 22s, and a stop where buses go both ways.</figcaption>
</figure>

Type the stop's code: `sgbus 84009`. Each bus has its next three, coloured by how full they
are: green for seats, yellow for standing, red for little room. Your favourite buses are
starred and come first.

- **Some buses**: `sgbus 84009 174,175`, or `sgbus 84009 '22*'` for every bus starting with
  22, as in [the web app](search.md#a-few-buses-at-once).
- **More detail**: `-d` adds each bus's operator, its decks, and its first and last bus.
- **Keep them on screen**: `-w` refreshes them every 30 seconds, like a departures board.
  `-w 15` for every 15. Ctrl+C stops it.

Not sure of the code? `sgbus bedok int` finds a stop by name or road, with LTA's short forms
(`bukit batok` finds Bt Batok), `sgbus 'Bedok MRT'` lists the stops at a station, and
`sgbus 519599` the stops nearest a postal code. `sgbus 22` shows bus 22's route.

## Getting somewhere

<figure>
<img src="/screenshots/web/cli-nav.png" alt="A terminal: sgbus nav home 'Bedok Mall' lists eleven ways from 1 Pasir Ris Close to Bedok Mall, quickest first, such as bus 12 then the East-West Line in about 31 minutes, then way 1 step by step: a walk to Opp Downtown East, bus 12 with its next three buses, a walk to Pasir Ris MRT Station, the East-West Line to Bedok, and the walk to Bedok Mall." width="709" height="528" loading="lazy">
<figcaption>Navigate from Home, with the first way step by step and its bus's live timings.</figcaption>
</figure>

`sgbus nav <from> <to>` is [Navigate](nav.md), by bus and train from anywhere to anywhere.
Either end can be an address, a building, a postal code, a station, a stop's code, or one of
your places by name, such as `home`. The first way comes step by step, with live timings for
its buses; `--way 3` shows the third instead.

<figure>
<img src="/screenshots/web/cli-route.png" alt="A terminal: sgbus route 98101 95099 --show 1 notes the quickest buses leave from the stop across the road, lists five journeys such as 89 on its own in about 26 minutes, each getting off at SAF Ferry Ter, then the first step by step with bus 89's next buses and when you'd arrive." width="1037" height="488" loading="lazy">
<figcaption>The route planner, bus only, with the first journey step by step.</figcaption>
</figure>

`sgbus route <start> <end>` is the [route planner](route-planner.md), bus only, stop to
stop: the buses that run straight between them, or the quickest journeys with a change.
`--show 1` takes the first step by step.

For another time, add `--leave 08:30` or `--arrive 6pm`, and `--day tomorrow`, a weekday or a
date. `--save` keeps a route or a nav: `sgbus routes` and `sgbus navs` list them, and
`sgbus routes 1` plans the first again. With **Restricted areas** on (`sgbus settings
restricted on`), both can use the stops inside Changi Airport's cargo area and at MINDEF, as
in the web app's [Settings](settings.md).

Across the Causeway, both count time to clear immigration at the checkpoints, and show it as
a step, as [Navigate does](nav.md#across-the-causeway): by the time of day, or your own with
`sgbus settings customs 30` (15, 30, 45 or 60; `auto` goes back).

## Favourites, places and routines

<figure>
<img src="/screenshots/web/cli-saved.png" alt="A terminal: sgbus routines lists one, 07:45 on weekdays at Bedok Int for 14 and 60; then sgbus weather shows today's temperatures, the weather now, the chance of rain, PSI and PM2.5 by region, and the next few hours." width="922" height="305" loading="lazy">
<figcaption>A routine, and today's weather.</figcaption>
</figure>

| Command | What it does |
|---|---|
| `sgbus fav add 84009` | Saves a stop. `sgbus fav rm` removes it, `sgbus fav bus add 14` saves a bus. |
| `sgbus favs` | Every favourite stop's timings at once. `-w` keeps them on screen. |
| `sgbus place set home 519599` | Sets Home, Work, or a place of your own (`sgbus place set Gym 'Our Tampines Hub'`). `sgbus places` lists them. |
| `sgbus routine add 84009 07:45 --buses 14,60` | A [routine](../bot/routines.md): the stop's next buses at 7:45, on weekdays unless `--days` says otherwise (`weekends`, `daily`, `mon,wed,fri`). `--buses 22*` takes every bus starting 22. `sgbus routines` lists them; `sgbus routine edit 1 --time 08:00` changes one. |
| `sgbus alerts` | Train disruptions and traffic incidents, as in [Service alerts](service-alerts.md). |
| `sgbus weather` | Today's weather, PSI and PM2.5, as the web app's [weather button](weather.md). |
| `sgbus calendar set <link>` | Links your [calendar](calendar.md) by its private iCal link. `sgbus calendar` lists your events with a place, and `sgbus calendar nav 1` plans the way to the first, to arrive by its start. |
| `sgbus settings` | Where favourites pin, Restricted areas, and Immigration time (`customs`). |

Routines arrive as desktop notifications once their timer is on. From the `.deb`, once:

```bash
systemctl --user enable --now sgbus-routines.timer
```

From the single file, or without systemd, run `sgbus routine run --notify` from cron every
minute. Notifications need `notify-send` (`sudo apt install libnotify-bin`); without it,
they're printed.

What you save is kept on this computer, in `~/.config/sgbus/config.json`. It doesn't
[sync](sync.md) with your other devices or the bot yet.

> [!TIP]
> Add `--json` to a command for its data instead of the text, for your own scripts:
> `sgbus 84009 14 --json`. `NO_COLOR=1` turns the colours off.

## In a browser's console

Most of the same commands work in the web app itself, with nothing to install:
open your browser's developer tools (**F12**, or **Ctrl+Shift+J**; **⌥⌘J** on a
Mac) on [sgbus.uwuapps.org](https://sgbus.uwuapps.org), and type each one as
`sgbus('...')`:

```js
sgbus('84009 22*')        // a stop's timings, narrowed to buses starting 22
sgbus('favs -w')          // your favourite stops, kept up to date
sgbus('nav home work')    // by bus and train, between two of your places
sgbus('help')             // the rest
```

It takes a stop's timings (with `-w` and `-d`), finding stops, `near`, `bus`,
`nav` (with `--way N`), `favs`, `fav add` and `fav rm`, `places`, `alerts` and
`weather`, and `--json` hands back the data to look through. It uses what's saved
in that browser, so `sgbus('fav add 84009')` saves the stop in the web app too.
Routines, the route planner, the calendar and settings stay in the app and here.

> [!WARNING]
> Never paste code into the console that someone else sent you. Anything typed
> there runs as you, with your saved stops and places. `sgbus('...')` only ever
> reads your words as a command, never as code.
