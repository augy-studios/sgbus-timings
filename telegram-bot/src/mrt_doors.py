"""Where to stand on a train, for a live trip's train parts (bot_trips.py, trip_widget.py): the
doors that stop nearest the escalators, lift and stairs where you get off, the way to your next
train if it's a change there, or that it's a change across the platform. From the site's
/api/mrt-doors (the mrtinfo tables), as the web app's js/mrt-doors.js works it out: this is
that file's plan and tip in Python, in English. Keep in step with it.

Doors are counted from the front of the train, the number on each platform screen door. A
station the data doesn't have yet says nothing."""

import time

import httpx

from .config import config
from .http_client import shared_client

DOORS = {"CC": 12, "DT": 12, "TE": 20}
LINE_OF = {"CG": "EW"}
ORDER = ["escalator", "lift", "stairs"]
NUMBER_AT = {
    "above": "on the panel above the doors",
    "corner": "at the top right of each door",
    "post": "near the top of the post beside each door",
}
WHAT = {"escalator": "escalators", "lift": "lift", "stairs": "stairs"}
# The data changes rarely: asked for again after this.
KEEP_S = 6 * 3600

_platforms: "list | None" = None
_dirs: set = set()
_at = 0.0


async def load() -> bool:
    """The platforms, from the site, kept for KEEP_S. False when they can't be had."""
    global _platforms, _dirs, _at
    if _platforms is not None and time.time() - _at < KEEP_S:
        return True
    try:
        res = await shared_client().get(config.nav_api_url.rstrip("/") + "/api/mrt-doors", timeout=20)
        res.raise_for_status()
        _platforms = res.json().get("platforms") or []
    except (httpx.HTTPError, ValueError) as err:
        print(f"[mrt_doors] {err}")
        return _platforms is not None
    _dirs = {p["d"] for p in _platforms}
    _at = time.time()
    return True


def _ways(f) -> list:
    return [s.strip() for s in str(f.get("to") or "").split("/") if s.strip()]


def _places(f) -> list:
    return [w for w in _ways(f) if w.lower() != "exit" and w not in _dirs]


def _leads_out(f) -> bool:
    w = _ways(f)
    return not w or any(x not in _dirs for x in w)


def _norm(s) -> str:
    import re
    s = re.sub(r"\b(mrt|lrt)\b", "", str(s or "").lower())
    s = re.sub(r"\bstation\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


def _number_at(p) -> "str | None":
    if p.get("e") == 1:
        return "post"
    if p.get("l") in ("NE", "CC", "DT", "TE"):
        return "corner"
    if p.get("e") == 0:
        return "above"
    return None


def _at_station(place, line: str) -> list:
    if not _platforms or not place:
        return []
    codes = [c for c in str(place.get("code") or "").upper().split("/") if c]
    on_line = lambda p: p["l"] == line or p["l"] == LINE_OF.get(line) or p["c"].startswith(line)
    by_code = [p for p in _platforms if on_line(p) and p["c"].upper() in codes]
    if by_code:
        return by_code
    name = _norm(place.get("name"))
    return [p for p in _platforms if on_line(p) and _norm(p.get("n")) == name] if name else []


def _arrival(leg) -> "dict | None":
    line = str(leg.get("route") or "").upper()
    frm = _at_station(leg.get("from"), line)
    for a in _at_station(leg.get("to"), line):
        b = next((p for p in frm if p["d"] == a["d"]), None)
        if b and a["o"] > b["o"]:
            return a
    return None


def _rows(fs: list, line: str) -> list:
    most = DOORS.get(line, 24)
    groups = {}
    for f in fs:
        doors = sorted({n for n in f.get("doors") or [] if isinstance(n, int) and 1 <= n <= most})
        if not doors:
            continue
        key = (f.get("t"), tuple(doors))
        g = groups.setdefault(key, {"t": f.get("t"), "doors": doors, "places": []})
        for p in _places(f):
            if p not in g["places"]:
                g["places"].append(p)
    rank = lambda t: ORDER.index(t) if t in ORDER else len(ORDER)
    every = sorted(groups.values(), key=lambda g: rank(g["t"]))
    esc = {n for g in every if g["t"] == "escalator" for n in g["doors"]}
    named = lambda t: {n for g in every if g["t"] == t and g["places"] for n in g["doors"]}
    out = []
    for g in every:
        doors = g["doors"] if g["places"] else [n for n in g["doors"] if n not in named(g["t"])]
        if g["t"] == "stairs":
            doors = [n for n in doors if n not in esc]
        if doors:
            out.append({"t": g["t"], "places": g["places"], "doors": doors})
    return out


def plan(leg: dict, nxt: "dict | None" = None) -> "dict | None":
    """js/mrt-doors.js's plan: {station, cross} or {station, change, rows, numberAt}, or None."""
    if not _platforms or (leg or {}).get("mode") != "train":
        return None
    a = _arrival(leg)
    if not a:
        return None
    change = None
    if (nxt or {}).get("mode") == "train":
        next_line = str(nxt.get("route") or "").upper()
        onward = _arrival(nxt)
        if onward and onward["d"] in (a.get("x") or []):
            return {"station": a["n"], "cross": nxt.get("name") or nxt.get("route")}
        here = any(p["n"] == a["n"] for p in _at_station(nxt.get("from"), next_line)) or _norm((nxt.get("from") or {}).get("name")) == _norm(a["n"])
        if here:
            line_of = {p["d"]: p["l"] for p in _platforms}
            exact = [f for f in a["f"] if onward and onward["d"] in _ways(f)]
            fs = exact or [f for f in a["f"] if any(line_of.get(w) == LINE_OF.get(next_line, next_line) for w in _ways(f))]
            change = {"name": nxt.get("name") or nxt.get("route"), "fs": fs}
    rows = _rows(change["fs"], a["l"]) if change and change["fs"] else _rows([f for f in a["f"] if _leads_out(f)], a["l"])
    if not rows:
        return None
    return {"station": a["n"], "change": (change["name"] if change["fs"] else "") if change else None, "rows": rows, "numberAt": _number_at(a)}


def compact(leg: dict, nxt: "dict | None" = None) -> "list | None":
    """The doors for the trip widget to draw, as the web app's door panel (js/nav.js,
    doorsPanel): [heading, the change across the platform in words or 0, rows, where the
    number is in words or ""], each row [[doors], what they're for: "escalators to Jewel"].
    None where it isn't known."""
    p = plan(leg, nxt)
    if not p:
        return None
    if p.get("cross"):
        return [f"At {p['station']}", f"⇄ Change across the platform to the {p['cross']}", [], ""]
    head = (f"Changing at {p['station']} for the {p['change']}" if p["change"]
            else f"Changing at {p['station']}" if p["change"] is not None
            else f"Getting off at {p['station']}")
    rows = [[r["doors"][:6], WHAT.get(r["t"], r["t"]) + (f" to {_and(r['places'])}"[:44] if r["places"] else "")] for r in p["rows"][:5]]
    at = f"Door number: {NUMBER_AT[p['numberAt']]}" if p.get("numberAt") in NUMBER_AT else ""
    return [head, 0, rows, at]


def _and(xs: list) -> str:
    return xs[0] if len(xs) < 2 else ", ".join(xs[:-1]) + " and " + xs[-1]


def tip(leg: dict, nxt: "dict | None" = None) -> "str | None":
    """Where to stand, in words: "Getting off at Bishan: door 8 for the escalators; door 18 for
    the lift. The door number is at the top right of each door." None where it isn't known."""
    p = plan(leg, nxt)
    if not p:
        return None
    if p.get("cross"):
        return f"At {p['station']}, change across the platform to the {p['cross']}."
    parts = []
    for r in p["rows"]:
        doors = " or ".join(str(n) for n in r["doors"])
        what = WHAT.get(r["t"], r["t"])
        parts.append(f"door {doors} for the {what} to {_and(r['places'])}" if r["places"] else f"door {doors} for the {what}")
    head = (f"Changing at {p['station']} for the {p['change']}" if p["change"]
            else f"Changing at {p['station']}" if p["change"] is not None
            else f"Getting off at {p['station']}")
    where = f" The door number is {NUMBER_AT[p['numberAt']]}." if p.get("numberAt") in NUMBER_AT else ""
    return f"{head}: {'; '.join(parts)}.{where}"
