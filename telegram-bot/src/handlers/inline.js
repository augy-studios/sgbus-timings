import crypto from "node:crypto";
import { searchBusStops, getBusStopByCode } from "../busStops.js";
import { listFavourites, isFavourite } from "../favourites.js";
import { fetchArrivals } from "../lta.js";
import { formatArrivalMessage } from "../format.js";
import { makeButton } from "../buttons.js";

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
        try {
          const arrivals = await fetchArrivals(stop.code);
          text = formatArrivalMessage(stop, arrivals, isFavourite(userId, stop.code));
        } catch {
          text = `*${stop.name}* \\(${stop.code}\\)\nCould not load live timings right now\\.`;
        }

        return {
          type: "article",
          id: crypto.randomUUID(),
          title: `${stop.name} (${stop.code})`,
          description: stop.road || "Bus stop",
          input_message_content: { message_text: text, parse_mode: "MarkdownV2" },
          reply_markup: {
            inline_keyboard: [[{ text: "🔄 Refresh", callback_data: makeButton("refresh", { code: stop.code }) }]],
          },
        };
      })
    );

    await ctx.answerInlineQuery(results, { cache_time: 5, is_personal: true });
  });
}
