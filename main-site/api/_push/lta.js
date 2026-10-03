// LTA DataMall: the two feeds Service Alerts watches, and where the buses are for the Get
// Off Alert.

const BASE = 'https://datamall2.mytransport.sg/ltaodataservice';

async function get(path, accountKey) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { AccountKey: accountKey, accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`LTA ${path} replied ${res.status}`);
  return res.json();
}

// Where each of a service's next three buses to a stop is, for the Get Off Alert. Only the
// ones LTA is tracking: an untracked bus's estimate comes from the timetable, with no place.
export async function fetchBusPositions(accountKey, stop, service) {
  const data = await get(`/v3/BusArrival?BusStopCode=${encodeURIComponent(stop)}&ServiceNo=${encodeURIComponent(service)}`, accountKey);
  const svc = (data?.Services ?? []).find((s) => String(s.ServiceNo) === String(service));
  return [svc?.NextBus, svc?.NextBus2, svc?.NextBus3]
    .filter((b) => b && String(b.Monitored) === '1')
    .map((b) => ({ lat: parseFloat(b.Latitude), lng: parseFloat(b.Longitude) }))
    .filter((b) => b.lat && b.lng);
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
