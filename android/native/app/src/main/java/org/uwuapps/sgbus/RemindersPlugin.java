/*
 * The app's reminders, for the page (main-site/js/reminders.js, through js/app-bridge.js), each
 * asking for what it needs as it's turned on:
 *
 *   status()                 what's on, and which permissions are given
 *   nearStops({ stops })     Timings near a stop for these, [{ code, name, lat, lng }], or none
 *                            (NearStops): location, then location all the time, then
 *                            notifications. Rejects "permission" with data { need } if one's
 *                            refused: "location" or "background"
 *   lastBus({ list })        the last bus reminders, [{ code, name, service, wd, sat, sun }]
 *                            (LastBus): notifications
 *   leaveTime({ on })        Time to leave for calendar events (LeaveTime): the calendar, then
 *                            notifications. Rejects "permission" { need: "calendar" }
 *   onABus({ on })           "On a bus?" (OnABus): physical activity, then notifications.
 *                            Rejects "permission" { need: "activity" }
 *   routines({ list })       the routines, [{ id, code, name, buses, time, days }] (Routines):
 *                            notifications (2.2.0)
 *
 * A notifications permission that's refused doesn't stop any of them being turned on; status()
 * says, and the page says so.
 */
package org.uwuapps.sgbus;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.tasks.Task;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
        name = "Reminders",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
                @Permission(alias = "background", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION}),
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
                @Permission(alias = "calendar", strings = {Manifest.permission.READ_CALENDAR}),
                @Permission(alias = "activity", strings = {Manifest.permission.ACTIVITY_RECOGNITION}),
        }
)
public class RemindersPlugin extends Plugin {

    private boolean granted(String alias) {
        return getPermissionState(alias) == PermissionState.GRANTED;
    }

    private boolean hasNotifications() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || granted("notifications");
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        JSArray near = new JSArray();
        JSONArray stops = NearStops.stops(getContext());
        for (int i = 0; i < stops.length(); i++) near.put(stops.optJSONObject(i).optString("code"));
        out.put("nearStops", near);
        JSArray last = new JSArray();
        JSONArray list = LastBus.list(getContext());
        for (int i = 0; i < list.length(); i++) {
            JSONObject r = list.optJSONObject(i);
            JSObject o = new JSObject();
            o.put("code", r.optString("code"));
            o.put("service", r.optString("service"));
            last.put(o);
        }
        out.put("lastBus", last);
        out.put("routines", Routines.list(getContext()).length());
        out.put("leaveTime", LeaveTime.on(getContext()));
        out.put("onABus", OnABus.on(getContext()));
        out.put("background", NearStops.canWatch(getContext()));
        out.put("notifications", Notifications.allowed(getContext()));
        out.put("calendar", CalendarReader.allowed(getContext()));
        out.put("activity", OnABus.allowed(getContext()));
        call.resolve(out);
    }

    private void needs(PluginCall call, String need) {
        JSObject data = new JSObject();
        data.put("need", need);
        call.reject("Not allowed: " + need, "permission", null, data);
    }

    // Ends the call with a task's outcome: armed, or why not.
    private void settle(PluginCall call, Task<Void> task) {
        task.addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(e -> {
                    if (e instanceof SecurityException) needs(call, "background");
                    else call.reject(e.getMessage() == null ? "Couldn't set that up" : e.getMessage(), "failed");
                });
    }

    // ---------- Timings near a stop ----------

    @PluginMethod
    public void nearStops(PluginCall call) {
        JSArray stops = call.getArray("stops", new JSArray());
        JSONArray kept = new JSONArray();
        for (int i = 0; i < stops.length() && kept.length() < NearStops.MAX_STOPS; i++) {
            JSONObject s = stops.optJSONObject(i);
            if (s != null && s.optString("code").matches("\\d{5}") && s.has("lat") && s.has("lng")) kept.put(s);
        }
        NearStops.setStops(getContext(), kept);
        if (kept.length() == 0) {
            settle(call, NearStops.arm(getContext()));
            return;
        }
        nearAfterLocation(call);
    }

    @PermissionCallback
    private void nearAfterLocation(PluginCall call) {
        if (!TripPlugin.hasLocation(getContext())) {
            if (call.getData().optBoolean("askedLocation")) {
                needs(call, "location");
                return;
            }
            call.getData().put("askedLocation", true);
            requestPermissionForAlias("location", call, "nearAfterLocation");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !granted("background")) {
            if (call.getData().optBoolean("askedBackground")) {
                needs(call, "background");
                return;
            }
            call.getData().put("askedBackground", true);
            requestPermissionForAlias("background", call, "nearAfterLocation");
            return;
        }
        if (!hasNotifications() && !call.getData().optBoolean("askedNotifications")) {
            call.getData().put("askedNotifications", true);
            requestPermissionForAlias("notifications", call, "nearAfterLocation");
            return;
        }
        settle(call, NearStops.arm(getContext()));
    }

    // ---------- Last bus ----------

    @PluginMethod
    public void lastBus(PluginCall call) {
        JSArray list = call.getArray("list", new JSArray());
        JSONArray kept = new JSONArray();
        for (int i = 0; i < list.length() && kept.length() < LastBus.MAX; i++) {
            JSONObject r = list.optJSONObject(i);
            if (r != null && r.optString("code").matches("\\d{5}") && !r.optString("service").isEmpty()) kept.put(r);
        }
        LastBus.set(getContext(), kept);
        if (kept.length() > 0 && !hasNotifications()) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        call.resolve();
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        call.resolve();
    }

    // ---------- Routines (2.2.0) ----------

    @PluginMethod
    public void routines(PluginCall call) {
        JSArray list = call.getArray("list", new JSArray());
        JSONArray kept = new JSONArray();
        for (int i = 0; i < list.length() && kept.length() < Routines.MAX; i++) {
            JSONObject r = list.optJSONObject(i);
            if (Routines.valid(r)) kept.put(r);
        }
        Routines.set(getContext(), kept);
        if (kept.length() > 0 && !hasNotifications()) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        call.resolve();
    }

    // ---------- Time to leave ----------

    @PluginMethod
    public void leaveTime(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("on"))) {
            LeaveTime.setOn(getContext(), false);
            call.resolve();
            return;
        }
        leaveAfterCalendar(call);
    }

    @PermissionCallback
    private void leaveAfterCalendar(PluginCall call) {
        if (!CalendarReader.allowed(getContext())) {
            if (call.getData().optBoolean("askedCalendar")) {
                needs(call, "calendar");
                return;
            }
            call.getData().put("askedCalendar", true);
            requestPermissionForAlias("calendar", call, "leaveAfterCalendar");
            return;
        }
        if (!hasNotifications() && !call.getData().optBoolean("askedNotifications")) {
            call.getData().put("askedNotifications", true);
            requestPermissionForAlias("notifications", call, "leaveAfterCalendar");
            return;
        }
        LeaveTime.setOn(getContext(), true);
        call.resolve();
    }

    // ---------- On a bus? ----------

    @PluginMethod
    public void onABus(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("on"))) {
            settle(call, OnABus.setOn(getContext(), false));
            return;
        }
        busAfterActivity(call);
    }

    @PermissionCallback
    private void busAfterActivity(PluginCall call) {
        if (!OnABus.allowed(getContext())) {
            if (call.getData().optBoolean("askedActivity")) {
                needs(call, "activity");
                return;
            }
            call.getData().put("askedActivity", true);
            requestPermissionForAlias("activity", call, "busAfterActivity");
            return;
        }
        if (!hasNotifications() && !call.getData().optBoolean("askedNotifications")) {
            call.getData().put("askedNotifications", true);
            requestPermissionForAlias("notifications", call, "busAfterActivity");
            return;
        }
        Task<Void> task = OnABus.setOn(getContext(), true);
        task.addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(e -> {
                    OnABus.setOn(getContext(), false);
                    if (e instanceof SecurityException) needs(call, "activity");
                    else call.reject(e.getMessage() == null ? "Couldn't set that up" : e.getMessage(), "failed");
                });
    }
}
