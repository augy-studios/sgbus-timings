// Team runs (Augy, 4 November 2026): the feats speedrun as a team. One of you starts a team run
// with a name, the rest join with its code or link (#team/<code>), up to eight at once, and the
// rides and trips any of you take count for the whole team. Each member's phone gets every feat
// the team does, with its uwuCoins, as if they'd done it themselves (Eggs.feat(id, { team })).
//
// What counts is what counts in your own Achievements, and only from your phone (js/rides.js,
// js/eggs.js): a ride judged real by its location (ride), sent as its line or bus and what it's
// towards First to last and Ends of the island, and a trip taken with the Get Off Alert to the
// end with a real ride on it (tripDone), sent as where and when it started and ended and its
// stop on the way. Each goes to the team's server (api/team.js) once, through an outbox kept
// here (OUTBOX_KEY) until it's taken, so a ride with no signal goes later.
//
// Every phone works the team's feats out from the same rides and trips (fold), by the rules
// js/eggs.js has:
//   lines, up, down, first, ends  each line, bus, stop or station by any of you
//   hundred                       100 rides between you
//   long, loop, ktm               a trip, or trips handed on: a teammate's trip starting within
//                                 HANDOFF_M of where another's ended, from HANDOFF_EARLY_MS
//                                 before it ended to HANDOFF_GAP_MS after, counts as the one
//                                 trip going on (chains). Over three hours from the first's
//                                 start to the last's end; back within LOOP_M of the start, by
//                                 way of somewhere LOOP_AWAY_M away (a hand-off, or a stop on
//                                 the way); from one old railway place to another. A hand-off
//                                 is always to someone else: your own two trips aren't one.
// A feat the team did before you joined isn't yours: only what's done once you're in.
//
// The team is fetched as Achievements opens, as the app comes back to the front, and every
// REFRESH_MS while it's on show and you're in one. Settings' Achievements shows it: how far
// along the team is with each feat, who's in it, and the latest hand-off, with Continue from
// there to plan from where it was. Kept under KEY ({ id, name, member: { id, secret, name } })
// and, for showing it offline, CACHE_KEY. Not synced: each phone joins for itself.
//
// Window.Team = { ride(r), tripDone(t), refresh(), fromLink(code), fold(team), mine(), RULES }.
// Plain script: exports go on window. Loaded after js/eggs.js.
(function () {
  const KEY = 'sgbus_team';
  const OUTBOX_KEY = 'sgbus_team_outbox';
  const CACHE_KEY = 'sgbus_team_cache';
  const HANDOFF_M = 400;
  const HANDOFF_EARLY_MS = 5 * 60 * 1000;
  const HANDOFF_GAP_MS = 30 * 60 * 1000;
  const REFRESH_MS = 90 * 1000;
  const OUTBOX_MAX = 500;
  const SEND_MAX = 50; // api/_lib/team-runs.js, MAX_EVENTS
  const CODE_RE = /^[a-z0-9]{10}$/;
  const tr = (k, en, v) => (window.I18n ? I18n.t(k, en, v) : en);
  const $ = (id) => document.getElementById(id);

  const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* this visit only */ } };
  const readJson = (k, empty) => { try { return JSON.parse(get(k) || 'null') ?? empty; } catch { return empty; } };

  const mine = () => {
    const v = readJson(KEY, null);
    return v && CODE_RE.test(v.id) && v.member?.id && v.member?.secret ? v : null;
  };
  const outbox = () => {
    const v = readJson(OUTBOX_KEY, []);
    return Array.isArray(v) ? v : [];
  };
  const cached = () => {
    const v = readJson(CACHE_KEY, null);
    return v && v.id === mine()?.id ? v : null;
  };

  async function api(options, query = '') {
    const r = await fetch(`/api/team${query}`, { cache: 'no-store', ...(options && { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) }) });
    const body = r.status === 204 ? {} : await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(body.error || tr('share.wentWrong', 'Something went wrong. Please try again.')), { status: r.status });
    return body;
  }

  // ---------- what this phone sends ----------

  const eid = (me) => `${me.member.id}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  function queue(kind, data) {
    const me = mine();
    if (!me) return;
    put(OUTBOX_KEY, JSON.stringify([...outbox(), { eid: eid(me), kind, data }].slice(-OUTBOX_MAX)));
    refresh();
  }

  // A ride judged real (js/rides.js): { mode, line, bus, first, end }.
  function ride(r) {
    if (!r || (r.mode !== 'bus' && r.mode !== 'train')) return;
    queue('ride', { mode: r.mode, line: r.line || '', bus: r.bus || '', first: r.first || [], end: r.end || '' });
  }

  // A trip arrived at with a real ride on it (js/eggs.js): { start, end, via, startedAt, endedAt }.
  function tripDone(t) {
    if (!t?.start || !t?.end) return;
    const pt = (p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null);
    queue('trip', { start: pt(t.start), end: pt(t.end), via: pt(t.via), startedAt: Math.round(t.startedAt), endedAt: Math.round(t.endedAt) });
  }

  // The outbox sent, SEND_MAX at a time. The team gone (404), it's put away.
  async function flush(me) {
    for (let box = outbox(); box.length; box = outbox()) {
      const batch = box.slice(0, SEND_MAX);
      try {
        await api({ action: 'add', id: me.id, member: me.member.id, secret: me.member.secret, events: batch });
      } catch (e) {
        if (e.status === 404) { gone(); return false; }
        // One that's refused (400) won't be taken later either: dropped, and the rest go.
        if (e.status === 400 && batch.length === 1) { put(OUTBOX_KEY, JSON.stringify(outbox().slice(1))); continue; }
        if (e.status === 400) { await one(me, batch); continue; }
        return true;
      }
      const sent = new Set(batch.map((e) => e.eid));
      put(OUTBOX_KEY, JSON.stringify(outbox().filter((e) => !sent.has(e.eid))));
    }
    return true;
  }
  // A batch with one refused in it: each on its own, the refused dropped.
  async function one(me, batch) {
    for (const e of batch) {
      try { await api({ action: 'add', id: me.id, member: me.member.id, secret: me.member.secret, events: [e] }); } catch (err) {
        if (err.status !== 400) return;
      }
      put(OUTBOX_KEY, JSON.stringify(outbox().filter((x) => x.eid !== e.eid)));
    }
  }

  // The team's ended, or you're no longer in it.
  function gone() {
    const was = mine();
    put(KEY, null);
    put(OUTBOX_KEY, null);
    put(CACHE_KEY, null);
    render();
    if (was) say(tr('team.ended', 'Your team run, {team}, has ended.', { team: was.name }));
  }

  // ---------- the team's feats ----------

  const RULES = { HANDOFF_M, HANDOFF_EARLY_MS, HANDOFF_GAP_MS };

  // What the team has done: { done: { id: when }, have: { id: [have, need] }, longest, handoff,
  // by: { id: member } }, from the team as api/team.js gives it.
  function fold(team) {
    const E = window.Eggs;
    const R = E.RULES;
    const m = E.metres;
    const LINES = window.RideCheck?.LINES || ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK', 'PG'];
    const firsts = { lines: {}, buses: {}, first: {}, ends: {} };
    const done = {};
    let rides = 0;
    const keep = (map, key, e) => { if (key && !map[key]) map[key] = e.at; };
    for (const e of team.events || []) {
      if (e.kind !== 'ride') continue;
      const d = e.data || {};
      rides++;
      if (rides === R.HUNDRED) done.hundred = e.at;
      keep(firsts.lines, d.line, e);
      keep(firsts.buses, d.bus, e);
      for (const c of d.first || []) keep(firsts.first, c, e);
      keep(firsts.ends, d.end, e);
    }
    const sets = { lines: ['lines', LINES], up: ['buses', E.buses('up')], down: ['buses', E.buses('down')], first: ['first', E.FIRST_LAST], ends: ['ends', E.ENDS] };
    const have = { hundred: [Math.min(rides, R.HUNDRED), R.HUNDRED] };
    for (const [id, [map, keys]] of Object.entries(sets)) {
      const got = keys.filter((k) => firsts[map][k] != null);
      have[id] = [got.length, keys.length];
      if (got.length === keys.length) done[id] = Math.max(...keys.map((k) => firsts[map][k]));
    }

    // The trips, and each one's hand-offs: the trips by someone else that go on from it.
    const trips = (team.events || []).filter((e) => e.kind === 'trip' && e.data?.start && e.data?.end)
      .map((e) => ({ ...e.data, by: e.member, at: e.at }))
      .sort((a, b) => a.startedAt - b.startedAt);
    const next = trips.map((t) => trips.filter((u) => u !== t && u.by !== t.by && u.startedAt > t.startedAt
      && u.startedAt >= t.endedAt - HANDOFF_EARLY_MS && u.startedAt <= t.endedAt + HANDOFF_GAP_MS
      && m(t.end, u.start) <= HANDOFF_M));
    const ktmAt = (p) => Object.keys(E.KTM).find((k) => m(p, E.KTM[k]) <= R.KTM_M);
    const soonest = (id, at) => { if (done[id] == null || at < done[id]) done[id] = at; };
    let longest = 0;
    trips.forEach((s, i) => {
      const away = (t) => [t.start, t.end, t.via].some((p) => p && m(p, s.start) >= R.LOOP_AWAY_M);
      const from = ktmAt(s.start);
      // Every trip it goes on to, and whether it's been somewhere well away on the way.
      const seen = new Set();
      const todo = [[i, away(s)]];
      while (todo.length) {
        const [j, far] = todo.pop();
        const key = `${j}:${far}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const t = trips[j];
        const at = Math.max(s.at, t.at);
        const ms = t.endedAt - s.startedAt;
        if (ms > longest) longest = ms;
        if (ms >= R.LONG_MS) soonest('long', at);
        if (far && m(t.end, s.start) <= R.LOOP_M) soonest('loop', at);
        const to = ktmAt(t.end);
        if (from && to && from !== to) soonest('ktm', at);
        for (const u of next[j]) todo.push([trips.indexOf(u), far || away(u)]);
      }
    });
    have.long = [Math.min(longest, R.LONG_MS), R.LONG_MS];
    for (const id of ['loop', 'ktm']) have[id] = [done[id] != null ? 1 : 0, 1];

    // The latest trip that can still be handed on.
    const last = trips.reduce((a, t) => (!a || t.endedAt > a.endedAt ? t : a), null);
    const handoff = last && Date.now() - last.endedAt <= HANDOFF_GAP_MS ? last : null;
    return { done, have, longest, rides, handoff };
  }

  // The feats the team's done since you joined, made yours.
  function award(team, folded) {
    const me = mine();
    const member = team.members?.find((x) => x.id === me?.member.id);
    if (!member || member.left || !window.Eggs) return;
    const have = new Set(window.Eggs.feats());
    for (const id of window.Eggs.all) {
      const at = folded.done[id];
      if (at != null && at >= member.joinedAt && !have.has(id)) window.Eggs.feat(id, { team: team.name });
    }
  }

  // ---------- fetching ----------

  // One at a time. Asked for while one's going, another goes once it's done, and the asker waits
  // for that one: what's changed since (a ride just queued, the signal back) is in it.
  let busy = null;
  let queued = null;
  function refresh() {
    if (busy) return (queued ??= busy.then(() => { queued = null; return refresh(); }));
    busy = run().catch((e) => console.warn("couldn't update the team run:", e)).finally(() => { busy = null; });
    return busy;
  }
  async function run() {
    const me = mine();
    if (!me) return;
    if (!(await flush(me))) return;
    let team;
    try {
      team = await api(null, `?id=${me.id}`);
    } catch (e) {
      if (e.status === 404) gone();
      return;
    }
    if (mine()?.id !== me.id) return;
    // Left, from another tab or by the team's server: no longer in it.
    if (!team.members?.some((x) => x.id === me.member.id && !x.left)) { gone(); return; }
    put(CACHE_KEY, JSON.stringify(team));
    award(team, fold(team));
    render();
  }

  // ---------- joining, starting, leaving ----------

  function say(text) {
    const el = $('teamMsg');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  // script.js's LS is a const of the page, not on window.
  const savedName = () => { try { return (typeof LS !== 'undefined' && LS.getName()) || ''; } catch { return ''; } };
  const nameIn = () => ($('teamYou')?.value || '').trim() || savedName().trim();

  async function create() {
    const you = nameIn();
    const team = ($('teamName')?.value || '').trim();
    if (!you) { say(tr('team.needYou', 'Put in your name first, for your team to see.')); $('teamYou')?.focus(); return; }
    if (!team) { say(tr('team.needName', 'Give the team a name first.')); $('teamName')?.focus(); return; }
    await start(() => api({ action: 'create', team, name: you }), you);
  }

  async function join(code) {
    const you = nameIn();
    code = String(code || $('teamCode')?.value || '').trim().toLowerCase();
    if (!CODE_RE.test(code)) { say(tr('team.badCode', 'A team code is ten letters and numbers, such as abcde12345.')); $('teamCode')?.focus(); return; }
    if (!you) { say(tr('team.needYou', 'Put in your name first, for your team to see.')); $('teamYou')?.focus(); return; }
    await start(() => api({ action: 'join', id: code, name: you }), you);
  }

  async function start(call, you) {
    if (mine()) return;
    for (const b of ['teamCreate', 'teamJoin']) if ($(b)) $(b).disabled = true;
    say(tr('team.working', 'One moment…'));
    try {
      const got = await call();
      put(KEY, JSON.stringify({ id: got.id, name: got.name, member: { ...got.member, name: you }, joinedAt: Date.now() }));
      put(OUTBOX_KEY, null);
      say('');
      render();
      await refresh();
    } catch (e) {
      say(e.message);
    } finally {
      for (const b of ['teamCreate', 'teamJoin']) if ($(b)) $(b).disabled = false;
    }
  }

  async function leave() {
    const me = mine();
    if (!me || !confirm(tr('team.leaveConfirm', 'Leave {team}? The feats you’ve had from it stay yours.', { team: me.name }))) return;
    try {
      await api({ action: 'leave', id: me.id, member: me.member.id, secret: me.member.secret });
    } catch (e) {
      if (e.status !== 404) { say(e.message); return; }
    }
    put(KEY, null);
    put(OUTBOX_KEY, null);
    put(CACHE_KEY, null);
    say(tr('team.left', 'You’ve left {team}.', { team: me.name }));
    render();
  }

  const inviteUrl = (id) => `${location.origin}/#team/${id}`;
  async function invite() {
    const me = mine();
    if (!me) return;
    const url = inviteUrl(me.id);
    const text = tr('team.inviteText', 'Join my team run, {team}, in SG Bus Timings, to speedrun the feats together. Team code: {code}', { team: me.name, code: me.id });
    if (navigator.share) {
      try { await navigator.share({ text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      say(tr('team.copied', 'Invite copied. Send it to your team.'));
    } catch {
      say(url);
    }
  }

  // A #team/<code> link opened: Achievements, with the code to join by, or the team if you're in it.
  function fromLink(code) {
    code = String(code || '').toLowerCase();
    window.openSettings?.('achievements');
    setTimeout(() => {
      const me = mine();
      render();
      if (me?.id === code) { refresh(); $('teamIn')?.scrollIntoView({ block: 'center' }); return; }
      if (me) { say(tr('team.inAnother', 'You’re in {team} already. Leave it to join another.', { team: me.name })); return; }
      if ($('teamCode')) $('teamCode').value = code;
      say(tr('team.joinAsk', 'Put in your name and tap Join to join this team run.'));
      $('teamCode')?.scrollIntoView({ block: 'center' });
    }, 300);
  }

  // ---------- Achievements' Team run ----------

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const hm = (ms) => {
    const mins = Math.floor(ms / 60000);
    return tr('team.hm', '{h} h {m} min', { h: Math.floor(mins / 60), m: mins % 60 });
  };

  function render() {
    const me = mine();
    if (!$('teamOut')) return;
    $('teamOut').hidden = !!me;
    $('teamIn').hidden = !me;
    if (!me) {
      if ($('teamYou') && !$('teamYou').value) $('teamYou').value = savedName();
      return;
    }
    const team = cached();
    // The same team in the Telegram bot (telegram-bot/src/teams.py).
    if ($('teamTelegram')) $('teamTelegram').href = `https://t.me/sgbus_app?start=team_${me.id}`;
    $('teamHead').innerHTML = `<strong>${esc(me.name)}</strong> · ${esc(tr('team.codeIs', 'Code {code}', { code: me.id }))}`;
    if (!team || !window.Eggs) {
      $('teamMembers').textContent = me.member.name;
      $('teamSummary').textContent = tr('team.loading', 'Getting the team’s progress…');
      $('teamList').innerHTML = '';
      $('teamHandoff').hidden = true;
      return;
    }
    const f = fold(team);
    const names = team.members.filter((x) => !x.left).map((x) => (x.id === me.member.id ? tr('team.you', '{name} (you)', { name: x.name }) : x.name));
    $('teamMembers').textContent = tr('team.members', 'In the team: {names}', { names: names.join(', ') });
    const doneCount = window.Eggs.all.filter((id) => f.done[id] != null).length;
    $('teamSummary').textContent = tr('team.summary', 'The team: {n} of {all} feats done, {rides} rides between you', { n: doneCount, all: window.Eggs.all.length, rides: f.rides });
    $('teamList').innerHTML = window.Eggs.all.map((id) => {
      const done = f.done[id] != null;
      const [have, need] = f.have[id] || [0, 1];
      const state = done ? tr('achievements.done', 'Done')
        : id === 'long' ? (have ? hm(have) : tr('achievements.notYet', 'Not yet'))
        : need > 1 ? tr('achievements.of', '{have} of {need}', { have, need }) : tr('achievements.notYet', 'Not yet');
      const pct = Math.round((done ? 1 : have / need) * 100);
      return `<li class="achievement${done ? ' done' : ''}">` +
        `<div class="achievementHead"><strong>${esc(window.Eggs.name(id))}</strong><span class="achievementState">${esc(state)}</span></div>` +
        (done ? '' : `<p class="achievementHow">${esc(window.Eggs.goal(id))}</p>`) +
        `<div class="achievementBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(window.Eggs.name(id))}"><span style="width:${pct}%"></span></div>` +
        `</li>`;
    }).join('');
    const h = f.handoff;
    $('teamHandoff').hidden = !h;
    if (h) {
      const who = team.members.find((x) => x.id === h.by)?.name || '?';
      const left = Math.max(0, Math.ceil((h.endedAt + HANDOFF_GAP_MS - Date.now()) / 60000));
      $('teamHandoffText').textContent = h.by === me.member.id
        ? tr('team.handoffYours', 'Your trip ended {m} min ago. A teammate can carry it on from where you got to, for {left} min more.', { m: Math.round((Date.now() - h.endedAt) / 60000), left })
        : tr('team.handoff', '{name}’s trip ended {m} min ago. Carry it on from where they got to within {left} min, and it counts as the one trip.', { name: who, m: Math.round((Date.now() - h.endedAt) / 60000), left });
      $('teamContinue').hidden = h.by === me.member.id;
      $('teamContinue').dataset.at = JSON.stringify({ lat: h.end[0], lng: h.end[1], label: tr('team.handoffPlace', 'Where {name} got to', { name: who }) });
    }
  }

  function init() {
    $('teamCreate')?.addEventListener('click', create);
    $('teamJoin')?.addEventListener('click', () => join());
    $('teamLeave')?.addEventListener('click', leave);
    $('teamInvite')?.addEventListener('click', invite);
    $('teamCode')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    $('teamContinue')?.addEventListener('click', () => {
      let at = null;
      try { at = JSON.parse($('teamContinue').dataset.at || 'null'); } catch { /* none */ }
      if (!at) return;
      window.closeModal?.('settingsModal');
      setTimeout(() => window.openNavAt?.(at, null), 50);
    });
    const shown = () => { render(); refresh(); };
    document.querySelector('[data-settings-open="achievements"]')?.addEventListener('click', shown);
    document.getElementById('coinAchievements')?.addEventListener('click', shown);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && mine()) refresh(); });
    setInterval(() => { if (document.visibilityState === 'visible' && mine()) refresh(); }, REFRESH_MS);
    render();
    if (mine()) setTimeout(refresh, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

  window.Team = { ride, tripDone, refresh, fromLink, fold, mine, RULES };
})();
