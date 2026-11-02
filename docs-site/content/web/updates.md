---
title: Updates and offline use
description: How the app updates itself, and what still works without a connection.
---

## When a new version is ready

<figure>
<img src="/screenshots/web/updates-new-version.png" alt="A bar across the top of the app saying A new version of SG Bus Timings is ready, with Reload and Not now buttons." width="1280" height="118" loading="lazy">
<figcaption>The bar a new version brings: Reload for it now.</figcaption>
</figure>

The app downloads new versions in the background. When one is ready, a slim bar
appears at the very top of the page:

> A new version of SG Bus Timings is ready. **Reload** **Not now**

- **Reload** switches to the new version straight away. The page reloads once.
- **Not now** hides the bar for now.

If you don't tap either, the new version goes in by itself at a moment nothing's
lost: when you come back to the app after switching to another app or tab, or
when you pick a page in the Edge Tray, which opens again once it's reloaded. It
waits while a trip is running, a window or tour is open, you're typing, a bug
report is waiting to be sent, or you're offline, so the app never changes under
you halfway through something.

Words in your language come with each new version too, never an older copy, so
something new doesn't show up in English first.

> [!NOTE]
> This guide has the same bar, and says "A new version of the SG Bus Timings
> Guide is ready." when a page has been updated since you opened it.

## Offline

Once you have opened the app, it keeps a copy of itself on your device, so it
still opens without a connection: on the MRT between stations, say.

| Without a connection | Works? |
|---|---|
| Opening the app | Yes |
| Your favourites, settings and theme | Yes |
| Searching bus stops by name or code | Yes, from the last copy downloaded |
| Bus routes and the route planner | Yes, from the last copy downloaded |
| Live arrival timings | No |
| The Service alerts card | No; notifications still arrive once you're back online |
| Stops near me | Usually: it needs only your device's location and the saved list of stops |
| The live map and Explorer | Places you've looked at before, or all of Singapore once you've [saved the map](explorer.md#save-the-map-for-offline) |
| Searching by postal code | No: the address is looked up online |
| Sync between devices | No |

Live timings are never shown from an old copy. An old arrival time shown as if
it were live would be worse than none, so without a connection the app says it
could not load them instead.
