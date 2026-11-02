// Report a bug (help desk #13): Settings' form (js/bug-report.js) sends what went wrong here, and
// it reaches Augy as a message from the Telegram bot.
//
//   POST { text, contact?, version?, platform?, device?, page?, lang?, website?, images? }  → 204
//
// `images` (optional) is up to MAX_IMAGES pictures as JPEG, PNG or WebP data URLs, each at most
// MAX_IMAGE_BYTES (js/bug-report.js makes them JPEGs of about 900 KB at most).
//
// It goes as a Telegram rich message (Bot API sendRichMessage): a heading, a table of what the
// form added, what was typed under its own heading, and the pictures in the message itself,
// uploaded with it (InputRichMessage `media`, each a tg://photo?id= link in the Markdown). If a
// chat won't take a rich message, it gets what it got before: the same words as plain text
// (sendMessage), then the pictures as a photo or an album replying to it.
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
// IP and ALL_PER_HOUR from everyone together. Everything typed is escaped (escapeMd), so nothing
// in it is read as Telegram's Rich Markdown or HTML; the plain text fallback has no parse_mode. `website` is a field people never see: filled in, it's
// a bot, told it went and sent nothing.

import { rateLimited, redis, storeConfigured } from "./_push/store.js";

const MAX_TEXT = 2000;
const MAX_CONTACT = 200;
const MAX_BODY = 8 * 1024;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 1200 * 1024;
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;
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

// The pictures sent, as [{ type, bytes }], or null if any isn't one (a bad data URL, too big,
// too many).
export function images(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > MAX_IMAGES) return null;
  const out = [];
  for (const item of list) {
    const m = typeof item === "string" ? IMAGE_RE.exec(item) : null;
    if (!m) return null;
    const bytes = Buffer.from(m[2], "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return null;
    out.push({ type: m[1], bytes });
  }
  return out;
}

// The pictures to one chat, replying to the report (`replyTo`): one as a photo, more as an album.
async function sendImages(chat, pics, replyTo) {
  const form = new FormData();
  for (const [k, v] of Object.entries(chat)) form.append(k, String(v));
  if (replyTo) form.append("reply_parameters", JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  const caption = pics.length === 1 ? "Picture for the report above" : `${pics.length} pictures for the report above`;
  const file = (p, i) => new Blob([p.bytes], { type: `image/${p.type}` });
  let method;
  if (pics.length === 1) {
    method = "sendPhoto";
    form.append("photo", file(pics[0]), `picture.${pics[0].type === "jpeg" ? "jpg" : pics[0].type}`);
    form.append("caption", caption);
  } else {
    method = "sendMediaGroup";
    pics.forEach((p, i) => form.append(`p${i}`, file(p, i), `picture${i + 1}.${p.type === "jpeg" ? "jpg" : p.type}`));
    form.append("media", JSON.stringify(pics.map((p, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 && { caption }) }))));
  }
  const r = await fetch(`https://api.telegram.org/bot${process.env.BUG_REPORT_BOT_TOKEN}/${method}`, { method: "POST", body: form, signal: AbortSignal.timeout(TELEGRAM_MS * 2) });
  if (!r.ok) {
    const reason = await r.json().then((d) => d?.description).catch(() => null);
    throw new Error(`Telegram replied ${r.status}${reason ? `: ${reason}` : ""}`);
  }
}

// What the form added, as [label, value], in order.
function details(body) {
  const platform = PLATFORMS[body.platform] || "Unknown";
  const version = clean(body.version, 60);
  return [
    ["App", `${platform}${version ? ` ${version}` : ""}`],
    ["Device", clean(body.device, 200) || "not given"],
    ["Page", clean(body.page, 100) || "not given"],
    ["Language", clean(body.lang, 10) || "not given"],
    ["Contact", clean(body.contact, MAX_CONTACT) || "none given"],
  ];
}

// The message Augy gets as plain text, where a rich message won't go: what the form added,
// then what was typed.
export function message(body) {
  const lines = [
    "Bug report, SG Bus Timings",
    "",
    ...details(body).map(([k, v]) => `${k}: ${v}`),
    ...(Array.isArray(body.images) && body.images.length ? [`Pictures: ${body.images.length}, below`] : []),
    "",
    clean(body.text, MAX_TEXT, { lines: true }),
  ];
  return lines.join("\n");
}

// Text for Telegram's Rich Markdown, read as it is: Markdown's and HTML's characters, and the
// ones its own syntax uses (== marked, || spoiler, $ formulas), each behind a backslash, and a
// line that would start a list or a heading made not to.
const MD_SPECIAL = /([\\*_~`|\[\]#>=<!$&^(){}])/g;
export function escapeMd(text) {
  return String(text)
    .replace(MD_SPECIAL, "\\$1")
    .replace(/^(\s*)([-+])(?=\s|$)/gm, "$1\\$2")
    .replace(/^(\s*\d+)([.)])/gm, "$1\\$2");
}
// A table cell: escaped, on one line.
const escapeCell = (text) => escapeMd(String(text).replace(/\s*\n\s*/g, " "));

// The rich message: a heading, the form's details as a table, what was typed under a heading of
// its own (each line kept a line), then each picture as a block of its own, `p0`, `p1`... the
// ids of the files uploaded with it.
export function richMarkdown(body, pictures = 0) {
  const typed = clean(body.text, MAX_TEXT, { lines: true }).split("\n").map((l) => escapeMd(l));
  const lines = [
    "# Bug report",
    "*SG Bus Timings*",
    "",
    "| Detail | Given |",
    "| --- | --- |",
    ...details(body).map(([k, v]) => `| ${k} | ${escapeCell(v)} |`),
    "",
    "## What went wrong",
    "",
    // Two spaces at a line's end keep the next on a line of its own; a blank line stays one.
    ...typed.map((l, i) => (i < typed.length - 1 && l && typed[i + 1] ? `${l}  ` : l)),
  ];
  if (pictures) {
    lines.push("", `## ${pictures === 1 ? "Picture" : `Pictures (${pictures})`}`);
    for (let i = 0; i < pictures; i++) lines.push("", `![](tg://photo?id=p${i}${pictures > 1 ? ` "Picture ${i + 1} of ${pictures}"` : ""})`);
  }
  return lines.join("\n");
}

// The report as a rich message to one chat, its pictures in it: a form, so the files go with it.
async function sendRich(chat, body, pics) {
  const form = new FormData();
  for (const [k, v] of Object.entries(chat)) form.append(k, String(v));
  form.append("rich_message", JSON.stringify({
    markdown: richMarkdown(body, pics.length),
    ...(pics.length && { media: pics.map((p, i) => ({ id: `p${i}`, media: { type: "photo", media: `attach://p${i}` } })) }),
  }));
  pics.forEach((p, i) => form.append(`p${i}`, new Blob([p.bytes], { type: `image/${p.type}` }), `picture${i + 1}.${p.type === "jpeg" ? "jpg" : p.type}`));
  const r = await fetch(`https://api.telegram.org/bot${process.env.BUG_REPORT_BOT_TOKEN}/sendRichMessage`, {
    method: "POST", body: form, signal: AbortSignal.timeout(TELEGRAM_MS * (pics.length ? 2 : 1)),
  });
  if (r.ok) return;
  const reason = await r.json().then((d) => d?.description).catch(() => null);
  throw new Error(`Telegram replied ${r.status}${reason ? `: ${reason}` : ""}`);
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
  const pics = images(body.images);
  if (!pics) return res.status(400).json({ error: `Pictures must be images, at most ${MAX_IMAGES}, each under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024 * 10) / 10} MB.` });
  if (JSON.stringify({ ...body, images: undefined }).length > MAX_BODY) return res.status(413).json({ error: "That's too long to send." });
  if (typeof body.text !== "string" || clean(body.text, MAX_TEXT + 1, { lines: true }).length < 5) return res.status(400).json({ error: "Please say what went wrong." });
  if (body.text.trim().length > MAX_TEXT) return res.status(400).json({ error: `Please keep it under ${MAX_TEXT} characters.` });

  const ip = req.headers["x-real-ip"] || String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (await rateLimited(`bug:${ip}`, PER_MINUTE)) return res.status(429).json({ error: "That's a lot of reports at once. Try again in a minute." });
  // The bot's field: no message, and no sign it was noticed.
  if (body.website) return res.status(204).end();
  if (await overHour(ip)) return res.status(429).json({ error: "That's a lot of reports this hour. Try again later." });

  // To every chat at once, as a rich message, or as before where that won't go. One that took
  // it is enough; the others are logged.
  const text = message(body);
  const results = await Promise.all(chats().map(async (chat, i) => {
    try {
      await sendRich(chat, body, pics);
      return true;
    } catch (err) {
      console.error(`bug-report: chat ${i + 1}: rich message: ${err.name === "TimeoutError" ? "Telegram took too long" : err.message}; sending it as plain text`);
    }
    try {
      const r = await fetch(`https://api.telegram.org/bot${process.env.BUG_REPORT_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...chat, text, link_preview_options: { is_disabled: true } }),
        signal: AbortSignal.timeout(TELEGRAM_MS),
      });
      if (r.ok) {
        // Then its pictures, replying to it. The report counts as sent even if they don't go.
        if (pics.length) {
          const id = await r.json().then((d) => d?.result?.message_id).catch(() => null);
          await sendImages(chat, pics, id).catch((err) => console.error(`bug-report: chat ${i + 1}: pictures: ${err.message}`));
        }
        return true;
      }
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
