// Syncing with the Telegram bot, from Settings (js/sync.js): the device side of the relay
// (api/sync.js), which the bot reaches with its /sync. Unlike syncing two devices (js/p2p.js),
// this goes through the site's server, held there for 10 minutes at most and gone the moment
// either side ends it.
//
// new BotRelay() is driven like p2p.js's Host: start(code) opens the session and waits for the
// bot, send(message) and close(), with these events:
//   status   { status: 'connecting' | 'waiting' | 'connected' | 'ended' | 'error', message? }
//   message  { message }, each of js/sync.js's wire as the bot sends it
// Plain script: this project does not use ES modules, so it goes on window.
(function () {
  // How often it asks the relay what the bot has said.
  const POLL_MS = 2000;
  // Polls in a row that fail before it gives up.
  const MAX_FAILS = 5;

  const randomSecret = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

  class BotRelay extends EventTarget {
    constructor() {
      super();
      this.code = '';
      this.secret = randomSecret();
      this.status = 'idle';
      this.timer = null;
      this.fails = 0;
      this.expiresAt = 0;
    }

    emit(type, detail) {
      this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    setStatus(status, message = '') {
      if (this.status === 'ended' || this.status === 'error') return;
      this.status = status;
      this.emit('status', { status, message });
      if (status === 'ended' || status === 'error') clearTimeout(this.timer);
    }

    async post(body) {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: this.code, secret: this.secret, ...body }),
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => null);
        const err = new Error(data?.error || 'Couldn’t reach the site. Check your connection.');
        err.status = res.status;
        throw err;
      }
      return res.status === 204 ? null : res.json();
    }

    async start(code) {
      this.code = code;
      this.setStatus('connecting');
      const { expiresAt } = await this.post({ op: 'open' });
      this.expiresAt = expiresAt;
      this.setStatus('waiting');
      this.poll();
    }

    async poll() {
      if (this.status === 'ended' || this.status === 'error') return;
      try {
        const res = await fetch(`/api/sync?code=${encodeURIComponent(this.code)}&secret=${this.secret}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const { open, joined, messages } = await res.json();
        this.fails = 0;
        if (joined && this.status === 'waiting') this.setStatus('connected');
        for (const message of messages || []) {
          if (message?.type === 'bye') {
            this.setStatus('ended', 'The Telegram bot ended the sync.');
            return;
          }
          this.emit('message', { message });
        }
        if (!open) {
          this.setStatus('ended', Date.now() >= this.expiresAt
            ? 'The sync with the Telegram bot ended after 10 minutes. Start it again for more.'
            : 'The sync with the Telegram bot has ended.');
          return;
        }
      } catch {
        if (++this.fails >= MAX_FAILS) {
          this.setStatus('error', 'Lost touch with the site. Check your connection, then start again.');
          return;
        }
      }
      this.timer = setTimeout(() => this.poll(), POLL_MS);
    }

    send(message) {
      if (this.status !== 'connected') return;
      this.post({ op: 'send', message }).catch(() => {});
    }

    close() {
      const was = this.status;
      this.status = 'ended';
      clearTimeout(this.timer);
      if (this.code && was !== 'idle') this.post({ op: 'close' }).catch(() => {});
    }

    // As a P2P guest leaving: there's only one way to end it here.
    leave() {
      this.close();
    }
  }

  window.BotRelay = BotRelay;
})();
