/*
 * Time to leave (RemindersPlugin.leaveTime, main-site/js/reminders.js): for events in the
 * phone's calendar with a place for a location, a notification when it's time to set off by
 * bus and train to get there for its start. Every 15 minutes, while it's on, the events
 * starting in the next few hours are planned with the site's Navigate (/api/nav, arriving by
 * the start), from where you are, or from Home in Places if the phone won't say where that is
 * with the app in the background. Each plan sets an alarm ALARM_LEAD_MIN minutes before you'd
 * need to leave; the notification opens Navigate with that journey.
 *
 * An event's location is matched to a place as Navigate's Calendar matches it (calendar.js
 * placeFor): its postal code, the whole location, then what comes before its first comma,
 * through /api/places. Online meetings (a link for a location) are left out.
 */
package org.uwuapps.sgbus;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkerParameters;

import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.Tasks;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class LeaveTime {
    private static final String PREFS = "leave";
    private static final String ON = "on";
    private static final String PLANS = "plans";
    private static final String PLACES = "places";
    private static final String WORK = "leave-plan";
    private static final String EXTRA_KEY = "org.uwuapps.sgbus.LEAVE";
    // Events starting this far ahead are planned; nearer than the first, it's too late to say.
    private static final long AHEAD_MS = 3 * 60 * 60 * 1000;
    private static final long TOO_SOON_MS = 10 * 60 * 1000;
    static final int ALARM_LEAD_MIN = 10;
    // Closer than this, you're there already.
    private static final double THERE_M = 300;
    private static final Pattern LINK = Pattern.compile("(?i)https?://|\\bzoom\\.us\\b|meet\\.google|teams\\.microsoft|\\bwebex\\b");
    private static final Pattern POSTAL = Pattern.compile("\\b(\\d{6})\\b");

    private LeaveTime() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean on(Context c) {
        return prefs(c).getBoolean(ON, false);
    }

    static void setOn(Context c, boolean on) {
        prefs(c).edit().putBoolean(ON, on).apply();
        WorkManager wm = WorkManager.getInstance(c);
        if (on) {
            PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(Plan.class, 15, TimeUnit.MINUTES)
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build();
            wm.enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, work);
        } else {
            wm.cancelUniqueWork(WORK);
            JSONObject plans = plans(c);
            Iterator<String> keys = plans.keys();
            while (keys.hasNext()) cancelAlarm(c, keys.next());
            prefs(c).edit().putString(PLANS, "{}").apply();
        }
    }

    // ---------- the plans: { eventKey: { title, place, at (start), leave, minutes, how, url, told } } ----------

    private static JSONObject plans(Context c) {
        try {
            return new JSONObject(prefs(c).getString(PLANS, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void setPlans(Context c, JSONObject plans) {
        prefs(c).edit().putString(PLANS, plans.toString()).apply();
    }

    public static class Plan extends androidx.work.Worker {
        public Plan(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            Context c = getApplicationContext();
            if (!on(c) || !CalendarReader.allowed(c)) return Result.success();
            long now = System.currentTimeMillis();
            JSONObject plans = plans(c);
            // Past events go.
            Iterator<String> keys = plans.keys();
            java.util.List<String> old = new java.util.ArrayList<>();
            while (keys.hasNext()) {
                String k = keys.next();
                if (plans.optJSONObject(k) == null || plans.optJSONObject(k).optLong("at") < now) old.add(k);
            }
            for (String k : old) plans.remove(k);

            try {
                double[] from = whereYouAre(c);
                JSONArray events = CalendarReader.upcoming(c, 1);
                for (int i = 0; i < events.length(); i++) {
                    JSONObject e = events.getJSONObject(i);
                    long start = e.optLong("start");
                    String location = e.optString("location");
                    if (e.optBoolean("allDay") || start - now < TOO_SOON_MS || start - now > AHEAD_MS) continue;
                    if (LINK.matcher(location).find()) continue;
                    JSONObject told = plans.optJSONObject(e.optString("key"));
                    if (told != null && told.optBoolean("told")) continue;
                    JSONObject place = placeFor(c, location);
                    if (place == null || from == null) continue;
                    if (metres(from[0], from[1], place.optDouble("lat"), place.optDouble("lng")) < THERE_M) continue;
                    JSONObject plan = plan(from, place, start);
                    if (plan == null) continue;
                    plan.put("title", e.optString("title", "Event")).put("place", place.optString("label")).put("at", start);
                    plans.put(e.optString("key"), plan);
                    alarm(c, e.optString("key"), plan.optLong("leave") - ALARM_LEAD_MIN * 60000L);
                }
            } catch (Exception e) {
                // Offline, or the calendar's gone: tried again in 15 minutes.
            }
            setPlans(c, plans);
            return Result.success();
        }
    }

    // Where the phone last knew it was, or Home.
    @SuppressLint("MissingPermission") // checked first
    private static double[] whereYouAre(Context c) {
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            try {
                Location l = Tasks.await(LocationServices.getFusedLocationProviderClient(c).getLastLocation(), 10, TimeUnit.SECONDS);
                if (l != null && System.currentTimeMillis() - l.getTime() < 30 * 60 * 1000) return new double[]{l.getLatitude(), l.getLongitude()};
            } catch (Exception ignored) {
                // Not to be had in the background: Home instead.
            }
        }
        JSONObject home = PlaceShortcuts.place(c, "home");
        return home == null ? null : new double[]{home.optDouble("lat"), home.optDouble("lng")};
    }

    // The place an event's location names, kept once found (or not).
    private static JSONObject placeFor(Context c, String location) throws JSONException {
        JSONObject cache;
        try {
            cache = new JSONObject(prefs(c).getString(PLACES, "{}"));
        } catch (JSONException e) {
            cache = new JSONObject();
        }
        if (cache.has(location)) return cache.optJSONObject(location);
        java.util.LinkedHashSet<String> tries = new java.util.LinkedHashSet<>();
        Matcher postal = POSTAL.matcher(location);
        if (postal.find()) tries.add(postal.group(1));
        tries.add(location.length() > 150 ? location.substring(0, 150) : location);
        tries.add(location.split(",")[0].trim());
        JSONObject found = null;
        for (String q : tries) {
            if (q.trim().length() < 2) continue;
            try {
                JSONArray list = new JSONArray(WidgetStore.get(MainActivity.SITE + "/api/places?q=" + URLEncoder.encode(q, "UTF-8")));
                if (list.length() == 0) continue;
                JSONObject p = list.getJSONObject(0);
                String own = location.split(",")[0].trim();
                found = new JSONObject()
                        .put("label", own.length() >= 3 && own.length() <= 80 ? own : p.optString("label"))
                        .put("lat", p.optDouble("lat")).put("lng", p.optDouble("lng"));
                break;
            } catch (java.io.IOException ignored) {
                // Not that way: the next.
            }
        }
        cache.put(location, found == null ? JSONObject.NULL : found);
        prefs(c).edit().putString(PLACES, cache.toString()).apply();
        return found;
    }

    private static final SimpleDateFormat AT = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.UK);
    static {
        AT.setTimeZone(TimeZone.getTimeZone("Asia/Singapore"));
    }

    // The quickest way there arriving by `start`: { leave, minutes, how, url }.
    private static JSONObject plan(double[] from, JSONObject place, long start) throws Exception {
        String at;
        synchronized (AT) {
            at = AT.format(new Date(start));
        }
        String url = MainActivity.SITE + "/api/nav?from=" + from[0] + "," + from[1]
                + "&to=" + place.optDouble("lat") + "," + place.optDouble("lng") + "&when=arrive&at=" + at;
        JSONObject res = new JSONObject(WidgetStore.get(url));
        JSONArray options = res.optJSONArray("options");
        if (options == null || options.length() == 0) return null;
        JSONObject best = options.getJSONObject(0);
        int minutes = best.optInt("minutes");
        StringBuilder how = new StringBuilder();
        JSONArray legs = best.optJSONArray("legs");
        for (int i = 0; legs != null && i < legs.length(); i++) {
            JSONObject leg = legs.getJSONObject(i);
            String mode = leg.optString("mode");
            if ("walk".equals(mode)) continue;
            if (how.length() > 0) how.append(", then ");
            how.append("bus".equals(mode) ? "bus " + leg.optString("route") : leg.optString("route") + " line");
        }
        return new JSONObject()
                .put("leave", start - minutes * 60000L)
                .put("minutes", minutes)
                .put("how", how.length() == 0 ? "on foot" : "by " + how)
                .put("url", MainActivity.SITE + "/#nav/here/" + navEnd(place) + "/arrive/" + at);
    }

    // A Navigate link's end, as navHashFor in main-site/js/nav.js writes it.
    static String navEnd(JSONObject place) {
        String label = Uri.encode(place.optString("label"))
                .replace("!", "%21").replace("'", "%27").replace("(", "%28").replace(")", "%29")
                .replace("*", "%2A").replace("~", "%7E");
        return String.format(Locale.UK, "%.5f,%.5f~%s", place.optDouble("lat"), place.optDouble("lng"), label);
    }

    private static double metres(double lat1, double lng1, double lat2, double lng2) {
        float[] out = new float[1];
        Location.distanceBetween(lat1, lng1, lat2, lng2, out);
        return out[0];
    }

    // ---------- the alarm, and the notification ----------

    private static PendingIntent alarmIntent(Context c, String key) {
        return PendingIntent.getBroadcast(c, ("leave:" + key).hashCode(),
                new Intent(c, Receiver.class).putExtra(EXTRA_KEY, key),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancelAlarm(Context c, String key) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(alarmIntent(c, key));
    }

    private static void alarm(Context c, String key, long at) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        // Already past: now.
        long when = Math.max(at, System.currentTimeMillis() + 1000);
        PendingIntent pi = alarmIntent(c, key);
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
                return;
            }
        } catch (SecurityException ignored) {
            // Not allowed after all: as near as Android will.
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
    }

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String key = intent.getStringExtra(EXTRA_KEY);
            if (key == null || !on(context)) return;
            JSONObject plans = plans(context);
            JSONObject p = plans.optJSONObject(key);
            if (p == null || p.optBoolean("told")) return;
            long leave = p.optLong("leave");
            // Long past leaving: too late to be any use.
            if (System.currentTimeMillis() > leave + 5 * 60000L) return;
            String clock = TimingsWidget.clock(leave);
            NotificationCompat.Builder n = Notifications.builder(context, Notifications.LEAVE, "leave:" + key,
                            "Time to leave for " + p.optString("title"),
                            "Leave by " + clock + " to get to " + p.optString("place") + " for " + TimingsWidget.clock(p.optLong("at"))
                                    + ": about " + p.optInt("minutes") + " min " + p.optString("how") + ".",
                            p.optString("url"))
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setTimeoutAfter(Math.max(60000L, p.optLong("at") - System.currentTimeMillis()));
            Notifications.show(context, "leave:" + key, n);
            try {
                p.put("told", true);
                setPlans(context, plans);
            } catch (JSONException ignored) {
                // Can't happen with these values.
            }
        }
    }
}
