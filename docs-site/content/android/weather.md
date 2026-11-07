---
title: Weather and air quality
description: Today's temperature, PSI and PM2.5 on Glance in the Android app, and today's weather in full with a tap.
---

The button on [Glance](main-screen.md#glance), under the next bus, shows today across
Singapore at a glance:

> 23 - 30 °C, 54 - 61 PSI, 10 - 18 PM2.5

Each is a range, from the lowest region to the highest:

| On the button | What it is |
|---|---|
| **°C** | Today's low to high temperature, across the north, south, east, west and central regions. |
| **PSI** | The 24-hour Pollutant Standards Index, the one NEA uses for air quality advice. |
| **PM2.5** | The 1-hour PM2.5 reading, in µg/m³: fine particles right now. |

## Today's weather

<figure>
<img src="/screenshots/android/weather.png" alt="The Weather sheet: 25 °C, fog, central Singapore, today's range and rain chance, feels like, humidity, wind, gusts, pressure, cloud cover, rain today, strongest wind and sun, then Next hours hour by hour, and Rain, next two hours as a chart." width="412" height="892" loading="lazy">
<figcaption>Tap the button for today's weather, in a sheet that slides up.</figcaption>
</figure>

Tap the button, and drag the sheet up for the rest:

- **Right now**, in central Singapore: the temperature and the sky.
- **Today**: the low and high, and the highest chance of rain.
- **Feels like**, humidity, wind and gusts, pressure, cloud cover, rain today, the
  strongest wind, and sunrise and sunset.
- **Next hours**: the sky, temperature and chance of rain, hour by hour. Swipe it sideways.
- **Rain, next two hours**: a quarter-hour by quarter-hour chart, or "Dry for the next two
  hours."
- **Air quality**: PSI and PM2.5 for each of the five regions, with NEA's band.

| PSI (24-hour) | Band |
|---|---|
| 0 to 50 | Good |
| 51 to 100 | Moderate |
| 101 to 200 | Unhealthy |
| 201 to 300 | Very unhealthy |
| Above 300 | Hazardous |

| PM2.5 (1-hour, µg/m³) | Band |
|---|---|
| 0 to 55 | Normal |
| 56 to 150 | Elevated |
| 151 to 250 | High |
| 251 and above | Very high |

The forecast is from Open-Meteo; PSI and PM2.5 are NEA's, from data.gov.sg. It's fetched
again after ten minutes.
