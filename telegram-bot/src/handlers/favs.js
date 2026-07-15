import { listFavourites } from "../favourites.js";
import { buildStopListKeyboard } from "../listView.js";
import { sendRichMessage } from "../reply.js";

export function registerFavs(bot) {
  bot.command("favs", async (ctx) => {
    const favs = listFavourites(ctx.chat.id);
    if (!favs.length) {
      await ctx.reply(
        "You have no favourite bus stops yet. Search for a bus stop or use /nearme, then tap \"Add favourite\" on its timings."
      );
      return;
    }
    await sendRichMessage(ctx, "*Your favourite bus stops*", buildStopListKeyboard(favs));
  });
}
