import asyncio

from .bus_stops import refresh_bus_stops


async def main() -> None:
    count = await refresh_bus_stops()
    print(f"Refreshed {count} bus stops from LTA DataMall.")


if __name__ == "__main__":
    asyncio.run(main())
