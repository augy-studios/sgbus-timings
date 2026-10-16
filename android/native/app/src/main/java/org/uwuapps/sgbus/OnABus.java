/*
 * "On a bus?" (RemindersPlugin.onABus, main-site/js/reminders.js): when Google Play services'
 * activity recognition says the phone has started riding in a vehicle and no trip is running,
 * a quiet notification offers to start one, for the Get Off Alert. It can't know which bus or
 * where to, so it only opens Navigate; at most once every QUIET_MS, and gone after a while.
 * A car or taxi counts as a vehicle too; that's the price of not knowing.
 *
 * Needs "Physical activity" (Android 10 and later). The watch doesn't outlast a restart of the
 * phone: BootReceiver sets it again.
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
import android.os.SystemClock;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.ActivityRecognition;
import com.google.android.gms.location.ActivityTransition;
import com.google.android.gms.location.ActivityTransitionEvent;
import com.google.android.gms.location.ActivityTransitionRequest;
import com.google.android.gms.location.ActivityTransitionResult;
import com.google.android.gms.location.DetectedActivity;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;

import java.util.Collections;

final class OnABus {
    private static final String PREFS = "on_a_bus";
    private static final String ON = "on";
    private static final String SHOWN = "shown";
    private static final long QUIET_MS = 2 * 60 * 60 * 1000;
    private static final long SHOW_FOR_MS = 15 * 60 * 1000;
    // An event older than this, delivered late, is about a ride that's long under way.
    private static final long FRESH_NS = 5L * 60 * 1000 * 1000 * 1000;
    private static final String TAG = "on-a-bus";

    private OnABus() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean on(Context c) {
        return prefs(c).getBoolean(ON, false);
    }

    static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || ContextCompat.checkSelfPermission(c, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private static PendingIntent events(Context c) {
        return PendingIntent.getBroadcast(c, 0, new Intent(c, Receiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0));
    }

    static Task<Void> setOn(Context c, boolean on) {
        prefs(c).edit().putBoolean(ON, on).apply();
        return arm(c);
    }

    @SuppressWarnings("MissingPermission") // allowed() is checked first
    static Task<Void> arm(Context c) {
        Context app = c.getApplicationContext();
        if (!on(app)) return ActivityRecognition.getClient(app).removeActivityTransitionUpdates(events(app));
        if (!allowed(app)) return Tasks.forException(new SecurityException("Physical activity isn't allowed"));
        ActivityTransitionRequest request = new ActivityTransitionRequest(Collections.singletonList(
                new ActivityTransition.Builder()
                        .setActivityType(DetectedActivity.IN_VEHICLE)
                        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
                        .build()));
        return ActivityRecognition.getClient(app).requestActivityTransitionUpdates(request, events(app));
    }

    public static class Receiver extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!on(context) || !ActivityTransitionResult.hasResult(intent)) return;
            ActivityTransitionResult result = ActivityTransitionResult.extractResult(intent);
            if (result == null) return;
            boolean riding = false;
            for (ActivityTransitionEvent e : result.getTransitionEvents()) {
                if (e.getActivityType() == DetectedActivity.IN_VEHICLE
                        && e.getTransitionType() == ActivityTransition.ACTIVITY_TRANSITION_ENTER
                        && SystemClock.elapsedRealtimeNanos() - e.getElapsedRealTimeNanos() < FRESH_NS) riding = true;
            }
            long now = System.currentTimeMillis();
            if (!riding || TripService.running() || now - prefs(context).getLong(SHOWN, 0) < QUIET_MS) return;
            prefs(context).edit().putLong(SHOWN, now).apply();
            NotificationCompat.Builder n = Notifications.builder(context, Notifications.ON_A_BUS, TAG,
                            "On a bus or train?",
                            "Start a trip for the Get Off Alert: tap, and pick where you're going.",
                            MainActivity.SITE + "/#nav")
                    .setSilent(true)
                    .setTimeoutAfter(SHOW_FOR_MS)
                    .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION);
            Notifications.show(context, TAG, n);
        }
    }
}
