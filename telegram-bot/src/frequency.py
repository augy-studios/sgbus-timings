import re

_DAY_NAMES = {
    "mon": 1, "monday": 1,
    "tue": 2, "tues": 2, "tuesday": 2,
    "wed": 3, "weds": 3, "wednesday": 3,
    "thu": 4, "thur": 4, "thurs": 4, "thursday": 4,
    "fri": 5, "friday": 5,
    "sat": 6, "saturday": 6,
    "sun": 7, "sunday": 7,
}

WEEKDAYS = "1,2,3,4,5"
WEEKENDS = "6,7"
DAILY = "1,2,3,4,5,6,7"

_SHORT_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}

_SPLIT_RE = re.compile(r"[,/]+")


def parse_frequency(text: str) -> "str | None":
    """Normalizes free-text frequency input into a canonical comma-separated
    set of ISO weekday numbers (Mon=1..Sun=7), e.g. "1,3,5". Accepts
    "daily"/"weekdays"/"weekends" or a list of day names/abbreviations."""
    normalized = text.strip().lower()
    if not normalized:
        return None

    if normalized == "daily":
        return DAILY
    if normalized == "weekdays":
        return WEEKDAYS
    if normalized == "weekends":
        return WEEKENDS

    tokens = [t.strip() for t in _SPLIT_RE.split(normalized) if t.strip()]
    if not tokens:
        return None

    days = set()
    for token in tokens:
        if token not in _DAY_NAMES:
            return None
        days.add(_DAY_NAMES[token])

    return ",".join(str(d) for d in sorted(days))


def format_frequency(days_str: str) -> str:
    """Renders a canonical days string back into a human-readable label."""
    days = frozenset(int(d) for d in days_str.split(","))
    if days == frozenset(int(d) for d in DAILY.split(",")):
        return "Daily"
    if days == frozenset(int(d) for d in WEEKDAYS.split(",")):
        return "Weekdays"
    if days == frozenset(int(d) for d in WEEKENDS.split(",")):
        return "Weekends"
    return ", ".join(_SHORT_NAMES[d] for d in sorted(days))
