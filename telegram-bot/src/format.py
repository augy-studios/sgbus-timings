import math
import re
from datetime import datetime
from zoneinfo import ZoneInfo

from .bus_routes import direction_ending_at, first_last_bus_times
from .bus_services import service_terminals
from .bus_stops import get_bus_stop_by_code, same_place_stops
from .favourite_prefs import pin_favourites
from .restricted import CROSS_BORDER, cross_border_note, restricted_note
from .routines import format_services, join_services

_MD_SPECIAL = re.compile(r"([\\*_~`|\[\]#>=])")


def escape_md(text) -> str:
    """Escapes text for Telegram's rich-message Markdown dialect."""
    return _MD_SPECIAL.sub(r"\\\1", str(text))


def _escape_cell(text) -> str:
    """Escapes text for use inside a GFM table cell (also flattens newlines/pipes)."""
    return escape_md(str(text).replace("\n", " "))


def _format_eta(ms) -> str:
    if ms is None:
        return "no data"
    total_seconds = round(ms / 1000)
    if total_seconds <= 0:
        return "arr"
    minutes, seconds = divmod(total_seconds, 60)
    if minutes == 0:
        return f"{seconds}s"
    return f"{minutes}m {seconds:02d}s"


def _format_hhmm(hhmm) -> str:
    """Formats an LTA-style HHmm string (e.g. "2210") as "HH:MM", its midnight ("2400") as
    00:00 rather than 24:00."""
    if not hhmm or len(hhmm) != 4 or not hhmm.isdigit():
        return "-"
    return f"{int(hhmm[:2]) % 24:02d}:{hhmm[2:]}"


def _first_last_bus_line(service_no, stop_code, direction=None) -> "str | None":
    """First/last scheduled bus for today's day-type (weekday/Sat/Sun), Singapore time."""
    times = first_last_bus_times(service_no, stop_code, direction)
    if not times:
        return None
    weekday = datetime.now(ZoneInfo("Asia/Singapore")).weekday()  # Mon=0 .. Sun=6
    if weekday == 5:
        first, last, label = times["sat_first"], times["sat_last"], "Sat"
    elif weekday == 6:
        first, last, label = times["sun_first"], times["sun_last"], "Sun"
    else:
        first, last, label = times["wd_first"], times["wd_last"], "Weekday"
    return f"🚏 First bus ({label}): {_format_hhmm(first)}  ·  Last bus: {_format_hhmm(last)}"


def _format_distance(meters) -> str:
    if meters is None:
        return "-"
    if meters >= 1000:
        return f"{meters / 1000:.1f}km"
    return f"{meters}m"


def _haversine_meters(lat1, lon1, lat2, lon2):
    if any(v is None for v in (lat1, lon1, lat2, lon2)):
        return None
    r = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _bus_distance(stop, nxt):
    if not nxt or nxt.get("rough") or stop["lat"] is None or stop["lng"] is None:
        return None
    return _haversine_meters(stop["lat"], stop["lng"], nxt["lat"], nxt["lng"])


def _load_cell(load) -> str:
    if load == "SEA":
        return "🟩 Seats"
    if load == "SDA":
        return "🟧 Standing"
    if load == "LSD":
        return "🟥 Limited"
    return "-"


def _deck_cell(deck) -> str:
    if deck == "Double":
        return "🗄 Double"
    if deck == "Bendy":
        return "🚌 Bendy"
    return "🚍 Single"


def _build_service_table(svc, stop) -> "str | None":
    """Builds a GFM Markdown table (Next 1/2/3 columns) of a service's upcoming buses."""
    nexts = [n for n in (svc.get("next"), svc.get("next2"), svc.get("next3")) if n]
    if not nexts:
        return None

    headers = [f"Next {i + 1}" for i in range(len(nexts))]
    rows = [
        ["Time", *(_format_eta(n["etaMs"]) for n in nexts)],
        ["Dist", *(_format_distance(_bus_distance(stop, n)) for n in nexts)],
        ["Type", *(_deck_cell(n["deck"]) for n in nexts)],
        ["Seats", *(_load_cell(n["load"]) for n in nexts)],
        ["WAB", *("♿️ Yes" if n["wheelchair"] else "- No" for n in nexts)],
    ]

    lines = [
        "| " + " | ".join(["", *(_escape_cell(h) for h in headers)]) + " |",
        "| " + " | ".join(["---"] * (len(headers) + 1)) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(_escape_cell(v) for v in row) + " |")
    return "\n".join(lines)


def _pin_favourite_ways(services, favourite_service_nos, pin_position) -> list:
    """The stop's (entry, way) pairs (_bus_ways), favourite buses pinned. The ways are worked
    out over every bus at the stop, before any are moved."""
    return pin_favourites(_bus_ways(services), favourite_service_nos, pin_position, key=lambda p: p[0]["serviceNo"])


# ---- Which way each bus is going ----
# Some stops have a bus calling both ways, on a road it runs up and back (136 at 66271, both
# ways of 21 at 52129), and LTA lists it twice, once per way. A loop service passing a stop
# on its way out and again on its way back (73 at 66271) mixes the two in one list instead,
# and is split in two the same way, one entry per time round, at the cost of fewer than
# three buses in each. Each way gets a colour and its words, as on the web app
# (busWays in main-site/script.js).
_TONES = ("🔵", "🔴", "🟣")


def _buses(svc) -> list:
    return [svc.get(k) for k in ("next", "next2", "next3")]


def _stop_name(code) -> str:
    stop = get_bus_stop_by_code(code) if code else None
    return stop["name"] if stop else (code or "?")


def _two_way_headings(services) -> dict:
    """{id(entry): (tone, destination name, direction)} for each service listed more than
    once at the stop, one entry per way. The tone goes by the destination, so each way keeps
    its colour from one refresh to the next."""
    groups = {}
    for svc in services:
        groups.setdefault(svc["serviceNo"], []).append(svc)
    out = {}
    for group in groups.values():
        if len(group) < 2:
            continue
        dests = [next((b["dest"] for b in _buses(s) if b and b.get("dest")), None) for s in group]
        if None in dests or len(set(dests)) < len(group):
            continue
        order = sorted(dests)
        for svc, dest in zip(group, dests):
            out[id(svc)] = (
                _TONES[order.index(dest) % len(_TONES)],
                _stop_name(dest),
                direction_ending_at(svc["serviceNo"], dest),
            )
    return out


def _is_loop(service_no, bus) -> bool:
    terminals = service_terminals(service_no) or {}
    return bool(terminals.get("loop_desc") or (bus.get("origin") and bus.get("origin") == bus.get("dest")))


def _time_round(service_no, bus) -> tuple:
    """(tone, words) for which time round a bus is on, at a stop its service passes twice."""
    if bus.get("visit") == 2:
        if _is_loop(service_no, bus):
            return _TONES[1], f"↩ Back to {_stop_name(bus.get('dest'))}"
        return _TONES[1], "2nd time past here"
    if _is_loop(service_no, bus):
        loop = (service_terminals(service_no) or {}).get("loop_desc")
        return _TONES[0], f"→ Out to {loop}" if loop else "→ On its way out"
    return _TONES[0], "1st time past here"


def _bus_ways(services) -> list:
    """The services at a stop with each way apart, as (entry, way) pairs: a service passing
    the stop twice is split into an entry per time round, its buses in order, and `way` is
    (tone, words, direction) for an entry going one of two ways, otherwise None."""
    headings = _two_way_headings(services)
    out = []
    for svc in services:
        heading = headings.get(id(svc))
        if heading:
            tone, dest, direction = heading
            out.append((svc, (tone, f"→ {dest}", direction)))
            continue
        buses = [b for b in _buses(svc) if b]
        if not any(b.get("visit") == 2 for b in buses):
            out.append((svc, None))
            continue
        for visit in (1, 2):
            these = [b for b in buses if (2 if b.get("visit") == 2 else 1) == visit]
            if not these:
                continue
            entry = {**svc, "next": these[0], "next2": these[1] if len(these) > 1 else None,
                     "next3": these[2] if len(these) > 2 else None}
            out.append((entry, (*_time_round(svc["serviceNo"], these[0]), None)))
    return out


def _stop_notes(stop) -> list:
    """Lines under a stop's name: who can use it, and its other half if it's split in two."""
    notes = []
    restricted = restricted_note(stop["code"])
    if restricted:
        notes.append(restricted)
    border = cross_border_note(stop["code"])
    if border:
        notes.append(border)
    for other in same_place_stops(stop["code"]):
        notes.append(f"🚏 {other['name']} is also stop {other['code']}, with buses of its own.")
    return notes


def _none_due(wanted) -> str:
    """What a stop with nothing to show says: none of the buses it's narrowed to, as the
    Linux CLI says it, or none at all."""
    if wanted:
        return f"No live arrivals for {format_services(join_services(wanted))} right now."
    return "No bus services currently reported for this stop."


def format_arrival_message(
    stop, arrivals, is_favourite, favourite_service_nos=None, bus_pin_position="top", note=None, wanted=None
) -> dict:
    """Builds the rich-message Markdown body showing live arrivals for a bus stop.
    `note` is a line of plain text shown under the stop's name, such as how many stops
    the bus picked off a route has left to go. `wanted` is the buses the view is narrowed
    to, if it is, for saying so when none of them are due."""
    favourite_service_nos = favourite_service_nos or set()
    star = "⭐ " if is_favourite else ""
    lines = [f"# {star}{escape_md(stop['name'])} ({escape_md(stop['code'])})"]
    if stop["road"]:
        lines.append(f"*{escape_md(stop['road'])}*")
    for stop_note in _stop_notes(stop):
        lines += ["", escape_md(stop_note)]
    if note:
        lines += ["", escape_md(note)]
    lines.append("")

    services = _pin_favourite_ways(arrivals["services"], favourite_service_nos, bus_pin_position)
    if not services:
        lines.append(escape_md(_none_due(wanted)))
    else:
        for svc, way in services:
            svc_star = "⭐ " if svc["serviceNo"] in favourite_service_nos else ""
            to = f" {way[0]} {escape_md(way[1])}" if way else ""
            lines.append(f"## {svc_star}{escape_md(svc['serviceNo'])} ({escape_md(svc.get('operator') or '?')}){to}")
            table = _build_service_table(svc, stop)
            lines.append(table if table else "No arrival data.")
            first_last = _first_last_bus_line(svc["serviceNo"], stop["code"], way[2] if way else None)
            if first_last:
                lines.append(escape_md(first_last))
            lines.append("")

    updated = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%H:%M:%S")
    lines.append(f"_Updated {updated}_")

    markdown = "\n".join(lines)
    fallback = _build_fallback_text(
        stop, arrivals, is_favourite, favourite_service_nos, bus_pin_position, updated, note, wanted
    )
    return {"markdown": markdown, "fallback": fallback}


def _build_fallback_text(
    stop, arrivals, is_favourite, favourite_service_nos, bus_pin_position, updated, note=None, wanted=None
) -> str:
    """Plain-text summary for the required SendMessageRequest.message field / older clients."""
    star = "⭐ " if is_favourite else ""
    lines = [f"{star}{stop['name']} ({stop['code']})"]
    if stop["road"]:
        lines.append(stop["road"])
    lines += _stop_notes(stop)
    if note:
        lines.append(note)

    services = _pin_favourite_ways(arrivals["services"], favourite_service_nos, bus_pin_position)
    if not services:
        lines.append(_none_due(wanted))
    else:
        for svc, way in services:
            svc_star = "⭐ " if svc["serviceNo"] in favourite_service_nos else ""
            to = f" {way[0]} {way[1]}" if way else ""
            nexts = [n for n in (svc.get("next"), svc.get("next2"), svc.get("next3")) if n]
            etas = ", ".join(_format_eta(n["etaMs"]) for n in nexts) or "no data"
            lines.append(f"{svc_star}{svc['serviceNo']} ({svc.get('operator') or '?'}){to}: {etas}")
            first_last = _first_last_bus_line(svc["serviceNo"], stop["code"], way[2] if way else None)
            if first_last:
                lines.append(f"  {first_last}")

    lines.append(f"Updated {updated}")
    return "\n".join(lines)


def stop_label(stop, place=None) -> str:
    """A stop as "Blk 111 (84229)", or "Blk 111 (84229) · Bedok" with a `place` from
    planning_areas.tell_apart to set it apart from others of the same name."""
    return f"{stop['name']} ({stop['code']})" + (f" · {place}" if place else "")


def stop_button_label(stop, distance_meters=None, is_favourite=False, place=None) -> str:
    """Label for a bus stop selection button, kept under Telegram's 64-char limit by
    shortening the name, so the code, `place` and distance always show. The distance is
    left off for a stop that has none, as a name search's matches don't. A stop across the
    border, or at its checkpoint, gets a 🛂."""
    icon = "⭐" if is_favourite else "🛂" if stop["code"] in CROSS_BORDER else "🚌"
    tail = f" ({stop['code']})" + (f" · {place}" if place else "")
    if distance_meters is not None:
        tail += f" ~{distance_meters / 1000:.1f}km" if distance_meters >= 1000 else f" ~{distance_meters}m"
    name = stop["name"]
    room = 64 - len(icon) - 1 - len(tail)
    if len(name) > room:
        name = f"{name[: max(room - 3, 8)].rstrip()}..."
    return f"{icon} {name}{tail}"[:64]


def bus_button_label(service_no: str, is_favourite=False) -> str:
    """Label for a bus service number selection button."""
    icon = "⭐" if is_favourite else "🚌"
    return f"{icon} {service_no}"
