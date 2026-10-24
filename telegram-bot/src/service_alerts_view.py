"""Messages and buttons for Service Alerts: /alerts, the /sub reply, and the updates sent
to subscribers. The train alert summary is a port of addAlerts() in sgmrt-alerts'
telegram-bot/src/format.js."""

from collections import Counter
from datetime import datetime
from zoneinfo import ZoneInfo

from telethon import Button

from .buttons import make_button
from .format import escape_md
from .mrt_stations import line_label, station_name
from .notices import changes_service, coming, day_text, news, source_name, when_text
from .service_alerts import is_blocking, is_disrupted, train_parts

# Telegram caps a message at 4096 characters; LTA's incident messages run to about 100.
_MAX_INCIDENTS = 15


class _Doc:
    """A rich message as two parallel renderings: rich Markdown for current clients, and
    plain text with the same information as the fallback. Methods take raw text."""

    def __init__(self):
        self.md: list[str] = []
        self.plain: list[str] = []

    def heading(self, level: int, text: str):
        self.md.append(f"{'#' * level} {escape_md(text)}")
        self.plain.append(text)
        return self

    def text(self, raw: str):
        return self.line(escape_md(raw), raw)

    def line(self, md: str, plain: str):
        self.md.append(md)
        self.plain.append(plain)
        return self

    def blank(self):
        for lines in (self.md, self.plain):
            if lines and lines[-1] != "":
                lines.append("")
        return self

    def bullets(self, items: list):
        for item in items:
            self.line(f"- {escape_md(item)}", f"• {item}")
        return self

    def table(self, headers: list, rows: list):
        def cell(v):
            return escape_md(str(v).replace("\n", " "))

        self.blank()
        self.md.append("| " + " | ".join(cell(h) for h in headers) + " |")
        self.md.append("| " + " | ".join("---" for _ in headers) + " |")
        for row in rows:
            self.md.append("| " + " | ".join(cell(v) for v in row) + " |")
            self.plain.append(" · ".join(str(v) for v in row if v not in ("", "-")))
        return self.blank()

    def build(self) -> dict:
        return {"markdown": "\n".join(self.md).strip(), "fallback": "\n".join(self.plain).strip()}


def _split(value) -> list[str]:
    return [s.strip() for s in str(value).split(",") if s.strip()] if value else []


def _station_label(code: str) -> str:
    name = station_name(code)
    return f"{name} ({code})" if name else code


def _add_train(doc: _Doc, value: dict, level: int) -> None:
    status, segments, notices = train_parts(value)

    if not is_disrupted(status, segments):
        doc.heading(level, "✅ All train services are operating normally").text("No disruptions reported.")
    else:
        doc.heading(level, f"⚠️ {len(segments)} line(s) with disruption(s)")
        rows = []
        for seg in segments:
            try:
                disrupted = int(seg.get("Status") or status) > 1
            except (TypeError, ValueError):
                disrupted = status > 1
            stations = ", ".join(_station_label(s) for s in _split(seg.get("Stations")))
            rows.append(
                [
                    line_label(seg.get("Line") or "?"),
                    "🔴 Disrupted" if disrupted else "🟡 Minor delay",
                    seg.get("Direction") or "-",
                    stations or "-",
                ]
            )
        doc.table(["Line", "Status", "Direction", "Affected stations"], rows)

        for seg in segments:
            free_bus = _split(seg.get("FreePublicBus"))
            shuttle = _split(seg.get("FreeMRTShuttle"))
            if not free_bus and not shuttle:
                continue
            doc.heading(level + 1, f"{line_label(seg.get('Line') or '?')} alternatives")
            items = []
            if free_bus:
                items.append("Free bus at: " + ", ".join(_station_label(s) for s in free_bus))
            if shuttle:
                direction = f" ({seg['MRTShuttleDirection']})" if seg.get("MRTShuttleDirection") else ""
                items.append("Free shuttle: " + ", ".join(_station_label(s) for s in shuttle) + direction)
            doc.bullets(items)

    if notices:
        doc.blank().heading(level + 1, "Service notices").bullets(
            [str(n.get("Content") or "").strip() for n in notices if n.get("Content")]
        )


def _add_incident_list(doc: _Doc, incidents: list) -> None:
    doc.bullets([i["message"] for i in incidents[:_MAX_INCIDENTS]])
    if len(incidents) > _MAX_INCIDENTS:
        doc.text(f"...and {len(incidents) - _MAX_INCIDENTS} more.")


def _updated(doc: _Doc) -> None:
    stamp = datetime.now(ZoneInfo("Asia/Singapore")).strftime("%H:%M:%S")
    doc.blank().line(f"_Updated {stamp}_", f"Updated {stamp}")


def _add_newsfeed(doc: _Doc, notices: "dict | None") -> None:
    """The newsfeed's coming notices and the operators' latest news."""
    doc.blank().heading(2, "📰 Newsfeed")
    # Nothing read yet (`at` null) isn't nothing announced.
    if notices is None or not notices.get("at"):
        doc.text("Couldn't get the newsfeed just now. Try Refresh in a minute.")
        return
    items, sources = notices.get("items") or [], notices.get("sources") or {}
    soon = coming(items)
    if soon:
        doc.text("Today and the next two weeks:")
        for n in soon[:10]:
            buses = n.get("services") or []
            bus_text = f" Buses {', '.join(buses[:12])}{' and more' if len(buses) > 12 else ''}." if buses else ""
            doc.line(f"- [{escape_md(n['title'])}]({n['url']}): {escape_md(when_text(n))}.{escape_md(bus_text)}",
                     f"• {n['title']}: {when_text(n)}.{bus_text} {n['url']}")
    else:
        doc.text("No bus or train changes announced for the next two weeks.")
    latest = news(items)
    if latest:
        doc.blank().text("From the operators:")
        for n in latest:
            when = day_text(n["published"]) if n.get("published") else ""
            doc.line(f"- {escape_md(when)} · {escape_md(source_name(n, sources))}: [{escape_md(n['title'])}]({n['url']})",
                     f"• {when} · {source_name(n, sources)}: {n['title']} {n['url']}")


def format_newsfeed_update(items: list, sources: dict) -> dict:
    """What a chat with the newsfeed on is sent: the new notices."""
    doc = _Doc().heading(1, f"📰 Newsfeed: {len(items)} new notice{'s' if len(items) > 1 else ''}" if len(items) > 1 else "📰 Newsfeed").blank()
    for n in items[:10]:
        dates = f" ({n['dates']})" if n.get("dates") else ""
        doc.line(f"- {escape_md(source_name(n, sources))}: [{escape_md(n['title'])}]({n['url']}){escape_md(dates)}",
                 f"• {source_name(n, sources)}: {n['title']}{dates} {n['url']}")
    doc.blank().text("Send /alerts for what's coming up, or /sub to change what you get.")
    return doc.build()


def format_alerts_now(train_value, incidents, notices=None) -> dict:
    """/alerts: everything happening right now, and the newsfeed. Any argument is None when
    it couldn't be reached."""
    doc = _Doc().heading(1, "🔔 Service Alerts").blank()

    doc.heading(2, "🚆 Trains")
    if train_value is None:
        doc.text("Couldn't reach LTA for train alerts. Try Refresh in a minute.")
    else:
        _add_train(doc, train_value, 3)

    doc.blank().heading(2, "🚧 Roads")
    if incidents is None:
        doc.text("Couldn't reach LTA for traffic incidents. Try Refresh in a minute.")
    elif not incidents:
        doc.text("No traffic incidents reported.")
    else:
        blocking = [i for i in incidents if is_blocking(i)]
        others = Counter(i["type"] for i in incidents if not is_blocking(i))
        doc.text(
            f"{len(incidents)} traffic incident(s) reported across Singapore, "
            f"{len(blocking)} of them able to block or reroute a bus."
        )
        if blocking:
            doc.blank()
            _add_incident_list(doc, blocking)
        if others:
            summary = ", ".join(f"{n} {kind.lower()}" for kind, n in others.most_common())
            doc.blank().text(f"Also reported: {summary}.")

    _add_newsfeed(doc, notices)
    _updated(doc)
    return doc.build()


def format_alert_update(train_value, incidents: list) -> dict:
    """What a subscriber is sent: the train update, the new incidents, or both."""
    doc = _Doc().heading(1, "🔔 Service Alerts").blank()
    if train_value is not None:
        doc.heading(2, "🚆 Train service update")
        _add_train(doc, train_value, 3)
    if incidents:
        doc.blank().heading(2, f"🚧 New traffic incident{'s' if len(incidents) > 1 else ''}")
        _add_incident_list(doc, incidents)
    doc.blank().text("Send /alerts for everything happening now, or /unsub to stop these.")
    return doc.build()


_TRAIN_TEXT = {
    "all": "every change to MRT and LRT services, including service notices",
    "disruptions": "train disruptions starting, changing or clearing",
}
_TRAFFIC_TEXT = {
    "all": "every new traffic incident reported on Singapore's roads",
    "disruptions": "accidents, breakdowns, road blocks, diversions and other incidents that can block a bus",
}

_NEWSFEED_TEXT = {
    "all": "every new notice and piece of news from LTA and the bus and train operators",
    "disruptions": "new notices that change a bus or train service",
}

MODE_LABELS = {"all": "All updates", "disruptions": "Disruptions only", "off": "Off"}
NEWSFEED_LABELS = {"all": "All news", "disruptions": "Service changes only", "off": "Off"}


def format_subscription(modes: "dict | None") -> str:
    """Plain-text reply for /sub and the buttons under it. `modes` is None once both kinds
    are off, which unsubscribes."""
    if not modes:
        return (
            "🔕 Every kind is off, so you're unsubscribed from Service Alerts.\n\n"
            "Tap a button below to turn one back on."
        )
    newsfeed = modes.get("newsfeed", "off")
    parts = [t for t in (_TRAIN_TEXT.get(modes["train"]), _TRAFFIC_TEXT.get(modes["traffic"]), _NEWSFEED_TEXT.get(newsfeed)) if t]
    return (
        f"🔔 Subscribed to Service Alerts. You'll get an update here for {', and for '.join(parts)}.\n\n"
        f"🚆 Trains: {MODE_LABELS[modes['train']]}\n"
        f"🚧 Traffic: {MODE_LABELS[modes['traffic']]}\n"
        f"📰 Newsfeed: {NEWSFEED_LABELS[newsfeed]}\n\n"
        "Pick for each below. Send /unsub to stop them all."
    )


def sub_mode_buttons(modes: "dict | None") -> list:
    """Three rows under the /sub reply, trains, traffic and the newsfeed, the choice in force
    ticked."""
    modes = {"train": "off", "traffic": "off", "newsfeed": "off", **(modes or {})}

    def row(kind, icon, middle="Disruptions"):
        def label(value, text):
            return f"{'✅' if modes[kind] == value else ''}{icon} {text}"

        return [
            Button.inline(label("all", "All"), make_button("alerts_mode", {"kind": kind, "mode": "all"})),
            Button.inline(label("disruptions", middle), make_button("alerts_mode", {"kind": kind, "mode": "disruptions"})),
            Button.inline(label("off", "Off"), make_button("alerts_mode", {"kind": kind, "mode": "off"})),
        ]

    return [row("train", "🚆"), row("traffic", "🚧"), row("newsfeed", "📰", "Changes")]


def alerts_buttons() -> list:
    return [[Button.inline("🔄 Refresh", make_button("alerts_refresh", {}))]]

