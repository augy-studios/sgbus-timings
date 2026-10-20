/*
 * Routines (RemindersPlugin.routines, main-site/js/reminders.js, 2.2.0): a stop's next buses as
 * a notification at a time you set, on the days you pick, such as your stop's buses at 7:45 on
 * weekdays, as the Telegram bot's routines send them as a message. Just the buses you name, or
 * all of them.
 *
 * On time to the minute: an exact alarm, as LastBus's (USE_EXACT_ALARM), set again after a
 * restart of the phone by BootReceiver. The alarm only starts a Fetch, which waits for the
 * network, gets the timings from the site's /api/bus-arrivals and shows them (NearStops'
 * timingLines), so a routine that fires with no signal still shows when there is one.
 */
package org.uwuapps.sgbus;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

final class Routines {
    private static final String PREFS = "routines";
    private static final String LIST = "list";
    static final int MAX = 20;
    private static final TimeZone SG = TimeZone.getTimeZone("Asia/Singapore");
    private static final String EXTRA_ID = "org.uwuapps.sgbus.ROUTINE";
    private static final String KEY_ID = "id";

    private Routines() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // [{ id, code, name, buses: ["22"], time: "HHMM", days: [1..7, Monday first] }]
    static JSONArray list(Context c) {
        try {
            return new JSONArray(prefs(c).getString(LIST, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    // Whether a routine from the page is one this can run.
    static boolean valid(JSONObject r) {
        if (r == null || r.optString("id").isEmpty() || !r.optString("code").matches("\\d{5}")) return false;
        String t = r.optString("time");
        if (!t.matches("\\d{4}") || Integer.parseInt(t) / 100 > 23 || Integer.parseInt(t) % 100 > 59) return false;
        JSONArray days = r.optJSONArray("days");
        return days != null && days.length() > 0;
    }

    // The routines, replacing those before, each with its next alarm.
    static void set(Context c, JSONArray list) {
        JSONArray before = list(c);
        for (int i = 0; i < before.length(); i++) cancel(c, before.optJSONObject(i));
        prefs(c).edit().putString(LIST, list.toString()).apply();
        arm(c);
    }

    static void arm(Context c) {
        JSONArray list = list(c);
        for (int i = 0; i < list.length(); i++) schedule(c, list.optJSONObject(i));
    }

    private static JSONObject find(Context c, String id) {
        JSONArray list = list(c);
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null && r.optString("id").equals(id)) return r;
        }
        return null;
    }

    private static PendingIntent alarm(Context c, JSONObject r) {
        Intent intent = new Intent(c, Receiver.class).putExtra(EXTRA_ID, r.optString("id"));
        return PendingIntent.getBroadcast(c, ("routine:" + r.optString("id")).hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancel(Context c, JSONObject r) {
        if (r == null) return;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(alarm(c, r));
    }

    // When a routine next runs after `now`, in Singapore's time, or 0 if it names no days.
    static long next(JSONObject r, long now) {
        int hhmm = Integer.parseInt(r.optString("time", "0000"));
        Set<Integer> days = new HashSet<>();
        JSONArray d = r.optJSONArray("days");
        for (int i = 0; d != null && i < d.length(); i++) days.add(d.optInt(i));
        for (int ahead = 0; ahead <= 7; ahead++) {
            Calendar at = Calendar.getInstance(SG);
            at.setTimeInMillis(now);
            at.add(Calendar.DAY_OF_MONTH, ahead);
            at.set(Calendar.HOUR_OF_DAY, hhmm / 100);
            at.set(Calendar.MINUTE, hhmm % 100);
            at.set(Calendar.SECOND, 0);
            at.set(Calendar.MILLISECOND, 0);
            // Calendar counts from Sunday (1); the page from Monday (1) to Sunday (7).
            int weekday = (at.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
            if (days.contains(weekday) && at.getTimeInMillis() > now) return at.getTimeInMillis();
        }
        return 0;
    }

    private static void schedule(Context c, JSONObject r) {
        if (r == null) return;
        long at = next(r, System.currentTimeMillis());
        if (at == 0) return;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = alarm(c, r);
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    private static String tag(String id) {
        return "routine:" + id;
    }

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String id = intent.getStringExtra(EXTRA_ID);
            JSONObject r = id == null ? null : find(context, id);
            if (r == null) return;
            OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(Fetch.class)
                    .setInputData(new Data.Builder().putString(KEY_ID, id).build())
                    .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                    .build();
            WorkManager.getInstance(context).enqueue(work);
            // And the next one.
            schedule(context, r);
        }
    }

    // Gets the stop's timings and shows them.
    public static class Fetch extends androidx.work.Worker {
        public Fetch(@NonNull Context context, @NonNull WorkerParameters params) {
            super(context, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            Context c = getApplicationContext();
            String id = getInputData().getString(KEY_ID);
            JSONObject r = id == null ? null : find(c, id);
            if (r == null) return Result.success();
            String code = r.optString("code");
            Set<String> buses = new HashSet<>();
            JSONArray b = r.optJSONArray("buses");
            for (int i = 0; b != null && i < b.length(); i++) buses.add(b.optString(i).toUpperCase(Locale.ROOT));
            String body;
            try {
                body = NearStops.timingLines(code, buses);
            } catch (Exception e) {
                body = "Couldn't get the timings just now. Tap for them.";
            }
            String url = MainActivity.SITE + "/#" + code + (buses.size() == 1 ? "," + buses.iterator().next() : "");
            NotificationCompat.Builder n = Notifications.builder(c, Notifications.ROUTINE, tag(id),
                            r.optString("name", code) + " (" + code + ")", body, url)
                    .setShowWhen(true)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER);
            Notifications.show(c, tag(id), n);
            return Result.success();
        }
    }
}
