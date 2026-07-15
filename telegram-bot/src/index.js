import { Telegraf } from "telegraf";
import { config } from "./config.js";
import "./db.js";
import { registerStart } from "./handlers/start.js";
import { registerNearMe } from "./handlers/nearme.js";
import { registerFavs } from "./handlers/favs.js";
import { registerSearch } from "./handlers/search.js";
import { registerCallbacks } from "./handlers/callbacks.js";
import { registerInline } from "./handlers/inline.js";
import { registerJob, startScheduler, stopScheduler } from "./scheduler.js";
import { refreshBusStops, busStopsCount } from "./busStops.js";

const bot = new Telegraf(config.botToken);

registerStart(bot);
registerNearMe(bot);
registerFavs(bot);
registerCallbacks(bot);
registerInline(bot);
registerSearch(bot); // catch-all text handler, must be registered last

bot.catch((err, ctx) => {
  console.error(`[bot] unhandled error for update ${ctx.updateType}:`, err);
});

registerJob("refresh-bus-stops", config.busStopsRefreshHours * 60 * 60 * 1000, async () => {
  const count = await refreshBusStops();
  console.log(`[scheduler] refreshed ${count} bus stops`);
});

async function main() {
  if (busStopsCount() === 0) {
    console.log("Bus stop cache is empty, fetching from LTA DataMall before starting...");
    const count = await refreshBusStops();
    console.log(`Loaded ${count} bus stops.`);
  }

  startScheduler();
  await bot.launch();
  console.log("Bot started.");
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  stopScheduler();
  bot.stop(signal);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
