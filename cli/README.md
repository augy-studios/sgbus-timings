# SG Bus Timings in the terminal

`sgbus`, the command-line edition for Linux: everything the site and the Telegram bot do
that needs no screen. A stop's timings, search, a bus's route, the route planner, Navigate,
favourites, places, routines, service alerts, the weather and your calendar. It shares the
apps' version number, and goes on the same GitHub release.

It needs only Node.js 18 or newer, so it runs anywhere Node does: a server over SSH, a
Raspberry Pi, any distribution. No key, no account: the data is the site's own public
`/api/*`.

## Install

**Debian, Ubuntu, Mint, Raspberry Pi OS** (any architecture):

```bash
curl -LO https://github.com/augy-studios/sgbus-timings/releases/latest/download/sg-bus-timings-cli-2.2.2-all.deb
sudo apt install ./sg-bus-timings-cli-2.2.2-all.deb
```

Debian 12 and later and Ubuntu 24.04 and later have a new enough Node.js. On Ubuntu 22.04,
install Node.js 20 from [NodeSource](https://github.com/nodesource/distributions) first.

**Anything else** (Fedora, Arch, a home folder without sudo): one file.

```bash
mkdir -p ~/.local/bin
curl -Lo ~/.local/bin/sgbus https://github.com/augy-studios/sgbus-timings/releases/latest/download/sgbus
chmod +x ~/.local/bin/sgbus
```

`sgbus update` gets a newer version: the single file replaces itself, and the `.deb` says
which to download.

## Use

```text
sgbus 84009                      Bedok Int's timings
sgbus 84009 174,175              just those buses; sgbus 84009 '22*' every bus starting 22
sgbus 84009 -w                   on screen, refreshed every 30 seconds (-w 15 for 15)
sgbus bedok int                  find a stop by name or road; sgbus 'Bedok MRT' a station's
sgbus 519599                     the stops nearest a postal code
sgbus 22                         bus 22's route; sgbus bus 9 --from 84031 from a stop on
sgbus route 84009 66009          the route planner, bus only; --show 1 for a journey's steps
sgbus nav "Bedok Mall" home      Navigate, bus and train; --way 2 for another way's steps
sgbus nav home work --arrive 9am --day tomorrow
sgbus favs                       every favourite stop's timings
sgbus alerts                     train disruptions and traffic incidents
sgbus weather                    today's weather, PSI and PM2.5
sgbus help                       the rest
```

Saving: `sgbus fav add 84009`, `sgbus fav bus add 14`, `sgbus place set home 519599`, and
`--save` on a route or a nav (`sgbus routes`, `sgbus navs` list them; `sgbus routes 1` plans
the first).

**Routines**, your stop's buses at a time on the days you pick, as desktop notifications:

```bash
sgbus routine add 84009 07:45 --days weekdays --buses 14,60
systemctl --user enable --now sgbus-routines.timer     # once, from the .deb
```

Without systemd, or from the single file, run `sgbus routine run --notify` from cron every
minute. Notifications need `notify-send` (`libnotify-bin`); without it they're printed.

**Your calendar**: `sgbus calendar set <private iCal link>`, then `sgbus calendar` lists your
events with a location, and `sgbus calendar nav 1` plans the way to the first, arriving by
its start. The link goes to the site's `/api/calendar` to be read, as on the web, and isn't
kept there.

`--json` gives the data instead of the text, for scripts. `NO_COLOR=1` turns off colour.

What you save is kept in `~/.config/sgbus/config.json` (or `$XDG_CONFIG_HOME/sgbus/`), and the
stop and route lists in `~/.cache/sgbus/` for 12 hours. It doesn't sync with the apps or the
bot yet.

## How it's made

`sgbus.js` is the whole command. It runs the site's own code for the route planner, stop
search with LTA's short forms, stations, train line names and reading iCal
(`main-site/js/when.js`, `network.js`, `journeys.js`, `contractions.js`,
`station-search.js`, `mrt-stations.js`, `calendar.js`) in a sandbox standing in for a
browser, so it finds what the web app finds. In this repository it reads them from
`main-site/js`, so `node cli/sgbus.js 84009` works as it is.

`node build.mjs` (from `cli/`) puts those scripts inside one file and builds the Debian
package, an `ar` archive written in plain Node, so it builds on Windows too:

| File | What |
|---|---|
| `release/<version>/sgbus` | The single file, for any Linux with Node.js 18 |
| `release/<version>/sg-bus-timings-cli-<version>-all.deb` | `/usr/bin/sgbus`, the routines' systemd user timer (`linux/`), bash completion |

Raise `version` in `package.json` with the apps' (the build refuses to run if it differs from
`desktop/package.json`), build, and attach both files to the release (`release/README.md`).
`SGBUS_SITE=http://127.0.0.1:8766` points it at another copy of the site, such as
`docs-site/screenshots/serve.cjs`.
