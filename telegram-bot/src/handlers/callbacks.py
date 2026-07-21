from telethon import events, types

from ..buttons import resolve_button
from ..favourite_buses import remove_favourite_bus
from ..favourite_prefs import set_pref
from ..favourites import remove_favourite, toggle_favourite
from ..reply import edit_rich_message
from ..routines import delete_routine
from ..stop_view import build_stop_view
from ..user_settings import clear_birthday, get_notifications_enabled, set_notifications_enabled
from .addroutine import finalize_stop
from .favbuses import build_favbus_stops_view, build_favbuses_view
from .favouritepref import build_favouritepref_view
from .routines import build_routine_detail_view, build_routine_edit_menu_view, build_routines_view, start_field_edit
from .settings import build_settings_view, start_edit_birthday, start_edit_name
from .unfavbus import build_unfavbus_view
from .unfavstop import build_unfavstop_view


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
                view = await build_stop_view(
                    payload["code"], user_id, inline_only=inline_only, service_no=payload.get("service_no")
                )
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

            if action == "favbus_page":
                rich, buttons, _ = build_favbuses_view(user_id, payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "favbus_stops":
                rich, buttons, _ = build_favbus_stops_view(user_id, payload["service_no"], payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "favbus_stop_view":
                view = await build_stop_view(payload["code"], user_id, service_no=payload["service_no"])
                if not view:
                    await event.answer("That bus stop could not be found.")
                    return
                await edit_rich_message(client, event, view["rich"], view["buttons"])
                await event.answer()
                return

            if action == "unfavbus_page":
                rich, buttons, _ = build_unfavbus_view(user_id, payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "unfavbus_remove":
                remove_favourite_bus(user_id, payload["service_no"])
                rich, buttons, buses = build_unfavbus_view(user_id, payload.get("page", 0))
                if buses:
                    await edit_rich_message(client, event, rich, buttons)
                else:
                    await edit_rich_message(
                        client,
                        event,
                        {"markdown": "No favourite buses left.", "fallback": "No favourite buses left."},
                        None,
                    )
                await event.answer(f"Removed {payload['service_no']}")
                return

            if action == "unfavstop_page":
                rich, buttons, _ = build_unfavstop_view(user_id, payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "unfavstop_remove":
                remove_favourite(user_id, payload["code"])
                rich, buttons, stops = build_unfavstop_view(user_id, payload.get("page", 0))
                if stops:
                    await edit_rich_message(client, event, rich, buttons)
                else:
                    await edit_rich_message(
                        client,
                        event,
                        {"markdown": "No favourite bus stops left.", "fallback": "No favourite bus stops left."},
                        None,
                    )
                await event.answer("Removed")
                return

            if action == "favpref_page":
                rich, buttons = build_favouritepref_view(user_id, payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "favpref_set":
                set_pref(user_id, payload["kind"], payload["position"])
                rich, buttons = build_favouritepref_view(user_id, payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer("Preference saved")
                return

            if action == "routines_page":
                rich, buttons, routines = build_routines_view(user_id, payload.get("page", 0))
                if not routines:
                    await edit_rich_message(
                        client,
                        event,
                        {"markdown": "No routines left.", "fallback": "No routines left."},
                        None,
                    )
                else:
                    await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "routine_view":
                view = build_routine_detail_view(payload["id"])
                if not view:
                    await event.answer("That routine no longer exists.")
                    return
                await edit_rich_message(client, event, view[0], view[1])
                await event.answer()
                return

            if action == "routine_edit_menu":
                view = build_routine_edit_menu_view(payload["id"])
                if not view:
                    await event.answer("That routine no longer exists.")
                    return
                await edit_rich_message(client, event, view[0], view[1])
                await event.answer()
                return

            if action == "routine_edit_field":
                await start_field_edit(client, user_id, payload["id"], payload["field"])
                await event.answer()
                return

            if action == "routine_delete":
                delete_routine(payload["id"])
                rich, buttons, routines = build_routines_view(user_id, 0)
                if not routines:
                    await edit_rich_message(
                        client,
                        event,
                        {"markdown": "No routines left.", "fallback": "No routines left."},
                        None,
                    )
                else:
                    await edit_rich_message(client, event, rich, buttons)
                await event.answer("Routine deleted")
                return

            if action == "routine_stop_pick":
                await finalize_stop(client, user_id, payload["code"], payload["name"])
                await event.answer("Saved")
                return

            if action == "settings_edit_name":
                await start_edit_name(client, user_id)
                await event.answer()
                return

            if action == "settings_edit_birthday":
                await start_edit_birthday(client, user_id)
                await event.answer()
                return

            if action == "settings_clear_birthday":
                clear_birthday(user_id)
                sender = await event.get_sender()
                rich, buttons = build_settings_view(user_id, sender)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer("Birthday cleared")
                return

            if action == "settings_toggle_notifications":
                set_notifications_enabled(user_id, not get_notifications_enabled(user_id))
                sender = await event.get_sender()
                rich, buttons = build_settings_view(user_id, sender)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer(
                    "Notifications " + ("enabled" if get_notifications_enabled(user_id) else "disabled")
                )
                return

            await event.answer()
        except Exception as err:
            print(f"[callback_query] handler error: {err}")
            await event.answer("Something went wrong, please try again.")
