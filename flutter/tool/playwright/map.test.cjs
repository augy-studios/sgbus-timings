// The desktop live map's page (assets/desktop/map/map.html and map.js) alone in Chromium, driven
// as the app's Dart side drives it in the WebView (lib/features/map/web/): commands sent with
// window.sgMap.run(command, data), and the replies and events it posts on SgMapChannel, which this
// test stands in for. Needs no network: the page is served by a tiny server here, the style is a
// blank one, and OpenFreeMap's addresses are answered by the test (they must reach the local
// server's /ofm/ path, as transformRequest sends them).
//
// Run it from flutter/ with Playwright installed globally (npm i -g playwright, then
// npx playwright install chromium):
//
//   NODE_PATH="$(npm root -g)" node --test tool/playwright/map.test.cjs
//
// CommonJS (.cjs), as NODE_PATH only reaches require(), not import.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const MAP_DIR = path.join(__dirname, '..', '..', 'assets', 'desktop', 'map');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// A style with nothing to fetch: a plain ground.
const BLANK = { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': '#f2efe9' } }] };
const DARK = { version: 8, sources: {}, layers: [{ id: 'ground', type: 'background', paint: { 'background-color': '#1e2326' } }] };

// What the live map's set-up sends (MapCommands.init), with [style].
function initCommand(id, style) {
  return {
    id,
    cmd: 'init',
    style,
    camera: { target: [1.3521, 103.8198], zoom: 11, bearing: 0, tilt: 0 },
    minZoom: 9,
    maxZoom: 19,
    bounds: [[0.9, 103.2], [1.8, 104.5]],
    tilt: false,
    compass: true,
    compassMargins: [16, 200],
    attribution: 'bottomLeft',
    ground: '#f2efe9',
  };
}

// Serves the map page's folder on 127.0.0.1, as the app's local server does.
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const name = path.basename(new URL(req.url, 'http://x').pathname);
      const file = path.join(MAP_DIR, name);
      if (!fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

let server;
let browser;
let base;

test.before(async () => {
  server = await startServer();
  base = `http://127.0.0.1:${server.address().port}/key/`;
  // SwiftShader draws WebGL without a graphics card, as on CI.
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
});

test.after(async () => {
  await browser?.close();
  server?.close();
});

// A fresh page with the pretend channel, every message kept in window.posted. Anything not on
// the test's server (or answered by [routes]) is refused, so nothing reaches the internet.
// A route's answer may be a function, asked each time: null for "no connection" (a 504).
async function openPage(routes = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const outside = [];
  await page.route('**/*', (route) => {
    const url = route.request().url();
    for (const [ending, answer] of Object.entries(routes)) {
      if (!url.endsWith(ending)) continue;
      const body = typeof answer === 'function' ? answer() : answer;
      if (body === null) return route.fulfill({ status: 504, body: '' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    if (url.startsWith(base)) return route.continue();
    outside.push(url);
    return route.abort();
  });
  await page.addInitScript(() => {
    window.posted = [];
    window.SgMapChannel = { postMessage: (m) => window.posted.push(JSON.parse(m)) };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}map.html`);
  return { page, outside, errors };
}

// Sends a command as Dart does and waits for its reply.
async function send(page, command, data) {
  await page.evaluate(([c, d]) => window.sgMap.run(c, d), [command, data === undefined ? null : data]);
  return waitFor(page, (m) => m.reply === command.id);
}

// Waits for a posted message matching [match] (a function, run in the test), and returns it.
async function waitFor(page, match, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const found = (await page.evaluate(() => window.posted)).find(match);
    if (found) return found;
    await page.waitForTimeout(50);
  }
  throw new Error(`Nothing posted matched ${match}`);
}

// The posted messages so far that match [match].
async function posted(page, match) {
  return (await page.evaluate(() => window.posted)).filter(match);
}

// A page with the blank style loaded, ready for sources and layers.
async function readyMap() {
  const opened = await openPage();
  const { page } = opened;
  const ready = await waitFor(page, (m) => m.event === 'ready');
  assert.equal(typeof ready.page, 'string');
  const reply = await send(page, initCommand(1, BLANK));
  assert.equal(reply.error, undefined, reply.error);
  await waitFor(page, (m) => m.event === 'style');
  return opened;
}

const line = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[103.84, 1.35], [103.86, 1.36]] }, properties: { color: '#2f7dff', width: 5, z: 1 } }],
};
const dots = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [103.85, 1.355] }, properties: { i: 0, fill: '#d6336c', radius: 9 } }],
};

test('sources and layers go in, properties split into layout and paint', async () => {
  const { page, outside, errors } = await readyMap();
  assert.equal((await send(page, { id: 2, cmd: 'addSource', source: 'sg-line' }, line)).error, undefined);
  assert.equal((await send(page, { id: 3, cmd: 'addSource', source: 'sg-dot' }, dots)).error, undefined);
  // As maplibre_gl's LineLayerProperties.toJson() and CircleLayerProperties.toJson() give them.
  const lineReply = await send(page, {
    id: 4,
    cmd: 'addLayer',
    type: 'line',
    source: 'sg-line',
    layer: 'sg-line',
    properties: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'z'] },
    filter: ['==', ['get', 'z'], 1],
  });
  assert.equal(lineReply.error, undefined, lineReply.error);
  const dotReply = await send(page, {
    id: 5,
    cmd: 'addLayer',
    type: 'circle',
    source: 'sg-dot',
    layer: 'sg-dot',
    properties: { 'circle-radius': ['get', 'radius'], 'circle-color': ['get', 'fill'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3, 'circle-sort-key': 1 },
  });
  assert.equal(dotReply.error, undefined, dotReply.error);

  const layer = await page.evaluate(() => {
    const m = window.sgMap.map;
    return {
      cap: m.getLayoutProperty('sg-line', 'line-cap'),
      sortKey: m.getLayoutProperty('sg-line', 'line-sort-key'),
      colour: m.getPaintProperty('sg-line', 'line-color'),
      width: m.getPaintProperty('sg-line', 'line-width'),
      circleSort: m.getLayoutProperty('sg-dot', 'circle-sort-key'),
      stroke: m.getPaintProperty('sg-dot', 'circle-stroke-width'),
      filter: m.getFilter('sg-line'),
    };
  });
  assert.deepEqual(layer, {
    cap: 'round',
    sortKey: ['get', 'z'],
    colour: ['get', 'color'],
    width: ['get', 'width'],
    circleSort: 1,
    stroke: 3,
    filter: ['==', ['get', 'z'], 1],
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  await page.close();
});

// A PNG of one pixel, as Dart sends an icon's image: base64 as the run call's second argument.
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test("icons: an image goes in at its pixel ratio, again replaces it, and a symbol layer names it", async () => {
  const { page, outside, errors } = await readyMap();
  assert.equal((await send(page, { id: 2, cmd: 'addSource', source: 'sg-mark' }, { type: 'FeatureCollection', features: [] })).error, undefined);
  const image = await send(page, { id: 3, cmd: 'addImage', name: 'pin-end', pixelRatio: 3 }, PIXEL);
  assert.equal(image.error, undefined, image.error);
  assert.equal((await send(page, { id: 4, cmd: 'addImage', name: 'pin-end', pixelRatio: 2 }, PIXEL)).error, undefined, 'the same name again');
  // As maplibre_gl's SymbolLayerProperties.toJson() gives them (live_map.dart's sg-mark).
  const layer = await send(page, {
    id: 5, cmd: 'addLayer', type: 'symbol', source: 'sg-mark', layer: 'sg-mark',
    properties: { 'icon-image': ['get', 'icon'], 'icon-anchor': ['get', 'anchor'], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'z'] },
  });
  assert.equal(layer.error, undefined, layer.error);
  const got = await page.evaluate(() => {
    const m = window.sgMap.map;
    return { has: m.hasImage('pin-end'), ratio: m.style.getImage('pin-end')?.pixelRatio, image: m.getLayoutProperty('sg-mark', 'icon-image'), overlap: m.getLayoutProperty('sg-mark', 'icon-allow-overlap') };
  });
  assert.deepEqual(got, { has: true, ratio: 2, image: ['get', 'icon'], overlap: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  await page.close();
});

test('the camera moves at once and smoothly, and reports where it is', async () => {
  const { page } = await readyMap();
  const jumped = await send(page, { id: 2, cmd: 'camera', update: ['newLatLngZoom', [1.355, 103.85], 15], animate: false });
  assert.equal(jumped.result.arrived, true);
  assert.ok(Math.abs(jumped.camera.target[0] - 1.355) < 1e-6);
  assert.ok(Math.abs(jumped.camera.target[1] - 103.85) < 1e-6);
  assert.equal(jumped.camera.zoom, 15);

  const before = (await posted(page, (m) => m.event === 'move')).length;
  const eased = await send(page, { id: 3, cmd: 'camera', update: ['newCameraPosition', { target: [1.3, 103.8], zoom: 14, bearing: 90, tilt: 30 }], animate: true, duration: 300 });
  assert.equal(eased.result.arrived, true);
  assert.ok(Math.abs(eased.camera.target[0] - 1.3) < 1e-6);
  assert.equal(eased.camera.zoom, 14);
  assert.equal(eased.camera.bearing, 90);
  assert.equal(eased.camera.tilt, 30);
  assert.ok((await posted(page, (m) => m.event === 'move')).length > before + 2, 'moves posted along the way');
  await waitFor(page, (m) => m.event === 'idle' && Math.abs(m.camera.target[0] - 1.3) < 1e-6);
  // Turned and tilted: the compass shows.
  assert.equal(await page.evaluate(() => document.getElementById('map').classList.contains('sg-north')), false);

  // A bearing west of north comes back from 0 to 360, as Android's.
  const turned = await send(page, { id: 4, cmd: 'camera', update: ['bearingTo', -45], animate: false });
  assert.equal(turned.camera.bearing, 315);
  const flat = await send(page, { id: 5, cmd: 'camera', update: ['newCameraPosition', { target: [1.3, 103.8], zoom: 14, bearing: 0, tilt: 0 }], animate: false });
  assert.equal(flat.result.arrived, true);
  assert.equal(await page.evaluate(() => document.getElementById('map').classList.contains('sg-north')), true);
  await page.close();
});

test('a smooth move cut short by another reports it did not arrive', async () => {
  const { page } = await readyMap();
  // Not awaited, as Dart doesn't wait for one command before sending the next.
  await page.evaluate(() => {
    window.sgMap.run({ id: 2, cmd: 'camera', update: ['newLatLngZoom', [1.4, 103.9], 16], animate: true, duration: 3000 });
  });
  await page.waitForTimeout(100);
  const second = await send(page, { id: 3, cmd: 'camera', update: ['newLatLng', [1.3, 103.8]], animate: false });
  const first = await waitFor(page, (m) => m.reply === 2);
  assert.equal(first.result.arrived, false);
  assert.equal(second.result.arrived, true);
  assert.ok(Math.abs(second.camera.target[0] - 1.3) < 1e-6, 'the second move won');
  await page.close();
});

test('a fit to a box keeps its padding and the turn', async () => {
  const { page } = await readyMap();
  await send(page, { id: 2, cmd: 'camera', update: ['bearingTo', 30], animate: false });
  const fitted = await send(page, { id: 3, cmd: 'camera', update: ['newLatLngBounds', [[1.30, 103.80], [1.32, 103.84]], 60, 120, 80, 200], animate: false });
  assert.equal(fitted.error, undefined, fitted.error);
  assert.ok(fitted.camera.zoom > 12 && fitted.camera.zoom < 17, `zoom ${fitted.camera.zoom}`);
  assert.equal(Math.round(fitted.camera.bearing), 30);
  const bad = await send(page, { id: 4, cmd: 'camera', update: ['zoomTo', null], animate: false });
  assert.equal(bad.code, 'INVALID_ARGUMENT');
  await page.close();
});

test('screen points and the features drawn round them', async () => {
  const { page } = await readyMap();
  await send(page, { id: 2, cmd: 'addSource', source: 'sg-dot' }, dots);
  await send(page, { id: 3, cmd: 'addLayer', type: 'circle', source: 'sg-dot', layer: 'sg-dot', properties: { 'circle-radius': 9, 'circle-color': '#d6336c' } });
  await send(page, { id: 4, cmd: 'camera', update: ['newLatLngZoom', [1.355, 103.85], 16], animate: false });
  const at = await send(page, { id: 5, cmd: 'project', at: [1.355, 103.85] });
  assert.ok(Math.abs(at.result.x - 400) < 1 && Math.abs(at.result.y - 300) < 1, JSON.stringify(at.result));

  // As live_map.dart's _onTap asks: a finger's width round the point, its layers named (one
  // that isn't there is skipped).
  const rect = [at.result.x - 10, at.result.y - 10, at.result.x + 10, at.result.y + 10];
  let hits = [];
  for (let id = 6; id < 60 && !hits.length; id++) {
    hits = (await send(page, { id, cmd: 'query', rect, layers: ['sg-dot', 'sg-poi-stop'] })).result;
    if (!hits.length) await page.waitForTimeout(100);
  }
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, 'Feature');
  assert.equal(hits[0].properties.i, 0);
  assert.equal(hits[0].layer.id, 'sg-dot');
  const elsewhere = await send(page, { id: 70, cmd: 'query', rect: [0, 0, 20, 20], layers: ['sg-dot'] });
  assert.deepEqual(elsewhere.result, []);
  const missing = await send(page, { id: 71, cmd: 'query', rect, layers: ['not-there'] });
  assert.deepEqual(missing.result, []);
  await page.close();
});

test('errors come back with maplibre_gl codes', async () => {
  const { page } = await readyMap();
  await send(page, { id: 2, cmd: 'addSource', source: 'sg-dot' }, dots);
  assert.equal((await send(page, { id: 3, cmd: 'addSource', source: 'sg-dot' }, dots)).code, 'SOURCE_ALREADY_EXISTS');
  assert.equal((await send(page, { id: 4, cmd: 'setSource', source: 'nowhere' }, dots)).code, 'SOURCE_NOT_FOUND');
  assert.equal((await send(page, { id: 5, cmd: 'addLayer', type: 'circle', source: 'nowhere', layer: 'x', properties: {} })).code, 'SOURCE_NOT_FOUND');
  const bad = await send(page, { id: 6, cmd: 'addLayer', type: 'circle', source: 'sg-dot', layer: 'bad', properties: { 'circle-radius': 'big' } });
  assert.equal(bad.code, 'INVALID_LAYER');
  // A property MapLibre GL JS doesn't know (one of maplibre_gl's own) is left out, not fatal.
  const extra = await send(page, { id: 7, cmd: 'addLayer', type: 'line', source: 'sg-dot', layer: 'extra', properties: { 'line-color': '#000000', 'line-layer-opacity': 0.5 } });
  assert.equal(extra.error, undefined, extra.error);
  assert.equal((await send(page, { id: 8, cmd: 'fly' })).code, 'UNKNOWN_COMMAND');
  await page.close();
});

test('a source set again replaces its data', async () => {
  const { page } = await readyMap();
  await send(page, { id: 2, cmd: 'addSource', source: 'sg-dot' }, dots);
  const moved = { type: 'FeatureCollection', features: [{ ...dots.features[0], properties: { i: 7, fill: '#000000', radius: 9 } }] };
  assert.equal((await send(page, { id: 3, cmd: 'setSource', source: 'sg-dot' }, moved)).error, undefined);
  const data = await page.evaluate(() => window.sgMap.map.getSource('sg-dot').getData());
  assert.equal(data.features[0].properties.i, 7);
  await page.close();
});

test('clicks, right-clicks and drags are posted; the page keeps its menu and links to itself', async () => {
  const { page } = await readyMap();
  await page.mouse.click(300, 200);
  const click = await waitFor(page, (m) => m.event === 'click');
  assert.equal(click.x, 300);
  assert.equal(click.y, 200);
  assert.ok(click.lat > 1 && click.lat < 2 && click.lng > 103 && click.lng < 105);

  await page.mouse.click(320, 220, { button: 'right' });
  const press = await waitFor(page, (m) => m.event === 'longpress');
  assert.equal(press.x, 320);
  assert.equal(await page.evaluate(() => !document.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true }))), true, 'the menu is held back');

  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(450, 330, { steps: 5 });
  await page.mouse.up();
  await waitFor(page, (m) => m.event === 'gesture');

  // A link (as the map's credits are) goes to Dart to open in the browser; the page stays.
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://openfreemap.org/';
    a.id = 'credit';
    a.textContent = 'OpenFreeMap';
    a.style.cssText = 'position:absolute;left:10px;top:10px;z-index:9';
    document.body.appendChild(a);
  });
  await page.click('#credit');
  const link = await waitFor(page, (m) => m.event === 'link');
  assert.equal(link.url, 'https://openfreemap.org/');
  assert.equal(page.url(), `${base}map.html`);
  await page.close();
});

test("OpenFreeMap's addresses go to the local server, and a new style is loaded in full", async () => {
  const { page, outside } = await openPage({ '/key/ofm/styles/liberty': BLANK, '/key/ofm/styles/dark': DARK });
  await waitFor(page, (m) => m.event === 'ready');
  const reply = await send(page, initCommand(1, 'https://tiles.openfreemap.org/styles/liberty'));
  assert.equal(reply.error, undefined);
  await waitFor(page, (m) => m.event === 'style');
  await send(page, { id: 2, cmd: 'addSource', source: 'sg-dot' }, dots);

  // The theme turns dark: the style is swapped, 'style' posted again, and its sources start empty.
  await send(page, { id: 3, cmd: 'setStyle', style: 'https://tiles.openfreemap.org/styles/dark', ground: '#1e2326' });
  for (let i = 0; i < 100 && (await posted(page, (m) => m.event === 'style')).length < 2; i++) await page.waitForTimeout(50);
  assert.equal((await posted(page, (m) => m.event === 'style')).length, 2);
  // Until it has loaded, sources wait; then the live map adds its own again.
  let again;
  for (let id = 4; id < 40; id++) {
    again = await send(page, { id, cmd: 'addSource', source: 'sg-dot' }, dots);
    if (again.code !== 'STYLE_NOT_READY') break;
    await page.waitForTimeout(100);
  }
  assert.equal(again.error, undefined, again.error);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ground').trim()), '#1e2326');
  assert.deepEqual(outside, [], 'nothing went to the internet');
  await page.close();
});

test('a style that failed offline is asked for again when the connection is back', async () => {
  let online = false;
  const { page, errors } = await openPage({ '/key/ofm/styles/liberty': () => (online ? BLANK : null) });
  await waitFor(page, (m) => m.event === 'ready');
  await send(page, initCommand(1, 'https://tiles.openfreemap.org/styles/liberty'));
  await waitFor(page, (m) => m.event === 'error');
  assert.equal((await posted(page, (m) => m.event === 'style')).length, 0);
  online = true;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(page, (m) => m.event === 'style');
  assert.deepEqual(errors, []);
  await page.close();
});

test('the page refuses anything but its own server (Content-Security-Policy)', async () => {
  const { page } = await readyMap();
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  assert.equal(blocked, true);
  await page.close();
});
