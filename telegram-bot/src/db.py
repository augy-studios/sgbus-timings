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
        operator TEXT,
        origin_code TEXT,
        destination_code TEXT,
        loop_desc TEXT
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

    CREATE TABLE IF NOT EXISTS favourite_routes (
        chat_id INTEGER NOT NULL,
        start_code TEXT NOT NULL,
        start_name TEXT NOT NULL,
        end_code TEXT NOT NULL,
        end_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, start_code, end_code)
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
        display_name TEXT,
        birthday TEXT,
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
        last_birthday_wish TEXT
    );

    CREATE TABLE IF NOT EXISTS routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        hour INTEGER NOT NULL,
        minute INTEGER NOT NULL,
        days TEXT NOT NULL,
        stop_code TEXT NOT NULL,
        stop_name TEXT NOT NULL,
        services TEXT,
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
        stop_code TEXT,
        stop_name TEXT,
        services TEXT,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS route_drafts (
        chat_id INTEGER PRIMARY KEY,
        field TEXT,
        start_code TEXT,
        end_code TEXT,
        panel_msg_id INTEGER,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS buttons (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );

    -- Service Alerts (/sub), chosen separately for trains and traffic, each 'all',
    -- 'disruptions' (train disruptions / incidents that can block or reroute a bus) or
    -- 'off'. A chat with both off isn't subscribed and has no row.
    CREATE TABLE IF NOT EXISTS service_alert_subs (
        chat_id INTEGER PRIMARY KEY,
        train_mode TEXT NOT NULL DEFAULT 'all',
        traffic_mode TEXT NOT NULL DEFAULT 'all',
        created_at INTEGER NOT NULL
    );

    -- What each feed looked like at the last poll, so only changes are announced.
    CREATE TABLE IF NOT EXISTS service_alert_state (
        feed TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );

    -- /nav: the journey being planned, one per chat. `field` is the end the bot is waiting
    -- to be told, 'from' or 'to'; each end is a place, a label and a position.
    CREATE TABLE IF NOT EXISTS nav_drafts (
        chat_id INTEGER PRIMARY KEY,
        field TEXT,
        from_label TEXT, from_lat REAL, from_lng REAL,
        to_label TEXT, to_lat REAL, to_lng REAL,
        updated_at INTEGER NOT NULL
    );

    -- /mynavs: starred navs. A nav and its reverse are two separate favourites.
    CREATE TABLE IF NOT EXISTS favourite_navs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        from_label TEXT NOT NULL, from_lat REAL NOT NULL, from_lng REAL NOT NULL,
        to_label TEXT NOT NULL, to_lat REAL NOT NULL, to_lng REAL NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_favourite_navs_chat ON favourite_navs(chat_id);

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

_bus_services_columns = {row["name"] for row in db.execute("PRAGMA table_info(bus_services)").fetchall()}
if "origin_code" not in _bus_services_columns:
    # Emptied rather than back-filled, so the startup cache check refetches the whole
    # service list from LTA with the terminal/loop fields included.
    with db:
        db.execute("ALTER TABLE bus_services ADD COLUMN origin_code TEXT")
        db.execute("ALTER TABLE bus_services ADD COLUMN destination_code TEXT")
        db.execute("ALTER TABLE bus_services ADD COLUMN loop_desc TEXT")
        db.execute("DELETE FROM bus_services")

_user_settings_columns ={row["name"] for row in db.execute("PRAGMA table_info(user_settings)").fetchall()}
if "birthday" not in _user_settings_columns:
    with db:
        db.execute("ALTER TABLE user_settings ADD COLUMN birthday TEXT")
if "notifications_enabled" not in _user_settings_columns:
    with db:
        db.execute("ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1")
if "last_birthday_wish" not in _user_settings_columns:
    with db:
        db.execute("ALTER TABLE user_settings ADD COLUMN last_birthday_wish TEXT")

# A routine's `services` is a comma-separated list of the bus numbers it sends; NULL, as
# every routine saved before buses could be picked has, means every bus at the stop.
_routines_columns = {row["name"] for row in db.execute("PRAGMA table_info(routines)").fetchall()}
if "services" not in _routines_columns:
    with db:
        db.execute("ALTER TABLE routines ADD COLUMN services TEXT")

_routine_drafts_columns = {row["name"] for row in db.execute("PRAGMA table_info(routine_drafts)").fetchall()}
if "services" not in _routine_drafts_columns:
    with db:
        db.execute("ALTER TABLE routine_drafts ADD COLUMN stop_code TEXT")
        db.execute("ALTER TABLE routine_drafts ADD COLUMN stop_name TEXT")
        db.execute("ALTER TABLE routine_drafts ADD COLUMN services TEXT")

# Service Alerts used to have one mode for both kinds. A subscriber from then keeps it for
# each, so nobody's alerts change until they pick otherwise.
_alert_columns = {row["name"] for row in db.execute("PRAGMA table_info(service_alert_subs)").fetchall()}
if "train_mode" not in _alert_columns:
    with db:
        db.execute("ALTER TABLE service_alert_subs ADD COLUMN train_mode TEXT NOT NULL DEFAULT 'all'")
        db.execute("ALTER TABLE service_alert_subs ADD COLUMN traffic_mode TEXT NOT NULL DEFAULT 'all'")
        if "mode" in _alert_columns:
            db.execute("UPDATE service_alert_subs SET train_mode = mode, traffic_mode = mode")

db.commit()
