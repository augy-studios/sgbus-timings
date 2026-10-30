---
title: The sgbus terminal
description: The Linux app's sgbus> prompt inside the web app, full screen: type a stop, a nav or any other command instead of tapping.
---

The **sgbus terminal** is the [Linux command line](linux-cli.md)'s `sgbus>`
prompt, inside the web app. Type what you want instead of tapping for it: `84009`
for a stop's timings, `nav home work` for the way to work, `favs -w` to keep your
favourite stops' timings on screen. It fills the whole screen, as the
[live map](live-map.md) does, with the Edge Tray still beside it: a button there
closes the terminal and opens what it's for.

<figure>
<img src="/screenshots/web/terminal.png" alt="The sgbus terminal, full screen: a stop's timings for buses 14 and 60 at Bedok Int typed as 84009 14,60, then fav listing the favourite stops, buses, routes and navs, and the sgbus> prompt waiting for the next command." width="1000" height="640" loading="lazy">
<figcaption>A stop's timings, then everything saved, at the sgbus&gt; prompt.</figcaption>
</figure>

## Open it

Any of these opens it:

- **Settings**: tap **Open the sgbus terminal**, under **sgbus terminal**.
- **Ctrl+`** (Ctrl and the backtick key, left of 1) anywhere in the app, on a
  computer. Press it again to close.
- **Your browser's console**: open the developer tools (**F12**, or
  **Ctrl+Shift+J**; **⌥⌘J** on a Mac), type `sgbus` and press Enter.

<figure>
<img src="/screenshots/web/terminal-settings.png" alt="Settings' sgbus terminal section: an Open the sgbus terminal button, and a note that it takes the Linux app's commands at an sgbus> prompt, and that Ctrl+` opens it too on a computer." width="366" height="155" loading="lazy">
<figcaption>The terminal's button in Settings.</figcaption>
</figure>

The first time it opens, a short tour shows you round: where to type, where the
answers show, and how to close it. **Show me around** in Settings shows it again.

**Esc**, `exit`, the **×** at the top or Back closes it. What's on screen is still
there the next time you open it.

## Type a command

Commands are the Linux app's, typed the same way, without `sgbus` in front (it's
fine if you type it anyway):

```text
84009                 a stop's timings
84009 14,60           just those buses; 84009 22* for every bus starting 22
84009 -w              kept up to date, every 30 seconds
bedok int             find a stop by its name, road or station
519599                the stops nearest a postal code
22                    bus 22's route
nav home work         by bus and train, between two of your places
nav "Bedok Mall" 6PH57RQ8+X2 --arrive 9am --day mon
route 84009 66009     by bus only, stop to stop
favs                  every favourite stop's timings
alerts                train disruptions and traffic incidents
weather               today's weather, PSI and PM2.5
help                  the rest
```

Put an end with spaces in quotes: `nav "Bedok Mall" work`. An end can be one of
your [places](places.md) by its name, a stop, a postal code, an address, a
station, GPS coordinates or a plus code, as in [Navigate](nav.md).

<figure>
<img src="/screenshots/web/terminal-nav.png" alt="nav home work in the sgbus terminal: two ways from Bedok Mall to One Raffles Place, quickest first, the East-West Line all the way or bus 9 then the East-West Line, then the first step by step: a walk to Bedok station, the East-West Line towards Tuas Link to Raffles Place, and a walk to One Raffles Place." width="1000" height="640" loading="lazy">
<figcaption>nav home work: the ways there, and the first step by step.</figcaption>
</figure>

### Keys

| Key | What it does |
|---|---|
| **Enter** | Runs what's typed. |
| **↑** and **↓** | Go back through what you've typed before, kept in this browser. |
| **Tab** | Finishes a command, `home`, `work` or one of your places' names. Where several fit, it lists them. |
| **Ctrl+C** | Stops a `-w`, or clears what's typed. With text selected, it copies it instead. |
| **Ctrl+L** | Clears the screen, as `clear` does. |
| **Esc** | Stops a `-w`; otherwise closes the terminal. |

On a phone, a `-w` has a **Stop** button at the top instead.

<figure>
<img src="/screenshots/web/terminal-phone.png" alt="The sgbus terminal on a phone, full screen: 84009 14,60,30 -w keeping Bedok Int's timings for buses 14, 60 and 30 up to date, with a Stop button at the top." width="390" height="300" loading="lazy">
<figcaption>A -w on a phone, with Stop at the top.</figcaption>
</figure>

## What it saves

It saves to the app's own lists, so the app and the terminal always agree:

- `fav add 84009` and `fav bus add 14` are [favourites](favourites.md) on Bus timings
  too.
- `place set gym 6PH57RQ8+X2` saves a place in [Places](places.md), and `place set
  home 519599` sets Home.
- `route ... --save` and `nav ... --save` add a favourite route or nav.
- `calendar set <link>` links your [calendar](calendar.md), and `calendar` lists
  its events, from a linked file or the phone's calendar too.
- `settings` changes Settings' pins, **Restricted areas** and **Immigration time**.

**Routines** are set here only in the [Android app](android-app.md), which sends
them with the app closed. A browser can't send them, so there it says so.
Updating is the app's own job too: `update` points you to the
[update bar](updates.md).

## Safe to use

Commands are read only as words, never run as code. The terminal only acts on
what's typed into it: no link, page address, message or [sync](sync.md) can type
a command for you. It only asks this site for data, prints text and nothing else,
and it can't do anything the app's own buttons can't.

When your browser's console opens, it shows a warning: never paste code there
that someone sent you. That code would run as you, with your saved stops, places,
routines and calendar link. Typing `sgbus` is safe: it only opens the terminal.

> [!TIP]
> Your calendar's private link isn't kept with what you've typed before, so ↑
> won't bring it back.

## Also on Linux

The same commands run in a Linux terminal, with routines as desktop
notifications: see [The command line on Linux](linux-cli.md).
