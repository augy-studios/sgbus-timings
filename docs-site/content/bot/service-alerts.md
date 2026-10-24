---
title: Service Alerts
description: Use /sub to be sent train disruptions, traffic incidents and the newsfeed of bus and train notices, and /alerts to see them now.
---

Service Alerts keep you up to date on what throws a bus journey off: train
disruptions, which send crowds onto buses and bring in free bridging buses,
traffic incidents on the roads, and the newsfeed of changes LTA and the operators
announce ahead of time.

## Subscribe

1. Send `/sub`.
2. The bot confirms you're subscribed, with three rows of buttons under its
   reply: train service alerts, traffic alerts and the newsfeed, each **All**,
   **Disruptions** (**Changes** for the newsfeed) or **Off**. The choice in force
   has a tick.
3. Tap what you want for each. You can change any of them at any time.

| | All | Disruptions |
|---|---|---|
| **Train service alerts** (MRT and LRT) | Every change to train services, including new service notices. | A train disruption starting, changing or clearing. |
| **Traffic alerts** (roads and buses) | Every new traffic incident anywhere in Singapore. | New incidents that can block or reroute a bus: accidents, vehicle breakdowns, road blocks, diversions, obstacles, fires and plant failures. |
| **Newsfeed** (LTA and the operators) | Every new notice from LTA and every new piece of news from SBS Transit, SMRT, Tower Transit and Go-Ahead Singapore. | New notices that change a bus or train service: diversions, closures, new and changed services, not fares or awards. |

You start on **All** for trains and traffic, with the newsfeed off. Sending
`/sub` again shows the buttons without changing anything, and turning them all
off unsubscribes you.

> [!WARNING]
> Traffic **All** is busy. Singapore's roads report new incidents all day, so
> expect many messages. **Disruptions** is the quieter choice for most people.

## What arrives

The bot checks LTA once a minute. When something changes, you get one message
with whatever applies to you:

- **Train service update**: every line with a problem, whether it's disrupted
  or delayed, the direction, the stations affected, and where free buses and
  shuttles run. When a disruption clears, the update says all services are
  running normally.
- **New traffic incidents**: each one as LTA describes it, starting with when
  it was reported, such as "(2/10)18:01 Accident on PIE (towards Tuas) after
  Jalan Eunos Exit." A long list is cut at 15, with a count of the rest.

- **Newsfeed**: the new notices, each with who it's from, its dates and a link,
  checked every quarter of an hour.

## See what's happening now

Send `/alerts` at any time. It shows the train summary, the incidents that can
block or reroute a bus, a count of the others by type, and the newsfeed: LTA's
notices for today and the next two weeks, with their buses, and the operators'
latest news. **Refresh** brings it up to date. You don't need to be subscribed.

A stop's timings say when its buses skip it today or tomorrow, as on the
[web](../web/service-alerts.md#the-newsfeed): "⚠️ Today: 97, 106, 133 skip this
stop, First Bus to 8.30am."

## Unsubscribe

Send `/unsub`. Nothing more is sent until you send `/sub` again. Tapping one of
the buttons under an old `/sub` reply also subscribes you again, with that choice.

Service Alerts are separate from [routines](routines.md): turning **Routine
notifications** off in `/settings` doesn't stop them. `/settings` shows which
choice you're on for trains and traffic, or Off.

## Also on the web

The [web app](../web/service-alerts.md) has the same three choices as
notifications on your phone or computer, and the same card showing what's
happening now.
