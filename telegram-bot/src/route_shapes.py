"""The way a trip really goes, for the map in its widget (trip_widget.py): a trip only knows its
stops and stations, and straight lines between them can be a long way off the road or the rails.

- A bus part follows the road through every stop, from the site's /api/road (OSRM, as the Get
  Off Alert follows a bus in the web app).
- A train part follows the MRT or LRT track, cut from the site's /data/rail-tracks.json as the
  web app's js/rail-tracks.js cuts it: this is that file in Python.
- A walk follows the footpaths, from the site's /api/walk.

Anything that can't be had stays a straight line, so a trip is always drawn. Shapes are worked
out once a trip starts (bot_trips.py) and kept with it."""

import asyncio
import math

import httpx

from .config import config
from .http_client import shared_client

# As js/rail-tracks.js.
NEAR_M = 400
RING_M = 30
DETOUR = 3
DETOUR_M = 1000
# /api/road takes this many stops at most; a longer bus part goes in pieces.
ROAD_POINTS = 120

# Each part's colour on the map, as the web app's live map (js/map.js, LINE_COLOURS): a train by
# its line's code, a bus "b", a walk "w".
LINES = {"EW", "CG", "NS", "NE", "CC", "CE", "DT", "TE", "BP", "SE", "SW", "PE", "PW", "SK", "PG"}

_tracks: "dict | None" = None
_tracks_lock = asyncio.Lock()


def _site(path: str) -> str:
    return config.nav_api_url.rstrip("/") + path


def _headers() -> dict:
    return {"Authorization": f"Bearer {config.bot_api_token}"} if config.bot_api_token else {}


def line_code(label: str) -> "str | None":
    """A train part's line, from its label: "EW Line", "BP LRT"."""
    code = (label or "").split(" ")[0].upper()
    return code if code in LINES else None


def colour_of(kind: str, label: str = "") -> str:
    if kind == "train":
        return line_code(label) or "t"
    return "w" if kind == "walk" else "b"


# ---------- the rails (js/rail-tracks.js) ----------

def _metres(a, b) -> float:
    rad = math.radians
    h = math.sin(rad(b[0] - a[0]) / 2) ** 2 + math.cos(rad(a[0])) * math.cos(rad(b[0])) * math.sin(rad(b[1] - a[1]) / 2) ** 2
    return 6371000 * 2 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def _prepare(pts) -> dict:
    cum = [0.0]
    for k in range(1, len(pts)):
        cum.append(cum[-1] + _metres(pts[k - 1], pts[k]))
    return {"pts": pts, "cum": cum, "total": cum[-1], "ring": len(pts) > 2 and _metres(pts[0], pts[-1]) <= RING_M}


def _passes(part, p) -> list:
    kx = 111320 * math.cos(math.radians(p[0]))
    ky = 110540
    pts, cum = part["pts"], part["cum"]
    found, best = [], None
    for k in range(len(pts) - 1):
        ax, ay = pts[k][1] * kx, pts[k][0] * ky
        dx, dy = pts[k + 1][1] * kx - ax, pts[k + 1][0] * ky - ay
        px, py = p[1] * kx - ax, p[0] * ky - ay
        len2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, (px * dx + py * dy) / len2)) if len2 else 0.0
        m = math.hypot(px - t * dx, py - t * dy)
        if m <= NEAR_M:
            if best is None or m < best["m"]:
                best = {"along": cum[k] + t * (cum[k + 1] - cum[k]), "m": m,
                        "at": [pts[k][0] + t * (pts[k + 1][0] - pts[k][0]), pts[k][1] + t * (pts[k + 1][1] - pts[k][1])]}
        elif best is not None:
            found.append(best)
            best = None
    if best is not None:
        found.append(best)
    return found


def _cut(part, a, b) -> dict:
    pts, cum, total, ring = part["pts"], part["cum"], part["total"], part["ring"]

    def inner(frm, to):
        if frm <= to:
            return [pts[k] for k in range(len(pts)) if frm < cum[k] < to]
        return [pts[k] for k in range(len(pts) - 1, -1, -1) if to < cum[k] < frm]

    straight = abs(b["along"] - a["along"])
    if not ring or straight <= total / 2:
        return {"path": [a["at"], *inner(a["along"], b["along"]), b["at"]], "length": straight}
    if b["along"] > a["along"]:
        path = [a["at"], *inner(a["along"], -1), *inner(total + 1, b["along"]), b["at"]]
    else:
        path = [a["at"], *inner(a["along"], total + 1), *inner(-1, b["along"]), b["at"]]
    return {"path": path, "length": total - straight}


def _stretch(parts, a, b) -> "list | None":
    best = None
    for part in parts:
        as_ = _passes(part, a)
        if not as_:
            continue
        bs = _passes(part, b)
        for pa in as_:
            for pb in bs:
                c = _cut(part, pa, pb)
                score = c["length"] + pa["m"] + pb["m"]
                if best is None or score < best["score"]:
                    best = {**c, "score": score}
    if best is None or best["length"] > _metres(a, b) * DETOUR + DETOUR_M:
        return None
    return best["path"]


async def _load_tracks() -> "dict | None":
    global _tracks
    async with _tracks_lock:
        if _tracks is None:
            try:
                res = await shared_client().get(_site("/data/rail-tracks.json"), timeout=20)
                res.raise_for_status()
                _tracks = {code: [_prepare(p) for p in parts] for code, parts in (res.json().get("lines") or {}).items()}
            except (httpx.HTTPError, ValueError) as err:
                print(f"[route_shapes] rail tracks: {err}")
                return None
    return _tracks


async def rail_path(code: str, points: list) -> "list | None":
    """The track through a train part's stations, or None if it can't be had."""
    tracks = await _load_tracks()
    parts = (tracks or {}).get("EW" if code == "CG" else code)
    if not parts or len(points) < 2:
        return None
    ways = [_stretch(parts, points[i], points[i + 1]) for i in range(len(points) - 1)]
    path = [points[0]]
    for i, way in enumerate(ways):
        if way:
            path += way
        if not way or i + 1 >= len(ways) or not ways[i + 1]:
            path.append(points[i + 1])
    return path


# ---------- the roads and footpaths ----------

async def road_path(points: list) -> "list | None":
    """The road a bus takes through its stops, or None."""
    out = []
    for start in range(0, len(points) - 1, ROAD_POINTS - 1):
        chunk = points[start:start + ROAD_POINTS]
        if len(chunk) < 2:
            break
        try:
            res = await shared_client().get(
                _site("/api/road"), params={"points": ";".join(f"{p[0]:.5f},{p[1]:.5f}" for p in chunk)},
                headers=_headers(), timeout=25)
            path = res.json().get("path") if res.status_code == 200 else None
        except (httpx.HTTPError, ValueError) as err:
            print(f"[route_shapes] road: {err}")
            path = None
        if not path:
            return None
        out += path if not out else path[1:]
    return out or None


async def walk_path(a: list, b: list) -> "list | None":
    """The footpaths from a to b, or None."""
    try:
        res = await shared_client().get(_site("/api/walk"), params={"from": f"{a[0]:.5f},{a[1]:.5f}", "to": f"{b[0]:.5f},{b[1]:.5f}"},
                                        headers=_headers(), timeout=25)
        data = res.json() if res.status_code == 200 else {}
    except (httpx.HTTPError, ValueError) as err:
        print(f"[route_shapes] walk: {err}")
        return None
    path = data.get("path")
    return path if path and data.get("source") != "line" else None


# ---------- a trip ----------

async def _shape(kind: str, label: str, points: list) -> list:
    try:
        if kind == "train" and line_code(label):
            got = await rail_path(line_code(label), points)
        elif kind == "bus":
            got = await road_path(points)
        elif kind == "walk":
            got = await walk_path(points[0], points[-1])
        else:
            got = None
    except Exception as err:  # a shape is a nicety: the straight line still draws the trip
        print(f"[route_shapes] {kind} {label}: {err}")
        got = None
    return [[round(p[0], 5), round(p[1], 5)] for p in (got or points)]


async def shapes_for_trip(legs: list) -> list:
    """Each of a trip's parts as {"c": colour, "p": its shape}, from the site's trip legs."""
    paths = await asyncio.gather(*(_shape(l["kind"], l.get("label", ""), l["points"]) for l in legs))
    return [{"c": colour_of(l["kind"], l.get("label", "")), "p": p} for l, p in zip(legs, paths)]


async def shapes_for_link(eta: dict) -> "list | None":
    """A web share's way, from its link: its train rides along the rails (the link's `trains`),
    the rest along the roads. None without a path."""
    path = eta.get("path") or []
    if len(path) < 2:
        return None
    runs, i = [], 0
    trains = sorted(eta.get("trains") or [], key=lambda t: t.get("leg", 0))
    for t in trains:
        pts = t.get("points") or []
        start = next((k for k in range(i, len(path)) if pts and _metres(path[k], pts[0]) < 30), None)
        if start is None or len(pts) < 2:
            continue
        if start > i:
            runs.append(("bus", "", path[i:start + 1]))
        runs.append(("train", f"{t.get('route', '')} Line", path[start:start + len(pts)]))
        i = start + len(pts) - 1
    if i < len(path) - 1:
        runs.append(("bus", "", path[i:]))
    runs = [r for r in runs if len(r[2]) >= 2]
    shapes = await asyncio.gather(*(_shape(k, l, p) for k, l, p in runs))
    return [{"c": colour_of(k, l), "p": s} for (k, l, _), s in zip(runs, shapes)]
