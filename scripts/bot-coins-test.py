# The Telegram bot's uwuCoins, feats and team runs (telegram-bot/src/rides.py, coins.py,
# feats.py, teams.py, coins_view.py, team_view.py, sync_bot.py): rides judged real as the web app
# judges them, a trip's coins by the web app's formula, the wheel and its egg links, the feats
# solo and from a team, a team's rides and trips sent and folded, and uwuCoins in /sync.
# Telegram's Bot API, the site's share links and its team server are stand-ins (httpx's
# MockTransport); the team's fold is checked against the web app's own (main-site/js/team.js)
# in Node.
#
#   python3 scripts/bot-coins-test.py
#
# With the bot's requirements installed and Node on the PATH. The database is a throwaway one.
import asyncio, json, os, random, subprocess, sys, tempfile, time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TMP = tempfile.mkdtemp()
os.environ.update(DB_PATH=os.path.join(TMP, 'bot.db'), BOT_TOKEN='123:abc', API_ID='1', API_HASH='x',
                  LTA_ACCOUNT_KEY='x', BOT_API_TOKEN='bot-secret', WEBAPP_URL='https://sgbus.test/', NAV_API_URL='https://sgbus.test/')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))

import httpx
from src import coins, coins_view, feats, http_client, rides, sync_bot, team_view, teams
from src.db import db

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

NOW = int(time.time() * 1000)
MIN = 60000

# ---------- rides judged real (js/rides.js) ----------
bus = {'kind': 'bus', 'label': 'Bus 12', 'service': '12', 'board': '01012', 'alight': '01019', 'minutes': 10,
       'points': [[1.300, 103.850], [1.302, 103.852], [1.304, 103.854], [1.306, 103.856], [1.308, 103.858], [1.310, 103.860]]}
seen = []
rides.see(seen, [bus], 0, bus['points'][0], 10, NOW)
for k in (1, 2):
    rides.see(seen, [bus], 0, bus['points'][k], 10, NOW + k * 2 * MIN)
rides.see(seen, [bus], 0, bus['points'][-1], 10, NOW + 9 * MIN)
ok('a ride seen at the start, on the way and at the end, in good time: real', rides.verdict(bus, seen[0])['ok'])
quick = []
rides.see(quick, [bus], 0, bus['points'][0], 10, NOW)
rides.see(quick, [bus], 0, bus['points'][-1], 10, NOW + 2 * MIN)
ok('too quick for the ride: not real', rides.verdict(bus, quick[0])['why'] == 'too quick for the ride')
skipped = []
rides.see(skipped, [bus], 0, bus['points'][0], 10, NOW)
rides.see(skipped, [bus], 0, bus['points'][-1], 10, NOW + 9 * MIN)
ok('a bus never seen on the way: not real', rides.verdict(bus, skipped[0])['why'] == 'not seen along the way')
rough = []
rides.see(rough, [bus], 0, bus['points'][0], 500, NOW)
ok('a rough fix is left out', not rough or rough[0] is None or rough[0]['startAt'] is None)
ok('judged once', rides.judge(seen, [bus], 0) is True and seen[0]['judged'] and rides.judge(seen, [bus], 0) is True)

# ---------- a trip's coins (js/coins.js, forTrip) ----------
with db:
    db.execute("INSERT OR REPLACE INTO bus_services (service_no, operator) VALUES ('12', 'SBST'), ('174', 'SMRT')")
train = {'kind': 'train', 'label': 'EW Line', 'minutes': 12, 'points': [[1.318, 103.893], [1.3164, 103.8829], [1.3115, 103.8714], [1.3073, 103.863]]}
got = coins.for_trip([{'kind': 'walk', 'points': [[1.3, 103.85], [1.3, 103.851]]}, bus, train], [None, {'ok': True}, {'ok': False}])
km = sum(rides.metres(l['points'][i - 1], l['points'][i]) for l in (bus, train) for i in range(1, len(l['points']))) / 1000
ok('a trip\'s coins, part by part, as the web', got and got['parts'] == {'finish': 5, 'km': min(30, int(km // 2)), 'changes': 3, 'busOps': 4, 'trainOps': 4, 'lines': 2}, got)
ok('no real ride, no coins', coins.for_trip([bus], [{'ok': False}]) is None)

# ---------- the stand-ins ----------
calls, links, team_db = [], {}, {'events': [], 'members': []}

def handler(request):
    u = request.url
    body = json.loads(request.content) if request.content else None
    calls.append((request.method, u.host, u.path, dict(u.params), body))
    if u.host == 'api.telegram.org':
        m = u.path.rsplit('/', 1)[1]
        if m in ('sendWidget', 'sendSharedWidget'):
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': 500 + len(calls), 'widget': {'id': body.get('widget_id') or f'w{len(calls)}'}}})
        return httpx.Response(200, json={'ok': True, 'result': True})
    if u.path == '/api/share' and request.method == 'POST':
        eid = f'egg{len(links):07d}'
        links[eid] = body
        return httpx.Response(200, json={'id': eid, 'path': f'/egg/{eid}'})
    if u.path == '/api/team':
        if request.method == 'GET':
            if not team_db.get('id'):
                return httpx.Response(404, json={'error': 'gone'})
            return httpx.Response(200, json={'id': team_db['id'], 'name': team_db['name'], 'members': team_db['members'], 'events': team_db['events']})
        a = body.get('action')
        if a in ('create', 'join'):
            if a == 'create':
                team_db.update(id='nightowls1', name=body['team'])
            mid = f'm{len(team_db["members"]):09d}'
            team_db['members'].append({'id': mid, 'name': body['name'], 'joinedAt': NOW - 3600000, 'left': False})
            return httpx.Response(200, json={'id': team_db['id'], 'name': team_db['name'], 'member': {'id': mid, 'secret': 's' * 32}})
        if a == 'add':
            for e in body['events']:
                team_db['events'].append({'eid': e['eid'], 'member': body['member'], 'kind': e['kind'], 'data': e['data'], 'at': int(time.time() * 1000)})
            return httpx.Response(204)
        if a == 'leave':
            return httpx.Response(204)
    return httpx.Response(404, json={})

http_client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
tg = lambda m: [c for c in calls if c[1] == 'api.telegram.org' and c[2].endswith('/' + m)]

class FakeClient:
    def __init__(self): self.sent = []
    async def send_message(self, chat, text, **kw): self.sent.append((chat, text))
    async def get_me(self):
        class Me: username = 'sgbus_app'
        return Me()

async def main():
    A, B = 101, 202

    # ---------- the wheel ----------
    await coins_view.send_wheel(A)
    w = tg('sendWidget')[-1][4]
    ok('/coins: a wheel of its own, not shared, with the balance', w.get('is_shared') is None and json.loads(w['chat_data']) == {'r': 1, 'b': 0, 's': -1})
    ok('with Spin under it', w['reply_markup']['inline_keyboard'][0][0]['text'] == '🎡 Spin for 100')
    try:
        await coins_view.spin(A)
        ok('no spin without 100 uwuCoins', False)
    except coins.CoinError as err:
        ok('no spin without 100 uwuCoins', '100 more uwuCoins' in str(err), str(err))
    coins.add(A, 250, 'trip', {'trip': 't1'})
    random.seed(4)
    got = await coins_view.spin(A)
    state = json.loads(tg('editMessageWidgetData')[-1][4]['chat_data'])
    slot = coins.SLOTS[state['s']]
    ok('a spin: 100 taken, the slot it stopped on, and the win, in the wheel\'s state',
       state['f'] == 150 and state['b'] == 150 + slot.get('coins', 0) and state['w'] == slot.get('coins', 0) and state['t'] > 0, state)
    ok('the balance is what the log adds up to', coins.balance(A) == state['b'])
    try:
        await coins_view.spin(A)
        ok('not again while the wheel turns', False)
    except coins.CoinError as err:
        ok('not again while the wheel turns', 'still turning' in str(err))
    # The egg slot.
    with db:
        db.execute('UPDATE coin_widgets SET spun_at = 0 WHERE chat_id = ?', (A,))
    egg = await coins.spin(A, rng=type('R', (), {'randrange': lambda self, n: 0})())
    ok('the egg slot: a link of its own, from the site, made by the bot', egg['link'] and egg['link'].startswith('https://sgbus.test/egg/') and links and list(links.values())[-1] == {'kind': 'egg', 'data': {}})
    ok('and the spin paid for it', egg['coins'] == 0 and egg['after'] == egg['before'])
    ok('the egg message says it works once and doesn\'t expire', 'works once' in coins_view.egg_message(egg['link']) and "doesn't expire" in coins_view.egg_message(egg['link']))
    ok('history lists it', 'Easter egg' in coins_view.history(A))

    # ---------- feats ----------
    for no in feats.UP:
        rides.keep(A, {'kind': 'bus', 'service': no, 'points': [[1.3, 103.8], [1.31, 103.81]]}, 'tx')
    new = feats.ride_done(A, {'kind': 'bus', 'service': '90', 'board': '01012', 'points': [[1.3, 103.8], [1.31, 103.81]]})
    ok('12, 34, 56, 78 and 90 ridden: the feat, once, with its 100 uwuCoins', new == ['up'] and feats.ride_done(A, bus) == [])
    ok('a feat\'s coins in the log', any(r['why'] == 'feat' and r['info'].get('feat') == 'up' and r['n'] == 100 for r in coins.log(A, 30)))
    rides.keep(A, {'kind': 'bus', 'service': '5', 'points': [[1.3, 103.8], [1.31, 103.81]]}, 'tx')
    feats.ride_done(A, {'kind': 'bus', 'alight': '99189', 'service': '5', 'points': [[1.3, 103.8], [1.31, 103.81]]})
    ok('on or off at 01012 and 99189: First to last', 'first' in feats.done(A))
    ok('the long way round: a trip of over three hours', feats.trip_done(A, [1.3, 103.8], [1.35, 103.9], 3 * 3600000 + 1, False) == ['long'])
    ok('there and back again: by way of somewhere well away, back where it started', feats.trip_done(A, [1.3, 103.8], [1.3005, 103.8], 3600000, True) == ['loop'])
    ok('down the old railway: Cantonment to King Albert Park', feats.trip_done(A, feats.KTM['cantonment'], feats.KTM['kingAlbertPark'], 3600000, False) == ['ktm'])
    ach = coins_view.achievements(A)
    ok('/achievements: what\'s done, and how far along the rest', '5 of 9 feats done' in ach and '✓ done' in ach and '(0 of 9)' in ach, ach.splitlines()[0])

    # ---------- team runs ----------
    made = await teams.create(B, 'Night Owls', 'Bea')
    ok('/team Night Owls: a team on the team server, kept', made['id'] == 'nightowls1' and teams.mine(B)['team_name'] == 'Night Owls')
    await team_view.show(B)
    tw = tg('sendWidget')[-1][4]
    tstate = json.loads(tw['public_data'])
    ok('its widget: shared, the team\'s name, its members, each feat', tw['is_shared'] and tstate['n'] == 'Night Owls' and tstate['m'] == ['Bea'] and len(tstate['h']) == 9)
    ok('Invite: the bot\'s link, and the web app\'s', 'start%3Dteam_nightowls1' in tw['reply_markup']['inline_keyboard'][0][0]['url'] and '%23team%2Fnightowls1' in tw['reply_markup']['inline_keyboard'][0][0]['url'])
    joined = await teams.join(A, 'nightowls1', 'Alex')
    await team_view.show(A)
    ok('another chat joins by its code, and gets the same widget', joined['name'] == 'Night Owls' and tg('sendSharedWidget')[-1][4]['widget_id'] == db.execute("SELECT widget_id FROM team_widgets").fetchone()[0])
    # Bea rides every line but one, Alex the last: Every line ridden, for both.
    for line in rides.LINES[:-1]:
        teams.queue(B, 'ride', {'mode': 'train', 'line': line})
    await teams.flush(B)
    teams.queue(A, 'ride', {'mode': 'train', 'line': rides.LINES[-1], 'first': ['99189']})
    await teams.flush(A)
    ok('rides sent to the team, each once, with its own id', len(team_db['events']) == 9 and len({e['eid'] for e in team_db['events']}) == 9
       and all(len(e['eid']) <= 40 for e in team_db['events']))
    ok('the outbox is empty once they\'re taken', not db.execute('SELECT 1 FROM team_outbox').fetchone())
    # A trip handed on: Bea to Woodlands, Alex from there to Cantonment, over three hours in all.
    t0 = NOW - 4 * 3600000
    team_db['events'].append({'eid': 'x1', 'member': team_db['members'][0]['id'], 'kind': 'trip', 'at': NOW,
                              'data': {'start': [1.35, 103.85], 'end': feats.KTM['woodlands'], 'via': None, 'startedAt': t0, 'endedAt': t0 + 2 * 3600000}})
    team_db['events'].append({'eid': 'x2', 'member': team_db['members'][1]['id'], 'kind': 'trip', 'at': NOW,
                              'data': {'start': feats.KTM['woodlands'], 'end': feats.KTM['cantonment'], 'via': None, 'startedAt': t0 + 2 * 3600000 + 10 * MIN, 'endedAt': t0 + 3 * 3600000 + 30 * MIN}})
    client = FakeClient()
    folded = await team_view.refresh('nightowls1', client)
    ok('the team\'s feats: every line, the long way round and the old railway, handed on', {'lines', 'long', 'ktm'} <= set(folded['done']), folded['done'])
    ok('Bea gets them, as the team\'s', {'lines', 'long', 'ktm'} <= set(feats.done(B)) and feats.done(B)['lines']['team'] == 'Night Owls')
    ok('and is told', any(c == B and 'Night Owls' in t and 'Every line ridden' in t for c, t in client.sent))
    edited = json.loads(tg('editSharedWidgetData')[-1][4]['public_data'])
    ok('the widget updated: every line done, the long way round in minutes, the rides', edited['h'][0] == [9, 9] and edited['h'][4][1] == 180 and edited['k'] == 9, edited)
    # The web app's own fold, on the same team.
    web = subprocess.run(['node', '-e', '''
const fs = require("fs"), vm = require("vm");
const team = JSON.parse(fs.readFileSync(0, "utf8"));
const window = { addEventListener() {}, dispatchEvent() {}, I18n: null };
const ctx = { window, document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, readyState: "complete" }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, CustomEvent: class {}, console, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: () => 0 };
vm.createContext(ctx);
for (const f of ["js/eggs.js", "js/team.js"]) vm.runInContext(fs.readFileSync("main-site/" + f, "utf8"), ctx);
const out = window.Team.fold(team);
console.log(JSON.stringify({ done: Object.keys(out.done).sort(), have: out.have, rides: out.rides }));
process.exit(0);
'''], input=json.dumps(team_db | {'id': 'nightowls1', 'name': 'Night Owls'}), capture_output=True, text=True, cwd=ROOT, timeout=60)
    if web.returncode:
        print(web.stderr[-800:])
    theirs = json.loads(web.stdout or 'null')
    ok('the same as the web app works it out', theirs and theirs['done'] == sorted(folded['done']) and theirs['rides'] == folded['rides']
       and all(theirs['have'][k] == v for k, v in folded['have'].items()), theirs)
    ok('Alex had the long way round from the team, not twice', list(feats.done(A)).count('long') == 1)

    # ---------- /sync ----------
    favs = sync_bot.own_favs(A)
    ok('/sync sends the balance, with the chat\'s own id', favs['coins'] == [{'id': f'tg-{A}', 'balance': coins.balance(A)}])
    before = coins.balance(B)
    saved = sync_bot.merge(B, {'coins': [{'id': 'w-abc123', 'balance': 340}]})
    ok('taking another\'s adds it', coins.balance(B) == before + 340 and saved.get('uwuCoins') == 1, saved)
    sync_bot.merge(B, {'coins': [{'id': f'tg-{B}', 'balance': 999}]})
    ok('never its own back', coins.balance(B) == before + 340)
    sync_bot.merge(B, {'coins': [{'id': 'w-abc123', 'balance': -5}, {'id': 'x', 'balance': 1.5}]})
    ok('nothing that isn\'t a balance', coins.balance(B) == before + 340)
    ok('the bot says it keeps coins', 'coins' in sync_bot.KINDS)

    # ---------- the team's gone ----------
    team_db.clear()
    team_db.update(events=[], members=[])
    await team_view.refresh('nightowls1', client)
    ok('a team that\'s ended: let go of, said, and its widget ended', teams.mine(A) is None and teams.mine(B) is None
       and any('has ended' in t for _, t in client.sent) and json.loads(tg('editSharedWidgetData')[-1][4]['public_data']).get('x') == 1)

asyncio.run(main())
print('\n%d failed' % fails if fails else '\nAll passed'); sys.exit(1 if fails else 0)
