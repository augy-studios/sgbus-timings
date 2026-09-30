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

  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  // Fires "modalclose" on the backdrop, for a modal with something to tidy up as it goes.
  function closeModal(id) {
    var backdrop = document.getElementById(id);
    backdrop.classList.add("hidden");
    backdrop.dispatchEvent(new Event("modalclose"));
    if (!document.querySelector(".modal-backdrop:not(.hidden)")) {
      document.body.classList.remove("modal-open");
    }
  }

  window.hydrateIcons = hydrateIcons;
  window.openModal = openModal;
  window.closeModal = closeModal;
})();
