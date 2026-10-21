import asyncio
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from telethon import Button

from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .format import _format_eta, escape_md
from .journeys import journey_clock, journey_minutes, leg_crossings, leg_details, set_customs, stops_to, walk_details
from .lta import fetch_arrivals
from .when import at_to_dt, clock, clock_day, customs_for, live_lead, now, span

ESTIMATE_NOTE = "Times are rough estimates for riding and walking, not counting the wait for a bus."
CLOCK_NOTE = "Times are rough estimates from distance. Clock times count an average wait for each bus."

BUTTON_LABEL_LIMIT = 64


def _name(code) -> str:
    stop = get_bus_stop_by_code(code)
    return stop["name"] if stop else code


def _stop_text(code) -> str:
    stop = get_bus_stop_by_code(code)
    return f"{stop['name']} ({code})" if stop else code


def _truncate(label: str) -> str:
    return label if len(label) <= BUTTON_LABEL_LIMIT else f"{label[: BUTTON_LABEL_LIMIT - 3]}..."


def _plural(count: int, word: str) -> str:
    return f"{count} {word}{'' if count == 1 else 's'}"


def _minutes_text(journey_min) -> str:
    return f"~{round(journey_min)} min" if journey_min is not None else "time unknown"


def _time_text(legs: list, start_code: str, end_code: str, when) -> str:
    """"~25 min" on the move for Leave now, or "08:12 → 08:50" for a picked time, with "too
    late" on an Arrive by you'd have had to set off for already."""
    if not when:
        return _minutes_text(journey_minutes(legs, start_code, end_code))
    timed = journey_clock(legs, start_code, end_code)
    if not timed:
        return "time unknown"
    leave, arrive = span(when, timed["total"])
    late = " (too late)" if when["mode"] == "arrive" and leave < now() else ""
    return f"{clock(leave)} → {clock(arrive)}{late}"


def journey_summary(legs: list, start_code: str, end_code: str, when=None) -> str:
    """One line for a journey in the route panel's list: its buses, where they're boarded
    and left when that isn't the route's own ends, and where the changes are."""
    parts = [" → ".join(leg["bus"] for leg in legs)]
    if legs[0]["from"] != start_code:
        parts.append(f"from {_name(legs[0]['from'])}")
    changes = [_name(leg["to"]) for leg in legs[:-1]]
    if changes:
        places = f"{', '.join(changes[:-1])} and {changes[-1]}" if len(changes) > 1 else changes[0]
        parts.append(f"change{'s' if len(changes) > 1 else ''} at {places}")
    if legs[-1]["to"] != end_code:
        parts.append(f"off at {_name(legs[-1]['to'])}")
    return f"{', '.join(parts)} · {_time_text(legs, start_code, end_code, when)}"


def journey_button_label(number: int, legs: list, start_code: str, end_code: str, when=None) -> str:
    buses = " → ".join(leg["bus"] for leg in legs)
    return _truncate(f"🧭 {number}. {buses} · {_time_text(legs, start_code, end_code, when)} · {_plural(len(legs) - 1, 'change')}")


def _etas_min(arrivals, service_no) -> list:
    """Minutes until each of a service's next buses, soonest first, from a stop's live
    arrivals. Empty when LTA had nothing for it, or the request failed."""
    if isinstance(arrivals, BaseException):
        return []
    for svc in arrivals["services"]:
        if svc["serviceNo"] == service_no:
            nexts = (svc.get("next"), svc.get("next2"), svc.get("next3"))
            return [n["etaMs"] / 60000 for n in nexts if n]
    return []


def _clock(minutes_from_now) -> str:
    return (datetime.now(ZoneInfo("Asia/Singapore")) + timedelta(minutes=minutes_from_now)).strftime("%H:%M")


def crossing_lines(leg: dict) -> list:
    """A leg's crossings of the Causeway: get off, through both checkpoints, on again, with
    the minutes counted for it. The same as crossingSteps in main-site/js/planner.js."""
    out = []
    for c in leg_crossings(leg):
        first, second = ("Singapore's", "Malaysia's") if c["way"] == "out" else ("Malaysia's", "Singapore's")
        out.append(
            f"🛂 Get off at {_stop_text(c['from'])} and clear {first} immigration, ride any bus across to "
            f"{_stop_text(c['to'])} and clear {second}, then get on again: ~{c['minutes']} min for both, by the time of day."
        )
    return out


async def build_journey_view(start_code: str, end_code: str, legs: list, route: dict):
    """One journey from the route panel, leg by leg, with the live timings of each bus at
    the stop it's boarded at. Past the first bus, each leg says roughly when you'd reach
    its stop, and the buses due before then are struck through: they'll have gone.

    `route` is the route panel this was opened from, minus the journey, which is where the
    back button goes. Returns (rich, buttons)."""
    here = {**route, "journey": legs}
    back_row = [Button.inline("🔙 Back to route", make_button("route_view", route))]
    # Immigration across the Causeway, for the time planned for, as the route was planned.
    set_customs(customs_for(route.get("when")))

    details = [leg_details(leg) for leg in legs]
    if not all(details):
        text = "This journey no longer runs the way it did. Go back to the route for today's options."
        return {"markdown": escape_md(text), "fallback": text}, [back_row]

    # For a picked time: when you'd set off, and whether that's soon enough for live timings
    # to say which bus you'd catch. Past that, each bus is timed by the clock, with an
    # average wait, rather than by the buses due now.
    when = route.get("when")
    timed = journey_clock(legs, start_code, end_code)
    leave = span(when, timed["total"])[0] if when else now()
    lead = live_lead(leave) if when else 0.0
    live = lead is not None

    if live:
        results = await asyncio.gather(
            *(fetch_arrivals(leg["from"], leg["bus"]) for leg in legs), return_exceptions=True
        )
    else:
        results = [None] * len(legs)

    total_stops = sum(d["stops"] for d in details)
    changes = len(legs) - 1
    lines = [
        "# Journey",
        f"- **Start**: {escape_md(_stop_text(start_code))}",
        f"- **End**: {escape_md(_stop_text(end_code))}",
        "",
        escape_md(
            f"{_minutes_text(journey_minutes(legs, start_code, end_code))} on the move · "
            f"{_plural(changes, 'change')} · {_plural(total_stops, 'stop')}"
        ),
    ]
    fallback = ["Journey", f"Start: {_stop_text(start_code)}", f"End: {_stop_text(end_code)}"]
    if when:
        by = clock(at_to_dt(when["at"]))
        if leave < now() - timedelta(minutes=1):
            set_off = f"⚠️ To arrive by {by} you'd have had to leave by {clock(leave)}."
        else:
            set_off = f"🕒 Set off around {clock_day(leave)}{f' to arrive by {by}' if when['mode'] == 'arrive' else ''}."
        lines += ["", escape_md(set_off)]
        fallback.append(set_off)

    # Minutes from now, walked forward leg by leg: when you'd reach each stop, and when the
    # bus you'd catch there leaves. None once a leg has no live timing left to go on.
    t = lead
    here_code = start_code
    for number, (leg, detail, arrivals) in enumerate(zip(legs, details, results), 1):
        walk = walk_details(here_code, leg["from"])
        if walk:
            text = f"🚶 Walk ~{round(walk['metres'])} m to {_stop_text(leg['from'])}, ~{round(walk['minutes'])} min"
            lines += ["", escape_md(text)]
            fallback.append(text)
            if t is not None:
                t += walk["minutes"]

        heading = f"🚌 {number}. Bus {leg['bus']} · {_plural(detail['stops'], 'stop')} · ~{round(detail['minutes'])} min"
        ride = f"From {_stop_text(leg['from'])} to {_stop_text(leg['to'])}"
        lines += ["", f"## {escape_md(heading)}", escape_md(ride)]
        fallback += ["", heading, ride]

        crossing = crossing_lines(leg)
        if not live:
            board = f"Board around {clock(leave + timedelta(minutes=timed['boards'][number - 1]))}, after an average wait."
            lines += ["", escape_md(board), *(escape_md(c) for c in crossing)]
            fallback += [board, *crossing]
            here_code = leg["to"]
            continue

        if t is not None and t >= 1:
            reach = f"You'd get to this stop in ~{round(t)} min, around {_clock(t)}."
            lines += ["", escape_md(reach)]
            fallback.append(reach)

        etas = _etas_min(arrivals, leg["bus"])
        # The bus you'd catch: the first one due once you're at the stop. Unknown when an
        # earlier leg couldn't be timed, so nothing is struck through or picked out then.
        catch = next((eta for eta in etas if eta >= t), None) if t is not None else None
        if etas:
            cells, plain = [], []
            for eta in etas:
                shown = _format_eta(eta * 60000)
                if t is not None and eta < t:
                    cells.append(f"~~{escape_md(shown)}~~")
                    plain.append(f"{shown} (gone by then)")
                elif eta == catch:
                    cells.append(f"**{escape_md(shown)}**")
                    plain.append(f"{shown} (yours)")
                else:
                    cells.append(escape_md(shown))
                    plain.append(shown)
            label = f"Next {leg['bus']}:"
            lines += ["", f"{escape_md(label)} {' · '.join(cells)}"]
            fallback.append(f"{label} {', '.join(plain)}")
            if t is not None and catch is None:
                note = "Every bus listed comes before you'd get here - yours is a later one."
                lines += ["", escape_md(note)]
                fallback.append(note)
        else:
            note = "No live timings for this bus right now."
            lines += ["", escape_md(note)]
            fallback.append(note)
        for c in crossing:
            lines += ["", escape_md(c)]
            fallback.append(c)

        # With no bus to go on, the rest of the journey can't be timed from here.
        t = catch + detail["minutes"] if catch is not None else None
        here_code = leg["to"]

    walk = walk_details(here_code, end_code)
    if walk:
        text = f"🚶 Walk ~{round(walk['metres'])} m to {_stop_text(end_code)}, ~{round(walk['minutes'])} min"
        lines += ["", escape_md(text)]
        fallback.append(text)
        if t is not None:
            t += walk["minutes"]
    if t is not None:
        arrive = f"🏁 Arrive around {_clock(t)}, in ~{round(t)} min, catching the first bus you can."
        lines += ["", f"## {escape_md(arrive)}"]
        fallback += ["", arrive]
    elif not live:
        arrive = f"🏁 Arrive around {clock_day(leave + timedelta(minutes=timed['total']))}, counting an average wait for each bus."
        lines += ["", f"## {escape_md(arrive)}"]
        fallback += ["", arrive]

    updated = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%H:%M:%S")
    note = ESTIMATE_NOTE if live else f"{CLOCK_NOTE} Live timings show here from half an hour before you set off."
    lines += ["", f"_{escape_md(note)}_", "", f"_Updated {updated}_"]
    fallback += [note, f"Updated {updated}"]

    # Each leg opens its boarding stop's timings narrowed to that bus - the ordinary stop
    # view, which says how many stops are left, with this journey as its way back.
    buttons = [
        [
            Button.inline(
                _truncate(f"🚏 {leg['bus']} at {_name(leg['from'])}"),
                make_button("stop", {"code": leg["from"], "bus_no": leg["bus"], "route": here}),
            )
        ]
        for leg in legs
    ]
    buttons.append([Button.inline("🔄 Refresh", make_button("route_view", here))])
    buttons.append(back_row)
    return {"markdown": "\n".join(lines), "fallback": "\n".join(fallback)}, buttons


def stops_left_note(route: dict, code: str, bus_no: str) -> "str | None":
    """How far the bus picked off a route or a journey still has to go: the stops to where
    you get off, and for a journey, what comes after that. None when the stop view wasn't
    opened for a bus on a route, or the route list no longer has that bus going there."""
    journey = route.get("journey")
    if journey:
        index = next(
            (k for k, leg in enumerate(journey) if leg["from"] == code and leg["bus"] == bus_no), None
        )
        if index is None:
            return None
        details = [leg_details(leg) for leg in journey[index:]]
        if not all(details):
            return None
        leg = journey[index]
        first = f"🚏 {bus_no}: {_plural(details[0]['stops'], 'stop')} to {_stop_text(leg['to'])}"
        if index + 1 < len(journey):
            left = sum(d["stops"] for d in details)
            return f"{first}, then change to {journey[index + 1]['bus']} · {_plural(left, 'stop')} left in the journey"
        end_code = route.get("end")
        if end_code and leg["to"] != end_code:
            return f"{first}, then a short walk to {_stop_text(end_code)}"
        return f"{first}, the end of your journey"

    start_code, end_code = route.get("start"), route.get("end")
    if code != start_code or not end_code:
        return None
    count = stops_to(bus_no, start_code, end_code)
    if not count:
        return None
    text = f"🚏 {bus_no}: {_plural(count['stops'], 'stop')} to {_stop_text(end_code)}"
    if count["via"]:
        text += f", going round via its terminus at {_name(count['via'])}"
    return text
