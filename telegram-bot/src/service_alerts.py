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

# Train service alerts and traffic alerts are chosen separately, each one of:
# 'all': every train status change / every new traffic incident.
# 'disruptions': train updates only while a disruption is active (plus the one when it
# clears) / only the incidents that can stop or reroute a bus.
# 'off': none of that kind.
MODES = ("all", "disruptions", "off")
KINDS = ("train", "traffic")

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


def update_for(modes: dict, train_update: "dict | None", new_incidents: list) -> tuple["dict | None", list]:
    """What one subscriber hears of this poll, given their {"train", "traffic"} modes: the
    train update if their train mode wants it, and the new incidents their traffic mode covers."""
    train_mode, traffic_mode = modes["train"], modes["traffic"]
    train = (
        train_update
        if train_update and (train_mode == "all" or (train_mode == "disruptions" and train_update["disruption"]))
        else None
    )
    if traffic_mode == "all":
        incidents = new_incidents
    elif traffic_mode == "disruptions":
        incidents = [i for i in new_incidents if is_blocking(i)]
    else:
        incidents = []
    return train, incidents


# ---------- subscriptions ----------


def get_modes(chat_id: int) -> "dict | None":
    """The chat's {"train", "traffic"} modes, or None if it isn't subscribed."""
    row = db.execute(
        "SELECT train_mode, traffic_mode FROM service_alert_subs WHERE chat_id = ?", (chat_id,)
    ).fetchone()
    return {"train": row["train_mode"], "traffic": row["traffic_mode"]} if row else None


def subscribe(chat_id: int) -> None:
    """Subscribes if needed, to all of both kinds, keeping an existing subscriber's modes."""
    with db:
        db.execute(
            "INSERT INTO service_alert_subs (chat_id, created_at) VALUES (?, ?) ON CONFLICT(chat_id) DO NOTHING",
            (chat_id, _now_ms()),
        )


def set_mode(chat_id: int, kind: str, mode: str) -> "dict | None":
    """Subscribes if needed and sets one kind's mode. Turning the last kind off
    unsubscribes. Returns the modes now in force, or None once unsubscribed."""
    if kind not in KINDS or mode not in MODES:
        raise ValueError(f"unknown Service Alerts choice: {kind} {mode}")
    subscribe(chat_id)
    with db:
        db.execute(f"UPDATE service_alert_subs SET {kind}_mode = ? WHERE chat_id = ?", (mode, chat_id))
    modes = get_modes(chat_id)
    if modes and modes["train"] == "off" and modes["traffic"] == "off":
        unsubscribe(chat_id)
        return None
    return modes


def unsubscribe(chat_id: int) -> None:
    with db:
        db.execute("DELETE FROM service_alert_subs WHERE chat_id = ?", (chat_id,))


def list_subscribers() -> list:
    return db.execute("SELECT chat_id, train_mode, traffic_mode FROM service_alert_subs").fetchall()


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
