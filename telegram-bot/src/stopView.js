import { Markup } from "telegraf";
import { getBusStopByCode } from "./busStops.js";
import { fetchArrivals } from "./lta.js";
import { formatArrivalMessage } from "./format.js";
import { isFavourite } from "./favourites.js";
import { makeButton } from "./buttons.js";

/**
 * Builds the MarkdownV2 text + inline keyboard for a bus stop's live
 * arrivals. Used for chat replies/edits, and for inline query results.
 * `chatId` is only used to mark whether the stop is already a favourite; the
 * favourite/refresh buttons themselves resolve the acting user at click time.
 * Pass `inlineOnly: true` for messages living in inline mode (no chat of
 * their own), which get just a refresh button - no favourite toggle, since
 * whoever taps it may not be the user who ran the query.
 */
export async function buildStopView(code, chatId, { inlineOnly = false } = {}) {
  const stop = getBusStopByCode(code);
  if (!stop) return null;

  const arrivals = await fetchArrivals(code);
  const favourite = chatId != null ? isFavourite(chatId, code) : false;
  const text = formatArrivalMessage(stop, arrivals, favourite);

  const buttons = inlineOnly
    ? [Markup.button.callback("🔄 Refresh", makeButton("refresh", { code }))]
    : [
        Markup.button.callback(
          favourite ? "⭐ Remove favourite" : "⭐ Add favourite",
          makeButton("fav", { code, name: stop.name })
        ),
        Markup.button.callback("🔄 Refresh", makeButton("refresh", { code })),
      ];
  const keyboard = Markup.inlineKeyboard([buttons]);

  return { stop, text, keyboard };
}
