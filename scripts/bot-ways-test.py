# The Telegram bot's /nav sorts, tags and prices its ways as the web app does: telegram-bot/src/ways.py
# against main-site/js/ways.js, through the web app's own file in Node, on ways the site's own
# planner finds over the app's saved bus stops and routes (flutter/test/fixtures/). Then the /nav
# panel: the chat's sort, its preferred buses and a place's, the fare for its fare type, and the
# buses you'd catch, live, with how full each is; one way's every bus straight there; and the
# settings and place they come from.
#
#   python3 scripts/bot-ways-test.py
#
# With the bot's requirements installed and Node on the PATH. Its own throwaway database; nothing
# is fetched.
import json, os, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.environ.update(DB_PATH=os.path.join(tempfile.mkdtemp(), 'bot.db'), BOT_TOKEN='1:a', API_ID='1', API_HASH='x', LTA_ACCOUNT_KEY='x')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))
from src import ways as W
from src.nav_view import build_nav_option, build_nav_panel, live_lines
from src.saved_places import get_place, set_place, set_place_buses
from src.user_settings import get_fare_type, get_preferred_buses, set_fare_type, set_nav_sort, set_preferred_buses

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

# ---------- the same as the site's, way for way ----------

PLACES = {
    'kallang': {'lat': 1.3115, 'lng': 103.8714}, 'home': {'lat': 1.3390, 'lng': 103.9297},
    'bedok': {'lat': 1.324736, 'lng': 103.929256}, 'raffles': {'lat': 1.28435, 'lng': 103.851073},
    'jurong': {'lat': 1.3331, 'lng': 103.7425}, 'punggol': {'lat': 1.4043, 'lng': 103.9021},
    'woodlands': {'lat': 1.4369, 'lng': 103.7864}, 'jb': {'lat': 1.4655, 'lng': 103.7578},
}
TRIPS = [('kallang', 'home'), ('bedok', 'raffles'), ('jurong', 'punggol'), ('woodlands', 'jb'), ('raffles', 'kallang')]
BUSES = [[], ['228'], ['21', '51'], ['9', '2']]
res = subprocess.run(['node', '--input-type=module', '-e', '''
import fs from "node:fs";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";
import { buildGraph } from "./main-site/js/nav-core/network.js";
import { planFor } from "./main-site/js/nav-core/plan.js";
const { places, trips, buses } = JSON.parse(fs.readFileSync(0, "utf8"));
const gz = (n) => JSON.parse(gunzipSync(fs.readFileSync(`flutter/test/fixtures/${n}.json.gz`)).toString());
const data = (n) => JSON.parse(fs.readFileSync(`main-site/data/${n}.json`, "utf8"));
const campus = { nus: data("campus/nus"), ntu: data("campus/ntu"), config: data("campus/config"), shuttles: data("campus/shuttles") };
const graph = buildGraph(data("rail"), gz("bus-stops"), gz("bus-routes"), { open: false, campus });
const store = {};
const ctx = { window: {}, localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("main-site/js/ways.js", "utf8"), ctx);
const Ways = ctx.window.Ways;
const out = [];
for (const [a, b] of trips) {
  const options = planFor(graph, places[a], places[b], { mode: "leave", ms: Date.parse("2026-10-30T08:30+08:00") }, null).options;
  const id = new Map(options.map((o, i) => [o, i]));
  for (const list of buses) {
    const set = new Set(list);
    out.push({
      trip: [a, b], buses: list, options,
      order: Object.fromEntries(Ways.SORTS.map((s) => [s, Ways.order(options, s, set).map((o) => id.get(o))])),
      tags: [...Ways.tags(options, set).values()],
      fares: Object.fromEntries(Ways.FARE_TYPES.map((t) => [t, options.map((o) => Ways.fare(o, t))])),
    });
  }
}
const bands = [0, 1, 3.2, 3.25, 3.3, 4.2, 4.21, 7.2, 7.3, 12.34, 40.2, 40.3, 90].map((km) => Object.fromEntries(Ways.FARE_TYPES.map((t) => [t, Ways.band(km, Ways.FARES[t])])));
const typed = ["228, 69 225w", "  nr1/ct8;; 12e", "x y 228 228", "", "abcdef 1234567 99"].map((t) => Ways.parseBuses(t));
console.log(JSON.stringify({ out, bands, typed, tables: Ways.FARES }));
'''], input=json.dumps({'places': PLACES, 'trips': TRIPS, 'buses': BUSES}), capture_output=True, text=True, cwd=ROOT, timeout=300)
if res.returncode:
    print(res.stderr[-1200:])
site = json.loads(res.stdout or '{"out": [], "bands": [], "typed": [], "tables": {}}')

ok('the fare tables are the site\'s', site['tables'] == W.FARES)
ok('the site planned ways to check against', sum(len(c['options']) for c in site['out']) > 20, len(site['out']))
for case in site['out']:
    opts, buses = case['options'], set(case['buses'])
    label = f"{case['trip'][0]} to {case['trip'][1]}, buses {case['buses'] or 'none'}"
    for sort in W.SORTS:
        ours = [opts.index(o) for o in W.order(opts, sort, buses)]
        ok(f'{label}: in the site\'s order by {sort}', ours == case['order'][sort], f'{ours} vs {case["order"][sort]}')
    ok(f'{label}: the site\'s tags', W.tags(opts, buses) == case['tags'], f'{W.tags(opts, buses)} vs {case["tags"]}')
    for t in W.FARE_TYPES:
        ours = [W.fare(o, t) for o in opts]
        same = all((a is None and b is None) or (a and b and a['cents'] == b['cents'] and abs(a['km'] - b['km']) < 0.11) for a, b in zip(ours, case['fares'][t]))
        ok(f'{label}: the site\'s {t} fares', same, f'{ours} vs {case["fares"][t]}')
for km, theirs in zip([0, 1, 3.2, 3.25, 3.3, 4.2, 4.21, 7.2, 7.3, 12.34, 40.2, 40.3, 90], site['bands']):
    ok(f'{km} km: the site\'s band in every table', {t: W.band(km, W.FARES[t]) for t in W.FARE_TYPES} == theirs, theirs)
for text, theirs in zip(["228, 69 225w", "  nr1/ct8;; 12e", "x y 228 228", "", "abcdef 1234567 99"], site['typed']):
    ok(f'bus numbers in {text!r} read as the site reads them', W.parse_buses(text) == theirs, f'{W.parse_buses(text)} vs {theirs}')
ok('across the Causeway, no fare', all(W.fare(o) is None for c in site['out'] if c['trip'] == ['woodlands', 'jb'] for o in c['options'] if any(l.get('customs') for l in o['legs'])))
ok('an express bus is $1 more for adults only', (lambda o: W.fare(o, 'adult', lambda no: 'EXPRESS')['cents'] - W.fare(o, 'adult')['cents'] == 100
    and W.fare(o, 'student', lambda no: 'EXPRESS') == W.fare(o, 'student'))(next(o for c in site['out'] for o in c['options'] if any(l['mode'] == 'bus' for l in o['legs']))))

# ---------- the /nav panel ----------

CHAT = 7
walk = lambda m, minutes: {'mode': 'walk', 'metres': m, 'minutes': minutes}
stop = lambda code, name: {'kind': 'stop', 'code': code, 'name': name}
station = lambda name: {'kind': 'station', 'name': name}
def bus(route, a, b, path, stops=4):
    return {'mode': 'bus', 'route': route, 'from': a, 'to': b, 'stops': stops, 'minutes': 10, 'path': path}
quick = {'minutes': 37, 'mix': 'TB', 'routes': ['EW', '225W'], 'legs': [walk(40, 1), {'mode': 'train', 'route': 'EW', 'from': station('Kallang'), 'to': station('Bedok'), 'stops': 6, 'minutes': 12, 'path': [[1.3115, 103.8714], [1.324, 103.93]]},
         walk(60, 1), bus('225W', stop('84009', 'Bedok Int'), stop('84371', 'Blk 107'), [[1.324, 103.93], [1.335, 103.935]]), walk(900, 15)]}
door = {'minutes': 41, 'mix': 'TB', 'routes': ['EW', '228'], 'legs': [walk(40, 1), {'mode': 'train', 'route': 'EW', 'from': station('Kallang'), 'to': station('Bedok'), 'stops': 6, 'minutes': 12, 'path': [[1.3115, 103.8714], [1.324, 103.93]]},
        walk(60, 1), bus('228', stop('84009', 'Bedok Int'), stop('84639', 'Aft Waterfront Waves'), [[1.324, 103.93], [1.3386, 103.9294]]), walk(150, 3)]}
straight = {'minutes': 45, 'mix': 'B', 'routes': ['21'], 'legs': [walk(240, 4), bus('21', stop('80219', 'Aft Lor 1 Geylang'), stop('84639', 'Aft Waterfront Waves'), [[1.3115, 103.8714], [1.3386, 103.9294]], 20), walk(30, 1)]}
result = {'options': [quick, door, straight], 'traffic': None, 'others': {}}
start = {'label': 'Kallang Stn', 'lat': 1.311532, 'lng': 103.871372}
home = {'label': 'Home', 'lat': 1.3390, 'lng': 103.9297}
nb = lambda m, load: {'etaMs': m * 60000, 'load': load}
live = {'80219': {'services': [{'serviceNo': '21', 'next': nb(7, 'SEA'), 'next2': nb(19, 'SDA'), 'next3': nb(25, 'LSD')}, {'serviceNo': '51', 'next': nb(3, 'SEA'), 'next2': None, 'next3': None}]}}
direct = {('80219', '84639'): ['21', '51']}

def panel(**kw):
    rich, buttons = build_nav_panel(CHAT, start, home, result=result, live=live, direct=direct, **kw)
    return rich['fallback'], [b.text for row in buttons for b in row]

text, labels = panel()
lines = [l for l in text.splitlines() if l[:2] in ('1.', '2.', '3.')]
ok('Best by default: the long walk sinks below the bus to the door', lines[0].startswith('1. ~41 min') and '228' in lines[0], lines)
ok('each way with its fare, an adult\'s', '~S$' in lines[0] and all('~S$' in l for l in lines), lines)
ok('tagged with what each is best at', '⚡ Fastest' in text and '🚶 Least walking' in text and '🔁 Fewest changes' in text, text)
ok('the buses you\'d catch, live, for a way starting on a bus: its own first, then the soonest', '🟢 Live from Aft Lor 1 Geylang:' in text
   and text.index('🚌 21 · 7 min 🟢 · 19 min 🟡 · 25 min 🔴') < text.index('🚌 51 · 3 min 🟢'), text)
ok('no live buses for a way starting on a train', text.count('🟢 Live from') == 1, text)
ok('Best, Fastest, Least walking and Fewest changes to sort by, under the ways, Best ticked', labels[3:7] == ['✅ Best', 'Fastest', 'Least walking', 'Fewest changes'], labels)
ok('says how they\'re sorted, and where the fares come from', 'by best.' in text and 'adult card fares' in text and '/settings' in text, text)

set_nav_sort(CHAT, 'fastest')
text, labels = panel()
ok('by Fastest, kept for the chat: the quickest first', [l for l in text.splitlines() if l.startswith('1.')][0].startswith('1. ~37 min') and '✅ Fastest' in labels, text)
set_nav_sort(CHAT, 'walk')
text, _ = panel()
ok('by Least walking: the bus to the door, then the bus all the way, then the long walk',
   [l.split(' · ')[1] for l in text.splitlines() if l[:2] in ('1.', '2.', '3.')] == ['🚆 EW → 🚌 228', '🚌 21', '🚆 EW → 🚌 225W'], text)
set_nav_sort(CHAT, 'best')

set_preferred_buses(CHAT, ['21'])
text, _ = panel()
ok('a preferred bus in /settings: Your bus, and first in Best', [l for l in text.splitlines() if l.startswith('1.')][0].startswith('1. ~45 min') and '⭐ Your bus' in text, text)
ok('kept as typed', get_preferred_buses(CHAT) == ['21'])
set_preferred_buses(CHAT, [])
set_place(CHAT, 'home', 'Home', 1.3390, 103.9297)
set_place_buses(CHAT, 'home', W.parse_buses('228'))
text, _ = panel()
ok('a bus to Home, going home: Your bus on the way that rides it', '⭐ Your bus' in [l for l in text.splitlines()][[l.startswith('1.') for l in text.splitlines()].index(True) + 1] and get_place(CHAT, 'home')['buses'] == ['228'], text)
rich, _ = build_nav_panel(CHAT, start, {'label': 'Raffles', 'lat': 1.28435, 'lng': 103.851073}, result=result, live=live, direct=direct)
ok('not going anywhere near Home, Home\'s bus is just another', '⭐ Your bus' not in rich['fallback'])

set_fare_type(CHAT, 'student')
text, _ = panel()
ok('a student\'s fares, with the fare type picked in /settings', get_fare_type(CHAT) == 'student' and 'student card fares' in text and '~S$0.' in text, text)
set_fare_type(CHAT, 'adult')
text, _ = panel(clock_times=True)
ok('clock times, by Settings\' Bus times', '🚌 21 · ' in text and ' min 🟢' not in text.split('🚌 21 · ')[1].splitlines()[0], text)

# ---------- one way ----------
rich, _ = build_nav_option(start, home, straight, {1: live['80219']}, direct={1: ['21', '51']})
ok('one way: its fare at the top', rich['fallback'].splitlines()[0].startswith('🧭 ~45 min · ~S$'), rich['fallback'])
ok('and every bus straight to where you get off, not just its own', '🟢 Live, buses straight to Aft Waterfront Waves (84639):' in rich['fallback']
   and '🚌 21 · 7 min' in rich['fallback'] and '🚌 51 · 3 min' in rich['fallback'], rich['fallback'])
rich, _ = build_nav_option(start, home, straight, {1: None})
ok('no live timings: says so', 'No live timings for this bus right now.' in rich['fallback'])
ok('a bus with no timing still listed when it\'s the way\'s own', live_lines({'route': '21'}, {'services': [{'serviceNo': '51', 'next': nb(3, 'SEA'), 'next2': None, 'next3': None}]}, ['51'])[0] == '🚌 21 · no live timing')

# ---------- the last trains (the site's api/_nav/last-trains.js) ----------
import copy
late = copy.deepcopy(quick)
late['legs'][1].update(lastTrain='00:12', lastTrainRank=2)
rich, _ = build_nav_panel(CHAT, start, home, result={'options': [late], 'traffic': None, 'others': {}}, live=live, direct=direct)
ok('a way whose train is among the last three says so in its line', '⏰ 2nd last EW train, last 00:12' in rich['fallback'], rich['fallback'])
rich, _ = build_nav_option(start, home, late, {3: None})
ok('and its ride says how many are left, and when the last leaves', 'Only the last 2 trains to Bedok station are left today. The last is at 00:12.' in rich['fallback'], rich['fallback'])
late['legs'][1].update(lastTrainRank=1)
rich, _ = build_nav_option(start, home, late, {3: None})
ok("the last one: don't miss it", "Last train to Bedok station from here today is at 00:12. Don't miss it." in rich['fallback'], rich['fallback'])

# ---------- a shuttle that's ending (help desk #22, shuttles.json's `ends`) ----------
from datetime import date
from src.nav_view import ending_lines
NOTICE = "⚠️ IKEA's shuttle bus service ends on 31 Dec 2026. Buses 296, 460 and 68 from Tampines Interchange stop near IKEA."
ikea = {'minutes': 57, 'legs': [
    {'mode': 'bus', 'route': 'IKEA S', 'stops': 1, 'minutes': 28, 'from': {'kind': 'stop', 'code': 'ikea-serangoon-mrt', 'name': 'Serangoon Stn Exit E'},
     'to': {'kind': 'stop', 'code': 'ikea-tampines', 'name': 'IKEA Tampines'}, 'campus': {'uni': 'ikea', 'name': 'IKEA', 'ends': '2026-12-31',
                                                                                'instead': {'buses': ['296', '460', '68'], 'from': 'Tampines Interchange'}}},
    {'mode': 'walk', 'metres': 30, 'minutes': 1, 'to': {'kind': 'place'}}]}
ok('ending: a way on it says so on 31 Dec 2026', ending_lines(ikea, date(2026, 12, 31)) == [NOTICE], ending_lines(ikea, date(2026, 12, 31)))
ok('…and not from 1 Jan 2027', ending_lines(ikea, date(2027, 1, 1)) == [])
ok('…nor on a shuttle with no end, or a way with none', ending_lines({'legs': [{'mode': 'bus', 'route': 'A1', 'campus': {'name': 'NUS'}}, {'mode': 'bus', 'route': '21'}]}) == [])
plain = {'legs': [{'mode': 'bus', 'route': 'X1', 'campus': {'name': 'X', 'ends': '2026-12-31'}}]}
ok('ending: without `instead`, its first sentence alone', ending_lines(plain, date(2026, 12, 31)) == ["⚠️ X's shuttle bus service ends on 31 Dec 2026."], ending_lines(plain, date(2026, 12, 31)))
two = {'legs': [{'mode': 'bus', 'route': 'X1', 'campus': {'name': 'X', 'ends': '2026-12-31', 'instead': {'buses': ['296', '460'], 'from': 'Y Int'}}}]}
ok('ending: two buses said as a list', ending_lines(two, date(2026, 12, 31))[0].endswith(' Buses 296 and 460 from Y Int stop near X.'), ending_lines(two, date(2026, 12, 31)))
if date.today() <= date(2026, 12, 31):
    rich, _ = build_nav_option(start, home, ikea, {})
    ok('ending: at the top of the way, under its title', rich['fallback'].splitlines()[3] == NOTICE, rich['fallback'])
    rich, _ = build_nav_panel(CHAT, start, home, result={'options': [ikea, straight], 'traffic': None, 'others': {}}, live=live, direct=direct)
    lines = rich['fallback'].splitlines()
    first = next(i for i, l in enumerate(lines) if 'IKEA S' in l)
    ok('ending: under its way in the list, and only that one', NOTICE in [l.strip() for l in lines[first + 1:first + 3]] and rich['fallback'].count(NOTICE) == 1, rich['fallback'])

print('\nAll passed' if not fails else f'\n{fails} failed')
sys.exit(1 if fails else 0)
