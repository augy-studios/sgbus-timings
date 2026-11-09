"""uwuCoins in the bot, as the web app has them (main-site/js/coins.js): coins for every trip
taken to the end with a ride on it shown to be real (rides.py), and for each feat (feats.py);
spent on the wheel (/coins, coins_view.py), where every spin wins something.

A trip's coins (for_trip):
  FINISH                     for getting there
  + 1 for every KM_PER_COIN km ridden, up to KM_COINS_MAX
  + PER_CHANGE for each change between rides
  + PER_OPERATOR for each bus operator, and for each train operator
  + PER_LINE for each MRT or LRT line

The wheel: SPIN_COST a spin, SLOTS each as likely as the others. The egg slot gives a link that
opens an Easter egg once, in the web app or the Android app, where it's the web wheel's egg
slot's prize: GTA VI's colours while they're on offer, else an egg not found yet there, else
EGG_GONE_COINS uwuCoins (the site's api/share.js, kind egg). Keep the numbers in step with
js/coins.js.

Kept in coin_log, every coin in and out with why: the balance is their sum. Each chat's own,
as each phone's are; /sync can add another's balance to it (sync_bot.py)."""

import json
import random
import time

import httpx

from .config import config
from .db import db
from .http_client import shared_client
from .rides import is_ride, line_of, metres

FINISH = 5
KM_PER_COIN = 2
KM_COINS_MAX = 30
PER_CHANGE = 3
PER_OPERATOR = 4
PER_LINE = 2
SPIN_COST = 100
SLOTS = [{"egg": True}, {"coins": 20}, {"coins": 50}, {"coins": 30}, {"coins": 70}, {"coins": 40}, {"coins": 150}, {"coins": 60}]
EGG_GONE_COINS = 80
SBS_LINES = ["NE", "DT", "SK", "PG"]


class CoinError(RuntimeError):
    pass


def balance(chat_id: int) -> int:
    row = db.execute("SELECT COALESCE(SUM(n), 0) AS b FROM coin_log WHERE chat_id = ?", (chat_id,)).fetchone()
    return max(0, int(row["b"]))


def add(chat_id: int, n: int, why: str, info: "dict | None" = None, now: "int | None" = None) -> None:
    with db:
        db.execute("INSERT INTO coin_log (chat_id, at, n, why, info_json) VALUES (?, ?, ?, ?, ?)",
                   (chat_id, now or int(time.time() * 1000), n, why, json.dumps(info) if info else None))


def log(chat_id: int, limit: int = 10) -> list:
    rows = db.execute("SELECT * FROM coin_log WHERE chat_id = ? ORDER BY at DESC, id DESC LIMIT ?", (chat_id, limit)).fetchall()
    return [{**dict(r), "info": json.loads(r["info_json"]) if r["info_json"] else {}} for r in rows]


def _bus_operator(service: str) -> str:
    row = db.execute("SELECT operator FROM bus_services WHERE service_no = ?", (service,)).fetchone()
    return (row["operator"] or "") if row else ""


def for_trip(legs: list, seen: list) -> "dict | None":
    """A trip's coins, {n, parts}, or None without a real ride on it."""
    rides = [l for l in legs if is_ride(l)]
    if not rides or not any(s and s.get("ok") for s in seen):
        return None
    m = sum(metres(l["points"][i - 1], l["points"][i]) for l in rides for i in range(1, len(l["points"])))
    lines = {line_of(l) for l in rides if l["kind"] == "train"} - {""}
    train_ops = {"SBS" if l in SBS_LINES else "SMRT" for l in lines}
    bus_ops = {_bus_operator(l.get("service") or "") for l in rides if l["kind"] == "bus"} - {""}
    parts = {
        "finish": FINISH,
        "km": min(KM_COINS_MAX, int(m / 1000 // KM_PER_COIN)),
        "changes": PER_CHANGE * (len(rides) - 1),
        "busOps": PER_OPERATOR * len(bus_ops),
        "trainOps": PER_OPERATOR * len(train_ops),
        "lines": PER_LINE * len(lines),
    }
    return {"n": sum(parts.values()), "parts": parts}


def paid_for(chat_id: int, trip_id: str) -> bool:
    return any(json.loads(r["info_json"] or "{}").get("trip") == trip_id
               for r in db.execute("SELECT info_json FROM coin_log WHERE chat_id = ? AND why = 'trip'", (chat_id,)))


async def egg_link() -> str:
    """A new link that opens an Easter egg once, in the web app or the Android app."""
    headers = {"Authorization": f"Bearer {config.bot_api_token}"} if config.bot_api_token else {}
    try:
        res = await shared_client().post(config.nav_api_url.rstrip("/") + "/api/share", json={"kind": "egg", "data": {}}, headers=headers, timeout=20)
    except httpx.HTTPError as err:
        raise CoinError("Couldn't reach SG Bus Timings for your egg just now.") from err
    if res.status_code != 200:
        raise CoinError("Couldn't make your egg's link just now.")
    return config.webapp_url.rstrip("/") + res.json()["path"]


async def spin(chat_id: int, rng: "random.Random | None" = None) -> dict:
    """One spin: {index, coins, link, before, after}. CoinError when there aren't enough coins,
    or the egg's link can't be made (the spin is given back)."""
    if balance(chat_id) < SPIN_COST:
        raise CoinError(f"{SPIN_COST - balance(chat_id)} more uwuCoins for a spin.")
    add(chat_id, -SPIN_COST, "spin")
    before = balance(chat_id)
    index = (rng or random).randrange(len(SLOTS))
    slot = SLOTS[index]
    if slot.get("egg"):
        try:
            link = await egg_link()
        except CoinError:
            add(chat_id, SPIN_COST, "refund")
            raise
        add(chat_id, 0, "egg", {"link": link})
        return {"index": index, "coins": 0, "link": link, "before": before, "after": balance(chat_id)}
    add(chat_id, slot["coins"], "wheel")
    return {"index": index, "coins": slot["coins"], "link": None, "before": before, "after": balance(chat_id)}


WORDS = {
    "trip": "A trip", "feat": "A feat", "spin": "A spin of the wheel", "wheel": "Won on the wheel",
    "egg": "Won on the wheel: an Easter egg's link", "refund": "A spin given back", "sync": "Added by /sync",
}
