---
title: Updates and offline use
description: How the app updates itself, and what still works without a connection.
---

## When a new version is ready

<figure>
<img src="/screenshots/web/updates-new-version.png" alt="A bar across the top of the app saying A new version of SG Bus Timing is ready, with Reload and Not now buttons." width="1280" height="118" loading="lazy">
<figcaption>The bar a new version brings. Nothing reloads until you tap Reload.</figcaption>
</figure>

The app downloads new versions in the background. When one is ready, a slim bar
appears at the very top of the page:

> A new version of SG Bus Timing is ready. **Reload** **Not now**

- **Reload** switches to the new version straight away. The page reloads once.
- **Not now** hides the bar for now. It comes back the next time you open the
  app, until you reload.

Nothing reloads on its own, so the app never changes under you halfway through
something.

> [!NOTE]
> This guide has the same bar, and says "A new version of the SG Bus Timing
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
| Searching by postal code | No: the address is looked up online |
| Sync between devices | No |

Live timings are never shown from an old copy. An old arrival time shown as if
it were live would be worse than none, so without a connection the app says it
could not load them instead.
