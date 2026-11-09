# The Telegram bot's live trips (telegram-bot/src/bot_trips.py, trip_widget.py, bot_api.py):
# Start trip on a /nav way, its shared widget for the person on the trip and for whoever
# follows its link, kept up to date from the trip's live ETA link, the Get Off Alert, and the
# end. Telegram's Bot API and the site are stand-ins (httpx's MockTransport), and what the bot
# sends the site goes through the site's own checks (api/_push/validate.js parseTrip,
# api/_lib/share-links.js parseLink) and one minute of its cron (api/_push/trip.js step), in Node.
#
#   python3 scripts/bot-trips-test.py
#
# With the bot's requirements installed (telegram-bot/requirements.txt) and Node on the PATH.
# The database is a throwaway one in a temporary folder.
import asyncio, json, os, subprocess, sys, tempfile, time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
TMP = tempfile.mkdtemp()
os.environ.update(DB_PATH=os.path.join(TMP, 'bot.db'), BOT_TOKEN='123:abc', API_ID='1', API_HASH='x',
                  LTA_ACCOUNT_KEY='x', BOT_API_TOKEN='bot-secret', WEBAPP_URL='https://sgbus.test/', NAV_API_URL='https://sgbus.test/')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))

import httpx
from src import bot_trips, http_client
from src.trip_widget import DATA_LIMIT, COMPRESSED_LIMIT, compressed_size, public_data, widget_html

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

def node(script, data):
    """Runs an ES module against the site's code, with `data` as JSON on stdin."""
    res = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps(data), capture_output=True, text=True, cwd=ROOT)
    if res.returncode:
        print(res.stderr)
    return json.loads(res.stdout or 'null')

START = {'label': 'Bedok Mall', 'lat': 1.3248, 'lng': 103.9294}
END = {'label': 'One Raffles Place', 'lat': 1.2842, 'lng': 103.8513}
def line(a, b, n):
    return [[a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)] for i in range(n)]
OPTION = {
    'minutes': 46,
    'legs': [
        {'mode': 'walk', 'metres': 180, 'minutes': 3, 'to': {'kind': 'stop', 'code': '84031', 'name': 'Bedok Int', 'lat': 1.3247, 'lng': 103.9290}},
        {'mode': 'bus', 'route': '28', 'minutes': 18, 'wait': 4, 'stops': 9, 'path': line([1.3247, 103.9290], [1.3180, 103.8930], 10),
         'from': {'kind': 'stop', 'code': '84031', 'name': 'Bedok Int', 'lat': 1.3247, 'lng': 103.9290},
         'to': {'kind': 'stop', 'code': '81111', 'name': 'Paya Lebar Stn Exit D', 'lat': 1.3180, 'lng': 103.8930}},
        {'mode': 'walk', 'metres': 40, 'minutes': 1},
        # Paya Lebar, Aljunied, Kallang, Lavender, Bugis, City Hall, Raffles Place.
        {'mode': 'train', 'route': 'EW', 'minutes': 14, 'wait': 2, 'stops': 6, 'path': [[1.3180, 103.8930], [1.3164, 103.8829], [1.3115, 103.8714], [1.3073, 103.8630], [1.3008, 103.8559], [1.2931, 103.8520], [1.2840, 103.8515]],
         'from': {'kind': 'station', 'name': 'Paya Lebar', 'lat': 1.3180, 'lng': 103.8930},
         'to': {'kind': 'station', 'name': 'Raffles Place', 'lat': 1.2840, 'lng': 103.8515}},
        {'mode': 'walk', 'metres': 120, 'minutes': 2, 'fromExit': {'name': 'B', 'lat': 1.2838, 'lng': 103.8517}},
    ],
}

# ---------- the trip, as the site takes it ----------
parts = bot_trips.trip_parts(OPTION, START, END)
ok('a short walk is no part of its own', [p['kind'] for p in parts] == ['walk', 'bus', 'train', 'walk'], [p['kind'] for p in parts])
ok('its minutes go to the part before', parts[1]['walkAfter'] == 1)
ok('the bus is followed by LTA', parts[1].get('service') == '28' and parts[1].get('board') == '84031' and parts[1].get('alight') == '81111')
ok('labels as the web app has them', [p['label'] for p in parts] == ['Walk', 'Bus 28', 'EW Line', 'Walk'])
ok('the last walk ends at the end', parts[-1]['to'] == 'One Raffles Place' and parts[-1]['points'][0] == [1.2838, 103.8517])

NOW = 1_800_000_000_000
eta0 = bot_trips.first_eta('Sam', END, parts, OPTION['minutes'], NOW)
trip = bot_trips.server_trip('tg-1234abcd', parts, {'id': 'abcde12345', 'secret': 'c2VjcmV0c2VjcmV0', 'name': 'Sam', 'to': eta0['to']}, NOW)
checked = node('''
import { parseTrip } from "./main-site/api/_push/validate.js";
import { step } from "./main-site/api/_push/trip.js";
import { etaFromTrip, parseLink } from "./main-site/api/_lib/share-links.js";
const { trip, eta, now } = JSON.parse(await new Promise((r) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => r(s)); }));
const out = {};
try { parseTrip(trip, now); out.public = "taken"; } catch (e) { out.public = e.message; }
const t = parseTrip(trip, now, { fromBot: true });
out.sub = t.subscription;
try { parseLink("eta", eta, now); out.eta = "ok"; } catch (e) { out.eta = e.message; }
// Ten minutes on: the walk's done, and the bus is on its way.
let later = now;
for (let i = 0; i < 10; i++) { later += 60000; step(t, null, later); }
out.leg = t.leg;
const moved = etaFromTrip(t, later);
try { parseLink("eta", moved, later); out.moved = moved; } catch (e) { out.moved = e.message; }
console.log(JSON.stringify(out));
''', {'trip': trip, 'eta': eta0, 'now': NOW})
ok('the site turns { bot: true } away from anyone else', checked and checked['public'] != 'taken', checked and checked['public'])
ok('and takes it from the bot', checked and checked['sub'] == {'bot': True})
ok('the first ETA is one the site takes', checked and checked['eta'] == 'ok', checked and checked['eta'])
ok('the cron moves the trip on to the bus', checked and checked['leg'] == 1, checked and checked['leg'])
moved = checked['moved'] if checked else {}
ok('and its ETA is one the widget reads', isinstance(moved, dict) and moved['leg']['label'] == 'Bus 28' and moved['legIndex'] == 1, moved)

# ---------- the widget's state ----------
html = widget_html()
ok('the widget fits Telegram\'s size', len(html.encode()) <= 32768 and compressed_size(html) <= COMPRESSED_LIMIT, compressed_size(html))
ok('nothing the widget profile removes', not any(w in html for w in ('vh', 'overflow:auto', 'overflow:scroll', ':has(', '<input', 'fetch(', 'src="http', '<!--')))
widget_parts = [{'kind': p['kind'], 'label': p['label'], 'to': p['to']} for p in parts]
d = json.loads(public_data(moved, 3, NOW, widget_parts))
ok('state: the part on, its stops, the parts', d['i'] == 1 and d['k'] == 'b' and d['l'] == 'Bus 28' and d['c'] == 4 and len(d['p']) == 4 and d['r'] == 3)
long = [{'kind': 'bus', 'label': 'Bus 9999 ' + 'x' * 40, 'to': 'Y' * 120} for _ in range(12)]
big = {**moved, 'name': 'N' * 64, 'to': {'label': 'T' * 120, 'lat': 1.3, 'lng': 103.8}, 'legCount': 12,
       'leg': {'label': 'L' * 40, 'to': 'D' * 120, 'stopsLeft': 3, 'kind': 'bus'}}
ok('a long trip stays inside 1024 bytes', len(public_data(big, 99, NOW, long).encode()) <= DATA_LIMIT)
ok('a long trip in another script too', len(public_data({**big, 'name': '陈' * 64}, 99, NOW, [{**p, 'to': '巴士' * 60} for p in long]).encode()) <= DATA_LIMIT)
web_eta = {**moved, 'timeline': {'pos': 1, 'legs': [{'kind': 'bus', 'label': 'Bus 28', 'to': 'Paya Lebar', 'names': []}, {'kind': 'train', 'label': 'EW Line', 'to': 'Raffles Place', 'names': []}]}}
w = json.loads(public_data(web_eta, 1, NOW))
ok('a web share\'s parts come from its timeline, from the part on', w['o'] == 1 and [p[1] for p in w['p']] == ['Bus 28', 'EW Line'])
ok('gone, stopped, arrived', json.loads(public_data(moved, 1, NOW, gone=True))['x'] == 2
   and json.loads(public_data({**moved, 'stopped': True}, 1, NOW))['x'] == 1
   and json.loads(public_data({**moved, 'ended': True}, 1, NOW))['e'] == 1)

# ---------- the bot, against stand-ins ----------
calls = []
links = {}       # eta id -> {kind, data, updatedAt}, or missing for a 404
next_message = [100]

def handler(request: httpx.Request) -> httpx.Response:
    url = request.url
    body = json.loads(request.content or b'null') if request.content else None
    calls.append((request.method, url.host, url.path, dict(url.params), body, request.headers.get('authorization')))
    if url.host == 'api.telegram.org':
        method = url.path.rsplit('/', 1)[1]
        if method in ('sendWidget', 'sendSharedWidget'):
            next_message[0] += 1
            wid = body.get('widget_id') or f"w{len(calls)}"
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': next_message[0], 'widget': {'id': wid}}})
        return httpx.Response(200, json={'ok': True, 'result': True})
    if url.path == '/api/share' and request.method == 'POST':
        new_id = 'abcde12345' if 'abcde12345' not in links else f'trip{len(links):06d}'
        links[new_id] = {'kind': 'eta', 'data': body['data'], 'updatedAt': int(time.time() * 1000)}
        return httpx.Response(200, json={'id': new_id, 'path': f'/eta/{new_id}', 'secret': 'c2VjcmV0c2VjcmV0'})
    if url.path == '/api/share' and request.method == 'GET':
        got = links.get(url.params['id'])
        return httpx.Response(200, json=got) if got else httpx.Response(404, json={'error': 'gone'})
    if url.path == '/api/share' and request.method == 'PATCH':
        links[url.params['id']]['data'] = body['data']
        return httpx.Response(204)
    # The way the trip really goes (route_shapes.py): the site's real tracks, a road that bends,
    # and a footpath.
    if url.path == '/data/rail-tracks.json':
        return httpx.Response(200, content=open(os.path.join(ROOT, 'main-site', 'data', 'rail-tracks.json'), 'rb').read())
    if url.path == '/api/road':
        pts = [list(map(float, q.split(','))) for q in url.params['points'].split(';')]
        bent = [p for a, b in zip(pts, pts[1:]) for p in (a, [(a[0] + b[0]) / 2 + 0.001, (a[1] + b[1]) / 2])] + [pts[-1]]
        return httpx.Response(200, json={'path': bent, 'source': 'osm'})
    if url.path == '/api/walk':
        a, b = [list(map(float, url.params[k].split(','))) for k in ('from', 'to')]
        return httpx.Response(200, json={'path': [a, [a[0], b[1]], b], 'source': 'onemap'})
    if url.path.startswith('/api/push/trips/'):
        return httpx.Response(200 if request.method == 'PUT' else 204, json={'tripId': 'x'})
    return httpx.Response(404)

http_client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))

class FakeClient:
    def __init__(self):
        self.sent = []
    async def send_message(self, chat, text):
        self.sent.append((chat, text))

def tg(method):
    return [c for c in calls if c[1] == 'api.telegram.org' and c[2].endswith('/' + method)]

async def main():
    client = FakeClient()
    OWNER, FRIEND, WEB = 11, 22, 33

    eta_id = await bot_trips.start_trip(OWNER, 'Sam', START, END, OPTION)
    site = [c for c in calls if c[1] == 'sgbus.test' and c[0] in ('POST', 'PUT')]
    ok('the ETA link, then the trip for the site to follow', [(c[0], c[2].split('/tg-')[0]) for c in site] == [('POST', '/api/share'), ('PUT', '/api/push/trips')], [(c[0], c[2]) for c in site])
    ok('with the bot\'s token', all(c[5] == 'Bearer bot-secret' for c in site))
    put = site[1][4]
    ok('the trip has no push subscription, and the link to keep updated', put['subscription'] == {'bot': True} and put['share']['id'] == eta_id)
    sent = tg('sendWidget')
    ok('a shared widget for the person on the trip', len(sent) == 1 and sent[0][4]['is_shared'] is True and sent[0][4]['chat_data'] == '{"o":1}' and sent[0][3] == {})
    kb = sent[0][4]['reply_markup']['inline_keyboard']
    share = kb[0][0]
    ok('Share sends the bot\'s link, and the web one', share['text'].startswith('📤') and 't.me%2Fsgbus_app%3Fstart%3Deta_abcde12345' in share['url']
       and 'sgbus.test%2Feta%2Fabcde12345' in share['url'], share['url'])
    ok('Refresh and End trip', [b['text'] for b in kb[1]] == ['🔄 Refresh', '🏁 End trip'] and all(b['callback_data'].startswith('b:') for b in kb[1]))
    ok('the widget\'s caption', 'Your trip to One Raffles Place' in sent[0][4]['caption'])
    ok('the apps fetch its state every 15 s', any(c[4].get('cache_time') == 15 for c in tg('editSharedWidgetData')))

    # ---------- the way it really goes ----------
    await asyncio.gather(*list(bot_trips._shaping))
    shapes = json.loads(bot_trips.get_trip(eta_id)['shapes_json'] or 'null')
    ok('each part\'s colour: walk, bus, East West Line, walk', shapes and [x['c'] for x in shapes] == ['w', 'b', 'EW', 'w'], shapes and [x['c'] for x in shapes])
    ok('the bus along the road', shapes and len(shapes[1]['p']) == 2 * len(parts[1]['points']) - 1)
    ok('the walk along the footpath', shapes and len(shapes[0]['p']) == 3)
    from src.route_shapes import _metres
    rail = shapes[2]['p'] if shapes else []
    straight = sum(_metres(a, b) for a, b in zip(parts[2]['points'], parts[2]['points'][1:]))
    along = sum(_metres(a, b) for a, b in zip(rail, rail[1:]))
    ok('the train along the East West Line\'s track, not straight', len(rail) > len(parts[2]['points']) and along > straight * 1.01, (len(rail), round(along), round(straight)))
    ok('from station to station', rail and _metres(rail[0], [1.3180, 103.8930]) < 1 and _metres(rail[-1], [1.2840, 103.8515]) < 1)
    drawn = json.loads(tg('editSharedWidgetData')[-1][4]['public_data'])
    ok('the widget redrawn with them', drawn.get('q') == ['w', 'b', 'EW', 'w'] and len(drawn.get('j', [])) == 3 and len(drawn['m']) // 4 <= 64, drawn.get('q'))
    from src.route_shapes import shapes_for_link
    link_shapes = await shapes_for_link({'path': [p for x in parts for p in x['points']], 'trains': [{'leg': 2, 'route': 'EW', 'points': parts[2]['points']}]})
    ok('a web share: its train on the rails, the rest by road', link_shapes and [x['c'] for x in link_shapes] == ['b', 'EW', 'b'], link_shapes and [x['c'] for x in link_shapes])

    # A friend opens the shared link.
    answer = await bot_trips.follow(FRIEND, eta_id)
    again = tg('sendSharedWidget')
    ok('the friend gets the same widget', answer.sent and len(again) == 1 and again[0][4]['widget_id'] == bot_trips.get_trip(eta_id)['widget_id'])
    ok('as theirs to follow', 'chat_data' not in again[0][4] and [b['text'] for b in again[0][4]['reply_markup']['inline_keyboard'][1]] == ['🔄 Refresh', '✖️ Stop following'])
    ok('their caption names who', 'Sam’s trip to One Raffles Place' in again[0][4]['caption'])

    # Nothing new on the link: nothing edited.
    edits = len(tg('editSharedWidgetData'))
    await bot_trips.refresh(eta_id, client)
    ok('no edit when nothing changed', len(tg('editSharedWidgetData')) == edits)

    # On the bus, two stops from the stop: one edit for everyone, and the Get Off Alert, once.
    rev = bot_trips.get_trip(eta_id)['rev']
    links[eta_id] = {'kind': 'eta', 'updatedAt': int(time.time() * 1000) + 600000, 'data': {**moved, 'leg': {**moved['leg'], 'stopsLeft': 2}}}
    await bot_trips.refresh(eta_id, client)
    await bot_trips.refresh(eta_id, client)
    new = tg('editSharedWidgetData')[edits:]
    ok('one edit, a new revision', len(new) == 1 and json.loads(new[0][4]['public_data'])['r'] == rev + 1 and json.loads(new[0][4]['public_data'])['s'] == 2)
    ok('the Get Off Alert, once, to the person on the trip', client.sent == [(OWNER, '🔔 Get off in 2 stops, at Paya Lebar Stn Exit D (81111), to change.')], client.sent)

    # ---------- your location ----------
    legs = json.loads(bot_trips.get_trip(eta_id)['trip_json'])['legs']
    mid = [1.32135, 103.911]
    spot = bot_trips.locate(legs, 1, mid)
    ok('a point halfway along the bus: the bus, halfway', spot and spot[0] == 1 and abs(spot[1] - 4.5) < 0.2, spot)
    ok('at the stop you get off: the next part, from its start', bot_trips.locate(legs, 1, [1.3180, 103.8930]) == (2, 0.0))
    ok('back a part, when the clock had them too far on', bot_trips.locate(legs, 2, mid)[0] == 1)
    ok('off the trip: nowhere on it', bot_trips.locate(legs, 1, [1.40, 103.70]) is None)

    ok('a location nobody asked for is not the trip\'s', bot_trips.wants_location(OWNER, live=False) is None)
    ok('a live location is, while a trip\'s on', bot_trips.wants_location(OWNER, live=True) is not None)
    ok('a friend\'s live location isn\'t', bot_trips.wants_location(FRIEND, live=True) is None)
    bot_trips.mark_asked(eta_id)
    row = bot_trips.wants_location(OWNER, live=False)
    ok('one sent after the bot asked is', row is not None)

    first = json.loads(row['trip_json'])
    edits = len(tg('editSharedWidgetData'))
    calls_before = len(calls)
    got = await bot_trips.apply_fix(row, *mid, accuracy=12, client=client)
    ok('the fix: on the bus, halfway', got['on'] and got['eta']['legIndex'] == 1 and got['eta']['leg']['stopsLeft'] == 5, got)
    put = next(c for c in calls[calls_before:] if c[0] == 'PUT')
    patch = next(c for c in calls[calls_before:] if c[0] == 'PATCH')
    ok('the link has where they really are', patch[4]['data']['me']['lat'] == mid[0] and patch[4]['data']['me']['accuracy'] == 12)
    ok('the widget, at once', len(tg('editSharedWidgetData')) == edits + 1 and json.loads(tg('editSharedWidgetData')[-1][4]['public_data'])['s'] == 5)
    ok('the button\'s ask is used up', bot_trips.wants_location(OWNER, live=False) is None)
    served = node('''
import { parseTrip } from "./main-site/api/_push/validate.js";
import { merge } from "./main-site/api/push/trips/[id].js";
import { live } from "./main-site/api/_push/trip.js";
import { parseLink } from "./main-site/api/_lib/share-links.js";
const { first, fix, eta } = JSON.parse(await new Promise((r) => { let s = ""; process.stdin.on("data", (d) => (s += d)); process.stdin.on("end", () => r(s)); }));
const now = fix.seenAt;
// The site had moved the trip on to the train by its clock; the fix puts it back on the bus.
const old = { ...parseTrip(first, now, { fromBot: true }), leg: 2, at: 0, pos: 0 };
const m = merge(old, parseTrip(fix, now, { fromBot: true }), now);
const link = parseLink("eta", eta, now);
console.log(JSON.stringify({ leg: m.leg, pos: m.pos, live: live(m, now), me: link.me }));
''', {'first': first, 'fix': put[4], 'eta': patch[4]['data']})
    ok('the site takes the fix over its clock, even back a part', served and served['leg'] == 1 and abs(served['pos'] - 4.5) < 0.2, served)
    ok('and leaves the trip to the fixes for now', served and served['live'] is True)
    ok('the link keeps the dot', served and served['me'] and served['me']['accuracy'] == 12, served)
    ok('live location: not again within 15 s', await bot_trips.apply_fix(bot_trips.get_trip(eta_id), *mid, live=True, client=client) is None)
    calls_before = len(calls)
    off = await bot_trips.apply_fix(bot_trips.get_trip(eta_id), 1.40, 103.70, client=client)
    ok('off the trip: the trip stays, only the dot moves', off == {'on': False} and not any(c[0] == 'PUT' for c in calls[calls_before:])
       and next(c for c in calls[calls_before:] if c[0] == 'PATCH')[4]['data']['me']['lat'] == 1.40)

    # Someone opens a trip the web app shares.
    links['webtrip001'] = {'kind': 'eta', 'updatedAt': NOW, 'data': web_eta}
    answer = await bot_trips.follow(WEB, 'webtrip001')
    made = tg('sendWidget')
    ok('a web share gets a shared widget of its own', answer.sent and len(made) == 2 and made[1][4]['is_shared'] and 'chat_data' not in made[1][4])
    ok('a link that\'s gone says so', (await bot_trips.follow(WEB, 'nosuchlink')).text.startswith('This trip link has expired'))
    links['place00001'] = {'kind': 'place', 'data': {}, 'updatedAt': NOW}
    ok('a link that isn\'t a trip says so', (await bot_trips.follow(WEB, 'place00001')).text.startswith("That isn't a live trip"))

    # The friend stops following: their buttons go.
    before = len(tg('editMessageReplyMarkup'))
    await bot_trips.unfollow(FRIEND, eta_id)
    ok('stop following takes their buttons away', len(tg('editMessageReplyMarkup')) == before + 1 and tg('editMessageReplyMarkup')[-1][4]['chat_id'] == FRIEND)
    await bot_trips.follow(FRIEND, eta_id)

    # Only the person on the trip can end it.
    ok('a friend can\'t end it', not await bot_trips.end_trip(eta_id, FRIEND, client))
    calls_before = len(calls)
    ok('the person on it can', await bot_trips.end_trip(eta_id, OWNER, client))
    site = [(c[0], c[2]) for c in calls[calls_before:] if c[1] == 'sgbus.test']
    ok('the site stops following first, then the link says arrived', site[0][0] == 'DELETE' and site[1] == ('PATCH', '/api/share'), site)
    ok('the link has ended', links[eta_id]['data']['ended'] is True)
    ok('the trip is over here', bot_trips.get_trip(eta_id)['status'] == 'ended' and bot_trips.get_trip(eta_id)['secret'] is None)
    last = json.loads(tg('editSharedWidgetData')[-1][4]['public_data'])
    ok('the widget says arrived', last.get('e') == 1)
    ok('everyone\'s buttons go', {c[4]['chat_id'] for c in tg('editMessageReplyMarkup')[-2:]} == {OWNER, FRIEND})
    ok('the friend hears they\'ve arrived', client.sent[-1] == (FRIEND, '🏁 Sam has arrived at One Raffles Place.'), client.sent[-1])
    ok('and an ended trip isn\'t followed again', (await bot_trips.follow(WEB, eta_id)).text == "That trip's over now.")

    # A second trip ends the first; and the web share is dropped once its link goes.
    del links['webtrip001']
    await bot_trips.poll(client)
    ok('a web share whose link went: ended', bot_trips.get_trip('webtrip001')['status'] == 'ended'
       and json.loads(tg('editSharedWidgetData')[-1][4]['public_data']).get('x') == 2)

    # ---------- a trip ridden for real: its uwuCoins ----------
    from src import coins
    from src.db import db
    RIDER = 77
    clock = [int(time.time() * 1000)]
    real_now = bot_trips._now_ms
    bot_trips._now_ms = lambda: clock[0]
    trip_id = await bot_trips.start_trip(RIDER, 'Rin', START, END, OPTION)
    await asyncio.gather(*list(bot_trips._shaping))
    legs = json.loads(bot_trips.get_trip(trip_id)['trip_json'])['legs']
    bus_pts = legs[1]['points']
    # At the stop, then along the road, then off at the end, in about the time it takes.
    for k, p in enumerate([bus_pts[0], bus_pts[3], bus_pts[6], bus_pts[-1]]):
        clock[0] += 5 * 60000 if k else 0
        await bot_trips.apply_fix(bot_trips.get_trip(trip_id), *p, accuracy=15, client=client)
    seen = json.loads(bot_trips.get_trip(trip_id)['seen_json'])
    ok('each location towards judging the bus', seen[1] and seen[1]['startAt'] and seen[1]['endAt'] and len(seen[1]['along']) >= 2, seen[1] if len(seen) > 1 else seen)
    # The site's cron gets them there.
    links[trip_id] = {'kind': 'eta', 'updatedAt': clock[0], 'data': {**links[trip_id]['data'], 'ended': True, 'legIndex': 3}}
    await bot_trips.refresh(trip_id, client)
    paid = [r for r in coins.log(RIDER, 10) if r['why'] == 'trip']
    ok('got there with a real ride: the trip\'s uwuCoins, once', len(paid) == 1 and paid[0]['n'] >= coins.FINISH and paid[0]['info']['trip'] == trip_id, paid)
    ok('the bus kept as a real ride', db.execute('SELECT bus FROM rides WHERE chat_id = ?', (RIDER,)).fetchone()['bus'] == '28')
    mine = [c for c in tg('editMessageWidgetData') if c[4]['chat_id'] == RIDER]
    ok('the card counts them up', mine and json.loads(mine[-1][4]['chat_data']) == {'o': 1, 'c': paid[0]['n']})
    ok('and the chat\'s told', any(c == RIDER and f"+{paid[0]['n']} uwuCoins" in t for c, t in client.sent))
    await bot_trips.refresh(trip_id, client)
    ok('not paid twice', len([r for r in coins.log(RIDER, 10) if r['why'] == 'trip']) == 1)
    # Ended by hand far from the end, with no ride seen: no coins.
    QUITTER = 78
    quit_id = await bot_trips.start_trip(QUITTER, 'Q', START, END, OPTION)
    await bot_trips.end_trip(quit_id, QUITTER, client)
    ok('a trip ended with no real ride: no coins', coins.balance(QUITTER) == 0)
    bot_trips._now_ms = real_now

asyncio.run(main())
print('\n%d failed' % fails if fails else '\nAll passed'); sys.exit(1 if fails else 0)
