// Team runs (Augy, 4 November 2026): the feats done as a team, kept in Supabase's team_runs,
// team_members and team_events tables (migrations/0003_team_runs.sql, SHARE-LINKS-SETUP.md).
//
// A team is made with a name, and anyone with its code (ten letters and digits, the same shape
// as a share link's id) joins with theirs, up to MAX_MEMBERS at once. Each member is given a
// secret, kept here only as a hash, that their phone sends with what it adds.
//
// What a phone adds (team_events): each ride judged real on it (js/rides.js), as
//   { mode: 'bus' | 'train', line, bus, first: ['01012'], end: 'EW33' }
// and each trip it arrived at with a real ride on it (js/eggs.js, tripDone), as
//   { start: [lat, lng], end: [lat, lng], via: [lat, lng] | null, startedAt, endedAt }.
// The feats are worked out from these by every member's phone (js/team.js), the same way on
// each, so there's nothing here to keep in step: rides only add, and trips handed on from one
// member to another are put together there.
//
// A team goes TEAM_TTL_MS after its last ride or trip. Used by api/team.js.

import { createHash, randomBytes } from 'node:crypto';
import { rest } from './supabase.js';

export const MAX_MEMBERS = 8;
export const MAX_EVENTS = 50; // in one request
export const TEAM_TTL_MS = 14 * 24 * 3600 * 1000;
const NAME_MAX = 30;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_RE = /^[a-z0-9]{10}$/;
const EID_RE = /^[a-z0-9-]{8,40}$/;
// As js/rides.js and js/eggs.js have them.
export const LINES = ['NS', 'EW', 'NE', 'CC', 'DT', 'TE', 'BP', 'SK', 'PG'];
export const FIRST_LAST = ['01012', '99189'];
export const ENDS = ['EW33', 'TE1', 'NE18', 'CG2'];
const BUS_RE = /^\d{1,3}[A-Z]{0,2}$/;
// A trip that took longer than this, or one from further back, isn't one.
const TRIP_MAX_MS = 24 * 3600 * 1000;
const TRIP_BACK_MS = 30 * 24 * 3600 * 1000;
const CLOCK_SLACK_MS = 10 * 60 * 1000;

export class ValidationError extends Error {}

export const isTeamId = (id) => typeof id === 'string' && ID_RE.test(id);
const newId = () => Array.from(randomBytes(10), (b) => ID_CHARS[b % ID_CHARS.length]).join('');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const iso = (ms) => new Date(ms).toISOString();

// ---------- checking what's sent ----------

export function parseName(v) {
  if (typeof v !== 'string') throw new ValidationError('bad name');
  const name = v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!name) throw new ValidationError('missing name');
  return name;
}

// Singapore, with some sea around it.
function point(p) {
  if (!Array.isArray(p) || p.length !== 2) throw new ValidationError('bad place');
  const [lat, lng] = p;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 1.1 || lat > 1.5 || lng < 103.5 || lng > 104.2) {
    throw new ValidationError('a place outside Singapore');
  }
  return [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5];
}

function ride(d) {
  if (d.mode !== 'bus' && d.mode !== 'train') throw new ValidationError('bad ride');
  const line = d.mode === 'train' && LINES.includes(d.line) ? d.line : '';
  const bus = d.mode === 'bus' && typeof d.bus === 'string' && BUS_RE.test(d.bus) ? d.bus : '';
  const first = Array.isArray(d.first) ? FIRST_LAST.filter((c) => d.first.includes(c)) : [];
  const end = d.mode === 'train' && ENDS.includes(d.end) ? d.end : '';
  return { mode: d.mode, line, bus, first, end };
}

function trip(d, now) {
  const startedAt = Number(d.startedAt);
  const endedAt = Number(d.endedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) throw new ValidationError('bad trip times');
  if (endedAt - startedAt > TRIP_MAX_MS || endedAt > now + CLOCK_SLACK_MS || startedAt < now - TRIP_BACK_MS) throw new ValidationError('bad trip times');
  return { start: point(d.start), end: point(d.end), via: d.via == null ? null : point(d.via), startedAt: Math.round(startedAt), endedAt: Math.round(endedAt) };
}

// One of what a phone adds: { eid, kind, data }, checked, or a ValidationError.
export function parseEvent(e, now = Date.now()) {
  if (!e || typeof e !== 'object' || typeof e.eid !== 'string' || !EID_RE.test(e.eid)) throw new ValidationError('bad event');
  const d = e.data && typeof e.data === 'object' ? e.data : null;
  if (!d) throw new ValidationError('bad event');
  if (e.kind === 'ride') return { eid: e.eid, kind: 'ride', data: ride(d) };
  if (e.kind === 'trip') return { eid: e.eid, kind: 'trip', data: trip(d, now) };
  throw new ValidationError('bad event');
}

export function parseEvents(list, now = Date.now()) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_EVENTS) throw new ValidationError('bad events');
  return list.map((e) => parseEvent(e, now));
}

// ---------- kept in Supabase ----------

async function addMember(teamId, name) {
  const id = newId();
  const secret = randomBytes(18).toString('base64url');
  await rest('team_members', { method: 'POST', body: { team_id: teamId, member_id: id, name, secret_hash: sha256(secret) }, prefer: 'return=minimal' });
  return { id, secret };
}

// A new team, with its first member: { id, name, member: { id, secret } }.
export async function createTeam(teamName, memberName, now = Date.now()) {
  // Teams gone by now, put away as new ones come.
  await rest(`team_runs?expires_at=lt.${iso(now)}`, { method: 'DELETE', prefer: 'return=minimal' }).catch((err) => console.warn(err));
  for (let tries = 0; ; tries++) {
    const id = newId();
    try {
      await rest('team_runs', { method: 'POST', body: { id, name: teamName, expires_at: iso(now + TEAM_TTL_MS) }, prefer: 'return=minimal' });
      return { id, name: teamName, member: await addMember(id, memberName) };
    } catch (err) {
      if (err.code !== '23505' || tries >= 3) throw err; // an id taken: another
    }
  }
}

async function liveTeam(id, now) {
  const rows = await rest(`team_runs?id=eq.${id}&expires_at=gt.${iso(now)}&select=id,name,created_at,expires_at&limit=1`);
  return rows?.[0] || null;
}

const activeMembers = (id) => rest(`team_members?team_id=eq.${id}&left_at=is.null&select=member_id`);

// Joining a team by its code: { name, member: { id, secret } }, null if it's gone, or 'full'.
export async function joinTeam(id, memberName, now = Date.now()) {
  const team = await liveTeam(id, now);
  if (!team) return null;
  if (((await activeMembers(id)) || []).length >= MAX_MEMBERS) return 'full';
  return { name: team.name, member: await addMember(id, memberName) };
}

// Whether `memberId` with `secret` is in the team still.
async function isMember(id, memberId, secret) {
  if (!ID_RE.test(String(memberId)) || typeof secret !== 'string' || !secret) return false;
  const rows = await rest(`team_members?team_id=eq.${id}&member_id=eq.${memberId}&secret_hash=eq.${sha256(secret)}&left_at=is.null&select=member_id&limit=1`);
  return !!rows?.length;
}

// A member's rides and trips added, each once however often it's sent. False if they aren't in
// the team, or it's gone.
export async function addEvents(id, memberId, secret, events, now = Date.now()) {
  if (!(await liveTeam(id, now)) || !(await isMember(id, memberId, secret))) return false;
  await rest('team_events?on_conflict=team_id,eid', {
    method: 'POST',
    body: events.map((e) => ({ team_id: id, member_id: memberId, eid: e.eid, kind: e.kind, data: e.data })),
    prefer: 'resolution=ignore-duplicates,return=minimal',
  });
  await rest(`team_runs?id=eq.${id}`, { method: 'PATCH', body: { updated_at: iso(now), expires_at: iso(now + TEAM_TTL_MS) }, prefer: 'return=minimal' });
  return true;
}

export async function leaveTeam(id, memberId, secret, now = Date.now()) {
  if (!(await isMember(id, memberId, secret))) return false;
  await rest(`team_members?team_id=eq.${id}&member_id=eq.${memberId}`, { method: 'PATCH', body: { left_at: iso(now) }, prefer: 'return=minimal' });
  return true;
}

// What a team has: { id, name, createdAt, expiresAt, members: [{ id, name, joinedAt, left }],
// events: [{ eid, member, kind, data, at }] }, or null if it's gone. Everyone with the code can
// read it; only members write.
export async function getTeam(id, now = Date.now()) {
  const team = await liveTeam(id, now);
  if (!team) return null;
  const [members, events] = await Promise.all([
    rest(`team_members?team_id=eq.${id}&select=member_id,name,joined_at,left_at&order=joined_at.asc`),
    rest(`team_events?team_id=eq.${id}&select=eid,member_id,kind,data,created_at&order=id.asc&limit=5000`),
  ]);
  return {
    id,
    name: team.name,
    createdAt: Date.parse(team.created_at),
    expiresAt: Date.parse(team.expires_at),
    members: (members || []).map((m) => ({ id: m.member_id, name: m.name, joinedAt: Date.parse(m.joined_at), left: !!m.left_at })),
    events: (events || []).map((e) => ({ eid: e.eid, member: e.member_id, kind: e.kind, data: e.data, at: Date.parse(e.created_at) })),
  };
}
