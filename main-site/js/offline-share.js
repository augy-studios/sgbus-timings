// Offline Sharing: the share card's fifth button in the Android app (2.1.0 and later), which
// hands the link to a phone nearby with no internet on either (OfflineSharePlugin.java, through
// js/app-bridge.js). Two ways, both ready while the sheet is open:
//
//   Tap     hold the backs of the phones together. This phone answers as an NFC tag with the
//           link on it, so the other needs nothing open: Android opens the link in SG Bus
//           Timings there, or in the browser on a phone without it.
//   Nearby  the other phone opens Receive nearby (the Edge Tray) and shows up here by its name;
//           picking it sends the link over Bluetooth and Wi-Fi. Needs Google Play services, and
//           Bluetooth's and Nearby devices' permissions the first time.
//
// The link is one a browser can open too: Navigate's own link for a place or directions, which
// needs no server to look up (js/share.js offlineUrl), or a live ETA's short link. Whoever gets
// it needs the internet to plan the way there, not to receive it.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = (name) => `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;

  const native = () => Boolean(window.AppBridge?.native);
  const canTap = () => native() && AppBridge.has('sharetap');
  const canNearby = () => native() && AppBridge.has('sharenearby');
  const canSend = () => canTap() || canNearby();
  const canSticker = () => native() && AppBridge.has('sticker');

  const call = (method, options) => AppBridge.call('OfflineShare', method, options);

  let mode = null; // 'send', 'receive' or 'sticker', while the sheet's open
  // Writing to an NFC sticker: null, 'waiting', 'done', or what went wrong.
  let writing = null;
  let status = null; // OfflineSharePlugin.status()
  // Sending: the link, how many phones it's gone to by tap, and the phones found by Nearby, by
  // their id: { name, state: 'found' | 'sending' | 'sent' | 'failed', message }.
  let sending = null;
  let tapped = 0;
  let peers = new Map();
  let finding = false;
  // Receiving: listening for phones, and who's sending.
  let listening = false;
  let incoming = null;
  // Nearby's problem, if it has one: 'permission' or 'failed'.
  let problem = null;

  function reset(m) {
    mode = m;
    status = null;
    tapped = 0;
    peers = new Map();
    finding = false;
    listening = false;
    incoming = null;
    problem = null;
    writing = null;
  }

  // ---------- an NFC sticker (2.1.0) ----------
  // The link written onto a blank NFC sticker, so tapping it later opens it: a stop at the
  // front door, Bus home by the desk. From Offline Sharing's sheet, or a stop's own tools.

  function sticker({ url, title }) {
    if (!canSticker()) return;
    reset('sticker');
    sending = { url, title };
    $('#offlineTitle').textContent = 'NFC sticker';
    $('#offlineNote').textContent = 'Any blank NFC sticker (NTAG213 or bigger) will do. Writing over one replaces what was on it.';
    openModal('offlineModal');
    write();
  }

  async function write() {
    writing = 'waiting';
    render();
    try {
      await call('write', { url: sending.url });
      writing = 'done';
      navigator.vibrate?.(60);
    } catch (e) {
      writing = e?.code === 'cancelled' ? null : e?.code === 'off' ? 'off' : (e?.message || 'Couldn’t write it. Try again.');
    }
    if (mode) render();
  }

  function renderSticker() {
    if (writing === 'waiting') {
      return `<div class="cardWait">${ico('nearby')}<p><strong>Hold a blank NFC sticker to the back of the phone</strong></p>` +
        `<p class="sub">Near the camera on most phones. Keep it still until it's written.</p></div>`;
    }
    if (writing === 'done') {
      return `<p class="offlineSent">${ico('check')} Written.</p><p class="sub">Tap the sticker with a phone to open it: in SG Bus Timings, or the browser.</p>` +
        `<button type="button" class="btn" data-offline="write">${ico('nearby')} Write another</button>`;
    }
    if (writing === 'off') {
      return `<p>NFC is off. Turn it on, then come back here.</p>` +
        `<button type="button" class="btn" data-offline="nfc">${ico('settings')} Turn on NFC</button>`;
    }
    return `${writing ? `<p>${esc(writing)}</p>` : ''}<button type="button" class="btn" data-offline="write">${ico('nearby')} Write it</button>`;
  }

  // ---------- sending ----------

  function send({ url, title }) {
    if (!canSend()) return;
    reset('send');
    sending = { url, title };
    $('#offlineTitle').textContent = 'Offline Sharing';
    $('#offlineNote').textContent = 'No internet needed to send it. They need the internet to plan the way there.';
    render();
    openModal('offlineModal');
    startSending();
  }

  async function startSending() {
    status = await call('status').catch(() => null);
    if (mode !== 'send' || !status) return;
    await call('share', { url: sending.url }).catch(() => {});
    render();
    if (status.nearby && status.allowed && !finding) find();
  }

  async function find() {
    problem = null;
    finding = true;
    render();
    try {
      await call('find');
    } catch (e) {
      finding = false;
      problem = e?.code === 'permission' ? 'permission' : 'failed';
    }
    render();
  }

  function sendTo(id) {
    const peer = peers.get(id);
    if (!peer || peer.state === 'sending') return;
    peer.state = 'sending';
    render();
    call('send', { id, name: peer.name, from: LS.getName() }).catch(() => {
      peer.state = 'failed';
      peer.message = "Couldn't reach that phone. Try again, closer to it.";
      render();
    });
  }

  function renderSend() {
    let html = `<p class="offlineWhat">${esc(sending.title)}</p>`;
    if (!status) return `${html}<p class="sub">Getting ready…</p>`;

    if (status.tap && status.nfc === 'on') {
      html += `<div class="cardWait">${ico('nearby')}<p><strong>Hold the backs of your phones together</strong></p>` +
        `<p class="sub">It opens on theirs in SG Bus Timings, or in their browser. Their phone needs NFC on, and to be unlocked.</p></div>`;
      if (tapped) html += `<p class="offlineSent">${ico('check')} Sent${tapped > 1 ? ` to ${tapped} phones` : ''}. Hold another phone to send it again.</p>`;
    } else if (status.tap && status.nfc === 'off') {
      html += `<p>Turn on NFC to share by holding your phones together.</p>` +
        `<button type="button" class="btn" data-offline="nfc">${ico('settings')} Turn on NFC</button>`;
    }

    if (status.nearby) {
      html += `<p class="modal-section-label">Phones nearby</p>`;
      if (problem === 'permission') {
        html += `<p class="sub">To find phones nearby, allow SG Bus Timings to use Nearby devices.</p>` +
          `<button type="button" class="btn" data-offline="settings">${ico('settings')} Open settings</button>`;
      } else if (problem === 'failed') {
        html += `<p class="sub">Couldn't look for phones nearby. Check Bluetooth is on.</p>` +
          `<button type="button" class="btn" data-offline="find">${ico('sync')} Try again</button>`;
      } else if (!finding) {
        html += `<p class="sub">Or send it to a phone with SG Bus Timings, over Bluetooth, without touching.</p>` +
          `<button type="button" class="btn" data-offline="find">${ico('nearby')} Find phones nearby</button>`;
      } else {
        const rows = [...peers].map(([id, p]) => {
          const sub = { found: 'Tap to send', sending: 'Sending…', sent: 'Sent', failed: p.message || 'Didn’t send. Tap to try again.' }[p.state];
          return `<button type="button" class="shareMenuItem offlinePeer ${p.state}" data-offline-peer="${esc(id)}"${p.state === 'sending' ? ' disabled' : ''}>` +
            `${ico(p.state === 'sent' ? 'check' : 'phone')}<span><strong>${esc(p.name || 'A phone')}</strong><span class="sub">${esc(sub)}</span></span></button>`;
        }).join('');
        html += rows ? `<div class="offlinePeers">${rows}</div>` : '';
        html += `<p class="sub">${rows ? 'Not there? ' : 'Looking… '}On their phone, open SG Bus Timings and tap Receive nearby in the Edge Tray.</p>`;
      }
    }
    if (canSticker()) {
      html += `<p class="modal-section-label">NFC sticker</p>` +
        `<button type="button" class="btn" data-offline="sticker">${ico('nearby')} Write it to an NFC sticker</button>`;
    }
    return html;
  }

  // ---------- receiving ----------

  async function receive() {
    if (!canNearby()) return;
    reset('receive');
    sending = null;
    $('#offlineTitle').textContent = 'Receive nearby';
    $('#offlineNote').textContent = 'Only links to SG Bus Timings are taken. Nothing is sent from this phone but its name.';
    render();
    openModal('offlineModal');
    status = await call('status').catch(() => null);
    try {
      await call('receive', { name: LS.getName() });
      if (mode === 'receive') listening = true;
    } catch (e) {
      problem = e?.code === 'permission' ? 'permission' : 'failed';
    }
    render();
  }

  function renderReceive() {
    const name = LS.getName().trim();
    let html = '';
    if (problem === 'permission') {
      html += `<p>To receive from phones nearby, allow SG Bus Timings to use Nearby devices.</p>` +
        `<button type="button" class="btn" data-offline="settings">${ico('settings')} Open settings</button>`;
    } else if (problem === 'failed') {
      html += `<p>Couldn't get ready to receive. Check Bluetooth is on.</p>` +
        `<button type="button" class="btn" data-offline="receive">${ico('sync')} Try again</button>`;
    } else if (incoming) {
      html += `<div class="cardWait">${ico('nearby')}<p><strong>Receiving from ${esc(incoming)}…</strong></p></div>`;
    } else {
      html += `<div class="cardWait">${ico('nearby')}<p><strong>${listening ? 'Ready to receive' : 'Getting ready…'}</strong></p>` +
        `<p class="sub">On their phone: Share, then Offline Sharing, and pick ${name ? `<strong>${esc(name)}</strong>` : 'this phone (it shows by its model; set your name in Settings to show that instead)'}.</p></div>`;
    }
    if (status?.nfc && status.nfc !== 'none') {
      html += `<p class="sub">Or hold the backs of the phones together: that works without this open.</p>`;
    }
    return html;
  }

  // A link that came from a phone nearby: one to this site only, opened as if it were tapped.
  function received({ url } = {}) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return;
    }
    if (u.origin !== location.origin) return;
    if (!$('#offlineModal').classList.contains('hidden')) closeModal('offlineModal');
    if (u.pathname === '/' && location.pathname === '/') {
      // Navigate's link: the hash, as if it were tapped here.
      if (location.hash === u.hash) routeFromHash();
      else location.hash = u.hash;
    } else {
      location.assign(u.href);
    }
  }

  // ---------- the sheet ----------

  function render() {
    if (!mode) return;
    $('#offlineBody').innerHTML = mode === 'send' ? renderSend() : mode === 'sticker' ? renderSticker() : renderReceive();
  }

  function stop() {
    if (writing === 'waiting') call('cancelWrite').catch(() => {});
    if (mode === 'send') call('stop').catch(() => {});
    if (mode === 'receive') call('stopReceiving').catch(() => {});
    mode = null;
    sending = null;
  }

  function init() {
    const showButton = () => { $('#receiveBtn').hidden = !canNearby(); };
    window.addEventListener('app:ready', showButton);
    showButton();
    if (!native()) return;

    $('#receiveBtn').addEventListener('click', receive);
    $('#offlineModal').addEventListener('modalclose', stop);
    $('#offlineBody').addEventListener('click', (e) => {
      const peer = e.target.closest('[data-offline-peer]');
      if (peer) return sendTo(peer.dataset.offlinePeer);
      const action = e.target.closest('[data-offline]')?.dataset.offline;
      if (action === 'nfc') AppBridge.call('SgBus', 'openSettings', { what: 'nfc' });
      else if (action === 'settings') AppBridge.call('SgBus', 'openSettings', { what: 'app' });
      else if (action === 'find') find();
      else if (action === 'receive') receive();
      else if (action === 'write') write();
      else if (action === 'sticker' && sending) {
        // From the sharing sheet: the same link, to a sticker. Sharing by tap stops meanwhile,
        // as the phone's reading rather than being read.
        const { url, title } = sending;
        call('stop').catch(() => {});
        sticker({ url, title });
      }
    });

    AppBridge.on('OfflineShare', 'found', ({ id, name }) => {
      if (mode !== 'send' || peers.get(id)?.state === 'sent') return;
      peers.set(id, { name, state: 'found' });
      render();
    });
    AppBridge.on('OfflineShare', 'lost', ({ id }) => {
      if (peers.get(id)?.state === 'found') peers.delete(id);
      render();
    });
    AppBridge.on('OfflineShare', 'sent', ({ via, id }) => {
      if (mode !== 'send') return;
      if (via === 'tap') tapped += 1;
      else if (peers.has(id)) peers.get(id).state = 'sent';
      navigator.vibrate?.(60);
      render();
    });
    AppBridge.on('OfflineShare', 'failed', ({ id, message }) => {
      const peer = peers.get(id);
      if (!peer) return;
      peer.state = 'failed';
      peer.message = message;
      render();
    });
    AppBridge.on('OfflineShare', 'incoming', ({ name }) => {
      if (mode !== 'receive') return;
      incoming = name || 'a phone';
      render();
    });
    AppBridge.on('OfflineShare', 'received', received);

    // Back from NFC's or the app's settings: as it is now. A sticker being waited for stopped
    // as the app went to the background (reader mode ends with it), so it's waited for again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !mode) return;
      if (mode === 'send') startSending();
      else if (mode === 'sticker' && (writing === 'off' || writing === null)) write();
      else if (problem === 'permission') receive();
    });
  }

  window.OfflineShare = { canSend, canSticker, send, receive, sticker };
  init();
})();
