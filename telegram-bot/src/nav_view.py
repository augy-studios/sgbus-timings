"""Messages and buttons for /nav: the panel with both ends and the ways between them, one
way leg by leg with live bus timings, and the /mynavs list. The journeys come from the
site's /api/nav (nav_api.py), the same as the web app's Navigate."""

from telethon import Button

from datetime import timedelta

from .buttons import make_button
from .format import _format_eta, escape_md
from .navs import is_favourite_nav, list_favourite_navs
from .pagination import nav_row, paginate
from .saved_places import KINDS, list_places
from .when import at_to_dt, clock, clock_day, describe, live_lead, now, span

MAX_OPTIONS = 8

PROMPTS = {
    "from": "Send where you're starting: an address, a building, a postal code, an MRT station, a bus stop, a Google Maps link, or your location.",
    "to": "Now send where you're going: an address, a building, a postal code, an MRT station, a bus stop, a Google Maps link, or your location.",
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


def _ends_lines(start: "dict | None", end: "dict | None", when=None) -> tuple[list, list]:
    md = [
        f"**From:** {escape_md(start['label']) if start else '_not set_'}",
        f"**To:** {escape_md(end['label']) if end else '_not set_'}",
        f"**When:** {escape_md(describe(when))}",
    ]
    plain = [f"From: {start['label'] if start else 'not set'}", f"To: {end['label'] if end else 'not set'}", f"When: {describe(when)}"]
    return md, plain


def _ends_payload(start, end, when=None) -> dict:
    """What every /nav button carries: both ends, and the time picked when there is one."""
    return {"from": start, "to": end, **({"when": when} if when else {})}


def _clocks(when, minutes) -> str:
    """"08:12 → 08:50" for a way, by the time picked."""
    leave, arrive = span(when, minutes)
    return f"{clock(leave)} → {clock(arrive)}"


def _too_late(when, minutes) -> bool:
    """For Arrive by: a way you'd have had to set off on already."""
    return bool(when) and when["mode"] == "arrive" and span(when, minutes)[0] < now() - timedelta(minutes=1)


def build_nav_panel(chat_id: int, start, end, awaiting: "str | None" = None, result: "dict | None" = None, error: "str | None" = None, when=None):
    """The /nav panel. With both ends set and `result` from the API, the ways between them,
    a button each; otherwise a prompt for the end it's waiting on. `when` is the time picked
    (when.py), None for Leave now."""
    md_ends, plain_ends = _ends_lines(start, end, when)
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
        options = (result.get("options") or [])[:MAX_OPTIONS]
        if not options:
            line = (f"No way by bus or train running {'at that time' if when else 'right now'} was found between "
                    "these two places. Try another time, or somewhere nearby.")
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
                late = " (too late)" if _too_late(when, o["minutes"]) else ""
                # With a time picked, the clock times lead.
                lead = f"{_clocks(when, o['minutes'])}{late} · ~{o['minutes']} min" if when else f"~{o['minutes']} min"
                text = f"{i}. {lead} · {option_summary(o)}{' · ' + ', '.join(extra) if extra else ''}{warn}"
                md.append(escape_md(text))
                plain.append(text)
                short = _clocks(when, o["minutes"]) if when else f"~{o['minutes']} min"
                buttons.append(
                    [Button.inline(f"{i} · {short} · {' → '.join(leg['route'] for leg in _rides(o)) or 'walk'}"[:64],
                                   make_button("nav_option", {**_ends_payload(start, end, when), "option": o}))]
                )
            note = ("Times include walking and an average wait to board. Only buses and trains running at the time "
                    "are used. ⚠️ marks a line LTA reports a disruption on.")
            md += ["", f"_{escape_md(note)}_"]
            plain += ["", note]

    ends = _ends_payload(start, end, when)
    if start and end:
        fav = is_favourite_nav(chat_id, start, end)
        buttons.append([
            Button.inline("⭐ Remove favourite" if fav else "⭐ Add favourite", make_button("nav_fav", ends)),
            Button.inline("🔄 Refresh", make_button("nav_show", ends)),
        ])
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


def build_nav_option(start, end, option: dict, timings: dict, when=None):
    """One way, leg by leg. `timings` maps a bus leg's index to its next ETAs in ms (or None
    when LTA has none); for a way setting off too far ahead for those (option_is_live), each
    bus and train says when it's boarded instead, by the clock."""
    md = [f"# 🧭 ~{option['minutes']} min", f"{escape_md(start['label'])} → {escape_md(end['label'])}", ""]
    plain = [f"🧭 ~{option['minutes']} min", f"{start['label']} → {end['label']}", ""]
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
            board = board_line(leg, after_wait=False)
            if board:
                md.append(escape_md(board))
                plain.append(board)
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
                etas = timings.get(k)
                eta_line = (f"   Next {leg['route']}: {' · '.join(_format_eta(ms) for ms in etas)}" if etas
                            else "   No live timings for this bus right now.")
            else:
                eta_line = board_line(leg, after_wait=True)
            if eta_line:
                md.append(escape_md(eta_line))
                plain.append(eta_line)
            if leg.get("from", {}).get("code"):
                # The way rides along, so the timings can come back to it.
                way = {**_ends_payload(start, end, when), "option": option}
                buttons.append([Button.inline(f"🚏 {leg['route']} at {leg['from']['name']}"[:64],
                                              make_button("stop", {"code": leg["from"]["code"], "bus_no": leg["route"], "nav": way}))])
    note = ("Train times are estimates from distance; bus timings are live from LTA." if live
            else "Times are estimates from distance, with an average wait to board. "
                 "Live bus timings show here from half an hour before you set off.")
    md += ["", f"_{escape_md(note)}_"]
    plain += ["", note]
    buttons.append([
        Button.inline("🔄 Refresh", make_button("nav_option", {**_ends_payload(start, end, when), "option": option})),
        Button.inline("🔙 Back to all ways", make_button("nav_show", _ends_payload(start, end, when))),
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
