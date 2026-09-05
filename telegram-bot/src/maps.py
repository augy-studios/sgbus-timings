from urllib.parse import quote

from telethon import Button

from .user_settings import DEFAULT_MAP_APP, get_map_app

# The map apps a Navigate button can open, in the order /settings offers them.
MAP_APPS = [
    {"id": "google", "label": "Google Maps", "button": "🗺 Google Maps"},
    {"id": "citymapper", "label": "Citymapper", "button": "🚇 Citymapper"},
]
MAP_APP_LABELS = {app["id"]: app["label"] for app in MAP_APPS}


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


def navigate_button(stop, chat_id) -> "Button | None":
    """The Navigate button every bus stop's timings carry, pointed at the map app the user
    picked in /settings. None when the stop has no coordinates to navigate to."""
    app = get_map_app(chat_id) if chat_id is not None else DEFAULT_MAP_APP
    url = directions_url(stop, app)
    return Button.url("🧭 Navigate", url) if url else None
