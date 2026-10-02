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
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
    82: "Violent rain showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm",
    96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
  };
  const wmoText = (code) => WMO_TEXT[code] || "Not reported";
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
    if (v <= 50) return ["Good", "ok"];
    if (v <= 100) return ["Moderate", "warn"];
    if (v <= 200) return ["Unhealthy", "error"];
    if (v <= 300) return ["Very unhealthy", "error"];
    return ["Hazardous", "error"];
  }
  function pm25Band(v) {
    if (v <= 55) return ["Normal", "ok"];
    if (v <= 150) return ["Elevated", "warn"];
    if (v <= 250) return ["High", "error"];
    return ["Very high", "error"];
  }

  const span = (r, unit = "") => (!r ? "" : r.min === r.max ? `${r.min}${unit}` : `${r.min} - ${r.max}${unit}`);
  const round = (v) => (v == null ? "n/a" : Math.round(v));
  const time = (iso) => (iso && iso.includes("T") ? iso.split("T")[1].slice(0, 5) : "");
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
          if (!data) $("#weatherBtnText").textContent = "Weather";
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
    $("#weatherBtnText").textContent = parts.join(", ") || "Weather";
    const btnIcon = $("#weatherBtn [data-icon]");
    btnIcon.setAttribute("data-icon", wmoIcon(data.now?.code ?? data.today?.code));
    window.hydrateIcons($("#weatherBtn"));
    $("#weatherBtn").setAttribute("aria-label", `Today's weather: ${$("#weatherBtnText").textContent}`);
  }

  function renderModal() {
    const body = $("#weatherBody");
    if (!data) {
      body.innerHTML = `<p class="plannerStatus">Loading today's weather&hellip;</p>`;
      return;
    }
    const n = data.now;
    const t = data.today;
    let html = "";

    if (n) {
      html += `<div class="wxNow">${ico(wmoIcon(n.code))}<div><div class="wxTemp">${round(n.temp)} °C</div>` +
        `<div class="wxSky">${esc(wmoText(n.code))}, central Singapore</div></div></div>`;
    }
    if (t) {
      html += `<p class="wxSummary">Today runs ${round(t.min)} to ${round(t.max)} °C` +
        (data.temp ? ` (${span(data.temp, " °C")} across the island)` : "") + "." +
        (t.rainChance ? ` Rain chance peaks at ${t.rainChance}%.` : "") + `</p>`;
    }
    if (n || t) {
      const fields = [];
      if (n) {
        fields.push(["Feels like", `${round(n.feels)} °C`], ["Humidity", `${round(n.humidity)}%`],
          ["Wind", `${round(n.wind)} km/h${n.windDir != null ? ` ${compass(n.windDir)}` : ""}`], ["Gusts", `${round(n.gusts)} km/h`],
          ["Pressure", `${round(n.pressure)} hPa`], ["Cloud cover", `${round(n.cloud)}%`]);
      }
      if (t) {
        fields.push(["Rain today", `${(t.rain ?? 0).toFixed(1)} mm`], ["Strongest wind", `${round(t.windMax)} km/h`]);
        if (t.sunrise && t.sunset) fields.push(["Sun", `${time(t.sunrise)} to ${time(t.sunset)}`]);
      }
      html += `<dl class="wxFields">${fields.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
    }

    if (data.hours?.length) {
      html += `<h3 class="alertsHead">${ico("clock")} Next hours</h3><div class="wxHours">` +
        data.hours.map((h) => `<div class="wxHour"><span class="wxHourTime">${esc(time(h.time))}</span>${ico(wmoIcon(h.code))}` +
          `<span>${round(h.temp)}°</span><span class="wxPop">${h.pop != null ? `${h.pop}%` : ""}</span></div>`).join("") + `</div>`;
    }

    if (data.nowcast?.length) {
      const peak = Math.max(...data.nowcast.map((p) => p.mm || 0));
      html += `<h3 class="alertsHead">${ico("rain")} Rain, next two hours</h3>` +
        `<p class="wxSummary">${peak === 0 ? "Dry for the next two hours." : `Up to ${peak.toFixed(2)} mm in a quarter hour.`}</p>`;
      if (peak > 0) {
        html += `<div class="wxNowcast">${data.nowcast.map((p) => `<div class="wxBar" title="${esc(time(p.time))}: ${(p.mm || 0).toFixed(2)} mm">` +
          `<span style="height:${Math.max(4, Math.round(((p.mm || 0) / peak) * 100))}%"></span><small>${esc(time(p.time))}</small></div>`).join("")}</div>`;
      }
    }

    const airRow = (label, reading, band, unit) => {
      if (!reading) return `<p class="alertsLine">${esc(label)}: not available right now.</p>`;
      const rows = Object.entries(reading.regions).map(([region, v]) => {
        const [text, tone] = band(v);
        return `<tr><td>${esc(region[0].toUpperCase() + region.slice(1))}</td><td>${v}${unit}</td><td><span class="statusDot ${tone}" aria-hidden="true"></span>${esc(text)}</td></tr>`;
      }).join("");
      return `<table class="wxAir"><caption>${esc(label)}</caption><tbody>${rows}</tbody></table>`;
    };
    html += `<h3 class="alertsHead">${ico("cloud")} Air quality</h3>` +
      airRow("PSI, 24-hour", data.psi, psiBand, "") +
      airRow("PM2.5, 1-hour (µg/m³)", data.pm25, pm25Band, "");

    const at = new Date(data.fetchedAt || Date.now()).toLocaleTimeString("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", minute: "2-digit" });
    html += `<p class="estimateNote">Forecast from Open-Meteo, air quality from NEA via data.gov.sg. Updated ${esc(at)}.</p>`;
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
