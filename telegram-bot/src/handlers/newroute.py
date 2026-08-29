import re

from telethon import Button, events

from ..bus_stops import get_bus_stop_by_code, search_bus_stops
from ..buttons import make_button
from ..flows import Flow, end_flow, get_flow, register_flow, set_flow
from ..reply import edit_rich_message, edit_rich_message_at, send_rich_message, sent_message_id
from ..route_drafts import clear_route_draft, get_route_draft, start_route_draft
from ..route_view import build_route_view

# No `finish`: a route is only worth anything once both ends are set, and it's the panel's
# own star button that saves it, so there's nothing for /done to wrap up early.
FLOW = register_flow(Flow(name="route_wizard", description="building a route", cleanup=clear_route_draft))

_CODE_RE = re.compile(r"^\d{3,5}$")

EXPIRED = "That route has expired. Use /newroute to start another."


async def send_route_panel(client, chat_id, start_code, end_code, awaiting=None, replacing=None):
    """Posts the route panel as a new message and takes the buttons off the panel it
    supersedes, so only the newest one is ever live. `replacing` is the
    (message id, start, end) of that older panel.

    Arms the flow for `awaiting`, so the next thing typed fills that end in - or ends the
    flow when the route is complete and there's nothing left to answer."""
    rich, buttons = build_route_view(chat_id, start_code, end_code, awaiting=awaiting)
    result = await send_rich_message(client, chat_id, rich, buttons)

    if replacing:
        old_id, old_start, old_end = replacing
        stale_rich, _ = build_route_view(chat_id, old_start, old_end)
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
    its buttons can be edited this way, including one opened from /favroutes."""
    field = payload["field"]
    start_code, end_code = payload.get("start"), payload.get("end")
    start_route_draft(
        chat_id, field, start_code=start_code, end_code=end_code, panel_msg_id=event.query.msg_id
    )
    set_flow(chat_id, FLOW)
    rich, buttons = build_route_view(
        chat_id, start_code, end_code, payload.get("page", 0), awaiting=field, from_fav=payload.get("from_fav")
    )
    await edit_rich_message(client, event, rich, buttons)


async def apply_stop(client, chat_id, code):
    """Puts a chosen stop into whichever end of the route the chat is filling in, and posts
    the panel that results. The other end is armed next while it's still empty, so
    /newroute is two answers and done."""
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
    @client.on(events.NewMessage(pattern="/newroute"))
    async def start(event):
        # Starts armed for the start stop, so the panel can be answered straight away; the
        # two setter buttons switch which end an answer lands in.
        await send_route_panel(client, event.chat_id, None, None, awaiting="start")

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        if get_flow(event.chat_id) != FLOW:
            return
        chat_id = event.chat_id
        if not get_route_draft(chat_id):
            return

        text = event.message.text.strip()
        exact = get_bus_stop_by_code(text) if _CODE_RE.match(text) else None
        if exact:
            await apply_stop(client, chat_id, exact["code"])
            raise events.StopPropagation

        matches = search_bus_stops(text, 10)
        if not matches:
            await event.respond("No bus stops matched that. Try a bus stop number or part of its name.")
            raise events.StopPropagation
        if len(matches) == 1:
            await apply_stop(client, chat_id, matches[0]["code"])
            raise events.StopPropagation

        buttons = [
            [
                Button.inline(
                    f"{stop['name']} ({stop['code']})"[:64],
                    make_button("route_stop_pick", {"code": stop["code"]}),
                )
            ]
            for stop in matches
        ]
        await event.respond("Did you mean:", buttons=buttons)
        raise events.StopPropagation
