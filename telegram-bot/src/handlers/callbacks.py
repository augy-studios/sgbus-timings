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
from ..user_settings import clear_birthday, get_has_bike, get_notifications_enabled, set_has_bike, set_notifications_enabled
from .addroutine import build_bus_picker, clear_buses, finalize_stop, save_draft, toggle_bus
from .favbuses import build_favbuses_view
from .favouritepref import build_favouritepref_view
from .favroutes import build_favroutes_view
from .newroute import FLOW as ROUTE_FLOW
from .newroute import WHEN_BACK as ROUTE_WHEN_BACK
from .newroute import apply_stop as apply_route_stop
from .newroute import arm_route_field, arm_route_when
from .newroute import use_saved_place as use_saved_route_place
from ..saved_places import KINDS as PLACE_KINDS
from ..saved_places import clear_place, get_place, nav_end
from ..saved_places import is_kind as is_place_kind
from .calendar import handle_calendar_callback
from .places import handle_places_callback
from .routines import build_routine_detail_view, build_routine_edit_menu_view, build_routines_view, start_field_edit
from .servicealerts import fetch_alerts_now
from .nav import WHEN_BACK as NAV_WHEN_BACK
from .nav import arm_nav_field, arm_when as arm_nav_when, open_favourite_nav, redraw_panel as redraw_nav_panel
from .nav import set_end as set_nav_end, show_nav, show_option
from ..flows import end_flow, get_flow, set_flow
from ..nav_view import build_mynavs_view
from ..navs import toggle_favourite_nav
from ..route_drafts import get_route_draft
from ..when import describe, quick
from ..when_view import build_when_menu
from .settings import FLOW_PREFIX as SETTINGS_FLOW_PREFIX
from .settings import build_settings_view, save_place, start_edit_birthday, start_edit_name, start_edit_place
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
            # /places and /calendar keep their buttons with them.
            if action.startswith("places_"):
                await handle_places_callback(client, event, action, payload)
                return
            if action.startswith("cal_"):
                await handle_calendar_callback(client, event, action, payload)
                return

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
                draft = get_route_draft(user_id)
                if awaiting:
                    # The wrong-side button swaps an end in, and a stop typed in answer to
                    # this panel afterwards has to land on the route as it now stands.
                    start_route_draft(
                        user_id, awaiting, start_code=start_code, end_code=end_code,
                        panel_msg_id=event.query.msg_id, when=payload.get("when"),
                    )
                elif get_flow(user_id) == ROUTE_FLOW and draft and (draft["field"] or "").startswith("when:"):
                    # Back from the time prompt: no time is coming after all.
                    end_flow(user_id)
                rich, buttons = await build_route_view_async(
                    user_id,
                    start_code,
                    end_code,
                    payload.get("page", 0),
                    awaiting=awaiting,
                    from_fav=payload.get("from_fav"),
                    when=payload.get("when"),
                )
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "route_when":
                rich, buttons = build_when_menu("route", payload, ROUTE_WHEN_BACK)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "route_when_mode":
                await arm_route_when(client, event, user_id, payload)
                await event.answer()
                return

            if action == "route_when_set":
                pick = payload.get("pick")
                when = quick(pick["mode"], pick["minutes"]) if pick else None
                route = {k: v for k, v in payload.items() if k not in ("pick", "when")}
                if when:
                    route["when"] = when
                start_code, end_code = route.get("start"), route.get("end")
                # Either way the time is answered; an end still missing is asked for again.
                awaiting = "start" if not start_code else ("end" if not end_code else None)
                if awaiting:
                    start_route_draft(
                        user_id, awaiting, start_code=start_code, end_code=end_code,
                        panel_msg_id=event.query.msg_id, when=when,
                    )
                    set_flow(user_id, ROUTE_FLOW)
                elif get_flow(user_id) == ROUTE_FLOW:
                    end_flow(user_id)
                rich, buttons = await build_route_view_async(
                    user_id, start_code, end_code, awaiting=awaiting, from_fav=route.get("from_fav"), when=when
                )
                await edit_rich_message(client, event, rich, buttons)
                await event.answer(describe(when))
                return

            if action == "route_set":
                await arm_route_field(client, event, user_id, payload)
                await event.answer()
                return

            if action in ("route_saved", "nav_saved"):
                # Home, Work or one of the chat's own places for one end. Home or Work unset
                # is asked for, and the button works once it's saved, since the panel keeps it.
                kind = payload.get("kind")
                if not is_place_kind(kind):
                    await event.answer()
                    return
                place = get_place(event.chat_id, kind)
                if not place:
                    if kind not in PLACE_KINDS:
                        await event.answer("That place has been deleted. See /places.")
                        return
                    await event.answer(f"Set your {PLACE_KINDS[kind][1].lower()} first")
                    await start_edit_place(client, event.chat_id, kind, from_panel=True)
                    return
                name = place["name"]
                if action == "route_saved":
                    await event.answer()
                    await use_saved_route_place(client, event, user_id, payload, place, name)
                    return
                ends = {"from": payload.get("from"), "to": payload.get("to")}
                ends[payload["field"]] = nav_end(place)
                await event.answer("Finding ways there…" if ends["from"] and ends["to"] else None)
                await redraw_nav_panel(client, event, event.chat_id, ends, payload.get("when"))
                return

            if action == "settings_edit_place":
                await start_edit_place(client, event.chat_id, payload["kind"])
                await event.answer()
                return

            if action == "settings_place_pick":
                if get_flow(event.chat_id) != SETTINGS_FLOW_PREFIX + payload["kind"]:
                    await event.answer("That question has already been answered.")
                    return
                await save_place(client, event.chat_id, payload["kind"], payload["place"])
                await event.answer()
                return

            if action == "settings_clear_place":
                clear_place(event.chat_id, payload["kind"])
                sender = await event.get_sender()
                rich, buttons = build_settings_view(event.chat_id, sender)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer(f"{PLACE_KINDS[payload['kind']][1]} cleared")
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
                    when=payload.get("when"),
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

            if action == "settings_toggle_bike":
                set_has_bike(user_id, not get_has_bike(user_id))
                sender = await event.get_sender()
                rich, buttons = build_settings_view(user_id, sender)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer("Cycling on: /nav says how long it takes" if get_has_bike(user_id) else "Cycling off")
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
                await show_nav(client, event, payload["from"], payload["to"], payload.get("when"))
                return

            if action == "nav_option":
                await event.answer()
                await show_option(client, event, payload["from"], payload["to"], payload["option"], payload.get("when"))
                return

            if action == "nav_fav":
                now_fav = toggle_favourite_nav(event.chat_id, payload["from"], payload["to"])
                await event.answer("Nav added to favourites" if now_fav else "Nav removed from favourites")
                await show_nav(client, event, payload["from"], payload["to"], payload.get("when"))
                return

            if action == "nav_when":
                rich, buttons = build_when_menu("nav", payload, NAV_WHEN_BACK)
                await edit_rich_message(client, event, rich, buttons)
                await event.answer()
                return

            if action == "nav_when_mode":
                await arm_nav_when(client, event, event.chat_id, payload)
                await event.answer()
                return

            if action in ("nav_when_set", "nav_back"):
                if action == "nav_when_set":
                    pick = payload.get("pick")
                    when = quick(pick["mode"], pick["minutes"]) if pick else None
                else:
                    when = payload.get("when")
                await event.answer(describe(when) if action == "nav_when_set" else None)
                await redraw_nav_panel(client, event, event.chat_id, payload, when)
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
