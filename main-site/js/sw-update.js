// Service worker registration and the "new version is ready" bar.
// A new worker installs and waits. It's promoted when somebody presses Reload
// here, or by itself at a moment nothing's lost (Augy, 2 November 2026): when
// the app comes back to the screen after being away (another app, another tab),
// or a page is picked in the Edge Tray, while it's safe() to reload: no trip
// running, no window or tour open, nothing being typed or waiting to be sent,
// and online. A page picked is opened again after the reload (VIEW_KEY). Never
// in the middle of using it, which is what docs/update-bar-spec.md warns of.
// The language's kept words (js/i18n.js) are dropped first, so the new version's
// are fetched as it opens, not the old ones used once more.
// Plain script: this project does not use ES modules.
(function () {
  const SW_URL = "/sw.js";

  const COPY = {
    label: I18n.t('appUpdate.update', 'Update'),
    ready: I18n.t('swUpdate.ready', 'A new version of SG Bus Timings is ready.'),
    reload: I18n.t('swUpdate.reload', 'Reload'),
    later: I18n.t('appUpdate.notNow', 'Not now'),
  };

  const VIEW_KEY = "sgbus_update_view";
  const WORDS_KEY = "sgbus_lang_words";
  let registration = null;
  let waitingWorker = null;
  let reloading = false;
  let dismissed = false;

  function render() {
    const existing = document.querySelector(".update-notice");

    if (!waitingWorker || dismissed) {
      existing?.remove();
      return;
    }

    const bar = existing ?? document.createElement("div");
    bar.className = "update-notice";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-label", COPY.label);
    bar.innerHTML = `
      <div class="update-notice-inner">
        <p>${COPY.ready}</p>
        <button type="button" class="btn" data-sw-update>${COPY.reload}</button>
        <button type="button" class="iconBtn" data-sw-later>${COPY.later}</button>
      </div>
    `;

    bar.querySelector("[data-sw-update]").addEventListener("click", () => {
      // The only place anything asks for skipWaiting. The reload happens on
      // controllerchange, not here.
      waitingWorker?.postMessage("skip-waiting");
    });

    bar.querySelector("[data-sw-later]").addEventListener("click", () => {
      // This page view only, never stored.
      dismissed = true;
      render();
    });

    if (!existing) document.body.prepend(bar);
  }

  // Whether reloading now loses nothing.
  function safe() {
    if (!waitingWorker || reloading) return false;
    if (window.Trip?.active?.()) return false;
    if (document.querySelector(".modal-backdrop:not(.hidden):not(.docked)")) return false;
    if (document.body.classList.contains("touring")) return false;
    const el = document.activeElement;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return false;
    // A bug report typed and not yet sent stays while the app's open (js/bug-report.js).
    if (document.getElementById("bugText")?.value.trim()) return false;
    if (navigator.onLine === false || window.Offline?.on?.()) return false;
    return true;
  }

  // The new version, now, if it's safe: `view`, the page to open again after.
  function updateNow(view = null) {
    if (!safe()) return false;
    try {
      localStorage.removeItem(WORDS_KEY);
      if (view) sessionStorage.setItem(VIEW_KEY, view);
    } catch { /* the words are fetched again behind the page anyway */ }
    waitingWorker.postMessage("skip-waiting");
    return true;
  }

  // The page picked before an update, opened again once it's in.
  function reopenView() {
    let view = null;
    try {
      view = sessionStorage.getItem(VIEW_KEY);
      sessionStorage.removeItem(VIEW_KEY);
    } catch { /* none */ }
    if (view && location.hash.length <= 1 && window.MainScreen?.active?.() !== view) window.MainScreen?.open?.(view);
  }

  function watchForUpdate() {
    if (!registration) return;

    // A worker already waiting when the page opened: the ordinary case on the
    // first visit after a deploy.
    if (registration.waiting && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting;
      render();
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (!installing) return;

      installing.addEventListener("statechange", () => {
        // installed with no controller is a first install: nothing to prompt about.
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting ?? installing;
          render();
        }
      });
    });

    // People keep this tab open for days and come back to it by switching to
    // it, which is not a navigation, so the browser would not check on its own.
    // Back on screen: the version waiting is put in, if it's safe; then a check for
    // a newer one, for next time.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      if (updateNow()) return;
      registration.update().catch(() => {});
    });
    // A page picked in the Edge Tray: a moment between one thing and the next.
    window.addEventListener("viewchange", () => {
      if (waitingWorker) updateNow(window.MainScreen?.active?.() || null);
    });
  }

  function registerWorker() {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register(SW_URL)
      .then((reg) => {
        registration = reg;
        watchForUpdate();
      })
      .finally(reopenView)
      .catch((cause) => {
        // Private browsing in some browsers, and any non-localhost http origin.
        console.warn("service worker registration failed:", cause);
      });

    // Reload once the new worker has taken control, so the page comes back
    // served by it and not by the one being replaced. The flag stops a second
    // controllerchange from starting a reload loop.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  // On load, so precaching does not compete with the page's own first fetches.
  if (document.readyState === "complete") registerWorker();
  else window.addEventListener("load", registerWorker, { once: true });
})();
