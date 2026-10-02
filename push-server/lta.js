// LTA DataMall: the two feeds Service Alerts watches.

const BASE = 'https://datamall2.mytransport.sg/ltaodataservice';

async function get(path, accountKey) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { AccountKey: accountKey, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`LTA ${path} replied ${res.status}`);
  return res.json();
}

// TrainServiceAlerts as it comes: { Status, AffectedSegments, Message }.
export async function fetchTrainAlerts(accountKey) {
  const data = await get('/TrainServiceAlerts', accountKey);
  const value = data?.value ?? data;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Every incident LTA reports right now. Its message already starts with when
// it was reported, e.g. "(2/10)14:32 Accident on PIE ...".
export async function fetchTrafficIncidents(accountKey) {
  const data = await get('/TrafficIncidents', accountKey);
  return (Array.isArray(data?.value) ? data.value : [])
    .map((i) => ({ type: String(i.Type || 'Incident').trim(), message: String(i.Message || '').trim() }))
    .filter((i) => i.message);
}
