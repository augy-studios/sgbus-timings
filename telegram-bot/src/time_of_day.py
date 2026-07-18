import re

_AMPM_RE = re.compile(r"^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)$")
_COLON_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
_BARE_RE = re.compile(r"^(\d{3,4})$")


def parse_time_of_day(text: str) -> "tuple[int, int] | None":
    """Parses a time-of-day string into (hour, minute), 24-hour clock.
    Accepts "9 AM", "10 PM", "8:30am", "20:00", "0830" (24-hour HHMM/HMM)."""
    normalized = text.strip().lower()
    if not normalized:
        return None

    match = _AMPM_RE.match(normalized)
    if match:
        hour, minute, period = match.groups()
        hour = int(hour)
        minute = int(minute) if minute else 0
        if not (1 <= hour <= 12) or not (0 <= minute <= 59):
            return None
        if period == "am":
            hour = 0 if hour == 12 else hour
        else:
            hour = 12 if hour == 12 else hour + 12
        return hour, minute

    match = _COLON_RE.match(normalized)
    if match:
        hour, minute = int(match.group(1)), int(match.group(2))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
        return None

    match = _BARE_RE.match(normalized)
    if match:
        digits = match.group(1)
        if len(digits) == 3:
            hour, minute = int(digits[0]), int(digits[1:])
        else:
            hour, minute = int(digits[:2]), int(digits[2:])
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
        return None

    return None


def greeting_for_hour(hour: int) -> str:
    if hour < 12:
        return "Good morning"
    if hour < 18:
        return "Good afternoon"
    return "Good evening"
