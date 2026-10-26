// Languages (help desk #6): the site's words from a json file per language, /i18n/<lang>.json,
// each a flat map of key to words, "favs.title": "Favourites". English is what the page and the
// code already say, so English never waits on a file and nothing flashes: i18n/en.json is the
// list of every key and its English, kept in step with them by scripts/i18n-check.mjs.
//
// In the page: data-i18n="key" puts the words in an element's text, and data-i18n-title,
// data-i18n-aria-label and data-i18n-placeholder in those attributes. In code:
// I18n.t("key", "English, {name}", { name }) gives the words in the language picked, or the
// English given; {name} is filled in either way.
//
// The language is Settings' (LANG_KEY), else the phone's if there's a file for it, else English.
// LANGUAGES lists the files there are: only English so far, so nothing changes until another is
// added (scripts/i18n-check.mjs says which of its keys are missing, and those stay English).
//
// Window.I18n = { lang(), languages, t(key, en, vars), apply(root), set(lang), ready }; fires
// "langchange" on window once another language's words are in, for code that drew words
// itself to draw them again. Plain script: exports go on window.
(function () {
  var LANG_KEY = "sgbus_lang";
  // { code: its own name for itself }. Add a language here and its i18n/<code>.json.
  var LANGUAGES = { en: "English" };
  var ATTRS = ["title", "aria-label", "placeholder"];

  var words = null; // the language's map, or null for English
  var lang = pick();

  function pick() {
    var saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (e) { /* the phone's */ }
    if (saved && LANGUAGES[saved]) return saved;
    var wanted = (navigator.languages || [navigator.language || "en"]);
    for (var i = 0; i < wanted.length; i++) {
      var code = String(wanted[i] || "").toLowerCase();
      if (LANGUAGES[code]) return code;
      if (LANGUAGES[code.split("-")[0]]) return code.split("-")[0];
    }
    return "en";
  }

  function fill(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  function t(key, en, vars) {
    var got = words && typeof words[key] === "string" ? words[key] : en;
    return fill(got == null ? key : got, vars);
  }

  // The page's marked words, under `root`, in the language picked. English is already there; an
  // element's English is kept (data-i18n-en) so switching back puts it back.
  function apply(root) {
    root = root || document;
    var els = root.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.dataset.i18nEn == null) el.dataset.i18nEn = el.textContent;
      el.textContent = t(el.dataset.i18n, el.dataset.i18nEn);
    }
    ATTRS.forEach(function (attr) {
      var sel = "[data-i18n-" + attr + "]";
      var list = root.querySelectorAll(sel);
      for (var j = 0; j < list.length; j++) {
        var node = list[j];
        var keep = "i18nEn" + attr.replace(/(^|-)(\w)/g, function (m, d, c) { return c.toUpperCase(); });
        if (node.dataset[keep] == null) node.dataset[keep] = node.getAttribute(attr) || "";
        node.setAttribute(attr, t(node.getAttribute("data-i18n-" + attr), node.dataset[keep]));
      }
    });
  }

  function load(code) {
    if (code === "en") {
      words = null;
      return Promise.resolve();
    }
    return fetch("/i18n/" + code + ".json")
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); })
      .then(function (map) { words = map; })
      .catch(function (e) { console.warn("No words for " + code + ", so English:", e); words = null; });
  }

  function set(code) {
    if (!LANGUAGES[code]) return Promise.resolve();
    try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* this visit only */ }
    lang = code;
    document.documentElement.lang = code;
    return load(code).then(function () {
      apply(document);
      window.dispatchEvent(new Event("langchange"));
    });
  }

  document.documentElement.lang = lang;
  var ready = load(lang).then(function () {
    if (lang === "en") return;
    var go = function () {
      apply(document);
      window.dispatchEvent(new Event("langchange"));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
    else go();
  });

  window.I18n = { lang: function () { return lang; }, languages: LANGUAGES, t: t, apply: apply, set: set, ready: ready };
})();
