/*
 * What the Bus timings widget keeps (TimingsWidget.java): each widget's stop and buses, the
 * timings last fetched for it, and the favourite stops the page hands over for the widget's
 * setup (SgBusPlugin.setFavourites). In the app's own preferences, not the page's storage,
 * which a widget can't reach.
 *
 * Timings come from the site's /api/bus-arrivals, as the page and the Windows widget get them.
 */
package org.uwuapps.sgbus;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class WidgetStore {
    private static final String PREFS = "widgets";
    private static final String FAVOURITES = "favourites";
    private static final int TIMEOUT_MS = 10000;
    // More than a home screen can show, however big the widget.
    static final int MAX_ROWS = 30;

    private WidgetStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------- a widget's stop: { code, name, buses: [] } ----------

    static JSONObject config(Context c, int id) {
        try {
            String s = prefs(c).getString("config." + id, null);
            return s == null ? null : new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    static void setConfig(Context c, int id, String code, String name, List<String> buses) {
        try {
            JSONObject o = new JSONObject().put("code", code).put("name", name == null ? "" : name).put("buses", new JSONArray(buses));
            prefs(c).edit().putString("config." + id, o.toString()).remove("data." + id).apply();
        } catch (JSONException ignored) {
            // Can't happen with these values.
        }
    }

    static void forget(Context c, int id) {
        prefs(c).edit().remove("config." + id).remove("data." + id).apply();
    }

    // ---------- its timings: { at, rows: [{ service, arrivals: [ms, ...] }], error } ----------

    static JSONObject data(Context c, int id) {
        try {
            String s = prefs(c).getString("data." + id, null);
            return s == null ? null : new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    // Fetches the stop's timings and keeps them, each bus's next three as when they're due, so
    // the widget can say "in 4 min" from them whenever it's drawn.
    static void refresh(Context c, int id) {
        JSONObject config = config(c, id);
        if (config == null) return;
        JSONObject out = new JSONObject();
        long now = System.currentTimeMillis();
        try {
            out.put("at", now);
            JSONArray buses = config.optJSONArray("buses");
            List<String> wanted = new ArrayList<>();
            for (int i = 0; buses != null && i < buses.length(); i++) wanted.add(buses.optString(i).toUpperCase());
            String code = config.optString("code");
            JSONObject res = new JSONObject(get(MainActivity.SITE + "/api/bus-arrivals?stop=" + URLEncoder.encode(code, "UTF-8")));
            JSONArray services = res.optJSONArray("services");
            JSONArray rows = new JSONArray();
            for (int i = 0; services != null && i < services.length() && rows.length() < MAX_ROWS; i++) {
                JSONObject s = services.getJSONObject(i);
                String no = s.optString("serviceNo");
                if (!wanted.isEmpty() && !wanted.contains(no.toUpperCase())) continue;
                JSONArray arrivals = new JSONArray();
                for (String k : new String[] {"next", "next2", "next3"}) {
                    JSONObject bus = s.optJSONObject(k);
                    if (bus != null && !bus.isNull("eta_ms")) arrivals.put(now + bus.optLong("eta_ms"));
                }
                rows.put(new JSONObject().put("service", no).put("arrivals", arrivals));
            }
            out.put("rows", rows);
        } catch (IOException | JSONException e) {
            try {
                // Offline or LTA down: the last timings stay, with the error over them.
                JSONObject last = data(c, id);
                if (last != null) out = last;
                out.put("error", true);
            } catch (JSONException ignored) {
                // Nothing to keep.
            }
        }
        prefs(c).edit().putString("data." + id, out.toString()).apply();
    }

    static String get(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("Accept", "application/json");
        try {
            if (conn.getResponseCode() != 200) throw new IOException("HTTP " + conn.getResponseCode());
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                return buf.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            conn.disconnect();
        }
    }

    // ---------- the favourite stops, from the page: [{ code, name }] ----------

    static void setFavourites(Context c, JSONArray stops) {
        prefs(c).edit().putString(FAVOURITES, stops.toString()).apply();
        // And to the watch, for its tile (2.1.0).
        WearSync.send(c, stops);
    }

    static JSONArray favourites(Context c) {
        try {
            return new JSONArray(prefs(c).getString(FAVOURITES, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
