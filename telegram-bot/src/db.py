import sqlite3

from .config import config

config.db_path.parent.mkdir(parents=True, exist_ok=True)

db = sqlite3.connect(config.db_path, check_same_thread=False)
db.row_factory = sqlite3.Row
db.execute("PRAGMA journal_mode = WAL")
db.execute("PRAGMA foreign_keys = ON")

db.executescript(
    """
    CREATE TABLE IF NOT EXISTS bus_stops (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        road TEXT,
        lat REAL,
        lng REAL
    );

    CREATE TABLE IF NOT EXISTS favourites (
        chat_id INTEGER NOT NULL,
        stop_code TEXT NOT NULL,
        stop_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, stop_code)
    );

    CREATE TABLE IF NOT EXISTS buttons (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
        name TEXT PRIMARY KEY,
        interval_ms INTEGER NOT NULL,
        last_run INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_bus_stops_name ON bus_stops(name);
    CREATE INDEX IF NOT EXISTS idx_bus_stops_road ON bus_stops(road);
    """
)
db.commit()
