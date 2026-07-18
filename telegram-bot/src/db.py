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

    CREATE TABLE IF NOT EXISTS favourite_buses (
        chat_id INTEGER NOT NULL,
        service_no TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, service_no)
    );

    CREATE TABLE IF NOT EXISTS bus_services (
        service_no TEXT PRIMARY KEY,
        operator TEXT
    );

    CREATE TABLE IF NOT EXISTS bus_routes (
        service_no TEXT NOT NULL,
        direction INTEGER NOT NULL DEFAULT 1,
        stop_sequence INTEGER NOT NULL DEFAULT 0,
        stop_code TEXT NOT NULL,
        wd_first TEXT,
        wd_last TEXT,
        sat_first TEXT,
        sat_last TEXT,
        sun_first TEXT,
        sun_last TEXT,
        PRIMARY KEY (service_no, direction, stop_code)
    );

    CREATE TABLE IF NOT EXISTS favourite_prefs (
        chat_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        position TEXT NOT NULL DEFAULT 'top',
        PRIMARY KEY (chat_id, kind)
    );

    CREATE TABLE IF NOT EXISTS user_flows (
        chat_id INTEGER PRIMARY KEY,
        flow TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
        chat_id INTEGER PRIMARY KEY,
        display_name TEXT
    );

    CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        days TEXT NOT NULL,
        stop_code TEXT NOT NULL,
        stop_name TEXT NOT NULL,
        last_fired_key TEXT,
        created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_drafts (
        chat_id INTEGER PRIMARY KEY,
        routine_id INTEGER,
        step TEXT NOT NULL,
        hour INTEGER,
        minute INTEGER,
        days TEXT,
        updated_at INTEGER NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_bus_routes_stop_code ON bus_routes(stop_code);
    CREATE INDEX IF NOT EXISTS idx_routines_chat_id ON routines(chat_id);
    """
)

_bus_routes_columns = {row["name"] for row in db.execute("PRAGMA table_info(bus_routes)").fetchall()}
if "stop_sequence" not in _bus_routes_columns or "wd_first" not in _bus_routes_columns:
    with db:
        db.execute("DROP TABLE bus_routes")
        db.execute(
            """
            CREATE TABLE bus_routes (
                service_no TEXT NOT NULL,
                direction INTEGER NOT NULL DEFAULT 1,
                stop_sequence INTEGER NOT NULL DEFAULT 0,
                stop_code TEXT NOT NULL,
                wd_first TEXT,
                wd_last TEXT,
                sat_first TEXT,
                sat_last TEXT,
                sun_first TEXT,
                sun_last TEXT,
                PRIMARY KEY (service_no, direction, stop_code)
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_bus_routes_stop_code ON bus_routes(stop_code)")

db.commit()
