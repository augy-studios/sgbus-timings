"""/places: Home, Work and the chat's own places, as the web app's Places has them. Each one
plans the way there (/nav, from wherever you send), shares it as a "How to get to" link,
or is renamed, moved or deleted; /addplace (or the button) saves a new one, with a name of
your own if you like. Every place is also a button on the /nav and /route panels."""

from urllib.parse import quote

from telethon import Button, events

from ..buttons import make_button
from ..flows import Flow, clear_flow, get_flow, register_flow, set_flow
from ..format import escape_md
from ..nav_api import NavError, places, share_place
from ..nav_view import NO_MATCH, place_button_text
from ..reply import edit_rich_message, send_rich_message
from ..saved_places import (
    KINDS,
    MAX_CUSTOM,
    add_place,
    clear_place,
    get_place,
    is_kind,
    list_places,
    nav_end,
    rename_place,
    set_place,
)
from .nav import send_nav_panel
from .settings import start_edit_place

SHARE_NOTE = "Anyone with this link can see where this place is. Place links don't expire."
WHERE_PROMPT = (
    "Send the place: an address, a building, a postal code, an MRT station, a bus stop, a Google Maps "
    "link, GPS coordinates, a plus code, or your location. Or /cancel to stop."
)


def _finish(chat_id: int) -> str:
    """/done while being asked for a name keeps the place as it's called; before that,
    nothing has been saved."""
    step = (get_flow(chat_id) or "").split(":")[1:2]
    return "Saved." if step == ["name"] else "Nothing was saved."


# The step and the place's kind ride along after the name: "places_edit:where:p:3",
# "places_edit:where:new", "places_edit:name:p:3".
FLOW = register_flow(Flow(name="places_edit", description="saving a place", finish=_finish))


def _step(chat_id: int):
    """(step, kind) while the chat is being asked something for a place; (None, None) otherwise."""
    flow = get_flow(chat_id) or ""
    if not flow.startswith(FLOW + ":"):
        return None, None
    step, _, kind = flow[len(FLOW) + 1 :].partition(":")
    return step, kind


# ---------- views ----------


def build_places_view(chat_id: int):
    saved = {p["kind"]: p for p in list_places(chat_id)}
    lines = ["# 📍 Places", "Tap a place for the way there, to share it, or to change it.", ""]
    rows = []
    for kind, (icon, name) in KINDS.items():
        p = saved.get(kind)
        lines.append(f"- {icon} **{name}**: {escape_md(p['label']) if p else '_not set_'}")
        rows.append([Button.inline(f"{icon} {name}" if p else f"{icon} Set {name.lower()}", make_button("places_open", {"kind": kind}))])
    own = [p for p in saved.values() if p["kind"] not in KINDS]
    for p in own:
        lines.append(f"- {p['icon']} **{escape_md(p['name'])}**" + (f": {escape_md(p['label'])}" if p["name"] != p["label"] else ""))
        rows.append([Button.inline(f"{p['icon']} {p['name']}"[:64], make_button("places_open", {"kind": p["kind"]}))])
    if len(own) < MAX_CUSTOM:
        rows.append([Button.inline("➕ Save a new place", make_button("places_new", {}))])
    markdown = "\n".join(lines)
    return {"markdown": markdown, "fallback": markdown.replace("#", "").replace("*", "").replace("_", "")}, rows


def build_place_view(place: dict):
    own = place["kind"] not in KINDS
    lines = [f"# {place['icon']} {escape_md(place['name'])}", escape_md(place["label"])]
    word = place["name"] if not own else "it"
    rows = [
        [Button.inline("🧭 Get me there", make_button("places_go", {"kind": place["kind"]}))],
        [Button.inline(f"🔗 Share {word if not own else ''}".strip(), make_button("places_share", {"kind": place["kind"]}))],
        [
            *([Button.inline("✏️ Rename", make_button("places_rename", {"kind": place["kind"]}))] if own else []),
            Button.inline("📌 Move", make_button("places_move", {"kind": place["kind"]})),
        ],
        [Button.inline("🗑 Delete" if own else f"🗑 Clear {place['name'].lower()}", make_button("places_delete", {"kind": place["kind"]}))],
        [Button.inline("🔙 All places", make_button("places_list", {}))],
    ]
    markdown = "\n".join(lines)
    return {"markdown": markdown, "fallback": markdown.replace("#", "").replace("*", "")}, rows


# ---------- asking ----------


async def ask_where(client, chat_id: int, kind: str, intro: str = ""):
    set_flow(chat_id, f"{FLOW}:where:{kind}")
    await client.send_message(
        chat_id,
        f"{intro}{WHERE_PROMPT}",
        buttons=[Button.request_location("📍 Send my location", single_use=True, resize=True)],
    )


async def save_where(client, chat_id: int, kind: str, place: dict):
    """Where a place is, from /api/places' shape or a sent location. A new one is then asked
    for a name; Home, Work or a place moved are done."""
    stop = place.get("code") if place.get("kind") == "stop" else None
    if kind == "new":
        new_kind = add_place(chat_id, place["label"], place["lat"], place["lng"], stop)
        if not new_kind:
            clear_flow(chat_id)
            await client.send_message(chat_id, f"You have {MAX_CUSTOM} places already. Delete one in /places first.", buttons=Button.clear())
            return
        set_flow(chat_id, f"{FLOW}:name:{new_kind}")
        await client.send_message(
            chat_id,
            f"Saved {place['label']}. What should I call it? Send a name, like Gym or Mum's, or /done to keep calling it that.",
            parse_mode=None,
            buttons=Button.clear(),
        )
        return
    set_place(chat_id, kind, place["label"], place["lat"], place["lng"], stop)
    clear_flow(chat_id)
    saved = get_place(chat_id, kind)
    await client.send_message(chat_id, f"Got it, {saved['name']} is now {place['label']}.", parse_mode=None, buttons=Button.clear())
    rich, buttons = build_place_view(saved)
    await send_rich_message(client, chat_id, rich, buttons)


def pick_buttons(found: list, kind: str) -> list:
    return [
        [
            Button.inline(
                place_button_text(p),
                make_button("places_pick", {"kind": kind, "place": {k: p[k] for k in ("kind", "label", "lat", "lng", "code") if p.get(k) is not None}}),
            )
        ]
        for p in found[:8]
    ]


# ---------- buttons (from callbacks.py) ----------


async def handle_places_callback(client, event, action: str, payload: dict):
    chat_id = event.chat_id
    if action == "places_list":
        rich, buttons = build_places_view(chat_id)
        await edit_rich_message(client, event, rich, buttons)
        await event.answer()
        return
    if action == "places_new":
        await event.answer()
        await ask_where(client, chat_id, "new", "Where's the new place? ")
        return
    if action == "places_pick":
        step, kind = _step(chat_id)
        if step != "where" or kind != payload.get("kind"):
            await event.answer("That question has already been answered.")
            return
        await event.answer()
        await save_where(client, chat_id, kind, payload["place"])
        return

    kind = payload.get("kind")
    if not is_kind(kind):
        await event.answer()
        return
    place = get_place(chat_id, kind)
    if not place:
        if kind in KINDS:
            await event.answer()
            await start_edit_place(client, chat_id, kind)
        else:
            await event.answer("That place has been deleted.")
        return

    if action == "places_open":
        rich, buttons = build_place_view(place)
        await edit_rich_message(client, event, rich, buttons)
        await event.answer()
    elif action == "places_go":
        await event.answer()
        await send_nav_panel(client, chat_id, None, nav_end(place), awaiting="from")
    elif action == "places_share":
        label = place["label"] if kind in KINDS else place["name"]
        try:
            url = await share_place({**place, "label": label})
        except NavError as err:
            await event.answer(str(err), alert=True)
            return
        await event.answer()
        text = f"How to get to {label}"
        await client.send_message(
            chat_id,
            f"{text}:\n{url}\n\n{SHARE_NOTE}",
            parse_mode=None,
            link_preview=True,
            buttons=[[Button.url("📤 Send to a chat", f"https://t.me/share/url?url={quote(url)}&text={quote(text)}")]],
        )
    elif action == "places_rename":
        set_flow(chat_id, f"{FLOW}:name:{kind}")
        await event.answer()
        await client.send_message(chat_id, f"What should I call {place['name']}? Send a name, or /cancel to keep it.", parse_mode=None)
    elif action == "places_move":
        await event.answer()
        if kind in KINDS:
            await start_edit_place(client, chat_id, kind)
        else:
            await ask_where(client, chat_id, kind, f"Where is {place['name']} now? ")
    elif action == "places_delete":
        clear_place(chat_id, kind)
        rich, buttons = build_places_view(chat_id)
        await edit_rich_message(client, event, rich, buttons)
        await event.answer(f"{place['name']} {'cleared' if kind in KINDS else 'deleted'}")
    else:
        await event.answer()


# ---------- messages ----------


def register_places(client):
    @client.on(events.NewMessage(pattern=r"^/places(@\w+)?(\s|$)"))
    async def show(event):
        rich, buttons = build_places_view(event.chat_id)
        await send_rich_message(client, event.chat_id, rich, buttons)

    @client.on(events.NewMessage(pattern=r"^/addplace(@\w+)?(\s|$)"))
    async def add(event):
        await ask_where(client, event.chat_id, "new", "Where's the new place? ")

    # Before /nearme's, which takes any location (main.py registers this first).
    @client.on(events.NewMessage(func=lambda e: e.message.geo is not None))
    async def collect_location(event):
        step, kind = _step(event.chat_id)
        if step != "where":
            return
        geo = event.message.geo
        await save_where(client, event.chat_id, kind, {"label": "Pinned place", "lat": geo.lat, "lng": geo.long})
        raise events.StopPropagation

    @client.on(events.NewMessage(func=lambda e: bool(e.message.text) and not e.message.text.startswith("/")))
    async def collect(event):
        step, kind = _step(event.chat_id)
        if not step:
            return
        chat_id = event.chat_id
        text = event.message.text.strip()

        if step == "name":
            rename_place(chat_id, kind, text)
            clear_flow(chat_id)
            place = get_place(chat_id, kind)
            if place:
                await event.respond(f"Got it, it's called {place['name']}.", parse_mode=None)
                rich, buttons = build_place_view(place)
                await send_rich_message(client, chat_id, rich, buttons)
            raise events.StopPropagation

        if len(text) < 2:
            await event.respond("Send at least two letters of a place, or your location.")
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
            await save_where(client, chat_id, kind, found[0])
            raise events.StopPropagation
        await event.respond("Did you mean:", buttons=pick_buttons(found, kind))
        raise events.StopPropagation
