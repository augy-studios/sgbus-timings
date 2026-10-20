"""Bus stops behind a checkpoint, for authorised people only. No journey gets on or off at
these, and where `through` is false none rides through them either (journeys.py); a stop's
timings say so (format.py). The same as RESTRICTED in main-site/js/network.js and
main-site/api/_nav/network.js. And the stops across the border, which anyone with a
passport can use."""

_CARGO_AREA = {"place": "Changi Airport's cargo area", "through": False}
_MINDEF = {"place": "MINDEF", "through": True}

RESTRICTED = {
    **{code: _CARGO_AREA for code in ("95141", "95061", "95051", "95041", "95039", "95049", "95069", "95149")},
    **{code: _MINDEF for code in ("43721", "43719")},
}


def restriction(code: str) -> "dict | None":
    """{place, through} for a stop the public can't use, or None."""
    return RESTRICTED.get(code)


def public_parts(stops: list) -> list:
    """The parts of a run a journey can ride, as lists of indexes into it: the restricted
    stops left out, and the run cut in two where nobody may ride through."""
    parts = [[]]
    for index, code in enumerate(stops):
        r = RESTRICTED.get(code)
        if not r:
            parts[-1].append(index)
        elif not r["through"] and parts[-1]:
            parts.append([])
    return [p for p in parts if len(p) >= 2]


def restricted_note(code: str) -> "str | None":
    """The line a restricted stop's timings carry."""
    r = RESTRICTED.get(code)
    if not r:
        return None
    if r["through"]:
        return f"🔒 Authorised personnel only ({r['place']}): the public can't get on or off here, but can ride past."
    return f"🔒 Authorised personnel only, inside {r['place']}: the public can't get on or off here, or ride through."


# Across the Causeway: Woodlands Checkpoint, the last stop before Malaysia, and the stops in
# Johor Bahru. Anyone can ride to them with a passport, so unlike the restricted stops above
# journeys use them as usual, but their timings say so (format.py). The same as CROSS_BORDER
# in main-site/js/network.js.
_CHECKPOINT = "🛂 Immigration checkpoint: passport needed to go on."
_MALAYSIA = "🛂 In Malaysia: passport needed."

CROSS_BORDER = {
    **{code: _CHECKPOINT for code in ("46101", "46109")},
    **{code: _MALAYSIA for code in ("46211", "46219", "46239", "47711")},
}


def cross_border_note(code: str) -> "str | None":
    """The line a stop across the border, or at its checkpoint, carries."""
    return CROSS_BORDER.get(code)
