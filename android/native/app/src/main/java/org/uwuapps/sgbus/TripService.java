/*
 * A trip being followed with the screen off or the app in the background, for the Get Off
 * Alert (TripPlugin, main-site/js/trip.js): a foreground service of the location type, so
 * Android keeps the app running and its location coming while the trip lasts, with the
 * notification Android requires for one ("On a trip: 3 stops to Bedok Int"), which the page
 * keeps up to date. Its End button ends the trip in the page too.
 *
 * Each fix goes to the page (TripPlugin.onFix), which works out the rest as it does in a
 * browser, with whether you're walking or riding by your average speed (Pace), as the page
 * can't feel your steps with the screen off. A partial wake lock keeps the page's clock running between fixes, as underground,
 * where GPS gives out and the trip goes by the time each ride should take; it's let go when
 * the trip ends, and after MAX_MS whatever happens.
 *
 * Swiping the app away ends it (stopWithTask in AndroidManifest.xml): the page that follows
 * the trip is gone then, and the server carries on with the alert (api/push/trip-poll.js).
 */
package org.uwuapps.sgbus;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class TripService extends Service {
    static final String ACTION_START = "org.uwuapps.sgbus.trip.START";
    static final String ACTION_UPDATE = "org.uwuapps.sgbus.trip.UPDATE";
    static final String ACTION_END = "org.uwuapps.sgbus.trip.END"; // the notification's End button
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    // How the notification looks for the part of the trip you're on (2.2.7, help desk #6):
    // "bus", "train" or "walk" for its icon, the line's colour ("#009645") and "EW Line".
    static final String EXTRA_ICON = "icon";
    static final String EXTRA_COLOR = "color";
    static final String EXTRA_SUB = "sub";

    private static final int NOTIFICATION_ID = 7001;
    // Twenty fixes a second, as fast as the GPS will give them, so the trip follows the bus
    // closely along its road (js/trip.js); most phones' GPS gives one to ten a second at most.
    private static final long FIX_MS = 50;
    private static final long FASTEST_MS = 50;
    // No trip runs this long; the wake lock goes after it even if the page never says it's over.
    private static final long MAX_MS = 4L * 60 * 60 * 1000;

    private static volatile boolean sRunning;
    private static volatile Location sLast;
    private static volatile Pace sPace = new Pace();

    private FusedLocationProviderClient mLocations;
    private PowerManager.WakeLock mWake;
    private String mTitle = "On a trip";
    private String mText = "";
    private String mIcon = null;
    private Integer mColor = null;
    private String mSub = null;

    private final LocationCallback mCallback = new LocationCallback() {
        @Override
        public void onLocationResult(@NonNull LocationResult result) {
            Location fix = result.getLastLocation();
            if (fix == null) return;
            sLast = fix;
            sPace.add(fix);
            TripPlugin.onFix(fix);
        }
    };

    static boolean running() {
        return sRunning;
    }

    @Nullable
    static Location last() {
        return sLast;
    }

    static Pace pace() {
        return sPace;
    }

    static void start(Context context, String title, String text, String icon, String color, String sub) {
        Intent intent = new Intent(context, TripService.class).setAction(sRunning ? ACTION_UPDATE : ACTION_START)
                .putExtra(EXTRA_TITLE, title).putExtra(EXTRA_TEXT, text)
                .putExtra(EXTRA_ICON, icon).putExtra(EXTRA_COLOR, color).putExtra(EXTRA_SUB, sub);
        if (sRunning) context.startService(intent);
        else ContextCompat.startForegroundService(context, intent);
    }

    static void update(Context context, String title, String text, String icon, String color, String sub) {
        if (!sRunning) return;
        context.startService(new Intent(context, TripService.class).setAction(ACTION_UPDATE)
                .putExtra(EXTRA_TITLE, title).putExtra(EXTRA_TEXT, text)
                .putExtra(EXTRA_ICON, icon).putExtra(EXTRA_COLOR, color).putExtra(EXTRA_SUB, sub));
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, TripService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_END.equals(action)) {
            TripPlugin.onEnd();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null) {
            if (intent.getStringExtra(EXTRA_TITLE) != null) mTitle = intent.getStringExtra(EXTRA_TITLE);
            if (intent.getStringExtra(EXTRA_TEXT) != null) mText = intent.getStringExtra(EXTRA_TEXT);
            if (intent.getStringExtra(EXTRA_ICON) != null) mIcon = intent.getStringExtra(EXTRA_ICON);
            if (intent.getStringExtra(EXTRA_SUB) != null) mSub = intent.getStringExtra(EXTRA_SUB);
            String color = intent.getStringExtra(EXTRA_COLOR);
            if (color != null) {
                try {
                    mColor = android.graphics.Color.parseColor(color);
                } catch (IllegalArgumentException e) {
                    mColor = null;
                }
            }
        }
        if (!sRunning) {
            // Started with no location permission (it can be taken away in settings mid-trip):
            // nothing to follow, and Android won't run a location service without it.
            if (!TripPlugin.hasLocation(this)) {
                stopSelf();
                return START_NOT_STICKY;
            }
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(),
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
            sRunning = true;
            sLast = null;
            sPace = new Pace();
            follow();
            hold();
        } else {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(),
                    Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
        }
        // Not restarted if Android stops it: only the page knows the trip.
        return START_NOT_STICKY;
    }

    @SuppressLint("MissingPermission") // checked in onStartCommand
    private void follow() {
        mLocations = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, FIX_MS)
                .setMinUpdateIntervalMillis(FASTEST_MS)
                .setWaitForAccurateLocation(false)
                .build();
        try {
            mLocations.requestLocationUpdates(request, mCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
    }

    private void hold() {
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        mWake = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sgbus:trip");
        mWake.setReferenceCounted(false);
        mWake.acquire(MAX_MS);
    }

    // The icon for the part you're on: the app's own until the page says (an older page never does).
    private int icon() {
        if ("train".equals(mIcon)) return R.drawable.ic_trip_train;
        if ("walk".equals(mIcon)) return R.drawable.ic_trip_walk;
        if ("bus".equals(mIcon)) return R.drawable.ic_trip_bus;
        return R.drawable.ic_notification_icon;
    }

    private Notification notification() {
        PendingIntent end = PendingIntent.getService(this, 1,
                new Intent(this, TripService.class).setAction(ACTION_END),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, Notifications.TRIP);
        // Tinted the line's colour where Android tints a notification's icon and name.
        if (mColor != null) builder.setColor(mColor);
        if (mSub != null && !mSub.isEmpty()) builder.setSubText(mSub);
        return builder
                .setSmallIcon(icon())
                .setContentTitle(mTitle)
                .setContentText(mText)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setContentIntent(Notifications.open(this, null, NOTIFICATION_ID))
                .addAction(0, "End trip", end)
                .build();
    }

    @Override
    public void onDestroy() {
        sRunning = false;
        if (mLocations != null) mLocations.removeLocationUpdates(mCallback);
        if (mWake != null && mWake.isHeld()) mWake.release();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
