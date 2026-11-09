---
title: uwuCoins, feats and team runs
description: Earn uwuCoins on live trips, spin the wheel for Easter egg links, do the nine feats, and speedrun them as a team.
---

The bot has uwuCoins, the wheel, the feats and team runs, as the
[web app](../web/uwucoins.md) has them, with the same rules and the same
numbers. They're your chat's own, as each phone's are its own; [sync](sync.md)
can add a phone's to yours.

## Earn them

A [live trip](trips.md) earns uwuCoins once you get to the end of it with a
ride on it shown to be real, by the web app's formula: 5 for getting there, 1
for every 2 km ridden (up to 30), 3 for each change, 4 for each bus or train
operator, and 2 for each MRT or LRT line. When you arrive, the trip's card
counts them up, and the bot says how many you have.

Each feat is worth 100 uwuCoins once.

### What counts as a real ride

The bot knows a ride was real from your location, the way the web app does:

- you were near where it starts, then near where it ends;
- it took at least half its planned time, and never faster than a bus or a
  train goes;
- on a bus, you were seen near some of the stops on the way.

So **share your live location** on a trip, as the bot asks when it starts. A
ride with no location, or a trip ended early away from its end, earns nothing.

## Spin the wheel

<figure>
<img src="/screenshots/bot/coins-wheel.png" alt="The uwuCoins wheel in Telegram: a gold wheel of eight slices, an egg and 20, 50, 30, 70, 40, 150 and 60, with a red pointer at the top over 150; a coin and 280 under it, +150 uwuCoins!, and Spin for 100 with the button below." width="380" height="327" loading="lazy">
<figcaption>The wheel, after a spin that won 150.</figcaption>
</figure>

Send `/coins` for your wheel and your balance. **🎡 Spin for 100** under it
spins: the wheel turns onto the slice it lands on, and your balance counts up
by what you won, 20 to 150. **📜 History** lists every coin in and out, and
**🏆 Achievements** the feats.

### Easter egg links

One slice in eight is the egg. In the bot, it gives you a **link** to an Easter
egg. Open it on the SG Bus Timings website, or tap it with the Android app
installed, and that phone gets what the web app's wheel would give: GTA VI's
colours while the wheel has them to give, otherwise an Easter egg that phone
hasn't found yet, with what it unlocks, or 80 uwuCoins once it has them all.

A link works **once**, on whichever phone opens it first, and doesn't expire.
You can send it to a friend.

## Achievements

Send `/achievements` for the nine feats, which you've done, and how far along
you are with the rest. They're the [web app's feats](../web/easter-eggs.md):
every MRT and LRT line, the bus number runs, There and back again, The long way
round, Down the old railway, First to last, 100 rides and Ends of the island.

## Team runs

<figure>
<img src="/screenshots/bot/team-widget.png" alt="A team run in Telegram: Night Owls, 2 of 9 feats, 23 rides, Bea, Alex and Sam, Bea's trip ended at a time with when to carry on by, then each feat with a bar: Every line ridden 7 of 9, 12 34 56 78 90 done, The long way round 2h 14m of 3h, Down the old railway done, and the rest." width="380" height="512" loading="lazy">
<figcaption>A team run, the same card for everyone in it.</figcaption>
</figure>

Speedrun the feats with friends, on phones and in Telegram together, up to
eight at once:

- `/team Night Owls` starts a team called Night Owls.
- `/team abcde12345`, or a team's link, joins it. On the website or in the app,
  a team run has **Join in Telegram**.

The team's card shows each feat and how far along you all are, who's in it, and
the latest trip that can be handed on. Tap a feat for what it asks. Every real
ride and every trip you get to the end of counts for the whole team, and when
the team finishes a feat, everyone in it gets it and its 100 uwuCoins.

A trip is **handed on** when a teammate starts theirs within 400 m of where
yours ended and within 30 minutes: the two count as one trip, for The long way
round, There and back again and Down the old railway.

**📤 Invite to the team** sends the team's links, **🚪 Leave** leaves it, and
the feats you've had stay yours. A team run ends 14 days after its last ride.

## With sync

`/sync` ([Sync](sync.md)) offers your uwuCoins to the website or the app, and theirs
to you. Taking them **adds** that balance to yours. Taken again later, it's
added again.
