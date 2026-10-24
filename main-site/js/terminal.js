// The sgbus terminal: the Linux command line's sgbus> prompt, on the page. The commands are
// js/sgbus-core.js, the same file the command line runs (cli/sgbus.js), so each says what it
// says there: 84009, nav home work, favs -w, help. Opened by typing sgbus in the browser's
// console, by Ctrl+` anywhere, or from Settings (script.js has the stand-in that fetches this,
// and the core, the first time).
//
// As at the command line's prompt: commands without "sgbus" in front (it's dropped if typed),
// Up and Down through what's been typed before (kept in this browser, the last HISTORY_MAX),
// Tab to finish a command or a place, Ctrl+C to stop a -w or clear the line (it copies while
// text is selected), Ctrl+L or clear to clear the screen, and exit, Esc or Back to close. A -w
// also has a Stop button, for a phone.
//
// What's saved is the app's own: fav add 84009 is a favourite on Bus timings too, place set gym
// is in Places, settings are Settings'. Routines only in the Android app, which sends them.
//
// No way in but the keyboard: what's typed is only read as words, never run as code; nothing
// else can type a command (open() takes none, and nothing here listens to links, the address,
// messages or sync); what's printed goes on the page as text, never as HTML, with nothing but
// the core's own colours (sgbus-core.js takes every other control character out); and it asks
// this site alone. It does only what the app's own buttons do, as you, in this browser.
// Plain script: exports go on window.
(function () {
  const HISTORY_KEY = 'sgbus_terminal_history';
  const HISTORY_MAX = 500;
  // Lines kept on screen; the oldest go first.
  const MAX_ROWS = 4000;
  const ID = 'terminalModal';

  // ---------- what's saved: the app's own ----------

  const routinesHere = () => !!window.Reminders?.has('routines');
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // What load() last gave, so save() writes back only what a command changed.
  let loaded = null;

  function load() {
    const others = Places.all()
      .filter((p) => p.key.startsWith('p:'))
      .map((p) => ({ id: p.id, name: p.name, label: p.label, lat: p.lat, lng: p.lng, ...(p.stop && { stop: p.stop }) }));
    const config = {
      favs: LS.getFavs().map((f) => ({ code: f.code, name: f.name || nameOf(f.code) || f.code })),
      buses: LS.getFavBuses(),
      routes: LS.getFavRoutes(),
      navs: LS.getFavNavs(),
      places: { home: LS.getPlace('home'), work: LS.getPlace('work'), others },
      routines: routinesHere() ? Reminders.routineList() : [],
      settings: { pinStop: LS.getPin('stop'), pinBus: LS.getPin('bus'), restricted: LS.getRestricted(), customs: LS.getCustoms() },
    };
    loaded = JSON.parse(JSON.stringify(config));
    return config;
  }

  function save(c) {
    const was = loaded || {};
    if (!same(c.favs, was.favs)) LS.setFavs(c.favs);
    if (!same(c.buses, was.buses)) LS.setFavBuses(c.buses);
    if (!same(c.routes, was.routes)) LS.setFavRoutes(c.routes);
    if (!same(c.navs, was.navs)) LS.setFavNavs(c.navs);
    for (const kind of ['home', 'work']) {
      if (same(c.places[kind], was.places?.[kind])) continue;
      if (c.places[kind]) Places.set(kind, c.places[kind]);
      else Places.remove(kind);
    }
    if (!same(c.places.others, was.places?.others)) Places.setCustom(c.places.others);
    if (!same(c.routines, was.routines) && routinesHere()) Reminders.setRoutines(c.routines);
    if (!same(c.settings, was.settings)) {
      LS.setPin('stop', c.settings.pinStop);
      LS.setPin('bus', c.settings.pinBus);
      LS.setRestricted(c.settings.restricted);
      LS.setCustoms(c.settings.customs);
      syncPinButtons();
      syncRestrictedButtons();
      syncCustomsButtons();
    }
    renderFavs();
    if (current && lastArrivals) renderArrivals();
    loaded = JSON.parse(JSON.stringify(c));
  }

  // ---------- the commands, for this page ----------

  let core = null;

  function makeCore() {
    return SgbusCore.create({
      version: 'web',
      site: location.origin,
      colour: true,
      // This site's own /api/* and nothing else, whatever a command asks for.
      fetch: (url, { timeout, ...init }) => {
        if (new URL(url, location.href).origin !== location.origin) return Promise.reject(new Error('Not this site.'));
        return fetch(url, {
          ...init,
        cache: 'no-store',
          ...(window.AbortSignal?.timeout && { signal: AbortSignal.timeout(timeout) }),
        });
      },
      stops: ensureStopsIndex,
      scripts: () => window,
      store: { load, save },
      out: print,
      err: print,
      clear: () => {
        clearScreen();
        syncStop();
      },
      savedIn: "this browser, as the app's own favourites, places and settings",
      stopKey: 'Ctrl+C or Stop',
      reload: true,
      calendar: {
        linked: () => Calendar.connected(),
        events: () => Calendar.upcomingList({ fresh: true }),
        set: (url) => Calendar.setLink(url),
        rm: () => Calendar.unlink(),
      },
      routinesNote: routinesHere() ? null
        : "Routines are in the Android app, which sends them with the page closed, and in the Linux app's sgbus. A browser can't send them.",
    });
  }

  // ---------- the screen ----------

  let backdrop;
  let scroller;
  let screen;
  let line;
  let input;
  let stopBtn;
  let busy = false;

  function build() {
    backdrop = document.createElement('div');
    backdrop.id = ID;
    backdrop.className = 'modal-backdrop hidden terminalBackdrop';
    backdrop.innerHTML =
      '<div class="terminal" role="dialog" aria-modal="true" aria-label="sgbus terminal" tabindex="-1">' +
      '<div class="termBar">' +
      '<span class="termTitle"><span class="ico" aria-hidden="true"></span> sgbus</span>' +
      '<button class="termStop" type="button" hidden>Stop</button>' +
      '<button class="icon-btn small termClose" type="button" aria-label="Close" title="Close (Esc)"></button>' +
      '</div>' +
      '<div class="termScroll">' +
      '<div class="termScreen" role="log" aria-live="polite"></div>' +
      '<div class="termLine"><label class="termPrompt" for="termIn"><span class="t-32">sgbus</span><span class="t-2">&gt;</span></label>' +
      '<input id="termIn" class="termIn" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" aria-label="Command"></div>' +
      '</div>' +
      '</div>';
    backdrop.querySelector('.termTitle .ico').innerHTML = window.icon('terminal');
    backdrop.querySelector('.termClose').innerHTML = window.icon('close');
    document.body.appendChild(backdrop);

    const box = backdrop.querySelector('.terminal');
    scroller = backdrop.querySelector('.termScroll');
    screen = backdrop.querySelector('.termScreen');
    line = backdrop.querySelector('.termLine');
    input = backdrop.querySelector('.termIn');
    stopBtn = backdrop.querySelector('.termStop');

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('.termClose').addEventListener('click', close);
    stopBtn.addEventListener('click', () => core?.stopWatching());
    // Back, or another window opening over it: a -w stops with it, and the Edge Tray goes
    // back under the windows.
    backdrop.addEventListener('modalclose', () => {
      core?.stopWatching();
      document.documentElement.removeAttribute('data-terminal');
    });
    // The Edge Tray stays over the terminal (style.css, :root[data-terminal]). A button on it
    // closes the terminal first, so what it opens isn't hidden behind; its tab, which only
    // tucks the tray away, and its links to other sites leave the terminal open.
    document.getElementById('tray')?.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.id !== 'trayTab' && isOpen()) close();
    }, true);
    // A tap on the screen types at the prompt, unless it was to select text.
    scroller.addEventListener('click', () => {
      if (!busy && !String(window.getSelection?.() || '')) input.focus();
    });
    input.addEventListener('keydown', onKey);
    // While a command runs the prompt is put away, and the box takes the keys.
    box.addEventListener('keydown', (e) => { if (e.target === box) onKey(e); });
  }

  // A line of text, its colours (ANSI escapes, as sgbus-core.js paints them) as styled spans.
  function row(text) {
    const el = document.createElement('div');
    el.className = 'termRow';
    const on = { b: false, d: false, fg: null };
    const re = /\x1b\[([0-9;]*)m/g;
    let last = 0;
    const put = (s) => {
      if (!s) return;
      const cls = [on.b && 't-1', on.d && 't-2', on.fg && `t-${on.fg}`].filter(Boolean);
      if (!cls.length) return el.appendChild(document.createTextNode(s));
      const span = document.createElement('span');
      span.className = cls.join(' ');
      span.textContent = s;
      el.appendChild(span);
    };
    let m;
    while ((m = re.exec(text))) {
      put(text.slice(last, m.index));
      for (const code of (m[1] || '0').split(';').map(Number)) {
        if (code === 0) Object.assign(on, { b: false, d: false, fg: null });
        else if (code === 1) on.b = true;
        else if (code === 2) on.d = true;
        else if (code === 22) on.b = on.d = false;
        else if (code >= 30 && code <= 37) on.fg = code;
        else if (code === 39) on.fg = null;
      }
      last = re.lastIndex;
    }
    put(text.slice(last));
    return el;
  }

  function print(text) {
    for (const l of String(text).split('\n')) screen.appendChild(row(l));
    while (screen.childElementCount > MAX_ROWS) screen.firstElementChild.remove();
    scroller.scrollTop = scroller.scrollHeight;
  }

  // What was typed, after the prompt, as a terminal leaves it on screen.
  function echo(text) {
    const el = row(`\x1b[32msgbus\x1b[0m\x1b[2m>\x1b[0m `);
    el.appendChild(document.createTextNode(text));
    screen.appendChild(el);
  }

  const clearScreen = () => screen.replaceChildren();

  function setBusy(on) {
    busy = on;
    line.hidden = on;
    if (on) backdrop.querySelector('.terminal').focus();
    else input.focus();
    syncStop();
  }

  const syncStop = () => { stopBtn.hidden = !core?.watching(); };

  // ---------- typing ----------

  function readHistory() {
    try {
      const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }

  let history = [];
  let at = 0;
  let draft = '';

  function remember(text) {
    // Your calendar's private link isn't kept.
    if (!core.remembered(text)) return;
    if (history[history.length - 1] !== text) history.push(text);
    history = history.slice(-HISTORY_MAX);
    at = history.length;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch { /* this visit only */ }
  }

  function recall(step) {
    if (at === history.length) draft = input.value;
    at = Math.max(0, Math.min(history.length, at + step));
    input.value = at === history.length ? draft : history[at];
    const end = input.value.length;
    requestAnimationFrame(() => input.setSelectionRange(end, end));
  }

  // Tab: the word before the caret finished, or as far as every match agrees, and listed when
  // that goes no further.
  function tab() {
    const caret = input.selectionStart;
    const before = input.value.slice(0, caret);
    const [hits, word] = core.complete(before);
    if (!hits.length) return;
    let add = '';
    if (hits.length === 1) add = `${hits[0].slice(word.length)} `;
    else {
      let common = hits[0];
      for (const h of hits) while (!h.startsWith(common)) common = common.slice(0, -1);
      add = common.slice(word.length);
      if (!add) {
        echo(input.value);
        print(core.ansi(hits.join('  ')));
        return;
      }
    }
    input.value = before + add + input.value.slice(caret);
    input.setSelectionRange(caret + add.length, caret + add.length);
  }

  function interrupt() {
    if (core?.watching()) return core.stopWatching();
    if (busy) return;
    echo(`${input.value}^C`);
    input.value = '';
    at = history.length;
  }

  function onKey(e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const selected = input.selectionStart !== input.selectionEnd || !!String(window.getSelection?.() || '');
    if (e.ctrlKey && key === 'c' && !selected) interrupt();
    else if (e.ctrlKey && key === 'l') clearScreen();
    else if (e.ctrlKey && key === 'd' && !input.value && !busy) close();
    else if (key === 'Escape') {
      if (core?.watching()) core.stopWatching();
      else close();
    } else if (busy) return;
    else if (key === 'Enter') submit();
    else if (key === 'ArrowUp') recall(-1);
    else if (key === 'ArrowDown') recall(1);
    else if (key === 'Tab' && !e.shiftKey) tab();
    else return;
    e.preventDefault();
  }

  async function submit() {
    const text = input.value;
    input.value = '';
    echo(text);
    let words = core.wordsOf(text.trim());
    if (words[0] === 'sgbus') words = words.slice(1);
    const [first] = words;
    if (!words.length) return;
    remember(text.trim());
    if (first === 'exit' || first === 'quit' || first === 'q') return close();
    if (first === 'clear') return clearScreen();
    if (first === 'help' && words.length === 1) return print(`${core.promptHelp()}\n`);
    setBusy(true);
    try {
      await core.run(words);
    } catch (e) {
      core.report(e);
    } finally {
      print('');
      setBusy(false);
    }
  }

  // ---------- open and close ----------

  let returnTo = null;

  // Only ever opened: nothing outside (a link, the address, a message from another window or
  // device) can type a command. Those are typed here, by whoever's at the keyboard.
  function open() {
    if (!backdrop) {
      build();
      history = readHistory();
      at = history.length;
    }
    if (!core) {
      core = makeCore();
      print([...core.intro(), ''].join('\n'));
    }
    if (backdrop.classList.contains('hidden')) {
      returnTo = document.activeElement;
      openModal(ID);
      document.documentElement.setAttribute('data-terminal', '');
      // Its tour, the first time (js/tour.js).
      window.Tour?.first('terminal');
    }
    if (busy) backdrop.querySelector('.terminal').focus();
    else input.focus();
  }

  function close() {
    if (!backdrop || backdrop.classList.contains('hidden')) return;
    core?.stopWatching();
    closeModal(ID);
    returnTo?.focus?.();
    returnTo = null;
  }

  const isOpen = () => !!backdrop && !backdrop.classList.contains('hidden');

  window.Terminal = { open, close, toggle: () => (isOpen() ? close() : open()) };
})();
