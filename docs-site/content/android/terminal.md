---
title: The sgbus terminal
description: The Linux command line's sgbus prompt inside the Android app, with a bar of keys a phone's keyboard hasn't got.
---

The **sgbus terminal** is the [Linux command line](../web/linux-cli.md)'s `sgbus>` prompt, inside the app. Type what you want instead of tapping for it: `84009` for a stop's timings, `nav home
work` for the way to work, `favs -w` to keep your favourite stops' timings on screen.

<figure>
<img src="/screenshots/android/terminal.png" alt="The sgbus terminal: a welcome, sgbus> 84009, Bedok Int's buses with their next three times in colour, a fresh prompt, and a bar of keys at the foot: Tab, up, down, ^C and clear." width="412" height="892" loading="lazy">
<figcaption>Bedok Int's timings at the prompt, with the bar of keys under it.</figcaption>
</figure>

## Open it

In [Settings](settings.md#help-and-extras), **Help and extras**, tap **Open the sgbus terminal**. The first time, a short tour shows you round. `exit`, your phone's **Back** or the cross at the top closes
it.

## Type a command

Commands are the Linux app's, without `sgbus` in front (it's fine if you type it anyway):

```text
84009                 a stop's timings
84009 14,60           just those buses; 84009 22* for every bus starting 22
84009 -w              kept up to date, every 30 seconds
bedok int             find a stop by its name, road or station
519599                the stops nearest a postal code
22                    bus 22's route
nav home work         by bus and train, between two of your places
route 84009 66009     by bus only, stop to stop
favs                  every favourite stop's timings
alerts                train disruptions and traffic incidents
weather               today's weather, PSI and PM2.5
help                  the rest
```

Put an end with spaces in quotes: `nav "Bedok Mall" work`.

## The keys

A phone's keyboard hasn't got a terminal's keys, so the bar under the screen has them:

| Key | What it does |
|---|---|
| **Tab** | Finishes a command, `home`, `work` or one of your places' names. |
| **↑** and **↓** | Go back through what you've typed before. |
| **^C** | Stops a `-w`, or clears the line. |
| **clear** | Clears the screen. |

A `-w` also has **Stop** at the top. Press and hold to select text and copy it.

## What it saves

It saves to the app's own lists, so the app and the terminal always agree: `fav add 84009` is a [favourite](favourites.md) on Bus timings too, `place set gym` is in [Places](places.md), and settings are
Settings'. What you type is only read as words, never run as code.

For more on the commands, see [The sgbus terminal](../web/terminal.md) on the web app's pages.
