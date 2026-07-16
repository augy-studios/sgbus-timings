import math
import re
from datetime import datetime
from zoneinfo import ZoneInfo

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
    minutes = round(ms / 60000)
    if minutes <= 0:
        return "arr"
    if minutes == 1:
        return "1 min"
    return f"{minutes} min"


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


def format_arrival_message(stop, arrivals, is_favourite) -> dict:
    """Builds the rich-message Markdown body showing live arrivals for a bus stop."""
    star = "⭐ " if is_favourite else ""
    lines = [f"# {star}{escape_md(stop['name'])} ({escape_md(stop['code'])})"]
    if stop["road"]:
        lines.append(f"*{escape_md(stop['road'])}*")
    lines.append("")

    services = arrivals["services"]
    if not services:
        lines.append("No bus services currently reported for this stop.")
    else:
        for svc in services:
            lines.append(f"## {escape_md(svc['serviceNo'])} ({escape_md(svc.get('operator') or '?')})")
            table = _build_service_table(svc, stop)
            lines.append(table if table else "No arrival data.")
            lines.append("")

    updated = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%H:%M:%S")
    lines.append(f"_Updated {updated}_")

    markdown = "\n".join(lines)
    fallback = _build_fallback_text(stop, arrivals, is_favourite, updated)
    return {"markdown": markdown, "fallback": fallback}


def _build_fallback_text(stop, arrivals, is_favourite, updated) -> str:
    """Plain-text summary for the required SendMessageRequest.message field / older clients."""
    star = "⭐ " if is_favourite else ""
    lines = [f"{star}{stop['name']} ({stop['code']})"]
    if stop["road"]:
        lines.append(stop["road"])

    services = arrivals["services"]
    if not services:
        lines.append("No bus services currently reported for this stop.")
    else:
        for svc in services:
            nexts = [n for n in (svc.get("next"), svc.get("next2"), svc.get("next3")) if n]
            etas = ", ".join(_format_eta(n["etaMs"]) for n in nexts) or "no data"
            lines.append(f"{svc['serviceNo']} ({svc.get('operator') or '?'}): {etas}")

    lines.append(f"Updated {updated}")
    return "\n".join(lines)


def stop_button_label(stop, distance_meters=None) -> str:
    """Label for a bus stop selection button, kept under Telegram's 64-char limit."""
    label = f"🚌 {stop['name']} ({stop['code']})"
    if distance_meters is not None:
        dist_text = f"{distance_meters / 1000:.1f}km" if distance_meters >= 1000 else f"{distance_meters}m"
        label += f" - {dist_text}"
    if len(label) > 64:
        label = f"{label[:61]}..."
    return label
