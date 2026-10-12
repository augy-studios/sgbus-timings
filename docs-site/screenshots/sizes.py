# Sets the width and height of each named guide image, in every page that shows it, to its
# PNG's size at 3x, and replaces its alt text where one's given. From docs-site/:
#   python3 screenshots/sizes.py nav-tabs,trips-tray '{"nav-tabs": "New alt text"}'
import re, sys, glob, json
from PIL import Image
alts = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
names = sys.argv[1].split(',')
for md in glob.glob('content/**/*.md', recursive=True):
    s = open(md).read(); orig = s
    for n in names:
        w, h = Image.open(f'public/screenshots/web/{n}.png').size
        def fix(m):
            tag = m.group(0)
            tag = re.sub(r'width="\d+"', f'width="{round(w/3)}"', tag)
            tag = re.sub(r'height="\d+"', f'height="{round(h/3)}"', tag)
            if n in alts: tag = re.sub(r'alt="[^"]*"', 'alt="%s"' % alts[n], tag)
            return tag
        s = re.sub(r'<img src="/screenshots/web/%s\.png"[^>]*>' % re.escape(n), fix, s)
    if s != orig:
        open(md, 'w').write(s); print('updated', md)
