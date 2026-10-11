/*
 * The phone's calendar events with a location, for the site's Calendar tab (PhoneCalendarPlugin): every
 * calendar synced to the phone, Google, Outlook, Samsung and the rest, read from Android's
 * calendar provider. Android expands repeating events itself (CalendarContract.Instances).
 * Cancelled events, and ones you've declined, are left out. Nothing is kept here; each request
 * reads the calendar afresh.
 *
 * One of this app's own screens (see android/README.md).
 */
package org.uwuapps.sgbus;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Attendees;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class CalendarReader {
    private static final long DAY_MS = 24L * 60 * 60 * 1000;
    // Singapore is eight hours ahead of UTC, all year.
    private static final long SG_OFFSET_MS = 8L * 60 * 60 * 1000;
    private static final int MAX_EVENTS = 200;

    private CalendarReader() {}

    static boolean allowed(Context context) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || context.checkSelfPermission(Manifest.permission.READ_CALENDAR)
                == PackageManager.PERMISSION_GRANTED;
    }

    // From yesterday, so a whole-day event today is caught whatever the time zone, to `days` on.
    static JSONArray upcoming(Context context, int days) throws JSONException {
        long now = System.currentTimeMillis();
        Uri.Builder uri = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(uri, now - DAY_MS);
        ContentUris.appendId(uri, now + days * DAY_MS);
        String[] columns = {
                Instances.EVENT_ID, Instances.TITLE, Instances.EVENT_LOCATION, Instances.BEGIN,
                Instances.ALL_DAY, Instances.STATUS, Instances.SELF_ATTENDEE_STATUS,
        };
        String where = Instances.EVENT_LOCATION + " IS NOT NULL AND " + Instances.EVENT_LOCATION + " != ''";

        JSONArray events = new JSONArray();
        try (Cursor c = context.getContentResolver().query(uri.build(), columns, where, null,
                Instances.BEGIN + " ASC")) {
            if (c == null) return events;
            while (c.moveToNext() && events.length() < MAX_EVENTS) {
                if (c.getInt(5) == Events.STATUS_CANCELED) continue;
                if (c.getInt(6) == Attendees.ATTENDEE_STATUS_DECLINED) continue;
                boolean allDay = c.getInt(4) != 0;
                long begin = c.getLong(3);
                // A whole-day event starts at midnight UTC on its date; the page wants
                // Singapore's midnight on that date.
                long start = allDay ? begin - SG_OFFSET_MS : begin;
                events.put(new JSONObject()
                        .put("key", "phone:" + c.getLong(0) + "|" + begin)
                        .put("title", c.isNull(1) ? "Event" : c.getString(1))
                        .put("location", c.getString(2).replaceAll("\\s+", " ").trim())
                        .put("start", start)
                        .put("allDay", allDay));
            }
        }
        return events;
    }
}
