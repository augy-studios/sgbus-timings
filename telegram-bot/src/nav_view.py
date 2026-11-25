"""Messages and buttons for /nav: the panel with both ends and the ways between them, sorted,
tagged, with their fares and the buses you'd catch, live (ways.py, as the web app's js/ways.js);
one way leg by leg with live bus timings; and the /mynavs list. The journeys come from the
site's /api/nav (nav_api.py), the same as the web app's Navigate."""

from telethon import Button

import re
from datetime import timedelta
from urllib.parse import quote

from . import ways as W
from .bus_services import service_category
from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .config import config
from .format import _format_eta, escape_md
from .navs import is_favourite_nav, list_favourite_navs, row_via
from .pagination import nav_row, paginate
from .saved_places import KINDS, list_places
from .user_settings import get_fare_type, get_nav_sort, get_preferred_buses
from .when import at_to_dt, clock, clock_day, describe, live_lead, now, span

MAX_OPTIONS = 8

PROMPTS = {
    "from": "Send where you're starting: an address, a building, a postal code, an MRT station, a bus stop, a Google Maps link, GPS coordinates, a plus code, or your location.",
    "to": "Now send where you're going: an address, a building, a postal code, an MRT station, a bus stop, a Google Maps link, GPS coordinates, a plus code, or your location.",
}

# What to say when /api/places finds nothing, for /nav, /places and Home and Work alike.
NO_MATCH = ("Nothing matched that. Try an address, a building, a postal code, a station, a bus stop, "
            "GPS coordinates or a plus code.")

PLACE_ICONS = {"station": "🚆", "stop": "🚌", "place": "📍"}


# A train ride whose train is one of the day's last three there (the site's
# api/_nav/last-trains.js: `lastTrainRank` 3, 2 or 1, and `lastTrain` when the last leaves). As
# the site's way cards and rides word it (js/nav.js); keep in step.
_RANK_SHORT = {3: "3rd last", 2: "2nd last", 1: "last"}


def last_train_text(leg: dict) -> str:
    to = _place_name(leg.get("to")) or "its stop"
    rank = leg.get("lastTrainRank")
    if rank in (2, 3):
        return f"Only the last {rank} trains to {to} are left today. The last is at {leg['lastTrain']}."
    return f"Last train to {to} from here today is at {leg['lastTrain']}. Don't miss it."

def place_button_text(p: dict) -> str:
    """A found place as its Did you mean button reads, with what tells it apart from the
    others: a stop's code and road ("🚌 Blk 109 · 84221 · Bedok Nth Rd"), a station's codes,
    a place's address. The icon already says it's a bus stop."""
    sub = (p.get("sub") or "").removeprefix("Bus stop ")
    text = f"{PLACE_ICONS.get(p['kind'], '📍')} {p['label']}" + (f" · {sub}" if sub else "")
    return text if len(text) <= 64 else text[:63] + "…"


def _metres(m) -> str:
    return f"{m / 1000:.1f} km" if m >= 1000 else f"{round(m)} m"


def _stop_name(code: str) -> str:
    """A stop as "Name (code)", or just its code when it isn't in the stop list."""
    row = get_bus_stop_by_code(code)
    return f"{row['name']} ({code})" if row else code


def _place_name(p: dict) -> str:
    if not p:
        return ""
    if p.get("kind") == "station":
        return f"{p['name']} station"
    if p.get("kind") == "stop" and p.get("code"):
        return f"{p['name']} ({p['code']})"
    return p.get("name") or ""


def _rides(option: dict) -> list:
    return [leg for leg in option["legs"] if leg["mode"] != "walk"]


def _chip(leg: dict) -> str:
    return f"🚌 {leg['route']}" if leg["mode"] == "bus" else f"🚆 {leg['route']}"


_REPORTED_RE = re.compile(r"^[(]\d+/\d+[)]\d+:\d+\s*")


def traffic_text(t: dict) -> str:
    """What a bus leg's traffic is, and why: "~6 min slower than usual: heavy traffic on Bedok
    North Road. Accident: on PIE (towards Tuas) after Adam Rd Exit." As the web app says it
    (js/nav.js, trafficText)."""
    parts = []
    if t.get("extra", 0) >= 1:
        roads = t.get("roads") or []
        parts.append(f"~{t['extra']} min slower than usual" + (f": heavy traffic on {' and '.join(roads)}" if roads else "") + ".")
    for i in t.get("incidents") or []:
        # LTA's message starts with when it was reported, "(25/10)00:41", said already.
        message = _REPORTED_RE.sub("", i["message"])
        parts.append(message if message.lower().startswith(i["type"].lower()) else f"{i['type']}: {message}")
    return " ".join(parts)


def traffic_url(leg: dict) -> str:
    """The web app's live map of a bus leg's road, coloured by its traffic (#traffic/)."""
    points = ";".join(f"{lat:.4f},{lng:.4f}" for lat, lng in leg.get("path") or [])
    title = f"Bus {leg['route']} to {leg.get('to', {}).get('name') or 'its stop'}"
    return config.webapp_url.rstrip("/") + "/#traffic/" + quote(f"{points}~{title}", safe=";,~")


def option_summary(option: dict) -> str:
    """"🚆 EW → 🚌 25 · 1 change, 111 m walk"."""
    if option.get("walkOnly"):
        return "🚶 Walk all the way"
    rides = _rides(option)
    walk = sum(leg.get("metres", 0) for leg in option["legs"] if leg["mode"] == "walk")
    changes = len(rides) - 1
    change_text = "no change" if changes == 0 else f"{changes} change{'s' if changes > 1 else ''}"
    return f"{' → '.join(_chip(leg) for leg in rides)} · {change_text}, {_metres(walk)} walk"


def _ends_lines(start: "dict | None", end: "dict | None", when=None, via=None) -> tuple[list, list]:
    md = [
        f"**From:** {escape_md(start['label']) if start else '_not set_'}",
        *([f"**Stop on the way:** {escape_md(via['label'])}"] if via else []),
        f"**To:** {escape_md(end['label']) if end else '_not set_'}",
        f"**When:** {escape_md(describe(when))}",
    ]
    plain = [
        f"From: {start['label'] if start else 'not set'}",
        *([f"Stop on the way: {via['label']}"] if via else []),
        f"To: {end['label'] if end else 'not set'}",
        f"When: {describe(when)}",
    ]
    return md, plain


def _ends_payload(start, end, when=None, via=None) -> dict:
    """What every /nav button carries: both ends, the time picked when there is one, and the
    stop on the way when there is one (a starred nav's)."""
    return {"from": start, "to": end, **({"when": when} if when else {}), **({"via": via} if via else {})}


def _clocks(when, minutes) -> str:
    """"08:12 → 08:50" for a way, by the time picked."""
    leave, arrive = span(when, minutes)
    return f"{clock(leave)} → {clock(arrive)}"


def _too_late(when, minutes) -> bool:
    """For Arrive by: a way you'd have had to set off on already."""
    return bool(when) and when["mode"] == "arrive" and span(when, minutes)[0] < now() - timedelta(minutes=1)


# How full a bus is, as the web app colours its timings: seats, standing, limited standing.
LOAD_DOTS = {"SEA": "🟢", "SDA": "🟡", "LSD": "🔴"}
# The buses shown for a leg, its own and the others straight there.
LIVE_SHOWN = 4


def first_bus(option: dict, when) -> "dict | None":
    """A way's first ride when it's a bus with live timings to show: leaving now, or soon
    enough for them to be the buses you'd catch."""
    if not option_is_live(option, when):
        return None
    first = next((leg for leg in option.get("legs") or [] if leg["mode"] != "walk"), None)
    return first if first and first["mode"] == "bus" and not first.get("campus") and (first.get("from") or {}).get("code") else None


def _eta_text(ms: int, clock_times: bool) -> str:
    """Whole minutes, so three fit on a line ("Arr", "7 min"), or the clock time."""
    if clock_times:
        return _format_eta(ms, True)
    return "Arr" if ms < 60000 else f"{ms // 60000} min"


def live_lines(leg: dict, arrivals: "dict | None", direct: list, clock_times: bool = False) -> list:
    """Each bus that goes straight from a bus leg's stop to where it's left, its own first then
    the soonest, with its next three and how full each is: "🚌 21 · 7 min 🟢 · 19 min 🟢 · 25 min 🟡".
    `direct` is every bus that does (journeys.direct_services). As the web app's liveRows."""
    if not arrivals:
        return []
    own = str(leg["route"])
    services = {str(s["serviceNo"]).upper(): s for s in arrivals.get("services") or []}
    rows = []
    for no in [own, *(b for b in direct if b.upper() != own.upper())]:
        svc = services.get(no.upper())
        buses = [b for b in ((svc or {}).get(k) for k in ("next", "next2", "next3")) if b and b.get("etaMs") is not None]
        if buses or no == own:
            rows.append((no, buses))
    if not any(buses for _, buses in rows):
        return []
    rows.sort(key=lambda r: (r[0] != own, r[1][0]["etaMs"] if r[1] else float("inf")))
    return [
        f"🚌 {no} · " + (" · ".join(f"{_eta_text(b['etaMs'], clock_times)}{' ' + LOAD_DOTS[b['load']] if b.get('load') in LOAD_DOTS else ''}" for b in buses) or "no live timing")
        for no, buses in rows[:LIVE_SHOWN]
    ]


def _fare(option: dict, fare_type: str) -> "str | None":
    f = W.fare(option, fare_type, service_category)
    return f"~{W.fare_text(f['cents'])}" if f else None


def sort_rows(ends: dict, on: str) -> list:
    """Best, Fastest, Least walking and Fewest changes, two to a row, the one picked ticked."""
    buttons = [Button.inline(f"{'✅ ' if k == on else ''}{W.SORT_NAMES[k]}", make_button("nav_sort", {**ends, "sort": k})) for k in W.SORTS]
    return [buttons[:2], buttons[2:]]


def build_nav_panel(chat_id: int, start, end, awaiting: "str | None" = None, result: "dict | None" = None, error: "str | None" = None, when=None, via=None,
                    live: "dict | None" = None, direct: "dict | None" = None, clock_times: bool = False):
    """The /nav panel. With both ends set and `result` from the API, the ways between them,
    in the chat's sort, a button each; otherwise a prompt for the end it's waiting on. `when` is
    the time picked (when.py), None for Leave now; `via` a stop on the way, from a starred nav.
    `live` maps a stop code to its arrivals (lta.fetch_arrivals), for each way's first bus, and
    `direct` a (from, to) pair of codes to the buses straight between them."""
    live = live or {}
    direct = direct or {}
    md_ends, plain_ends = _ends_lines(start, end, when, via)
    md = ["# 🧭 Navigate by bus and train", "", *md_ends, ""]
    plain = ["🧭 Navigate by bus and train", "", *plain_ends, ""]
    buttons = []

    if awaiting:
        prompt = "✏️ " + PROMPTS[awaiting]
        md.append(f"_{escape_md(prompt)}_")
        plain.append(prompt)
    elif error:
        md.append(escape_md(error))
        plain.append(error)
    elif result is not None:
        sort = get_nav_sort(chat_id)
        fare_type = get_fare_type(chat_id)
        own = [{**p, "buses": p.get("buses") or []} for p in list_places(chat_id)]
        buses = W.preferred_for(end, get_preferred_buses(chat_id), own)
        options = W.order((result.get("options") or [])[:MAX_OPTIONS], sort, buses)
        tagged = W.tags(options, buses)
        if not options:
            line = (f"No way by bus or train running {'at that time' if when else 'right now'} was found between "
                    "these two places. Try another time, or somewhere nearby.")
            md.append(line)
            plain.append(line)
        else:
            head = (f"{len(options)} way{'s' if len(options) != 1 else ''} to get there, by {W.SORT_NAMES[sort].lower()}. "
                    "Every mix of bus and train, not just the fastest:")
            md += [head, ""]
            plain += [head, ""]
            for i, o in enumerate(options, 1):
                extra = []
                fare = _fare(o, fare_type)
                if fare:
                    extra.append(fare)
                if o.get("onemapMinutes") is not None:
                    extra.append(f"OneMap ~{o['onemapMinutes']} min")
                if o.get("source") == "onemap":
                    extra.append("found by OneMap")
                for leg in _rides(o):
                    if leg.get("lastBus"):
                        extra.append(f"⏰ last {leg['route']} {leg['lastBus']}")
                    if leg.get("lastTrain"):
                        extra.append(f"⏰ {_RANK_SHORT.get(leg.get('lastTrainRank'), 'last')} {leg['route']} train, last {leg['lastTrain']}")
                    if (leg.get("traffic") or {}).get("extra", 0) >= 1:
                        extra.append(f"🚦 {leg['route']} +{leg['traffic']['extra']} min in traffic")
                warn = " ⚠️" if o.get("disrupted") else ""
                late = " (too late)" if _too_late(when, o["minutes"]) else ""
                # With a time picked, the clock times lead.
                lead = f"{_clocks(when, o['minutes'])}{late} · ~{o['minutes']} min" if when else f"~{o['minutes']} min"
                tags = " ".join(W.TAG_NAMES[t] for t in tagged[i - 1])
                text = f"{i}. {lead} · {option_summary(o)}{' · ' + ', '.join(extra) if extra else ''}{warn}"
                lines = [text, *([f"   {tags}"] if tags else [])]
                # The buses you'd catch, live, for a way whose first ride is a bus.
                leg = first_bus(o, when)
                if leg:
                    rows = live_lines(leg, live.get(leg["from"]["code"]), direct.get((leg["from"]["code"], (leg.get("to") or {}).get("code"))) or [], clock_times)
                    if rows:
                        lines += [f"   🟢 Live from {leg['from'].get('name') or leg['from']['code']}:", *(f"   {r}" for r in rows)]
                md += [escape_md(line) for line in lines]
                plain += lines
                short = _clocks(when, o["minutes"]) if when else f"~{o['minutes']} min"
                buttons.append(
                    [Button.inline(f"{i} · {short} · {' → '.join(leg['route'] for leg in _rides(o)) or 'walk'}"[:64],
                                   make_button("nav_option", {**_ends_payload(start, end, when, via), "option": o}))]
                )
            # Walking or cycling the whole way, where it might compete (the API only sends it then).
            best = min((o["minutes"] for o in options if not o.get("walkOnly")), default=None)
            others = result.get("others") or {}
            lines = []
            for kind, icon, what in (("walk", "🚶", "Walk there"), ("cycle", "🚲", "Cycle there")):
                o = others.get(kind)
                if o:
                    quicker = ", quicker than any bus or train" if best is not None and o["minutes"] < best else ""
                    lines.append(f"{icon} {what}: ~{o['minutes']} min, {_metres(o['distance'])}{quicker}")
            if lines:
                md += ["", *(escape_md(line) for line in lines)]
                plain += ["", *lines]
            traffic = " Bus times allow for the traffic right now, from LTA; 🚦 marks a bus it slows." if result.get("traffic") else ""
            stop = " No time is counted at your stop on the way." if via else ""
            fares = (f" Fares are {W.FARE_NAMES[fare_type].lower()} card fares by distance, roughly; 🟢 🟡 🔴 say how full a bus is. "
                     "Pick your fare type and the buses you'd rather take in /settings.") if any(_fare(o, fare_type) for o in options) else ""
            note = ("Times include walking and an average wait to board. Only buses and trains running at the time "
                    f"are used. ⚠️ marks a line LTA reports a disruption on, ⏰ a last bus of the day.{traffic}{stop}{fares}")
            md += ["", f"_{escape_md(note)}_"]
            plain += ["", note]

    ends = _ends_payload(start, end, when, via)
    if result is not None and len(result.get("options") or []) > 1 and not awaiting and not error:
        buttons += sort_rows(ends, get_nav_sort(chat_id))
    if start and end:
        fav = is_favourite_nav(chat_id, start, end, via)
        buttons.append([
            Button.inline("⭐ Remove favourite" if fav else "⭐ Add favourite", make_button("nav_fav", ends)),
            Button.inline("🔄 Refresh", make_button("nav_show", ends)),
        ])
    # A starred nav's stop on the way, which planning goes by until it's taken off.
    if via:
        buttons.append([Button.inline("✖️ Remove the stop on the way"[:64], make_button("nav_via_off", ends))])
    # The end being waited on swaps its letter for a pencil, as on the /route panel.
    buttons.append([
        Button.inline(f"{'✏️' if awaiting == 'from' else '🅰'} Set start", make_button("nav_set", {**ends, "field": "from"})),
        Button.inline(f"{'✏️' if awaiting == 'to' else '🅱'} Set end", make_button("nav_set", {**ends, "field": "to"})),
    ])
    buttons += saved_place_rows("nav_saved", ends, chat_id=chat_id)
    buttons.append([Button.inline(f"🕒 {describe(when)}"[:64], make_button("nav_when", ends))])
    return {"markdown": "\n".join(md).strip(), "fallback": "\n".join(plain).strip()}, buttons


def saved_place_rows(action: str, payload: dict, fields=("from", "to"), chat_id: "int | None" = None) -> list:
    """Home and Work for each end, as the web app has under each box: "🏠 From home",
    "💼 To work". `fields` are the panel's own names for its two ends. With `chat_id`, the
    chat's own places (/places) follow, two to a row, after Home and Work."""
    rows = [
        [
            Button.inline(f"{icon} {word} {name.lower()}", make_button(action, {**payload, "field": field, "kind": kind}))
            for kind, (icon, name) in KINDS.items()
        ]
        for field, word in zip(fields, ("From", "To"))
    ]
    own = [p for p in list_places(chat_id) if p["kind"] not in KINDS] if chat_id is not None else []
    for field, word in zip(fields, ("From", "To")):
        buttons = [
            Button.inline(f"{p['icon']} {word} {p['name']}"[:64], make_button(action, {**payload, "field": field, "kind": p["kind"]}))
            for p in own
        ]
        rows += [buttons[i:i + 2] for i in range(0, len(buttons), 2)]
    return rows


def option_is_live(option: dict, when) -> bool:
    """Whether a way sets off soon enough for live bus timings to be the buses you'd catch:
    always for Leave now, and within half an hour for a picked time."""
    return not when or live_lead(span(when, option["minutes"])[0]) is not None


def build_nav_option(start, end, option: dict, timings: dict, when=None, clock_times=False, via=None, direct: "dict | None" = None, fare_type: str = "adult"):
    """One way, leg by leg. `timings` maps a bus leg's index to the arrivals at its stop
    (lta.fetch_arrivals, or None when LTA has none), and `direct` that index to the buses that
    go straight to where it's left; for a way setting off too far ahead for those
    (option_is_live), each bus and train says when it's boarded instead, by the clock.
    `clock_times` shows the ETAs as the time each bus comes (Settings' Bus times)."""
    direct = direct or {}
    ends = [start["label"], *([via["label"]] if via else []), end["label"]]
    fare = _fare(option, fare_type)
    head = f"~{option['minutes']} min" + (f" · {fare}" if fare else "")
    md = [f"# 🧭 {escape_md(head)}", " → ".join(escape_md(x) for x in ends), ""]
    plain = [f"🧭 {head}", " → ".join(ends), ""]
    buttons = []
    legs = option["legs"]
    live = option_is_live(option, when)
    leave, arrive = span(when, option["minutes"])
    if when:
        if _too_late(when, option["minutes"]):
            line = f"⚠️ To arrive by {clock(at_to_dt(when['at']))} you'd have had to leave by {clock(leave)}."
        else:
            line = f"🕒 Set off around {clock_day(leave)}, arrive around {clock(arrive)}."
        md += [escape_md(line), ""]
        plain += [line, ""]

    def board_line(leg, after_wait):
        if not when or leg.get("board") is None:
            return None
        return f"   Board around {clock(leave + timedelta(minutes=leg['board']))}{', after an average wait' if after_wait else ''}."
    for k, leg in enumerate(legs):
        if leg["mode"] == "walk":
            # To and from a station by the exit nearest the walk's other end (the site's
            # js/nav-core/router.js, toExit and fromExit), where it has a name.
            from_exit = (leg.get("fromExit") or {}).get("name")
            if from_exit:
                was = leg.get("from") or (legs[k - 1].get("to") if k else None)
                line = f"🚪 Leave {_place_name(was) or 'the station'} by Exit {from_exit}."
                md.append(escape_md(line))
                plain.append(line)
            to_exit = (leg.get("toExit") or {}).get("name")
            where = end["label"] if k == len(legs) - 1 else _place_name(leg.get("to")) + (f", Exit {to_exit}" if to_exit else "")
            line = f"🚶 Walk ~{leg['metres']} m to {where}, ~{max(1, round(leg['minutes']))} min"
            md.append(escape_md(line))
            plain.append(line)
        elif leg["mode"] == "train":
            towards = f", towards {leg['towards']}" if leg.get("towards") else ""
            line = (f"{_chip(leg)} {leg.get('name') or leg['route']} from {_place_name(leg['from'])}{towards}: "
                    f"{leg['stops']} stop{'s' if leg['stops'] != 1 else ''} to {_place_name(leg['to'])}, ~{round(leg['minutes'])} min")
            md.append(escape_md(line))
            plain.append(line)
            board = board_line(leg, after_wait=False)
            if board:
                md.append(escape_md(board))
                plain.append(board)
            if leg.get("lastTrain"):
                note = f"   ⏰ {last_train_text(leg)}"
                md.append(escape_md(note))
                plain.append(note)
            if leg.get("disrupted"):
                note = "   ⚠️ LTA reports a disruption on this line. Send /alerts for details."
                md.append(escape_md(note))
                plain.append(note)
        else:
            towards = f", towards {leg['towards']}" if leg.get("towards") else ""
            line = (f"{_chip(leg)} from {_place_name(leg['from'])}{towards}: "
                    f"{leg['stops']} stop{'s' if leg['stops'] != 1 else ''} to {_place_name(leg['to'])}, ~{round(leg['minutes'])} min")
            md.append(escape_md(line))
            plain.append(line)
            if live:
                rows = live_lines(leg, timings.get(k), direct.get(k) or [], clock_times)
                eta_lines = ([f"   🟢 Live, buses straight to {_place_name(leg.get('to')) or 'its stop'}:", *(f"   {r}" for r in rows)] if rows
                             else ["   No live timings for this bus right now."])
            else:
                eta_lines = [line] if (line := board_line(leg, after_wait=True)) else []
            for eta_line in eta_lines:
                md.append(escape_md(eta_line))
                plain.append(eta_line)
            if leg.get("lastBus"):
                line = f"   ⏰ Last {leg['route']} from here today is at {leg['lastBus']}. Don't miss it."
                md.append(escape_md(line))
                plain.append(line)
            if leg.get("traffic"):
                line = f"   🚦 {traffic_text(leg['traffic'])}"
                md.append(escape_md(line))
                plain.append(line)
            # Every bus's stops and road on the map, slowed or not (the site's Route on the map).
            if len(leg.get("path") or []) >= 2:
                buttons.append([Button.url(f"🗺 {leg['route']}'s route on the map"[:64], traffic_url(leg))])
            # Each crossing of the Causeway (/api/nav's `customs`): off, through both, on again.
            for c in leg.get("customs") or []:
                first, second = ("Singapore's", "Malaysia's") if c["way"] == "out" else ("Malaysia's", "Singapore's")
                line = (f"🛂 Get off at {_stop_name(c['from'])} and clear {first} immigration, ride any bus across to "
                        f"{_stop_name(c['to'])} and clear {second}, then get on again: ~{c['minutes']} min for both, by the time of day.")
                md.append(escape_md(line))
                plain.append(line)
            if leg.get("from", {}).get("code"):
                # The way rides along, so the timings can come back to it.
                way = {**_ends_payload(start, end, when, via), "option": option}
                buttons.append([Button.inline(f"🚏 {leg['route']} at {leg['from']['name']}"[:64],
                                              make_button("stop", {"code": leg["from"]["code"], "bus_no": leg["route"], "nav": way}))])
    note = ("Train times are estimates from distance; bus timings are live from LTA, 🟢 🟡 🔴 for how full each bus is." if live
            else "Times are estimates from distance, with an average wait to board. "
                 "Live bus timings show here from half an hour before you set off.")
    if fare:
        note += f" The fare is a {W.FARE_NAMES[fare_type].lower()} card fare by distance, roughly."
    md += ["", f"_{escape_md(note)}_"]
    plain += ["", note]
    # A live trip of this way, as a widget that updates by itself and can be shared
    # (bot_trips.py): only for a way that sets off now or soon, and has a ride to follow.
    if live and any(leg["mode"] in ("bus", "train") for leg in legs):
        buttons.append([Button.inline("▶️ Start trip", make_button("trip_start", {**_ends_payload(start, end, when, via), "option": option}))])
    buttons.append([
        Button.inline("🔄 Refresh", make_button("nav_option", {**_ends_payload(start, end, when, via), "option": option})),
        Button.inline("🔙 Back to all ways", make_button("nav_show", _ends_payload(start, end, when, via))),
    ])
    return {"markdown": "\n".join(md).strip(), "fallback": "\n".join(plain).strip()}, buttons


def nav_place_buttons(places: list, field: str) -> list:
    return [
        [Button.inline(place_button_text(p),
                       make_button("nav_pick", {"field": field, "place": {"label": p["label"], "lat": p["lat"], "lng": p["lng"]}}))]
        for p in places[:8]
    ]


def build_mynavs_view(chat_id: int, page: int):
    navs = list_favourite_navs(chat_id)
    page_items, page, total_pages = paginate(navs, page)
    rich = {
        "markdown": "# Your favourite navs\nSelect one to see the ways there by bus and train.",
        "fallback": "Your favourite navs\nSelect one to see the ways there by bus and train.",
    }
    buttons = [
        [Button.inline(" → ".join([n["from_label"], *([v["label"]] if (v := row_via(n)) else []), n["to_label"]])[:64],
                       make_button("nav_open_fav", {"id": n["id"]}))]
        for n in page_items
    ]
    buttons += nav_row("mynavs_page", {}, page, total_pages)
    return rich, buttons, navs
