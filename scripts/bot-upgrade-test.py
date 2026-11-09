# Cards brought up to the newest look (telegram-bot/src/upgrade.py): a live trip's and a wheel's
# card sent with older widget code gets a fresh one, sent silently to everyone with it, and the
# old message deleted, or left without its buttons where Telegram won't delete it. A trip's doors
# kept as sentences (from before they were drawn) are read back into what's drawn, the same as
# working them out again (mrt_doors.from_tip, against rides in the door data). Telegram and the
# site are stand-ins.
#
#   python3 scripts/bot-upgrade-test.py
import asyncio, json, os, sys, tempfile, time

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.environ.update(DB_PATH=os.path.join(tempfile.mkdtemp(), 'bot.db'), BOT_TOKEN='1:a', API_ID='1', API_HASH='x', LTA_ACCOUNT_KEY='x',
                  BOT_API_TOKEN='t', WEBAPP_URL='https://sgbus.test/', NAV_API_URL='https://sgbus.test/')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))
import httpx
from src import bot_trips, coins, http_client, mrt_doors, upgrade
from src.db import db
from src.trip_widget import code_version

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

# ---------- sentences read back ----------
DATA = json.load(open(os.path.join(ROOT, 'scripts', 'fixtures', 'mrt-doors-2026-11-10.json'), encoding='utf-8'))
mrt_doors._platforms, mrt_doors._dirs = DATA['platforms'], {p['d'] for p in DATA['platforms']}
by_dir = {}
for p in DATA['platforms']:
    by_dir.setdefault(p['d'], []).append(p)
place = lambda p: {'name': p['n'], 'code': p['c']}
legs = []
for ps in by_dir.values():
    ps.sort(key=lambda p: p['o'])
    for i, a in enumerate(ps):
        for b in ps[i + 1:]:
            legs.append(({'mode': 'train', 'route': a['l'], 'name': f"{a['l']} Line", 'from': place(a), 'to': place(b)}, None))
for leg, _ in legs[::7][:300]:
    here = [p for p in DATA['platforms'] if p['n'] == leg['to']['name'] and p['l'] != leg['route']]
    for a in here[:1]:
        on = [q for q in by_dir[a['d']] if q['o'] > a['o']]
        if on:
            legs.append((leg, {'mode': 'train', 'route': a['l'], 'name': f"{a['l']} Line", 'from': place(a), 'to': place(on[-1])}))
wrong = [(l, n) for l, n in legs if mrt_doors.tip(l, n) and mrt_doors.from_tip(mrt_doors.tip(l, n)) != mrt_doors.compact(l, n)]
ok(f'every sentence reads back as the doors drawn ({len(legs)} rides)', not wrong,
   wrong[:1] and f"{mrt_doors.tip(*wrong[0])!r} -> {mrt_doors.from_tip(mrt_doors.tip(*wrong[0]))!r} vs {mrt_doors.compact(*wrong[0])!r}")
ok("anything else isn't read as doors", mrt_doors.from_tip('Hello there.') is None and mrt_doors.from_tip(None) is None)

# ---------- the stand-ins ----------
calls = []


def handler(request):
    body = json.loads(request.content) if request.content else None
    calls.append((request.url.host, request.url.path, body))
    if request.url.host == 'api.telegram.org':
        m = request.url.path.rsplit('/', 1)[1]
        if m == 'deleteMessage':
            # The follower's card is past Telegram's 48 hours.
            if body['chat_id'] == 22:
                return httpx.Response(400, json={'ok': False, 'description': "Bad Request: message can't be deleted"})
            return httpx.Response(200, json={'ok': True, 'result': True})
        if m in ('sendWidget', 'sendSharedWidget'):
            return httpx.Response(200, json={'ok': True, 'result': {'message_id': 900 + len(calls), 'widget': {'id': body.get('widget_id') or 'new-widget'}}})
        return httpx.Response(200, json={'ok': True, 'result': True})
    if request.url.path == '/api/team':
        return httpx.Response(200, json={'id': 'nightowls1', 'name': 'Night Owls', 'members': [{'id': 'm1', 'name': 'Bea', 'joinedAt': 1, 'left': False}], 'events': []})
    return httpx.Response(404, json={})


http_client._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
tg = lambda m: [c for c in calls if c[0] == 'api.telegram.org' and c[1].endswith('/' + m)]

OLD_TIP = 'Changing at MacPherson for the Circle Line: door 9 for the escalators; door 4 for the lift. The door number is at the top right of each door.'
now = int(time.time() * 1000)
parts = [{'kind': 'walk', 'label': 'Walk', 'to': 'MacPherson station'}, {'kind': 'train', 'label': 'DT Line', 'to': 'MacPherson station', 'y': OLD_TIP},
         {'kind': 'train', 'label': 'CC Line', 'to': 'Dhoby Ghaut station'}]
eta = {'name': 'Sam', 'to': {'label': 'Takagi', 'lat': 1.3, 'lng': 103.85}, 'arriveAt': now + 1800000, 'legIndex': 1, 'legCount': 3,
       'leg': {'label': 'DT Line', 'to': 'MacPherson station', 'stopsLeft': 4, 'kind': 'train'}}
with db:
    db.execute("""INSERT INTO trip_widgets (eta_id, owner_chat, secret, widget_id, parts_json, last_json, state, rev, created_at, updated_at)
                  VALUES ('oldtrip001', 11, 's', 'old-widget', ?, ?, 'x', 7, ?, ?)""", (json.dumps(parts), json.dumps(eta), now, now))
    db.execute("INSERT INTO trip_widget_messages VALUES ('oldtrip001', 11, 501, 1), ('oldtrip001', 22, 502, 0)")
    db.execute("INSERT INTO coin_widgets (chat_id, message_id, rev, state) VALUES (11, 601, 3, ?)",
               (json.dumps({'r': 3, 'b': 0, 's': 6, 'w': 150, 'f': 100, 't': 1}),))
coins.add(11, 250, 'trip')
with db:
    db.execute("INSERT INTO team_widgets (team_id, widget_id, state, rev) VALUES ('nightowls1', 'old-team', 'x', 2)")
    db.execute("INSERT INTO team_widget_messages VALUES ('nightowls1', 33, 701)")


async def main():
    real_sleep = asyncio.sleep

    async def quick(s):
        await real_sleep(0)
    asyncio.sleep = quick
    done = await upgrade.upgrade_all()
    ok('the bot starts: the old trip card, team card and wheel sent again', done == {'trips': 1, 'teams': 1, 'wheels': 1}, done)
    sent = tg('sendWidget')
    trip_send = next(c for c in sent if c[2].get('is_shared'))
    ok('a fresh shared card for the person on the trip, silently', trip_send[2]['chat_id'] == 11 and trip_send[2]['disable_notification'] is True
       and trip_send[2]['chat_data'] == '{"o":1}')
    state = json.loads(trip_send[2]['public_data'])
    ok('the doors kept as a sentence, drawn now', state.get('y') == ['Changing at MacPherson for the Circle Line', 0, [[[9], 'escalators'], [[4], 'lift']],
                                                                     'Door number: at the top right of each door'], state.get('y'))
    ok('carrying on from where it was', state['r'] == 8 and state['i'] == 1)
    follower = tg('sendSharedWidget')
    ok('the same fresh card for the one following, silently', len(follower) == 1 and follower[0][2]['chat_id'] == 22
       and follower[0][2]['widget_id'] == 'new-widget' and follower[0][2]['disable_notification'] is True)
    ok("the old cards deleted, or left without buttons where they can't be", {11, 22, 33} == {c[2]['chat_id'] for c in tg('deleteMessage')}
       and any(c[2]['chat_id'] == 22 and c[2]['message_id'] == 502 for c in tg('editMessageReplyMarkup')))
    row = bot_trips.get_trip('oldtrip001')
    msgs = bot_trips.messages('oldtrip001')
    ok('the trip carries on with the fresh card', row['widget_id'] == 'new-widget' and row['code_ver'] == code_version('trip_widget.html')
       and {m['message_id'] for m in msgs}.isdisjoint({501, 502}) and len(msgs) == 2)
    ok('its parts keep the doors drawn', json.loads(row['parts_json'])[1]['y'][0] == 'Changing at MacPherson for the Circle Line')
    team = next(c for c in sent if c[2]['chat_id'] == 33)
    ok('the team card: a fresh shared one, silently, with the team as it is', team[2]['is_shared'] and team[2]['disable_notification'] is True
       and json.loads(team[2]['public_data'])['n'] == 'Night Owls' and json.loads(team[2]['public_data'])['r'] == 3)
    ok('the team carries on with it', db.execute("SELECT message_id FROM team_widget_messages WHERE team_id = 'nightowls1'").fetchone()[0] != 701
       and db.execute("SELECT code_ver FROM team_widgets").fetchone()[0] == code_version('team_widget.html'))
    wheel = next(c for c in sent if not c[2].get('is_shared'))
    ws = json.loads(wheel[2]['chat_data'])
    ok('the wheel: fresh, silently, the balance as it is and the last spin carried over', wheel[2]['chat_id'] == 11 and wheel[2]['disable_notification'] is True
       and ws['b'] == 250 and ws['s'] == 6 and ws['w'] == 150 and ws['r'] == 4, ws)
    before = len(calls)
    again = await upgrade.upgrade_all()
    ok('the newest already: nothing sent again', again == {'trips': 0, 'teams': 0, 'wheels': 0} and len(calls) == before, again)

asyncio.run(main())
print('\n%d failed' % fails if fails else '\nAll passed'); sys.exit(1 if fails else 0)
