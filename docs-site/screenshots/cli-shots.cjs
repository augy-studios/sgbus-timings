// The command line's screenshots (web/linux-cli.md): real sgbus output, colours and all, drawn as
// a terminal and taken at 3x. Build it first (node cli/build.mjs), then from docs-site/:
// `node screenshots/cli-shots.cjs`, and `python3 screenshots/sizes.py cli-timings,cli-nav,...`.
// Live timings: take them in the day. It saves a Home and a routine of its own, in a folder
// beside this file, never yours. Needs Playwright as shots.cjs does; CHROME=<path> uses Chrome.
const path = require('path');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(execFileSync('npm root -g').toString().trim(), 'playwright'))); }

const root = path.resolve(__dirname, '../..');
const SGBUS = path.join(root, 'cli/dist/sgbus');
const OUT = path.resolve(__dirname, '../public/screenshots/web') + '/';
const env = { ...process.env, FORCE_COLOR: '1', XDG_CONFIG_HOME: path.join(__dirname, '.cli-shots/config'), XDG_CACHE_HOME: path.join(__dirname, '.cli-shots/cache') };

const run = (args, input = null) => execFileSync('node', [SGBUS, ...args], { env, encoding: 'utf8', input, stdio: [input == null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
const quote = (a) => (/[\s*']/.test(a) ? `'${a}'` : a);

// The ANSI colours sgbus uses, as a dark terminal shows them.
const COLOURS = { 31: '#ff6b6b', 32: '#69db7c', 33: '#ffd43b', 34: '#74c0fc', 35: '#f783ac', 36: '#66d9e8' };
function ansiToHtml(text) {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  let html = '';
  let open = 0;
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) { html += esc(part); continue; }
    const codes = m[1].split(';').map(Number);
    if (codes.includes(0)) { html += '</span>'.repeat(open); open = 0; continue; }
    const style = codes.map((c) => (c === 1 ? 'font-weight:700' : c === 2 ? 'opacity:.6' : COLOURS[c] ? `color:${COLOURS[c]}` : '')).filter(Boolean).join(';');
    html += `<span style="${style}">`;
    open++;
  }
  return html + '</span>'.repeat(open);
}

const SHOTS = [
  { name: 'cli-timings.png', setup: [['fav', 'bus', 'add', '222']], cmds: [['84009', '22*'], ['66271', '136', '73', '-d']] },
  { name: 'cli-nav.png', setup: [['place', 'set', 'home', '519599']], cmds: [['nav', 'home', 'Bedok Mall']] },
  { name: 'cli-route.png', cmds: [['route', '98101', '95099', '--show', '1']] },
  { name: 'cli-saved.png', setup: [['routine', 'add', '84009', '07:45', '--buses', '14,60']], cmds: [['routines'], ['weather']] },
  // The prompt: `sgbus` on its own, then commands typed without it. Its welcome comes from the
  // real prompt; each command is run on its own and drawn after "sgbus>", as typing it shows.
  { name: 'cli-prompt.png', prompt: [['84009', '14,60'], ['nav', 'home', '84031']] },
];

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 3 });
  for (const s of SHOTS) {
    for (const a of s.setup || []) { try { run(a); } catch { /* set already */ } }
    const prompt = '<span style="color:#69db7c">sgbus</span><span style="opacity:.6">&gt;</span>';
    const body = s.prompt
      ? `<span style="color:#69db7c">$</span> sgbus\n${ansiToHtml(((w) => w.slice(0, w.lastIndexOf('\n')))(run(['shell'], 'exit\n')).replace(/\n+$/, ''))}\n\n` +
        s.prompt.map((a) => `${prompt} ${a.map(quote).join(' ')}\n${ansiToHtml(run(a).replace(/\n+$/, ''))}`).join('\n\n') + `\n\n${prompt} exit`
      : s.cmds.map((a) => `<span style="color:#69db7c">$</span> sgbus ${a.map(quote).join(' ')}\n${ansiToHtml(run(a).replace(/\n+$/, ''))}`).join('\n\n');
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; background: transparent; }
      .term { display: inline-block; margin: 0; padding: 18px 22px 20px; border-radius: 12px; background: #1d2021; color: #e6e6e6;
        font: 14px/1.45 'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace; white-space: pre; }
      .bar { display: flex; gap: 7px; margin-bottom: 12px; } .bar i { width: 11px; height: 11px; border-radius: 50%; background: #555; }
    </style><div class="term"><div class="bar"><i></i><i></i><i></i></div>${body}</div>`);
    await page.evaluate(() => document.fonts.ready);
    const term = page.locator('.term');
    const box = await term.boundingBox();
    await term.screenshot({ path: OUT + s.name, omitBackground: true });
    console.log('wrote', s.name, Math.round(box.width), Math.round(box.height));
  }
  await browser.close();
})();
