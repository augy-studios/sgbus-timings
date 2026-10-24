---
title: Settings
description: Set the name the bot calls you, your birthday, your home and work, and whether routines are sent.
---

Send `/settings` to see everything the bot keeps for you, with buttons to
change it:

- **Name**: what the bot calls you, or "not set".
- **Birthday**: the date it has saved, or "not set".
- **Home** and **Work**: the places saved for them, or "not set".
- **Routine notifications**: Enabled or Disabled.
- **Service Alerts**: your choice for trains and for traffic, or Off. Change it with
  `/sub` and `/unsub`; see [Service Alerts](service-alerts.md).
- **Favourite buses** and **Favourite bus stops**: what you have saved, and
  whether each is pinned to the top or bottom.

## Your name

Tap **Set name** and reply with the name you would like, up to 64 characters.
Until you set one, the bot uses your Telegram first name.

`/setname` does the same in one go:

| Send | What happens |
|---|---|
| `/setname` | Tells you what the bot calls you now |
| `/setname Sam` | The bot calls you Sam |
| `/setname clear` | Back to your Telegram first name |

The name is used in [routine](routines.md) greetings and birthday wishes.

## Your birthday

Tap **Set birthday** and reply with the date, in nearly any common format:
`1998-04-23`, `23/04/1998`, `23 Apr 1998` or `Apr 23rd 1998`. If the bot cannot
read it, it asks again.

On your birthday, at 9 AM Singapore time, the bot sends you a happy birthday
message, every year. **Clear birthday** removes it.

## Home and Work

Tap **Set home** or **Set work**, or send `/sethome` or `/setwork`, then reply
with the place: an address, a building, a postal code, an MRT station, a bus
stop, a Google Maps link, GPS coordinates or a plus code, picked from the
suggestions if there are several. Or
tap **Send my location** to save where you are now, named Home or Work.

The `/nav` and `/route` panels ([Navigate](nav.md#home-work-and-your-places),
[Routes](routes.md#home-and-work)) then have **🏠 From home**, **💼 From work**, **🏠 To home** and **💼 To work**
buttons. **Clear home** and **Clear work** remove them.

Other places you go often, named as you like, are saved with `/addplace` and
listed with Home and Work in `/places`. See [Places with /places](places.md).

## Cycling

**🚲 I have a bike** says you have one with you: [/nav](nav.md) then also says
how long cycling there takes. **🚲 I don't have a bike** turns it off again. It
syncs with the web app's **Cycling** setting.

## Routine notifications

On by default. **Disable notifications** pauses every routine without deleting
any of them; **Enable notifications** starts them again.

## Favourites

To change where favourites pin, use `/favouritepref`. See
[Favourites](favourites.md#top-or-bottom).

Tapping **Set name**, **Set birthday**, **Set home** or **Set work** waits for your reply. Send `/cancel` to
stop without changing anything.
