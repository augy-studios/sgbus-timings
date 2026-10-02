"""Service Alerts: train service alerts and traffic incidents, sent to subscribers as they
change. A port of sgmrt-alerts' /sub feature (telegram-bot/src/subscriptions.js and
scheduler.js), with LTA's traffic incidents alongside the train alerts.

main-site/api/_push/alerts.js applies the same rules for the web app's notifications; keep the
two in step.
"""

import hashlib
import json
import time

from .db import db

# 'all': every train status change and every new traffic incident. 'disruptions': train
# updates only while a disruption is active (plus the one when it clears), and only the
# incidents that can stop or reroute a bus.
MODES = ("all", "disruptions")

# LTA incident types, lowercased, that can stop or reroute a bus. The rest (heavy
# traffic, roadworks, weather, unattended vehicles and so on) are "All updates" only.
BLOCKING_TYPES = {
    "accident",
    "vehicle breakdown",
    "road block",
    "diversion",
    "obstacle",
    "fire",
    "plant failure",
}

# An incident LTA drops and lists again inside this window is not announced twice.
_SEEN_FOR_MS = 6 * 60 * 60 * 1000


def _now_ms() -> int:
    return int(time.time() * 1000)


def _int(value, default=1) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _hash(value) -> str:
    return hashlib.sha1(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


# ---------- the rules ----------


def is_blocking(incident: dict) -> bool:
    return incident["type"].strip().lower() in BLOCKING_TYPES


def is_disrupted(status: int, segments: list) -> bool:
    return status > 1 or len(segments) > 0


def train_parts(value: dict) -> tuple[int, list, list]:
    """(status, affected segments, service notices) out of a TrainServiceAlerts value."""
    value = value or {}
    status = _int(value.get("Status")) or 1
    segments = value.get("AffectedSegments") if isinstance(value.get("AffectedSegments"), list) else []
    notices = value.get("Message") if isinstance(value.get("Message"), list) else []
    return status, segments, notices


def incident_key(incident: dict) -> str:
    return f"{incident['type']}|{incident['message']}"


def update_for(mode: str, train_update: "dict | None", new_incidents: list) -> tuple["dict | None", list]:
    """What one subscriber hears of this poll: the train update, if their mode wants it,
    and the new incidents their mode covers."""
    train = train_update if train_update and (mode == "all" or train_update["disruption"]) else None
    incidents = new_incidents if mode == "all" else [i for i in new_incidents if is_blocking(i)]
    return train, incidents


# ---------- subscriptions ----------


def get_mode(chat_id: int) -> "str | None":
    """The chat's mode, or None if it isn't subscribed."""
    row = db.execute("SELECT mode FROM service_alert_subs WHERE chat_id = ?", (chat_id,)).fetchone()
    return row["mode"] if row else None


def subscribe(chat_id: int) -> None:
    """Subscribes if needed, keeping an existing subscriber's mode."""
    with db:
        db.execute(
            "INSERT INTO service_alert_subs (chat_id, created_at) VALUES (?, ?) ON CONFLICT(chat_id) DO NOTHING",
            (chat_id, _now_ms()),
        )


def set_mode(chat_id: int, mode: str) -> None:
    """Subscribes if needed and sets the mode."""
    if mode not in MODES:
        raise ValueError(f"unknown Service Alerts mode: {mode}")
    with db:
        db.execute(
            """
            INSERT INTO service_alert_subs (chat_id, mode, created_at) VALUES (?, ?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET mode = excluded.mode
            """,
            (chat_id, mode, _now_ms()),
        )


def unsubscribe(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM service_alert_subs WHERE chat_id = ?", (chat_id,))


def list_subscribers() -> list:
    return db.execute("SELECT chat_id, mode FROM service_alert_subs").fetchall()


# ---------- what changed since the last poll ----------


def _get_state(feed: str) -> "dict | None":
    row = db.execute("SELECT state FROM service_alert_state WHERE feed = ?", (feed,)).fetchone()
    return json.loads(row["state"]) if row else None


def _set_state(feed: str, state: dict) -> None:
    with db:
        db.execute(
            """
            INSERT INTO service_alert_state (feed, state, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(feed) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
            """,
            (feed, json.dumps(state), _now_ms()),
        )


def diff_train(value: dict) -> "dict | None":
    """Records the train alerts and returns the update to announce, or None when nothing
    changed. The first poll after a fresh install only records a baseline: otherwise
    every restart would re-announce whatever the status happens to be."""
    status, segments, notices = train_parts(value)
    state = {"status": status, "segments_hash": _hash(segments), "notices_hash": _hash(notices)}
    prev = _get_state("train")
    if prev == state:
        return None
    _set_state("train", state)
    if prev is None:
        return None
    # "Disruptions only" hears the update if a disruption is active either side of the
    # change, so it also hears when one clears, but skips notice-only changes while
    # service is normal.
    was_disrupted = prev["status"] > 1 or prev["segments_hash"] != _hash([])
    return {"value": value, "disruption": was_disrupted or is_disrupted(status, segments)}


def diff_traffic(incidents: list) -> list:
    """Records the incidents and returns the ones not seen in the last few hours. Empty on
    the first poll, which only records a baseline."""
    now = _now_ms()
    prev = _get_state("traffic")
    seen = {k: t for k, t in (prev or {}).get("seen", {}).items() if now - t < _SEEN_FOR_MS}

    new = []
    for incident in incidents:
        key = incident_key(incident)
        if prev is not None and key not in seen:
            new.append(incident)
        seen[key] = now

    _set_state("traffic", {"seen": seen})
    return new
