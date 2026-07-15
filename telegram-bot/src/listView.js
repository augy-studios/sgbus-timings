import { Markup } from "telegraf";
import { makeButton } from "./buttons.js";
import { stopButtonLabel } from "./format.js";

/** One inline button per row, each opening a stop's live arrivals. */
export function buildStopListKeyboard(stops) {
  const rows = stops.map((stop) => [
    Markup.button.callback(
      stopButtonLabel(stop, stop.distance),
      makeButton("stop", { code: stop.code })
    ),
  ]);
  return Markup.inlineKeyboard(rows);
}
