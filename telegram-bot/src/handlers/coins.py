"""/coins (the uwuCoins wheel), /achievements (the feats), and /team (team runs), with their
buttons: coins_view.py, team_view.py, teams.py."""

import re

from telethon import events

from .. import coins, coins_view, team_view, teams
from ..bot_api import BotApiError
from ..user_settings import get_display_name

TEAM_ID_RE = re.compile(r"^[a-z0-9]{10}$")
PRIVATE_ONLY = "uwuCoins and team runs work in your own chat with the bot."
TEAM_HELP = ("👥 Team runs: the feats speedrun together, up to eight of you, on phones and in Telegram.\n\n"
             "• /team Night Owls starts one called Night Owls\n"
             "• /team abcde12345 joins one by its code, as does a team link\n\n"
             "Rides and trips any of you take (from /nav, with your location shared) count for all of you, "
             "and each of you gets every feat the team does, with its uwuCoins.")


async def _name(event) -> str:
    sender = await event.get_sender()
    return get_display_name(event.sender_id, getattr(sender, "first_name", None) or "")


async def join_team(client, event, team_id: str) -> None:
    """/team <code> or t.me/<bot>?start=team_<code>."""
    if not event.is_private:
        await event.respond(PRIVATE_ONLY)
        return
    try:
        made = await teams.join(event.chat_id, team_id, await _name(event))
    except teams.TeamError as err:
        await event.respond(f"⚠️ {err}")
        return
    if not made.get("again"):
        await event.respond(f"👥 You've joined {made['name']}. Rides and trips you take from now count for the whole team.")
    await team_view.show(event.chat_id)
    await team_view.refresh(team_id, client)


async def handle_coin_callback(client, event, action: str, payload: dict) -> None:
    if action == "coin_spin":
        try:
            got = await coins_view.spin(event.chat_id)
        except coins.CoinError as err:
            await event.answer(str(err), alert=True)
            return
        except BotApiError as err:
            print(f"[coins] spin for {event.chat_id}: {err}")
            await event.answer("Couldn't turn the wheel just now.", alert=True)
            return
        await event.answer(f"🎡 {got['text']}")
        if got["link"]:
            await client.send_message(event.chat_id, coins_view.egg_message(got["link"]), link_preview=False)
        return
    if action == "coin_history":
        await event.answer()
        await client.send_message(event.chat_id, coins_view.history(event.chat_id))
        return
    if action == "coin_feats":
        await event.answer()
        await client.send_message(event.chat_id, coins_view.achievements(event.chat_id))
        return
    if action == "team_refresh":
        try:
            await team_view.refresh(payload["id"], client)
        except teams.TeamError as err:
            await event.answer(str(err)[:190], alert=True)
            return
        await event.answer("Up to date")
        return
    if action == "team_leave":
        me = teams.mine(event.chat_id)
        if not me or me["team_id"] != payload.get("id"):
            await event.answer("You're not in this team run any more.")
            return
        name = await teams.leave(event.chat_id)
        await team_view.drop(payload["id"], chat_id=event.chat_id)
        await event.answer(f"You've left {name}")
        return
    await event.answer()


def register_coins(client):
    @client.on(events.NewMessage(pattern=r"^/coins(@\w+)?$"))
    async def coins_cmd(event):
        if not event.is_private:
            await event.respond(PRIVATE_ONLY)
            return
        try:
            await coins_view.send_wheel(event.chat_id)
        except BotApiError as err:
            print(f"[coins] wheel for {event.chat_id}: {err}")
            await event.respond(f"🪙 You have {coins.balance(event.chat_id)} uwuCoins. The wheel needs an up-to-date Telegram app.")

    @client.on(events.NewMessage(pattern=r"^/achievements(@\w+)?$"))
    async def feats_cmd(event):
        await event.respond(coins_view.achievements(event.chat_id))

    @client.on(events.NewMessage(pattern=r"^/team(@\w+)?(\s+(.+))?$"))
    async def team_cmd(event):
        if not event.is_private:
            await event.respond(PRIVATE_ONLY)
            return
        arg = (event.pattern_match.group(3) or "").strip()
        code = arg.lower().rsplit("/", 1)[-1].replace("team_", "")
        if arg and TEAM_ID_RE.match(code):
            await join_team(client, event, code)
            return
        if arg:
            try:
                made = await teams.create(event.chat_id, arg[:30], await _name(event))
            except teams.TeamError as err:
                await event.respond(f"⚠️ {err}")
                return
            await event.respond(f"👥 {made['name']} is on. Invite your team with the button under it: up to eight of you.")
            await team_view.show(event.chat_id)
            return
        try:
            shown = await team_view.show(event.chat_id)
        except teams.TeamError as err:
            if err.status == 404:
                teams.forget(event.chat_id)
                shown = False
            else:
                await event.respond(f"⚠️ {err}")
                return
        if not shown:
            await event.respond(TEAM_HELP)
