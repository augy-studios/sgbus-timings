import asyncio
from datetime import datetime, timedelta, timezone

from telethon import TelegramClient

GMT8 = timezone(timedelta(hours=8))

from .bus_routes import bus_routes_count, refresh_bus_routes
from .bus_services import bus_services_count, refresh_bus_services
from .bus_stops import bus_stops_count, refresh_bus_stops
from .config import config
from .format import escape_md
from .handlers.addfavbus import register_addfavbus
from .handlers.addroutine import register_addroutine
from .handlers.callbacks import register_callbacks
from .handlers.favbuses import register_favbuses
from .handlers.favouritepref import register_favouritepref
from .handlers.favstops import register_favstops
from .handlers.flow_control import register_flow_control
from .handlers.inline import register_inline
from .handlers.nearme import register_nearme
from .handlers.routines import register_routines
from .handlers.search import register_search
from .handlers.setname import register_setname
from .handlers.settings import register_settings
from .handlers.start import register_start
from .handlers.unfavbus import register_unfavbus
from .handlers.unfavstop import register_unfavstop
from .reply import send_rich_message
from .routines import due_routines, mark_fired
from .scheduler import register_job, start_scheduler, stop_scheduler
from .stop_view import build_stop_view
from .time_of_day import greeting_for_hour
from .user_settings import (
    chats_with_birthday_today,
    get_display_name,
    get_notifications_enabled,
    mark_birthday_wished,
)

SESSION_PATH = config.db_path.parent / "bot"


async def main() -> None:
    client = TelegramClient(str(SESSION_PATH), config.api_id, config.api_hash)
    await client.start(bot_token=config.bot_token)

    register_start(client)
    register_nearme(client)
    register_favstops(client)
    register_addfavbus(client)  # includes the flow text-interceptor, must come before register_search
    register_favbuses(client)
    register_unfavbus(client)
    register_unfavstop(client)
    register_favouritepref(client)
    register_setname(client)
    register_settings(client)  # includes the flow text-interceptor, must come before register_search
    register_addroutine(client)  # includes the flow text-interceptor, must come before register_search
    register_routines(client)
    register_flow_control(client)
    register_callbacks(client)
    register_inline(client)
    register_search(client)  # catch-all text handler

    register_job(
        "refresh-bus-stops",
        int(config.bus_stops_refresh_hours * 60 * 60 * 1000),
        _refresh_stops_job,
    )
    register_job(
        "refresh-bus-services",
        int(config.bus_stops_refresh_hours * 60 * 60 * 1000),
        _refresh_services_job,
    )
    register_job(
        "refresh-bus-routes",
        int(config.bus_stops_refresh_hours * 60 * 60 * 1000),
        _refresh_routes_job,
    )
    register_job("check-routines", 60 * 1000, lambda: _check_routines_job(client))
    register_job("check-birthdays", 60 * 1000, lambda: _check_birthdays_job(client))

    if bus_stops_count() == 0:
        print("Bus stop cache is empty, fetching from LTA DataMall before starting...")
        count = await refresh_bus_stops()
        print(f"Loaded {count} bus stops.")

    if bus_services_count() == 0:
        print("Bus service cache is empty, fetching from LTA DataMall before starting...")
        count = await refresh_bus_services()
        print(f"Loaded {count} bus services.")

    if bus_routes_count() == 0:
        print("Bus route cache is empty, fetching from LTA DataMall before starting...")
        count = await refresh_bus_routes()
        print(f"Loaded {count} bus routes.")

    start_scheduler()
    print("Bot started.")
    try:
        await client.run_until_disconnected()
    finally:
        stop_scheduler()


async def _refresh_stops_job() -> None:
    count = await refresh_bus_stops()
    timestamp = datetime.now(GMT8).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [scheduler] refreshed bus stop cache: {count} total bus stops")


async def _refresh_services_job() -> None:
    count = await refresh_bus_services()
    timestamp = datetime.now(GMT8).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [scheduler] refreshed bus service cache: {count} total bus services")


async def _refresh_routes_job() -> None:
    count = await refresh_bus_routes()
    timestamp = datetime.now(GMT8).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [scheduler] refreshed bus route cache: {count} total bus routes")


async def _check_routines_job(client: TelegramClient) -> None:
    now = datetime.now(GMT8)
    for routine in due_routines(now):
        try:
            if not get_notifications_enabled(routine["chat_id"]):
                continue

            entity = await client.get_entity(routine["chat_id"])
            fallback = entity.first_name if entity and entity.first_name else "there"
            name = get_display_name(routine["chat_id"], fallback)

            view = await build_stop_view(routine["stop_code"], routine["chat_id"])
            if not view:
                continue

            greeting = f"{greeting_for_hour(now.hour)}, {escape_md(name)}!\n\n"
            rich = {
                "markdown": greeting + view["rich"]["markdown"],
                "fallback": f"{greeting_for_hour(now.hour)}, {name}!\n\n" + view["rich"]["fallback"],
            }
            await send_rich_message(client, routine["chat_id"], rich, view["buttons"])
        except Exception as err:
            print(f"[scheduler] routine {routine['id']} failed to fire: {err}")
        finally:
            mark_fired(routine["id"], now, routine["hour"], routine["minute"])


async def _check_birthdays_job(client: TelegramClient) -> None:
    now = datetime.now(GMT8)
    if now.hour != 9 or now.minute != 0:
        return

    today = now.strftime("%Y-%m-%d")
    month_day = now.strftime("%m-%d")
    for row in chats_with_birthday_today(month_day, today):
        chat_id = row["chat_id"]
        try:
            entity = await client.get_entity(chat_id)
            fallback = entity.first_name if entity and entity.first_name else "there"
            name = get_display_name(chat_id, fallback)
            await client.send_message(chat_id, f"🎂 Happy birthday, {name}! Hope you have a great day.", parse_mode=None)
        except Exception as err:
            print(f"[scheduler] birthday wish for chat {chat_id} failed: {err}")
        finally:
            mark_birthday_wished(chat_id, today)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Received interrupt, shutting down...")
