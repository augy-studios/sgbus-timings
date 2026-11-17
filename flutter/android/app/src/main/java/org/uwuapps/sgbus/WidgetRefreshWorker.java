/*
 * Refreshes every Bus timings widget (TimingsWidget.java) every 15 minutes while there's one
 * on the home screen: as often as Android lets an app wake itself for this, and only with a
 * connection. The widget's refresh button fetches at once in between.
 */
package org.uwuapps.sgbus;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

public class WidgetRefreshWorker extends Worker {
    private static final String NAME = "widget-refresh";

    public WidgetRefreshWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    static void schedule(Context context) {
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(WidgetRefreshWorker.class, 15, TimeUnit.MINUTES)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, work);
    }

    static void cancel(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context c = getApplicationContext();
        int[] ids = TimingsWidget.allIds(c);
        if (ids.length == 0) {
            cancel(c);
            return Result.success();
        }
        android.appwidget.AppWidgetManager manager = android.appwidget.AppWidgetManager.getInstance(c);
        for (int id : ids) {
            WidgetStore.refresh(c, id);
            TimingsWidget.draw(c, manager, id, false);
        }
        return Result.success();
    }
}
