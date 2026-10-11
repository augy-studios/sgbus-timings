// Card value: the stored value on an EZ-Link or NETS FlashPay card, read by holding it to the
// back of the phone. Only in the Android app (2.0.0 and later) on a phone with NFC, which the
// app reads the card with (CardPlugin.java, through js/app-bridge.js); a web page can't. The
// tray's card button shows only there, and the app's Card value shortcut opens it (#card).
//
// The value is read straight off the card. Cards on SimplyGo's account-based ticketing keep
// their value in the SimplyGo account instead, so the card's own figure can be out of date
// for them; SimplyGo's button is next to this one for those.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ico = (name) => `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;

  const dollars = (cents) => `${cents < 0 ? '−' : ''}$${(Math.abs(cents) / 100).toFixed(2)}`;
  const date = (ms) => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric' });
  // The card number as printed: four groups of four.
  const can = (s) => String(s).replace(/(.{4})(?=.)/g, '$1 ');

  let reading = false;

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
      const c = await AppBridge.call('Card', 'read');
      const expired = c.expiry < Date.now();
      show(
        `<p class="cardValue">${dollars(c.balance)}</p>` +
        `<p class="sub">on card ${esc(can(c.can))}</p>` +
        `<dl class="cardFacts">` +
        `<dt>Expires</dt><dd>${expired ? '<strong>Expired</strong> ' : ''}${date(c.expiry)}</dd>` +
        (c.autoloadOn ? `<dt>Auto top-up</dt><dd>${dollars(c.autoload)} when it runs low</dd>` : '') +
        `</dl>` +
        (c.balance < 300 ? `<p class="cardLow">${ico('alert')} Under $3: top up before your next ride.</p>` : '') +
        `<p class="mode-note">A card on SimplyGo keeps its value in your SimplyGo account, so this can be out of date for it: check the SimplyGo app.</p>`,
        { again: true },
      );
    } catch (err) {
      const why = {
        'not-cepas': "That card couldn't be read as an EZ-Link or NETS FlashPay card. Bank cards and phones can't be read for a value.",
        lost: 'The card moved away too soon. Hold it still against the phone, and try again.',
        off: 'NFC is off. Turn it on, then come back here.',
        cancelled: null,
      }[err?.code];
      if (why !== null) show(`<p>${esc(why || "Couldn't read the card. Try again.")}</p>`, { again: true, nfc: err?.code === 'off' });
    } finally {
      reading = false;
    }
  }

  function init() {
    // The button shows once the app's said it can.
    const showButton = () => { $('#cardBtn').hidden = !available(); };
    window.addEventListener('app:ready', showButton);
    showButton();
    $('#cardBtn').addEventListener('click', open);
    $('#cardAgain').addEventListener('click', read);
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
