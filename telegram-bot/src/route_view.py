from telethon import Button

from .bus_routes import services_between
from .bus_stops import get_bus_stop_by_code
from .buttons import make_button
from .favourite_buses import list_favourite_buses
from .favourite_prefs import get_pref, pin_favourites
from .favourite_routes import is_favourite_route, toggle_favourite_route
from .format import bus_button_label, escape_md
from .pagination import nav_row, paginate
from .stop_buses_view import GRID_COLUMNS, GRID_PAGE_SIZE

# Two setter buttons share a row, so each one has half a row's width to say which stop it
# holds. The route buttons in /favroutes get a row to themselves and Telegram's full 64.
SETTER_LABEL_LIMIT = 32
ROUTE_LABEL_LIMIT = 64

STOP_PROMPT = "Send a bus stop number, or part of its name, to set the {}."


def _truncate(label: str, limit: int) -> str:
    return label if len(label) <= limit else f"{label[: limit - 3]}..."


def stop_display(code) -> "str | None":
    """A route's end as it reads in the panel body - the stop's name and code, or just the
    code for a stop the cache no longer knows. None for an end that isn't set yet."""
    if not code:
        return None
    stop = get_bus_stop_by_code(code)
    return f"{stop['name']} ({stop['code']})" if stop else code


def route_button_label(start_name: str, end_name: str, is_favourite: bool = True) -> str:
    """Label for a whole route as one button, as /favroutes lists them. The arrow says
    which end is the start, which is what decides the stop a bus button opens."""
    icon = "⭐" if is_favourite else "🛣"
    return _truncate(f"{icon} {start_name} → {end_name}", ROUTE_LABEL_LIMIT)


def _setter_label(icon: str, field: str, code, armed: bool) -> str:
    prefix = "✏️" if armed else icon
    stop = get_bus_stop_by_code(code) if code else None
    if not stop:
        return f"{prefix} Set {field}"
    return _truncate(f"{prefix} {field.capitalize()}: {stop['name']}", SETTER_LABEL_LIMIT)


def _status_line(start_code, end_code, services) -> str:
    if not (start_code and end_code):
        return "Set both ends to see the buses that run between them."
    if not services:
        return "😕 No single bus links these two stops. Try picking other stops."
    count = len(services)
    return f"🚌 {count} bus{'' if count == 1 else 'es'} run{'s' if count == 1 else ''} between these stops."


def toggle_route_favourite(chat_id: int, start_code: str, end_code: str) -> bool:
    """Stars or unstars the route, storing each end's name as it reads now so /favroutes
    still says something for a stop that later leaves the cache."""
    start = get_bus_stop_by_code(start_code)
    end = get_bus_stop_by_code(end_code)
    return toggle_favourite_route(
        chat_id,
        start_code,
        start["name"] if start else start_code,
        end_code,
        end["name"] if end else end_code,
    )


def build_route_view(chat_id: int, start_code, end_code, page: int = 0, awaiting=None, from_fav=None):
    """The route panel: where the route starts and ends, and the buses that link the two
    without a change, as a paginated grid four across.

    Either end may still be unset - that's how /newroute starts out - and `awaiting` is the
    end the chat is being asked to type ("start" or "end"), which marks its button and puts
    the prompt in the body. `from_fav` is the page of /favroutes this was opened from, which
    the back button returns to.

    Favourite buses are starred and pinned per the user's `/favouritepref`, as they are in
    every other bus grid; favourite routes have no preference of their own.
    Returns (rich, buttons)."""
    start_text = stop_display(start_code)
    end_text = stop_display(end_code)
    services = services_between(start_code, end_code) if start_code and end_code else []
    status = _status_line(start_code, end_code, services)

    lines = [
        "# Route",
        f"- **Start**: {escape_md(start_text) if start_text else '_not set_'}",
        f"- **End**: {escape_md(end_text) if end_text else '_not set_'}",
        # Blank lines between blocks: a single newline collapses into the previous
        # paragraph in Telegram's rich-message Markdown.
        "",
        escape_md(status),
    ]
    fallback_lines = [
        "Route",
        f"Start: {start_text or 'not set'}",
        f"End: {end_text or 'not set'}",
        status,
    ]
    if awaiting:
        prompt = "✏️ " + STOP_PROMPT.format(awaiting)
        lines += ["", escape_md(prompt)]
        fallback_lines.append(prompt)
    rich = {"markdown": "\n".join(lines), "fallback": "\n".join(fallback_lines)}

    fav_bus_nos = {row["service_no"] for row in list_favourite_buses(chat_id)}
    services = pin_favourites(services, fav_bus_nos, get_pref(chat_id, "bus"))
    page_items, page, total_pages = paginate(services, page, GRID_PAGE_SIZE)

    # Both ends ride along on every button, along with the page of buses being looked at,
    # so any of them can redraw the panel exactly as it stands.
    base = {
        **({"start": start_code} if start_code else {}),
        **({"end": end_code} if end_code else {}),
        **({"page": page} if page else {}),
        **({"from_fav": from_fav} if from_fav is not None else {}),
    }
    buttons = [
        [
            Button.inline(
                _setter_label("🅰", "start", start_code, awaiting == "start"),
                make_button("route_set", {**base, "field": "start"}),
            ),
            Button.inline(
                _setter_label("🅱", "end", end_code, awaiting == "end"),
                make_button("route_set", {**base, "field": "end"}),
            ),
        ]
    ]

    if start_code and end_code:
        favourited = is_favourite_route(chat_id, start_code, end_code)
        buttons.append(
            [
                Button.inline(
                    "⭐ Remove favourite" if favourited else "⭐ Add favourite",
                    make_button("route_fav", base),
                )
            ]
        )

    # Tapping a bus opens the start stop's timings narrowed to it - the ordinary
    # single-service view, with the buttons it always carries, plus this panel as the way
    # back so another bus on the route is one tap away.
    buttons += [
        [
            Button.inline(
                bus_button_label(service_no, is_favourite=service_no in fav_bus_nos),
                make_button("stop", {"code": start_code, "bus_no": service_no, "route": base}),
            )
            for service_no in page_items[row : row + GRID_COLUMNS]
        ]
        for row in range(0, len(page_items), GRID_COLUMNS)
    ]
    buttons += nav_row("route_view", base, page, total_pages)
    if from_fav is not None:
        buttons.append(
            [Button.inline("🔙 Back to favourite routes", make_button("favroute_page", {"page": from_fav}))]
        )
    return rich, buttons
