/** Escapes text for Telegram's MarkdownV2 parse mode. */
export function escapeMd(text) {
  return String(text).replace(/[_*[\]()~`>#+=|{}.!\\-]/g, (ch) => `\\${ch}`);
}

function formatEta(ms) {
  if (ms == null) return "no data";
  const minutes = Math.round(ms / 60000);
  if (minutes <= 0) return "arr";
  if (minutes === 1) return "1 min";
  return `${minutes} min`;
}

function loadLabel(load) {
  if (load === "SEA") return "seats available";
  if (load === "SDA") return "standing available";
  if (load === "LSD") return "limited standing";
  return null;
}

function formatBus(next) {
  if (!next) return null;
  const bits = [formatEta(next.etaMs), next.deck];
  const load = loadLabel(next.load);
  if (load) bits.push(load);
  if (next.wheelchair) bits.push("wheelchair accessible");
  return bits.join(", ");
}

/** Builds the MarkdownV2 message body showing live arrivals for a bus stop. */
export function formatArrivalMessage(stop, arrivals, isFavourite) {
  const star = isFavourite ? "⭐ " : "";
  const lines = [];
  lines.push(`${star}*${escapeMd(stop.name)}* \\(${escapeMd(stop.code)}\\)`);
  if (stop.road) lines.push(`_${escapeMd(stop.road)}_`);
  lines.push("");

  if (!arrivals.services.length) {
    lines.push("No bus services currently reported for this stop\\.");
  } else {
    for (const svc of arrivals.services) {
      lines.push(`*${escapeMd(svc.serviceNo)}* \\(${escapeMd(svc.operator || "?")}\\)`);
      const rows = [
        ["Next", svc.next],
        ["Next 2", svc.next2],
        ["Next 3", svc.next3],
      ];
      for (const [label, next] of rows) {
        const text = formatBus(next);
        if (text) lines.push(`  ${escapeMd(label)}: ${escapeMd(text)}`);
      }
    }
  }

  lines.push("");
  lines.push(`_Updated ${escapeMd(new Date().toLocaleTimeString("en-SG", { hour12: false }))}_`);
  return lines.join("\n");
}

/** Label for a bus stop selection button, kept under Telegram's 64-char limit. */
export function stopButtonLabel(stop, distanceMeters) {
  let label = `${stop.name} (${stop.code})`;
  if (distanceMeters != null) {
    const distText = distanceMeters >= 1000 ? `${(distanceMeters / 1000).toFixed(1)}km` : `${distanceMeters}m`;
    label += ` - ${distText}`;
  }
  if (label.length > 64) label = `${label.slice(0, 61)}...`;
  return label;
}
