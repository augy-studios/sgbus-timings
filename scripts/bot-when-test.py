# The Telegram bot's time picker for /nav and /route (telegram-bot/src/when.py, when_view.py):
# more quick times, and a day, an hour and the minutes picked with buttons, up to a week ahead,
# never a time already gone. The clock is held at a moment of its own.
#
#   python3 scripts/bot-when-test.py
import json, os, sys, tempfile
from datetime import datetime

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
os.environ.update(DB_PATH=os.path.join(tempfile.mkdtemp(), 'bot.db'), BOT_TOKEN='1:a', API_ID='1', API_HASH='x', LTA_ACCOUNT_KEY='x')
sys.path.insert(0, os.path.join(ROOT, 'telegram-bot'))
from src import buttons, when, when_view

fails = 0
def ok(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (f' :: {extra}' if extra and not cond else '')); fails += 0 if cond else 1

# Tuesday 10 November 2026, 22:17 in Singapore.
NOW = datetime(2026, 11, 10, 22, 17, tzinfo=when.SG)
when.now = lambda: NOW
BACK = ('nav_back', '🔙 Back to Navigate')
PANEL = {'from': {'label': 'Home', 'lat': 1.3, 'lng': 103.8}, 'to': {'label': 'Work', 'lat': 1.28, 'lng': 103.85}}


def taps(rows):
    """Each button: its text, and what it does ({action, payload})."""
    return [(b.text, buttons.resolve_button(b.data)) for row in rows for b in row]


# ---------- the quick ones ----------
_, rows = when_view.build_when_prompt('nav', PANEL, 'leave', BACK)
t = taps(rows)
ok('ten quick times, 5 minutes to 3 hours on', [x for x, _ in t[:10]] == ['In 5 min', 'In 10 min', 'In 15 min', 'In 20 min', 'In 30 min', 'In 45 min', 'In 1 h', 'In 1½ h', 'In 2 h', 'In 3 h'], [x for x, _ in t])
ok('three a row', [len(r) for r in rows[:4]] == [3, 3, 3, 1])
ok('then Pick a day and time', t[10][0] == '📅 Pick a day and time' and t[10][1]['action'] == 'nav_when_day' and t[10][1]['payload']['mode'] == 'leave')
ok('a quick one, tapped: that many minutes on, rounded up to five', when.picked(t[0][1]['payload']['pick']) == {'mode': 'leave', 'at': '2026-11-10T22:25'})

# ---------- the day ----------
_, rows = when_view.build_day_picker('nav', PANEL, 'arrive', BACK)
t = taps(rows)
days = [(x, a['payload']['day']) for x, a in t if a['action'] == 'nav_when_hour']
ok('today and the week ahead, by name', days[:3] == [('Today', '2026-11-10'), ('Tomorrow', '2026-11-11'), ('Thu 12 Nov', '2026-11-12')] and len(days) == 8, days)
ok('back to the quick times, and to the panel', t[-2][1]['action'] == 'nav_when_mode' and t[-1][1]['action'] == 'nav_back')

# ---------- the hour ----------
_, rows = when_view.build_hour_picker('nav', PANEL, 'arrive', '2026-11-10', BACK)
hours = [x for x, a in taps(rows) if a['action'] == 'nav_when_minute']
ok('today: only the hours still to come', hours == ['22:00', '23:00'], hours)
_, rows = when_view.build_hour_picker('nav', PANEL, 'arrive', '2026-11-11', BACK)
ok('tomorrow: every hour', len([1 for x, a in taps(rows) if a['action'] == 'nav_when_minute']) == 24)
ok('a week on: up to this time of day', when.pick_hours('2026-11-17')[-1] == 22)

# ---------- the minutes ----------
_, rows = when_view.build_minute_picker('nav', PANEL, 'arrive', '2026-11-10', 22, BACK)
t = taps(rows)
mins = [(x, a) for x, a in t if a['action'] == 'nav_when_set']
ok('this hour: only the minutes still to come, in fives', [x for x, _ in mins] == ['22:20', '22:25', '22:30', '22:35', '22:40', '22:45', '22:50', '22:55'], [x for x, _ in mins])
_, rows = when_view.build_minute_picker('nav', PANEL, 'arrive', '2026-11-12', 8, BACK)
pick = [a for x, a in taps(rows) if x == '08:30'][0]
got = when.picked(pick['payload']['pick'])
ok('a minute picked sets that day and time', got == {'mode': 'arrive', 'at': '2026-11-12T08:30'}, got)
ok('the panel keeps its ends, and nothing of the picker', pick['payload']['from'] == PANEL['from'] and not {'mode', 'day', 'hour'} & set(pick['payload']))
ok('and it can be planned for', when.problem(got) is None)
ok('said as the panel says it', when.describe(got) == 'Arrive by 08:30 Thu 12 Nov', when.describe(got))
ok('/route has the same', taps(when_view.build_minute_picker('route', {'start': '84009'}, 'leave', '2026-11-11', 9, ('route_view', '🔙'))[1])[0][1]['action'] == 'route_when_set')

print('\n%d failed' % fails if fails else '\nAll passed'); sys.exit(1 if fails else 0)
