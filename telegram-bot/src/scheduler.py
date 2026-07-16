import asyncio
import time
import traceback

from .db import db

CHECK_INTERVAL_SECONDS = 60

_jobs: list[dict] = []
_task: asyncio.Task | None = None


def register_job(name: str, interval_ms: int, fn) -> None:
    """
    Registers a recurring task. Due-ness is tracked in the `jobs` SQLite table
    (name, interval_ms, last_run) so a restart does not cause the job to fire
    immediately unless it was actually overdue.
    """
    with db:
        db.execute(
            """
            INSERT INTO jobs (name, interval_ms, last_run) VALUES (?, ?, 0)
            ON CONFLICT(name) DO UPDATE SET interval_ms = excluded.interval_ms
            """,
            (name, interval_ms),
        )
    _jobs.append({"name": name, "fn": fn})


async def _run_due_jobs() -> None:
    now = int(time.time() * 1000)
    for job in _jobs:
        row = db.execute("SELECT * FROM jobs WHERE name = ?", (job["name"],)).fetchone()
        if not row:
            continue
        if now - row["last_run"] < row["interval_ms"]:
            continue
        try:
            await job["fn"]()
            with db:
                db.execute(
                    "UPDATE jobs SET last_run = ? WHERE name = ?",
                    (int(time.time() * 1000), job["name"]),
                )
        except Exception:
            print(f'[scheduler] job "{job["name"]}" failed:')
            traceback.print_exc()


async def _loop() -> None:
    while True:
        await _run_due_jobs()
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def start_scheduler() -> None:
    """Starts the scheduler loop. Runs an initial due-check immediately."""
    global _task
    _task = asyncio.get_event_loop().create_task(_loop())


def stop_scheduler() -> None:
    if _task:
        _task.cancel()
