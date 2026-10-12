// The local main-site, with /api/* passed through to the live site, for the guide's
// screenshots (shots.cjs): the page as it is in this checkout, with live data.
// Run with NODE_USE_ENV_PROXY=1 behind a proxy.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../main-site');
const LIVE = 'https://sgbus.uwuapps.org';
const PORT = Number(process.env.PORT) || 8766;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    try {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
      const r = await fetch(LIVE + req.url, { method: req.method, body, headers: { 'content-type': req.headers['content-type'] || 'application/json' } });
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(502); res.end(String(e)); }
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/' ) file = path.join(ROOT, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`main-site on http://127.0.0.1:${PORT}/`));
