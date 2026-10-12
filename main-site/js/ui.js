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

  // The page stays put behind anything open over it: a modal or a panel.
  function syncModalOpen() {
    var open = document.querySelector(".modal-backdrop:not(.hidden), .panelModal:not([hidden])");
    document.body.classList.toggle("modal-open", !!open);
  }

  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
    syncModalOpen();
  }

  // Fires "modalclose" on the backdrop, for a modal with something to tidy up as it goes.
  function closeModal(id) {
    var backdrop = document.getElementById(id);
    backdrop.classList.add("hidden");
    backdrop.dispatchEvent(new Event("modalclose"));
    syncModalOpen();
  }

  // Navigate (both its tabs) and Service alerts: a card over the page, in a .panelModal its own
  // code shows and hides. `onClose` runs on a tap on the backdrop around the card.
  function showPanel(id, show) {
    var panel = document.getElementById(id);
    if (show && panel.hidden) panel.scrollTop = 0;
    panel.hidden = !show;
    syncModalOpen();
  }

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
        if (!tray) return;
        try { localStorage.setItem(HINT_KEY, "1"); } catch (e) { /* shown again next time */ }
        showTip(tray, "Tip: press and hold a button to see what it does.", 5000);
      }, 2500);
    }
  }

  window.hydrateIcons = hydrateIcons;
  window.toggleRowMenu = toggleRowMenu;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showPanel = showPanel;
  window.wirePanel = wirePanel;
})();
