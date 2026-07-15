import { Markup } from "telegraf";
import { config } from "../config.js";
import { sendRichMessage } from "../reply.js";
import { escapeMd } from "../format.js";

const ABOUT = [
  "*SG Bus Timings*",
  "",
  "Live bus arrival timings for Singapore, powered by LTA DataMall\\.",
  "",
  "*What you can do*",
  "• Send a bus stop number or name to search for it directly",
  "• Share your location to find the nearest bus stops",
  "• Save bus stops as favourites for quick access",
  "• Use this bot inline in any chat: type @BOTUSERNAME then a bus stop number or name",
  "",
  "*Commands*",
  "start \\- show this message",
  "nearme \\- find bus stops near your current location",
  "favs \\- view and jump to your favourite bus stops",
  "help \\- show this message again",
].join("\n");

export function registerStart(bot) {
  const aboutFor = (ctx) => {
    const username = ctx.botInfo?.username;
    return username ? ABOUT.replace("BOTUSERNAME", escapeMd(username)) : ABOUT.replace("@BOTUSERNAME ", "");
  };

  bot.start(async (ctx) => {
    await sendRichMessage(
      ctx,
      aboutFor(ctx),
      Markup.inlineKeyboard([
        [Markup.button.url("🌐 Open web app", config.webAppUrl)],
        [Markup.button.url("💖 Donate", config.donateUrl)],
      ])
    );
  });

  bot.help(async (ctx) => {
    await sendRichMessage(ctx, aboutFor(ctx));
  });
}
