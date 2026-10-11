/*
 * The phone's calendar, for Navigate's Calendar tab (main-site/js/calendar.js, through
 * js/app-bridge.js): events({ days }) answers { events } as CalendarReader reads them, or
 * { error: "permission" } until the calendar's allowed. checkPermissions and requestPermissions
 * are Capacitor's own, with the one alias, "calendar".
 */
package org.uwuapps.sgbus;

import android.Manifest;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import org.json.JSONException;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
        name = "PhoneCalendar",
        permissions = @Permission(alias = "calendar", strings = {Manifest.permission.READ_CALENDAR})
)
public class PhoneCalendarPlugin extends Plugin {
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void events(PluginCall call) {
        int days = Math.max(1, Math.min(31, call.getInt("days", 14)));
        if (getPermissionState("calendar") != PermissionState.GRANTED) {
            JSObject out = new JSObject();
            out.put("error", "permission");
            call.resolve(out);
            return;
        }
        WORK.execute(() -> {
            try {
                JSObject out = new JSObject();
                out.put("events", CalendarReader.upcoming(getContext(), days));
                call.resolve(out);
            } catch (JSONException | SecurityException e) {
                call.reject("Couldn't read the calendar", e);
            }
        });
    }
}
