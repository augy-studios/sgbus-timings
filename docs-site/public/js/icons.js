// Inline SVG icons. Colour is inherited via currentColor, never hardcoded.
// The first block matches main-site/js/icons.js, so the guide draws the same
// icons the app shows. Plain script: exports go on window.
(function () {
  var a = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';
  var z = "</svg>";

  var icons = {
    // From the app.
    sun: a + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>' + z,
    moon: a + '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' + z,
    close: a + '<path d="M18 6 6 18M6 6l12 12"/>' + z,
    clock: a + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>' + z,
    settings: a + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>' + z,
    pin: a + '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>' + z,
    route: a + '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>' + z,
    swap: a + '<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>' + z,
    star: a + '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>' + z,
    back: a + '<path d="M19 12H5M11 6l-6 6 6 6"/>' + z,
    navigate: a + '<path d="m3 11 18-8-8 18-2-8z"/>' + z,
    bus: a + '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><circle cx="8" cy="14.5" r=".8"/><circle cx="16" cy="14.5" r=".8"/>' + z,
    walk: a + '<circle cx="13" cy="4" r="1.8"/><path d="m9 21 2-6 3 3v3M8 12l2-4 4 1 2 4 3 1M11 15l1-6"/>' + z,
    sync: a + '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>' + z,
    flag: a + '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>' + z,

    // The guide's own.
    menu: a + '<path d="M4 6h16M4 12h16M4 18h16"/>' + z,
    search: a + '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>' + z,
    globe: a + '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' + z,
    send: a + '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>' + z,
    external: a + '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>' + z,
    link: a + '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>' + z,
    list: a + '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>' + z,
    "arrow-left": a + '<path d="M19 12H5M11 6l-6 6 6 6"/>' + z,
    "arrow-right": a + '<path d="M5 12h14M13 6l6 6-6 6"/>' + z,
    info: a + '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>' + z,
    bulb: a + '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>' + z,
    alert: a + '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17h.01"/>' + z,
    heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 20.5s-8-4.9-8-10.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.9c0 5.7-8 10.6-8 10.6z"/></svg>',
    copy: a + '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>' + z,
    check: a + '<path d="m5 12.5 4.5 4.5L19 7.5"/>' + z,
    "corner-down-left": a + '<path d="M9 10 4 15l5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>' + z,
  };

  function icon(name) {
    return icons[name] || "";
  }

  window.icons = icons;
  window.icon = icon;
})();
