// Theme system: 8 brand colour swatches + light/dark/time-based mode.
// Default is always light + classic (#ccffcc), regardless of OS preference.
// Once the user picks something, it is persisted.
// Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const APP_KEY = "sgbus";

  const COLOR_THEMES = [
    { id: "classic", label: I18n.t('theme.classic', 'Classic'), hex: "#ccffcc" },
    { id: "not-green-1", label: I18n.t('theme.notGreen', 'Not green {n}', { n: 1 }), hex: "#ffcccc" },
    { id: "not-green-2", label: I18n.t('theme.notGreen', 'Not green {n}', { n: 2 }), hex: "#ccccff" },
    { id: "not-green-3", label: I18n.t('theme.notGreen', 'Not green {n}', { n: 3 }), hex: "#ffffcc" },
    { id: "not-green-4", label: I18n.t('theme.notGreen', 'Not green {n}', { n: 4 }), hex: "#ffccff" },
    { id: "not-green-5", label: I18n.t('theme.notGreen', 'Not green {n}', { n: 5 }), hex: "#ccffff" },
    { id: "really-light-green", label: I18n.t('theme.reallyLight', 'Really really light green'), hex: "#ffffff" },
    // For its release on 19 November 2026, set in time or won on the wheel (js/gta6.js). The rest
    // of it is in style.css; its dot runs as the logo does.
    { id: "gta-6", label: I18n.t('theme.gta6', 'GTA VI'), hex: "#ff2b90", dot: "linear-gradient(#2b60da, #ff2b90, #e6953e)" },
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

  /* Mode preference and mode are different things. The preference is what the
     person chose and can be "time", or "phone" for the device's own setting,
     as the Android app has it; the mode is what the document is in and is only
     ever light or dark. */

  const MODE_PREFERENCES = ["light", "dark", "time", "phone"];
  const DEVICE_DARK = window.matchMedia?.("(prefers-color-scheme: dark)");

  /* The daylight window. Duplicated in the pre-paint script in index.html's
     head, which has to resolve this before first paint and cannot import
     anything. Change both together. */
  const LIGHT_FROM_HOUR = 9;
  const LIGHT_UNTIL_HOUR = 18;

  function getModePreference() {
    const v = localStorage.getItem(STORAGE_KEY_MODE);
    return MODE_PREFERENCES.includes(v) ? v : "light";
  }

  function isDaylightHours(now = new Date()) {
    const hour = now.getHours();
    return hour >= LIGHT_FROM_HOUR && hour < LIGHT_UNTIL_HOUR;
  }

  function resolveMode(preference) {
    if (preference === "time") return isDaylightHours() ? "light" : "dark";
    if (preference === "phone") return DEVICE_DARK?.matches ? "dark" : "light";
    return preference === "dark" ? "dark" : "light";
  }

  // The mode the document is in right now, resolved. What the theme button
  // icon and anything else reading the active mode wants.
  function getStoredMode() {
    return resolveMode(getModePreference());
  }

  function applyColorTheme(id) {
    let theme = COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
    // Locked, as when Sync brings it from another device: Classic instead.
    if (theme.id === window.Gta6?.THEME && !Gta6.pick()) theme = COLOR_THEMES[0];
    document.documentElement.setAttribute("data-color-theme", theme.id);
    document.documentElement.style.setProperty("--brand", theme.hex);
    document.documentElement.style.setProperty("--brand-rgb", hexToRgb(theme.hex));
    localStorage.setItem(STORAGE_KEY_COLOR, theme.id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme.hex);
    return theme;
  }

  function applyMode(preference) {
    const chosen = MODE_PREFERENCES.includes(preference) ? preference : "light";
    const resolved = resolveMode(chosen);

    document.documentElement.setAttribute("data-mode", resolved);
    document.documentElement.setAttribute("data-mode-preference", chosen);
    localStorage.setItem(STORAGE_KEY_MODE, chosen);

    scheduleModeCheck();

    return resolved;
  }

  /* Keeping the time based mode honest while the page stays open. */

  let modeTimer = null;
  let watchingVisibility = false;

  // Milliseconds until the next 09:00 or 18:00, whichever comes first.
  function msUntilNextBoundary(now = new Date()) {
    const next = new Date(now);
    next.setMinutes(0, 0, 0);

    const hour = now.getHours();
    if (hour < LIGHT_FROM_HOUR) {
      next.setHours(LIGHT_FROM_HOUR);
    } else if (hour < LIGHT_UNTIL_HOUR) {
      next.setHours(LIGHT_UNTIL_HOUR);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(LIGHT_FROM_HOUR);
    }

    // A second of slack, so a timer that fires a fraction early does not land
    // back in the hour it just left and reschedule itself in a tight loop.
    return Math.max(1000, next.getTime() - now.getTime() + 1000);
  }

  function scheduleModeCheck() {
    if (modeTimer !== null) {
      clearTimeout(modeTimer);
      modeTimer = null;
    }

    if (getModePreference() !== "time") return;

    modeTimer = setTimeout(() => {
      modeTimer = null;
      refreshTimeMode();
    }, msUntilNextBoundary());

    if (!watchingVisibility && typeof document !== "undefined") {
      watchingVisibility = true;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") refreshTimeMode();
      });
    }
  }

  function refreshTimeMode() {
    if (getModePreference() !== "time") return;

    const resolved = resolveMode("time");
    const current = document.documentElement.getAttribute("data-mode");

    if (resolved !== current) {
      document.documentElement.setAttribute("data-mode", resolved);
      document.dispatchEvent(
        new CustomEvent("uwu:modechange", {
          detail: { mode: resolved, preference: "time" },
        })
      );
    }

    scheduleModeCheck();
  }

  // The device going light or dark while the page is open.
  DEVICE_DARK?.addEventListener?.("change", () => {
    if (getModePreference() !== "phone") return;
    const resolved = resolveMode("phone");
    document.documentElement.setAttribute("data-mode", resolved);
    document.dispatchEvent(new CustomEvent("uwu:modechange", { detail: { mode: resolved, preference: "phone" } }));
  });

  function initTheme() {
    migrateLegacyTheme();
    applyColorTheme(getStoredColorTheme());
    // The preference, not the resolved mode. Passing the resolved one would
    // quietly rewrite a stored "time" into "dark" the first evening.
    applyMode(getModePreference());
  }

  // ---- modal wiring ----

  // GTA VI's word under its name: how to keep it, or where to win it. Null once it's theirs.
  function swatchNote(t) {
    if (t.id !== window.Gta6?.THEME || Gta6.owned()) return null;
    return Gta6.open() ? I18n.t("gta6.setNote", "Set GTA VI before 26 November to keep it for good.") : I18n.t("gta6.locked", "Win GTA VI on the uwuCoins wheel.");
  }

  function renderSwatches() {
    const grid = document.getElementById("swatchGrid");
    grid.innerHTML = COLOR_THEMES.map((t) => {
      const note = swatchNote(t);
      // Locked, it goes to the wheel, so it goes with the wheel when uwuCoins are hidden.
      const locked = t.id === window.Gta6?.THEME && !Gta6.canPick();
      return `
      <button class="swatch${locked ? " locked coinsOnly" : ""}" data-theme-id="${t.id}" style="--swatch-color:${t.hex}${t.dot ? `;--swatch-dot:${t.dot}` : ""}" type="button" aria-label="${note ? `${t.label}. ${note}` : t.label}">
        <span class="swatch-dot"></span>
        <span class="swatch-label">${t.label}${note ? `<span class="swatch-note">${note}</span>` : ""}</span>
      </button>`;
    }).join("");
    syncThemeModalState();
  }

  function buildThemeModal() {
    const grid = document.getElementById("swatchGrid");
    renderSwatches();
    window.addEventListener("gta6:change", renderSwatches);

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-id]");
      if (!btn) return;
      if (btn.dataset.themeId === window.Gta6?.THEME && !Gta6.canPick()) {
        window.closeModal("themeModal");
        window.Coins?.open();
        return;
      }
      applyColorTheme(btn.dataset.themeId);
      syncThemeModalState();
    });

    document.getElementById("modeToggle").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-mode]");
      if (!btn) return;
      applyMode(btn.dataset.mode);
      syncThemeModalState();
    });

    // A tab left open across 09:00 or 18:00 re-resolves itself; redraw the
    // modal so the note and pressed state stay in step with the change.
    document.addEventListener("uwu:modechange", syncThemeModalState);
  }

  function syncThemeModalState() {
    const activeTheme = getStoredColorTheme();
    const activePreference = getModePreference();
    const resolvedMode = getStoredMode();

    document.querySelectorAll("#swatchGrid .swatch").forEach((el) => {
      el.classList.toggle("active", el.dataset.themeId === activeTheme);
    });
    document.querySelectorAll("#modeToggle .mode-btn").forEach((el) => {
      const isActive = el.dataset.mode === activePreference;
      el.classList.toggle("active", isActive);
      el.setAttribute("aria-pressed", String(isActive));
    });

    const note = document.getElementById("modeNote");
    if (note) {
      note.hidden = activePreference !== "time";
      if (activePreference === "time") {
        note.textContent = resolvedMode === "dark" ? I18n.t("theme.note.dark", "Following the clock. Currently dark.") : I18n.t("theme.note.light", "Following the clock. Currently light.");
      }
    }

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
  window.refreshThemeModal = syncThemeModalState;
  window.applyMode = applyMode;
  window.getStoredColorTheme = getStoredColorTheme;
  window.getStoredMode = getStoredMode;
  window.MODE_PREFERENCES = MODE_PREFERENCES;
  window.LIGHT_FROM_HOUR = LIGHT_FROM_HOUR;
  window.LIGHT_UNTIL_HOUR = LIGHT_UNTIL_HOUR;
  window.getModePreference = getModePreference;
  window.isDaylightHours = isDaylightHours;
  window.resolveMode = resolveMode;
  window.refreshTimeMode = refreshTimeMode;
  window.initTheme = initTheme;

  initTheme();
  window.hydrateIcons();
  updateThemeButtonIcon();
  buildThemeModal();
  wireModals();
})();
