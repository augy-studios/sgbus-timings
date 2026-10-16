/*
 * What the watch knows: your favourite stops, as the phone's app last handed them over
 * (FavouritesListener), and the timings, fetched from the site as the phone's widget fetches
 * them. For the tile (TimingsTile) and the watch's screen (MainActivity).
 */
package org.uwuapps.sgbus.wear;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.DataItem;
import com.google.android.gms.wearable.DataItemBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

final class Store {
    static final String SITE = "https://sgbus.uwuapps.org";
    static final String PATH = "/favourites";
    private static final String PREFS = "store";
    private static final String FAVOURITES = "favourites";
    private static final int TIMEOUT_MS = 10000;

    private Store() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // [{ code, name, lat, lng }], as the phone sent them.
    static JSONArray favourites(Context c) {
        try {
            return new JSONArray(prefs(c).getString(FAVOURITES, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static void setFavourites(Context c, String json) {
        try {
            new JSONArray(json);
            prefs(c).edit().putString(FAVOURITES, json).apply();
        } catch (JSONException ignored) {
            // Not a list: the last stays.
        }
    }

    // None yet, as on a watch the phone's app hasn't talked to since it was installed: asks
    // the Data Layer for what the phone last put there. Off the main thread.
    static void pullFavourites(Context c) {
        try {
            DataItemBuffer items = Tasks.await(Wearable.getDataClient(c).getDataItems(), 5, TimeUnit.SECONDS);
            try {
                for (DataItem item : items) {
                    if (PATH.equals(item.getUri().getPath())) {
                        String stops = DataMapItem.fromDataItem(item).getDataMap().getString("stops");
                        if (stops != null) setFavourites(c, stops);
                    }
                }
            } finally {
                items.release();
            }
        } catch (Exception ignored) {
            // No phone, or not yet: none.
        }
    }

    static boolean canLocate(Context c) {
        return ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    // Where the watch (or the phone it's with) last was, or null. Off the main thread.
    @SuppressLint("MissingPermission") // canLocate() is checked first
    static Location where(Context c) {
        if (!canLocate(c)) return null;
        try {
            return Tasks.await(LocationServices.getFusedLocationProviderClient(c).getLastLocation(), 5, TimeUnit.SECONDS);
        } catch (Exception e) {
            return null;
        }
    }

    // The favourites, nearest first when the watch knows where it is; as they are otherwise.
    static List<JSONObject> byDistance(Context c, Location here) {
        JSONArray favs = favourites(c);
        List<JSONObject> list = new ArrayList<>();
        for (int i = 0; i < favs.length(); i++) {
            JSONObject f = favs.optJSONObject(i);
            if (f != null && f.optString("code").matches("\\d{5}")) list.add(f);
        }
        if (here != null) {
            list.sort((a, b) -> Double.compare(distance(here, a), distance(here, b)));
        }
        return list;
    }

    static double distance(Location here, JSONObject stop) {
        if (!stop.has("lat") || !stop.has("lng") || stop.isNull("lat")) return Double.MAX_VALUE;
        float[] out = new float[1];
        Location.distanceBetween(here.getLatitude(), here.getLongitude(), stop.optDouble("lat"), stop.optDouble("lng"), out);
        return out[0];
    }

    // A stop's buses, soonest first: [{ service, arrivals: [when, as epoch ms] }].
    static List<Bus> timings(String code) throws IOException, JSONException {
        long now = System.currentTimeMillis();
        JSONObject res = new JSONObject(get(SITE + "/api/bus-arrivals?stop=" + code));
        JSONArray services = res.optJSONArray("services");
        List<Bus> out = new ArrayList<>();
        for (int i = 0; services != null && i < services.length(); i++) {
            JSONObject s = services.getJSONObject(i);
            List<Long> at = new ArrayList<>();
            for (String k : new String[]{"next", "next2", "next3"}) {
                JSONObject bus = s.optJSONObject(k);
                if (bus != null && !bus.isNull("eta_ms")) at.add(now + Math.max(0, bus.optLong("eta_ms")));
            }
            if (!at.isEmpty()) out.add(new Bus(s.optString("serviceNo"), at));
        }
        out.sort((a, b) -> Long.compare(a.arrivals.get(0), b.arrivals.get(0)));
        return out;
    }

    static final class Bus {
        final String service;
        final List<Long> arrivals;

        Bus(String service, List<Long> arrivals) {
            this.service = service;
            this.arrivals = arrivals;
        }
    }

    // "Arr", or minutes, from now.
    static String minutes(long at) {
        long m = (at - System.currentTimeMillis()) / 60000;
        return m <= 0 ? "Arr" : m + " min";
    }

    private static String get(String url) throws IOException {
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
}
