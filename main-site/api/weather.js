// Today's weather and air in Singapore, for the weather button and its modal.
//
// - Temperature: Open-Meteo's forecast at the five regions NEA reports air quality for
//   (north, south, east, west, central), so the button's range runs from the coolest
//   region's low to the warmest region's high. The modal's detail is the central region's.
// - PSI (24-hour) and PM2.5 (1-hour): data.gov.sg's real-time API, per region, with the
//   DATA_GOV_KEY API key (optional; it raises the rate limit).
//
// Each part is null when its source didn't answer, so one being down doesn't blank the rest.
// The fields shown follow the weather-app repo's Telegram bot (telegram-bot/weather.py).

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const PSI_URL = "https://api-open.data.gov.sg/v2/real-time/api/psi";
const PM25_URL = "https://api-open.data.gov.sg/v2/real-time/api/pm25";

// Where NEA labels its regions; data.gov.sg's regionMetadata gives the same points.
const REGIONS = {
  north: [1.41803, 103.82],
  south: [1.29587, 103.82],
  east: [1.35735, 103.94],
  west: [1.35735, 103.7],
  central: [1.35735, 103.82],
};
const REGION_NAMES = Object.keys(REGIONS);

async function json(url, headers = {}) {
  const r = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`${new URL(url).host} replied ${r.status}`);
  return r.json();
}

function range(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  return nums.length ? { min: Math.min(...nums), max: Math.max(...nums) } : null;
}

async function temperatures() {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", REGION_NAMES.map((r) => REGIONS[r][0]).join(","));
  url.searchParams.set("longitude", REGION_NAMES.map((r) => REGIONS[r][1]).join(","));
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "Asia/Singapore");
  url.searchParams.set("forecast_days", "1");
  const data = await json(url);
  const list = Array.isArray(data) ? data : [data];
  const lows = list.map((d) => d.daily?.temperature_2m_min?.[0]);
  const highs = list.map((d) => d.daily?.temperature_2m_max?.[0]);
  const low = range(lows);
  const high = range(highs);
  return low && high ? { min: Math.round(low.min), max: Math.round(high.max) } : null;
}

async function central() {
  const url = new URL(FORECAST_URL);
  const [lat, lng] = REGIONS.central;
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("timezone", "Asia/Singapore");
  url.searchParams.set("current", [
    "temperature_2m", "relative_humidity_2m", "apparent_temperature", "precipitation", "weather_code",
    "cloud_cover", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m", "surface_pressure",
  ].join(","));
  url.searchParams.set("hourly", "temperature_2m,precipitation_probability,weather_code");
  url.searchParams.set("daily", [
    "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "precipitation_probability_max", "wind_speed_10m_max", "sunrise", "sunset",
  ].join(","));
  url.searchParams.set("minutely_15", "precipitation");
  url.searchParams.set("forecast_days", "2");
  const d = await json(url);

  const c = d.current || {};
  const nowHour = (c.time || "").slice(0, 13);
  const hourly = d.hourly || {};
  const start = Math.max(0, (hourly.time || []).findIndex((t) => t.slice(0, 13) >= nowHour));
  const hours = (hourly.time || []).slice(start, start + 12).map((time, k) => ({
    time,
    temp: hourly.temperature_2m?.[start + k],
    code: hourly.weather_code?.[start + k],
    pop: hourly.precipitation_probability?.[start + k],
  }));

  const m = d.minutely_15 || {};
  const nowMinute = (c.time || "").slice(0, 16);
  const from = Math.max(0, (m.time || []).findIndex((t) => t >= nowMinute));
  const nowcast = (m.time || []).slice(from, from + 8).map((time, k) => ({ time, mm: m.precipitation?.[from + k] ?? 0 }));

  const daily = d.daily || {};
  const first = (key) => daily[key]?.[0] ?? null;
  return {
    now: {
      time: c.time,
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      code: c.weather_code,
      humidity: c.relative_humidity_2m,
      wind: c.wind_speed_10m,
      windDir: c.wind_direction_10m,
      gusts: c.wind_gusts_10m,
      pressure: c.surface_pressure,
      cloud: c.cloud_cover,
    },
    today: {
      code: first("weather_code"),
      min: first("temperature_2m_min"),
      max: first("temperature_2m_max"),
      rain: first("precipitation_sum"),
      rainChance: first("precipitation_probability_max"),
      windMax: first("wind_speed_10m_max"),
      sunrise: first("sunrise"),
      sunset: first("sunset"),
    },
    hours,
    nowcast,
  };
}

// The latest reading of one field, per region, from a data.gov.sg air quality response.
async function air(url, field) {
  const key = process.env.DATA_GOV_KEY;
  const data = await json(url, key ? { "x-api-key": key } : {});
  const item = data?.data?.items?.[0];
  const readings = item?.readings?.[field] || {};
  const regions = Object.fromEntries(REGION_NAMES.filter((r) => Number.isFinite(readings[r])).map((r) => [r, readings[r]]));
  const span = range(Object.values(regions));
  return span ? { ...span, regions, timestamp: item?.timestamp || null } : null;
}

export default async function handler(req, res) {
  const [temp, detail, psi, pm25] = await Promise.allSettled([
    temperatures(),
    central(),
    air(PSI_URL, "psi_twenty_four_hourly"),
    air(PM25_URL, "pm25_one_hourly"),
  ]);
  const value = (r, name) => {
    if (r.status === "fulfilled") return r.value;
    console.error(`weather: ${name} failed:`, r.reason?.message ?? r.reason);
    return null;
  };
  const body = {
    temp: value(temp, "temperature"),
    psi: value(psi, "PSI"),
    pm25: value(pm25, "PM2.5"),
    ...(value(detail, "forecast") || { now: null, today: null, hours: [], nowcast: [] }),
    fetchedAt: Date.now(),
  };
  if (!body.temp && !body.psi && !body.pm25 && !body.now) return res.status(502).json({ error: "Couldn't reach the weather services" });
  // Open-Meteo updates every 15 minutes and the air readings hourly.
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
  return res.status(200).json(body);
}
