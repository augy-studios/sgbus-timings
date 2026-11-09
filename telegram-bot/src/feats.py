"""Feats in the bot, as the web app has them (main-site/js/eggs.js): nine, each done once and
worth FEAT_COINS uwuCoins (coins.py), from your own real rides and trips (rides.py, bot_trips.py)
or your team run's (teams.py). The Easter eggs they're named after come from the uwuCoins wheel,
which in the bot gives a link to open one in the web app or the Android app (coins.py).

  lines    every MRT and LRT line ridden
  up       buses 12, 34, 56, 78 and 90, ever, in any order; down: 9, 87, 65, 43 and 21
  loop     a trip by way of somewhere well away (LOOP_AWAY_M) that ends back where it started
  long     a trip of over three hours
  ktm      a trip between two of the old KTM railway's places
  first    on or off a bus at stop 01012 and at stop 99189
  hundred  100 rides
  ends     off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport
Keep the rules and numbers in step with js/eggs.js."""

import time

from .db import db
from .rides import LINES, metres, record

FEAT_COINS = 100
FIRST_LAST = ["01012", "99189"]
HUNDRED = 100
ENDS_M = 400
ENDS = {"EW33": [1.340429, 103.636961], "TE1": [1.448646, 103.785519], "NE18": [1.415018, 103.910329], "CG2": [1.357338, 103.988565]}
LOOP_M = 300
LOOP_AWAY_M = 1000
LONG_MS = 3 * 3600 * 1000
KTM_M = 400
KTM = {"woodlands": [1.442783, 103.769356], "cantonment": [1.273115, 103.837028], "kingAlbertPark": [1.33566, 103.78416]}
UP = ["12", "34", "56", "78", "90"]
DOWN = ["9", "87", "65", "43", "21"]

FEATS = {
    "lines": ("🚇", "Every line ridden", "Ride every MRT and LRT line."),
    "up": ("📈", "12, 34, 56, 78, 90", "Ride buses 12, 34, 56, 78 and 90."),
    "down": ("📉", "9, 87, 65, 43, 21", "Ride buses 9, 87, 65, 43 and 21."),
    "loop": ("🔁", "There and back again", "Go somewhere by way of a stop, and come back to where you started."),
    "long": ("⏳", "The long way round", "Take a trip of over three hours."),
    "ktm": ("🚂", "Down the old railway", "Travel between two places on the old KTM railway line."),
    "first": ("🔢", "First to last", "Get on or off a bus at stop 01012 and at stop 99189, the first and last stop codes."),
    "hundred": ("💯", "100 rides", "Take 100 rides on buses and trains."),
    "ends": ("🧭", "Ends of the island", "Get off a train at Tuas Link, Woodlands North, Punggol Coast and Changi Airport."),
}
IDS = list(FEATS)


def done(chat_id: int) -> dict:
    """{feat: {at, team}} of the feats the chat has done."""
    return {r["feat"]: {"at": r["at"], "team": r["team"]} for r in db.execute("SELECT * FROM feats WHERE chat_id = ?", (chat_id,))}


def feat(chat_id: int, fid: str, team: "str | None" = None, now: "int | None" = None) -> bool:
    """A feat done, with its coins, once. True when it's new."""
    from . import coins
    if fid not in FEATS:
        return False
    now = now or int(time.time() * 1000)
    with db:
        cur = db.execute("INSERT OR IGNORE INTO feats (chat_id, feat, at, team) VALUES (?, ?, ?, ?)", (chat_id, fid, now, team))
    if not cur.rowcount:
        return False
    coins.add(chat_id, FEAT_COINS, "feat", {"feat": fid, **({"team": team} if team else {})})
    return True


def ride_marks(leg: dict) -> dict:
    """What a ride is towards First to last and Ends of the island: {first: [codes], end}."""
    out = {"first": [], "end": None}
    pts = leg.get("points") or []
    if len(pts) < 2:
        return out
    if leg.get("kind") == "bus":
        codes = [str(c) for c in (leg.get("board"), leg.get("alight"), *(leg.get("codes") or [])[:1], *(leg.get("codes") or [])[-1:]) if c]
        out["first"] = [c for c in FIRST_LAST if c in codes]
    elif leg.get("kind") == "train":
        out["end"] = next((code for code, at in ENDS.items() if metres(pts[-1], at) <= ENDS_M), None)
    return out


def ride_done(chat_id: int, leg: dict) -> list:
    """A real ride's feats: the ride feats from the chat's record, and First to last and Ends
    of the island from its marks. Answers the feats new now."""
    now = int(time.time() * 1000)
    got = ride_marks(leg)
    with db:
        for code in got["first"]:
            db.execute("INSERT OR IGNORE INTO feat_marks VALUES (?, 'first', ?, ?)", (chat_id, code, now))
        if got["end"]:
            db.execute("INSERT OR IGNORE INTO feat_marks VALUES (?, 'ends', ?, ?)", (chat_id, got["end"], now))
    marks = {(r["kind"], r["code"]) for r in db.execute("SELECT kind, code FROM feat_marks WHERE chat_id = ?", (chat_id,))}
    rec = record(chat_id)
    new = []
    checks = {
        "lines": all(rec["lines"].get(l) for l in LINES),
        "up": all(rec["buses"].get(b) for b in UP),
        "down": all(rec["buses"].get(b) for b in DOWN),
        "hundred": rec["n"] >= HUNDRED,
        "first": all(("first", c) in marks for c in FIRST_LAST),
        "ends": all(("ends", c) in marks for c in ENDS),
    }
    for fid, ok in checks.items():
        if ok and feat(chat_id, fid):
            new.append(fid)
    return new


def trip_done(chat_id: int, start, end, ms: int, away: bool) -> list:
    """A trip arrived at with a real ride on it: its feats, new now."""
    near = lambda p: next((k for k, at in KTM.items() if metres(p, at) <= KTM_M), None)
    new = []
    if ms >= LONG_MS and feat(chat_id, "long"):
        new.append("long")
    if away and metres(start, end) <= LOOP_M and feat(chat_id, "loop"):
        new.append("loop")
    a, b = near(start), near(end)
    if a and b and a != b and feat(chat_id, "ktm"):
        new.append("ktm")
    return new


def progress(chat_id: int) -> dict:
    """How far along the chat is with each feat: {feat: [have, need]}."""
    rec = record(chat_id)
    marks = {(r["kind"], r["code"]) for r in db.execute("SELECT kind, code FROM feat_marks WHERE chat_id = ?", (chat_id,))}
    have = done(chat_id)
    one = lambda fid: [1 if fid in have else 0, 1]
    return {
        "lines": [sum(1 for l in LINES if rec["lines"].get(l)), len(LINES)],
        "up": [sum(1 for b in UP if rec["buses"].get(b)), len(UP)],
        "down": [sum(1 for b in DOWN if rec["buses"].get(b)), len(DOWN)],
        "loop": one("loop"), "long": one("long"), "ktm": one("ktm"),
        "first": [sum(1 for c in FIRST_LAST if ("first", c) in marks), len(FIRST_LAST)],
        "hundred": [min(rec["n"], HUNDRED), HUNDRED],
        "ends": [sum(1 for c in ENDS if ("ends", c) in marks), len(ENDS)],
    }


def said(fids: list) -> str:
    """Feats done, in a message."""
    return "\n".join(f"🏆 Feat done: {FEATS[f][0]} {FEATS[f][1]}! +{FEAT_COINS} uwuCoins" for f in fids)
