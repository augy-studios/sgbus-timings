import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  ltaAccountKey: required("LTA_ACCOUNT_KEY"),
  dbPath: path.resolve(rootDir, process.env.DB_PATH || "./data/bot.db"),
  webAppUrl: process.env.WEBAPP_URL || "https://sgbus.uwuapps.org/",
  donateUrl: process.env.DONATE_URL || "https://donate.stripe.com/28o2akeAr3hv0DK6oo",
  busStopsRefreshHours: Number(process.env.BUS_STOPS_REFRESH_HOURS || 24),
};
