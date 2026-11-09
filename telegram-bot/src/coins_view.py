"""/coins: each chat's uwuCoins wheel, as a widget (coins_widget.html), with Spin under it, and
/achievements, the feats (feats.py). The bot spins (coins.py) and puts the result in the widget's
chat state; the wheel turns onto that slot and counts the balance up."""

import json
import time

from . import bot_api, coins, feats
from .buttons import make_button
from .db import db
from .trip_widget import html_of

SPIN_GAP_MS = 6000


def _buttons() -> list:
    return [
        [(f"🎡 Spin for {coins.SPIN_COST}", make_button("coin_spin"))],
        [("📜 History", make_button("coin_history")), ("🏆 Achievements", make_button("coin_feats"))],
    ]


def _state(rev: int, bal: int, **spun) -> str:
    return json.dumps({"r": rev, "b": bal, "s": -1, **spun}, separators=(",", ":"))


async def send_wheel(chat_id: int) -> None:
    """A new wheel in the chat, with the balance as it is."""
    row = db.execute("SELECT rev FROM coin_widgets WHERE chat_id = ?", (chat_id,)).fetchone()
    rev = (row["rev"] if row else 0) + 1
    msg = await bot_api.send_widget(chat_id, html_of("coins_widget.html"), public_data="", chat_data=_state(rev, coins.balance(chat_id)),
                                    caption="🪙 Your uwuCoins: spin the wheel for an Easter egg or more coins.",
                                    buttons=_buttons(), shared=False)
    with db:
        db.execute("""INSERT INTO coin_widgets (chat_id, message_id, rev) VALUES (?, ?, ?)
                      ON CONFLICT(chat_id) DO UPDATE SET message_id = excluded.message_id, rev = excluded.rev""",
                   (chat_id, msg["message_id"], rev))


async def update_wheel(chat_id: int) -> None:
    """The chat's wheel, if it has one, showing the balance as it is now (coins earned elsewhere)."""
    row = db.execute("SELECT * FROM coin_widgets WHERE chat_id = ?", (chat_id,)).fetchone()
    if not row:
        return
    rev = row["rev"] + 1
    try:
        await bot_api.edit_message_widget_data(chat_id, row["message_id"], _state(rev, coins.balance(chat_id)))
        with db:
            db.execute("UPDATE coin_widgets SET rev = ? WHERE chat_id = ?", (rev, chat_id))
    except bot_api.BotApiError as err:
        print(f"[coins] wheel in {chat_id} not updated: {err}")


async def spin(chat_id: int) -> dict:
    """One spin, shown on the chat's wheel. {"text": what to say, "link": an egg's link or None}.
    coins.CoinError when there's no spin to be had."""
    row = db.execute("SELECT * FROM coin_widgets WHERE chat_id = ?", (chat_id,)).fetchone()
    now = int(time.time() * 1000)
    if row and now - row["spun_at"] < SPIN_GAP_MS:
        raise coins.CoinError("The wheel's still turning.")
    got = await coins.spin(chat_id)
    rev = (row["rev"] if row else 0) + 1
    data = _state(rev, got["after"], f=got["before"], s=got["index"], w=got["coins"], t=now // 1000)
    try:
        if not row:
            raise bot_api.BotApiError("editMessageWidgetData", "no wheel yet")
        await bot_api.edit_message_widget_data(chat_id, row["message_id"], data)
        with db:
            db.execute("UPDATE coin_widgets SET rev = ?, spun_at = ? WHERE chat_id = ?", (rev, now, chat_id))
    except bot_api.BotApiError:
        # The wheel's gone (deleted, or never sent): a new one, turning.
        msg = await bot_api.send_widget(chat_id, html_of("coins_widget.html"), public_data="", chat_data=data,
                                        caption="🪙 Your uwuCoins wheel.", buttons=_buttons(), shared=False)
        with db:
            db.execute("""INSERT INTO coin_widgets (chat_id, message_id, rev, spun_at) VALUES (?, ?, ?, ?)
                          ON CONFLICT(chat_id) DO UPDATE SET message_id = excluded.message_id, rev = excluded.rev, spun_at = excluded.spun_at""",
                       (chat_id, msg["message_id"], rev, now))
    text = f"+{got['coins']} uwuCoins!" if got["coins"] else "An Easter egg!"
    return {"text": text, "link": got["link"]}


def egg_message(link: str) -> str:
    return (f"🥚 You won an Easter egg! Open this link on the SG Bus Timings website or in the Android app to get it:\n{link}\n\n"
            "It works once, on whichever phone opens it first, and doesn't expire. "
            "It's GTA VI's colours while they're on offer, otherwise an Easter egg that phone hasn't found yet.")


def history(chat_id: int) -> str:
    rows = coins.log(chat_id, 15)
    if not rows:
        return "📜 No uwuCoins yet. A trip with a real ride on it earns your first: start one from /nav and share your location."
    lines = [f"📜 Your uwuCoins: {coins.balance(chat_id)}", ""]
    for r in rows:
        what = coins.WORDS.get(r["why"], "uwuCoins")
        info = r["info"]
        if r["why"] == "trip" and info.get("name"):
            what = f"Trip: {info['name']}"
        elif r["why"] == "feat":
            what = f"Feat: {feats.FEATS.get(info.get('feat'), ('', info.get('feat'), ''))[1]}" + (f" (team run {info['team']})" if info.get("team") else "")
        amount = f"+{r['n']}" if r["n"] > 0 else (f"−{-r['n']}" if r["n"] < 0 else "🥚")
        lines.append(f"{amount}  {what}  ({time.strftime('%d %b %H:%M', time.gmtime(r['at'] / 1000 + 8 * 3600))})")
    return "\n".join(lines)


def achievements(chat_id: int) -> str:
    done = feats.done(chat_id)
    have = feats.progress(chat_id)
    lines = [f"🏆 Achievements: {len(done)} of {len(feats.IDS)} feats done, each worth {feats.FEAT_COINS} uwuCoins once.", ""]
    for fid in feats.IDS:
        emoji, name, goal = feats.FEATS[fid]
        if fid in done:
            team = f", with team run {done[fid]['team']}" if done[fid]["team"] else ""
            lines.append(f"{emoji} {name}: ✓ done{team}")
        else:
            h, n = have[fid]
            more = "" if n == 1 else f" ({h} of {n})"
            lines.append(f"{emoji} {name}{more}: {goal}")
    lines += ["", "Rides count when your location shows they were real: start trips from /nav and share your live location."]
    return "\n".join(lines)
