---
title: Service alerts
description: See train disruptions and traffic incidents, and get notified about them even with the app closed.
---

Service alerts cover the two things that throw a bus journey off: trains, whose
disruptions send crowds onto buses and bring in free bridging buses, and the
roads the buses run on.

## See what's happening now

<figure>
<img src="/screenshots/web/service-alerts-now.png" alt="The Service alerts card: notification choices at the top, then Trains, with all train services running normally and LTA's notices, and Roads, counting the incidents across Singapore and listing those that can block or reroute a bus." width="994" height="697" loading="lazy">
<figcaption>Trains and roads, as LTA reports them right now.</figcaption>
</figure>

Tap **Service alerts** under the search box. A card opens with two parts.

**Trains** says either that every train service is running normally, or, for
each line with a problem:

- whether it's disrupted or just delayed, and in which direction;
- the stations affected;
- where free buses and free shuttles are running, if LTA lists them;
- LTA's service notices, such as planned early closures.

**Roads** counts the traffic incidents LTA reports across Singapore. Those that
can block or reroute a bus, accidents, breakdowns, road blocks, diversions,
obstacles, fires and plant failures, are listed in full. The rest, such as heavy
traffic and roadworks, are counted by type; **Show the other** lists them too.

Tap **Refresh** to fetch the latest. The card never shows a saved copy, so
without a connection it says it couldn't reach LTA instead.

While a train line is disrupted or delayed, a red bar along the top of the site
also says so, without opening the card: see [Disruptions bar](disruptions-bar.md).

## Get notified

<figure>
<img src="/screenshots/web/service-alerts-notify.png" alt="Notify me, even with the app closed: Train service alerts and Traffic alerts, each with Off, All updates and Disruptions only, and a note that notifications are off." width="970" height="217" loading="lazy">
<figcaption>Train and traffic alerts are chosen separately.</figcaption>
</figure>

Under **Notify me, even with the app closed**, train and traffic alerts are
chosen separately, each **Off**, **All updates** or **Disruptions only**:

| | All updates | Disruptions only |
|---|---|---|
| **Train service alerts** (MRT and LRT) | Every change to train services, including new service notices. | A train disruption starting, changing or clearing. |
| **Traffic alerts** (roads and buses) | Every new traffic incident anywhere in Singapore. | New incidents that can block or reroute a bus: accidents, breakdowns, road blocks, diversions, obstacles, fires and plant failures. |

So you can, say, hear about every train disruption but only the traffic that can
hold up a bus, or turn traffic off altogether. LTA publishes no feed of bus
service changes, so road incidents are how bus disruptions show up.

The first time, your browser asks whether the app may send notifications; allow
it. The note under the buttons then says what you'll be notified of.

> [!WARNING]
> Traffic **All updates** is busy. Singapore's roads report new incidents all
> day, so expect many notifications. **Disruptions only** is the quieter choice
> for most people.

Tapping a notification opens the app on the Service alerts card. A new alert
replaces the one before it in your notification tray rather than piling up.

### Which devices can get them

- **Android:** in Chrome, Edge or Samsung Internet, in a tab or as an installed
  app.
- **iPhone and iPad:** only from the app [added to your Home Screen](install.md#iphone-and-ipad),
  opened from there. Safari tabs can't receive notifications.
- **Computers:** while the browser is running, even with the tab closed.

## Turn them off

Pick **Off** for both. The app tells the alerts server to forget this device. To stop the
browser asking again, you can also block notifications for sgbus.uwuapps.org in
your browser's site settings, and the app turns the setting off by itself the
next time it opens.

## Also in Telegram

The [Telegram bot](../bot/service-alerts.md) has the same two options, with
`/sub`, and the same rules for what counts as a disruption.
