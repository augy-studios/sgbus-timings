# SG Bus Timings - Patch Notes

**Latest update: 24 October 2026**
**Live at: https://sgbus.uwuapps.org**
**Guide: https://guide.sgbus.uwuapps.org**
**Telegram bot: https://t.me/UwUsgbus_bot**

Newest first. Each update covers the web app and the Telegram bot.

---

## 24 October 2026 (later): Apps 2.2.5, the sgbus terminal

### Web app

- **The sgbus terminal** - The Linux app's `sgbus>` prompt, full screen in the web app: type `84009`, `nav home work`, `favs -w` or any other of its commands instead of tapping. Tab finishes a word, Up brings back what you typed, Ctrl+C stops a `-w`. Open it from Settings, with Ctrl+` on a computer, or by typing `sgbus` in your browser's console. The Edge Tray stays beside it. What it saves is the app's own: `fav add 84009` there is a favourite on Bus timings too.
- **Every command, as on Linux** - The route planner, saved routes and navs, setting places, your calendar and Settings' pins, restricted areas and immigration time, with `--leave` and `--arrive`. It replaces `sgbus('...')` in the console, which took only some of them.
- **A warning in the console** - Opening your browser's console shows a warning, as Discord's does: never paste code there that someone sent you.
- **Explorer** - The live map from its own Edge Tray button, with every bus stop and MRT and LRT station round you as a dot to tap. A stop's card shows every bus there, green while it's running, red once it's down to its last three buses of the day, grey when it isn't running. A station's card has its codes in their lines' colours and, a platform at a time with arrows at the sides, the doors nearest its escalators, lifts and stairs and where each leads. Both have Directions, to Navigate's Bus and train from where you are. Explorer can be turned off in Settings, Edge Tray buttons.
- **Tap the stops on your trip** - On the live map, a trip's stops and stations, and the stop a walk goes to, open the same cards.
- **Tours for Explorer and the terminal** - Each shows you round the first time it opens, as the pages do, and Settings, Show me around, has a button for each.
- **Another way, found for you** - When a last bus on your trip is lost, the trip finds another way and switches to it by itself, keeping the trip up to where the ride before that bus ends. A buzz and a notification say why and what to do now ("after Bus 21 to Blk 390, walk 3 min to Opp Blk 5, take Bus 12 there"), with Undo on the bar. Undone, Reroute takes it after all, and with your location on, Navigate from here opens Navigate from where you are.
- **Buses timed by the traffic** - Setting off now, Navigate times buses by LTA's live traffic, so a bus through a jam is slower and a train can win; a trip's minutes left go by it too. A bus slowed by traffic says by how much and why, the roads by name and any accident or breakdown on its way.
- **Traffic on the map** - Tap where it says a bus is slowed for its road on the live map: green clear, orange slow, red jammed, with its incidents marked.
- **A faster way, on a trip** - Every few minutes, while you wait or ride, the trip looks for a quicker way, its first bus by live timing. If one saves enough, the bar suggests it, and why: Reroute takes it, Keep my way doesn't.
- **Walking and cycling** - Navigate says how long walking the whole way takes where it might compete, and with Settings' new Cycling, how long cycling takes, each with Walk it or Cycle it on the live map. A trip counts them for a faster way too.
- **Last buses in Navigate** - A way says when you'd be catching a bus within half an hour of its last of the day.
- **Walks to places off the footpaths** - Where the footpaths stop short of a place, out on a road with none, such as an industrial road or a lamp post along one, the live map's walk goes the last stretch along the road and says so, so you can watch for traffic. Never along an expressway: the walk stops at the nearest footpath and says why.
- **Change here** - On a trip's timeline, Change my way puts a Change here by every stop ahead, so any can be where you get off instead: pick from the ways on from there, and the trip changes to it, the Get Off Alert and all. Hidden until asked for, and every change to a trip, yours or its own, has Undo.
- **Midnight as 00:00** - A last bus at midnight says 00:00, not 24:00, in a stop's timings, Explorer and on a trip.
- **The Newsfeed in Service alerts** - What LTA and the operators announce ahead of time, read every hour from LTA's announcements and SBS Transit's, SMRT's, Tower Transit's and Go-Ahead Singapore's news: a run's closed roads and the stops buses skip, night closures, new services, train service adjustments. What's on in the next two weeks, with its buses, marked where it names your favourite stops or buses, then the operators' latest news.
- **Skipped stops on a stop's timings** - When buses skip a stop today or tomorrow, its timings say which and for how long: "Today: 97, 106, 133 skip this stop, first bus to 8.30am."
- **Newsfeed notifications** - A third kind beside trains and traffic: All news, or Service changes only.
- **Last bus soon, on a trip** - A red warning on the trip bar, with a buzz and a notification, when a bus you've still to get on is down to its last three of the day, its last bus leaves before you'll reach its stop, or it's gone.
- **Also direct buses in a stop's timings** - On a trip, a bus stop tapped on the trip bar's timeline shows the other direct buses' timings there too, not only your bus's.
- **Refresh one bus** - Round arrows under each bus's Flag button fetch that bus's timings alone, without scrolling back up to Refresh.
- **Nothing hidden under the trip bar** - While a trip runs, the page scrolls far enough that its end, such as the bottom bus's first and last bus times, clears the trip bar, however tall it gets.
- **Trips on the live map follow the roads** - A bus ride's line runs along the roads the bus takes, stop to stop, with your dot on them, and every walk's dotted line along its streets, not straight across.
- **Tap a bus on a stop card** - On Explorer and the live map, each bus on a stop's card opens that bus's timings at the stop.
- **Minutes left by the bus's live timing** - While you wait at the stop on a trip, the trip bar, the live map and a shared ETA count the wait by your bus's live timing there, not the wait planned when the trip began.
- **Show bus timings from a stop card** - On Explorer and the live map, a bus stop's card has Show bus timings above Directions: the stop's full timings on Bus timings.
- **The map starts afresh** - Opening Explorer or the live map goes straight to where it starts, flat and north up, with nothing left over from the last time, rather than gliding over from where it was left.
- **Refresh on Glance** - A round button beside the chip fetches the times at once, rather than waiting for the next 30-second refresh.
- **Interchanges as pills** - On Explorer, a station on more than one line is a pill in all their colours, split on a slant as on the MRT's signs, always in the same order: green, red, purple, orange, blue, brown, then the LRT's grey.
- **A clearer escalator** - The escalator beside a station's doors is drawn as one: its handrail from landing to landing, with someone on it.
- **The terminal's full width** - With the Edge Tray tucked away, the terminal uses the whole width of the window. Only its top bar keeps clear of the tray's arrow.

### Telegram bot

- **Buses timed by the traffic in /nav** - As on the web: setting off now, buses go by LTA's live traffic. 🚦 marks a bus it slows, and the way itself says by how much and why, with a button to its road on the web app's live map, coloured by how jammed it is.
- **Last buses in /nav** - ⏰ marks a bus you'd catch near its last of the day, and the way says when the last one is.
- **Walking and cycling in /nav** - How long walking the whole way takes, where it might compete, and cycling with Settings' new 🚲 I have a bike, which syncs with the web app.
- **Midnight as 00:00** - A stop's first and last bus line says 00:00 for a last bus at midnight, not 24:00.
- **The Newsfeed in /alerts and /sub** - LTA's notices for the next two weeks, with their buses, and the operators' latest news; a third row in /sub to be sent new ones, all or service changes only; and a stop's timings say when its buses skip it today or tomorrow.

### Linux command line 2.2.5

- **Its commands shared with the web app** - The same file runs both, so they say the same thing. `nav` and `place set` list plus codes among the ends they take.
- **Midnight as 00:00** - A last bus at midnight says 00:00, not 24:00.
- **Safer to print** - Text from the data, such as a calendar event's title or a place synced from another device, can't send your terminal escape codes: only sgbus's own colours get through.
- **Your calendar's link stays out of the history** - `calendar set <link>` isn't kept in `~/.cache/sgbus/history`, or for Up.
- **Settings line up** - `sgbus settings` keeps its columns straight when a pin is at the bottom.

### Android app 2.2.5

- The web app's changes above. In the app, the terminal's `routine` commands set the app's routines.

### Desktop app 2.2.5

- The web app's changes above.

---

## 24 October 2026: train doors at almost every station

### Web app

- **Just the door number** - The door tips now give the number on the platform door itself ("Door 8"), not a car and a door in it: the platform screen doors hide where one car ends. Each is drawn as a little door in the line's colour.
- **Where the door number is** - Under the doors, a little drawing shows where to find the number on the platform door: on the panel above the doors, at the top right of each door, or near the top of the post beside it at elevated stations.
- **A tour for every page** - Like Glance's, each page now shows you around the first time you open it: Bus timings, Favourites, Navigate, Service alerts, Your trips and Places. Settings, Show me around, has a button for each to see it again.
- **Which door, at a glance** - The door tip is a panel now, not a sentence: a row for each escalator, lift and stairs with its icon, where it goes, and its doors as "Car 3 · Door 1".
- **Which door, nearly everywhere** - Navigate's door tips now cover almost every MRT station, not a handful.
- **The doors for your next line** - Changing trains, it gives the doors nearest the way to the line you're changing to, not just the way out.
- **Malls and terminals** - Getting off, it names where an escalator or lift leads when it's somewhere in particular: Jewel, a terminal at Changi Airport, Nex, City Square and so on.
- **Changi Airport branch** - Rides to Expo and Changi Airport now get door tips too.

### Telegram bot

- **Which Blk 109?** - Did you mean in `/nav`, `/places` and Home and Work now gives each stop's number and road, each station's line codes and each building's address, so two stops of the same name can be told apart.
- **Coordinates and plus codes, said out loud** - `/nav`, `/places` and Home and Work now tell you they take GPS coordinates (`1.35, 103.85`) and plus codes (`7RQ8+X2`), as Navigate does on the web.

---

## 23 October 2026 (late): the live map in 3D, which train door to stand at

### Web app

- **Which door to stand at** - On a train ride in Navigate, where the station's in: the car and door that stop nearest the escalators, lift and stairs where you get off ("car 2, door 3 or car 5, door 1 for the escalators to the exit"), or that your next train is just across the platform. More stations are on the way.
- **A new live map, buildings in 3D** - The live map is now OpenFreeMap's, drawn on the phone: sharper at every zoom, with shops, stops and street names. Drag two fingers up the screen to tilt it and the buildings stand up in 3D; twist two fingers to turn it. The compass mode turns it smoothly now, the whole map rather than a picture of it. Dark mode has its own dark map.
- **OpenStreetMap as the fallback** - If OpenFreeMap can't be reached, the map changes to OpenStreetMap's own tiles. A phone or browser that can't draw the new map gets the flat OpenStreetMap map it had before.
- **Kept on the phone** - The map, and every part of Singapore you've looked at on it, is saved as you go, so it comes back at once and works offline, underground included.

---

## 23 October 2026 (night): Glance gets its own page, a compass map, sgbus in the console

### Web app

- **Glance, a page of its own** - The next bus, the chip and your stops' buses are now **Glance**, with the eye button at the top of the Edge Tray, and the weather with them. **Bus timings** comes next, just the search box and a stop's timings. The app opens on Glance unless Custom home says otherwise; tap a bus there for its timings, and Back comes back.
- **Next bus at a glance switches off** - Its On and Off in Settings did nothing before. Off now takes Glance out of the Edge Tray, and the app opens on Bus timings.
- **Back to Navigate** - A bus's timings opened from a way in Navigate have **Back to Navigate**, which goes back to that same way, instead of starting over from the Edge Tray.
- **Settings reachable on a trip** - The trip bar covered the bottom of the Edge Tray, Settings and the theme among it. The tray now scrolls up clear of the bar.
- **The map turns with you** - The live map has a compass button: the map stays on you and turns so the way your phone points is up, like a map app's compass mode. Without a compass, it turns the way you're moving.
- **sgbus in the console** - In a browser's developer console, `sgbus('84009 22*')`, `sgbus('nav home work')`, `sgbus('favs -w')` and the Linux app's other commands work against the site. `sgbus('help')` lists them.

### Android app

- **Picture-in-picture can be turned off** - Settings, **Picture-in-picture**: Off, and leaving the app on a trip or the map sends it to the background like any other app, without the small window.

---

## 23 October 2026 (evening): your buses at a glance, distances on loops, train alerts

### Web app

- **Only your buses at a glance** - Once you've starred a bus, the stops under the search box show only your favourite buses, and leave out a stop none of them is due at. A busy interchange is a line or two instead of a dozen. With no favourite buses, every bus shows as before.
- **Bus distance on loop services** - A loop that comes back up the other side of the same road (183 on Clementi Rd) could show a bus still on its way out as about 1 km away, in a straight line, when it had about 7 km to go round. It's along the route now.
- **Truer times on OneMap's ways** - A way in Navigate found by OneMap left out the waits for its buses and trains, so its time, and the arrival time on a trip's shared ETA, came out too soon: about 50 minutes for a trip that would take over an hour. They count the waits now, from OneMap's timetable.
- **Start trip fits on phones** - On a way in Navigate or the route planner, **Start trip** ran off the side of the card, under the Edge Tray. It now has a line of its own under All ways and Refresh.
- **Train alerts more often there** - Service alerts asks LTA again when its train alerts don't answer the first time, instead of saying it couldn't reach them.
- **Minutes left on a trip** - The trip bar, and the Android app's trip notification, end with how long is left to the end of the whole trip: `Bus 282: 1 stop to Blk 460 · part 2 of 6 · ~42 min left`. It counts the same as a shared ETA, waits included.
- **A trip survives the app closing** - Closing the app from recent apps, or Android closing it in the background, ended a trip with no trace, and its shared ETA link never arrived. Opening the app again now picks the trip back up where it was, and carries on its shared ETA, if it was still going within the last 3 hours.
- **Someone's ETA closes** - The window for a shared ETA link came straight back when you closed it with its X or Back, and only went away when the app was closed. It closes now.

### Telegram bot

- **A stop narrowed to some buses** - Send `84009 174, 175`, or `84009 22*` for every bus there starting with 22, as in the web app and the Linux app, and the stop opens narrowed to them. Works in inline mode too (`@UwUsgbus_bot 84009 22*`), and a narrowed stop with none of them due now says so.
- **Wildcards in routines** - In `/addroutine`, type `96*` for 96, 96A and every other bus at the stop starting with 96, as the web app takes it. The buses it covers are ticked in the grid, and unticking one keeps the rest. Changing a routine's stop keeps a wildcard that still covers a bus there.

### Android and desktop apps

- The web app's changes above, with no update needed.

---

## 23 October 2026 (later): Custom home, the next bus at a glance, and a tour

### Web app

- **The next bus at a glance** - Bus timings opens on the next bus in big letters, then your stops under the search box, each bus on one line with where it's going and its next three times. A chip over it picks the stops: your saved stops, the ones nearby (with when to leave, for the walk), or the ones near Home, Work or another place. Tap any of it for the full timings, and the X on those puts them away. Settings, **Next bus at a glance**, turns it off.
- **Pages, not windows** - Bus timings, Favourites, Navigate (with its Bus and train and Bus only tabs), Service alerts, Your trips and Places are each a page of their own now, with their buttons at the top of the Edge Tray, the one on show filled in. Taps that lead somewhere still go there: a saved stop opens its timings on Bus timings, a place opens the way there. Settings, the theme, the weather and other small things still open as windows.
- **Back goes back** - The Android app's back button (and a browser's, and Telegram's) closes the window that's open, then goes back to the page you were on, and only leaves the app once there's nothing to go back to. Before, it left the app with a window still open.
- **Custom home** - In Settings, **Custom home** (it was Opens on) picks the page the app opens on, first in the Edge Tray. A link to a stop, a bus or a journey still opens that. It syncs like the other settings.
- **A tour** - The first time the app opens, a short tour shows the basics, a light and an arrow on each. **Show me around** in Settings shows it again.

### Android and desktop apps

- The web app's changes above, with no update needed.

---

## 23 October 2026: Apps 2.2.4, choose what the app opens on, bus distance along its route, Navigate finds more, Arm and .rpm

### Web app

- **Choose what the app opens on** - In Settings, **Opens on**: your first favourite stop (as before), Favourites, or Navigate. A link to a stop, a bus or a journey still opens that. It syncs like the other settings.
- **Bus distance along its route** - A bus's distance in its timings is now how far it has to ride along its route to your stop, not a straight line, including a loop service passing your stop for the second time. Where the route isn't known, it's the straight line as before.
- **Stops by any name in Navigate** - Bus and train finds a stop however the stop search would: Block for Blk, Jalan for Jln, and the words in any order across the stop's name and road, so `block 29 bahagia` finds Blk 29 on Jln Bahagia. Stops no longer drop off the list when stations and places fill it.
- **Coordinates and plus codes in Navigate** - Type GPS coordinates (`1.35, 103.85`, or `1.35N 103.85E`) or a plus code, whole (`6PH57RQ8+X2`) or short (`7RQ8+X2`), at either end.

### Android app 2.2.4

- **Updating on Samsung phones and tablets** - When Auto Blocker stops an update, the app now says so, shows where to turn it off, and lets you try again, instead of closing.
- The web app's changes above.

### Desktop app 2.2.4

- **On Arm PCs** - The Windows installer now also installs on Windows on Arm, and Linux has .deb, .rpm and AppImage for 64-bit Arm, such as a Raspberry Pi on 64-bit Raspberry Pi OS. The .msi stays for Intel and AMD PCs.
- **An .rpm for Fedora and openSUSE** - For x64 and Arm.
- **When an update can't download** - A notification says so, once, with a link to download it from GitHub, rather than nothing happening.
- The web app's changes above.

### Command line for Linux 2.2.4

- **Plus codes and stops by any name in `sgbus nav`** - The same as Navigate's, at either end.

### Telegram bot

- **Coordinates and plus codes in /nav** - The same as the web app's.

---

## 21 October 2026 (night): Apps 2.2.3, time for immigration across the Causeway, a prompt for sgbus, wildcards in routines

### Web app

- **Immigration across the Causeway** - Journeys to Johor Bahru, and back, now count time to get off at the checkpoint, clear immigration on both sides and get on again, and show it as a step: get off at W'lands Checkpt, ride any bus across to the Johor Bahru checkpoint, then on. About 15 minutes when it's quiet and up to an hour at the rush, by when you'd get there: weekday mornings into Singapore, weekday evenings and Friday nights out, Saturday mornings out and Sunday evenings back. In Navigate and the route planner alike.
- **Immigration time** - In Settings, **By the time** (the default), or the time you usually take: 15, 30, 45 minutes or an hour. It syncs like the other settings.
- **Off at each checkpoint** - A trip across the Causeway has the Get Off Alert tell you to get off at both checkpoints, with the time to clear as the wait before getting on again.
- **Tidier immigration buttons** - Settings' Immigration time sits as By the time across the top, with the four times in a row under it.

### Android app 2.2.3

- **Wildcards in routines** - A routine's buses can be a wildcard, `22*` for every bus starting with 22. Before 2.2.3, the Routines window asks you to update for one.

### Desktop app 2.2.3

- The web app's changes above. Nothing new of its own: the same number as the Android app.

### Command line for Linux 2.2.3

- **Its own prompt** - `sgbus` on its own opens `sgbus>`, where each command goes without `sgbus` in front, with history from last time, Tab to finish a command or a place, and `exit` to leave. Ctrl+C stops a `-w` and goes back to it.
- **Immigration time** - Routes and navs across the Causeway count it, and show the step; `sgbus settings customs` sets your own.
- **Wildcards in routines** - `--buses 22*`.

### Telegram bot

- **Immigration across the Causeway** - `/route` and `/nav` count the time and show a 🛂 step for it, by the time of day.
- **Wildcards from the app** - A routine synced from the Android app with `22*` keeps it, and sends every bus starting with 22.

---

## 21 October 2026 (evening): Apps 2.2.2, a command line for Linux, Larkin by bus and train, several buses at a stop, editing routines

### Web app

- **Navigate to Johor Bahru** - Bus and train now plans to and from the stops across the Causeway, Larkin Terminal included, rather than saying both ends have to be in Singapore. Past searches, places and trips there are kept too.
- **Several buses at a stop** - After a stop's code, list the buses to see just those: **84009 174, 175**, or a link like `#84009,174,175`. A star picks every bus starting with what's before it: **84009 22\*** shows 22, 222, 225G and the rest.
- **Restricted areas** - In Settings, **I have a pass** lets Navigate and the route planner get on and off inside Changi Airport's cargo area and at MINDEF's stops, for the people who work there. Off unless turned on, and it syncs like the other settings.
- **Off where the stop faces your end** - The route planner now rides on a stop where that's nearer where you're going, rather than getting off a minute early and walking further: to Opp SAF Ferry Ter, off at SAF Ferry Ter across the road, not Changi Beach CP 5.
- **Close stays in reach** - On a phone, Navigate's close button stays at the top right of its title, with Refresh, Share and Save nav on the line below, rather than pushed off the edge.
- **Get the Android app** - On an Android phone's browser, a bar offers the Android app, with **Download** for the newest version and a link to how to install it. **Not now** puts it away for a month.

### Android app 2.2.2

- **Edit routines** - Each routine has an **Edit** button, which fills the form in with it to change and **Save**. No update needed: it reaches the app from the web.
- **A routine's own buses** - Tapping a routine for several buses opens the stop with just those buses, not every bus there.

### Desktop app 2.2.2

- The web app's changes above. Nothing new of its own: the same number as the Android app.

### Command line for Linux 2.2.2 (new)

- **sgbus** - SG Bus Timings in a terminal: a stop's timings (`sgbus 84009`, `sgbus 84009 22*`, `-w` to keep them on screen), search by name, road, station or postal code, a bus's route, the route planner, Navigate, favourites, places, routines as desktop notifications, service alerts, the weather and your calendar. It runs the web app's own route planner and search, so it finds the same journeys. A `.deb` for any architecture, or one file, needing only Node.js 18.

### Telegram bot

- **Off where the stop faces your end** - `/route` gets off at the stop nearest your end when it's only a minute or two further, as the web app now does.

---

## 21 October 2026 (later): Sync with the Telegram bot, and sync more

### Web app

- **Sync with the Telegram bot** - In Settings, **Sync with the Telegram bot** shows a code and **Open the bot**, which opens the bot with it filled in (or send it `/sync` and the code). Then Import and Export work as between two devices: your name and birthday, favourite stops, buses, routes and navs, places, routines, your calendar's link and where favourites pin, either way. It goes through the site's server, kept there 10 minutes at most.
- **New tray icons** - In the Android app, the Edge Tray's **Timings near a stop** button is now a clock, and **Routines** an alarm clock.
- **Sync by kind** - Above what's on offer, a button for each kind (Bus stops, Places, Routines, Settings and so on), with how many of it there are, shows just that one, and **Select all** ticks just those. Ticks in other kinds stay, so one tap still copies the lot.
- **Sync more** - Between two devices, sync now copies routines and last bus reminders (between two phones with the Android app), your calendar's link, and the settings you've changed, such as dark mode, the colour, the Edge Tray's side and buttons, the Get Off Alert and Shake to refresh. Each side is only offered what the other can keep.

### Telegram bot

- **/sync** - Syncs with the web app or the Android app by the code its Settings shows: the bot sends what it has, and says what it saved from your device. `/sync stop` ends it.

---

## 21 October 2026: Apps 2.2.1, MyICA on trips to the checkpoints

### Web app

- **MyICA at the checkpoint** - On a phone, a trip to Tuas or Woodlands Checkpoint (or Woodlands Train Checkpoint), or on across the Causeway, has a **MyICA** button on the trip bar, for ICA's app and its immigration QR code. It opens MyICA Mobile's Play Store or App Store page, which says **Open** once it's installed. From the route planner and Navigate alike.

### Android app 2.2.1

- **Opens MyICA itself** - The trip's **MyICA** button opens MyICA Mobile straight away, as the SimplyGo button does SimplyGo, or its Play Store page if it isn't installed.

### Desktop app 2.2.1

- The web app's change above. Nothing new of its own: the same number as the Android app.

---

## 21 October 2026: Routines and Timings near a stop in the Edge Tray

### Android app

No update needed: these reach the app from the web.

- **Their own buttons** - **Timings near a stop** and **Routines** move out of Settings onto buttons of their own in the Edge Tray, a crosshair and a clock, each opening its own window.
- **Routines in one place** - Its window lists your routines, to remove, with **Add a routine** underneath, and stays open after adding so you can set up another.
- **Turn them off** - Either button can be turned off in Settings, **Edge Tray buttons**, like SimplyGo and the guide.

---

## 20 October 2026: Shortened names in search, stations on the web, loops split in two

### Web app

- **Name and road together** - Type a stop's name and its road in any order, **Blk 109 Bedok**, and the list narrows to the Blk 109s on Bedok's roads rather than every Blk 109 in Singapore. Stops matching what you typed in one piece still come first.
- **Shortened names** - Search finds a stop whichever way the word is typed: **Bukit Batok** finds Bt Batok Int, **Opposite Block 10** finds Opp Blk 10, and Ctr and Ctrl both find Centre and Central, among about 90 of LTA's short forms. A line above the matches says when some were only found that way: **Also searched Bt for Bukit**.
- **Stops at a station** - Type **Bedok MRT**, **Senja LRT** or **Botanic Gardens station** and the list is the stops within about 250 m of its exits, nearest first, with how far each is, as in the Telegram bot.
- **Loops in two** - A loop service passing a stop twice, such as 73, is now listed twice, **→ Lor 6 Toa Payoh** on its way out and **↩ Ang Mo Kio Int** on its way back, each in its own colour, as a bus going both ways is. Each may show fewer than three buses, since LTA gives three for the two. The departures board too.
- **Across the border** - Woodlands Checkpoint says **Immigration checkpoint**, and the stops in Johor Bahru (its checkpoint, JB Sentral and Larkin Terminal) say **In Malaysia**, both with a passport reminder, on the stop, in search results and in route lists.

### Telegram bot

- **Name and road together** - The same: `blk 109 bedok` finds the Blk 109s on Bedok Nth Rd and Bedok Nth Ave 3.
- **Shortened names** - The same: `bukit batok` finds Bt Batok Int, and the list says **Did you mean (also searched Bt for Bukit)**.
- **Loops in two** - A loop passing twice gets a heading per time round, `73 (SBST) 🔵 → Out to Lor 6 Toa Payoh` and `🔴 ↩ Back to Ang Mo Kio Int`, in place of the Way row.
- **Across the border** - Those stops say so under their name, and their buttons in a list carry 🛂.

---

## 20 October 2026: Apps 2.2.0, which way each bus is going, routines on Android

### Web app

- **Which way it's going** - At a stop a bus calls at going both ways, such as 136 at S'goon Gdn Circus, each of its two listings says where it's heading under its number, **→ Punggol Int**, in a colour of its own, and the Incoming buses bar matches. Its first and last bus, and its **Route** button, are now for that way, not always the first.
- **Loops passing twice** - Where a loop service passes on its way out and again on its way back, such as 73, each bus says which time round it's on: **Out to Lor 6 Toa Payoh** or **Back to Ang Mo Kio Int**. The departures board too.
- **One place, two stops** - Woodlands Int is two stops, 46008 and 46009, with different buses. Each now has a button to the other, as does any stop sharing its name with one close by.
- **Authorised personnel only** - The stops inside Changi Airport's cargo area, and MINDEF's on Gombak Drive, say so. The route planner and Navigate never have you get on or off at one, and never ride through the cargo area. Route lists mark them.
- **Room to type** - With the side tray out on a phone, **Get Timings** moves under the search box rather than squeezing it to a few letters.
- **Location, second try** - When your location can't be found at full accuracy, as indoors where GPS can't reach, it tries again with Wi-Fi and the mobile network before giving up. If it still can't, it says to check Location is turned on.
- **A tidier Edge Tray** - **Edge Tray buttons** in Settings turns off any of SimplyGo, the Telegram bot, Buy Augy a Coffee and the guide.

### Telegram bot

- **Which way it's going** - A bus listed twice at a stop says where each is heading in its heading, `136 (GAS) 🔵 → Punggol Int`, with that way's first and last bus. A loop passing twice gets a **Way** row: 🔵 Out or 🔴 Back.
- **One place, two stops** - Woodlands Int's two stops each say so, with a button to the other.
- **Authorised personnel only** - Those stops say so, and routes never get on or off at one or ride through the cargo area.

### Android app 2.2.0

All of the web app's changes above reach the app as they are. These need the update:

- **Routines** - In Settings, **Add a routine**: a stop, the buses you want or all of them, a time and the days. At that time a notification shows the stop's next buses, like the Telegram bot's routines. Tap it for their timings.
- **Turn on location** - Tapping Near me, Navigate's "from where you are" or Places' "where you are" with the phone's Location off now asks to turn it on with one tap, then carries on, rather than saying it couldn't find you.
- **Card value, read** - Holding a card to the phone, the app says **Reading your card…** the moment it finds it, then **Done: you can take your card away** with two short buzzes, so you know how long to hold it.

### Desktop app 2.2.0

- All of the web app's changes above. Nothing new of its own: the same number as the Android app.

---

## 19 October 2026: Apps 2.1.2, desktop links shared with other UwU apps

### Desktop app 2.1.2

- **Other UwU apps' links reach them** - With another UwU desktop app installed, such as uwuPromptr, a `uwu://` link for it now opens that app rather than SG Bus Timings, whichever of the two you opened last. Links for SG Bus Timings open it as before.

### Android app 2.1.2

- **Same number as the desktop app** - Nothing new of its own: Android already sends each `uwu://` link to the app it's for.

---

## 18 October 2026: Direct buses on trips, timeline fix

### Web app

- **Other direct buses** - On a trip, while you wait at the stop, the trip bar lists the other buses that go straight to the same stop, with how long each is: **Also direct: 51 in 3 min**. The timeline lists them under each bus ride too.
- **Timeline stops open their timings again** - On a trip, tapping a bus stop on the timeline shows that stop's timings for your bus again. Some trips' stops, such as ways found by OneMap in Navigate, were plain names that did nothing when tapped. A trip already under way gets its stops back too.

---

## 18 October 2026: Picture-in-picture fix

### Android app

- **Back from picture-in-picture, the right size** - Opening the app again from its small picture-in-picture window no longer leaves the page zoomed in, with the side buttons cut off and the page scrolling every way, worse each time. It comes back at its usual size, where you left it; now and then it reloads to get there, and a trip carries on. No app update needed.

---

## 18 October 2026: Apps 2.1.1, new versions as notifications

### Android app 2.1.1

- **Hear about new versions** - Turn on **New versions of the app** in Service alerts, and a notification says the moment a new version is out, even with the app closed. Tap it to update. A watch paired with your phone shows it too. Needs Google Play services.
- **Widget preview** - Adding the Bus timings widget, the widget list now shows it with some example buses rather than an empty card, in light and dark.

### Desktop app 2.1.1

- **New versions sooner** - The app looks for a new version every hour rather than every six, and again when your computer wakes from sleep.
- **New versions of the app** - A choice in Service alerts: turn it **Off** to stop the notifications about new versions. The tray's menu and the title bar still offer the update.

---

## 17 October 2026: Apps 2.1.0, and a watch app

### Web app

- **Flag down your bus** - **Flag** by each bus on a stop's timings shows its number as big as the screen allows, white on black, to hold up at a dark stop. The screen stays on while it's up.
- **Departures board** - **Board** on a stop's timings shows its buses full screen, like an interchange's screens: where each is going, its next three, how full they are, a page at a time. Leave a TV or spare monitor on one with a `#board/` link.
- **Will I make it?** - **How far's my walk?** under a stop's buttons says roughly how long the walk there is from where you are, and which buses you'd make if you left now; the ones you wouldn't are greyed.
- **Shake to refresh** - On a phone, a firm shake refreshes the stop's timings, for when one hand's on a pole. It can be turned off in Settings.
- **Search by voice** - In browsers that can listen, such as Chrome, the microphone in the search box takes a stop, its code or a bus, said out loud.
- **Train lines found by OneMap get their colours** - Fixed: in Navigate, train rides in the ways OneMap found (marked "Found by OneMap") had no line colour dot. They now have the same dot as the rest.
- **The Edge Tray scrolls** - When its buttons run past the bottom of the screen, as they can now in the apps, the column scrolls rather than leaving the last ones out of reach.
- **A new icon** - A green bus with an UwU face, on the site's mint, on your home screen, in the browser tab and in the apps.
- **For AI assistants** - [`llms.txt`](https://sgbus.uwuapps.org/llms.txt) tells an AI assistant how to open the app at a stop, a bus or a journey for you, and how to read the live timings.

### Android app 2.1.0

- **Share straight to Telegram and WhatsApp** - On the share card, Telegram and WhatsApp now open the app itself, ready to pick a chat, rather than a web page in the browser that then passes you on to the app. If the app isn't installed, the web page opens as before.
- **Offline Sharing** - A fifth button on the share card hands a place, directions or your live ETA to a phone next to you, with no internet on either. Hold the backs of your phones together, and it opens on theirs in SG Bus Timings, or in their browser if they don't have it. Or, without touching, send it over Bluetooth to a phone with **Receive nearby** open, a new button in the Edge Tray. The receiving phone needs the internet to plan the way there.
- **NFC stickers** - Write a stop, a place or the way home onto a blank NFC sticker, and a tap of any phone opens it: **NFC sticker** on a stop's timings, or from Offline Sharing.
- **Timings near a stop** - Pick favourite stops in Settings, and as you walk up to one, a quiet notification shows its next buses until you leave, with the app closed.
- **Time to leave** - For events in your phone's calendar with a place, a notification when it's time to set off by bus and train, with the way to go.
- **Last bus reminders** - The bell by a bus's last bus time reminds you 20 minutes before it, every day it runs.
- **"On a bus?"** - When you seem to be riding with no trip running, a quiet notification offers to start one for the Get Off Alert.
- **Bus home and Bus to work** - With Home or Work set in Places, long-press the app's icon, or add their Quick Settings tiles, to go to Navigate from where you are.
- **Search by voice, and scan a stop** - The search box's microphone uses Android's own speech screen, and its camera reads the 5-digit code off a stop's pole.
- **Earphones-only Get Off Alert** - In Settings, the alert's beeps can play only in your earphones, never out loud; without earphones in, it just buzzes.
- **Flag-down screen** - In the app, it also goes to full brightness, with the torch, steady, if you want it.
- **Trips that keep running** - The first trip offers to leave the app out of battery optimisation, so phones that stop apps in the background don't stop the trip.
- The web app's changes above.

### Wear OS app 2.1.0 (new)

- **A Bus timings tile** - On Wear OS 3 and later, the next buses at your nearest favourite stop, counting down on the watch by itself. Your favourites come from the phone's app. Tap it for every favourite stop. Installed from a computer for now: see the guide's Wear OS page.

### Desktop app 2.1.0

- **A stop's buses in the tray** - **Tray countdown** on a stop's timings puts its next buses in the tray icon's tooltip, and on a Mac beside the icon in the menu bar and on the Dock icon, refreshed every 30 seconds.
- **Favourites on the taskbar and Dock** - Your favourite stops in the Windows taskbar icon's right-click menu and the Mac's Dock menu; on Windows, Refresh and the previous and next favourite under the taskbar preview too.
- The web app's changes above.

---

## 13 October 2026 (evening): Trains on the live map follow the track

### Web app

- **Train rides follow the track** - On a trip's live map, a train ride is drawn along its line's real track, the way [sgraildata](https://github.com/cheeaun/sgraildata) maps it, from the station you board at to the one you get off at, rather than straight from station to station. Underground, where there's no GPS, your dot moves along the track too.
- **On someone's shared trip too** - Following a friend's live ETA on the map, their train rides follow the track as well, and underground their dot moves along it. Links shared before this update are drawn as before.
- **Live map stays on OpenStreetMap** - The live map no longer switches to OneMap's map when OpenStreetMap's is slow to load, as OneMap's lags. Parts of the map that didn't load, on a weak signal or underground, are fetched again once the signal's back. Shared links' preview images still use OneMap.
- A website update, so the Android and desktop apps have it as soon as they open, with no new version to install.

---

## 13 October 2026 (later): Apps 2.0.8

### Web app

- **Your places fit in Navigate** - Fixed: with more than a few places saved, the buttons under From and To ran off the side of Navigate and pushed it wider than the screen. They now wrap onto as many lines as they need, on both the Bus and train and Bus only tabs.
- **Your trips open smoothly** - Tapping a trip in Your trips now slides its details open, and tapping it again (or another trip) slides them shut, rather than snapping.

### Android app 2.0.8

- **Walking or riding, by speed** - On a trip, the app also goes by how fast you're moving, so it tells walking from riding with the screen off, when your steps can't be counted. Up to about 10 km/h is walking; a bus or train's speed, about 40 km/h on average, is riding. Riding speed 150 m down your bus's route counts as boarding, and riding speed is never taken for walking, whatever the motion sensor says.
- **Hold a card to the phone** - Hold an EZ-Link or NETS FlashPay card to your phone and Android offers SG Bus Timings for it, even with the app closed: the card's value opens straight away. While the app is open, it takes the card without asking.
- The web app's changes above.

### Desktop app 2.0.8

- The web app's changes above.

---

## 13 October 2026: Apps 2.0.7

### Web app

- **Navigate, now with Bus only** - Plan a route is now a tab in Navigate: **Bus and train** for any two places, **Bus only** for two bus stops. Switching tab keeps your two ends (a place becomes the bus stop at it, or the nearest one) and your time. The Edge Tray has one **Navigate** button, the arrowhead, which opens on the tab you used last. Saved routes are under **Bus-only routes** in Favourites.
- **Press and hold for a button's name** - On a phone or tablet, press and hold any button to see what it does, as hovering does with a mouse. Letting go doesn't press it.
- **Bigger buttons and text** - The Edge Tray's buttons and icons are bigger, and the smallest text across the app is a size up.
- **Birthday** - On your birthday the greeting says how old you're turning, "Happy 28th Birthday, Sam!", on two lines so your whole name shows. And there's confetti each time you open the app that day; turn it off in Settings with **Birthday confetti**.
- **Get Off Alert notices you've boarded sooner** - You count as on the bus once you're 150 m down its route, rather than 300 m.
- **Walking or riding** - On a trip, your phone's motion sensor tells walking from riding by your steps. Walking along a bus's route to your stop never counts as boarding; after a walk, 100 m down the next bus's route is enough once you've stopped walking; your first steps off a bus at your stop start the walk; and on a walk with no GPS, your steps move you along rather than the clock.

### Android app 2.0.7

- **Bus timings widget** - A new widget with no stop yet opens its setup wherever you tap it, as it says, not only on its title. Once set up, tapping anywhere but a bus or the refresh button opens the stop.

### Desktop app 2.0.7

- **Location on Linux** - Fixed: Stops near me, Navigate's "where I am", the live map and trips couldn't get your location in the Linux app (AppImage and .deb). It now works it out from the Wi-Fi networks around you, so Wi-Fi needs to be on. If it still can't, it says why.

---

## 12 October 2026 (night): Apps 2.0.6

### Web app

- **Get Off Alert notices you've boarded** - Fixed: on some buses, the trip didn't notice you'd got on, so it stayed at your first stop as the bus moved off. This happened when the bus used a road that the map's route for it missed, like a bus-only road. Now, if your location is off that road, the trip falls back on the line between the stops. Once you're near a stop further down the route, it counts you as on the bus whatever the road says.
- **On to the bus after a walk** - Fixed: if you waited a little way from where the walk to your stop ends, the trip stayed on the walk after you'd boarded. Once you're on the next bus, a few hundred metres down its route, the trip moves on to it.
- **Back on the trip bar** - Pressed **Next** by mistake? **Back** takes the trip back to the part before, where you'd got to on it, and its Get Off Alert can go off again. If you'd already finished that part, it starts again from the beginning, and your location puts you where you really are.
- **Parts, not legs** - The trip bar now says "part 2 of 3" rather than "leg 2 of 3", and its buttons are **Back** and **Next**. Each ride and each walk is a part. A shared live ETA says the same.

### Android app 2.0.6

- Kept in step with the web app's version; the fixes above are in the web app it shows.

### Desktop app 2.0.6

- Kept in step with the Android app's version; the fixes above are in the web app it shows.

---

## 12 October 2026 (evening): Apps 2.0.5

### Web app

- **Get Off Alert on expressways** - Fixed: on a bus that runs a long way between stops, like along an expressway to the airport, the trip didn't notice you'd boarded, so the dot stayed at your stop and the alert never came. The trip now follows the road the bus actually takes, and counts you on the bus once you're within 100 m of that road and moving along it, or once you reach a later stop.
- **Get Off Alert with the app open** - Fixed: when the server spotted your bus nearing your stop before the app did, with the Android app open, the trip bar showed the alert without a buzz, beep or notification. It now sounds like any other alert.

### Android app 2.0.5

- **Smoother tracking** - On a trip, the app asks for your location 20 times a second (as fast as your phone's GPS can give it), so the dot follows the bus closely.

### Desktop app 2.0.5

- Kept in step with the Android app's version; the fixes above are in the web app it shows.

---

## 12 October 2026: Apps 2.0.4

### Web app

- **Get ready to board** - On a trip, while you're waiting at the stop, the app checks your bus's live timing and pings you when it's **1 minute away**: a notification, two short buzzes, and the trip bar says so. Only once per bus, and only while you haven't boarded yet; with the app in the background, the server sends it instead.
- **Trip timeline** - Tap a bus stop on the trip's timeline to see that stop's timings for your bus. The timeline closes and the page scrolls down to them, with the trip still running.

### Android app 2.0.4

- **Get ready to board** has its own notification kind in Android's settings for the app, with a short double buzz rather than the Get Off Alert's "OFF".

### Desktop app 2.0.4

- **Check for updates...** - In the tray's menu: checks now, and tells you what it found, even when you're up to date.
- **Update button** - Once an update's downloaded, a green button in the title bar, right of the long screenshot button, restarts the app to install it.
- The Get Off Alert and Get ready to board show as desktop notifications.

---

## 12 October 2026 (late night): A sharp launch screen

### Android app

- **Launch screen** - The bus icon on the screen you see while the app opens is sharp now, not blurry.

---

## 12 October 2026 (night): Instant View for every share link

### Web app

- **Share to Telegram** - Shared places and live ETAs are ready for Telegram's **Instant View** too, like shared directions: a place shows where it is, and an ETA shows where they're going, when they'll get there and where they are, with the time it's from and a link on to follow along live.

---

## 12 October 2026 (evening): Instant View for shared trips

### Web app

- **Share to Telegram** - Shared directions are ready for Telegram's **Instant View**: both ends, the time and the map, right in the chat, with a link on to the app. Share's **Telegram** button sends the plain trip link, like every other button.

---

## 12 October 2026 (afternoon): The web app inside Telegram

### Telegram bot

- **Open app** - The menu button beside the message box now opens the full web app inside Telegram, as a Mini App. **Open web app** on `/start` opens it there too.

### Web app

- **In Telegram** - Opened from the bot, the app takes on its theme's colours in Telegram's bar, Telegram's **Back** closes the live map, links out open in your browser, and swiping down no longer closes the app while you're moving the live map.

---

## 12 October 2026 (morning): Apps 2.0.2

### Web app

- **Sync** - Now called **Sync with another device**, it copies your name and birthday and your past searches too, as well as favourites, places and trips.
- The Edge Tray keeps its buttons full size when the keyboard's open, scrolling instead of squashing them.

### Android app 2.0.2

- **Bus timings widget** - A stop's live timings on your home screen, resizable any way, for every bus or just the ones you pick.
- **Picture-in-picture** - During a trip or with the live map open, going home shrinks the app into a small window over your other apps.
- **Card value** - Reads the card's value correctly, and lists its recent rides and top-ups.
- **Share** - **More** on share cards opens Android's share sheet.
- Sharper notification icon.

### Windows and Linux apps 2.0.2

- **Bus timings widgets** - A stop's live timings in a small window on your desktop, from the tray's **Add a Bus timings widget**.
- **Updates itself** - Checks for new versions; the `.exe` and AppImage install them with a restart.
- Opens maximised, and starts when you sign in (the tray's menu turns that off).
- Sharper tray icon.

---

## 12 October 2026 (late): Apps 2.0.1

### Android app 2.0.1

- **Card value** - Auto top-up only shows for a card that has it turned on. A value the card can't really hold now says it couldn't be read rather than showing a wrong amount, and **Card data** lets you copy what the card said, without its number, to report a card that reads wrongly.

### Windows and Linux apps 2.0.1

- **App links** - `uwu://sgbus/` links open the desktop app, such as `uwu://sgbus/84009` for a stop.

---

## 12 October 2026 (later): Live map, walks on trips, and the 2.0 apps

### Web app

- **Live map** - Directions on a stop, and on a walk in Navigate, now open a live map instead of Google Maps: OpenStreetMap, following where you are, with the walk drawn turn by turn and the next turn spelt out. It opens close in at street level, and **Overview** shows the whole way at once. Stray from it and it finds the way again. Citymapper is still there too.
- **Live map on trips** - The map button on the trip bar shows the whole trip, every ride and walk, with its stops and you on it.
- **Walks on trips** - A trip now starts with the walk to your first stop, includes the walks between rides, and ends with the walk to where you're going, rather than starting at the first stop and ending at the last. Each walk shows on the timeline, and the trip moves on as you get there. A way that's all walking can be followed as a trip too.
- **Follow a shared trip live** - Someone you share your ETA with now sees your dot move: on the live map (**Follow on the map**) or on a timeline of your stops, updated every 10 seconds.
- **Navigate's button** in the Edge Tray is now a train, so it isn't mistaken for directions.
- **No more ads**, on the web app or the guide.

### Android app 2.0.0

- **Rebuilt as a real app** (Capacitor instead of a Chrome wrapper). 1.2.0 updates to it like any update.
- **Trips with the screen off** - The Get Off Alert follows your trip with the phone locked, with an "On a trip" notification (and End trip on it), and sounds over the lock screen. The first trip also asks to allow location all the time.
- **Card value** - Hold an EZ-Link or NETS FlashPay card to the back of the phone to see what's on it, with its expiry and auto top-up: the card button in the Edge Tray, or long-press the app's icon. On phones with NFC.
- **Service alerts as notifications** in the app.

### Windows and Linux apps 2.0.0

- **SG Bus Timings for Windows** (`.exe` or `.msi`) **and Linux** (`.deb` or `.AppImage`), from the releases page. It stays in the tray when closed, shows Service alerts as desktop notifications, and can start when you sign in.

### Telegram bot

- **Live map** - A stop's Directions now offers **Live map**, which opens the web app's live map (or the Android app's, if you have it) walking you to the stop, in place of Google Maps.

---

## 12 October 2026: The Android app updates itself

### Web app

- **App updates** (Android app 1.2.0) - When there's a new version of the Android app, a bar at the top says so. Tap **Update** and the app downloads it and opens Android's installer, with nothing to find on GitHub. The first time, Android asks you to allow SG Bus Timings to install apps. On 1.1.0, the bar's **Download** opens the new version on GitHub, to install once by hand.
- **App links** (Android app 1.2.0) - App links are now `uwu://sgbus/`: `uwu://sgbus/84009` for a stop, `uwu://sgbus/nav` for Navigate. `uwusgbus://` links no longer open the app.

---

## 11 October 2026 (later): Your trips, Places, past searches and calendar

### Web app

- **Your trips and stats** - Every trip you take with the Get Off Alert is kept in Your trips (the bar chart in the Edge Tray), grouped by week, with each ride's wait and ride time. Tap a trip to plan it again, share it as a link, or delete it. Below the trips, **Trip Mix** shows how your time splits between walking, waiting and riding, and **Trip Modes** which operators and lines you ride most (SBS Transit, SMRT, Tower Transit, Go-Ahead Singapore, MRT, LRT).
- **Places** - A new Places window (the bookmark in the Edge Tray) keeps Home, Work and any other place, with a name of your own like "Gym" or "Mum's". Tap one for the way there; its menu edits, shares or deletes it. Every place is also a button under the ends of Navigate and Plan a route. Home and Work moved here from Settings.
- **Share a place or a trip** - Share Home, Work or any place as a "How to get to" link, and share a past trip as a link with every way there.
- **Past searches** - Tap into any search box (the main search, Navigate, Plan a route, Places) and it drops down what you searched for before, from the last 24 hours and earlier, with tabs for your saved places and, in Navigate, your calendar. Each search can be saved as a place, shared or removed.
- **Calendar** - Link your calendar by its private iCal link (Google Calendar, Outlook, iCloud), or import an .ics file, and its events with a location show in Navigate for the next two weeks. Tap one for the way there, arriving by its start.
- **Sync** - Syncing favourites between devices now copies your places and trips too.

### Telegram bot

- **/places** - Home, Work and your own places: get there, share as a link, rename, move or delete. **/addplace** saves a new one. Your places are buttons on the `/nav` and `/route` panels too.
- **/calendar** - Link your calendar's private iCal link once, then see its events with a location, each a button that plans the way there to arrive on time.

### Fixes

- A search box no longer closes its suggestions when you tap back into it quickly.
- The menus behind the three dots, in Places, past searches and Calendar, now slide open and closed.
- **SimplyGo** - On a phone or tablet, SimplyGo's icon in the Edge Tray goes to its app, for your card balance, top-ups and travel history. It opens SimplyGo's store page, where Open launches the app; with the Android app, SimplyGo itself.
- **Android app** - SG Bus Timings is now an Android app too, shared as an APK file on GitHub Releases: the same app, full screen, opening SimplyGo straight from its button.
- **Your phone's calendar** (Android app 1.1.0) - The Calendar tab can read your phone's own calendar, every calendar on it, with nothing to paste.
- **App links** (Android app 1.1.0) - `uwusgbus://` links open the app: `uwusgbus://84009` for a stop, `uwusgbus://nav` for Navigate.

---

## 11 October 2026: Home and Work, and short share links

### Web app

- **Home and Work** - Set them once, then tap Home or Work under either end of Navigate or Plan a route.
- **Share menu** - Navigate's Share makes short links: your live ETA on a trip (`/eta/...`), these directions (`/trip/...`), or the start or end (`/go/...`). A live ETA keeps updating while the app is in the background.
- **Start trip on OneMap ways** - Ways found by OneMap can now be followed as a trip, and a way that can't be followed says so instead of closing Navigate.

### Telegram bot

- **Home and Work** - `/sethome` and `/setwork`, or Set home / Set work in `/settings`, add Home and Work buttons to the `/nav` and `/route` panels.

### Guide

- The top bar stays pinned as you scroll, with a back to top button on every page.

---

## 10 October 2026: Edge Tray, sharing and Google Maps links

- **Edge Tray** - The top buttons moved into a tray fixed to the corner of the screen, tucked away with its arrow. Settings picks left or right. Favourites open in their own window from the star, with a count.
- **Windows** - Navigate, Plan a route and Service alerts open as windows over the page; tap outside or the close button to go back.
- **Share** - Share a nav or a planned route as a link, even part filled in.
- **Google Maps links** - Paste a Google Maps link into Navigate, or share a place from Google Maps to the installed app, and it becomes that end. The bot's `/nav` takes them too.
- **Fix** - The route planner's "stops near me" buttons work again.

---

## 9 October 2026: Leave at and Arrive by

- **Pick a time** - Navigate and Plan a route take Leave now, Leave at or Arrive by, up to a week ahead, and only plan with buses and trains running then. Each way shows its clock times. In the bot, a clock button picks the time.

---

## 3 to 5 October 2026: Navigate, Get Off Alert, Service Alerts and the guide

### Web app

- **Navigate** - Get from any place to any other by bus, train or both, with every worthwhile mix to choose from and walking directions for each walk.
- **Get Off Alert** - Start a trip and the app follows your location, then buzzes "OFF" in Morse code, beeps and notifies you two stops before each change and your stop, even in the background. Tap the trip bar for a timeline of the stops ahead.
- **Service Alerts** - Train service alerts and traffic incidents, with notifications even when the app is closed; trains and traffic chosen separately.
- **Weather** - Today's forecast, rain and air quality (PSI and PM2.5).
- **Disruptions bar** - Shows while a train line is disrupted.
- **App shortcuts and a Windows widget** for bus timings.
- **Route planner** - Picking an end lists stops with a direct bus first.
- **Faster** stop pages and route planning, and a notification icon that shows on Android's status bar.
- **Guide** - A full guide at guide.sgbus.uwuapps.org, with screenshots.

### Telegram bot

- **/nav** and **/mynavs**, **/sub**, **/unsub** and **/alerts** for Service Alerts.
- Stops that share a name are told apart by area; search finds stops by MRT or LRT station.

---

## 30 September to 2 October 2026: The bot's features come to the web app

### Web app

- **Bus numbers** - Search a bus number to see its route, with landmarks and the stops ahead.
- **Stop timings** - Pick a bus, first and last bus times, directions to the stop, and bendy buses marked.
- **Favourites** - Favourite buses and routes as well as stops, pinned to the top or bottom.
- **Stops near me** and **postal code search**.
- **Plan a route** - Every bus between two stops, or journeys with up to three changes, with live part-by-part timings. Spots an end on the wrong side of the road and offers the stop across it.
- **Settings** - Your name and a birthday greeting.
- **Sync favourites** between devices on the same network, with a code or QR code.

### Telegram bot

- `/newroute` and `/favroutes` are now **/route** and **/myroutes**, and suggest journeys with changes when no single bus links two stops.
- **Routines** can pick which buses they send.

---

## 23 September 2026: Time-based theme and updates

- **Time-based mode** - Light from 09:00, dark from 18:00, switching by itself.
- **Update bar** - A new version waits for you to tap Reload. The app shell works offline; live timings always come from the network.

---

## 16 July to 5 September 2026: Dark mode and the Telegram bot

### Web app

- **Dark mode**, a new logo, and new screenshots.
- **Distance badge** - Shows an approximate distance when a bus has no GPS fix.
- **Directions** - Open a stop in Google Maps or Citymapper from its timings.

### Telegram bot

- **Launched** at [@UwUsgbus_bot](https://t.me/UwUsgbus_bot): timings by stop code, name or location, and inline mode in any chat.
- **Favourites** - Favourite stops and buses, pinned to the top or bottom.
- **Routines** - Timings sent to you on a schedule.
- **Settings** - Your name, birthday wishes and notification preferences.
- **Bus routes** - Paginated stops with first and last bus times, landmarks, and the stops onward from where you are.
- **Routes** - Build a route between two stops, from a name, code or location, and save it.
- **/done** and **/cancel** for any multi-step flow.

---

## 18 April 2026: New look

### New Look (Glassmorphism UI Redesign)
The entire app has been redesigned with a frosted glass aesthetic. Cards now use backdrop blur and translucent backgrounds for a cleaner, more modern feel. Font has been updated to Jua across the board.

### Theme Picker
Pick from 7 colour themes directly in the app. Your choice is saved and applied instantly on next load, no flash of the wrong colour.

- Classic
- Not Green 1 through 5
- Really Really Light Green

### Incoming Buses Bar
A new summary bar now appears inside each result card. It shows the next bus arriving from each service at your stop, sorted by ETA, so you can see everything at a glance without scrolling through the full list.

### Favourites Now Show Stop Names
Favourite stops now save the stop name alongside the stop code. Your saved chips will display both so you know exactly which stop you are looking at.

### Official LTA Bus Stop Data
Bus stop names and road names now come directly from the LTA DataMall API instead of a third-party source. Search now also matches by road name, so you can type a street to find nearby stops.

### Support the App
A donation button has been added to the nav bar. If you find the app useful, you can buy Augy a coffee!

### Bug Fixes

- **Distance badge** - Buses without a GPS fix no longer show a spurious large distance. They are now marked in italics to indicate the location is approximate.
- **Route direction tabs** - Each direction tab now only shows stops for that direction. Previously both directions could bleed into the same list.
- **Operator info** - The info modal now shows only the operators for the service you looked up, not all services.
- **Current direction detection** - The app now auto-selects the direction tab that contains your current stop and labels it "(current)". The second direction tab is hidden when there is no data for it.
- **Bus service direction and coordinate parsing** - Fixed an issue where direction detection and GPS coordinates were not being read correctly from the LTA API.
- **Bus route pagination** - The LTA BusRoutes API has a 500-record cap and does not support server-side filtering. Route fetching now paginates correctly and filters client-side, so full route data is loaded reliably.

---

Check it out at https://sgbus.uwuapps.org
