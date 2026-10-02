"""Messages and buttons for /nav: the panel with both ends and the ways between them, one
way leg by leg with live bus timings, and the /mynavs list. The journeys come from the
site's /api/nav (nav_api.py), the same as the web app's Navigate."""

from telethon import Button

from .buttons import make_button
from .format import _format_eta, escape_md
from .navs import is_favourite_nav, list_favourite_navs
from .pagination import nav_row, paginate

MAX_OPTIONS = 8

PROMPTS = {
    "from": "Send where you're starting: an address, a building, a postal code, an MRT station, a bus stop, or your location.",
    "to": "Now send where you're going: an address, a building, a postal code, an MRT station, a bus stop, or your location.",
}


def _metres(m) -> str:
    return f"{m / 1000:.1f} km" if m >= 1000 else f"{round(m)} m"


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


def option_summary(option: dict) -> str:
    """"🚆 EW → 🚌 25 · 1 change, 111 m walk"."""
    if option.get("walkOnly"):
        return "🚶 Walk all the way"
    rides = _rides(option)
    walk = sum(leg.get("metres", 0) for leg in option["legs"] if leg["mode"] == "walk")
    changes = len(rides) - 1
    change_text = "no change" if changes == 0 else f"{changes} change{'s' if changes > 1 else ''}"
    return f"{' → '.join(_chip(leg) for leg in rides)} · {change_text}, {_metres(walk)} walk"


def _ends_lines(start: "dict | None", end: "dict | None") -> tuple[list, list]:
    md = [
        f"**From:** {escape_md(start['label']) if start else '_not set_'}",
        f"**To:** {escape_md(end['label']) if end else '_not set_'}",
    ]
    plain = [f"From: {start['label'] if start else 'not set'}", f"To: {end['label'] if end else 'not set'}"]
    return md, plain


def _ends_payload(start, end) -> dict:
    return {"from": start, "to": end}


def build_nav_panel(chat_id: int, start, end, awaiting: "str | None" = None, result: "dict | None" = None, error: "str | None" = None):
    """The /nav panel. With both ends set and `result` from the API, the ways between them,
    a button each; otherwise a prompt for the end it's waiting on."""
    md_ends, plain_ends = _ends_lines(start, end)
    md = ["# 🧭 Navigate by bus and train", "", *md_ends, ""]
    plain = ["🧭 Navigate by bus and train", "", *plain_ends, ""]
    buttons = []

    if awaiting:
        md.append(f"_{escape_md(PROMPTS[awaiting])}_")
        plain.append(PROMPTS[awaiting])
    elif error:
        md.append(escape_md(error))
        plain.append(error)
    elif result is not None:
        options = (result.get("options") or [])[:MAX_OPTIONS]
        if not options:
            line = "No way by bus or train was found between these two places. Try somewhere nearby."
            md.append(line)
            plain.append(line)
        else:
            head = f"{len(options)} way{'s' if len(options) != 1 else ''} to get there, quickest first. Every mix of bus and train, not just the fastest:"
            md += [head, ""]
            plain += [head, ""]
            for i, o in enumerate(options, 1):
                extra = []
                if o.get("onemapMinutes") is not None:
                    extra.append(f"OneMap ~{o['onemapMinutes']} min")
                if o.get("source") == "onemap":
                    extra.append("found by OneMap")
                warn = " ⚠️" if o.get("disrupted") else ""
                text = f"{i}. ~{o['minutes']} min · {option_summary(o)}{' · ' + ', '.join(extra) if extra else ''}{warn}"
                md.append(escape_md(text))
                plain.append(text)
                buttons.append(
                    [Button.inline(f"{i} · ~{o['minutes']} min · {' → '.join(leg['route'] for leg in _rides(o)) or 'walk'}"[:64],
                                   make_button("nav_option", {**_ends_payload(start, end), "option": o}))]
                )
            note = "Times include walking and an average wait to board. ⚠️ marks a line LTA reports a disruption on."
            md += ["", f"_{escape_md(note)}_"]
            plain += ["", note]

    if start and end:
        fav = is_favourite_nav(chat_id, start, end)
        buttons.append([
            Button.inline("⭐ Remove favourite" if fav else "⭐ Add favourite", make_button("nav_fav", _ends_payload(start, end))),
            Button.inline("🔄 Refresh", make_button("nav_show", _ends_payload(start, end))),
        ])
    buttons.append([
        Button.inline("🅰 Set start", make_button("nav_set", {**_ends_payload(start, end), "field": "from"})),
        Button.inline("🅱 Set end", make_button("nav_set", {**_ends_payload(start, end), "field": "to"})),
    ])
    return {"markdown": "\n".join(md).strip(), "fallback": "\n".join(plain).strip()}, buttons


def build_nav_option(start, end, option: dict, timings: dict):
    """One way, leg by leg. `timings` maps a bus leg's index to its next ETAs in ms (or None
    when LTA has none)."""
    md = [f"# 🧭 ~{option['minutes']} min", f"{escape_md(start['label'])} → {escape_md(end['label'])}", ""]
    plain = [f"🧭 ~{option['minutes']} min", f"{start['label']} → {end['label']}", ""]
    buttons = []
    legs = option["legs"]
    for k, leg in enumerate(legs):
        if leg["mode"] == "walk":
            where = end["label"] if k == len(legs) - 1 else _place_name(leg.get("to"))
            line = f"🚶 Walk ~{leg['metres']} m to {where}, ~{max(1, round(leg['minutes']))} min"
            md.append(escape_md(line))
            plain.append(line)
        elif leg["mode"] == "train":
            towards = f", towards {leg['towards']}" if leg.get("towards") else ""
            line = (f"{_chip(leg)} {leg.get('name') or leg['route']} from {_place_name(leg['from'])}{towards}: "
                    f"{leg['stops']} stop{'s' if leg['stops'] != 1 else ''} to {_place_name(leg['to'])}, ~{round(leg['minutes'])} min")
            md.append(escape_md(line))
            plain.append(line)
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
            etas = timings.get(k)
            eta_line = (f"   Next {leg['route']}: {' · '.join(_format_eta(ms) for ms in etas)}" if etas
                        else "   No live timings for this bus right now.")
            md.append(escape_md(eta_line))
            plain.append(eta_line)
            if leg.get("from", {}).get("code"):
                buttons.append([Button.inline(f"🚏 {leg['route']} at {leg['from']['name']}"[:64],
                                              make_button("stop", {"code": leg["from"]["code"], "bus_no": leg["route"]}))])
    note = "Train times are estimates from distance; bus timings are live from LTA."
    md += ["", f"_{escape_md(note)}_"]
    plain += ["", note]
    buttons.append([
        Button.inline("🔄 Refresh", make_button("nav_option", {**_ends_payload(start, end), "option": option})),
        Button.inline("🔙 Back to all ways", make_button("nav_show", _ends_payload(start, end))),
    ])
    return {"markdown": "\n".join(md).strip(), "fallback": "\n".join(plain).strip()}, buttons


def nav_place_buttons(places: list, field: str) -> list:
    icons = {"station": "🚆", "stop": "🚌", "place": "📍"}
    return [
        [Button.inline(f"{icons.get(p['kind'], '📍')} {p['label']}"[:64],
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
        [Button.inline(f"{n['from_label']} → {n['to_label']}"[:64], make_button("nav_open_fav", {"id": n["id"]}))]
        for n in page_items
    ]
    buttons += nav_row("mynavs_page", {}, page, total_pages)
    return rich, buttons, navs
