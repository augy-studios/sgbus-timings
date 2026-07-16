import asyncio
from datetime import datetime, timedelta, timezone

from telethon import TelegramClient

GMT8 = timezone(timedelta(hours=8))

from .bus_stops import bus_stops_count, refresh_bus_stops
from .config import config
from .handlers.callbacks import register_callbacks
from .handlers.favs import register_favs
from .handlers.inline import register_inline
from .handlers.nearme import register_nearme
from .handlers.search import register_search
from .handlers.start import register_start
from .scheduler import register_job, start_scheduler, stop_scheduler

SESSION_PATH = config.db_path.parent / "bot"


async def main() -> None:
    client = TelegramClient(str(SESSION_PATH), config.api_id, config.api_hash)
    await client.start(bot_token=config.bot_token)

    register_start(client)
    register_nearme(client)
    register_favs(client)
    register_callbacks(client)
    register_inline(client)
    register_search(client)  # catch-all text handler

    register_job(
        "refresh-bus-stops",
        int(config.bus_stops_refresh_hours * 60 * 60 * 1000),
        _refresh_job,
    )

    if bus_stops_count() == 0:
        print("Bus stop cache is empty, fetching from LTA DataMall before starting...")
        count = await refresh_bus_stops()
        print(f"Loaded {count} bus stops.")

    start_scheduler()
    print("Bot started.")
    try:
        await client.run_until_disconnected()
    finally:
        stop_scheduler()


async def _refresh_job() -> None:
    count = await refresh_bus_stops()
    timestamp = datetime.now(GMT8).strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [scheduler] refreshed bus stop cache: {count} total bus stops")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Received interrupt, shutting down...")
