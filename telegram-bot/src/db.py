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
        last_birthday_wish TEXT,
        has_bike INTEGER NOT NULL DEFAULT 0,
        clock_times INTEGER NOT NULL DEFAULT 0
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

    -- `field` is what the panel is waiting to be told: 'start' or 'end', or 'when:leave' /
    -- 'when:arrive' for a time. `when_json` is the time already picked (when.py), NULL for
    -- Leave now.
    CREATE TABLE IF NOT EXISTS route_drafts (
        chat_id INTEGER PRIMARY KEY,
        field TEXT,
        start_code TEXT,
        end_code TEXT,
        panel_msg_id INTEGER,
        when_json TEXT,
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
        newsfeed_mode TEXT NOT NULL DEFAULT 'off',
        created_at INTEGER NOT NULL
    );

    -- What each feed looked like at the last poll, so only changes are announced.
    CREATE TABLE IF NOT EXISTS service_alert_state (
        feed TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );

    -- /nav: the journey being planned, one per chat. `field` is the end the bot is waiting
    -- to be told, 'from' or 'to', or 'when:leave' / 'when:arrive' for a time; each end is a
    -- place, a label and a position. `when_json` is the time already picked, NULL for now.
    CREATE TABLE IF NOT EXISTS nav_drafts (
        chat_id INTEGER PRIMARY KEY,
        field TEXT,
        from_label TEXT, from_lat REAL, from_lng REAL,
        to_label TEXT, to_lat REAL, to_lng REAL,
        when_json TEXT,
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

    -- Home, Work and the chat's own places (/settings, /places, saved_places.py): a place
    -- each, as /nav's ends are, with `stop_code` when the place is a bus stop, so /route can
    -- take it as it is. Own places are kind 'p:<n>', with a `name` (added below) if given one.
    CREATE TABLE IF NOT EXISTS saved_places (
        chat_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
        stop_code TEXT,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, kind)
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
# Whether the chat has a bike with them: /nav then says how long cycling there takes too.
if "has_bike" not in _user_settings_columns:
    with db:
        db.execute("ALTER TABLE user_settings ADD COLUMN has_bike INTEGER NOT NULL DEFAULT 0")
# Whether bus timings show the time each bus comes ("14:32") rather than how long till it does.
if "clock_times" not in _user_settings_columns:
    with db:
        db.execute("ALTER TABLE user_settings ADD COLUMN clock_times INTEGER NOT NULL DEFAULT 0")

# A stop on the way for a starred nav and the nav being planned (navs.py), as the web app's
# Navigate keeps with a saved nav: NULL for none, as every nav from before has.
for _table in ("favourite_navs", "nav_drafts"):
    _columns = {row["name"] for row in db.execute(f"PRAGMA table_info({_table})").fetchall()}
    if "via_label" not in _columns:
        with db:
            db.execute(f"ALTER TABLE {_table} ADD COLUMN via_label TEXT")
            db.execute(f"ALTER TABLE {_table} ADD COLUMN via_lat REAL")
            db.execute(f"ALTER TABLE {_table} ADD COLUMN via_lng REAL")

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

# A name for each of the chat's own places (/places); NULL is called what it is.
if "name" not in {row["name"] for row in db.execute("PRAGMA table_info(saved_places)").fetchall()}:
    with db:
        db.execute("ALTER TABLE saved_places ADD COLUMN name TEXT")

# /calendar: the chat's calendar, by its private iCal link (calendar_events.py). The link is as
# good as a password to the calendar, so it's kept here and nowhere else, and only read to
# list the chat's own events.
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS calendar_links (
        chat_id INTEGER PRIMARY KEY,
        url TEXT NOT NULL,
        hidden_json TEXT NOT NULL DEFAULT '[]',
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_places (
        location TEXT PRIMARY KEY,
        label TEXT, lat REAL, lng REAL,
        checked_at INTEGER NOT NULL
    );
    """
)

# A time to leave at or arrive by, for /route and /nav (when.py).
for _draft_table in ("route_drafts", "nav_drafts"):
    if "when_json" not in {row["name"] for row in db.execute(f"PRAGMA table_info({_draft_table})").fetchall()}:
        with db:
            db.execute(f"ALTER TABLE {_draft_table} ADD COLUMN when_json TEXT")

# Service Alerts used to have one mode for both kinds. A subscriber from then keeps it for
# each, so nobody's alerts change until they pick otherwise.
_alert_columns = {row["name"] for row in db.execute("PRAGMA table_info(service_alert_subs)").fetchall()}
if "train_mode" not in _alert_columns:
    with db:
        db.execute("ALTER TABLE service_alert_subs ADD COLUMN train_mode TEXT NOT NULL DEFAULT 'all'")
        db.execute("ALTER TABLE service_alert_subs ADD COLUMN traffic_mode TEXT NOT NULL DEFAULT 'all'")
        if "mode" in _alert_columns:
            db.execute("UPDATE service_alert_subs SET train_mode = mode, traffic_mode = mode")
# The Newsfeed (notices.py), off for those who subscribed before it.
if "newsfeed_mode" not in _alert_columns:
    with db:
        db.execute("ALTER TABLE service_alert_subs ADD COLUMN newsfeed_mode TEXT NOT NULL DEFAULT 'off'")

# Trips with a live widget (bot_trips.py), one row per trip by its live ETA link's id: one the
# bot started from /nav (owner_chat, with the link's secret and the site's trip id), or one the
# web app shares that someone opened here (no owner). trip_widget_messages is each chat's
# message showing it.
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS trip_widgets (
        eta_id TEXT PRIMARY KEY,
        owner_chat INTEGER,
        secret TEXT,
        device_id TEXT,
        widget_id TEXT,
        parts_json TEXT,
        alerted_json TEXT NOT NULL DEFAULT '[]',
        last_json TEXT,
        state TEXT,
        rev INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'live',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trip_widget_messages (
        eta_id TEXT NOT NULL REFERENCES trip_widgets(eta_id) ON DELETE CASCADE,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        own INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (eta_id, chat_id)
    );
    """
)
# Your location on a trip (bot_trips.py, apply_fix): the trip as the site follows it, so a fix can
# put it right; when a location was last asked for with a button; and when the last one came.
_trip_columns = {row["name"] for row in db.execute("PRAGMA table_info(trip_widgets)").fetchall()}
# And the way it really goes, for the widget's map (route_shapes.py).
for _col in ("trip_json TEXT", "asked_at INTEGER NOT NULL DEFAULT 0", "fix_at INTEGER NOT NULL DEFAULT 0", "shapes_json TEXT"):
    if _col.split()[0] not in _trip_columns:
        with db:
            db.execute(f"ALTER TABLE trip_widgets ADD COLUMN {_col}")
# What was seen of each ride on a trip, to judge whether it was really taken (rides.py).
if "seen_json" not in {row["name"] for row in db.execute("PRAGMA table_info(trip_widgets)").fetchall()}:
    with db:
        db.execute("ALTER TABLE trip_widgets ADD COLUMN seen_json TEXT")
        db.execute("ALTER TABLE trip_widgets ADD COLUMN paid INTEGER NOT NULL DEFAULT 0")

# uwuCoins, feats and team runs, each chat's own, as the web app keeps them on each phone:
#   coin_log      every coin in and out (coins.py): the balance is their sum
#   rides         each ride judged real (rides.py), by line or bus, for the feats
#   feat_marks    First to last's stops and Ends of the island's stations (feats.py)
#   feats         the feats done, and the team run each was done with, if any
#   coin_widgets  each chat's uwuCoins wheel (coins_view.py)
#   team_members  the team run a chat is in (teams.py), with its member's secret
#   team_outbox   rides and trips not yet taken by the team's server
#   team_widgets  each team's shared widget, and team_widget_messages each chat's message of it
db.executescript(
    """
    CREATE TABLE IF NOT EXISTS coin_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        at INTEGER NOT NULL,
        n INTEGER NOT NULL,
        why TEXT NOT NULL,
        info_json TEXT
    );
    CREATE INDEX IF NOT EXISTS coin_log_chat ON coin_log (chat_id, at);
    CREATE TABLE IF NOT EXISTS rides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER NOT NULL,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        line TEXT,
        bus TEXT,
        trip TEXT
    );
    CREATE INDEX IF NOT EXISTS rides_chat ON rides (chat_id);
    CREATE TABLE IF NOT EXISTS feat_marks (
        chat_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        code TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, kind, code)
    );
    CREATE TABLE IF NOT EXISTS feats (
        chat_id INTEGER NOT NULL,
        feat TEXT NOT NULL,
        at INTEGER NOT NULL,
        team TEXT,
        PRIMARY KEY (chat_id, feat)
    );
    CREATE TABLE IF NOT EXISTS coin_widgets (
        chat_id INTEGER PRIMARY KEY,
        message_id INTEGER NOT NULL,
        rev INTEGER NOT NULL DEFAULT 0,
        spun_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS team_members (
        chat_id INTEGER PRIMARY KEY,
        team_id TEXT NOT NULL,
        team_name TEXT NOT NULL,
        member_id TEXT NOT NULL,
        secret TEXT NOT NULL,
        joined_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_outbox (
        eid TEXT PRIMARY KEY,
        chat_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        data_json TEXT NOT NULL,
        at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_widgets (
        team_id TEXT PRIMARY KEY,
        widget_id TEXT,
        state TEXT,
        rev INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS team_widget_messages (
        team_id TEXT NOT NULL,
        chat_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        PRIMARY KEY (team_id, chat_id)
    );
    """
)

db.commit()
