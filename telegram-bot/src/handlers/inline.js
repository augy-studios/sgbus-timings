import crypto from "node:crypto";
import { searchBusStops, getBusStopByCode } from "../busStops.js";
import { listFavourites } from "../favourites.js";
import { buildStopView } from "../stopView.js";

const MAX_RESULTS = 8;

/**
 * Inline mode: "@bot" with no query returns the user's favourites; any text
 * is treated as a bus stop number or name search. Selecting a result posts a
 * live-timings message with just a refresh button - no favourite toggle,
 * since inline results can be posted into any chat and whoever taps the
 * button may not be the user who ran the query, which would be confusing.
 */
export function registerInline(bot) {
  bot.on("inline_query", async (ctx) => {
    const query = ctx.inlineQuery.query.trim();
    const userId = ctx.from.id;

    let candidates;
    if (!query) {
      candidates = listFavourites(userId)
        .map((f) => getBusStopByCode(f.code))
        .filter(Boolean)
        .slice(0, MAX_RESULTS);
    } else {
      candidates = searchBusStops(query, MAX_RESULTS);
    }

    if (!candidates.length) {
      await ctx.answerInlineQuery([], {
        cache_time: 5,
        is_personal: true,
        switch_pm_text: query ? "No matches, open the bot" : "No favourites yet, open the bot",
        switch_pm_parameter: "start",
      });
      return;
    }

    const results = await Promise.all(
      candidates.map(async (stop) => {
        let text;
        let keyboard;
        try {
          const view = await buildStopView(stop.code, userId, { inlineOnly: true });
          text = view.text;
          keyboard = view.keyboard;
        } catch {
          text = `*${stop.name}* \\(${stop.code}\\)\nCould not load live timings right now\\.`;
        }

        return {
          type: "article",
          id: crypto.randomUUID(),
          title: `${stop.name} (${stop.code})`,
          description: stop.road || "Bus stop",
          input_message_content: { message_text: text, parse_mode: "MarkdownV2" },
          ...(keyboard ? { reply_markup: keyboard.reply_markup } : {}),
        };
      })
    );

    await ctx.answerInlineQuery(results, { cache_time: 5, is_personal: true });
  });
}
