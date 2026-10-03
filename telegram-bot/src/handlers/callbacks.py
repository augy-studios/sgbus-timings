from telethon import events, types
from telethon.errors import MessageNotModifiedError

from ..bus_route_view import build_bus_stops_view, build_route_onward_view
from ..buttons import resolve_button
from ..favourite_buses import remove_favourite_bus
from ..favourite_prefs import set_pref
from ..favourites import remove_favourite, toggle_favourite
from ..journey_view import build_journey_view
from ..list_view import rebuild_stop_list_view
from ..reply import edit_rich_message, edit_rich_message_at
from ..route_drafts import panel_awaiting, start_route_draft
from ..route_view import build_route_view_async, toggle_route_favourite
from ..routines import delete_routine
from ..service_alerts import KINDS as ALERT_KINDS
from ..service_alerts import MODES as ALERT_MODES
from ..service_alerts import set_mode as set_alert_mode
from ..service_alerts_view import MODE_LABELS, alerts_buttons, format_alerts_now, format_subscription, sub_mode_buttons
from ..stop_buses_view import build_stop_buses_view
from ..stop_view import build_stop_view
from ..user_settings import clear_birthday, get_notifications_enabled, set_notifications_enabled
from .addroutine import build_bus_picker, clear_buses, finalize_stop, save_draft, toggle_bus
from .favbuses import build_favbuses_view
from .favouritepref import build_favouritepref_view
from .favroutes import build_favroutes_view
from .newroute import apply_stop as apply_route_stop
from .newroute import arm_route_field
from .routines import build_routine_detail_view, build_routine_edit_menu_view, build_routines_view, start_field_edit
from .servicealerts import fetch_alerts_now
from .nav import arm_nav_field, open_favourite_nav, set_end as set_nav_end, show_nav, show_option
from ..nav_view import build_mynavs_view
from ..navs import toggle_favourite_nav
from .settings import build_settings_view, start_edit_birthday, start_edit_name
from .unfavbus import build_unfavbus_view
from .unfavstop import build_unfavstop_view


def _stop_view_args(payload: dict) -> dict:
    """A stop view's own state, as every button that reopens it carries it: which service
    the view is narrowed to and which way the user got there, whether it's been widened
    out to all services, where in the service's stop list they came from, the list of
    stops they picked this one off, the route panel they picked the bus off, the buses
    a routine narrowed it to, and the /nav way the bus is a leg of."""
    return {
        "service_no": payload.get("service_no"),
        "picked_service_no": payload.get("bus_no"),
        "expanded": payload.get("expanded", False),
        "stops_page": payload.get("page", 0),
        "stops_reverse": payload.get("reverse", False),
        "back": payload.get("back"),
        "route": payload.get("route"),
        "services": payload.get("services"),
        "nav": payload.get("nav"),
    }


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
            if action in ("stop", "refresh", "navigate"):
                # Directions is the same view again, with the button swapped for a link per map app.
                view = await build_stop_view(
                    payload["code"],
                    user_id,
                    inline_only=inline_only,
                    navigate_open=action == "navigate",
                    **_stop_view_args(payload),
                )
                if not view:
                    await event.answer("That bus stop could not be found.")
                    return
                await edit_rich_message(client, event, view["rich"], view["buttons"])
                await event.answer("Refreshed" if action == "refresh" else None)
                return

            if action == "fav":
                now_fav = toggle_favourite(user_id, payload["code"], payload["name"])
                view = await build_stop_view(payload["code"], user_id, **_stop_view_args(payload))
                if view:
                    await edit_rich_message(client, event, view["rich"], view["buttons"])
                await event.answer("Added to favourites" if now_fav else "Removed from favourites")
                return

            if action == "stop_list":
                rich, buttons = rebuild_stop_list_view(user_id, payload)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "stop_buses":
                view = build_stop_buses_view(
                    user_id, payload["code"], payload.get("page", 0), payload["from"]
                )
                if not view:
                    await event.answer("That bus stop could not be found.")
                    return
                rich, buttons, services = view
                if not services:
                    await event.answer("No bus services are listed for that stop.")
                    return
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "route_from":
                view = build_route_onward_view(
                    user_id,
                    payload["service_no"],
                    payload["code"],
                    payload.get("page", 0),
                    payload.get("reverse", False),
                    payload["from"],
                )
                if not view:
                    await event.answer(f"No route is cached for {payload['service_no']} at that stop.")
                    return
                rich, buttons, stops = view
                if len(stops) < 2:
                    await event.answer(f"This is the last stop on {payload['service_no']}'s route.")
                    return
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "route_view":
                start_code, end_code = payload.get("start"), payload.get("end")
                if payload.get("journey"):
                    route = {k: v for k, v in payload.items() if k != "journey"}
                    rich, buttons = await build_journey_view(start_code, end_code, payload["journey"], route)
                    await edit_rich_message(client, event, rich, buttons)
                    await event.answer()
                    return
                awaiting = panel_awaiting(user_id, event.query.msg_id)
                if awaiting:
                    # The wrong-side button swaps an end in, and a stop typed in answer to
                    # this panel afterwards has to land on the route as it now stands.
                    start_route_draft(
                        user_id, awaiting, start_code=start_code, end_code=end_code, panel_msg_id=event.query.msg_id
                    )
                rich, buttons = await build_route_view_async(
                    user_id,
                    start_code,
                    end_code,
                    payload.get("page", 0),
                    awaiting=awaiting,
                    from_fav=payload.get("from_fav"),
                )
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "route_set":
                await arm_route_field(client, event, user_id, payload)
                await event.answer()
                return

            if action == "route_stop_pick":
                await apply_route_stop(client, user_id, payload["code"])
                await event.answer()
                return

            if action == "route_fav":
                start_code, end_code = payload["start"], payload["end"]
                now_fav = toggle_route_favourite(user_id, start_code, end_code)
                rich, buttons = await build_route_view_async(
                    user_id,
                    start_code,
                    end_code,
                    payload.get("page", 0),
                    awaiting=panel_awaiting(user_id, event.query.msg_id),
                    from_fav=payload.get("from_fav"),
                )
                await edit_rich_message(client, event, rich, buttons)
                await event.answer("Route added to favourites" if now_fav else "Route removed from favourites")
                return

            if action == "favroute_page":
                rich, buttons, routes = build_favroutes_view(user_id, payload.get("page", 0))
                if not routes:
                    await edit_rich_message(
                        client,
                        event,
                        {"markdown": "No favourite routes left.", "fallback": "No favourite routes left."},
                        None,
                    )
                else:
                    await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "favbus_page":
                rich, buttons, _ = build_favbuses_view(user_id, payload.get("page", 0))
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            # "favbus_*" are the pre-rename action names, still stored on buttons sent
            # before this version - they keep working since button rows never expire.
            if action in ("bus_stops", "favbus_stops", "bus_stops_swap"):
                rich, buttons, _ = build_bus_stops_view(
                    user_id, payload["service_no"], payload.get("page", 0), payload.get("reverse", False)
                )
                await edit_rich_message(client, event, rich, buttons)
                await event.answer("Showing the other direction" if action == "bus_stops_swap" else None)
                return

            if action in ("bus_stop_view", "favbus_stop_view"):
                view = await build_stop_view(payload["code"], user_id, **_stop_view_args(payload))
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
                await event.answer()
                return

            if action in ("routine_bus_toggle", "routine_bus_clear", "routine_bus_page"):
                if action == "routine_bus_toggle":
                    toggle_bus(user_id, payload["service_no"])
                elif action == "routine_bus_clear":
                    clear_buses(user_id)
                view = build_bus_picker(user_id, payload.get("page", 0))
                if not view:
                    await event.answer("This routine setup has already ended.")
                    return
                await edit_rich_message(client, event, *view)
                await event.answer()
                return

            if action == "routine_bus_done":
                view = build_bus_picker(user_id)
                if not view:
                    await event.answer("This routine setup has already ended.")
                    return
                # The picker stays as a record of what was picked, but its buttons go.
                await edit_rich_message_at(client, user_id, event.message_id, view[0])
                await save_draft(client, user_id)
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

            # Also re-subscribes, so tapping a mode under an old /sub reply after /unsub
            # does what the button says.
            if action == "alerts_mode":
                # Buttons from before trains and traffic were split carry one mode for both.
                kinds = [payload["kind"]] if payload.get("kind") in ALERT_KINDS else list(ALERT_KINDS)
                mode = payload.get("mode")
                if mode not in ALERT_MODES:
                    await event.answer()
                    return
                modes = None
                for kind in kinds:
                    modes = set_alert_mode(event.chat_id, kind, mode)
                try:
                    await event.edit(format_subscription(modes), buttons=sub_mode_buttons(modes))
                except MessageNotModifiedError:
                    pass  # the choice already picked, tapped again
                what = "Train alerts" if kinds == ["train"] else "Traffic alerts" if kinds == ["traffic"] else "Alerts"
                await event.answer(f"{what}: {MODE_LABELS[mode].lower()}")
                return

            if action == "nav_set":
                await arm_nav_field(client, event, event.chat_id, payload)
                await event.answer()
                return

            if action == "nav_pick":
                await set_nav_end(client, event.chat_id, payload["field"], payload["place"])
                await event.answer()
                return

            if action == "nav_show":
                await event.answer("Finding ways there…")
                await show_nav(client, event, payload["from"], payload["to"])
                return

            if action == "nav_option":
                await event.answer()
                await show_option(client, event, payload["from"], payload["to"], payload["option"])
                return

            if action == "nav_fav":
                now_fav = toggle_favourite_nav(event.chat_id, payload["from"], payload["to"])
                await event.answer("Nav added to favourites" if now_fav else "Nav removed from favourites")
                await show_nav(client, event, payload["from"], payload["to"])
                return

            if action == "nav_open_fav":
                if not await open_favourite_nav(client, event.chat_id, payload["id"]):
                    await event.answer("That nav is no longer in your favourites.")
                    return
                await event.answer()
                return

            if action == "mynavs_page":
                rich, buttons, navs = build_mynavs_view(event.chat_id, payload.get("page", 0))
                if not navs:
                    await edit_rich_message(client, event, {"markdown": "No favourite navs left.", "fallback": "No favourite navs left."}, None)
                else:
                    await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "alerts_refresh":
                train, traffic = await fetch_alerts_now()
                await edit_rich_message(client, event, format_alerts_now(train, traffic), alerts_buttons())
                await event.answer("Refreshed")
                return

            await event.answer()
        except Exception as err:
            print(f"[callback_query] handler error: {err}")
            await event.answer("Something went wrong, please try again.")
