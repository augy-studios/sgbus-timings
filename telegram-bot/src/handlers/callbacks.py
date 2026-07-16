from telethon import events, types

from ..buttons import resolve_button
from ..favourites import toggle_favourite
from ..reply import edit_rich_message
from ..stop_view import build_stop_view


def register_callbacks(client):
    @client.on(events.CallbackQuery())
    async def handler(event):
        resolved = resolve_button(event.data)
        if not resolved:
            await event.answer("This button is no longer valid.")
            return

        user_id = event.sender_id
        action = resolved["action"]
        payload = resolved["payload"]
        inline_only = isinstance(event.query, types.UpdateInlineBotCallbackQuery)

        try:
            if action in ("stop", "refresh"):
                view = await build_stop_view(payload["code"], user_id, inline_only=inline_only)
                if not view:
                    await event.answer("That bus stop could not be found.")
                    return
                await edit_rich_message(client, event, view["rich"], view["buttons"])
                await event.answer("Refreshed" if action == "refresh" else None)
                return

            if action == "fav":
                now_fav = toggle_favourite(user_id, payload["code"], payload["name"])
                view = await build_stop_view(payload["code"], user_id)
                if view:
                    await edit_rich_message(client, event, view["rich"], view["buttons"])
                await event.answer("Added to favourites" if now_fav else "Removed from favourites")
                return

            await event.answer()
        except Exception as err:
            print(f"[callback_query] handler error: {err}")
            await event.answer("Something went wrong, please try again.")
