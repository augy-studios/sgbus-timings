import re

from telethon import Button, events

from ..bus_stops import get_bus_stop_by_code, nearest_bus_stops, search_bus_stops
from ..buttons import make_button
from ..favourites import list_favourites
from ..flows import Flow, end_flow, get_flow, register_flow, set_flow
from ..format import stop_button_label, stop_label
from ..journeys import direct_services
from ..planning_areas import tell_apart
from ..postal import POSTAL_CODE_RE
from ..reply import edit_rich_message, edit_rich_message_at, send_rich_message, sent_message_id
from ..route_drafts import clear_route_draft, get_route_draft, start_route_draft
from ..route_view import build_route_view_async
from .search import find_postal_stops

# No `finish`: a route is only worth anything once both ends are set, and it's the panel's
# own star button that saves it, so there's nothing for /done to wrap up early.
FLOW = register_flow(Flow(name="route_wizard", description="building a route", cleanup=clear_route_draft))

_CODE_RE = re.compile(r"^\d{3,5}$")

# As many stops as /nearme lists, so a location means the same thing wherever it's sent.
NEARBY_LIMIT = 8

# A typed name lists this many stops to pick from, out of this many checked for a direct
# bus to the other end, so a direct one further down the matches still makes the list.
_MATCHES_SHOWN = 10
_MATCHES_CHECKED = 100

EXPIRED = "That route has expired. Use /route to start another."


def _pick_row(label: str, code: str) -> list:
    """One stop, as a button that drops it into whichever end the panel is waiting for."""
    return [Button.inline(label[:64], make_button("route_stop_pick", {"code": code}))]


def _other_end(draft) -> "str | None":
    """The end of the route that's already set, opposite the one being filled in."""
    return draft["end_code"] if draft["field"] == "start" else draft["start_code"]


def _direct_buses(stops, field, other) -> dict:
    """For each stop, the buses that run straight between it and the route's other end,
    heading the right way: from the stop to the end when picking the start, from the start
    to the stop when picking the end. Stops with none are left out."""
    direct = {}
    for stop in stops:
        if stop["code"] == other:
            continue
        buses = direct_services(stop["code"], other) if field == "start" else direct_services(other, stop["code"])
        if buses:
            direct[stop["code"]] = buses
    return direct


def _direct_label(stop, buses, is_favourite, place=None) -> str:
    """A stop with a bus straight to the other end: ticked, and naming the buses, kept
    under 64 characters like every other stop button by shortening the name. With its
    distance when it has one, as a stop near a place does, and where it is when another
    in the list shares its name."""
    shown = ", ".join(buses[:3]) + (f" +{len(buses) - 3}" if len(buses) > 3 else "")
    metres = stop.get("distance")
    dist = "" if metres is None else (f" ~{metres / 1000:.1f}km" if metres >= 1000 else f" ~{metres}m")
    head = "✅⭐ " if is_favourite else "✅ "
    tail = f" ({stop['code']}){f' · {place}' if place else ''}{dist} · {shown}"
    name = stop["name"]
    room = 64 - len(head) - len(tail)
    if len(name) > room:
        name = f"{name[: max(room - 3, 8)].rstrip()}..."
    return f"{head}{name}{tail}"


def _direct_note(field, other, direct) -> str:
    """What the ticks in a list mean, as a sentence to follow the list's own prompt: how
    many stops have a bus straight to the other end, or that none does. Empty with no
    other end set."""
    if not other:
        return ""
    other_stop = get_bus_stop_by_code(other)
    other_name = f"{other_stop['name']} ({other})" if other_stop else other
    way = f"straight {'to' if field == 'start' else 'from'} {other_name}"
    if direct:
        count = "the one" if len(direct) == 1 else f"the {len(direct)}"
        return f"✅ marks {count} with a bus {way}, listed first"
    return f"None of them has a bus {way}, so the route will offer journeys with a change"


async def _offer_nearby(event, chat_id, nearby, near, draft):
    """The stops near a place, a button each, to fill in the end of the route the draft is
    waiting for. Starred like every other stop list, but in distance order rather than
    pinned per /favouritepref: nearest-first is the whole point of answering with a place.

    With the other end already set, the stops a bus runs straight to it from (or from it
    to) are ticked, name those buses, and go first, still nearest-first among themselves."""
    field, other = draft["field"], _other_end(draft)
    direct = _direct_buses(nearby, field, other) if other else {}
    favourite_codes = {f["code"] for f in list_favourites(chat_id)}

    ordered = sorted(nearby, key=lambda s: (s["code"] not in direct, s["distance"]))
    places = tell_apart(ordered)
    buttons = [
        _pick_row(
            _direct_label(stop, direct[stop["code"]], stop["code"] in favourite_codes, places.get(stop["code"]))
            if stop["code"] in direct
            else stop_button_label(
                stop, stop["distance"], is_favourite=stop["code"] in favourite_codes, place=places.get(stop["code"])
            ),
            stop["code"],
        )
        for stop in ordered
    ]
    note = _direct_note(field, other, direct)
    prompt = f"Bus stops near {near} - pick the {field}"
    await event.respond(f"{prompt}. {note}:" if note else f"{prompt}:", buttons=buttons)


async def _offer_matches(event, chat_id, matches, draft):
    """Stops matching a typed name, to pick the one meant. With the other end set, those
    with a bus straight to it (or from it) are ticked and go first, as near a place.

    Every match is checked, not just the first page of them: a stop with a direct bus is
    the likeliest one meant, and it shouldn't be lost below the cut."""
    matches = [dict(m) for m in matches]
    field, other = draft["field"], _other_end(draft)
    direct = _direct_buses(matches, field, other) if other else {}
    favourite_codes = {f["code"] for f in list_favourites(chat_id)} if direct else set()

    ordered = [s for s in matches if s["code"] in direct] + [s for s in matches if s["code"] not in direct]
    shown = ordered[:_MATCHES_SHOWN]
    places = tell_apart(shown)
    buttons = [
        _pick_row(
            _direct_label(stop, direct[stop["code"]], stop["code"] in favourite_codes, places.get(stop["code"]))
            if stop["code"] in direct
            else stop_label(stop, places.get(stop["code"])),
            stop["code"],
        )
        for stop in shown
    ]
    note = _direct_note(field, other, direct)
    await event.respond(f"Did you mean one of these? {note}:" if note else "Did you mean:", buttons=buttons)


def _armed_draft(chat_id):
    """The route the chat is filling in, when it really is waiting for a stop to be typed
    or pointed at. None otherwise, which is how the handlers below know to keep out of the
    way of whatever else the message might mean."""
    if get_flow(chat_id) != FLOW:
        return None
    draft = get_route_draft(chat_id)
    return draft if draft and draft["field"] in ("start", "end") else None


async def send_route_panel(client, chat_id, start_code, end_code, awaiting=None, replacing=None):
    """Posts the route panel as a new message and takes the buttons off the panel it
    supersedes, so only the newest one is ever live. `replacing` is the
    (message id, start, end) of that older panel.

    Arms the flow for `awaiting`, so the next thing typed fills that end in - or ends the
    flow when the route is complete and there's nothing left to answer."""
    rich, buttons = await build_route_view_async(chat_id, start_code, end_code, awaiting=awaiting)
    result = await send_rich_message(client, chat_id, rich, buttons)

    if replacing:
        old_id, old_start, old_end = replacing
        stale_rich, _ = await build_route_view_async(chat_id, old_start, old_end)
        await edit_rich_message_at(client, chat_id, old_id, stale_rich)

    if awaiting:
        start_route_draft(
            chat_id,
            awaiting,
            start_code=start_code,
            end_code=end_code,
            panel_msg_id=sent_message_id(result),
        )
        set_flow(chat_id, FLOW)
    else:
        end_flow(chat_id)


async def arm_route_field(client, event, chat_id, payload):
    """Points the chat at one end of the route panel just tapped, so the next thing typed
    fills that end in, and redraws the panel with the prompt on it. Any panel still holding
    its buttons can be edited this way, including one opened from /myroutes."""
    field = payload["field"]
    start_code, end_code = payload.get("start"), payload.get("end")
    start_route_draft(
        chat_id, field, start_code=start_code, end_code=end_code, panel_msg_id=event.query.msg_id
    )
    set_flow(chat_id, FLOW)
    rich, buttons = await build_route_view_async(
        chat_id, start_code, end_code, payload.get("page", 0), awaiting=field, from_fav=payload.get("from_fav")
    )
    await edit_rich_message(client, event, rich, buttons)


async def apply_stop(client, chat_id, code):
    """Puts a chosen stop into whichever end of the route the chat is filling in, and posts
    the panel that results. The other end is armed next while it's still empty, so
    /route is two answers and done."""
    draft = get_route_draft(chat_id)
    if not draft or draft["field"] not in ("start", "end"):
        await client.send_message(chat_id, EXPIRED)
        return

    start_code = code if draft["field"] == "start" else draft["start_code"]
    end_code = code if draft["field"] == "end" else draft["end_code"]
    if start_code == end_code:
        await client.send_message(chat_id, "A route needs two different bus stops. Send another one.")
        return

    awaiting = "end" if not end_code else ("start" if not start_code else None)
    await send_route_panel(
        client,
        chat_id,
        start_code,
        end_code,
        awaiting,
        replacing=(draft["panel_msg_id"], draft["start_code"], draft["end_code"])
        if draft["panel_msg_id"]
        else None,
    )


def register_newroute(client):
    @client.on(events.NewMessage(pattern=r"^/route(@\w+)?(\s|$)"))
    async def start(event):
        # Starts armed for the start stop, so the panel can be answered straight away; the
        # two setter buttons switch which end an answer lands in.
        await send_route_panel(client, event.chat_id, None, None, awaiting="start")

    @client.on(events.NewMessage(func=lambda e: e.message.geo is not None))
    async def collect_location(event):
        """A location sent while the panel is waiting for a stop searches for the stops
        around it, rather than falling through to /nearme's plain list - the buttons here
        fill the route in instead of opening arrivals. Any other time, /nearme still has it."""
        chat_id = event.chat_id
        draft = _armed_draft(chat_id)
        if not draft:
            return

        geo = event.message.geo
        nearby = nearest_bus_stops(geo.lat, geo.long, NEARBY_LIMIT)
        if not nearby:
            await event.respond(
                "No bus stops found nearby. The bus stop cache may still be loading, please try again shortly."
            )
            raise events.StopPropagation

        await _offer_nearby(event, chat_id, nearby, "you", draft)
        raise events.StopPropagation

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        chat_id = event.chat_id
        draft = _armed_draft(chat_id)
        if not draft:
            return

        text = event.message.text.strip()
        if POSTAL_CODE_RE.match(text):
            found = await find_postal_stops(event, text)
            if found:
                nearby, address = found
                await _offer_nearby(event, chat_id, nearby, address, draft)
            raise events.StopPropagation

        exact = get_bus_stop_by_code(text) if _CODE_RE.match(text) else None
        if exact:
            await apply_stop(client, chat_id, exact["code"])
            raise events.StopPropagation

        matches = search_bus_stops(text, _MATCHES_CHECKED)
        if not matches:
            await event.respond("No bus stops matched that. Try a bus stop number, part of its name, or a postal code.")
            raise events.StopPropagation
        if len(matches) == 1:
            await apply_stop(client, chat_id, matches[0]["code"])
            raise events.StopPropagation

        await _offer_matches(event, chat_id, matches, draft)
        raise events.StopPropagation
