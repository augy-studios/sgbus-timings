"""When a /nav or /route journey is for: Leave now, Leave at a time, or Arrive by one, picked up
to a week ahead. A picked time is {"mode": "leave" | "arrive", "at": "2026-10-09T08:30"}, `at`
being Singapore's own clock; Leave now is None. The same shape as the web app's js/when.js.

Also whether a bus is running at a moment. No timetables are published, so that's between the
first and last bus LTA lists for that service at that stop, for that kind of day. Keep in step
with main-site/js/when.js and main-site/api/_nav/when.js."""

import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .time_of_day import parse_time_of_day

SG = ZoneInfo("Asia/Singapore")

# Public holidays run Sunday's buses. From MOM's lists; add each year's once it's out.
HOLIDAYS = {
    "2026-01-01", "2026-02-17", "2026-02-18", "2026-03-21", "2026-04-03", "2026-05-01",
    "2026-05-27", "2026-06-01", "2026-08-10", "2026-11-09", "2026-12-25",
    "2027-01-01", "2027-02-06", "2027-02-08", "2027-03-10", "2027-03-26", "2027-05-01",
    "2027-05-17", "2027-05-20", "2027-08-09", "2027-10-28", "2027-12-25",
}

# A first bus can be waited for: a stop reached a little before it still gets on it.
FIRST_BUS_GRACE_MIN = 10
# The average wait for a bus, half the gap between them: what a clock time adds per bus where
# there's no live timing to go on. The same as WAIT_MIN.B in main-site/api/_nav/router.js.
BUS_WAIT_MIN = 5
# Live timings reach about half an hour ahead, so they're only used for a journey setting off
# within this.
LIVE_WINDOW_MIN = 30
DAYS_AHEAD = 7
# A time a minute or two behind is one picked just before the clock ticked over.
BEHIND = timedelta(minutes=2)

_DAY_OFFSET = {"wd": 0, "sat": 8, "sun": 16}
_HHMM_RE = re.compile(r"^\d{4}$")
_AT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")


def now() -> datetime:
    return datetime.now(SG)


def first_last_string(row) -> str:
    """A stop's weekday, Saturday and Sunday first and last bus as one 24-character string,
    "----" for a day with none, as the web app's /api/bus-routes sends them."""
    parts = (row["wd_first"], row["wd_last"], row["sat_first"], row["sat_last"], row["sun_first"], row["sun_last"])
    return "".join(p if p and _HHMM_RE.match(p) else "----" for p in parts)


def _day_type(day: datetime) -> str:
    if day.weekday() == 6 or day.strftime("%Y-%m-%d") in HOLIDAYS:
        return "sun"
    return "sat" if day.weekday() == 5 else "wd"


def _hhmm(s: str) -> "int | None":
    return int(s[:2]) * 60 + int(s[2:]) if _HHMM_RE.match(s) else None


def _in_window(times: str, day_type: str, minute: int) -> bool:
    k = _DAY_OFFSET[day_type]
    first, last = _hhmm(times[k : k + 4]), _hhmm(times[k + 4 : k + 8])
    if first is None or last is None:
        return False
    # A last bus before the first runs past midnight.
    if last < first:
        last += 1440
    return first - FIRST_BUS_GRACE_MIN <= minute <= last


def bus_runs_at(times: "str | None", moment: datetime) -> bool:
    """Whether a bus is running at a stop at a moment: within that day's hours, or the night
    before's when they run past midnight. A stop with no times listed counts as running."""
    if not times or len(times) < 24:
        return True
    moment = moment.astimezone(SG)
    minute = moment.hour * 60 + moment.minute
    before = moment - timedelta(days=1)
    return _in_window(times, _day_type(moment), minute) or _in_window(times, _day_type(before), minute + 1440)


# ---------- reading a picked time ----------


def at_to_dt(at: str) -> "datetime | None":
    if not at or not _AT_RE.match(at):
        return None
    return datetime.strptime(at, "%Y-%m-%dT%H:%M").replace(tzinfo=SG)


def dt_to_at(moment: datetime) -> str:
    return moment.astimezone(SG).strftime("%Y-%m-%dT%H:%M")


def moment_of(when: "dict | None") -> datetime:
    return at_to_dt(when["at"]) if when else now()


def timing(when: "dict | None") -> dict:
    """The time to plan for, as journeys.py takes it: Leave now is leaving at this moment."""
    return {"mode": when["mode"] if when else "leave", "moment": moment_of(when)}


def problem(when: "dict | None") -> "str | None":
    """Why a picked time can't be planned for, or None when it can."""
    if not when:
        return None
    moment = at_to_dt(when.get("at"))
    if moment is None:
        return "Send a time like 8:30 or 8.30pm."
    if moment < now() - BEHIND:
        return "That time has already passed. Pick a later one, or Leave now."
    if moment > now() + timedelta(days=DAYS_AHEAD + 1):
        return "Pick a time within the next week."
    return None


def span(when: "dict | None", minutes: float) -> tuple:
    """(leave, arrive) for a journey taking `minutes`, as moments."""
    moment = moment_of(when)
    if when and when["mode"] == "arrive":
        return moment - timedelta(minutes=minutes), moment
    return moment, moment + timedelta(minutes=minutes)


def live_lead(leave: datetime) -> "float | None":
    """Minutes from now until setting off, when that's soon enough for live timings to say
    which bus you'd catch; None otherwise."""
    lead = (leave - now()).total_seconds() / 60
    return max(0.0, lead) if -1 <= lead <= LIVE_WINDOW_MIN else None


def clock(moment: datetime) -> str:
    return moment.astimezone(SG).strftime("%H:%M")


def day_label(moment: datetime) -> str:
    """"today", "tomorrow" or "Sat 10 Oct", by Singapore's calendar."""
    day = moment.astimezone(SG).date()
    today = now().date()
    if day == today:
        return "today"
    if day == today + timedelta(days=1):
        return "tomorrow"
    return f"{moment.astimezone(SG):%a} {day.day} {moment.astimezone(SG):%b}"


def clock_day(moment: datetime) -> str:
    """A clock time with its day, unless that's today: "08:30", "08:30 tomorrow"."""
    label = day_label(moment)
    return clock(moment) if label == "today" else f"{clock(moment)} {label}"


def describe(when: "dict | None") -> str:
    """"Leave at 08:30 tomorrow", "Arrive by 09:00", or "Leave now"."""
    if not when:
        return "Leave now"
    return f"{'Arrive by' if when['mode'] == 'arrive' else 'Leave at'} {clock_day(at_to_dt(when['at']))}"


# ---------- typed and quick times ----------

_DAY_WORDS = {
    "today": 0, "tdy": 0, "tonight": 0,
    "tomorrow": 1, "tmr": 1, "tmrw": 1, "tml": 1,
}
_WEEKDAYS = {name: i for i, names in enumerate(
    (("mon", "monday"), ("tue", "tues", "tuesday"), ("wed", "wednesday"), ("thu", "thur", "thurs", "thursday"),
     ("fri", "friday"), ("sat", "saturday"), ("sun", "sunday"))
) for name in names}


def parse_typed(text: str, mode: str) -> "dict | None":
    """A typed time as a picked one: "8:30", "8.30pm", "2030", "tmr 8am", "sat 9:15". With no
    day, today, or tomorrow once today's has passed; a weekday is its next one, today included.
    None when it can't be read."""
    words = text.strip().lower().replace(",", " ").split()
    day_shift, weekday, rest = None, None, []
    for word in words:
        if word in _DAY_WORDS and day_shift is None and weekday is None:
            day_shift = _DAY_WORDS[word]
        elif word in _WEEKDAYS and day_shift is None and weekday is None:
            weekday = _WEEKDAYS[word]
        else:
            rest.append(word)
    time_text = "".join(rest)
    # "8.30" as well as "8:30", where there's no am or pm to tell it from "8.30pm", and
    # "830am" as "8:30am".
    if re.fullmatch(r"\d{1,2}\.\d{2}", time_text):
        time_text = time_text.replace(".", ":")
    time_text = re.sub(r"^(\d{1,2})(\d{2})(am|pm)$", r"\1:\2\3", time_text)
    parsed = parse_time_of_day(time_text)
    if not parsed:
        return None
    hour, minute = parsed
    current = now()
    base = current.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if weekday is not None:
        moment = base + timedelta(days=(weekday - current.weekday()) % 7)
        if moment < current - BEHIND:
            moment += timedelta(days=7)
    else:
        moment = base + timedelta(days=day_shift or 0)
        if day_shift is None and moment < current - BEHIND:
            moment += timedelta(days=1)
    return {"mode": mode, "at": dt_to_at(moment)}


def quick(mode: str, minutes: int) -> dict:
    """A picked time this many minutes on, rounded up to the next five."""
    moment = now() + timedelta(minutes=minutes)
    moment = moment.replace(second=0, microsecond=0) + timedelta(minutes=(-moment.minute) % 5)
    return {"mode": mode, "at": dt_to_at(moment)}
