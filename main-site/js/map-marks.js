// Icons on the live map (js/map.js), as SVG in HTML, for the map engine's mark() (js/map-engine.js):
// where a trip starts and ends, as pins; a speech bubble over each stop where you get on or off,
// its point on the stop; and you, as what you're riding: a bus, a train, a car or a bike (on foot
// you're the dot and its cone). Keep in step with flutter/lib/features/map/map_marks.dart.
//
// Each maker gives { html, anchor }, `anchor` the part of it that sits on its point: 'bottom'
// (a pin's or a bubble's point) or 'center'.
//
// Plain script: exports go on window.
(function () {
  const NAVY = '#14213d';
  const RED = '#e4572e';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const colour = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : NAVY);

  // A trip's start (navy) or end (red): a map pin with a white middle.
  function pin(end) {
    const fill = end ? RED : NAVY;
    return {
      anchor: 'bottom',
      html: `<svg class="markPin" width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">` +
        `<path d="M15 39 C11 31 2 25 2 15 A13 13 0 0 1 28 15 C28 25 19 31 15 39 Z" fill="${fill}" stroke="#fff" stroke-width="2"/>` +
        `<circle cx="15" cy="15" r="5" fill="#fff"/></svg>`,
    };
  }

  // A speech bubble with a point at the bottom: "Get off", "Board 67", with an icon if given.
  function bubble(text, fill = NAVY, icon = null) {
    return {
      anchor: 'bottom',
      html: `<span class="markBubble" style="--mark:${colour(fill)}">${icon ? window.icon(icon) : ''}<span>${esc(text)}</span></span>`,
    };
  }

  // You, as what you're riding ('bus', 'train', 'car' or 'bike'): a round badge in its colour.
  function ride(kind, fill) {
    return {
      anchor: 'center',
      html: `<span class="markRide" style="--mark:${colour(fill)}">${window.icon(kind)}</span>`,
    };
  }

  window.MapMarks = { pin, bubble, ride };
})();
