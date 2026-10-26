// Languages (help desk #6): English, Chinese (Singapore, simplified), Malay and Tamil. The site's
// words come from a json file per language, /i18n/<lang>.json, each a flat map of key to words,
// "favs.title": "Favourites". English is what the page and the code already say, so English never
// waits on a file: i18n/en.json lists every key and its English, kept in step with them by
// scripts/i18n-check.mjs. A key a language hasn't got stays English.
//
// In the page: data-i18n="key" puts the words in an element's text, and data-i18n-title,
// data-i18n-aria-label and data-i18n-placeholder in those attributes. In code:
// I18n.t("key", "English, {name}", { name }) (tr in script.js) gives the words in the language
// picked, or the English given; {name} is filled in either way.
//
// The words are in before anything else draws: this runs at the end of the page, before the
// other scripts, and puts the page's marked words in at once, from the copy kept in storage
// (WORDS_KEY), or with no copy yet, from the file, fetched there and then. The file is fetched
// again behind the page each time, and a newer one is used from the next open. Settings'
// Language (set) keeps the choice and opens the page again in it.
//
// The language is Settings' (LANG_KEY), else the phone's if it's one of these, else English.
//
// Window.I18n = { lang(), languages, t(key, en, vars), apply(root), set(lang) }.
// Plain script: exports go on window.
(function () {
  var LANG_KEY = "sgbus_lang";
  var WORDS_KEY = "sgbus_lang_words";
  // { code: its name in itself }. Add a language here and its i18n/<code>.json.
  var LANGUAGES = { en: "English", "zh-SG": "中文", ms: "Bahasa Melayu", ta: "தமிழ்" };
  // data-title is a Settings group's heading (script.js).
  var ATTRS = ["title", "aria-label", "placeholder", "data-title"];

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
      if (kept && kept.lang === code && kept.words) return kept.words;
    } catch (e) { /* fetched below */ }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/i18n/" + code + ".json", false);
      xhr.send();
      if (xhr.status >= 200 && xhr.status < 300) {
        var map = JSON.parse(xhr.responseText);
        store(WORDS_KEY, JSON.stringify({ lang: code, words: map }));
        return map;
      }
    } catch (e) { console.warn("No words for " + code + ", so English:", e); }
    return null;
  }

  // A newer file, for the next open.
  function refresh(code) {
    if (code === "en" || !window.fetch) return;
    fetch("/i18n/" + code + ".json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (map) { if (map && lang === code) store(WORDS_KEY, JSON.stringify({ lang: code, words: map })); })
      .catch(function () { /* the copy kept does */ });
  }

  // Settings' Language: kept, then the page opens again in it.
  function set(code) {
    if (!LANGUAGES[code] || code === lang) return;
    store(LANG_KEY, code);
    store(WORDS_KEY, null);
    location.reload();
  }

  words = load(lang);
  document.documentElement.lang = lang === "zh-SG" ? "zh-Hans-SG" : lang;
  apply(document);
  setTimeout(function () { refresh(lang); }, 5000);

  window.I18n = { lang: function () { return lang; }, languages: LANGUAGES, t: t, apply: apply, set: set };
})();
