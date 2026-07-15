/**
 * Sends (or edits) a MarkdownV2 message, falling back to plain text if the
 * MarkdownV2 payload happens to be malformed rather than letting the request
 * error out silently.
 */
export async function sendRichMessage(ctx, text, extra = {}) {
  try {
    return await ctx.reply(text, { parse_mode: "MarkdownV2", ...extra });
  } catch (err) {
    console.error("[sendRichMessage] MarkdownV2 send failed, falling back to plain text:", err.message);
    return ctx.reply(stripMd(text), extra);
  }
}

export async function editRichMessage(ctx, text, extra = {}) {
  try {
    return await ctx.editMessageText(text, { parse_mode: "MarkdownV2", ...extra });
  } catch (err) {
    if (err.description && err.description.includes("message is not modified")) return;
    console.error("[editRichMessage] MarkdownV2 edit failed, falling back to plain text:", err.message);
    return ctx.editMessageText(stripMd(text), extra);
  }
}

function stripMd(text) {
  return text.replace(/\\([_*[\]()~`>#+=|{}.!-])/g, "$1");
}
