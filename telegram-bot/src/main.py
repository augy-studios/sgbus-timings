import asyncio
from datetime import datetime, timedelta, timezone

from telethon import TelegramClient

GMT8 = timezone(timedelta(hours=8))

from .bus_routes import bus_routes_count, refresh_bus_routes
from .bus_services import bus_services_count, refresh_bus_services
from .bus_stops import bus_stops_count, refresh_bus_stops
from .config import config
from .handlers.addfavbus import register_addfavbus
from .handlers.callbacks import register_callbacks
from .handlers.favbuses import register_favbuses
from .handlers.favouritepref import register_favouritepref
from .handlers.favstops import register_favstops
from .handlers.flow_control import register_flow_control
from .handlers.inline import register_inline
from .handlers.nearme import register_nearme
from .handlers.search import register_search
from .handlers.start import register_start
from .handlers.unfavbus import register_unfavbus
from .handlers.unfavstop import register_unfavstop
from .scheduler import register_job, start_scheduler, stop_scheduler

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


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Received interrupt, shutting down...")
