// Choose a language (help desk #6): Settings' Language opens a window listing the four, each a
// row with a small flag and the language's name in its own words, a tick on the one in use, and
// Close, as gftv-linktree's switcher has it. A row picked opens the app again in it (js/i18n.js).
//
// The flags are drawn here as SVG, not emoji, which Windows doesn't draw as flags. They're
// flag-icons 7.5.0's (MIT, https://flagicons.lipis.dev), the inside of a 640 by 480 drawing, as
// Augy's screenshot has them: the United Kingdom for English, China for Chinese, Malaysia for
// Malay and India for Tamil. Each is beside the name, so hidden from screen readers; the name is
// read in its own language (lang).
//
// Window.LangPick = { open() }. Plain script: exports go on window.
(function () {
  const FLAGS = {
      "gb": "<path fill=\"#012169\" d=\"M0 0h640v480H0z\"/><path fill=\"#FFF\" d=\"m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z\"/><path fill=\"#C8102E\" d=\"m424 281 216 159v40L369 281zm-184 20 6 35L54 480H0zM640 0v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z\"/><path fill=\"#FFF\" d=\"M241 0v480h160V0zM0 160v160h640V160z\"/><path fill=\"#C8102E\" d=\"M0 193v96h640v-96zM273 0v480h96V0z\"/>",
      "cn": "<defs><path id=\"cn-a\" fill=\"#ff0\" d=\"M-.6.8 0-1 .6.8-1-.3h2z\"/></defs><path fill=\"#ee1c25\" d=\"M0 0h640v480H0z\"/><use href=\"#cn-a\" width=\"30\" height=\"20\" transform=\"matrix(71.9991 0 0 72 120 120)\"/><use href=\"#cn-a\" width=\"30\" height=\"20\" transform=\"matrix(-12.33562 -20.5871 20.58684 -12.33577 240.3 48)\"/><use href=\"#cn-a\" width=\"30\" height=\"20\" transform=\"matrix(-3.38573 -23.75998 23.75968 -3.38578 288 95.8)\"/><use href=\"#cn-a\" width=\"30\" height=\"20\" transform=\"matrix(6.5991 -23.0749 23.0746 6.59919 288 168)\"/><use href=\"#cn-a\" width=\"30\" height=\"20\" transform=\"matrix(14.9991 -18.73557 18.73533 14.99929 240 216)\"/>",
      "my": "<g clip-path=\"url(#my-a)\"><path fill=\"#C00\" d=\"M0 0h640v480H0z\"/><path fill=\"#C00\" d=\"M0 0h640v34.3H0z\"/><path fill=\"#fff\" d=\"M0 34.3h640v34.3H0z\"/><path fill=\"#C00\" d=\"M0 68.6h640v34.3H0z\"/><path fill=\"#fff\" d=\"M0 102.9h640V137H0z\"/><path fill=\"#C00\" d=\"M0 137.1h640v34.3H0z\"/><path fill=\"#fff\" d=\"M0 171.4h640v34.3H0z\"/><path fill=\"#C00\" d=\"M0 205.7h640V240H0z\"/><path fill=\"#fff\" d=\"M0 240h640v34.3H0z\"/><path fill=\"#C00\" d=\"M0 274.3h640v34.3H0z\"/><path fill=\"#fff\" d=\"M0 308.6h640v34.3H0z\"/><path fill=\"#C00\" d=\"M0 342.9h640V377H0z\"/><path fill=\"#fff\" d=\"M0 377.1h640v34.3H0z\"/><path fill=\"#C00\" d=\"M0 411.4h640v34.3H0z\"/><path fill=\"#fff\" d=\"M0 445.7h640V480H0z\"/><path fill=\"#006\" d=\"M0 .5h320v274.3H0z\"/><path fill=\"#FC0\" d=\"m207.5 73.8 6 40.7 23-34-12.4 39.2 35.5-20.8-28.1 30 41-3.2-38.3 14.8 38.3 14.8-41-3.2 28.1 30-35.5-20.8 12.3 39.3-23-34.1-6 40.7-5.9-40.7-23 34 12.4-39.2-35.5 20.8 28-30-41 3.2 38.4-14.8-38.3-14.8 41 3.2-28.1-30 35.5 20.8-12.4-39.3 23 34.1zm-33.3 1.7a71 71 0 0 0-100 65 71 71 0 0 0 100 65 80 80 0 0 1-83.2 6.2 80 80 0 0 1-43.4-71.2 80 80 0 0 1 126.6-65\"/></g><defs><clipPath id=\"my-a\"><path fill=\"#fff\" d=\"M0 0h640v480H0z\"/></clipPath></defs>",
      "in": "<path fill=\"#f93\" d=\"M0 0h640v160H0z\"/><path fill=\"#fff\" d=\"M0 160h640v160H0z\"/><path fill=\"#128807\" d=\"M0 320h640v160H0z\"/><g transform=\"matrix(3.2 0 0 3.2 320 240)\"><circle r=\"20\" fill=\"#008\"/><circle r=\"17.5\" fill=\"#fff\"/><circle r=\"3.5\" fill=\"#008\"/><g id=\"in-d\"><g id=\"in-c\"><g id=\"in-b\"><g id=\"in-a\" fill=\"#008\"><circle r=\".9\" transform=\"rotate(7.5 -8.8 133.5)\"/><path d=\"M0 17.5.6 7 0 2l-.6 5z\"/></g><use href=\"#in-a\" width=\"100%\" height=\"100%\" transform=\"rotate(15)\"/></g><use href=\"#in-b\" width=\"100%\" height=\"100%\" transform=\"rotate(30)\"/></g><use href=\"#in-c\" width=\"100%\" height=\"100%\" transform=\"rotate(60)\"/></g><use href=\"#in-d\" width=\"100%\" height=\"100%\" transform=\"rotate(120)\"/><use href=\"#in-d\" width=\"100%\" height=\"100%\" transform=\"rotate(-120)\"/></g>"
  };
  const LANGS = [
    { code: 'en', name: 'English', lang: 'en', flag: 'gb' },
    { code: 'zh-SG', name: '中文', lang: 'zh-Hans-SG', flag: 'cn' },
    { code: 'ms', name: 'Bahasa Melayu', lang: 'ms', flag: 'my' },
    { code: 'ta', name: 'தமிழ்', lang: 'ta', flag: 'in' },
  ];
  const ID = 'langModal';
  const $ = (id) => document.getElementById(id);

  const flagSvg = (code) => `<svg class="langFlag" viewBox="0 0 640 480" aria-hidden="true" focusable="false">${FLAGS[code] || ''}</svg>`;
  const nameOf = (code) => LANGS.find((l) => l.code === code) || LANGS[0];

  function render() {
    const now = I18n.lang();
    $('langList').innerHTML = LANGS.map((l) =>
      `<button type="button" class="langRow${l.code === now ? ' active' : ''}" data-lang="${l.code}" lang="${l.lang}"${l.code === now ? ' aria-current="true"' : ''}>` +
      `${flagSvg(l.flag)}<span class="langName">${l.name}</span>` +
      (l.code === now ? `<span class="langTick" aria-hidden="true">${window.icon('check')}</span>` : '') +
      `</button>`).join('');
  }

  // Not English: a line asking to be told of a translation that reads wrong, as an email to
  // Augy (the contact the guide gives, help/privacy.md), its subject naming the language.
  function feedback() {
    const now = I18n.lang();
    document.querySelectorAll('[data-lang-feedback]').forEach((p) => {
      p.hidden = now === 'en';
      const a = p.querySelector('a');
      if (a) a.href = `mailto:augy@augystudios.com?subject=${encodeURIComponent(`SG Bus Timings translation (${nameOf(now).name})`)}`;
    });
  }

  // The button in Settings: the language in use, its flag and name.
  function renderButton() {
    const btn = $('langOpen');
    if (!btn) return;
    const l = nameOf(I18n.lang());
    btn.querySelector('.langNow').innerHTML = `${flagSvg(l.flag)}<span lang="${l.lang}">${l.name}</span>`;
  }

  function open() {
    render();
    window.openModal(ID);
    // The one in use has the focus, rather than the window.
    setTimeout(() => $('langList').querySelector('[aria-current="true"]')?.focus({ preventScroll: true }), 0);
  }

  function init() {
    if (!$(ID)) return;
    renderButton();
    feedback();
    $('langOpen')?.addEventListener('click', open);
    $('langList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-lang]');
      if (!row) return;
      if (row.dataset.lang === I18n.lang()) return window.closeModal(ID);
      I18n.set(row.dataset.lang);
    });
    // Up and Down move along the rows.
    $('langList').addEventListener('keydown', (e) => {
      const rows = [...$('langList').querySelectorAll('[data-lang]')];
      const i = rows.indexOf(document.activeElement);
      const next = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
      if (i === -1 || next == null) return;
      e.preventDefault();
      rows[(next + rows.length) % rows.length].focus();
    });
    $('langClose').addEventListener('click', () => window.closeModal(ID));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.LangPick = { open, LANGS };
})();
