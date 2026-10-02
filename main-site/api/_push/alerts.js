// Service Alerts rules for the web app's notifications. The same rules as
// telegram-bot/src/service_alerts.py (a port of sgmrt-alerts' /sub feature);
// keep the two in step.

import { createHash } from 'node:crypto';
import { lineLabel, stationName } from './mrt-stations.js';

// Train service alerts and traffic alerts are chosen separately, each one of:
// 'all': every train status change / every new traffic incident.
// 'disruptions': train updates only while a disruption is active (plus the one
// when it clears) / only the incidents that can stop or reroute a bus.
// 'off': none of that kind.
export const MODES = ['all', 'disruptions', 'off'];

// A device or chat's choice: { train, traffic }. Older ones stored one mode for both.
export function modesOf(record) {
  const fallback = MODES.includes(record?.mode) ? record.mode : 'off';
  return {
    train: MODES.includes(record?.train) ? record.train : fallback,
    traffic: MODES.includes(record?.traffic) ? record.traffic : fallback,
  };
}

// LTA incident types, lowercased, that can stop or reroute a bus.
export const BLOCKING_TYPES = new Set([
  'accident',
  'vehicle breakdown',
  'road block',
  'diversion',
  'obstacle',
  'fire',
  'plant failure',
]);

// An incident LTA drops and lists again inside this window is not announced twice.
const SEEN_FOR_MS = 6 * 60 * 60 * 1000;

const hash = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');
const EMPTY_HASH = hash([]);

export const isBlocking = (incident) => BLOCKING_TYPES.has(incident.type.trim().toLowerCase());
export const isDisrupted = (status, segments) => status > 1 || segments.length > 0;

export function trainParts(value) {
  const v = value ?? {};
  const status = Number(v.Status) || 1;
  const segments = Array.isArray(v.AffectedSegments) ? v.AffectedSegments : [];
  const notices = Array.isArray(v.Message) ? v.Message : [];
  return { status, segments, notices };
}

const incidentKey = (i) => `${i.type}|${i.message}`;

// Records the train alerts in `state` and returns the update to announce, or
// null when nothing changed. The first poll only records a baseline, so a
// restart doesn't re-announce whatever the status happens to be.
export function diffTrain(state, value) {
  const { status, segments, notices } = trainParts(value);
  const next = { status, segmentsHash: hash(segments), noticesHash: hash(notices) };
  const prev = state.train;
  if (prev && prev.status === next.status && prev.segmentsHash === next.segmentsHash && prev.noticesHash === next.noticesHash) {
    return null;
  }
  state.train = next;
  if (!prev) return null;
  // "Disruptions only" hears it if a disruption is active either side of the
  // change, so it also hears when one clears.
  const wasDisrupted = prev.status > 1 || prev.segmentsHash !== EMPTY_HASH;
  return { value, disruption: wasDisrupted || isDisrupted(status, segments) };
}

// Records the incidents in `state` and returns the ones not seen in the last
// few hours. Empty on the first poll, which only records a baseline.
export function diffTraffic(state, incidents, now = Date.now()) {
  const first = !state.traffic;
  const seen = Object.fromEntries(
    Object.entries(state.traffic?.seen ?? {}).filter(([, t]) => now - t < SEEN_FOR_MS)
  );
  const fresh = [];
  for (const incident of incidents) {
    const key = incidentKey(incident);
    if (!first && !(key in seen)) fresh.push(incident);
    seen[key] = now;
  }
  state.traffic = { seen };
  return fresh;
}

// What one device hears of this poll, given its { train, traffic } modes.
export function updateFor(modes, trainUpdate, newIncidents) {
  const train =
    trainUpdate && (modes.train === 'all' || (modes.train === 'disruptions' && trainUpdate.disruption)) ? trainUpdate : null;
  const incidents =
    modes.traffic === 'all' ? newIncidents : modes.traffic === 'disruptions' ? newIncidents.filter(isBlocking) : [];
  return { train, incidents };
}

// ---------- notification text ----------
// A notification has a title and a few lines of body, so this says what
// happened in a sentence and leaves the detail to the app's Service Alerts card.

const split = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

function stationRange(codes) {
  const names = codes.map((c) => stationName(c) ?? c);
  if (names.length <= 2) return names.join(' and ');
  return `${names[0]} and ${names[names.length - 1]}`;
}

function trainSentence(value) {
  const { status, segments, notices } = trainParts(value);
  if (!isDisrupted(status, segments)) {
    return notices.length
      ? `Trains running normally. ${String(notices[0].Content ?? '').trim()}`
      : 'All train services are running normally again.';
  }
  return segments
    .map((seg) => {
      const stations = split(seg.Stations);
      const where = stations.length ? ` between ${stationRange(stations)}` : '';
      const bus = split(seg.FreePublicBus).length ? ', free buses running' : '';
      return `${lineLabel(seg.Line ?? '?')} disrupted${where}${bus}.`;
    })
    .join(' ');
}

export function notificationFor(train, incidents) {
  const parts = [];
  if (train) parts.push(trainSentence(train.value));
  if (incidents.length) {
    parts.push(incidents[0].message);
    if (incidents.length > 1) parts.push(`And ${incidents.length - 1} more traffic incident${incidents.length > 2 ? 's' : ''}.`);
  }

  let title = 'Service Alerts';
  if (train && !incidents.length) {
    const { status, segments } = trainParts(train.value);
    title = isDisrupted(status, segments) ? 'Train disruption' : 'Train service update';
  } else if (!train && incidents.length) {
    title = incidents.length === 1 ? `New ${incidents[0].type.toLowerCase()}` : `${incidents.length} new traffic incidents`;
  }

  return { title, body: parts.join('\n') };
}
