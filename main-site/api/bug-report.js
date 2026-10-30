// Report a bug (help desk #13): Settings' form (js/bug-report.js) sends what went wrong here, and
// it reaches Augy as a message from the Telegram bot.
//
//   POST { text, contact?, version?, platform?, device?, page?, lang?, website? }  → 204
//
// What's sent on is what the person typed (`text`, and `contact` if they gave one), with what
// the form adds and shows them first: the app's version, which app (web, Android, desktop, the
// Telegram Mini App), the device as their browser describes it, the page they were on and the
// language. Nothing else: not their address, location or anything from their favourites.
//
//   BUG_REPORT_BOT_TOKEN  the bot that sends it (BotFather's token; the Telegram bot's own will do)
//   BUG_REPORT_CHAT_ID    the chats it's sent to, one or more, split by commas, spaces or new
//                         lines: a chat ID (a person, who must have started the bot first; a
//                         group or channel the bot's in), a public group or channel's @name, or
//                         <chat ID>/<topic ID> for one topic of a group with topics. README's
//                         "Report a bug" says how to find each
//
// Sent to every chat at once; it counts as sent if one of them took it, and a chat that didn't
// is logged by its place in the list, with Telegram's reason.
//
// Without either it answers 503, and the form offers email instead. A public endpoint, so it's
// kept small: at most MAX_TEXT characters and MAX_BODY bytes in all, PER_MINUTE a minute from
// one IP in this instance, and with Redis set up (api/_push/store.js), PER_HOUR an hour from one
// IP and ALL_PER_HOUR from everyone together. The message goes as plain text, so nothing typed
// is read as Telegram's HTML or Markdown. `website` is a field people never see: filled in, it's
// a bot, told it went and sent nothing.

import { rateLimited, redis, storeConfigured } from "./_push/store.js";

const MAX_TEXT = 2000;
const MAX_CONTACT = 200;
const MAX_BODY = 8 * 1024;
const PER_MINUTE = 2;
const PER_HOUR = 6;
const ALL_PER_HOUR = 60;
const TELEGRAM_MS = 10 * 1000;
const PLATFORMS = { web: "Web", pwa: "Web, installed", android: "Android app", desktop: "Desktop app", telegram: "Telegram Mini App" };

// BUG_REPORT_CHAT_ID as [{ chat_id, message_thread_id? }], in order; anything that isn't a chat
// ID, an @name or a chat ID with a topic is left out.
export function chats(value = process.env.BUG_REPORT_CHAT_ID) {
  return String(value || "")
    .split(/[\s,]+/)
    .map((t) => {
      const m = t.match(/^(-?\d+)(?:\/(\d+))?$/);
      if (m) return m[2] ? { chat_id: m[1], message_thread_id: Number(m[2]) } : { chat_id: m[1] };
      return /^@[A-Za-z]\w{3,}$/.test(t) ? { chat_id: t } : null;
    })
    .filter(Boolean);
}

export const configured = () => Boolean(process.env.BUG_REPORT_BOT_TOKEN && chats().length);

// A string as given, trimmed and cut to `max`, with control characters other than new lines
// and tabs taken out. Anything that isn't a string is "".
function clean(v, max, { lines = false } = {}) {
  if (typeof v !== "string") return "";
  const s = v.replace(lines ? /[\u0000-\u0008\u000b-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

// The message Augy gets: what the form added, then what was typed.
export function message(body) {
  const platform = PLATFORMS[body.platform] || "Unknown";
  const version = clean(body.version, 60);
  const lines = [
    "Bug report, SG Bus Timings",
    "",
    `App: ${platform}${version ? ` ${version}` : ""}`,
    `Device: ${clean(body.device, 200) || "not given"}`,
    `Page: ${clean(body.page, 100) || "not given"}`,
    `Language: ${clean(body.lang, 10) || "not given"}`,
    `Contact: ${clean(body.contact, MAX_CONTACT) || "none given"}`,
    "",
    clean(body.text, MAX_TEXT, { lines: true }),
  ];
  return lines.join("\n");
}

// Over the hour's limit, from Redis: one IP's, or everyone's. A Redis that fails lets it through.
async function overHour(ip) {
  if (!storeConfigured()) return false;
  try {
    const hour = Math.floor(Date.now() / 3600000);
    const count = async (key) => {
      const n = await redis("INCR", key);
      if (n === 1) await redis("EXPIRE", key, 3600);
      return n;
    };
    if ((await count(`sgbus:bug:${hour}:${ip}`)) > PER_HOUR) return true;
    return (await count(`sgbus:bug:${hour}:all`)) > ALL_PER_HOUR;
  } catch {
    return false; // the limit's a nicety
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }
  if (!configured()) return res.status(503).json({ error: "Bug reports can't be sent from the app yet." });

  // Only from the site's own page: a browser sends Origin with a cross-site POST.
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch { /* not a URL: refused below */ }
    if (host !== req.headers.host) return res.status(403).json({ error: "Not from this site." });
  }

  const body = req.body && typeof req.body === "object" ? req.body : null;
  if (!body) return res.status(400).json({ error: "Nothing was sent." });
  if (JSON.stringify(body).length > MAX_BODY) return res.status(413).json({ error: "That's too long to send." });
  if (typeof body.text !== "string" || clean(body.text, MAX_TEXT + 1, { lines: true }).length < 5) return res.status(400).json({ error: "Please say what went wrong." });
  if (body.text.trim().length > MAX_TEXT) return res.status(400).json({ error: `Please keep it under ${MAX_TEXT} characters.` });

  const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (await rateLimited(`bug:${ip}`, PER_MINUTE)) return res.status(429).json({ error: "That's a lot of reports at once. Try again in a minute." });
  // The bot's field: no message, and no sign it was noticed.
  if (body.website) return res.status(204).end();
  if (await overHour(ip)) return res.status(429).json({ error: "That's a lot of reports this hour. Try again later." });

  // To every chat at once. One that took it is enough; the others are logged.
  const text = message(body);
  const results = await Promise.all(chats().map(async (chat, i) => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${process.env.BUG_REPORT_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...chat, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(TELEGRAM_MS),
      });
      if (r.ok) return true;
      // Telegram's reason, for the logs: never the token, which is only in the address.
      const reason = await r.json().then((d) => d?.description).catch(() => null);
      console.error(`bug-report: chat ${i + 1}: Telegram replied ${r.status}${reason ? `: ${reason}` : ""}`);
    } catch (err) {
      console.error(`bug-report: chat ${i + 1}: ${err.name === "TimeoutError" ? "Telegram took too long" : err.message}`);
    }
    return false;
  }));
  if (!results.includes(true)) return res.status(502).json({ error: "Couldn't send it right now. Please try again." });
  return res.status(204).end();
}
