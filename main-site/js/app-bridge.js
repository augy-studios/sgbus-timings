// The channel to the Android app (android/), when the site is open in it: what the app can do
// for the page that a web page can't do for itself, such as reading the phone's calendar
// (js/calendar.js).
//
// The app sends a hello as each page loads, over Chrome's postMessage for Trusted Web Activities
// (android/app/src/main/java/org/uwuapps/sgbus/AppBridge.java), with a port to answer on. It
// comes from the site's own origin, since Chrome has checked the site vouches for the app
// (.well-known/assetlinks.json, use_as_origin). In a browser, or an app from before 1.1.0, no
// hello ever comes, and the page carries on as a website.
//
//   AppBridge.has('calendar')          whether the app says it can
//   AppBridge.ready(ms)                resolves true once the hello's in, false after ms
//   AppBridge.request('calendar', {})  the app's answer to a request, as an object
// Plain script: exports go on window.
(function () {
  let port = null;
  let hello = null;
  let seq = 0;
  const pending = new Map();
  const waiting = [];

  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.ports?.[0] || typeof e.data !== 'string') return;
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data?.type !== 'hello') return;
    port = e.ports[0];
    hello = data;
    port.onmessage = (m) => {
      let reply;
      try {
        reply = JSON.parse(m.data);
      } catch {
        return;
      }
      const done = pending.get(reply?.id);
      if (done) {
        pending.delete(reply.id);
        done(reply);
      }
    };
    waiting.splice(0).forEach((resolve) => resolve(true));
    window.dispatchEvent(new CustomEvent('app:ready', { detail: hello }));
  });

  function ready(ms = 1500) {
    if (port) return Promise.resolve(true);
    return new Promise((resolve) => {
      waiting.push(resolve);
      setTimeout(() => resolve(false), ms);
    });
  }

  function request(type, body = {}, ms = 15000) {
    if (!port) return Promise.reject(new Error('Not in the app.'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      port.postMessage(JSON.stringify({ ...body, id, type }));
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error("The app didn't answer. Try again."));
      }, ms);
    });
  }

  window.AppBridge = {
    has: (feature) => !!hello?.features?.includes(feature),
    ready,
    request,
    version: () => hello?.version || null,
  };
})();
