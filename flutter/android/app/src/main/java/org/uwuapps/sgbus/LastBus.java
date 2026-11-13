/*
 * Last bus reminders (RemindersPlugin.lastBus, main-site/js/reminders.js): for a bus at a stop
 * you ask about, a notification LEAD_MIN minutes before its last bus there, every day it runs,
 * from LTA's first and last bus times (weekday, Saturday, Sunday) the page hands over. A last
 * bus after midnight, "0030" say, is that night's, the next day by the clock. Public holidays
 * run Sunday's times, which this doesn't know, so on one the reminder goes by the day of the
 * week.
 *
 * On time to the minute: an exact alarm (USE_EXACT_ALARM, which a sideloaded app gets at
 * install). Alarms don't outlast a restart of the phone: BootReceiver sets them again.
 */
package org.uwuapps.sgbus;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.TimeZone;

final class LastBus {
    private static final String PREFS = "last_bus";
    private static final String LIST = "list";
    static final int MAX = 20;
    static final int LEAD_MIN = 20;
    // A last bus before this is past midnight, still the night before's.
    private static final int SMALL_HOURS = 400;
    private static final TimeZone SG = TimeZone.getTimeZone("Asia/Singapore");
    private static final String EXTRA_KEY = "org.uwuapps.sgbus.LAST_BUS";

    private LastBus() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // [{ code, name, service, wd, sat, sun }], the last bus as "HHMM" or "-" on each day type.
    static JSONArray list(Context c) {
        try {
            return new JSONArray(prefs(c).getString(LIST, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static String key(JSONObject r) {
        return r.optString("code") + "|" + r.optString("service");
    }

    // The reminders, replacing those before, each with its next alarm.
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

    private static PendingIntent alarm(Context c, JSONObject r) {
        Intent intent = new Intent(c, Receiver.class).putExtra(EXTRA_KEY, key(r));
        return PendingIntent.getBroadcast(c, key(r).hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancel(Context c, JSONObject r) {
        if (r == null) return;
        AlarmManager am = c.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(alarm(c, r));
    }

    // When the last bus comes next, from now: tonight's, or tomorrow's once tonight's is past.
    // 0 if it doesn't run in the next few days.
    static long nextLastBus(JSONObject r, long now) {
        long best = 0;
        for (int day = -1; day <= 7 && best == 0; day++) {
            Calendar d = Calendar.getInstance(SG);
            d.setTimeInMillis(now);
            d.add(Calendar.DAY_OF_MONTH, day);
            int weekday = d.get(Calendar.DAY_OF_WEEK);
            String t = r.optString(weekday == Calendar.SATURDAY ? "sat" : weekday == Calendar.SUNDAY ? "sun" : "wd", "-");
            if (!t.matches("\\d{4}")) continue;
            int hhmm = Integer.parseInt(t);
            if (hhmm < SMALL_HOURS) d.add(Calendar.DAY_OF_MONTH, 1);
            d.set(Calendar.HOUR_OF_DAY, (hhmm / 100) % 24);
            d.set(Calendar.MINUTE, hhmm % 100);
            d.set(Calendar.SECOND, 0);
            d.set(Calendar.MILLISECOND, 0);
            if (d.getTimeInMillis() - LEAD_MIN * 60000L > now) best = d.getTimeInMillis();
        }
        return best;
    }

    private static void schedule(Context c, JSONObject r) {
        if (r == null) return;
        long last = nextLastBus(r, System.currentTimeMillis());
        if (last == 0) return;
        long at = last - LEAD_MIN * 60000L;
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

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            String key = intent.getStringExtra(EXTRA_KEY);
            JSONArray list = list(context);
            for (int i = 0; i < list.length(); i++) {
                JSONObject r = list.optJSONObject(i);
                if (r == null || !key(r).equals(key)) continue;
                long last = nextLastBus(r, System.currentTimeMillis() - LEAD_MIN * 60000L - 60000L);
                String clock = last == 0 ? "" : TimingsWidget.clock(last);
                String service = r.optString("service");
                String code = r.optString("code");
                String stop = r.optString("name", code);
                NotificationCompat.Builder n = Notifications.builder(context, Notifications.LAST_BUS, "last-bus:" + key,
                                "Last bus " + service + (clock.isEmpty() ? "" : " at " + clock),
                                "From " + stop + " (" + code + "), in about " + LEAD_MIN + " min. Tap for its timings.",
                                MainActivity.SITE + "/#" + code + "," + service)
                        .setCategory(NotificationCompat.CATEGORY_REMINDER)
                        .setPriority(NotificationCompat.PRIORITY_HIGH);
                Notifications.show(context, "last-bus:" + key, n);
                // And the next one.
                schedule(context, r);
            }
        }
    }
}
