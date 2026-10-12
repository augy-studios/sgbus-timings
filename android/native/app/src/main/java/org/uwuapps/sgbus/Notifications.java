/*
 * The app's notification channels, each its own switch in Android's settings for the app, and
 * the notifications the page asks for (SgBusPlugin.notify, TripPlugin.alert):
 *
 *   alerts   Service Alerts: train disruptions and traffic incidents, from the server
 *   get_off  the Get Off Alert: loud, buzzing "OFF" in Morse code, over the lock screen
 *   board    Get ready to board: your bus is a minute from the stop you're waiting at
 *   trip     the trip being followed, while it runs (TripService): silent
 *
 * The server's pushes name the same channels (main-site/api/_push/fcm.js), and Android only
 * takes a channel's sound and buzz from when it's made, so changing one means a new id.
 */
package org.uwuapps.sgbus;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

final class Notifications {
    static final String ALERTS = "alerts";
    static final String GET_OFF = "get_off";
    static final String BOARD = "board";
    static final String TRIP = "trip";

    // "OFF" in Morse code (--- ..-. ..-.), as main-site/js/trip.js buzzes it in the page: a wait
    // first, then buzz and pause in turn.
    static final long[] OFF = {
            0, 360, 120, 360, 120, 360, 360,
            120, 120, 120, 120, 360, 120, 120, 360,
            120, 120, 120, 120, 360, 120, 120,
    };

    // Two short buzzes for Get ready to board, as main-site/js/trip.js buzzes it in the page.
    static final long[] BOARD_BUZZ = {0, 200, 120, 200};

    private Notifications() {}

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);

        NotificationChannel alerts = new NotificationChannel(ALERTS, "Service alerts",
                NotificationManager.IMPORTANCE_DEFAULT);
        alerts.setDescription("Train disruptions and traffic incidents, as you chose in Service Alerts");

        NotificationChannel getOff = new NotificationChannel(GET_OFF, "Get Off Alert",
                NotificationManager.IMPORTANCE_HIGH);
        getOff.setDescription("Two stops before you get off, on a trip");
        getOff.enableVibration(true);
        getOff.setVibrationPattern(OFF);
        getOff.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        getOff.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());

        NotificationChannel board = new NotificationChannel(BOARD, "Get ready to board",
                NotificationManager.IMPORTANCE_HIGH);
        board.setDescription("On a trip, when the bus you're waiting for is a minute away");
        board.enableVibration(true);
        board.setVibrationPattern(BOARD_BUZZ);
        board.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        NotificationChannel trip = new NotificationChannel(TRIP, "Trip in progress",
                NotificationManager.IMPORTANCE_LOW);
        trip.setDescription("Shown while a trip follows where you are, for the Get Off Alert");
        trip.setShowBadge(false);

        manager.createNotificationChannel(alerts);
        manager.createNotificationChannel(getOff);
        manager.createNotificationChannel(board);
        manager.createNotificationChannel(trip);
    }

    // Opens the app on `url` (one of the site's pages), or as it is when that's null.
    static PendingIntent open(Context context, String url, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null) intent.putExtra(MainActivity.EXTRA_URL, url);
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean allowed(Context context) {
        return NotificationManagerCompat.from(context).areNotificationsEnabled();
    }

    // A notification on `channel`, replacing any other with the same tag.
    @SuppressWarnings("MissingPermission") // allowed() is checked first
    static boolean post(Context context, String channel, String tag, String title, String body, String url) {
        if (!allowed(context)) return false;
        boolean getOff = GET_OFF.equals(channel);
        NotificationCompat.Builder n = new NotificationCompat.Builder(context, channel)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(open(context, url, tag.hashCode()));
        if (getOff) {
            n.setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setVibrate(OFF)
                    .setDefaults(NotificationCompat.DEFAULT_SOUND);
        } else if (BOARD.equals(channel)) {
            n.setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_REMINDER)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setVibrate(BOARD_BUZZ)
                    .setDefaults(NotificationCompat.DEFAULT_SOUND);
        }
        NotificationManagerCompat.from(context).notify(tag, 0, n.build());
        return true;
    }
}
