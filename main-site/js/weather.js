// The weather button and its modal: today's temperature range, PSI and PM2.5 across
// Singapore on the button, and today's weather in the modal, from /api/weather. The modal
// shows what the weather-app repo's Telegram bot shows for a place: current conditions,
// today at a glance, the next hours, and the two-hour rain nowcast, plus air quality by
// region. Plain script: this project does not use ES modules, so exports go on window.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ico = (name) => `<span class="ico" aria-hidden="true">${window.icon(name)}</span>`;

  // Refetched after this long, when the page is looked at again.
  const STALE_MS = 10 * 60 * 1000;

  // WMO weather codes, as Open-Meteo reports them. The same table as weather-app.
  const WMO_TEXT = {
    0: I18n.t("weather.wmo.0", "Clear"), 1: I18n.t("weather.wmo.1", "Mainly clear"), 2: I18n.t("weather.wmo.2", "Partly cloudy"), 3: I18n.t("weather.wmo.3", "Overcast"), 45: I18n.t("weather.wmo.45", "Fog"), 48: I18n.t("weather.wmo.48", "Depositing rime fog"),
    51: I18n.t("weather.wmo.51", "Light drizzle"), 53: I18n.t("weather.wmo.53", "Drizzle"), 55: I18n.t("weather.wmo.55", "Heavy drizzle"), 56: I18n.t("weather.wmo.56", "Freezing drizzle"), 57: I18n.t("weather.wmo.57", "Freezing drizzle"),
    61: I18n.t("weather.wmo.61", "Light rain"), 63: I18n.t("weather.wmo.63", "Rain"), 65: I18n.t("weather.wmo.65", "Heavy rain"), 66: I18n.t("weather.wmo.66", "Freezing rain"), 67: I18n.t("weather.wmo.67", "Freezing rain"),
    71: I18n.t("weather.wmo.71", "Light snow"), 73: I18n.t("weather.wmo.73", "Snow"), 75: I18n.t("weather.wmo.75", "Heavy snow"), 77: I18n.t("weather.wmo.77", "Snow grains"), 80: I18n.t("weather.wmo.80", "Rain showers"), 81: I18n.t("weather.wmo.81", "Rain showers"),
    82: I18n.t("weather.wmo.82", "Violent rain showers"), 85: I18n.t("weather.wmo.85", "Snow showers"), 86: I18n.t("weather.wmo.86", "Snow showers"), 95: I18n.t("weather.wmo.95", "Thunderstorm"),
    96: I18n.t("weather.wmo.96", "Thunderstorm with hail"), 99: I18n.t("weather.wmo.99", "Thunderstorm with heavy hail"),
  };
  const wmoText = (code) => WMO_TEXT[code] || I18n.t("weather.notReported", "Not reported");
  function wmoIcon(code) {
    if (code === 0) return "sun";
    if (code === 1 || code === 2) return "cloud-sun";
    if (code === 3) return "cloud";
    if (code === 45 || code === 48) return "fog";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
    if ([95, 96, 99].includes(code)) return "storm";
    return "thermometer";
  }

  // NEA's bands: 24-hour PSI, and 1-hour PM2.5.
  function psiBand(v) {
    if (v <= 50) return [I18n.t("weather.psi.good", "Good"), "ok"];
    if (v <= 100) return [I18n.t("weather.psi.moderate", "Moderate"), "warn"];
    if (v <= 200) return [I18n.t("weather.psi.unhealthy", "Unhealthy"), "error"];
    if (v <= 300) return [I18n.t("weather.psi.veryUnhealthy", "Very unhealthy"), "error"];
    return [I18n.t("weather.psi.hazardous", "Hazardous"), "error"];
  }
  function pm25Band(v) {
    if (v <= 55) return [I18n.t("weather.pm.normal", "Normal"), "ok"];
    if (v <= 150) return [I18n.t("weather.pm.elevated", "Elevated"), "warn"];
    if (v <= 250) return [I18n.t("weather.pm.high", "High"), "error"];
    return [I18n.t("weather.pm.veryHigh", "Very high"), "error"];
  }

  const span = (r, unit = "") => (!r ? "" : r.min === r.max ? `${r.min}${unit}` : `${r.min} - ${r.max}${unit}`);
  const round = (v) => (v == null ? I18n.t("weather.na", "n/a") : Math.round(v));
  const time = (iso) => (iso && iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "");
  // NEA's regions, as data.gov.sg names them.
  const REGIONS = { north: I18n.t("weather.region.north", "North"), south: I18n.t("weather.region.south", "South"), east: I18n.t("weather.region.east", "East"), west: I18n.t("weather.region.west", "West"), central: I18n.t("weather.region.central", "Central") };
  const compass = (deg) => ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round((deg % 360) / 22.5) % 16];

  let data = null;
  let fetchedAt = 0;
  let loading = null;

  function load() {
    if (!loading) {
      loading = fetch("/api/weather", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          data = d;
          fetchedAt = Date.now();
          renderButton();
          if (!$("#weatherModal").classList.contains("hidden")) renderModal();
        })
        .catch(() => {
          if (!data) $("#weatherBtnText").textContent = I18n.t("timings.weather", "Weather");
        })
        .finally(() => (loading = null));
    }
    return loading;
  }

  // "23 - 32 °C, 72 - 94 PSI, 24 - 48 PM2.5": each a range, lowest to highest across Singapore.
  function renderButton() {
    const parts = [];
    if (data.temp) parts.push(span(data.temp, " °C"));
    if (data.psi) parts.push(`${span(data.psi)} PSI`);
    if (data.pm25) parts.push(`${span(data.pm25)} PM2.5`);
    $("#weatherBtnText").textContent = parts.join(", ") || I18n.t("timings.weather", "Weather");
    const btnIcon = $("#weatherBtn [data-icon]");
    btnIcon.setAttribute("data-icon", wmoIcon(data.now?.code ?? data.today?.code));
    window.hydrateIcons($("#weatherBtn"));
    $("#weatherBtn").setAttribute("aria-label", I18n.t("timings.todays_weather_now", "Today's weather: {now}", { now: $("#weatherBtnText").textContent }));
  }

  function renderModal() {
    const body = $("#weatherBody");
    if (!data) {
      body.innerHTML = `<p class="plannerStatus">${esc(I18n.t("weather.loading", "Loading today's weather…"))}</p>`;
      return;
    }
    const n = data.now;
    const t = data.today;
    let html = "";

    if (n) {
      html += `<div class="wxNow">${ico(wmoIcon(n.code))}<div><div class="wxTemp">${round(n.temp)} °C</div>` +
        `<div class="wxSky">${esc(I18n.t("weather.skyCentral", "{sky}, central Singapore", { sky: wmoText(n.code) }))}</div></div></div>`;
    }
    if (t) {
      html += `<p class="wxSummary">${esc(data.temp
        ? I18n.t("weather.todayRunsIsland", "Today runs {min} to {max} °C ({range} across the island).", { min: round(t.min), max: round(t.max), range: span(data.temp, " °C") })
        : I18n.t("weather.todayRuns", "Today runs {min} to {max} °C.", { min: round(t.min), max: round(t.max) }))}` +
        (t.rainChance ? ` ${esc(I18n.t("weather.rainPeaks", "Rain chance peaks at {p}%.", { p: t.rainChance }))}` : "") + `</p>`;
    }
    if (n || t) {
      const fields = [];
      if (n) {
        fields.push([I18n.t("weather.feelsLike", "Feels like"), `${round(n.feels)} °C`], [I18n.t("weather.humidity", "Humidity"), `${round(n.humidity)}%`],
          [I18n.t("weather.wind", "Wind"), `${round(n.wind)} km/h${n.windDir != null ? ` ${compass(n.windDir)}` : ""}`], [I18n.t("weather.gusts", "Gusts"), `${round(n.gusts)} km/h`],
          [I18n.t("weather.pressure", "Pressure"), `${round(n.pressure)} hPa`], [I18n.t("weather.cloud", "Cloud cover"), `${round(n.cloud)}%`]);
      }
      if (t) {
        fields.push([I18n.t("weather.rainToday", "Rain today"), `${(t.rain ?? 0).toFixed(1)} mm`], [I18n.t("weather.windMax", "Strongest wind"), `${round(t.windMax)} km/h`]);
        if (t.sunrise && t.sunset) fields.push([I18n.t("weather.sun", "Sun"), I18n.t("planner.clockRange", "{a} to {b}", { a: time(t.sunrise), b: time(t.sunset) })]);
      }
      html += `<dl class="wxFields">${fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
    }

    if (data.hours?.length) {
      html += `<h3 class="alertsHead">${ico("clock")} ${esc(I18n.t("weather.nextHours", "Next hours"))}</h3><div class="wxHours">` +
        data.hours.map((h) => `<div class="wxHour"><span class="wxHourTime">${esc(time(h.time))}</span>${ico(wmoIcon(h.code))}` +
          `<span>${round(h.temp)}°</span><span class="wxPop">${h.pop != null ? `${h.pop}%` : ""}</span></div>`).join("") + `</div>`;
    }

    if (data.nowcast?.length) {
      const peak = Math.max(...data.nowcast.map((p) => p.mm || 0));
      html += `<h3 class="alertsHead">${ico("rain")} ${esc(I18n.t("weather.rainNext", "Rain, next two hours"))}</h3>` +
        `<p class="wxSummary">${esc(peak === 0 ? I18n.t("weather.dry", "Dry for the next two hours.") : I18n.t("weather.upTo", "Up to {mm} mm in a quarter hour.", { mm: peak.toFixed(2) }))}</p>`;
      if (peak > 0) {
        html += `<div class="wxNowcast">${data.nowcast.map((p) => `<div class="wxBar" title="${esc(time(p.time))}: ${(p.mm || 0).toFixed(2)} mm">` +
          `<span style="height:${Math.max(4, Math.round(((p.mm || 0) / peak) * 100))}%"></span><small>${esc(time(p.time))}</small></div>`).join("")}</div>`;
      }
    }

    const airRow = (label, reading, band, unit) => {
      if (!reading) return `<p class="alertsLine">${esc(I18n.t("weather.notAvailable", "{what}: not available right now.", { what: label }))}</p>`;
      const rows = Object.entries(reading.regions).map(([region, v]) => {
        const [text, tone] = band(v);
        return `<tr><td>${esc(REGIONS[region] || region[0].toUpperCase() + region.slice(1))}</td><td>${v}${unit}</td><td><span class="statusDot ${tone}" aria-hidden="true"></span>${esc(text)}</td></tr>`;
      }).join("");
      return `<table class="wxAir"><caption>${esc(label)}</caption><tbody>${rows}</tbody></table>`;
    };
    html += `<h3 class="alertsHead">${ico("cloud")} ${esc(I18n.t("weather.air", "Air quality"))}</h3>` +
      airRow(I18n.t("weather.psi", "PSI, 24-hour"), data.psi, psiBand, "") +
      airRow(I18n.t("weather.pm25", "PM2.5, 1-hour (µg/m³)"), data.pm25, pm25Band, "");

    const at = new Date(data.fetchedAt || Date.now()).toLocaleTimeString(I18n.lang() === "en" ? "en-GB" : I18n.lang(), { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" });
    html += `<p class="estimateNote">${esc(I18n.t("weather.source", "Forecast from Open-Meteo, air quality from NEA via data.gov.sg. Updated {time}.", { time: at }))}</p>`;
    body.innerHTML = html;
  }

  function init() {
    $("#weatherBtn").addEventListener("click", () => {
      renderModal();
      window.openModal("weatherModal");
      if (Date.now() - fetchedAt > STALE_MS) load();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && Date.now() - fetchedAt > STALE_MS) load();
    });
    load();
  }

  init();
})();
