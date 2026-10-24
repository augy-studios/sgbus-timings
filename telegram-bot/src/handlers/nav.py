from telethon import events

from ..flows import Flow, end_flow, get_flow, register_flow, set_flow
from ..lta import fetch_arrivals
from ..nav_api import NavError, places, plan
from ..nav_view import NO_MATCH, build_mynavs_view, build_nav_option, build_nav_panel, nav_place_buttons, option_is_live
from ..navs import clear_nav_draft, draft_place, draft_when, get_favourite_nav, get_nav_draft, start_nav_draft
from ..reply import edit_rich_message, send_rich_message
from ..user_settings import get_has_bike
from ..when import parse_typed, problem
from ..when_view import TYPED_HINT, build_when_prompt

# No `finish`: a nav is only worth anything once both ends are set.
FLOW = register_flow(Flow(name="nav_wizard", description="planning a nav", cleanup=clear_nav_draft))

# Where the time picker goes back to: the panel as it was (handled in callbacks.py).
WHEN_BACK = ("nav_back", "🔙 Back to Navigate")


def _armed_draft(chat_id, fields=("from", "to")):
    """The nav the chat is planning, when it really is waiting for one of `fields` to be
    typed or pointed at; None otherwise, so other handlers keep the message."""
    if get_flow(chat_id) != FLOW:
        return None
    draft = get_nav_draft(chat_id)
    return draft if draft and draft["field"] in fields else None


async def _ways(start, end, when, chat_id=None) -> dict:
    """The ways between two ends at a time, as build_nav_panel takes them: {"result": ...}
    from the API, or {"error": ...} saying why there are none."""
    late = problem(when)
    if late:
        return {"error": late}
    try:
        return {"result": await plan(start, end, when, bike=bool(chat_id) and get_has_bike(chat_id))}
    except NavError as err:
        return {"error": str(err)}


async def send_nav_panel(client, chat_id, start, end, awaiting=None, when=None):
    """Posts the panel: with both ends set, the ways between them; otherwise a prompt for
    the end still missing, armed so the next message answers it."""
    if awaiting is None and not (start and end):
        awaiting = "from" if not start else "to"
    start_nav_draft(chat_id, awaiting, start, end, when)
    if awaiting:
        set_flow(chat_id, FLOW)
        rich, buttons = build_nav_panel(chat_id, start, end, awaiting=awaiting, when=when)
        await send_rich_message(client, chat_id, rich, buttons)
        return
    end_flow(chat_id)
    rich, buttons = build_nav_panel(chat_id, start, end, when=when, **await _ways(start, end, when, chat_id))
    await send_rich_message(client, chat_id, rich, buttons)


async def set_end(client, chat_id, field, place):
    """Puts a place into whichever end the draft is waiting for, then posts the next panel."""
    draft = get_nav_draft(chat_id)
    start = draft_place(draft, "from")
    end = draft_place(draft, "to")
    if field == "from":
        start = place
    else:
        end = place
    await send_nav_panel(client, chat_id, start, end, when=draft_when(draft))


async def show_nav(client, event, start, end, when=None):
    """Redraws a panel in place with the ways between two ends."""
    rich, buttons = build_nav_panel(event.chat_id, start, end, when=when, **await _ways(start, end, when, event.chat_id))
    await edit_rich_message(client, event, rich, buttons)


async def redraw_panel(client, event, chat_id, payload, when):
    """The panel a time was picked on, redrawn in place at that time: the ways, with both
    ends set, or else armed again for the end still missing."""
    start, end = payload.get("from"), payload.get("to")
    if start and end:
        end_flow(chat_id)
        await show_nav(client, event, start, end, when)
        return
    awaiting = "from" if not start else "to"
    start_nav_draft(chat_id, awaiting, start, end, when)
    set_flow(chat_id, FLOW)
    rich, buttons = build_nav_panel(chat_id, start, end, awaiting=awaiting, when=when)
    await edit_rich_message(client, event, rich, buttons)


async def arm_when(client, event, chat_id, payload):
    """Leave at or Arrive by tapped: waits for the time to be typed, keeping both ends."""
    mode = payload["mode"]
    start_nav_draft(chat_id, f"when:{mode}", payload.get("from"), payload.get("to"), payload.get("when"))
    set_flow(chat_id, FLOW)
    ends = {k: payload[k] for k in ("from", "to", "when") if k in payload}
    rich, buttons = build_when_prompt("nav", ends, mode, WHEN_BACK)
    await edit_rich_message(client, event, rich, buttons)


async def show_option(client, event, start, end, option, when=None):
    """One way, leg by leg, with the live timings of each bus at the stop it's boarded, when
    it sets off soon enough for those to matter."""
    timings = {}
    for k, leg in enumerate(option["legs"] if option_is_live(option, when) else ()):
        code = (leg.get("from") or {}).get("code")
        if leg["mode"] != "bus" or not code:
            continue
        try:
            arrivals = await fetch_arrivals(code, leg["route"])
            svc = next((s for s in arrivals["services"] if s["serviceNo"] == leg["route"]), None)
            etas = [n["etaMs"] for n in (svc["next"], svc["next2"], svc["next3"]) if n] if svc else []
            timings[k] = etas or None
        except Exception:
            timings[k] = None
    rich, buttons = build_nav_option(start, end, option, timings, when)
    await edit_rich_message(client, event, rich, buttons)


async def arm_nav_field(client, event, chat_id, payload):
    """A Set start / Set end tap: waits for that end, keeping the other and the time."""
    start, end, when = payload.get("from"), payload.get("to"), payload.get("when")
    start_nav_draft(chat_id, payload["field"], start, end, when)
    set_flow(chat_id, FLOW)
    rich, buttons = build_nav_panel(chat_id, start, end, awaiting=payload["field"], when=when)
    await send_rich_message(client, chat_id, rich, buttons)


async def open_favourite_nav(client, chat_id, nav_id):
    """A starred nav, at Leave now: a time picked before isn't kept."""
    row = get_favourite_nav(chat_id, nav_id)
    if not row:
        return False
    start = {"label": row["from_label"], "lat": row["from_lat"], "lng": row["from_lng"]}
    end = {"label": row["to_label"], "lat": row["to_lat"], "lng": row["to_lng"]}
    await send_nav_panel(client, chat_id, start, end)
    return True


def register_nav(client):
    @client.on(events.NewMessage(pattern=r"^/nav(@\w+)?(\s|$)"))
    async def start_nav(event):
        await send_nav_panel(client, event.chat_id, None, None, awaiting="from")

    @client.on(events.NewMessage(pattern=r"^/mynavs(@\w+)?(\s|$)"))
    async def my_navs(event):
        rich, buttons, navs = build_mynavs_view(event.chat_id, 0)
        if not navs:
            await event.respond("You have no favourite navs yet. Use /nav to plan one, then star it.")
            return
        await send_rich_message(client, event.chat_id, rich, buttons)

    @client.on(events.NewMessage(func=lambda e: e.message.geo is not None))
    async def collect_location(event):
        draft = _armed_draft(event.chat_id)
        if not draft:
            return
        geo = event.message.geo
        await set_end(client, event.chat_id, draft["field"], {"label": "Your location", "lat": geo.lat, "lng": geo.long})
        raise events.StopPropagation

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect_when(event):
        """A time typed after Leave at or Arrive by: the panel again, posted at that time."""
        draft = _armed_draft(event.chat_id, ("when:leave", "when:arrive"))
        if not draft:
            return
        when = parse_typed(event.message.text, draft["field"].split(":", 1)[1])
        late = problem(when) if when else None
        if not when or late:
            await event.respond(late or TYPED_HINT)
            raise events.StopPropagation
        await send_nav_panel(client, event.chat_id, draft_place(draft, "from"), draft_place(draft, "to"), when=when)
        raise events.StopPropagation

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        draft = _armed_draft(event.chat_id)
        if not draft:
            return
        text = event.message.text.strip()
        if len(text) < 2:
            await event.respond("Send at least two letters of a place, or share your location.")
            raise events.StopPropagation
        try:
            found = await places(text)
        except NavError as err:
            await event.respond(str(err))
            raise events.StopPropagation
        if not found:
            await event.respond(NO_MATCH)
            raise events.StopPropagation
        if len(found) == 1:
            p = found[0]
            await set_end(client, event.chat_id, draft["field"], {"label": p["label"], "lat": p["lat"], "lng": p["lng"]})
            raise events.StopPropagation
        await event.respond("Did you mean:", buttons=nav_place_buttons(found, draft["field"]))
        raise events.StopPropagation
