// Card value: the stored value on an EZ-Link or NETS FlashPay card, read by holding it to the
// back of the phone. Only in the Android app (2.0.0 and later) on a phone with NFC, which the
// app reads the card with (CardPlugin.java, through js/app-bridge.js); a web page can't. The
// tray's card button shows only there, and the app's Card value shortcut opens it (#card).
// From 2.0.8, holding a card to the phone without either opens it too: Android offers the app
// for the card, even closed, and it's read straight away (CardPlugin's "tapped").
//
// The value is read straight off the card. Cards on SimplyGo's account-based ticketing keep
// their value in the SimplyGo account instead, so the card's own figure can be out of date or
// meaningless for them; SimplyGo's button is next to this one for those. A value outside what
// a card can hold isn't shown at all, and the card's data can be copied (without its numbers)
// to work out why.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = (name) => `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;

  const dollars = (cents) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
  const date = (ms) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
  // The card number as printed: four groups of four.
  const can = (s) => String(s).replace(/(.{4})(?=.)/g, '$1 ');

  // A card holds up to $500, and can go a little below nothing on a ride it couldn't cover.
  const MAX_CENTS = 50000;
  const MIN_CENTS = -1000;

  let reading = false;
  let lastRaw = null;

  const available = () => Boolean(window.AppBridge?.native && AppBridge.has('card'));

  function show(html, { again = false, nfc = false } = {}) {
    $('#cardBody').innerHTML = html;
    $('#cardAgain').hidden = !again;
    $('#cardNfc').hidden = !nfc;
  }

  async function open() {
    if (!window.AppBridge?.native) return;
    await AppBridge.ready(5000);
    if (!available()) return;
    openModal('cardModal');
    read();
  }

  async function read() {
    if (reading) return;
    const { nfc } = await AppBridge.call('Card', 'status').catch(() => ({ nfc: 'none' }));
    if (nfc === 'none') return show(`<p>This phone can't read cards: it has no NFC.</p>`);
    if (nfc === 'off') return show(`<p>NFC is off. Turn it on, then come back here.</p>`, { nfc: true });

    reading = true;
    show(`<div class="cardWait">${ico('card')}<p><strong>Hold your card to the back of the phone</strong></p>` +
      `<p class="sub">Near the camera on most phones. Keep it still until it's read.</p></div>`);
    try {
      showCard(await AppBridge.call('Card', 'read'));
    } catch (err) {
      showError(err?.code, err?.data?.raw);
    } finally {
      reading = false;
    }
  }

  function showCard(c) {
    lastRaw = c.raw || null;
    const expired = c.expiry < Date.now();
    if (!(c.balance >= MIN_CENTS && c.balance <= MAX_CENTS)) {
      show(
        `<p><strong>This card's value couldn't be read.</strong></p>` +
        `<p class="sub">Check it in the SimplyGo app for now. To help fix this, open Card data below, copy it and send it to us: it doesn't include your card's number.</p>` +
        rawBlock(),
        { again: true },
      );
      return;
    }
    show(
      `<p class="cardValue">${dollars(c.balance)}</p>` +
      `<p class="sub">on card ${esc(can(c.can))}</p>` +
      `<dl class="cardFacts">` +
      `<dt>Expires</dt><dd>${expired ? '<strong>Expired</strong> ' : ''}${date(c.expiry)}</dd>` +
      (c.autoloadOn && c.autoload > 0 && c.autoload <= MAX_CENTS ? `<dt>Auto top-up</dt><dd>${dollars(c.autoload)} when it runs low</dd>` : '') +
      `</dl>` +
      (c.balance < 300 ? `<p class="cardLow">${ico('alert')} Under $3: top up before your next ride.</p>` : '') +
      historyBlock(c.history) +
      `<p class="mode-note">A card on SimplyGo keeps its value in your SimplyGo account, so this can be out of date for it: check the SimplyGo app.</p>` +
      rawBlock(),
      { again: true },
    );
  }

  function showError(code, raw) {
    const why = {
      'not-cepas': "That card couldn't be read as an EZ-Link or NETS FlashPay card. Bank cards and phones can't be read for a value.",
      lost: 'The card moved away too soon. Hold it still against the phone, and try again.',
      off: 'NFC is off. Turn it on, then come back here.',
      cancelled: null,
    }[code];
    lastRaw = raw || null;
    if (why !== null) show(`<p>${esc(why || "Couldn't read the card. Try again.")}</p>` + rawBlock(), { again: true, nfc: code === 'off' });
  }

  // A card held to the phone while the card value wasn't waiting for one, already read by the
  // app: shown wherever you are, over whatever's open.
  function tapped(c) {
    if (reading) return;
    if ($('#cardModal').classList.contains('hidden')) openModal('cardModal');
    if (c?.error) showError(c.error, c.raw);
    else if (c) showCard(c);
  }

  // The card's last rides and top-ups, newest first, as the card keeps them.
  const KINDS = { bus: ['bus', 'Bus'], train: ['train', 'Train'], topup: ['card', 'Top-up'], refund: ['bus', 'Bus refund'], other: ['card', 'Other'] };
  const when = (ms) => new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  function historyBlock(history) {
    if (!Array.isArray(history) || !history.length) return '';
    const rows = history.slice(0, 15).map((h) => {
      const [icon, label] = KINDS[h.type] || KINDS.other;
      // A bus's "BUS228" or "BUS  21" says its number; a train's "HBC-BDK" its stations.
      const what = h.type === 'bus' || h.type === 'refund' ? h.what.replace(/^BUS\s*/i, 'Bus ') : h.what;
      return `<li>${ico(icon)}<span class="cardRide"><span>${esc(what || label)}</span><span class="sub">${esc(when(h.time))}</span></span>` +
        `<span class="cardAmt${h.amount > 0 ? ' plus' : ''}">${h.amount > 0 ? '+' : ''}${dollars(h.amount)}</span></li>`;
    }).join('');
    return `<p class="modal-section-label cardHistLabel">Recent rides and top-ups</p><ul class="cardHistory">${rows}</ul>`;
  }

  // The card's data as read, without its numbers, to copy and send if a card reads wrongly.
  function rawBlock() {
    if (!lastRaw) return '';
    return `<details class="cardRaw"><summary>Card data</summary><code>${esc(lastRaw)}</code>` +
      `<button type="button" class="iconBtn" data-card-copy>${ico('copy')} Copy</button></details>`;
  }

  function init() {
    // The button shows once the app's said it can.
    const showButton = () => { $('#cardBtn').hidden = !available(); };
    window.addEventListener('app:ready', showButton);
    showButton();
    $('#cardBtn').addEventListener('click', open);
    AppBridge.on('Card', 'tapped', tapped);
    $('#cardAgain').addEventListener('click', read);
    $('#cardBody').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-card-copy]');
      if (!btn || !lastRaw) return;
      navigator.clipboard?.writeText(lastRaw).then(() => { btn.lastChild.textContent = ' Copied'; }).catch(() => {});
    });
    $('#cardNfc').addEventListener('click', () => AppBridge.call('SgBus', 'openSettings', { what: 'nfc' }));
    $('#cardModal').addEventListener('modalclose', () => {
      if (reading) AppBridge.call('Card', 'cancel').catch(() => {});
    });
    // Back from NFC's settings: try again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !$('#cardModal').classList.contains('hidden') && !reading && !$('#cardNfc').hidden) read();
    });
  }

  window.Card = { open };
  init();
})();
