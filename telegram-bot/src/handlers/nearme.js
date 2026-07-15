import { Markup } from "telegraf";
import { nearestBusStops } from "../busStops.js";
import { listFavourites } from "../favourites.js";
import { buildStopListKeyboard } from "../listView.js";
import { sendRichMessage } from "../reply.js";

export function registerNearMe(bot) {
  bot.command("nearme", async (ctx) => {
    await ctx.reply(
      "Tap the button below to share your location and find nearby bus stops.",
      Markup.keyboard([Markup.button.locationRequest("Share my location")])
        .resize()
        .oneTime()
    );
  });

  bot.on("location", async (ctx) => {
    const { latitude, longitude } = ctx.message.location;
    await ctx.reply("Looking for bus stops near you...", Markup.removeKeyboard());

    const nearby = nearestBusStops(latitude, longitude, 8);
    if (!nearby.length) {
      await ctx.reply("No bus stops found nearby. The bus stop cache may still be loading, please try again shortly.");
      return;
    }

    const favCodes = new Set(listFavourites(ctx.chat.id).map((f) => f.code));
    nearby.sort((a, b) => {
      const aFav = favCodes.has(a.code) ? 0 : 1;
      const bFav = favCodes.has(b.code) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return a.distance - b.distance;
    });

    await sendRichMessage(ctx, "*Nearby bus stops*\nFavourites are shown first\\.", buildStopListKeyboard(nearby));
  });
}
