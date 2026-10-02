import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


def _required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@dataclass(frozen=True)
class Config:
    bot_token: str
    api_id: int
    api_hash: str
    lta_account_key: str
    db_path: Path
    webapp_url: str
    donate_url: str
    guide_url: str
    bus_stops_refresh_hours: float
    service_alert_poll_seconds: float
    nav_api_url: str
    bot_api_token: str
    onemap_email: str
    onemap_password: str


config = Config(
    bot_token=_required("BOT_TOKEN"),
    api_id=int(_required("API_ID")),
    api_hash=_required("API_HASH"),
    lta_account_key=_required("LTA_ACCOUNT_KEY"),
    db_path=(ROOT_DIR / os.environ.get("DB_PATH", "./data/bot.db")).resolve(),
    webapp_url=os.environ.get("WEBAPP_URL", "https://sgbus.uwuapps.org/"),
    donate_url=os.environ.get("DONATE_URL", "https://donate.stripe.com/28o2akeAr3hv0DK6oo"),
    guide_url=os.environ.get("GUIDE_URL", "https://guide.sgbus.uwuapps.org/bot/start"),
    bus_stops_refresh_hours=float(os.environ.get("BUS_STOPS_REFRESH_HOURS", "24")),
    service_alert_poll_seconds=float(os.environ.get("SERVICE_ALERT_POLL_SECONDS", "60")),
    nav_api_url=os.environ.get("NAV_API_URL") or os.environ.get("WEBAPP_URL", "https://sgbus.uwuapps.org/"),
    bot_api_token=os.environ.get("BOT_API_TOKEN", ""),
    onemap_email=os.environ.get("ONEMAP_EMAIL", ""),
    onemap_password=os.environ.get("ONEMAP_PASSWORD", ""),
)
