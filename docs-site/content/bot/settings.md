---
title: Settings
description: Set the name the bot calls you, your birthday, and whether routines are sent.
---

Send `/settings` to see everything the bot keeps for you, with buttons to
change it:

- **Name**: what the bot calls you, or "not set".
- **Birthday**: the date it has saved, or "not set".
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

## Routine notifications

On by default. **Disable notifications** pauses every routine without deleting
any of them; **Enable notifications** starts them again.

## Favourites

To change where favourites pin, use `/favouritepref`. See
[Favourites](favourites.md#top-or-bottom).

Tapping **Set name** or **Set birthday** waits for your reply. Send `/cancel` to
stop without changing anything.
