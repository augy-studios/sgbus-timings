"""A trip's live widget (Bot API 10.4 widgets): its HTML, and its state from the trip's live
ETA link (the site's api/_lib/share-links.js, kind eta).

The widget's code is trip_widget.html, sent once per trip as a shared widget, so the person on
the trip and everyone following it see one widget, updated for all of them at once
(bot_trips.py). Its shared state is the trip's progress, packed small: a widget's state is at
most 1024 bytes. Chat state {"o":1} marks the message of the person on the trip."""

import json
import re
import zlib
from pathlib import Path

# A widget's HTML: at most 32768 bytes, and 4096 once compressed as Telegram counts it.
HTML_LIMIT = 32768
COMPRESSED_LIMIT = 4096
DATA_LIMIT = 1024

KINDS = {"bus": "b", "train": "t", "walk": "w"}

_SOURCE = Path(__file__).with_name("trip_widget.html")


def widget_html() -> str:
    """trip_widget.html as sent: without its comments or each line's indent."""
    text = re.sub(r"<!--.*?-->", "", _SOURCE.read_text(encoding="utf-8"), flags=re.S)
    return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def compressed_size(html: str) -> int:
    return len(zlib.compress(html.encode("utf-8"), 9))


def _cut(s, n: int) -> str:
    s = str(s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _dump(d: dict) -> str:
    return json.dumps(d, ensure_ascii=False, separators=(",", ":"))


def public_data(eta: dict, rev: int, updated_ms: int, parts: "list | None" = None, gone: bool = False) -> str:
    """The widget's shared state from an ETA link's data, at most DATA_LIMIT bytes:

    r   revision, raised on every change, so the widget never goes back to an older one
    n   the sharer's name, t where they're going, a their arrival (unix seconds)
    i   the part they're on, c how many parts, k l d s that part's kind, label, end and stops left
    p   the parts as [kind, label, end] from part o on, as far as they're known
    u   when the link was last updated (unix seconds)
    e   1 once they've arrived, x 1 once they stopped sharing, 2 once the link's gone

    `parts` are the bot's own trip's parts ({kind, label, to}), all of them; for a link the
    web app shares, its timeline has the parts from the current one on."""
    leg = eta.get("leg") or {}
    i = int(eta.get("legIndex") or 0)
    d = {
        "r": rev,
        "n": _cut(eta.get("name"), 32),
        "t": _cut((eta.get("to") or {}).get("label"), 60),
        "a": round((eta.get("arriveAt") or updated_ms) / 1000),
        "i": i,
        "c": max(1, int(eta.get("legCount") or 1)),
        "k": KINDS.get(leg.get("kind"), "b"),
        "l": _cut(leg.get("label"), 30),
        "d": _cut(leg.get("to"), 60),
        "s": leg.get("stopsLeft"),
        # To the minute, as the widget shows it: an update a few seconds on is no change.
        "u": updated_ms // 60000 * 60,
    }
    if parts:
        d["o"], src = 0, [(p.get("kind"), p.get("label"), p.get("to")) for p in parts]
    else:
        tl = (eta.get("timeline") or {}).get("legs") or []
        d["o"], src = i, [(p.get("kind"), p.get("label"), p.get("to")) for p in tl]
    if eta.get("ended"):
        d["e"] = 1
    if gone:
        d["x"] = 2
    elif eta.get("stopped"):
        d["x"] = 1
    # The parts as long as they fit: their ends shortened first, then left off, then fewer of them.
    for end_len in (60, 36, 20, 0):
        d["p"] = [[KINDS.get(k, "b"), _cut(l, 30), _cut(t, end_len) if end_len else ""] for k, l, t in src[:12]]
        if len(_dump(d).encode("utf-8")) <= DATA_LIMIT:
            return _dump(d)
    while d["p"] and len(_dump(d).encode("utf-8")) > DATA_LIMIT:
        d["p"].pop()
    out = _dump(d)
    if len(out.encode("utf-8")) > DATA_LIMIT:
        d.pop("p")
        d["d"], d["t"] = _cut(d["d"], 24), _cut(d["t"], 24)
        out = _dump(d)
    return out


OWNER_CHAT_DATA = _dump({"o": 1})


def caption(eta: dict, own: bool) -> str:
    """The widget's caption: what the chat list, notifications and apps without widgets show."""
    to = (eta.get("to") or {}).get("label") or "their stop"
    if own:
        return f"🧭 Your trip to {to}, live. Share it from the button below."
    name = (eta.get("name") or "").strip()
    return f"🧭 {name + '’s' if name else 'A shared'} trip to {to}, live."
