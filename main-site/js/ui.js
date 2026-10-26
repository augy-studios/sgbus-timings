// Shared UI helpers: icon hydration and modal show/hide.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  // Safe to call repeatedly; re-renders when data-icon changes.
  function hydrateIcons(root) {
    root = root || document;
    root.querySelectorAll("[data-icon]").forEach(function (el) {
      var name = el.dataset.icon;
      if (el.dataset.iconRendered === name) return;
      el.innerHTML = window.icon(name);
      el.dataset.iconRendered = name;
    });
  }

  // The page stays put behind anything open over it: a modal or a panel. One docked on the
  // main screen (js/main-screen.js) is the page itself.
  function syncModalOpen() {
    var open = document.querySelector(".modal-backdrop:not(.hidden):not(.docked), .panelModal:not([hidden]):not(.docked)");
    document.body.classList.toggle("modal-open", !!open);
  }

  // A modal or panel on the main screen (js/main-screen.js) is shown by switching to its tab,
  // and stays when it's closed: it's the page.
  function docked(id) {
    return !!(window.MainScreen && window.MainScreen.docked(id));
  }

  // ---------- Back ----------
  // Back (the Android app's button, a browser's, Telegram's) closes the window that's open, then
  // goes back to the page that was on show before, and only then leaves: each window opened and
  // each page switched to (js/main-screen.js) adds a step to the page's history, its state
  // { sg: true, page, modal }, and a view inside a window (Settings' groups) one of its own,
  // { ..., sub }. The Android app goes back through that history, and leaves for
  // the background once there's none (MainActivity.java). Closing a window with its X or a tap
  // around it takes its step back off. The live map keeps steps of its own (js/map.js).
  var backPending = false;
  var deferred = null;
  var restoring = false;
  // A window closed and something opened from it at once, such as a stop picked from a list:
  // the new address (a stop's #84009) is written while the window's step is still going back,
  // so `backTo` keeps it, and the step before, with the old address, mustn't load the old stop.
  var backTo = null;
  var swallowHash = false;
  // Closing a window from a view inside it (Settings' groups, subStep) takes two steps back:
  // the view's and the window's. The first one back lands here, and goes on to the second.
  var backMore = 0;

  function stepState(extra) {
    var s = history.state && history.state.sg ? history.state : {};
    var page = window.MainScreen ? window.MainScreen.active() : s.page;
    return Object.assign({ sg: true, page: page }, extra);
  }

  // A new step, held until a step being taken back has gone.
  function step(extra) {
    if (restoring) return;
    var state = stepState(extra);
    if (backPending) deferred = state;
    else history.pushState(state, "", location.href);
  }

  // The step for what's on show now, without adding one: as the page loads.
  function markStep() {
    history.replaceState(stepState({}), "", location.href);
  }

  // A view inside the window `id` that's open, such as one of Settings' groups (script.js): a
  // step of its own { modal: id, sub }, so Back goes to the window's first view before it
  // closes the window. One deep: another view in its place replaces the step.
  function subStep(id, sub) {
    var s = history.state;
    if (restoring || backPending || !s || !s.sg || s.modal !== id) return;
    var state = Object.assign({}, s, { sub: sub });
    if (s.sub) replace.call(history, state, "", location.href);
    else history.pushState(state, "", location.href);
  }

  // Back to the window's first view, taking the view's step off. False when there's no step to
  // take off, for the caller to show the first view itself.
  function subBack(id) {
    var s = history.state;
    if (restoring || backPending || !s || !s.sg || s.modal !== id || !s.sub) return false;
    history.back();
    return true;
  }

  // The site replaces its address as things open (a stop's #84009); that keeps the step's state.
  var replace = history.replaceState;
  history.replaceState = function (state, title, url) {
    if (state == null && history.state && history.state.sg) state = history.state;
    var out = replace.call(this, state, title, url);
    if (backPending) backTo = location.href;
    return out;
  };

  // Ahead of script.js's own (routeFromHash): the old address coming back with the closed
  // window's step isn't somewhere to go.
  window.addEventListener("hashchange", function (e) {
    if (!swallowHash) return;
    swallowHash = false;
    e.stopImmediatePropagation();
  });

  window.addEventListener("popstate", function (e) {
    if (backPending) {
      if (backMore > 0) {
        backMore--;
        history.back();
        return;
      }
      backPending = false;
      if (backTo && backTo !== location.href) {
        swallowHash = backTo.split("#")[1] !== location.href.split("#")[1];
        replace.call(history, history.state, "", backTo);
        setTimeout(function () { swallowHash = false; }, 50);
      }
      backTo = null;
      if (deferred) history.pushState(deferred, "", location.href);
      deferred = null;
      return;
    }
    var state = e.state;
    if (!state || !state.sg) return;
    restoring = true;
    // Whatever opened after this step closes: the windows over it, and the page goes back.
    document.querySelectorAll(".modal-backdrop:not(.hidden):not(.docked)").forEach(function (m) {
      if (m.id !== state.modal) hideModal(m.id);
    });
    if (state.page && window.MainScreen && window.MainScreen.active() !== state.page) window.MainScreen.select(state.page);
    // A hashchange from the same step back comes just after.
    setTimeout(function () { restoring = false; }, 50);
  });

  // ---------- Focus (help desk #6) ----------
  // A window opened takes the focus, so a screen reader (TalkBack) or a keyboard is in it rather
  // than on the button behind; closed, the focus goes back to what opened it. A window that
  // focuses something of its own as it opens (Settings' Find, an input) keeps that.
  function focusInto(el) {
    var opener = document.activeElement;
    el._opener = opener && opener !== document.body && !el.contains(opener) ? opener : null;
    setTimeout(function () {
      if (el.hidden || el.classList.contains("hidden") || el.contains(document.activeElement)) return;
      var target = el.querySelector('[role="dialog"]') || el;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }, 60);
  }
  function focusBack(el) {
    var opener = el._opener;
    el._opener = null;
    var inside = el.contains(document.activeElement) || document.activeElement === document.body;
    if (!opener || !opener.isConnected || !inside || opener.closest("[hidden], .hidden")) return;
    try { opener.focus({ preventScroll: true }); } catch (e) { opener.focus(); }
  }

  function openModal(id) {
    if (docked(id)) return window.MainScreen.select(window.MainScreen.byEl(id), id);
    var backdrop = document.getElementById(id);
    var was = !backdrop.classList.contains("hidden");
    backdrop.classList.remove("hidden");
    syncModalOpen();
    if (!was) {
      step({ modal: id });
      focusInto(backdrop);
    }
  }

  // Fires "modalclose" on the backdrop, for a modal with something to tidy up as it goes.
  function hideModal(id) {
    var backdrop = document.getElementById(id);
    if (backdrop.classList.contains("hidden")) return;
    backdrop.classList.add("hidden");
    backdrop.dispatchEvent(new Event("modalclose"));
    syncModalOpen();
    focusBack(backdrop);
  }

  // The step's going back is marked before the window hides, so an address its "modalclose"
  // writes (the ETA window putting away #share/<id>) is the one kept: after, the step before
  // still had #share/<id>, and going back to it opened the window again.
  function closeModal(id) {
    if (docked(id)) return;
    var stepBack = !!(history.state && history.state.sg && history.state.modal === id && !restoring);
    if (stepBack) {
      backPending = true;
      backTo = null;
      backMore = history.state.sub ? 1 : 0;
    }
    hideModal(id);
    if (stepBack) history.back();
  }

  // Navigate (both its tabs) and Service alerts: a card over the page, in a .panelModal its own
  // code shows and hides. `onClose` runs on a tap on the backdrop around the card.
  function showPanel(id, show) {
    if (docked(id)) {
      if (show) window.MainScreen.select(window.MainScreen.byEl(id), id);
      return;
    }
    var panel = document.getElementById(id);
    var was = !panel.hidden;
    if (show && panel.hidden) panel.scrollTop = 0;
    panel.hidden = !show;
    syncModalOpen();
    if (show && !was) focusInto(panel);
    else if (!show && was) focusBack(panel);
  }

  // ---------- Suggestions under a field, for screen readers and keyboards (help desk #6) ----------
  // The field is a combobox and its box a listbox, each .acItem an option; Up and Down move
  // through them (aria-activedescendant, .acActive), Enter picks the one moved to, and how many
  // there are is said. For the stop search (script.js, attachAutocomplete) and Navigate's and
  // Places' place search (js/nav.js, attachPlaceSearch).
  var comboCount = 0;
  function wireCombobox(input, box) {
    if (!input || !box || input.dataset.combobox) return;
    input.dataset.combobox = "1";
    if (!box.id) box.id = "acBox" + ++comboCount;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", box.id);
    input.setAttribute("aria-expanded", "false");
    box.setAttribute("role", "listbox");
    var say = document.createElement("p");
    say.className = "sr";
    say.setAttribute("aria-live", "polite");
    box.parentNode.insertBefore(say, box.nextSibling);
    var active = -1;
    var items = function () { return Array.prototype.slice.call(box.querySelectorAll(".acItem")); };
    function mark(i) {
      var all = items();
      active = all.length ? Math.max(-1, Math.min(i, all.length - 1)) : -1;
      all.forEach(function (el, k) {
        el.classList.toggle("acActive", k === active);
        el.setAttribute("aria-selected", String(k === active));
      });
      if (active >= 0) {
        input.setAttribute("aria-activedescendant", all[active].id);
        all[active].scrollIntoView({ block: "nearest" });
      } else input.removeAttribute("aria-activedescendant");
    }
    var lastSaid = "";
    new MutationObserver(function () {
      var open = !box.hidden;
      input.setAttribute("aria-expanded", String(open));
      var all = items();
      all.forEach(function (el, k) {
        if (!el.id) el.id = box.id + "-o" + k + "-" + Math.random().toString(36).slice(2, 6);
        el.setAttribute("role", "option");
        if (!el.hasAttribute("aria-selected")) el.setAttribute("aria-selected", "false");
      });
      if (!open) active = -1;
      var text = open && all.length ? all.length + (all.length === 1 ? " suggestion" : " suggestions") : "";
      if (text !== lastSaid) { lastSaid = text; say.textContent = text; }
    }).observe(box, { childList: true, attributes: true, attributeFilter: ["hidden"] });
    input.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        mark(active + (e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Enter" && active >= 0) {
        var pick = items()[active];
        if (!pick) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        active = -1;
        pick.click();
      } else if (e.key === "Escape") {
        box.hidden = true;
      }
    }, true);
  }

  // Settings' On and Off pairs (.mode-toggle) and the colour swatches, named by the label above
  // each, so a screen reader says "Birthday confetti, On" rather than just "On" (help desk #6).
  var groupCount = 0;
  function nameGroups() {
    document.querySelectorAll(".mode-toggle, #swatchGrid").forEach(function (box) {
      if (box.hasAttribute("role")) return;
      var label = box.previousElementSibling;
      while (label && !label.classList.contains("modal-section-label")) {
        if (label.classList.contains("mode-toggle")) { label = null; break; }
        label = label.previousElementSibling;
      }
      if (!label) return;
      if (!label.id) label.id = "groupLabel" + ++groupCount;
      box.setAttribute("role", "group");
      box.setAttribute("aria-labelledby", label.id);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", nameGroups, { once: true });
  else nameGroups();

  // Esc closes the window on top (help desk #6), for those without an Esc of their own:
  // Settings, the first open's choice, the tour, the terminal, the flag-down screen and the
  // departures board have theirs, and run first (they're on document; this is on window). In a
  // text field, Esc is the field's (clearing it, closing its suggestions).
  var OWN_ESC = { settingsModal: 1, firstRunModal: 1 };
  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || e.defaultPrevented || document.body.classList.contains("touring")) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    var shown = function (sel) { var el = document.querySelector(sel); return el && !el.hidden; };
    if (shown("#flagScreen") || shown("#boardScreen")) return;
    if (shown("#mapPanel") && window.LiveMap) { e.preventDefault(); return window.LiveMap.close(); }
    var open = document.querySelectorAll(".modal-backdrop:not(.hidden):not(.docked)");
    var top = open[open.length - 1];
    if (top) {
      if (OWN_ESC[top.id] || top.querySelector(".terminal")) return;
      e.preventDefault();
      return closeModal(top.id);
    }
    // A panel (Navigate, Service alerts, Your trips, Places) not docked as a page: its own close.
    var panels = document.querySelectorAll(".panelModal:not([hidden]):not(.docked)");
    var panel = panels[panels.length - 1];
    var close = panel && panel.querySelector('[aria-label^="Close"]');
    if (close) { e.preventDefault(); close.click(); }
  });

  function wirePanel(id, onClose) {
    var panel = document.getElementById(id);
    panel.addEventListener("click", function (e) {
      if (e.target === panel) onClose();
    });
  }

  // The menu behind a row's three dots (Places, past searches, calendar events): every row
  // carries its menu folded shut (.rowMenu in style.css), and this opens the one for `key`,
  // closing any other, in place, so each slides rather than the list being redrawn. `key`
  // null closes them all. Rows are [data-menu-row="key"].
  function toggleRowMenu(container, key) {
    container.querySelectorAll("[data-menu-row]").forEach(function (row) {
      var on = row.dataset.menuRow === key;
      row.classList.toggle("open", on);
      var btn = row.querySelector("[data-menu-toggle]");
      if (btn) btn.setAttribute("aria-expanded", String(on));
    });
  }

  // Press and hold: on a touch screen, which has no mouse to hover with, holding a button for
  // HOLD_MS shows what it does, as hovering shows its title with a mouse. The label is its
  // title, or its aria-label; the tap that would follow the hold is swallowed, so holding
  // never also presses it. The first time the site's opened on a touch screen, a note says so.
  var HOLD_MS = 450;
  var HOLD_SLOP_PX = 10;
  var TIP_MS = 2600;
  var HINT_KEY = "sgbus_hold_hint";
  var holdTimer = null;
  var holdAt = null;
  var held = null;
  var tipTimer = null;
  var tip = null;

  function labelOf(el) {
    return (el.getAttribute("title") || el.getAttribute("aria-label") || "").trim();
  }

  function holdable(target) {
    var el = target && target.closest && target.closest("button, a, [role=tab], [role=button]");
    return el && !el.disabled && labelOf(el) ? el : null;
  }

  function hideTip() {
    clearTimeout(tipTimer);
    if (tip) tip.classList.remove("show");
  }

  // Above the button, or below it near the top of the screen, kept inside the screen's edges;
  // beside it for the Edge Tray's, on the page's side, so it doesn't cover the next one.
  function showTip(el, text, ms) {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "holdTip";
      tip.setAttribute("role", "status");
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.classList.add("show");
    var r = el.getBoundingClientRect();
    var w = tip.offsetWidth;
    var h = tip.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    var top = r.top - h - 10 >= 8 ? r.top - h - 10 : r.bottom + 10;
    if (el.closest(".tray") && el.id !== "trayButtons") {
      var onLeft = document.documentElement.getAttribute("data-tray-side") === "left";
      left = Math.max(8, Math.min(window.innerWidth - w - 8, onLeft ? r.right + 10 : r.left - w - 10));
      top = Math.max(8, r.top + r.height / 2 - h / 2);
    }
    tip.style.left = left + "px";
    tip.style.top = Math.min(window.innerHeight - h - 8, top) + "px";
    clearTimeout(tipTimer);
    tipTimer = setTimeout(hideTip, ms || TIP_MS);
  }

  function cancelHold() {
    clearTimeout(holdTimer);
    holdTimer = null;
  }

  document.addEventListener("pointerdown", function (e) {
    hideTip();
    held = null;
    if (e.pointerType !== "touch") return;
    var el = holdable(e.target);
    if (!el) return;
    holdAt = [e.clientX, e.clientY];
    cancelHold();
    holdTimer = setTimeout(function () {
      holdTimer = null;
      held = el;
      if (navigator.vibrate) navigator.vibrate(10);
      showTip(el, labelOf(el));
    }, HOLD_MS);
  }, true);
  document.addEventListener("pointermove", function (e) {
    if (holdTimer && holdAt && Math.hypot(e.clientX - holdAt[0], e.clientY - holdAt[1]) > HOLD_SLOP_PX) cancelHold();
  }, true);
  document.addEventListener("pointerup", cancelHold, true);
  document.addEventListener("pointercancel", cancelHold, true);
  window.addEventListener("scroll", hideTip, true);
  // The tap that ends a hold, and the long-press menu a link would open.
  document.addEventListener("click", function (e) {
    if (!held || !held.contains(e.target)) return;
    held = null;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener("contextmenu", function (e) {
    if (held && held.contains(e.target)) e.preventDefault();
  }, true);

  if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
    var hinted = true;
    try { hinted = localStorage.getItem(HINT_KEY) === "1"; } catch (e) { /* not shown */ }
    if (!hinted) {
      setTimeout(function () {
        var tray = document.getElementById("trayButtons");
        // Not over a window, such as the first open's choice (js/first-run.js): next time.
        if (!tray || document.body.classList.contains("modal-open")) return;
        try { localStorage.setItem(HINT_KEY, "1"); } catch (e) { /* shown again next time */ }
        showTip(tray, "Tip: press and hold a button to see what it does.", 5000);
      }, 2500);
    }
  }

  window.hydrateIcons = hydrateIcons;
  window.toggleRowMenu = toggleRowMenu;
  window.openModal = openModal;
  window.wireCombobox = wireCombobox;
  window.closeModal = closeModal;
  window.showPanel = showPanel;
  window.syncModalOpen = syncModalOpen;
  window.Steps = { step: step, mark: markStep, sub: subStep, subBack: subBack };
  window.wirePanel = wirePanel;
})();
