import { resolveButton } from "../buttons.js";
import { buildStopView } from "../stopView.js";
import { toggleFavourite } from "../favourites.js";
import { editRichMessage } from "../reply.js";

export function registerCallbacks(bot) {
  bot.on("callback_query", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const resolved = resolveButton(data);
    if (!resolved) {
      await ctx.answerCbQuery("This button is no longer valid.");
      return;
    }

    const userId = ctx.from.id;
    const { action, payload } = resolved;

    try {
      if (action === "stop" || action === "refresh") {
        const view = await buildStopView(payload.code, userId);
        if (!view) {
          await ctx.answerCbQuery("That bus stop could not be found.");
          return;
        }
        await editRichMessage(ctx, view.text, { reply_markup: view.keyboard.reply_markup });
        await ctx.answerCbQuery(action === "refresh" ? "Refreshed" : undefined);
        return;
      }

      if (action === "fav") {
        const nowFav = toggleFavourite(userId, payload.code, payload.name);
        const view = await buildStopView(payload.code, userId);
        if (view) {
          await editRichMessage(ctx, view.text, { reply_markup: view.keyboard.reply_markup });
        }
        await ctx.answerCbQuery(nowFav ? "Added to favourites" : "Removed from favourites");
        return;
      }

      await ctx.answerCbQuery();
    } catch (err) {
      console.error("[callback_query] handler error:", err);
      await ctx.answerCbQuery("Something went wrong, please try again.");
    }
  });
}
