# The Telegram bot's MRT doors (telegram-bot/src/mrt_doors.py) say what the web app says
# (main-site/js/mrt-doors.js), ride for ride: every ride between two platforms of a direction
# in /api/mrt-doors as it was on 10 November 2026 (scripts/fixtures/mrt-doors-2026-11-10.json),
# on its own and with a change to another line where it ends, through the web app's own file in
# Node. And a live trip's widget says them while you're on the train (bot_trips.py).
#
#   python3 scripts/bot-doors-test.py
#
# With the bot's requirements installed and Node on the PATH. Nothing is fetched.
import json, os, random, subprocess, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.environ.update(DB_PATH=os.path.join(tempfile.mkdtemp(), 'bot.db'), BOT_TOKEN='1:a', API_ID='1', API_HASH='x', LTA_ACCOUNT_KEY='x')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))
from src import mrt_doors
from src.trip_widget import public_data

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

DATA = json.load(open(os.path.join(ROOT, 'scripts', 'fixtures', 'mrt-doors-2026-11-10.json'), encoding='utf-8'))
mrt_doors._platforms = DATA['platforms']
mrt_doors._dirs = {p['d'] for p in DATA['platforms']}

# Every ride along a direction, and some with a change where it ends.
by_dir = {}
for p in DATA['platforms']:
    by_dir.setdefault(p['d'], []).append(p)
place = lambda p: {'kind': 'station', 'name': p['n'], 'code': p['c']}
legs = []
for d, ps in by_dir.items():
    ps.sort(key=lambda p: p['o'])
    for i, a in enumerate(ps):
        for b in ps[i + 1:]:
            legs.append([{'mode': 'train', 'route': a['l'], 'name': f"{a['l']} Line", 'from': place(a), 'to': place(b)}, None])
rng = random.Random(10)
for leg, _ in rng.sample(legs, min(400, len(legs))):
    here = [p for p in DATA['platforms'] if p['n'] == leg['to']['name'] and p['l'] != leg['route']]
    if here:
        a = rng.choice(here)
        on = [q for q in by_dir[a['d']] if q['o'] > a['o']]
        if on:
            legs.append([leg, {'mode': 'train', 'route': a['l'], 'name': f"{a['l']} Line", 'from': place(a), 'to': place(rng.choice(on))}])

ours = [mrt_doors.tip(l, n) for l, n in legs]
res = subprocess.run(['node', '-e', '''
const fs = require("fs"), vm = require("vm");
const { data, legs } = JSON.parse(fs.readFileSync(0, "utf8"));
const I18n = { t: (k, en, v) => String(en).replace(/\\{(\\w+)\\}/g, (m, x) => (v && v[x] != null ? v[x] : m)) };
const window = {};
const ctx = { window, I18n, fetch: async () => ({ ok: true, json: async () => data }), console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync("main-site/js/mrt-doors.js", "utf8"), ctx);
window.MrtDoors.load().then(() => { console.log(JSON.stringify(legs.map(([l, n]) => window.MrtDoors.tip(l, n)))); process.exit(0); });
'''], input=json.dumps({'data': DATA, 'legs': legs}), capture_output=True, text=True, cwd=ROOT, timeout=120)
if res.returncode:
    print(res.stderr[-800:])
theirs = json.loads(res.stdout or '[]')
differ = [(l, n, a, b) for (l, n), a, b in zip(legs, ours, theirs) if a != b]
said = sum(1 for t in ours if t)
ok(f'the same words as the web app, ride for ride ({len(legs)} rides, {said} with doors)', len(theirs) == len(legs) and not differ,
   differ[:1] and f"{differ[0][0]['from']['code']}>{differ[0][0]['to']['code']}: {differ[0][2]!r} vs {differ[0][3]!r}")
ok('changes across the platform said', any(t and 'across the platform' in t for t in ours))
ok('changes at the same station said', any(t and t.startswith('Changing at') for t in ours))
ok('where the number is said', any(t and 'The door number is' in t for t in ours))

# ---------- in the widget ----------
parts = [{'kind': 'walk', 'label': 'Walk', 'to': 'Paya Lebar'}, {'kind': 'train', 'label': 'EW Line', 'to': 'Raffles Place', 'y': 'Getting off at Raffles Place: door 10 or 15 for the escalators.'}]
eta = lambda i, **x: {'name': 'Sam', 'to': {'label': 'One Raffles Place', 'lat': 1.284, 'lng': 103.851}, 'arriveAt': 1, 'legIndex': i, 'legCount': 2,
                      'leg': {'label': parts[i]['label'], 'to': parts[i]['to'], 'stopsLeft': 3, 'kind': parts[i]['kind']}, **x}
ok('on the train: its doors in the widget', json.loads(public_data(eta(1), 1, 0, parts)).get('y', '').startswith('Getting off at Raffles Place: door 10'))
walking = json.loads(public_data(eta(0), 1, 0, parts))
ok('walking to it: its doors there to see ahead, on its part', 'y' not in walking and walking['p'][1][3].startswith('Getting off at Raffles Place'))
ok('a train already ridden carries none', all(len(p) == 3 for p in json.loads(public_data(eta(1), 1, 0, parts))['p']))
many = [{'kind': 'train', 'label': f'{c} Line', 'to': 'Somewhere far along the line ' * 2, 'y': ('Changing at Somewhere for the Downtown Line: door 1 or 2 for the escalators; door 3 for the lift. The door number is at the top right of each door.')} for c in ['EW', 'NS', 'DT', 'CC', 'NE', 'TE']]
long_eta = {**eta(0), 'legCount': 6, 'leg': {'label': 'EW Line', 'to': 'x', 'stopsLeft': 3, 'kind': 'train'}}
packed = public_data(long_eta, 1, 0, many)
kept = [j for j, p in enumerate(json.loads(packed)['p']) if len(p) == 4]
ok("six trains: inside 1024 bytes, the nearest trains' doors kept first", len(packed.encode()) <= 1024 and kept == list(range(1, 1 + len(kept))) and json.loads(packed).get('y'), (len(packed.encode()), kept))
ok('arrived: no more', 'y' not in json.loads(public_data(eta(1, ended=True), 1, 0, parts)))

print('\n%d failed' % fails if fails else '\nAll passed'); sys.exit(1 if fails else 0)
