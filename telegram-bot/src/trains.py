"""Train times at an MRT or LRT station, from the site's /api/trains: LTA's timetable, with a
disruption's cancellations and delays over it when LTA's feed has any (main-site/api/trains.js).
LTA gives no live train times otherwise, so these are the timetable's, and say so.

A station search ("Tampines MRT") offers them with a button above its bus stops
(handlers/search.py); the button's message lists each platform's next trains, with Refresh.

Keep in step with main-site/js/trains.js, which reads the same answer."""

import time
from datetime import datetime, timedelta, timezone

import httpx
from telethon import Button

from .buttons import make_button
from .config import config
from .format import escape_md
from .http_client import shared_client

SGT = timezone(timedelta(hours=8))
# A train this close is "Now": at the platform or pulling in.
NOW_S = 30
NEXT_N = 4


async def fetch_trains(codes: list) -> "dict | None":
    """The station's answer from /api/trains, or None when it can't be had."""
    key = ",".join(sorted({c.strip().upper() for c in codes if c.strip()}))
    if not key:
        return None
    try:
        res = await shared_client().get(config.nav_api_url.rstrip("/") + "/api/trains", params={"codes": key}, timeout=20)
        res.raise_for_status()
        return res.json()
    except (httpx.HTTPError, ValueError) as err:
        print(f"[trains] {err}")
        return None


def _clock(ms: float) -> str:
    return datetime.fromtimestamp(ms / 1000, SGT).strftime("%H:%M")


def _when(ms: float, now_ms: float) -> str:
    s = (ms - now_ms) / 1000
    if s <= NOW_S:
        return "Now"
    mins = round(s / 60)
    return _clock(ms) if mins >= 60 else f"{mins} min"


def next_trains(data: dict, platform: dict, now_ms: float, n: int = NEXT_N) -> list:
    """A platform's next `n` trains from now, as dicts of ms, head, way and state (0 the
    timetable's, 1 changed by a disruption, 2 cancelled or not stopping here)."""
    after = (now_ms - data["start"]) / 1000 - NOW_S
    out = []
    for t, h, w, state in platform["trains"]:
        if t < after:
            continue
        out.append({"ms": data["start"] + t * 1000, "head": platform["heads"][h], "way": platform["ways"][w], "state": state})
        if len(out) >= n:
            break
    return out


RANK = {1: "Last train", 2: "2nd last", 3: "3rd last"}


def last_ranks(platform: dict) -> dict:
    """A platform's last three trains of the day that run, each its rank from the last: their
    times (seconds after the day's midnight) to 1, 2 or 3. The answer lists the whole rest of the
    day, so its end is the day's end."""
    runs = [t for t in platform["trains"] if t[3] != 2]
    return {t[0]: i + 1 for i, t in enumerate(reversed(runs[-3:]))}


def last_train_ms(data: dict, platform: dict) -> "float | None":
    runs = [t for t in platform["trains"] if t[3] != 2]
    return data["start"] + runs[-1][0] * 1000 if runs else None


def trains_text(data: "dict | None", name: str, now_ms: "float | None" = None) -> dict:
    """The message for a station's trains, as {markdown, fallback}."""
    now_ms = now_ms if now_ms is not None else time.time() * 1000
    title = f"Trains at {name}"
    if not data or not data.get("platforms"):
        text = "Couldn't get the train times. Try again in a moment."
        return {"markdown": f"**{escape_md(title)}**\n\n{escape_md(text)}", "fallback": f"{title}\n\n{text}"}
    note = (
        "Live: LTA reports a disruption here. Changed and cancelled trains are marked."
        if data.get("live")
        else "Timetable times from LTA. LTA gives live train times only during a disruption."
    )
    md = [f"**{escape_md(title)}**", "", f"_{escape_md(note)}_"]
    plain = [title, "", note]
    for p in data["platforms"]:
        trains = next_trains(data, p, now_ms)
        heads = list(dict.fromkeys(t["head"] for t in trains)) or p["heads"]
        head = f"{p.get('line') or p['code']} towards {' · '.join(heads)}"
        plat = f" · Platform {p['platform']}" if p.get("platform") else ""
        md += ["", f"**{escape_md(head)}**{escape_md(plat)}"]
        plain += ["", head + plat]
        # Its last train today, red-flagged once only the last three are left.
        last_ms = last_train_ms(data, p)
        if last_ms is not None:
            left = sum(1 for t in next_trains(data, p, now_ms, n=10**6) if t["state"] != 2)
            line = f"{'🔴 ' if 0 < left <= 3 else ''}Last train today at {_clock(last_ms)}"
            md.append(f"_{escape_md(line)}_")
            plain.append(line)
        ranks = last_ranks(p)
        if not trains:
            line = "No more trains today."
            if p.get("first"):
                line += f" First train tomorrow at {_clock(data['start'] + (p['first'][0] + 86400) * 1000)}."
            md.append(escape_md(line))
            plain.append(line)
            continue
        for t in trains:
            if t["state"] == 2:
                line = f"Cancelled · {_clock(t['ms'])}"
            else:
                line = f"{_when(t['ms'], now_ms)} · {_clock(t['ms'])}" + (" (changed)" if t["state"] == 1 else "")
            if len(heads) > 1:
                line += f" · {t['head']}"
            rank = ranks.get(round((t["ms"] - data["start"]) / 1000))
            if rank:
                line += f" · {RANK[rank]}"
            md.append(f"• {escape_md(line)}")
            plain.append(f"• {line}")
    return {"markdown": "\n".join(md), "fallback": "\n".join(plain)}


def trains_button_label(name: str) -> str:
    return f"🚆 Train times at {name}"


async def build_trains_view(codes: list, name: str):
    """The message and its Refresh button for a station's trains."""
    data = await fetch_trains(codes)
    rich = trains_text(data, name)
    buttons = [[Button.inline("🔄 Refresh", make_button("trains_refresh", {"codes": codes, "name": name}))]]
    return rich, buttons


def trains_button(station: dict):
    """The button above a station's bus stops that sends its train times."""
    return Button.inline(trains_button_label(station["name"]), make_button("trains", {"codes": station["codes"], "name": station["name"]}))
