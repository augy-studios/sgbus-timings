"""A trip's live widget (Bot API 10.4 widgets): its HTML, and its state from the trip's live
ETA link (the site's api/_lib/share-links.js, kind eta).

The widget's code is trip_widget.html, sent once per trip as a shared widget, so the person on
the trip and everyone following it see one widget, updated for all of them at once
(bot_trips.py). Its shared state is the trip's progress, packed small: a widget's state is at
most 1024 bytes. Chat state {"o":1} marks the message of the person on the trip."""

import json
import math
import re
import time
import zlib
from pathlib import Path

# A widget's HTML: at most 32768 bytes, and 4096 once compressed as Telegram counts it.
HTML_LIMIT = 32768
COMPRESSED_LIMIT = 4096
DATA_LIMIT = 1024

KINDS = {"bus": "b", "train": "t", "walk": "w"}

_SOURCE = Path(__file__).with_name("trip_widget.html")


def html_of(name: str) -> str:
    """A widget's HTML as sent: without its comments or each line's indent."""
    text = re.sub(r"<!--.*?-->", "", Path(__file__).with_name(name).read_text(encoding="utf-8"), flags=re.S)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def widget_html() -> str:
    """trip_widget.html as sent."""
    return html_of("trip_widget.html")


def compressed_size(html: str) -> int:
    return len(zlib.compress(html.encode("utf-8"), 9))


def _cut(s, n: int) -> str:
    s = str(s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _dump(d: dict) -> str:
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def public_data(eta: dict, rev: int, updated_ms: int, parts: "list | None" = None, gone: bool = False,
                routes: "list | None" = None) -> str:
    """The widget's shared state from an ETA link's data, at most DATA_LIMIT bytes:

    r   revision, raised on every change, so the widget never goes back to an older one
    n   the sharer's name, t where they're going, a their arrival (unix seconds)
    i   the part they're on, c how many parts, k l d s that part's kind, label, end and stops left
    p   the parts as [kind, label, end] from part o on, as far as they're known
    u   when the link was last updated (unix seconds)
    e   1 once they've arrived, x 1 once they stopped sharing, 2 once the link's gone
    y   on a train: which doors to stand at for where they get off, or their change (mrt_doors.py)

    m v j q w h the map (map_data, below)

    `parts` are the bot's own trip's parts ({kind, label, to}), all of them; for a link the
    web app shares, its timeline has the parts from the current one on. `routes` are the bot's
    own trip's parts, or a web share's, as {"c": colour, "p": points} (route_shapes.py) for the
    map; without them, the map draws the link's path as one line."""
    leg = eta.get("leg") or {}
    i = int(eta.get("legIndex") or 0)
    d = {
        "r": rev,
        "n": _cut(eta.get("name"), 32),
        "t": _cut((eta.get("to") or {}).get("label"), 60),
        "a": round((eta.get("arriveAt") or updated_ms) / 1000),
        "i": i,
        "c": max(1, int(eta.get("legCount") or 1)),
        "k": KINDS.get(leg.get("kind"), "b"),
        "l": _cut(leg.get("label"), 30),
        "d": _cut(leg.get("to"), 60),
        "s": leg.get("stopsLeft"),
        # To the minute, as the widget shows it: an update a few seconds on is no change.
        "u": updated_ms // 60000 * 60,
    }
    if parts:
        d["o"], src = 0, [(p.get("kind"), p.get("label"), p.get("to")) for p in parts]
    else:
        tl = (eta.get("timeline") or {}).get("legs") or []
        d["o"], src = i, [(p.get("kind"), p.get("label"), p.get("to")) for p in tl]
    # Where to stand on the train they're on (mrt_doors.py), from the bot's own trip's parts.
    tip = (parts[i].get("y") if parts and 0 <= i < len(parts) else None) if not eta.get("ended") else None
    if tip:
        d["y"] = _cut(tip, 220)
    if eta.get("ended"):
        d["e"] = 1
    if gone:
        d["x"] = 2
    elif eta.get("stopped"):
        d["x"] = 1
    to = eta.get("to") or {}
    end = [to["lat"], to["lng"]] if to.get("lat") is not None else None
    route = routes or ([eta["path"]] if eta.get("path") else None)
    if eta.get("ended"):
        here, mine, current = None, False, None
    else:
        (here, mine), current = where_now(eta, updated_ms if gone else None), i if routes and len(routes) == d["c"] else None
    # The parts as long as they fit, with the map: the map's points fewer first, then the parts'
    # ends shortened, then left off, then the map dropped, then fewer parts.
    for end_len in (60, 36, 20, 0):
        d["p"] = [[KINDS.get(k, "b"), _cut(l, 30), _cut(t, end_len) if end_len else ""] for k, l, t in src[:12]]
        for most in MAP_POINTS:
            m = map_data(route, here, end, most, current, snap=not mine) or {}
            if len(_dump({**d, **m}).encode("utf-8")) <= DATA_LIMIT:
                return _dump({**d, **m})
        if len(_dump(d).encode("utf-8")) <= DATA_LIMIT and end_len == 0:
            return _dump(d)
    while d["p"] and len(_dump(d).encode("utf-8")) > DATA_LIMIT:
        d["p"].pop()
    out = _dump(d)
    if len(out.encode("utf-8")) > DATA_LIMIT:
        d.pop("p")
        d["d"], d["t"] = _cut(d["d"], 24), _cut(d["t"], 24)
        out = _dump(d)
    return out


# ---------- the map ----------
#
# A widget can't load map tiles or any picture (no network, and nothing but data: images), so its
# map is the trip itself, drawn on a dot grid (trip_widget.html): each part along the road, the
# rails or the footpaths it really takes (route_shapes.py), in its colour, the changes between
# parts, the end, and where they are. It goes in the shared state as a few dozen points,
# simplified and packed as 4 characters each:
#
#   m   the points, x then y, each 0-4095 as two characters of B64, metres from the corner of
#       the route's box, scaled by its longer side
#   v   [W, H], the box's width and height in those units
#   j   where each part after the first starts, as point indexes
#   q   each part's colour: "b" a bus, "w" a walk, "t" a train of no known line, or the line's
#       code ("EW", "NS", "BP", ...), as the web app's live map colours them
#   w   where they are, packed the same way: their location if it's fresh, else the trip's
#       place put on the part they're on
#   h   the last point they've gone past: the way's gone over up to it, and ahead after

B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
MAP_POINTS = (64, 48, 32, 20, 12)
# Their own location stands for where they are while it's this fresh.
ME_FRESH_MS = 5 * 60 * 1000


def _rdp(pts: list, eps: float) -> list:
    """Ramer-Douglas-Peucker on projected points: the fewest that stay within eps of the line."""
    if len(pts) < 3:
        return pts[:]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1.0
        far, at = 0.0, -1
        for i in range(a + 1, b):
            px, py = pts[i]
            dist = abs(dy * (px - ax) - dx * (py - ay)) / norm if (dx or dy) else math.hypot(px - ax, py - ay)
            if dist > far:
                far, at = dist, i
        if far > eps and at > 0:
            keep[at] = True
            stack += [(a, at), (at, b)]
    return [p for p, k in zip(pts, keep) if k]


def _enc(v: float) -> str:
    n = max(0, min(4095, round(v)))
    return B64[n >> 6] + B64[n & 63]


def _onto(pts: list, q) -> tuple:
    """The point on a line nearest q, and the index of the segment it's on."""
    best, at, seg = None, q, 0
    for i in range(len(pts) - 1):
        (ax, ay), (bx, by) = pts[i], pts[i + 1]
        dx, dy = bx - ax, by - ay
        len2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, ((q[0] - ax) * dx + (q[1] - ay) * dy) / len2)) if len2 else 0.0
        x, y = ax + t * dx, ay + t * dy
        d = (x - q[0]) ** 2 + (y - q[1]) ** 2
        if best is None or d < best:
            best, at, seg = d, (x, y), i
    return at, seg


def map_data(routes: list, here=None, end=None, most: int = 64, current: "int | None" = None,
             snap: bool = True) -> "dict | None":
    """The map's part of the state (above). `routes` are the parts, each {"c": colour, "p":
    [[lat, lng], ...]} (or a bare list of points, drawn as a bus); `here` where they are, put on
    part `current` when `snap` (an estimate, not their own location); `end` the end. None without
    a route to draw."""
    routes = [r if isinstance(r, dict) else {"c": "b", "p": r} for r in (routes or [])]
    routes = [r for r in routes if r.get("p") and len(r["p"]) >= 2]
    if not routes:
        return None
    lat0 = math.radians(sum(p[0] for r in routes for p in r["p"]) / sum(len(r["p"]) for r in routes))
    kx, ky = 111320 * math.cos(lat0), 110540
    proj = lambda p: (p[1] * kx, -p[0] * ky)
    parts = [[proj(p) for p in r["p"]] for r in routes]
    if current is not None and not 0 <= current < len(parts):
        current = None
    here_xy = proj(here) if here else None
    if here_xy and snap:
        on = parts[current] if current is not None else [q for r in parts for q in r]
        here_xy = _onto(on, here_xy)[0]
    xs_all = [x for r in parts for x, _ in r]
    ys_all = [y for r in parts for _, y in r]
    span = max(1.0, max(xs_all) - min(xs_all), max(ys_all) - min(ys_all))
    # Simplified until the whole way is `most` points or fewer, each part keeping its ends.
    eps = span / 800
    while True:
        simple = [_rdp(r, eps) for r in parts]
        if sum(len(r) for r in simple) <= most or eps > span:
            break
        eps *= 1.5
    pts, starts = [], []
    for r in simple:
        joined = bool(pts) and math.hypot(r[0][0] - pts[-1][0], r[0][1] - pts[-1][1]) < span / 300
        starts.append(len(pts) - 1 if joined else len(pts))
        pts += r[1:] if joined else r
    # The last point they've gone past: on the part they're on, the nearest before them.
    gone = None
    if here_xy:
        a = starts[current] if current is not None else 0
        b = (starts[current + 1] if current is not None and current + 1 < len(starts) else len(pts) - 1)
        seg = _onto(pts[a:b + 1], here_xy)[1] if b > a else 0
        gone = a + seg
    extra = [here_xy] if here_xy else []
    if end:
        extra.append(proj(end))
    xs = [x for x, _ in pts + extra]
    ys = [y for _, y in pts + extra]
    x0, y0 = min(xs), min(ys)
    scale = 4095 / max(1.0, max(xs) - x0, max(ys) - y0)
    out = {
        "m": "".join(_enc((x - x0) * scale) + _enc((y - y0) * scale) for x, y in pts),
        "v": [round((max(xs) - x0) * scale), round((max(ys) - y0) * scale)],
        "q": [r.get("c") or "b" for r in routes],
    }
    if len(starts) > 1:
        out["j"] = starts[1:]
    if here_xy:
        out["w"] = _enc((here_xy[0] - x0) * scale) + _enc((here_xy[1] - y0) * scale)
        out["h"] = gone
    return out


def where_now(eta: dict, now_ms: "int | None" = None) -> "tuple[list | None, bool]":
    """Where they are, for the map, and whether it's their own location: their location while
    it's fresh, else the trip's place."""
    now_ms = now_ms or int(time.time() * 1000)
    me = eta.get("me") or {}
    if me.get("lat") is not None and now_ms - (me.get("t") or 0) <= ME_FRESH_MS:
        return [me["lat"], me["lng"]], True
    at = eta.get("at")
    return ([at[0], at[1]] if at else None), False

OWNER_CHAT_DATA = _dump({"o": 1})


def caption(eta: dict, own: bool) -> str:
    """The widget's caption: what the chat list, notifications and apps without widgets show."""
    to = (eta.get("to") or {}).get("label") or "their stop"
    if own:
        return f"🧭 Your trip to {to}, live. Share it from the button below."
    name = (eta.get("name") or "").strip()
    return f"🧭 {name + '’s' if name else 'A shared'} trip to {to}, live."
