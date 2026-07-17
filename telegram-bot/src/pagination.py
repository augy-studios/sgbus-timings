import math

from telethon import Button

from .buttons import make_button

PAGE_SIZE = 8


def paginate(items: list, page: int, size: int = PAGE_SIZE):
    """Clamps `page` into range and slices `items` for that page.
    Returns (page_items, page, total_pages)."""
    total_pages = max(1, math.ceil(len(items) / size))
    page = max(0, min(page, total_pages - 1))
    start = page * size
    return items[start : start + size], page, total_pages


def nav_row(action: str, payload_base: dict, page: int, total_pages: int) -> list:
    """Builds a single button row with Prev/page-count/Next, using the given
    action + payload_base (page number is merged in) for each button's callback_data.
    Returns [] if there's only one page."""
    if total_pages <= 1:
        return []

    row = []
    if page > 0:
        row.append(Button.inline("◀ Prev", make_button(action, {**payload_base, "page": page - 1})))
    row.append(Button.inline(f"{page + 1}/{total_pages}", make_button(action, {**payload_base, "page": page})))
    if page < total_pages - 1:
        row.append(Button.inline("Next ▶", make_button(action, {**payload_base, "page": page + 1})))
    return [row]
