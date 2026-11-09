"""Rides really taken, as the web app judges them (main-site/js/rides.js), from the locations
sent on a trip in the bot (bot_trips.py, apply_fix): for uwuCoins (coins.py), the feats
(feats.py) and team runs (teams.py).

A ride is real when:
  - you were seen near where it starts (START_M), and then near where it ends (END_M);
  - it took at least MIN_SHARE of the time it's planned to, and never faster than a bus or a
    train goes (MAX_KMH), from the last fix at the start to the first at the end;
  - on a bus with stops between its ends, you were seen near some of them on the way
    (ALONG_SHARE of them, at least one). A train goes underground, so its timing stands in.
A location rougher than FIX_M is left out. What's seen is kept with the trip (seen_json), and
each ride is judged once, when the trip moves on from it or ends. Keep in step with js/rides.js."""

import json
import math
import time

from .db import db

START_M = 300
END_M = 300
ALONG_M = 250
FIX_M = 150
MIN_SHARE = 0.5
ALONG_SHARE = 0.25
MAX_KMH = {"bus": 70, "train": 100}
# Every MRT and LRT line; the loops' halves and the branches go by their line.
LINES = ["NS", "EW", "NE", "CC", "DT", "TE", "BP", "SK", "PG"]
SAME_LINE = {"CG": "EW", "CE": "CC", "SE": "SK", "SW": "SK", "PE": "PG", "PW": "PG"}


def metres(a, b) -> float:
    rad = math.radians
    h = math.sin(rad(b[0] - a[0]) / 2) ** 2 + math.cos(rad(a[0])) * math.cos(rad(b[0])) * math.sin(rad(b[1] - a[1]) / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def is_ride(leg) -> bool:
    return bool(leg) and leg.get("kind") in ("bus", "train") and len(leg.get("points") or []) >= 2


def line_of(leg) -> str:
    code = (leg.get("route") or leg.get("label") or "").upper()[:2]
    code = code if code.isalpha() else ""
    return SAME_LINE.get(code, code)


def bus_of(leg) -> str:
    if leg.get("shuttle"):
        return ""
    return str(leg.get("service") or leg.get("route") or "").upper()


def _blank() -> dict:
    return {"fixes": 0, "startAt": None, "endAt": None, "along": []}


def see(seen: list, legs: list, i: int, here, accuracy=None, now: "int | None" = None) -> None:
    """A location on ride i of the trip, into `seen` (one entry per part)."""
    if not 0 <= i < len(legs):
        return
    leg = legs[i]
    if not is_ride(leg) or (accuracy is not None and accuracy > FIX_M):
        return
    while len(seen) <= i:
        seen.append(None)
    s = seen[i] = seen[i] or _blank()
    if s.get("judged"):
        return
    t = now or int(time.time() * 1000)
    pts = leg["points"]
    last = len(pts) - 1
    s["fixes"] += 1
    if s["endAt"] is None and metres(here, pts[0]) <= START_M:
        s["startAt"] = t
    if s["startAt"] is not None and s["endAt"] is None and metres(here, pts[last]) <= END_M and t > s["startAt"]:
        s["endAt"] = t
    if s["startAt"] is not None and s["endAt"] is None:
        for k in range(1, last):
            if k not in s["along"] and metres(here, pts[k]) <= ALONG_M:
                s["along"].append(k)


def verdict(leg, s) -> dict:
    if not is_ride(leg):
        return {"ok": False, "why": "not a ride"}
    if not s or s.get("startAt") is None:
        return {"ok": False, "why": "never seen at the start"}
    if s.get("endAt") is None:
        return {"ok": False, "why": "never seen at the end"}
    ms = s["endAt"] - s["startAt"]
    planned = max(1, leg.get("minutes") or 1) * 60000
    if ms < planned * MIN_SHARE:
        return {"ok": False, "why": "too quick for the ride"}
    pts = leg["points"]
    km = metres(pts[0], pts[-1]) / 1000
    if km / (ms / 3600000) > MAX_KMH[leg["kind"]]:
        return {"ok": False, "why": "faster than it goes"}
    between = len(pts) - 2
    if leg["kind"] == "bus" and between >= 2:
        need = max(1, math.ceil(between * ALONG_SHARE))
        if len(s.get("along") or []) < need:
            return {"ok": False, "why": "not seen along the way"}
    return {"ok": True, "why": ""}


def judge(seen: list, legs: list, i: int) -> "bool | None":
    """Ride i judged, once: True when it was real. None for a part that isn't a ride."""
    if not 0 <= i < len(legs) or not is_ride(legs[i]):
        return None
    while len(seen) <= i:
        seen.append(None)
    s = seen[i] = seen[i] or _blank()
    if s.get("judged"):
        return s.get("ok")
    v = verdict(legs[i], s)
    s.update(judged=True, ok=v["ok"], why=v["why"])
    return v["ok"]


def keep(chat_id: int, leg: dict, trip_id: str, now: "int | None" = None) -> dict:
    """A real ride kept for the chat, by its line or bus. Answers what it was, for the feats
    and the team: {mode, line, bus}."""
    mode = "train" if leg["kind"] == "train" else "bus"
    line = line_of(leg) if mode == "train" else ""
    bus = bus_of(leg) if mode == "bus" else ""
    with db:
        db.execute("INSERT INTO rides (chat_id, at, kind, line, bus, trip) VALUES (?, ?, ?, ?, ?, ?)",
                   (chat_id, now or int(time.time() * 1000), mode, line or None, bus or None, trip_id))
    return {"mode": mode, "line": line, "bus": bus}


def record(chat_id: int) -> dict:
    """The chat's rides, as js/rides.js keeps them: {lines: {EW: n}, buses: {"174": n}, n}."""
    rows = db.execute("SELECT kind, line, bus FROM rides WHERE chat_id = ?", (chat_id,)).fetchall()
    lines, buses = {}, {}
    for r in rows:
        if r["line"]:
            lines[r["line"]] = lines.get(r["line"], 0) + 1
        if r["bus"]:
            buses[r["bus"]] = buses.get(r["bus"], 0) + 1
    return {"lines": lines, "buses": buses, "n": len(rows)}


def load_seen(row) -> list:
    return json.loads(row["seen_json"]) if row and row["seen_json"] else []


def save_seen(eta_id: str, seen: list) -> None:
    with db:
        db.execute("UPDATE trip_widgets SET seen_json = ? WHERE eta_id = ?", (json.dumps(seen), eta_id))
