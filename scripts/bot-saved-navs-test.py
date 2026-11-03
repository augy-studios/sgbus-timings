# The Telegram bot's saved navs with a stop on the way (telegram-bot/src/navs.py, db.py) and
# their sync with the web app (src/sync_bot.py): A to B and A to B by way of C are two
# favourites, a nav being planned keeps its stop, and sync sends and takes the stop.
#
#   DB_PATH=/tmp/x/bot.db BOT_TOKEN=1 API_ID=1 API_HASH=1 LTA_ACCOUNT_KEY=1 \
#     python3 scripts/bot-saved-navs-test.py
#
# With the bot's requirements installed (telegram-bot/requirements.txt); DB_PATH a throwaway
# database, as the test writes to it. Nothing is fetched.
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'telegram-bot'))
from src.navs import is_favourite_nav, toggle_favourite_nav, list_favourite_navs, row_via, start_nav_draft, get_nav_draft, draft_via, draft_place
fails = 0
def ok(name, cond):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name); fails += 0 if cond else 1
A = {"label": "Home", "lat": 1.35, "lng": 103.94}; B = {"label": "Work", "lat": 1.28, "lng": 103.85}; V = {"label": "Gym", "lat": 1.30, "lng": 103.90}
C = 42
ok('plain nav starred', toggle_favourite_nav(C, A, B) is True)
ok('plain nav is favourite, the stop one is not', is_favourite_nav(C, A, B) and not is_favourite_nav(C, A, B, V))
ok('nav with a stop starred apart', toggle_favourite_nav(C, A, B, V) is True)
rows = list_favourite_navs(C)
ok('two favourites', len(rows) == 2)
ok('the second keeps its stop', row_via(rows[1]) == V and row_via(rows[0]) is None)
ok('unstarring the stop one leaves the plain one', toggle_favourite_nav(C, A, B, V) is False and is_favourite_nav(C, A, B) and len(list_favourite_navs(C)) == 1)
start_nav_draft(C, "to", A, None, None, V)
d = get_nav_draft(C)
ok('draft keeps the stop', draft_via(d) == V and draft_place(d, "from") == A)
start_nav_draft(C, "to", A, None)
ok('draft without one', draft_via(get_nav_draft(C)) is None)
from src.sync_bot import own_favs, merge
navs = own_favs(C)["navs"]
ok('sync sends the plain nav', len(navs) == 1 and "via" not in navs[0])
r = merge(7, {"navs": [{"from": A, "to": B, "via": V}, {"from": A, "to": B}]})
got = own_favs(7)["navs"]
ok('sync takes a nav with its stop, and the plain one apart', len(got) == 2 and sum(1 for n in got if n.get("via") == V) == 1)
r = merge(7, {"navs": [{"from": A, "to": B, "via": V}]})
ok('taking it again adds nothing', len(own_favs(7)["navs"]) == 2)
print('\n%d failed' % fails if fails else '\nAll passed'); sys.exit(1 if fails else 0)
