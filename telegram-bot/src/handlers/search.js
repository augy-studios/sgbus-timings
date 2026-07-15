import { message } from "telegraf/filters";
import { searchBusStops, getBusStopByCode } from "../busStops.js";
import { buildStopListKeyboard } from "../listView.js";
import { buildStopView } from "../stopView.js";
import { sendRichMessage } from "../reply.js";

export function registerSearch(bot) {
  bot.on(message("text"), async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return; // unknown commands: ignore, let Telegram show default help

    const exactCode = /^\d{3,5}$/.test(text) ? getBusStopByCode(text) : null;
    if (exactCode) {
      const view = await buildStopView(exactCode.code, ctx.chat.id);
      await sendRichMessage(ctx, view.text, view.keyboard);
      return;
    }

    const matches = searchBusStops(text, 10);
    if (!matches.length) {
      await ctx.reply("No bus stops matched that. Try a bus stop number or part of its name.");
      return;
    }
    if (matches.length === 1) {
      const view = await buildStopView(matches[0].code, ctx.chat.id);
      await sendRichMessage(ctx, view.text, view.keyboard);
      return;
    }

    await sendRichMessage(ctx, "*Did you mean*", buildStopListKeyboard(matches));
  });
}
