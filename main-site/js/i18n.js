// Languages (help desk #6): English, Chinese (Singapore, simplified), Malay and Tamil. The site's
// words come from a json file per language, /i18n/<lang>.json, each a flat map of key to words,
// "favs.title": "Favourites". English is what the page and the code already say, so English never
// waits on a file: i18n/en.json lists every key and its English, kept in step with them by
// scripts/i18n-check.mjs. A key a language hasn't got stays English.
//
// In the page: data-i18n="key" puts the words in an element's text, and data-i18n-title,
// data-i18n-aria-label, data-i18n-placeholder, data-i18n-alt, data-i18n-data-title and data-i18n-data-short
// in those attributes. In code:
// I18n.t("key", "English, {name}", { name }) (tr in script.js) gives the words in the language
// picked, or the English given; {name} is filled in either way.
//
// The words are in before anything else draws: this runs at the end of the page, before the
// other scripts, and puts the page's marked words in at once, from the copy kept in storage
// (WORDS_KEY), or with no copy yet, from the file, fetched there and then. The file is fetched
// again behind the page soon after, and again whenever the app comes back to the screen (at most
// every REFRESH_MS): a newer one is kept and used straight away, the page's marked words put in
// again and everything drawn after in the new words, so words added in an update don't stay
// English till the app's next opened (an app left open for days never was). Settings' Language
// (set) keeps the choice and opens the page again in it.
//
// The language is Settings' (LANG_KEY), else the phone's if it's one of these, else English.
//
// In the Android app (2.3.1), Language and Android's own per-app language for it (Settings,
// Apps, SG Bus Timings, Language) follow each other: js/app-bridge.js.
//
// Window.I18n = { lang(), chosen(), languages, t(key, en, vars), apply(root), set(lang), unset(),
// match(tag) }.
// Plain script: exports go on window.
(function () {
  var LANG_KEY = "sgbus_lang";
  var WORDS_KEY = "sgbus_lang_words";
  // The words' revision, set by scripts/i18n-check.mjs --write from every language's file: a
  // copy kept from another revision is old, and the file's fetched there and then instead, so
  // words added or changed in an update are never shown in English, or as they were, first.
  var WORDS_REV = "17360618355d";
  // { code: its name in itself }. Add a language here and its i18n/<code>.json.
  var LANGUAGES = { en: "English", "zh-SG": "中文", ms: "Bahasa Melayu", ta: "தமிழ்" };
  // data-title is a Settings group's heading (script.js).
  var ATTRS = ["title", "aria-label", "placeholder", "alt", "data-title", "data-short"];

  function stored(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* this visit only */ }
  }

  // A phone's language as one of these: any Chinese as zh-SG, "ms-MY" as ms.
  function match(code) {
    code = String(code || "").toLowerCase();
    if (!code) return null;
    if (code.indexOf("zh") === 0) return "zh-SG";
    for (var k in LANGUAGES) if (k.toLowerCase() === code || k === code.split("-")[0]) return k;
    return null;
  }

  function pick() {
    var saved = stored(LANG_KEY);
    if (saved && LANGUAGES[saved]) return saved;
    var wanted = navigator.languages || [navigator.language || "en"];
    for (var i = 0; i < wanted.length; i++) {
      var got = match(wanted[i]);
      if (got) return got;
    }
    return "en";
  }

  var lang = pick();
  var words = null;

  function fill(text, vars) {
    if (!vars) return String(text);
    return String(text).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  function t(key, en, vars) {
    var got = words && typeof words[key] === "string" && words[key] ? words[key] : en;
    return fill(got == null ? key : got, vars);
  }

  // The page's marked words, under `root`, in the language picked.
  function apply(root) {
    if (!words) return;
    root = root || document;
    var els = root.querySelectorAll("[data-i18n]");
    for (var i = 0; i < els.length; i++) {
      var w = words[els[i].getAttribute("data-i18n")];
      if (typeof w === "string" && w) els[i].textContent = w;
    }
    ATTRS.forEach(function (attr) {
      var list = root.querySelectorAll("[data-i18n-" + attr + "]");
      for (var j = 0; j < list.length; j++) {
        var v = words[list[j].getAttribute("data-i18n-" + attr)];
        if (typeof v === "string" && v) list[j].setAttribute(attr, v);
      }
    });
  }

  // The language's words: the copy kept, or the file there and then. Null for English.
  function load(code) {
    if (code === "en") return null;
    try {
      var kept = JSON.parse(stored(WORDS_KEY) || "null");
      if (kept && kept.lang === code && kept.words && kept.rev === WORDS_REV) return kept.words;
    } catch (e) { /* fetched below */ }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/i18n/" + code + ".json", false);
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        var map = JSON.parse(xhr.responseText);
        store(WORDS_KEY, JSON.stringify({ lang: code, words: map, rev: WORDS_REV }));
        return map;
      }
    } catch (e) { console.warn("No words for " + code + ", so English:", e); }
    return null;
  }

  // A newer file: kept, and used from now on. Says so with "i18n:updated" on window when its
  // words differ, for anything drawn already that wants drawing again.
  var REFRESH_MS = 30 * 60 * 1000;
  var refreshedAt = 0;
  function refresh(code) {
    if (code === "en" || !window.fetch) return;
    refreshedAt = Date.now();
    fetch("/i18n/" + code + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (map) {
        if (!map || lang !== code) return;
        var fresh = JSON.stringify(map);
        if (words && JSON.stringify(words) === fresh) return;
        store(WORDS_KEY, JSON.stringify({ lang: code, words: map, rev: WORDS_REV }));
        words = map;
        apply(document);
        try { window.dispatchEvent(new CustomEvent("i18n:updated")); } catch (e) { /* nothing listening */ }
      })
      .catch(function () { /* the copy kept does */ });
  }

  // Settings' Language: kept, then the page opens again in it. In the Android app it's the
  // app's own language too (js/app-bridge.js, tellLanguage), told before the page goes.
  var TELL_MS = 1500;
  // Once the page is on its way to opening again, nothing more: the app's "language" event for
  // the very change it was told of can come in before it goes.
  var leaving = false;
  function set(code) {
    if (leaving || !LANGUAGES[code] || code === lang) return;
    leaving = true;
    store(LANG_KEY, code);
    store(WORDS_KEY, null);
    var told = window.AppBridge && window.AppBridge.tellLanguage ? window.AppBridge.tellLanguage(code) : null;
    // The magic cup (js/magic-cup.js), as the page goes.
    var cup = window.MagicCup ? window.MagicCup.play(code) : null;
    var gone = false;
    var go = function () { if (!gone) { gone = true; location.reload(); } };
    Promise.all([told, cup]).then(go, go);
    setTimeout(go, TELL_MS);
  }

  // The phone's own choice again, as Android's "System default" for the app: the choice kept
  // dropped, and the page opened again in the phone's language (pick).
  function unset() {
    if (leaving || stored(LANG_KEY) == null) return;
    leaving = true;
    store(LANG_KEY, null);
    store(WORDS_KEY, null);
    var go = function () { location.reload(); };
    if (window.MagicCup) window.MagicCup.play(pick()).then(go, go);
    else go();
  }

  words = load(lang);
  document.documentElement.lang = lang === "zh-SG" ? "zh-Hans-SG" : lang;
  apply(document);
  setTimeout(function () { refresh(lang); }, 2000);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && Date.now() - refreshedAt >= REFRESH_MS) refresh(lang);
  });

  window.I18n = { lang: function () { return lang; }, chosen: function () { return stored(LANG_KEY); }, languages: LANGUAGES, t: t, apply: apply, set: set, unset: unset, match: match };
})();
