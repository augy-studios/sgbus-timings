// Bus stops by what's typed, for /api/places: the same rules as the main stop search
// (matchStops in script.js), with LTA's short forms from js/contractions.js, the site's own
// file, so Navigate finds a stop however the search box would. "block 29 bahagia" finds Blk 29
// on Jln Bahagia: Block is matched as Blk too, and the words in any order across name and road.

import "../../js/contractions.js";

const { matcher } = globalThis.Contractions;

// Up to `limit` of the graph's stops (api/_nav/network.js) matching `q`: a stop code exactly,
// otherwise the name and road with the query in one piece, as typed or with words swapped for
// their other forms, then, filling what's left, word by word.
export function matchStops(nodes, q, limit) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  if (/^\d+$/.test(q)) return nodes.filter((n) => n.kind === "stop" && n.code === q).slice(0, limit);

  const swaps = matcher(q);
  const out = [];
  const loose = [];
  for (const n of nodes) {
    if (n.kind !== "stop") continue;
    const find = `${n.name}\n${n.road}`.toLowerCase();
    if (find.includes(q) || swaps.test(find)) {
      out.push(n);
      if (out.length >= limit) break;
    } else if (loose.length < limit && swaps.words(find)) {
      loose.push(n);
    }
  }
  return [...out, ...loose].slice(0, limit);
}
