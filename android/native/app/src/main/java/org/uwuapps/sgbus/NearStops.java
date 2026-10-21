/*
 * Timings near a stop (RemindersPlugin.nearStops, main-site/js/reminders.js): for the favourite
 * stops you pick, a geofence around each, and as you walk up to one, a quiet notification with
 * its next buses, refreshed every minute while you're there and gone once you've left. Google
 * Play services watches the geofences, so the app needn't be open or running; it needs
 * location "all the time" for that.
 *
 * Geofences don't outlast a restart of the phone, or the app being updated: BootReceiver sets
 * them again.
 */
package org.uwuapps.sgbus;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkerParameters;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.TimeUnit;

final class NearStops {
    private static final String PREFS = "near";
    private static final String STOPS = "stops";
    private static final String INSIDE = "inside";
    static final int MAX_STOPS = 20;
    // Wide enough for a phone's location in town to be sure of, as Google suggests (100 m and up).
    private static final float RADIUS_M = 120f;
    // How often the timings are fetched again while you're there, and for how long at most,
    // should leaving go unnoticed.
    private static final long REFRESH_S = 60;
    private static final long STAY_MS = 20 * 60 * 1000;
    private static final int MAX_LINES = 6;
    private static final String WORK = "near-refresh";

    private NearStops() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // [{ code, name, lat, lng }]
    static JSONArray stops(Context c) {
        try {
            return new JSONArray(prefs(c).getString(STOPS, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static void setStops(Context c, JSONArray stops) {
        prefs(c).edit().putString(STOPS, stops.toString()).putString(INSIDE, "{}").apply();
    }

    static boolean canWatch(Context c) {
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return false;
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private static PendingIntent events(Context c) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, Receiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0));
    }

    // The geofences for the stops kept, replacing any before. Resolves at once with nothing to
    // watch; fails without location all the time.
    @SuppressWarnings("MissingPermission") // canWatch() is checked first
    static Task<Void> arm(Context c) {
        Context app = c.getApplicationContext();
        JSONArray stops = stops(app);
        Task<Void> removed = LocationServices.getGeofencingClient(app).removeGeofences(events(app));
        if (stops.length() == 0) {
            WorkManager.getInstance(app).cancelUniqueWork(WORK);
            return removed;
        }
        if (!canWatch(app)) return Tasks.forException(new SecurityException("Location all the time isn't allowed"));
        List<Geofence> fences = new ArrayList<>();
        for (int i = 0; i < stops.length() && fences.size() < MAX_STOPS; i++) {
            JSONObject s = stops.optJSONObject(i);
            if (s == null || !s.has("lat") || !s.has("lng")) continue;
            fences.add(new Geofence.Builder()
                    .setRequestId(s.optString("code"))
                    .setCircularRegion(s.optDouble("lat"), s.optDouble("lng"), RADIUS_M)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT)
                    .build());
        }
        GeofencingRequest request = new GeofencingRequest.Builder()
                // Already there as they're set: shown at once, so you can see it works.
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(fences)
                .build();
        return removed.continueWithTask(t -> LocationServices.getGeofencingClient(app).addGeofences(request, events(app)));
    }

    // ---------- where you are: { code: when you got there } ----------

    private static JSONObject inside(Context c) {
        try {
            return new JSONObject(prefs(c).getString(INSIDE, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void setInside(Context c, JSONObject inside) {
        prefs(c).edit().putString(INSIDE, inside.toString()).apply();
    }

    private static void refreshIn(Context c, long seconds) {
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(Refresh.class)
                .setInitialDelay(seconds, TimeUnit.SECONDS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(c).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, work);
    }

    private static String tag(String code) {
        return "near:" + code;
    }

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            GeofencingEvent event = GeofencingEvent.fromIntent(intent);
            if (event == null || event.hasError() || event.getTriggeringGeofences() == null) return;
            int transition = event.getGeofenceTransition();
            JSONObject inside = inside(context);
            try {
                for (Geofence fence : event.getTriggeringGeofences()) {
                    String code = fence.getRequestId();
                    if (transition == Geofence.GEOFENCE_TRANSITION_ENTER) {
                        inside.put(code, System.currentTimeMillis());
                    } else if (transition == Geofence.GEOFENCE_TRANSITION_EXIT) {
                        inside.remove(code);
                        Notifications.cancel(context, tag(code));
                    }
                }
            } catch (JSONException ignored) {
                // Can't happen with these values.
            }
            setInside(context, inside);
            if (inside.length() > 0) refreshIn(context, 0);
            else WorkManager.getInstance(context).cancelUniqueWork(WORK);
        }
    }

    // Fetches each stop you're at's timings and shows them, then again in a minute while you're
    // still there.
    public static class Refresh extends androidx.work.Worker {
        public Refresh(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            Context c = getApplicationContext();
            JSONObject inside = inside(c);
            long now = System.currentTimeMillis();
            Iterator<String> codes = inside.keys();
            List<String> gone = new ArrayList<>();
            while (codes.hasNext()) {
                String code = codes.next();
                if (now - inside.optLong(code) > STAY_MS) {
                    gone.add(code);
                    continue;
                }
                show(c, code);
            }
            for (String code : gone) {
                inside.remove(code);
                Notifications.cancel(c, tag(code));
            }
            setInside(c, inside);
            if (inside.length() > 0) refreshIn(c, REFRESH_S);
            return Result.success();
        }
    }

    // Whether a bus is one of `buses`: by its number, or a wildcard, "22*" for every bus
    // starting 22, as a routine can have from 2.2.3 (main-site/js/reminders.js).
    static boolean wanted(java.util.Set<String> buses, String serviceNo) {
        for (String b : buses) {
            if (b.endsWith("*") ? serviceNo.startsWith(b.substring(0, b.length() - 1)) : serviceNo.equals(b)) return true;
        }
        return false;
    }

    // A stop's next buses, a line each ("22  3 min, 14 min"), soonest first, at most MAX_LINES:
    // just `buses` when it names any. For this and a routine's notification (Routines). Throws
    // when the timings can't be had.
    static String timingLines(String code, java.util.Set<String> buses) throws Exception {
        List<long[]> soonest = new ArrayList<>();
        List<String> services = new ArrayList<>();
        JSONObject res = new JSONObject(WidgetStore.get(MainActivity.SITE + "/api/bus-arrivals?stop=" + URLEncoder.encode(code, "UTF-8")));
        JSONArray list = res.optJSONArray("services");
        for (int i = 0; list != null && i < list.length(); i++) {
            JSONObject s = list.getJSONObject(i);
            if (!buses.isEmpty() && !wanted(buses, s.optString("serviceNo").toUpperCase(java.util.Locale.ROOT))) continue;
            List<Long> mins = new ArrayList<>();
            for (String k : new String[]{"next", "next2"}) {
                JSONObject bus = s.optJSONObject(k);
                if (bus != null && !bus.isNull("eta_ms")) mins.add(Math.max(0, bus.optLong("eta_ms")) / 60000);
            }
            if (mins.isEmpty()) continue;
            services.add(s.optString("serviceNo") + "  " + (mins.get(0) == 0 ? "Arr" : mins.get(0) + " min")
                    + (mins.size() > 1 ? ", " + (mins.get(1) == 0 ? "Arr" : mins.get(1) + " min") : ""));
            soonest.add(new long[]{mins.get(0), services.size() - 1});
        }
        soonest.sort((a, b) -> Long.compare(a[0], b[0]));
        StringBuilder lines = new StringBuilder();
        for (int i = 0; i < soonest.size() && i < MAX_LINES; i++) {
            if (i > 0) lines.append('\n');
            lines.append(services.get((int) soonest.get(i)[1]));
        }
        return lines.length() == 0 ? "No buses due right now." : lines.toString();
    }

    private static void show(Context c, String code) {
        String name = code;
        JSONArray stops = stops(c);
        for (int i = 0; i < stops.length(); i++) {
            JSONObject s = stops.optJSONObject(i);
            if (s != null && code.equals(s.optString("code"))) name = s.optString("name", code);
        }
        String body;
        try {
            body = timingLines(code, java.util.Collections.emptySet());
        } catch (Exception e) {
            body = "Couldn't get the timings just now.";
        }
        NotificationCompat.Builder n = Notifications.builder(c, Notifications.NEAR, tag(code), name + " (" + code + ")", body,
                        MainActivity.SITE + "/#" + code)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setShowWhen(true)
                .setTimeoutAfter(STAY_MS)
                .setCategory(NotificationCompat.CATEGORY_STATUS);
        Notifications.show(c, tag(code), n);
    }
}
