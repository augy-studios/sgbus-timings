---
title: Console commands
description: Commands typed in the browser's console to try the feats, Easter eggs, uwuCoins and the celebration without taking the trips.
secret: true
---

The web app has a few commands you can type in your browser's console, to see
the [feats and Easter eggs](easter-eggs.md), the uwuCoins wheel and the
celebration without riding for them. They all start with `simulate`.

> [!WARNING]
> What they do is real: coins given can be spent, feats done stay done, and
> eggs found unlock their [secrets](secret-features.md). Each has a way to put
> things back, in [Put it all back](#put-it-all-back). They only change the
> browser or app you type them in, and nothing on any other device.

## Open the console

| Where | How |
| --- | --- |
| Chrome or Edge on a computer | Open sgbus.uwuapps.org, press **F12** (or **Ctrl+Shift+J**; **Cmd+Option+J** on a Mac), and pick **Console** |
| Firefox on a computer | **Ctrl+Shift+K** (**Cmd+Option+K** on a Mac) |
| Safari on a Mac | Turn on **Show features for web developers** in Safari's Settings, Advanced, then **Cmd+Option+C** |
| The Android app | Turn on USB debugging on the phone, plug it into a computer, open `chrome://inspect` in Chrome there, and click **inspect** under the app |

Type a command after the `>` and press **Enter**. The line under it starting
with `<·` is what it answers. The first time you paste into Chrome's console,
it asks you to type `allow pasting` first.

## Every command

`simulateHelp()` lists them all.

<figure>
<img src="/screenshots/web/console-help.png" alt="The console after simulateHelp(): a list of every command and what it does, from simulateEgg('ktm'), a feat done, to simulateAllLines(), the every-line celebration as a preview, then: Each says more with 'help', such as simulateCoins('help')." width="720" height="329" loading="lazy">
<figcaption>simulateHelp(), and what it lists.</figcaption>
</figure>

Each command also explains itself when given `'help'`, such as
`simulateCoins('help')`.

## uwuCoins

| Command | What it does |
| --- | --- |
| `simulateCoins()` | Says how many uwuCoins you have |
| `simulateCoins(500)` | Gives you 500 more, any number you like |
| `simulateCoins(-30)` | Takes 30 away, never below 0 |
| `simulateCoins('set', 1000)` | Makes it exactly 1000 |

<figure>
<img src="/screenshots/web/console-coins.png" alt="The console: simulateCoins() answers 230 uwuCoins and how it works; simulateCoins(500) answers 730 uwuCoins; simulateCoins(-30), 700 uwuCoins; simulateCoins('set', 1000), 1000 uwuCoins." width="720" height="335" loading="lazy">
<figcaption>Giving, taking and setting coins.</figcaption>
</figure>

Coins given float up from the bottom of the screen, as a trip's do, and the
wheel and the Edge Tray's coin show the new total straight away.

<figure>
<img src="/screenshots/web/console-coins-app.png" alt="Settings, Help and extras, at the wheel: 1000 uwuCoins over the wheel, and a gold chip at the bottom of the screen, +770 uwuCoins." width="420" height="900" loading="lazy">
<figcaption>After simulateCoins('set', 1000), from 230.</figcaption>
</figure>

## Rides, for Achievements

`simulateRide` counts a real ride on each bus or line you give it, as if you'd
taken it with the Get Off Alert, so the bars in Achievements move.

| Command | What it does |
| --- | --- |
| `simulateRide('12')` | A ride on bus 12 |
| `simulateRide('12', '34', 'NE')` | Rides on buses 12 and 34 and the North East Line, as many as you like at once |
| `simulateRide('undo')` | Takes back every ride it added |

Lines go by their two letters: `NS`, `EW`, `NE`, `CC`, `DT`, `TE`, and for
the LRT `BP`, `SK` and `PG`.

<figure>
<img src="/screenshots/web/console-rides.png" alt="The console: simulateRide('12', '34', '56', 'NE') answers ridden: bus 12, bus 34, bus 56, NE Line. 1 of 9 lines ridden. simulateRide('undo') answers 4 rides taken back." width="720" height="182" loading="lazy">
<figcaption>Four rides, then taken back.</figcaption>
</figure>

A ride that finishes a feat does it as a real one would: the fifth of buses 12,
34, 56, 78 and 90 opens the feat's window with its 100 uwuCoins, and the ninth
line plays the celebration. Taking the rides back with `undo` leaves a feat
done.

<figure>
<img src="/screenshots/web/console-rides-app.png" alt="Achievements: Every line ridden, 3 of 9; 12, 34, 56, 78, 90, 3 of 5; 9, 87, 65, 43, 21, 0 of 5; and the trip feats Not yet." width="358" height="733" loading="lazy">
<figcaption>Achievements after simulateRide('12', '34', '56', 'NS', 'EW', 'NE').</figcaption>
</figure>

## Feats and Easter eggs

`simulateEgg` does a feat or finds its egg straight away. The feats go by these
names:

| Name | Feat |
| --- | --- |
| `lines` | Every line ridden |
| `up` | 12, 34, 56, 78, 90 |
| `down` | 9, 87, 65, 43, 21 |
| `loop` | There and back again |
| `long` | The long way round |
| `ktm` | Down the old railway |

| Command | What it does |
| --- | --- |
| `simulateEgg('ktm')` | Does that feat: its window, and its 100 uwuCoins |
| `simulateEgg('ktm', 'egg')` | Finds its Easter egg, as the wheel would, with the secret and preset it brings |
| `simulateEgg('all')` | Does every feat not done yet, with their coins but without a window each |
| `simulateEgg('all', 'egg')` | Finds every egg not found yet |
| `simulateEgg('undo')` | Takes away every feat, egg and secret, but not the coins |

<figure>
<img src="/screenshots/web/console-eggs.png" alt="The console: simulateEgg('ktm') answers done; simulateEgg('ktm', 'egg') answers that it unlocked Your colours, with the new preset KTM; simulateEgg('all') lists the other five feats done, +500 uwuCoins, 6 of 6 feats done; simulateEgg('all', 'egg') lists the other five eggs found, 6 of 6 Easter eggs found; simulateEgg('undo') answers undone." width="720" height="411" loading="lazy">
<figcaption>One feat and egg, then all of them, then undone.</figcaption>
</figure>

<figure>
<img src="/screenshots/web/secret-feat-ktm.png" alt="A window: You did something special! Down the old railway. You travelled between two places on the old KTM railway line. +100 uwuCoins, for a spin of the wheel in Settings. 4 of 6 feats done. Spin the wheel, Later." width="396" height="296" loading="lazy">
<figcaption>The window simulateEgg('ktm') opens.</figcaption>
</figure>

## The celebration

`simulateAllLines()` plays the every-line celebration as a preview, without
saving anything.

| Command | What it does |
| --- | --- |
| `simulateAllLines()` | The celebration your device would show |
| `simulateAllLines('3d')` | The 3D one, whatever your device is |
| `simulateAllLines('flat')` | The flat one, for phones with little memory |
| `simulateAllLines('plain')` | The plain window, for browsers without 3D |
| `simulateAllLines({ unlock: true })` | Also does the feat, without its coins |
| `simulateAllLines('undo')` | Takes back a feat it did |

<figure>
<img src="/screenshots/web/console-lines.png" alt="The console: simulateAllLines('help') logs how it works, and answers Promise fulfilled: help." width="720" height="192" loading="lazy">
<figcaption>simulateAllLines('help').</figcaption>
</figure>

## Put it all back

| To undo | Type |
| --- | --- |
| Feats, eggs and the secrets they unlocked | `simulateEgg('undo')` |
| Rides added with simulateRide | `simulateRide('undo')` |
| The every-line feat from simulateAllLines | `simulateAllLines('undo')` |
| Coins | `simulateCoins('set', 0)`, or the number you had |

`simulateEgg('undo')` takes away every feat and egg, the ones you earned on
real trips too, and puts the app back in its usual colours.
