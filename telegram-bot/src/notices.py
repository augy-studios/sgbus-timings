"""The Newsfeed: what LTA and the bus and train operators announce ahead of time, from the
site's /api/notices (main-site/api/_lib/notices.js), which reads LTA's announcements and each
operator's news every hour. For /alerts, the stop notes under a stop's timings, and the
updates sent to chats with the newsfeed on in /sub.

Kept in memory by poll_newsfeed (handlers/servicealerts.py, every POLL_MINUTES), so a stop's
timings can say what's on there without asking the site each time."""

import re
from datetime import datetime, timedelta, timezone

import httpx

from .config import config
from .http_client import shared_client

SGT = timezone(timedelta(hours=8))
# Coming notices shown this far ahead, and the operators' news this many.
AHEAD_DAYS = 14
NEWS_SHOWN = 6

_latest: "dict | None" = None

# Whether a notice changes a bus or train service, for the newsfeed's "Service changes only".
# Keep in step with changesService in main-site/api/_lib/notices.js.
_CHANGES_RE = re.compile(
    r"divers|clos|skip|servic|stop|route|berth|shuttle|disrupt|extend|extension|operating hours|last (bus|train)"
    r"|relocat|amend|adjust|new (bus|short|peak|service)|interchange|terminal",
    re.I,
)
_NOT_CHANGES_RE = re.compile(r"fare|award|recruit|career|contract|campaign|trial|winner|appoint", re.I)


async def fetch_notices() -> "dict | None":
    """{at, items, sources} from the site, kept as the latest; None if it can't be reached."""
    global _latest
    try:
        res = await shared_client().get(config.nav_api_url.rstrip("/") + "/api/notices", timeout=20)
    except httpx.HTTPError:
        return None
    if res.status_code != 200:
        return None
    _latest = res.json()
    return _latest


def latest() -> "dict | None":
    return _latest


def sg_date(offset: int = 0) -> str:
    return (datetime.now(SGT) + timedelta(days=offset)).strftime("%Y-%m-%d")


def on_date(n: dict, date: str) -> bool:
    if n.get("days"):
        return date in n["days"]
    if not n.get("from"):
        return False
    return n["from"] <= date and (n.get("to") is None or date <= n["to"])


def changes_service(n: dict) -> bool:
    if n.get("source") == "lta":
        return True
    return bool(_CHANGES_RE.search(n["title"])) and not _NOT_CHANGES_RE.search(n["title"])


def source_name(n: dict, sources: dict) -> str:
    return "LTA" if n.get("source") == "lta" else sources.get(n.get("source"), n.get("source", ""))


def day_text(date: str) -> str:
    d = datetime.strptime(date, "%Y-%m-%d")
    return f"{d.strftime('%a')} {d.day} {d.strftime('%b')}"


def when_text(n: dict) -> str:
    """When a notice is, by today: "Today", "Tomorrow", or its own words."""
    today = sg_date()
    if on_date(n, today):
        return f"Today, till {day_text(n['to'])}" if n.get("to") and n["to"] != today else "Today"
    if on_date(n, sg_date(1)):
        return "Tomorrow"
    return n.get("dates") or (day_text(n["from"]) if n.get("from") else "")


def coming(items: list) -> list:
    """LTA's notices on now or in the next AHEAD_DAYS, soonest first."""
    today, ahead, week_ago = sg_date(), sg_date(AHEAD_DAYS), sg_date(-7)

    def soon(n):
        if n.get("source") != "lta":
            return False
        if n.get("days"):
            return any(today <= d <= ahead for d in n["days"])
        if not n.get("from") or n["from"] > ahead:
            return False
        return n["from"] >= week_ago if n.get("to") is None else n["to"] >= today

    return sorted((n for n in items if soon(n)), key=lambda n: n.get("from") or "")


def news(items: list) -> list:
    return sorted((n for n in items if n.get("kind") == "news"), key=lambda n: n.get("published") or "", reverse=True)[:NEWS_SHOWN]


def stop_notes(code: str) -> list:
    """Lines for a stop's timings: its buses skipping it, or a notice naming it, today or
    tomorrow. Empty till the newsfeed's in."""
    if not _latest:
        return []
    notes = []
    for offset, word in ((0, "Today"), (1, "Tomorrow")):
        date = sg_date(offset)
        for n in _latest.get("items") or []:
            stops = n.get("stops") or {}
            if n.get("source") != "lta" or not on_date(n, date) or not (code in stops or code in (n.get("codes") or [])):
                continue
            here = stops.get(code)
            if here:
                buses = here["services"]
                what = f"{', '.join(buses)} skip{'s' if len(buses) == 1 else ''} this stop" + (f", {here['when']}" if here.get("when") else "")
            else:
                what = "this stop is affected"
            notes.append(f"⚠️ {word}: {what}. {n['title']}.")
        if notes:
            break
    return notes
