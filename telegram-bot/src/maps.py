from urllib.parse import quote

from telethon import Button

from .buttons import make_button

# The map apps a tapped Navigate button offers, in the order they appear on the row.
MAP_APPS = [
    {"id": "google", "button": "🗺 Google Maps"},
    {"id": "citymapper", "button": "🚇 Citymapper"},
]


def directions_url(stop, app: str) -> "str | None":
    """A deep link opening directions to `stop` in the given map app - the app itself where
    it's installed, its website otherwise. None for a stop with no coordinates cached."""
    lat, lng = stop["lat"], stop["lng"]
    if lat is None or lng is None:
        return None

    if app == "citymapper":
        query = f"endcoord={lat}%2C{lng}&endname={quote(stop['name'] or '')}"
        if stop["road"]:
            query += f"&endaddress={quote(stop['road'])}"
        return f"https://citymapper.com/directions?{query}"

    return f"https://www.google.com/maps/dir/?api=1&destination={lat}%2C{lng}"


def navigate_buttons(stop, origin: dict, opened: bool) -> list:
    """The navigation controls every bus stop's timings carry: a single Navigate button
    until it's tapped, at which point it gives way to one button per map app, each a link
    to directions there. `origin` is the payload that reopens this exact view, so the
    swap can rebuild it with the choice unfolded. Empty for a stop with no coordinates."""
    if stop["lat"] is None or stop["lng"] is None:
        return []
    if not opened:
        return [Button.inline("🧭 Navigate", make_button("navigate", origin))]
    return [Button.url(app["button"], directions_url(stop, app["id"])) for app in MAP_APPS]
