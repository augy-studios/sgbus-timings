"""Reading a calendar for /calendar: the chat's events with a location, today and the next
two weeks, from its private iCal link. A port of the web app's js/calendar.js, so both read
a calendar the same way: repeating events expanded here (RRULE: daily, weekly, monthly,
yearly, with INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY and BYMONTH; EXDATE; RECURRENCE-ID
changes and cancellations), each in the time zone it was set in, and online meetings (a link
for a location) left out.

The link is fetched only if it's https (webcal:// is https) to a public host, redirects
included, and only an answer that is a calendar, up to MAX_BYTES, is read. Each location is
matched to a place with /api/places, the postal code first when it has one, and remembered
in calendar_places, which holds locations, never whose they are."""

import asyncio
import ipaddress
import json
import re
import socket
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import httpx

from .db import db
from .http_client import shared_client
from .nav_api import NavError, places

SG = ZoneInfo("Asia/Singapore")
DAYS = 14
MAX_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 3
# A location matched (or not) this long ago is looked up again.
PLACE_TTL_S = 30 * 24 * 3600
ONLINE_RE = re.compile(r"^(https?:|www\.)|zoom\.us|meet\.google|teams\.microsoft|microsoft teams|webex", re.IGNORECASE)


class CalendarError(RuntimeError):
    pass


# ---------- the link ----------


def get_link(chat_id: int) -> "dict | None":
    row = db.execute("SELECT url, hidden_json FROM calendar_links WHERE chat_id = ?", (chat_id,)).fetchone()
    return {"url": row["url"], "hidden": json.loads(row["hidden_json"] or "[]")} if row else None


def set_link(chat_id: int, url: str) -> None:
    with db:
        db.execute(
            """
            INSERT INTO calendar_links (chat_id, url, hidden_json, updated_at) VALUES (?, ?, '[]', ?)
            ON CONFLICT(chat_id) DO UPDATE SET url = excluded.url, hidden_json = '[]', updated_at = excluded.updated_at
            """,
            (chat_id, url, int(time.time() * 1000)),
        )


def clear_link(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM calendar_links WHERE chat_id = ?", (chat_id,))


def hide_event(chat_id: int, key: str) -> None:
    link = get_link(chat_id)
    if not link:
        return
    hidden = (link["hidden"] + [key])[-200:]
    with db:
        db.execute("UPDATE calendar_links SET hidden_json = ? WHERE chat_id = ?", (json.dumps(hidden), chat_id))


def _check_url(raw: str) -> str:
    url = re.sub(r"^webcals?://", "https://", raw.strip(), flags=re.IGNORECASE)
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise CalendarError("Calendar links start with https:// or webcal://. Send your calendar's private iCal (.ics) link.")
    host = parsed.hostname
    try:
        ipaddress.ip_address(host)
        raise CalendarError("That link doesn't go to a calendar service.")
    except ValueError:
        pass
    if host == "localhost" or re.search(r"\.(local|internal|localhost)$", host, re.IGNORECASE):
        raise CalendarError("That link doesn't go to a calendar service.")
    try:
        infos = socket.getaddrinfo(host, 443)
    except OSError:
        raise CalendarError("Couldn't reach that calendar. Check the link.")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise CalendarError("That link doesn't go to a calendar service.")
    return url


async def fetch_calendar(raw: str) -> str:
    url = await asyncio.to_thread(_check_url, raw)
    for _ in range(MAX_REDIRECTS + 1):
        try:
            res = await shared_client().get(url, timeout=15, follow_redirects=False, headers={"Accept": "text/calendar, */*;q=0.5"})
        except httpx.HTTPError:
            raise CalendarError("Couldn't read your calendar right now. Please try again shortly.")
        if res.is_redirect and res.headers.get("location"):
            url = await asyncio.to_thread(_check_url, urljoin(url, res.headers["location"]))
            continue
        if res.status_code in (401, 403, 404):
            raise CalendarError("The calendar service turned that link down. It may have been reset: copy the private iCal link again.")
        if res.status_code != 200:
            raise CalendarError(f"The calendar service didn't answer properly ({res.status_code}). Try again later.")
        if len(res.content) > MAX_BYTES:
            raise CalendarError("That calendar is too big to read.")
        text = res.content.decode("utf-8", errors="replace")
        if "BEGIN:VCALENDAR" not in text[:2000].upper():
            raise CalendarError("That link isn't a calendar. Use the iCal (.ics) link, not the calendar's web page.")
        return text
    raise CalendarError("That link redirects too many times.")


# ---------- reading iCal ----------

WINDOWS_ZONES = {
    "singapore standard time": "Asia/Singapore", "malay peninsula standard time": "Asia/Singapore",
    "china standard time": "Asia/Shanghai", "taipei standard time": "Asia/Taipei", "tokyo standard time": "Asia/Tokyo",
    "korea standard time": "Asia/Seoul", "se asia standard time": "Asia/Bangkok", "india standard time": "Asia/Kolkata",
    "aus eastern standard time": "Australia/Sydney", "gmt standard time": "Europe/London",
    "w. europe standard time": "Europe/Berlin", "eastern standard time": "America/New_York",
    "pacific standard time": "America/Los_Angeles", "utc": "UTC",
}


def _zone(tzid: "str | None"):
    if not tzid:
        return SG  # a floating time is Singapore's
    name = WINDOWS_ZONES.get(tzid.lower())
    if not name:
        m = re.search(r"([A-Za-z_]+/[A-Za-z_+-]+)$", tzid)
        name = m.group(1) if m else tzid
    try:
        return ZoneInfo(name)
    except Exception:
        return SG


def _unfold(text: str) -> list:
    return re.sub(r"\r?\n[ \t]", "", text).splitlines()


def _parse_line(line: str):
    quoted = False
    i = 0
    for i, c in enumerate(line):
        if c == '"':
            quoted = not quoted
        elif c == ":" and not quoted:
            break
    else:
        i = len(line)
    name, *rest = line[:i].split(";")
    params = {}
    for kv in rest:
        k, _, v = kv.partition("=")
        if v:
            params[k.upper()] = v.strip('"')
    return name.upper(), params, line[i + 1 :]


def _unescape(v: str) -> str:
    v = re.sub(r"\\n", " ", v, flags=re.IGNORECASE)
    v = re.sub(r"\\([,;\\])", r"\1", v)
    return re.sub(r"\s+", " ", v).strip()


def _parse_date(value: str, params=None):
    """{"c": wall-clock fields, "tz": zone, "all_day": bool}, or None."""
    params = params or {}
    m = re.match(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$", value.strip())
    if not m:
        return None
    all_day = not m.group(4) or params.get("VALUE") == "DATE"
    c = (int(m.group(1)), int(m.group(2)), int(m.group(3)),
         0 if all_day else int(m.group(4)), 0 if all_day else int(m.group(5)), 0 if all_day else int(m.group(6) or 0))
    tz = timezone.utc if m.group(7) else SG if all_day else (_zone(params["TZID"]) if params.get("TZID") else None)
    return {"c": c, "tz": tz, "all_day": all_day}


def _moment(c, tz) -> datetime:
    return datetime(*c, tzinfo=tz or SG)


def parse_ics(text: str) -> list:
    """Every VEVENT with a place-like location, as {uid, title, location, start, rrule,
    exdates, recurrence_id, cancelled}."""
    events = []
    ev = None
    nested = 0
    for line in _unfold(text):
        if not line:
            continue
        name, params, value = _parse_line(line)
        if name == "BEGIN" and value.upper() == "VEVENT":
            ev, nested = {"exdates": set()}, 0
        elif name == "BEGIN" and ev is not None:
            nested += 1
        elif name == "END" and ev is not None and nested:
            nested -= 1
        elif name == "END" and value.upper() == "VEVENT" and ev is not None:
            if ev.get("start") and ev.get("location") and not ONLINE_RE.search(ev["location"]):
                events.append(ev)
            ev = None
        elif ev is not None and not nested:
            if name == "UID":
                ev["uid"] = value.strip()
            elif name == "SUMMARY":
                ev["title"] = _unescape(value)
            elif name == "LOCATION":
                ev["location"] = _unescape(value)
            elif name == "DTSTART":
                ev["start"] = _parse_date(value, params)
            elif name == "RRULE":
                ev["rrule"] = {k.upper(): v for k, _, v in (kv.partition("=") for kv in value.split(";"))}
            elif name == "EXDATE":
                for v in value.split(","):
                    d = _parse_date(v, params)
                    if d:
                        ev["exdates"].add(_moment(d["c"], d["tz"]).timestamp())
            elif name == "RECURRENCE-ID":
                d = _parse_date(value, params)
                if d:
                    ev["recurrence_id"] = _moment(d["c"], d["tz"]).timestamp()
            elif name == "STATUS":
                ev["cancelled"] = value.strip().upper() == "CANCELLED"
    return events


# ---------- repeating events ----------

WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
PERIOD_DAYS = {"DAILY": 1, "WEEKLY": 7, "MONTHLY": 31, "YEARLY": 366}


def _days_in(y: int, m: int) -> int:
    return ((date(y + m // 12, m % 12 + 1, 1)) - date(y, m, 1)).days


def _period_days(rule: dict, d0: date, k: int) -> list:
    interval = max(1, int(rule.get("INTERVAL") or 1))
    by_day = [t for t in (rule.get("BYDAY") or "").split(",") if t]
    by_month_day = [int(x) for x in (rule.get("BYMONTHDAY") or "").split(",") if x]
    freq = rule.get("FREQ")
    if freq == "DAILY":
        d = d0 + timedelta(days=k * interval)
        return [d] if not by_day or any(WEEKDAYS.get(t[-2:]) == d.weekday() for t in by_day) else []
    if freq == "WEEKLY":
        monday = d0 - timedelta(days=d0.weekday()) + timedelta(weeks=k * interval)
        wanted = sorted({WEEKDAYS[t[-2:]] for t in by_day if t[-2:] in WEEKDAYS} or {d0.weekday()})
        return [monday + timedelta(days=w) for w in wanted]
    if freq == "MONTHLY":
        total = d0.month - 1 + k * interval
        y, m = d0.year + total // 12, total % 12 + 1
        n = _days_in(y, m)
        days = set()
        if by_day:
            for t in by_day:
                w = WEEKDAYS.get(t[-2:])
                nth = int(t[:-2]) if t[:-2] else 0
                every = [d for d in range(1, n + 1) if date(y, m, d).weekday() == w]
                if not nth:
                    days.update(every)
                elif -len(every) <= (nth - 1 if nth > 0 else nth) < len(every):
                    days.add(every[nth - 1 if nth > 0 else nth])
        elif by_month_day:
            days = {d if d > 0 else n + d + 1 for d in by_month_day if 1 <= (d if d > 0 else n + d + 1) <= n}
        elif d0.day <= n:
            days = {d0.day}
        return [date(y, m, d) for d in sorted(days)]
    if freq == "YEARLY":
        y = d0.year + k * interval
        months = [int(x) for x in (rule.get("BYMONTH") or "").split(",") if x] or [d0.month]
        days = by_month_day or [d0.day]
        return [date(y, m, d) for m in months for d in days if 1 <= d <= _days_in(y, m)]
    return []


def occurrences(ev: dict, start: float, end: float) -> list:
    """The moments (as timestamps) an event starts in [start, end)."""
    s = ev["start"]
    c, tz, all_day = s["c"], s["tz"], s["all_day"]
    first = _moment(c, tz).timestamp()
    rule = ev.get("rrule")
    slack = 86400 if all_day else 0
    if not rule or rule.get("FREQ") not in PERIOD_DAYS:
        return [first] if start - slack <= first < end else []
    until = float("inf")
    if rule.get("UNTIL"):
        u = _parse_date(rule["UNTIL"])
        if u:
            until = _moment(u["c"], u["tz"] or tz).timestamp() + (86399 if u["all_day"] else 0)
    count = int(rule["COUNT"]) if rule.get("COUNT") else None
    interval = max(1, int(rule.get("INTERVAL") or 1))
    d0 = date(c[0], c[1], c[2])
    k = 0
    if count is None and start > first:
        k = max(0, int((start - first) // (PERIOD_DAYS[rule["FREQ"]] * interval * 86400)) - 1)
    out, seen = [], 0
    for _ in range(1500):
        for d in _period_days(rule, d0, k):
            if d < d0:
                continue
            ts = _moment((d.year, d.month, d.day, c[3], c[4], c[5]), tz).timestamp()
            seen += 1
            if ts > until or (count is not None and seen > count) or ts >= end:
                return out
            if ts >= start - slack and ts not in ev["exdates"]:
                out.append(ts)
        k += 1
    return out


def upcoming(events: list, hidden=()) -> list:
    """Every event from now (or today, for a whole day) to DAYS ahead, soonest first, as
    {key, title, location, start (datetime), all_day}, without the hidden ones."""
    now = time.time()
    end = now + DAYS * 86400
    hidden = set(hidden)
    changed = {}
    for ev in events:
        if ev.get("recurrence_id") is not None and ev.get("uid"):
            changed.setdefault(ev["uid"], set()).add(ev["recurrence_id"])
    out = []
    for ev in events:
        if ev.get("cancelled"):
            continue
        skip = changed.get(ev.get("uid")) if ev.get("recurrence_id") is None else None
        for ts in occurrences(ev, now, end):
            if skip and ts in skip:
                continue
            if (ts + 86400 <= now) if ev["start"]["all_day"] else ts < now:
                continue
            key = f"{ev.get('uid') or ev.get('title')}|{int(ts * 1000)}"
            if key not in hidden:
                out.append({
                    "key": key, "title": ev.get("title") or "Event", "location": ev["location"],
                    "start": datetime.fromtimestamp(ts, SG), "all_day": ev["start"]["all_day"],
                })
    return sorted(out, key=lambda e: e["start"])[:30]


# ---------- where each event is ----------


async def place_for(location: str) -> "dict | None":
    """The place a location names, as {label, lat, lng}, or None for none."""
    row = db.execute("SELECT label, lat, lng, checked_at FROM calendar_places WHERE location = ?", (location,)).fetchone()
    if row and time.time() - row["checked_at"] / 1000 < PLACE_TTL_S:
        return {"label": row["label"], "lat": row["lat"], "lng": row["lng"]} if row["label"] else None
    postal = re.search(r"\b(\d{6})\b", location)
    tries = []
    for q in (postal.group(1) if postal else None, location[:150], location.split(",")[0]):
        if q and len(q.strip()) >= 2 and q not in tries:
            tries.append(q)
    found = None
    for q in tries:
        try:
            hits = await places(q)
        except NavError:
            return None  # not remembered: worth trying again later
        if hits:
            # Named as the event names it, at the point the search found, as the web app does.
            own = location.split(",")[0].strip()
            found = {"label": own if 3 <= len(own) <= 80 else hits[0]["label"], "lat": hits[0]["lat"], "lng": hits[0]["lng"]}
            break
    with db:
        db.execute(
            """
            INSERT INTO calendar_places (location, label, lat, lng, checked_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(location) DO UPDATE SET label = excluded.label, lat = excluded.lat, lng = excluded.lng, checked_at = excluded.checked_at
            """,
            (location, found and found["label"], found and found["lat"], found and found["lng"], int(time.time() * 1000)),
        )
    return found
