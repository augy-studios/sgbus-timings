// Theme system: 7 brand colour swatches + light/dark mode.
// Default is always light + classic (#ccffcc), regardless of OS preference.
// Once the user picks something, it is persisted.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const APP_KEY = "sgbus";

  const COLOR_THEMES = [
    { id: "classic", label: "Classic", hex: "#ccffcc" },
    { id: "not-green-1", label: "Not green 1", hex: "#ffcccc" },
    { id: "not-green-2", label: "Not green 2", hex: "#ccccff" },
    { id: "not-green-3", label: "Not green 3", hex: "#ffffcc" },
    { id: "not-green-4", label: "Not green 4", hex: "#ffccff" },
    { id: "not-green-5", label: "Not green 5", hex: "#ccffff" },
    { id: "really-light-green", label: "Really really light green", hex: "#ffffff" },
  ];

  const STORAGE_KEY_COLOR = `${APP_KEY}.colorTheme`;
  const STORAGE_KEY_MODE = `${APP_KEY}.mode`;

  // Pre-retrofit key. Same mapping as the pre-paint script in index.html.
  const LEGACY_KEY = "sgbus_theme";
  const LEGACY_MAP = {
    classic: "classic",
    notgreen1: "not-green-1",
    notgreen2: "not-green-2",
    notgreen3: "not-green-3",
    notgreen4: "not-green-4",
    notgreen5: "not-green-5",
    verylightgreen: "really-light-green",
  };

  function migrateLegacyTheme() {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    if (!localStorage.getItem(STORAGE_KEY_COLOR) && LEGACY_MAP[legacy]) {
      localStorage.setItem(STORAGE_KEY_COLOR, LEGACY_MAP[legacy]);
    }
    localStorage.removeItem(LEGACY_KEY);
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function getStoredColorTheme() {
    return localStorage.getItem(STORAGE_KEY_COLOR) || "classic";
  }

  function getStoredMode() {
    return localStorage.getItem(STORAGE_KEY_MODE) || "light";
  }

  function applyColorTheme(id) {
    const theme = COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
    document.documentElement.setAttribute("data-color-theme", theme.id);
    document.documentElement.style.setProperty("--brand", theme.hex);
    document.documentElement.style.setProperty("--brand-rgb", hexToRgb(theme.hex));
    localStorage.setItem(STORAGE_KEY_COLOR, theme.id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.hex);
    return theme;
  }

  function applyMode(mode) {
    const resolved = mode === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", resolved);
    localStorage.setItem(STORAGE_KEY_MODE, resolved);
    return resolved;
  }

  function initTheme() {
    migrateLegacyTheme();
    applyColorTheme(getStoredColorTheme());
    applyMode(getStoredMode());
  }

  // ---- modal wiring ----

  function buildThemeModal() {
    const grid = document.getElementById("swatchGrid");
    grid.innerHTML = COLOR_THEMES.map(
      (t) => `
      <button class="swatch" data-theme-id="${t.id}" style="--swatch-color:${t.hex}" type="button" aria-label="${t.label}">
        <span class="swatch-dot"></span>
        <span class="swatch-label">${t.label}</span>
      </button>`
    ).join("");

    syncThemeModalState();

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-id]");
      if (!btn) return;
      applyColorTheme(btn.dataset.themeId);
      syncThemeModalState();
    });

    document.getElementById("modeToggle").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      applyMode(btn.dataset.mode);
      syncThemeModalState();
    });
  }

  function syncThemeModalState() {
    const activeTheme = getStoredColorTheme();
    const activeMode = getStoredMode();
    document.querySelectorAll("#swatchGrid .swatch").forEach((el) => {
      el.classList.toggle("active", el.dataset.themeId === activeTheme);
    });
    document.querySelectorAll("#modeToggle .mode-btn").forEach((el) => {
      const on = el.dataset.mode === activeMode;
      el.classList.toggle("active", on);
      el.setAttribute("aria-pressed", String(on));
    });
    updateThemeButtonIcon();
  }

  function updateThemeButtonIcon() {
    const span = document.querySelector("#themeBtn [data-icon]");
    span.setAttribute("data-icon", getStoredMode() === "dark" ? "moon" : "sun");
    window.hydrateIcons(document.getElementById("themeBtn"));
  }

  function wireModals() {
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => window.closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) window.closeModal(backdrop.id);
      });
    });
    document.getElementById("themeBtn").addEventListener("click", () => window.openModal("themeModal"));
  }

  window.COLOR_THEMES = COLOR_THEMES;
  window.applyColorTheme = applyColorTheme;
  window.applyMode = applyMode;
  window.getStoredColorTheme = getStoredColorTheme;
  window.getStoredMode = getStoredMode;
  window.initTheme = initTheme;

  initTheme();
  window.hydrateIcons();
  updateThemeButtonIcon();
  buildThemeModal();
  wireModals();
})();
