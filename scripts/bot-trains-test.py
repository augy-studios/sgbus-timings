# The Telegram bot's train times (telegram-bot/src/trains.py): a station's next trains from an
# /api/trains answer, as the web app's js/trains.js reads it: minutes and clock times, where each
# train goes when a platform's don't all go as far, a disruption's changes and cancellations, and
# tomorrow's first train after the last, and its last train and last three marked. And a station
# search puts Train times above its stops, and tapping that button sends them.
#
#   python3 scripts/bot-trains-test.py
#
# With the bot's requirements installed. Its own throwaway database; nothing is fetched.
import os, sys, tempfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.environ.update(DB_PATH=os.path.join(tempfile.mkdtemp(), 'bot.db'), BOT_TOKEN='1:a', API_ID='1', API_HASH='x', LTA_ACCOUNT_KEY='x')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))
from src import trains
from src.buttons import resolve_button

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

# 8:30 on a Friday morning, Singapore time; the day's midnight 8.5 hours before.
START = 1793289600000  # 2026-10-30T00:00:00+08:00
NOW = START + (8 * 3600 + 30 * 60) * 1000
at = lambda m: 8 * 3600 + 30 * 60 + m * 60


def tampines(live=False):
    return {
        'day': '2026-10-30', 'start': START, 'now': at(0), 'live': live, 'feedAt': None,
        'platforms': [
            {'id': 'EW2_A', 'code': 'EW2', 'name': 'Tampines', 'line': 'EW', 'colour': '#189E4A', 'platform': 'A', 'heads': ['Pasir Ris'], 'ways': [['EW1']],
             'trains': [[at(0), 0, 0, 2 if live else 0], [at(2), 0, 0, 1 if live else 0], [at(7), 0, 0, 0], [at(12), 0, 0, 0], [at(17), 0, 0, 0]], 'first': [19281, 0]},
            {'id': 'EW2_B', 'code': 'EW2', 'name': 'Tampines', 'line': 'EW', 'colour': '#189E4A', 'platform': 'B', 'heads': ['Joo Koon', 'Tuas Link'], 'ways': [['EW3'], ['EW3', 'EW33']],
             'trains': [[at(-5), 0, 0, 0], [at(3), 0, 0, 0], [at(8), 1, 1, 0], [at(75), 0, 0, 0]], 'first': [19843, 1]},
            {'id': 'DT32_B', 'code': 'DT32', 'name': 'Tampines', 'line': 'DT', 'colour': '#0354A6', 'platform': 'B', 'heads': ['Expo'], 'ways': [['DT33']],
             'trains': [], 'first': [22484, 0]},
        ],
    }


text = trains.trains_text(tampines(), 'Tampines', NOW)['fallback']
lines = text.split('\n')
ok('1. titled for the station, and says these are the timetable', lines[0] == 'Trains at Tampines' and 'Timetable times from LTA' in text, text)
ok('1. each platform: line, where it goes, platform', 'EW towards Pasir Ris · Platform A' in text and 'DT towards Expo · Platform B' in text, text)
ok('1. a train at the platform is Now; the rest in minutes, with clock times', '• Now · 08:30' in text and '• 2 min · 08:32' in text and '• 7 min · 08:37' in text, text)
ok('1. the next four only', '• 17 min' not in text, text)
ok('2. a gone train drops off', '08:25' not in text, text)
ok('2. a platform going two ways says which each train is', 'EW towards Joo Koon · Tuas Link' in text and '• 8 min · 08:38 · Tuas Link' in text, text)
ok('2. more than an hour away, the clock time', '• 09:45 · 09:45 · Joo Koon' in text, text)
ok('3. after the last train, tomorrow\'s first', 'No more trains today. First train tomorrow at 06:14.' in text, text)

ok('3. each platform says when its last train is', 'Last train today at 08:47' in text and '🔴 Last train today at 08:47' not in text, text)
ok('3. red once only its last three are left', '🔴 Last train today at 09:45' in text, text)
ok('3. the last three are marked', '• 7 min · 08:37 · 3rd last' in text and '• 8 min · 08:38 · Tuas Link · 2nd last' in text and '• 09:45 · 09:45 · Joo Koon · Last train' in text, text)

live = trains.trains_text(tampines(live=True), 'Tampines', NOW)['fallback']
ok('4. a disruption says it is live', 'LTA reports a disruption here' in live, live)
ok('4. a cancelled train, and a changed one', '• Cancelled · 08:30' in live and '• 2 min · 08:32 (changed)' in live, live)

failed = trains.trains_text(None, 'Tampines', NOW)['fallback']
ok('5. no answer says so', "Couldn't get the train times" in failed, failed)

md = trains.trains_text(tampines(), 'Tampines', NOW)['markdown']
ok('6. the rich message has the same, marked up', md.startswith('**Trains at Tampines**') and 'Platform A' in md, md[:120])

btn = trains.trains_button({'name': 'Tampines', 'codes': ['EW2', 'DT32']})
# Telethon 1.46 keeps a button's data under its type; older ones on the button.
got = resolve_button(getattr(btn, 'data', None) or btn.type.data)
ok('7. a station search\'s button carries the station', btn.text == '🚆 Train times at Tampines' and got == {'action': 'trains', 'payload': {'codes': ['EW2', 'DT32'], 'name': 'Tampines'}}, str(got))

# Tapping it, through the bot's own button handler, sends the trains and answers the tap.
import asyncio
from src.handlers import callbacks


class FakeClient:
    def __init__(self):
        self.handlers, self.sent = [], []

    def on(self, _ev):
        def deco(f):
            self.handlers.append(f)
            return f
        return deco

    def build_reply_markup(self, buttons):
        return buttons

    async def __call__(self, req):
        self.sent.append(req.message)


class FakeTap:
    data = getattr(btn, 'data', None) or btn.type.data
    sender_id = chat_id = 1
    query = None

    def __init__(self):
        self.answers = []

    async def answer(self, *a, **k):
        self.answers.append(a)


async def _tampines(_codes):
    return tampines()

trains.fetch_trains = _tampines
client, tap = FakeClient(), FakeTap()
callbacks.register_callbacks(client)
try:
    asyncio.run(client.handlers[0](tap))
    err = ''
except Exception as e:
    err = repr(e)
ok('8. tapping it sends the trains and answers the tap', not err and len(client.sent) == 1 and client.sent[0].startswith('Trains at Tampines') and tap.answers == [()], err or str((client.sent, tap.answers)))

print('\nall passed' if not fails else f'\n{fails} failed')
sys.exit(1 if fails else 0)
