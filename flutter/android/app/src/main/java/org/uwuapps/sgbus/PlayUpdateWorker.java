/*
 * "New versions of the app" in the Google Play build (BuildConfig.PLAY): once a day, with a
 * connection, asks Google Play whether it has a newer version of the app for this phone (Play's
 * in-app updates library), and if so says so once on the releases channel. Tapping it opens the
 * app's page in the Play Store.
 *
 * GitHub's APK hears from the server instead, the moment a release is published (the
 * sgbus-releases FCM topic, SgBusPlugin.setReleases). That push would reach a Play build before
 * Play offered the version, which comes after its review and as its rollout reaches each phone,
 * so the Play build asks Play itself: it only says so once Play would let you update.
 *
 * Turned on and off by SgBusPlugin.setReleases. WorkManager keeps it through restarts and updates.
 */
package org.uwuapps.sgbus;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.android.gms.tasks.Tasks;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.UpdateAvailability;

import java.util.concurrent.TimeUnit;

public class PlayUpdateWorker extends Worker {
    private static final String NAME = "play-update-check";
    private static final String TAG = "release";
    // Shared with SgBusPlugin's "on": the versionCode last said, so each version is said once.
    private static final String PREFS = "sgbus.releases";
    private static final String TOLD = "playTold";
    private static final String PLAY_STORE = "com.android.vending";

    public PlayUpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        if (!BuildConfig.PLAY) return;
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(PlayUpdateWorker.class, 1, TimeUnit.DAYS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, work);
    }

    static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(NAME);
        Notifications.cancel(context, TAG);
    }

    // As the app starts: the notification goes once the version it was about is installed.
    static void clearIfUpdated(Context context) {
        if (!BuildConfig.PLAY) return;
        int told = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(TOLD, 0);
        if (told != 0 && BuildConfig.VERSION_CODE >= told) Notifications.cancel(context, TAG);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        if (!BuildConfig.PLAY) {
            cancel(c);
            return Result.success();
        }
        AppUpdateInfo info;
        try {
            info = Tasks.await(AppUpdateManagerFactory.create(c).getAppUpdateInfo(), 60, TimeUnit.SECONDS);
        } catch (Exception e) {
            // Play unreachable, or the app not installed from Play: tomorrow, as ever.
            return Result.success();
        }
        int code = info.availableVersionCode();
        if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE || code <= BuildConfig.VERSION_CODE) {
            Notifications.cancel(c, TAG);
            return Result.success();
        }
        android.content.SharedPreferences prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (code <= prefs.getInt(TOLD, 0)) return Result.success();
        String body = "A new version is ready on Google Play. Tap to update.";
        NotificationCompat.Builder n = new NotificationCompat.Builder(c, Notifications.RELEASES)
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentTitle("SG Bus Timings has an update")
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(openPlay(c));
        // Said only once it's shown: with notifications off, it's said when they're on again.
        if (Notifications.show(c, TAG, n)) prefs.edit().putInt(TOLD, code).apply();
        return Result.success();
    }

    // The app's page in the Play Store, which is there: only Play's own answer gets this far.
    private static PendingIntent openPlay(Context c) {
        Intent store = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + c.getPackageName()))
                .setPackage(PLAY_STORE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, TAG.hashCode(), store, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
