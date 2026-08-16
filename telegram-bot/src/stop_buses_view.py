from telethon import Button

from .bus_routes import services_for_stop
from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .favourite_buses import list_favourite_buses
from .favourite_prefs import get_pref, pin_favourites
from .format import bus_button_label, escape_md
from .pagination import nav_row, paginate

# Bus numbers are short enough to sit several to a row, and a wide grid keeps even the
# busiest interchange down to a page or two rather than a long scroll through pages.
GRID_COLUMNS = 4
GRID_ROWS = 5
GRID_PAGE_SIZE = GRID_COLUMNS * GRID_ROWS


def build_stop_buses_view(chat_id: int, code: str, page: int, origin: dict):
    """Paginated grid of every bus number serving a stop, for picking one to narrow the
    stop's timings down to. Favourite buses are starred and pinned to the top or bottom
    per the user's preference, same as they are in the timings themselves.
    `origin` is the stop view this was opened from, which the back button returns to.
    Returns (rich, buttons, services)."""
    stop = get_bus_stop_by_code(code)
    if not stop:
        return None

    services = services_for_stop(code)
    fav_bus_nos = {row["service_no"] for row in list_favourite_buses(chat_id)}
    services = pin_favourites(services, fav_bus_nos, get_pref(chat_id, "bus"))
    page_items, page, total_pages = paginate(services, page, GRID_PAGE_SIZE)

    heading = f"Buses at {stop['name']} ({stop['code']})"
    detail = "Select a bus number to see just its timings at this stop."
    rich = {
        "markdown": f"# {escape_md(heading)}\n\n{escape_md(detail)}",
        "fallback": f"{heading}\n{detail}",
    }

    # The list the user picked this stop from, if any, rides on to the timings view so the
    # way back to it survives narrowing down to a single bus.
    back = origin.get("back")
    buttons = [
        [
            Button.inline(
                bus_button_label(service_no, is_favourite=service_no in fav_bus_nos),
                make_button("stop", {"code": code, "bus_no": service_no, **({"back": back} if back else {})}),
            )
            for service_no in page_items[row : row + GRID_COLUMNS]
        ]
        for row in range(0, len(page_items), GRID_COLUMNS)
    ]
    buttons += nav_row("stop_buses", {"code": code, "from": origin}, page, total_pages)
    buttons.append([Button.inline("🔙 Back to timings", make_button("stop", origin))])
    return rich, buttons, services
