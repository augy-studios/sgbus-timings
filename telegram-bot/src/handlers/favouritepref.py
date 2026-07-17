from telethon import Button, events

from ..buttons import make_button
from ..favourite_prefs import get_pref, set_pref
from ..reply import send_rich_message

PAGES = [
    {"kind": "bus", "title": "Favourite buses"},
    {"kind": "stop", "title": "Favourite bus stops"},
]


def build_favouritepref_view(chat_id: int, page: int):
    page = max(0, min(page, len(PAGES) - 1))
    entry = PAGES[page]
    kind = entry["kind"]
    current = get_pref(chat_id, kind)

    rich = {
        "markdown": f"# Pin position — {entry['title']}\nWhere should {entry['title'].lower()} be pinned?",
        "fallback": f"Pin position for {entry['title']}",
    }

    def option_label(position, label):
        check = "✅ " if current == position else ""
        return f"{check}{label}"

    buttons = [
        [
            Button.inline(
                option_label("top", "⬆️ Top"),
                make_button("favpref_set", {"kind": kind, "position": "top", "page": page}),
            ),
            Button.inline(
                option_label("bottom", "⬇️ Bottom"),
                make_button("favpref_set", {"kind": kind, "position": "bottom", "page": page}),
            ),
        ]
    ]

    nav = []
    if page > 0:
        nav.append(Button.inline("◀ Prev", make_button("favpref_page", {"page": page - 1})))
    nav.append(Button.inline(f"{page + 1}/{len(PAGES)}", make_button("favpref_page", {"page": page})))
    if page < len(PAGES) - 1:
        nav.append(Button.inline("Next ▶", make_button("favpref_page", {"page": page + 1})))
    buttons.append(nav)

    return rich, buttons


def register_favouritepref(client):
    @client.on(events.NewMessage(pattern="/favouritepref"))
    async def handler(event):
        rich, buttons = build_favouritepref_view(event.chat_id, 0)
        await send_rich_message(client, event.chat_id, rich, buttons)
