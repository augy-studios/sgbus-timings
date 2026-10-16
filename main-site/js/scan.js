// Scan a stop's code: point the camera at the 5-digit code on a bus stop's pole and its timings
// open. The camera's shown here, as any page can show it; every so often a frame from the
// middle of it goes to the Android app, where Google's ML Kit reads the text on the phone
// (ScanPlugin.java), and the first 5-digit number that's a real stop is the one. The Android
// app only (2.1.0 and later): a browser has nothing to read the text with.
// Plain script: exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const EVERY_MS = 700;
  const WIDTH = 960;

  const available = () => Boolean(window.AppBridge?.native && AppBridge.has('scan'));

  let stream = null;
  let timer = null;
  let canvas = null;

  function status(text) {
    $('#scanStatus').textContent = text;
  }

  async function open() {
    $('#scanScreen').hidden = false;
    document.body.classList.add('modal-open');
    status('Point the camera at the 5-digit code on the bus stop’s pole');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    } catch {
      status('The camera isn’t allowed. Allow Camera for SG Bus Timings in Android’s settings, then try again.');
      return;
    }
    const video = $('#scanVideo');
    video.srcObject = stream;
    await video.play().catch(() => {});
    ensureStopsIndex().catch(() => {});
    timer = setInterval(look, EVERY_MS);
  }

  function close() {
    clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    $('#scanVideo').srcObject = null;
    $('#scanScreen').hidden = true;
    document.body.classList.toggle('modal-open', !!document.querySelector('.modal-backdrop:not(.hidden), .panelModal:not([hidden])'));
  }

  let looking = false;
  async function look() {
    const video = $('#scanVideo');
    if (looking || !video.videoWidth) return;
    looking = true;
    try {
      // The middle of the picture, where the frame on screen is: less to read, and the code
      // you're pointing at rather than one on a sign behind it.
      const sw = video.videoWidth * 0.8, sh = video.videoHeight * 0.5;
      const sx = (video.videoWidth - sw) / 2, sy = (video.videoHeight - sh) / 2;
      canvas ||= document.createElement('canvas');
      canvas.width = Math.min(WIDTH, sw);
      canvas.height = Math.round(canvas.width * (sh / sw));
      canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.75).split(',')[1];
      const { text } = await AppBridge.call('Scan', 'read', { image });
      const idx = stopsIndex || {};
      const code = (String(text).match(/\b\d{5}\b/g) || []).find((c) => idx[c]);
      if (code) found(code);
    } catch {
      // Busy, or nothing readable: the next frame.
    } finally {
      looking = false;
    }
  }

  function found(code) {
    navigator.vibrate?.(40);
    close();
    loadStop(code, { scroll: true });
  }

  function init() {
    const show = () => { $('#scanBtn').hidden = !available(); };
    window.addEventListener('app:ready', show);
    show();
    $('#scanBtn').addEventListener('click', open);
    $('#scanClose').addEventListener('click', close);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && stream) close();
    });
  }

  init();
})();
