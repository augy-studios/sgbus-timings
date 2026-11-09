"""The HTTP Bot API, for what Telethon can't do yet: widgets (Bot API 10.4), which its MTProto
layer has no types for. The bot still runs on Telethon; only widget messages are sent, edited
and given buttons through here, with the same BOT_TOKEN. Their buttons' taps still reach
Telethon as ordinary callback queries (handlers/callbacks.py).

No widget queries: they would come as updates Telethon can't read. The trip widget needs none
(trip_widget.html), and its buttons sit under it as an inline keyboard."""

import httpx

from .config import config
from .http_client import shared_client


class BotApiError(RuntimeError):
    def __init__(self, method: str, description: str, code: "int | None" = None):
        super().__init__(f"{method}: {description}")
        self.description = description
        self.code = code


def _url(method: str) -> str:
    return f"https://api.telegram.org/bot{config.bot_token}/{method}"


async def call(method: str, payload: dict):
    """One Bot API method, its result, or BotApiError with Telegram's description."""
    body = {k: v for k, v in payload.items() if v is not None}
    try:
        res = await shared_client().post(_url(method), json=body, timeout=20)
    except httpx.HTTPError as err:
        raise BotApiError(method, f"couldn't reach Telegram ({type(err).__name__})") from err
    try:
        data = res.json()
    except ValueError:
        raise BotApiError(method, f"HTTP {res.status_code}", res.status_code)
    if not data.get("ok"):
        raise BotApiError(method, data.get("description") or f"HTTP {res.status_code}", data.get("error_code"))
    return data.get("result")


def not_modified(err: BotApiError) -> bool:
    return "not modified" in (err.description or "").lower()


def keyboard(rows: "list | None") -> "dict | None":
    """An inline keyboard from rows of ("text", callback_data bytes) and ("text", {"url": …})."""
    if rows is None:
        return None
    out = []
    for row in rows:
        r = []
        for text, action in row:
            if isinstance(action, dict):
                r.append({"text": text, **action})
            else:
                r.append({"text": text, "callback_data": action.decode() if isinstance(action, bytes) else action})
        out.append(r)
    return {"inline_keyboard": out}


async def send_widget(chat_id: int, html: str, *, public_data: str, chat_data: "str | None" = None,
                      caption: str = "", buttons=None, shared: bool = True) -> dict:
    """A new widget message; with `shared`, a new shared widget, its id at result["widget"]["id"]."""
    return await call("sendWidget", {
        "chat_id": chat_id, "html": html, "public_data": public_data, "chat_data": chat_data,
        "caption": caption or None, "is_shared": shared or None, "reply_markup": keyboard(buttons),
    })


async def send_shared_widget(chat_id: int, widget_id: str, *, chat_data: "str | None" = None,
                             caption: str = "", buttons=None) -> dict:
    return await call("sendSharedWidget", {
        "chat_id": chat_id, "widget_id": widget_id, "chat_data": chat_data,
        "caption": caption or None, "reply_markup": keyboard(buttons),
    })


async def edit_shared_widget_data(widget_id: str, public_data: str, cache_time: "int | None" = None) -> None:
    """At most once a second per shared widget, Telegram's limit."""
    try:
        await call("editSharedWidgetData", {"widget_id": widget_id, "public_data": public_data, "cache_time": cache_time})
    except BotApiError as err:
        if not not_modified(err):
            raise


async def edit_buttons(chat_id: int, message_id: int, buttons=None) -> None:
    """A widget message's buttons changed, or taken away with None."""
    try:
        await call("editMessageReplyMarkup", {
            "chat_id": chat_id, "message_id": message_id,
            "reply_markup": keyboard(buttons) or {"inline_keyboard": []},
        })
    except BotApiError as err:
        if not not_modified(err):
            raise
