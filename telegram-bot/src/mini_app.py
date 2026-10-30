from typing import Optional

from telethon import Button, types
from telethon.tl import functions

from .config import config

# The web app (main-site/) opened inside Telegram as a Mini App: from the chat's menu button,
# from /start's Open web app button, and, with MINI_APP_LINKS on, from the Live map buttons.
# The site notices it's inside Telegram on its own (main-site/js/telegram.js), so it's the
# same address as in a browser.

# Set by setup_mini_app() as the bot starts, for the t.me links below.
_username: Optional[str] = None


def mini_app_url(hash_path: str = "") -> str:
    """The Mini App's address, opened at one of the site's #... pages (script.js's router)."""
    base = config.mini_app_url.rstrip("/") + "/"
    return base + (f"#{hash_path}" if hash_path else "")


def mini_app_link(start_param: str) -> Optional[str]:
    """A t.me link that opens the bot's Main Mini App at a page, from any chat, inline
    messages included. The page is a start parameter, which may only hold letters, digits,
    "_" and "-": the site reads "-" as "/" and "_" as "," (STARTAPP in js/telegram.js), so
    "map-84009" opens #map/84009. None unless MINI_APP_LINKS is on, since the link only works
    once the Main Mini App is set up in BotFather (SETUP.md)."""
    if not config.mini_app_links or not _username:
        return None
    return f"https://t.me/{_username}?startapp={start_param}"


def open_button(text: str, hash_path: str = "", private: bool = True):
    """A button that opens the web app at a page: as a Mini App in a private chat, where
    Telegram allows one on a message, and as a plain link anywhere else."""
    url = mini_app_url(hash_path)
    if not private:
        return Button.url(text, url)
    return types.KeyboardButtonWebView(text=text, url=url)


async def setup_mini_app(client) -> None:
    """Remembers the bot's username for mini_app_link() and points the chat's menu button,
    for every user, at the Mini App, or back at the command list with MINI_APP_MENU_TEXT
    left blank. Done on every start, so it follows .env rather than what BotFather last set."""
    global _username
    me = await client.get_me()
    _username = me.username

    if config.mini_app_menu_text:
        button = types.BotMenuButton(text=config.mini_app_menu_text, url=mini_app_url())
    else:
        button = types.BotMenuButtonCommands()
    try:
        await client(functions.bots.SetBotMenuButtonRequest(user_id=types.InputUserEmpty(), button=button))
    except Exception as err:
        print(f"[mini_app] couldn't set the menu button: {err}")
