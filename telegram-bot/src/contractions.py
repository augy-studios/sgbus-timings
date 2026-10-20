"""LTA's shortened words in stop and road names ("W'lands Checkpt", "Bt Batok", "Opp Blk 10"),
so a search finds a stop however the word is typed: Bukit finds "Bt Batok Int", and Ave finds
"Avenue 3". Each group is one word's forms, and a word typed as any of them is matched as all
of them. LTA is not consistent (Ctr and Ctrl both stand for Centre and Central), so some groups
are wider than one word. The long forms are matched too, since a few road names keep them
("Lower Peirce Reservoir", "Upper Bukit Timah Rd").

The same as GROUPS in main-site/js/contractions.js."""

import re

GROUPS = [
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
]
# The most words in any one form.
_MAX_WORDS = 3

# Not inside a longer word, so St doesn't match "West" and Pr not "Prince", and maybe with a
# full stop after, as "St. Andrew's".
_START = r"(?:^|[^a-z0-9])"
_END = r"(?![a-z0-9])\.?"


def _key(text: str) -> str:
    """How a form or a typed word is looked up: lowercased, without apostrophes (so "wlands"
    finds W'lands) or a trailing full stop ("St.", "Reh.")."""
    return re.sub(r"\.$", "", text.lower().replace("'", ""))


def _pattern(form: str) -> str:
    """A form in a name: its apostrophe optional, its words apart by spaces or a hyphen."""
    return "[ -]+".join(re.escape(w).replace("'", "'?") for w in re.split(r"[ -]+", form.lower()))


# Each form's key, to every form it stands for, across all the groups it's in ("St" is in
# both Street's and Saint's).
_FORMS: dict = {}
for _group in GROUPS:
    for _form in _group:
        _FORMS.setdefault(_key(_form), [])
        _FORMS[_key(_form)] += [f for f in _group if f not in _FORMS[_key(_form)]]


class Matcher:
    """A query with its shortened words swapped for all their forms."""

    def __init__(self, parts):
        self._parts = parts
        source = " +".join(
            re.escape(p["literal"]) if "literal" in p
            else f"{_START if i == 0 else ''}(?:{'|'.join(_pattern(f) for f in p['forms'])}){_END}"
            for i, p in enumerate(parts)
        )
        self._re = re.compile(source)

    def test(self, text: str) -> bool:
        """Whether a lowercased stop name or road matches."""
        return bool(self._re.search(text or ""))

    def note(self, texts: list) -> str:
        """ "Also searched Bt for Bukit": only the forms the stops given really have, other
        than the one typed."""
        found = []
        for p in self._parts:
            if "forms" not in p:
                continue
            others = [
                f for f in p["forms"]
                if _key(f) != _key(p["typed"]) and any(re.search(f"{_START}{_pattern(f)}{_END}", t) for t in texts)
            ]
            # The word typed as the group spells it, since the query's been lowercased.
            typed = next((f for f in p["forms"] if _key(f) == _key(p["typed"])), p["typed"])
            if others:
                found.append(f"{', '.join(others)} for {typed}")
        return f"Also searched {'; '.join(found)}" if found else ""


def matcher(query: str) -> "Matcher | None":
    """A Matcher for the query, or None when it has none of these words."""
    words = query.split()
    parts = []
    swapped = False
    i = 0
    while i < len(words):
        n = min(_MAX_WORDS, len(words) - i)
        while n and _key(" ".join(words[i:i + n])) not in _FORMS:
            n -= 1
        if n:
            typed = " ".join(words[i:i + n])
            parts.append({"typed": typed, "forms": _FORMS[_key(typed)]})
            swapped = True
            i += n
        else:
            parts.append({"literal": words[i].lower()})
            i += 1
    return Matcher(parts) if swapped else None
