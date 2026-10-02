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

  // Where focus was before a modal opened, so closing hands it back.
  var returnFocus = {};

  function openModal(id) {
    var backdrop = document.getElementById(id);
    returnFocus[id] = document.activeElement;
    backdrop.classList.remove("hidden");
    document.body.classList.add("modal-open");
    backdrop.dispatchEvent(new Event("modalopen"));
  }

  function closeModal(id) {
    var backdrop = document.getElementById(id);
    if (backdrop.classList.contains("hidden")) return;
    backdrop.classList.add("hidden");
    backdrop.dispatchEvent(new Event("modalclose"));
    if (!document.querySelector(".modal-backdrop:not(.hidden)")) {
      document.body.classList.remove("modal-open");
    }
    var prev = returnFocus[id];
    if (prev && typeof prev.focus === "function") prev.focus();
  }

  window.hydrateIcons = hydrateIcons;
  window.openModal = openModal;
  window.closeModal = closeModal;
})();
