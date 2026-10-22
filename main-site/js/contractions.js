// LTA's shortened words in stop and road names ("W'lands Checkpt", "Bt Batok", "Opp Blk 10"),
// so a search finds a stop however the word is typed: Bukit finds "Bt Batok Int", and Ave
// finds "Avenue 3". Each group is one word's forms, and a word typed as any of them is matched
// as all of them. LTA is not consistent (Ctr and Ctrl both stand for Centre and Central), so
// some groups are wider than one word. The long forms are matched too, since a few road names
// keep them ("Lower Peirce Reservoir", "Upper Bukit Timah Rd").
//
// Contractions.matcher(query) gives { test(text), words(text), note(texts) }, or null for an
// empty query: `test` is whether a stop's lowercased name and road match the query in one
// piece with its words swapped for their other forms, `words` whether they match it word by
// word, and `note` the line saying which forms were searched, from the ones the stops it's
// given actually have. The same as GROUPS and Matcher in the Telegram bot's contractions.py.
// Plain script: this project does not use ES modules, so it goes on the global object, which
// is window in the browser and in the CLI's sandbox. /api/places imports it as it is, for
// Navigate's stops (api/_lib/stop-search.js), where there's no window.
(function () {
  const GROUPS = [
    ["Woodlands", "W'lands"], ["Serangoon", "S'goon"], ["Singapore", "S'pore"],
    ["Commonwealth", "C'wealth"], ["Aerospace", "A'space"],
    ["Choa Chu Kang", "Chua Chu Kang", "CCK"], ["Holland Village", "Holland V"],
    ["Bukit", "Bt"], ["Jalan", "Jln"], ["Tanjong", "Tanjung", "Tg"], ["Kampong", "Kampung", "Kg"],
    ["Sungei", "Sg"], ["Upper", "Upp"], ["North", "Nth"], ["South", "Sth"],
    ["Avenue", "Ave"], ["Street", "St"], ["Saint", "St"], ["Road", "Rd"], ["Drive", "Dr"],
    ["Crescent", "Cres"], ["Place", "Pl"], ["Walk", "Wk"], ["Close", "Cl"], ["Court", "Ct"],
    ["Terrace", "Terr"], ["Square", "Sq"], ["Park", "Pk"], ["Mount", "Mt"],
    ["Garden", "Gdn"], ["Gardens", "Gdns"], ["Reservoir", "Resvr"],
    ["After", "Aft"], ["Before", "Bef"], ["Opposite", "Opp"], ["Block", "Blk"],
    ["Interchange", "Int"], ["Terminal", "Ter"], ["Station", "Stn"], ["Checkpoint", "Checkpt"],
    ["Carpark", "Car Park", "Car-park", "Parking", "CP"], ["Playground", "P/G"],
    ["Centre", "Center", "Central", "Ctr", "Ctrl"], ["Market", "Mkt"], ["Food Court", "FC"],
    ["Shopping", "Shop"], ["Complex", "Cplx"], ["Building", "Bldg"], ["Tower", "Twr"],
    ["House", "Hse"], ["Warehouse", "Warehse"], ["Library", "Lib"], ["Post Office", "PO"],
    ["Cemetery", "Cemy"], ["Hospital", "Hosp"], ["Rehabilitation", "Rehab", "Reh"], ["Release", "Rel"],
    ["School", "Sch"], ["Primary", "Pr"], ["Secondary", "Sec"], ["College", "Coll"],
    ["Polytechnic", "Poly"], ["Institute", "Inst"], ["Institution", "Instn"], ["Academy", "Acad"],
    ["Aviation Academy", "Aviation Ac"], ["Methodist", "Meth"], ["Church", "Ch"], ["Temple", "Tp"],
    ["Mosque", "Masjid", "Mque", "Mjd"],
    ["Industrial", "Industry", "Ind"], ["Technology", "Tech"], ["Science", "Sci"],
    ["Engineering", "Engrg"], ["Manufacturing", "Mfg"], ["Processing", "Proc"], ["Facility", "Fty"],
    ["Service", "Svc"], ["Services", "Svcs"], ["Business", "Biz"], ["Corporation", "Corp"],
    ["Group", "Grp"], ["Limited", "Ltd"], ["Private", "Pte"], ["General", "Gen"],
    ["National", "Natl"], ["International", "Intl"],
  ];
  // The most words in any one form.
  const MAX_WORDS = 3;

  // How a form or a typed word is looked up: lowercased, without apostrophes (so "wlands"
  // finds W'lands) or a trailing full stop ("St.", "Reh.").
  const key = (s) => s.toLowerCase().replace(/'/g, '').replace(/\.$/, '');
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  // A form in a name: its apostrophe optional, its words apart by spaces or a hyphen.
  const pattern = (form) => form.toLowerCase().split(/[ -]+/).map((w) => escape(w).replace(/'/g, "'?")).join('[ -]+');

  // Each form's key, to every form it stands for, across all the groups it's in ("St" is in
  // both Street's and Saint's).
  const FORMS = new Map();
  for (const group of GROUPS) {
    for (const form of group) {
      const k = key(form);
      FORMS.set(k, [...new Set([...(FORMS.get(k) || []), ...group])]);
    }
  }

  // Not inside a longer word, so St doesn't match "West" and Pr not "Prince", and maybe with
  // a full stop after, as "St. Andrew's".
  const END = '(?![a-z0-9])\\.?';
  const START = '(?:^|[^a-z0-9])';

  function matcher(query) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const parts = [];
    let swapped = false;
    for (let i = 0; i < words.length;) {
      let n = Math.min(MAX_WORDS, words.length - i);
      while (n > 0 && !FORMS.has(key(words.slice(i, i + n).join(' ')))) n--;
      if (n) {
        const typed = words.slice(i, i + n).join(' ');
        parts.push({ typed, forms: FORMS.get(key(typed)) });
        swapped = true;
        i += n;
      } else {
        parts.push({ literal: words[i].toLowerCase() });
        i++;
      }
    }
    const forms = (p) => `(?:${p.forms.map(pattern).join('|')})${END}`;

    // In one piece, words apart by spaces only: a stop's name and road are apart by a line
    // break, and a query isn't matched across the two.
    const whole = swapped
      ? new RegExp(parts.map((p, i) => p.literal != null ? escape(p.literal) : `${i === 0 ? START : ''}${forms(p)}`).join(' +'))
      : null;
    // Word by word, in any order and across name and road, so "blk 109 bedok" finds Blk 109
    // on Bedok Nth Rd. Each word starts one of the stop's words, and each but the last, which
    // may still be being typed, is all of it: 109 doesn't find Blk 1090, or Blk 2109.
    const each = parts.length > 1
      ? parts.map((p, i) => new RegExp(START + (p.literal != null
        ? escape(p.literal) + (i < parts.length - 1 ? END : '')
        : forms(p))))
      : null;

    return {
      // Whether a stop's lowercased name and road match in one piece with words swapped for
      // their other forms: false for a query with none to swap, matched as typed instead.
      test: (text) => !!whole?.test(text),
      // Whether they match word by word: false for a query of one word.
      words: (text) => !!each?.every((re) => re.test(text)),
      // "Also searched Bt for Bukit": only the forms the stops given really have, other than
      // the one typed.
      note(texts) {
        const found = [];
        for (const p of parts) {
          if (!p.forms) continue;
          const others = p.forms.filter((f) => key(f) !== key(p.typed) &&
            texts.some((t) => new RegExp(`${START}${pattern(f)}${END}`).test(t)));
          // The word typed as the group spells it, since the query's been lowercased.
          const typed = p.forms.find((f) => key(f) === key(p.typed)) || p.typed;
          if (others.length) found.push(`${others.join(', ')} for ${typed}`);
        }
        return found.length ? `Also searched ${found.join('; ')}` : '';
      },
    };
  }

  globalThis.Contractions = { matcher };
})();
