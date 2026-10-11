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

  // Navigate, Plan a route and Service alerts: a card over the page, in a .panelModal its own
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

  window.hydrateIcons = hydrateIcons;
  window.toggleRowMenu = toggleRowMenu;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showPanel = showPanel;
  window.wirePanel = wirePanel;
})();
