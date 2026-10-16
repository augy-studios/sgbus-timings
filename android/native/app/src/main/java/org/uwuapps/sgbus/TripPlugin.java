/*
 * Following a trip with the screen off, for the Get Off Alert (main-site/js/trip.js, through
 * js/app-bridge.js). A web page only gets your location while it's on screen; this app's
 * TripService gets it the whole trip.
 *
 *   start({ title, text })   asks for location if it hasn't got it, then starts TripService
 *                            with its notification. The first time, it also asks for location
 *                            "all the time", which Android 11 and later ask on a settings page
 *                            of their own; the trip works without it. Rejects "permission" if
 *                            location is refused.
 *   update({ title, text })  the notification's text, as the trip goes on
 *   alert({ title, body, quiet })   the Get Off Alert, as a notification over the lock screen;
 *                            `quiet`, its sound in earphones only (2.1.0)
 *                            The first trip also asks to leave the app out of battery
 *                            optimisation, once (2.1.0).
 *   stop()                   the trip's over
 *   status()                 { running, location, background, notifications }
 *
 * Events: "location" { lat, lng, accuracy, heading, speed, time, pace, kmh } for each fix, and
 * "end" when the notification's End trip is tapped. `pace` is "walking", "riding" or "still" by
 * your average speed over the last few seconds, `kmh` (Pace, 2.0.8); both are left out with
 * nothing recent to go by.
 */
package org.uwuapps.sgbus;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.lang.ref.WeakReference;

@CapacitorPlugin(
        name = "Trip",
        permissions = {
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
                @Permission(alias = "background", strings = {Manifest.permission.ACCESS_BACKGROUND_LOCATION}),
                @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS}),
        }
)
public class TripPlugin extends Plugin {
    private static final String PREFS = "trip";
    private static final String ASKED_BACKGROUND = "asked_background";
    private static final String ASKED_NOTIFICATIONS = "asked_notifications";
    private static final String ASKED_BATTERY = "asked_battery";

    private static WeakReference<TripPlugin> sPlugin = new WeakReference<>(null);

    // Set by stop(): a trip ended while its permission screens were up isn't started after them.
    private volatile boolean mStopped;

    @Override
    public void load() {
        sPlugin = new WeakReference<>(this);
    }

    static boolean hasLocation(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackground() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasNotifications() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                || getPermissionState("notifications") == PermissionState.GRANTED;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // Asked once each, so a trip never starts with a prompt you've already answered.
    private boolean firstTime(String key) {
        if (prefs().getBoolean(key, false)) return false;
        prefs().edit().putBoolean(key, true).apply();
        return true;
    }

    @PluginMethod
    public void start(PluginCall call) {
        mStopped = false;
        if (!hasLocation(getContext())) {
            requestPermissionForAlias("location", call, "afterLocation");
            return;
        }
        afterLocation(call);
    }

    @PermissionCallback
    private void afterLocation(PluginCall call) {
        if (!hasLocation(getContext())) {
            call.reject("Location wasn't allowed", "permission");
            return;
        }
        if (!hasNotifications() && firstTime(ASKED_NOTIFICATIONS)) {
            requestPermissionForAlias("notifications", call, "afterNotifications");
            return;
        }
        afterNotifications(call);
    }

    @PermissionCallback
    private void afterNotifications(PluginCall call) {
        if (!hasBackground() && firstTime(ASKED_BACKGROUND)) {
            requestPermissionForAlias("background", call, "afterBackground");
            return;
        }
        afterBackground(call);
    }

    @PermissionCallback
    private void afterBackground(PluginCall call) {
        // Back from a permission screen, the page may have ended the trip meanwhile.
        if (mStopped) {
            call.reject("The trip ended", "ended");
            return;
        }
        // Once, on the first trip: Android's own yes/no to leaving the app out of battery
        // optimisation, which some phones (Xiaomi, Samsung, Oppo) use to stop a trip in the
        // background (2.1.0). The trip starts either way.
        if (!SgBusPlugin.batteryFree(getContext()) && firstTime(ASKED_BATTERY)) {
            try {
                getActivity().startActivity(SgBusPlugin.batteryIntent(getContext()));
            } catch (android.content.ActivityNotFoundException ignored) {
                // A phone without the screen: nothing to ask.
            }
        }
        TripService.start(getContext(), call.getString("title", "On a trip"), call.getString("text", ""));
        call.resolve(status());
    }

    @PluginMethod
    public void update(PluginCall call) {
        TripService.update(getContext(), call.getString("title", "On a trip"), call.getString("text", ""));
        call.resolve();
    }

    // `quiet`: Settings has the alert's sound in earphones only (2.1.0). It buzzes, and sounds in
    // earphones if there are any, never out loud.
    @PluginMethod
    public void alert(PluginCall call) {
        boolean quiet = Boolean.TRUE.equals(call.getBoolean("quiet", false));
        JSObject out = new JSObject();
        out.put("shown", Notifications.post(getContext(), quiet ? Notifications.GET_OFF_QUIET : Notifications.GET_OFF, "get-off",
                call.getString("title", "Get Off Alert"), call.getString("body", ""), null));
        if (quiet && SgBusPlugin.earphones(getContext())) beepInEarphones();
        call.resolve(out);
    }

    // Three short beeps on the media stream, which goes to the earphones while they're in, as
    // the page's own beeps (js/trip.js) would.
    private void beepInEarphones() {
        new Thread(() -> {
            android.media.ToneGenerator tone = null;
            try {
                tone = new android.media.ToneGenerator(android.media.AudioManager.STREAM_MUSIC, 80);
                for (int i = 0; i < 3; i++) {
                    tone.startTone(android.media.ToneGenerator.TONE_PROP_BEEP, 180);
                    Thread.sleep(250);
                }
            } catch (RuntimeException | InterruptedException ignored) {
                // No tone this time: it still buzzes.
            } finally {
                if (tone != null) tone.release();
            }
        }, "get-off-beep").start();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        mStopped = true;
        TripService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    private JSObject status() {
        JSObject out = new JSObject();
        out.put("running", TripService.running());
        out.put("location", hasLocation(getContext()));
        out.put("background", hasBackground());
        out.put("notifications", Notifications.allowed(getContext()));
        Location last = TripService.last();
        if (last != null) out.put("last", fix(last));
        return out;
    }

    private static JSObject fix(Location l) {
        JSObject out = new JSObject();
        out.put("lat", l.getLatitude());
        out.put("lng", l.getLongitude());
        out.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : 9999);
        if (l.hasBearing()) out.put("heading", l.getBearing());
        if (l.hasSpeed()) out.put("speed", l.getSpeed());
        out.put("time", l.getTime());
        Pace pace = TripService.pace();
        String state = pace.state();
        if (state != null) out.put("pace", state);
        double kmh = pace.kmh();
        if (kmh >= 0) out.put("kmh", Math.round(kmh * 10) / 10.0);
        return out;
    }

    static void onFix(Location l) {
        TripPlugin plugin = sPlugin.get();
        if (plugin != null) plugin.notifyListeners("location", fix(l));
    }

    static void onEnd() {
        TripPlugin plugin = sPlugin.get();
        if (plugin != null) plugin.notifyListeners("end", new JSObject());
    }
}
