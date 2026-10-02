---
title: Command reference
description: Every command the bot understands, and what you can send it without one.
---

## Commands

| Command | What it does | More |
|---|---|---|
| `/start` | What the bot does, every command, and links to the web app and to donate | [Start the bot](start.md) |
| `/nearme` | Asks for your location, then lists the nearest stops | [Stops near you](nearby.md) |
| `/favstops` | Your favourite bus stops, as buttons | [Favourites](favourites.md#favourite-bus-stops) |
| `/unfavstop` | Remove favourite bus stops | [Favourites](favourites.md#favourite-bus-stops) |
| `/addfavbus` | Add bus numbers to your favourites; `/done` to finish | [Favourites](favourites.md#favourite-buses) |
| `/favbuses` | Your favourite buses; tap one for its stops | [Favourites](favourites.md#favourite-buses) |
| `/unfavbus` | Remove favourite buses | [Favourites](favourites.md#favourite-buses) |
| `/route` | Find the buses, or journeys, between two stops | [Routes and journeys](routes.md) |
| `/myroutes` | Your favourite routes | [Routes and journeys](routes.md#save-a-route) |
| `/favouritepref` | Pin favourites to the top or bottom | [Favourites](favourites.md#top-or-bottom) |
| `/addroutine` | Set up timings sent to you on a schedule | [Routines](routines.md) |
| `/routines` | See, edit or delete your routines | [Routines](routines.md#see-change-or-delete-routines) |
| `/alerts` | Train disruptions and traffic incidents right now | [Service Alerts](service-alerts.md#see-whats-happening-now) |
| `/sub` | Get Service Alerts: all updates, or disruptions only | [Service Alerts](service-alerts.md) |
| `/unsub` | Stop Service Alerts | [Service Alerts](service-alerts.md#unsubscribe) |
| `/setname` | Set or clear the name the bot calls you | [Settings](settings.md#your-name) |
| `/settings` | Your name, birthday, notifications and favourites | [Settings](settings.md) |
| `/done` | Finish what you are in the middle of | [Flows](flows.md#done) |
| `/cancel` | Stop what you are in the middle of | [Flows](flows.md#cancel) |

## Without a command

| Send | You get |
|---|---|
| A 5-digit stop code, such as `84009` | That stop's timings |
| A bus number, such as `22` | The stops on its route |
| Part of a stop's name or road, such as `bedok` | Matching stops |
| A 6-digit postal code, such as `519599` | Stops near that address |
| Your location | Stops near you |

## In any chat

Type `@UwUsgbus_bot` and a search to post timings into any chat. See
[Inline mode](inline.md).
