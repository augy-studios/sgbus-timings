/*
 * The Bus timings widget for the home screen, like the website's for Windows 11's Widgets
 * board (main-site/sw.js): the next buses at a stop you pick, for every bus there or just the
 * ones you choose. Resizable any way: its buses are a list (TimingsWidgetService), which shows
 * as many as fit and scrolls for the rest.
 *
 * Set up when it's added (WidgetConfigActivity), and again from its stop's name. Refreshed by
 * its refresh button, when it's added or resized, and every 15 minutes while there's one
 * (WidgetRefreshWorker), which is as often as Android lets an app wake itself for this. Each
 * time is shown as minutes from when it's drawn, worked out from when the bus is due.
 */
package org.uwuapps.sgbus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class TimingsWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "org.uwuapps.sgbus.widget.REFRESH";
    private static final ExecutorService WORK = Executors.newSingleThreadExecutor();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        refresh(context, ids, goAsync());
        WidgetRefreshWorker.schedule(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (id != AppWidgetManager.INVALID_APPWIDGET_ID) {
                // Shown as refreshing at once, so the tap's seen to do something.
                draw(context, AppWidgetManager.getInstance(context), id, true);
                refresh(context, new int[] {id}, goAsync());
            }
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        draw(context, manager, id, false);
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        for (int id : ids) WidgetStore.forget(context, id);
    }

    @Override
    public void onDisabled(Context context) {
        WidgetRefreshWorker.cancel(context);
    }

    static int[] allIds(Context context) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, TimingsWidget.class));
    }

    // Fetches each one's timings off the main thread, then draws them.
    static void refresh(Context context, int[] ids, PendingResult async) {
        Context app = context.getApplicationContext();
        WORK.execute(() -> {
            try {
                AppWidgetManager manager = AppWidgetManager.getInstance(app);
                for (int id : ids) {
                    WidgetStore.refresh(app, id);
                    draw(app, manager, id, false);
                }
            } finally {
                if (async != null) async.finish();
            }
        });
    }

    static void draw(Context context, AppWidgetManager manager, int id, boolean refreshing) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_timings);
        JSONObject config = WidgetStore.config(context, id);

        // Its stop's name opens the setup, to pick another.
        Intent setup = new Intent(context, WidgetConfigActivity.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                .setData(Uri.parse("sgbus-widget://setup/" + id));
        PendingIntent openSetup = PendingIntent.getActivity(context, id, setup,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_header, openSetup);

        if (config == null) {
            // No stop yet: anywhere on it opens the setup, as its "Tap here to pick a stop" says,
            // not just the title.
            views.setOnClickPendingIntent(android.R.id.background, openSetup);
            views.setOnClickPendingIntent(R.id.widget_empty, openSetup);
            views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_pick));
            views.setTextViewText(R.id.widget_subtitle, "");
            views.setViewVisibility(R.id.widget_list, View.GONE);
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, context.getString(R.string.widget_pick_help));
            views.setTextViewText(R.id.widget_updated, "");
            manager.updateAppWidget(id, views);
            return;
        }

        String code = config.optString("code");
        JSONArray buses = config.optJSONArray("buses");
        StringBuilder which = new StringBuilder();
        for (int i = 0; buses != null && i < buses.length(); i++) which.append(i == 0 ? "" : ", ").append(buses.optString(i));
        String name = config.optString("name");
        views.setTextViewText(R.id.widget_title, name.isEmpty() ? "Bus stop " + code : name);
        views.setTextViewText(R.id.widget_subtitle, code + " · " + (which.length() == 0 ? "Every bus" : "Bus " + which));

        // The buses: a list, filled by TimingsWidgetService, as many as the widget's size shows.
        Intent list = new Intent(context, TimingsWidgetService.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
                .setData(Uri.parse("sgbus-widget://rows/" + id + "/" + System.currentTimeMillis()));
        views.setRemoteAdapter(R.id.widget_list, list);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);
        // Tapping a bus opens the stop in the app.
        Intent open = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        views.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getActivity(context, 10000 + id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));
        // Anywhere else on it (around the list, or its "No buses" note) opens the stop in the app.
        Intent stop = new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP)
                .putExtra(MainActivity.EXTRA_URL, MainActivity.SITE + "/#" + code)
                .setData(Uri.parse("sgbus-widget://stop/" + id));
        PendingIntent openStop = PendingIntent.getActivity(context, 20000 + id, stop,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(android.R.id.background, openStop);
        views.setOnClickPendingIntent(R.id.widget_empty, openStop);

        JSONObject data = WidgetStore.data(context, id);
        boolean none = data == null || data.optJSONArray("rows") == null || data.optJSONArray("rows").length() == 0;
        views.setViewVisibility(R.id.widget_list, View.VISIBLE);
        views.setTextViewText(R.id.widget_empty, refreshing || data == null ? context.getString(R.string.widget_loading)
                : data.optBoolean("error") && none ? context.getString(R.string.widget_offline)
                : which.length() > 0 ? context.getString(R.string.widget_none_of_those) : context.getString(R.string.widget_none));

        String updated = refreshing ? context.getString(R.string.widget_refreshing)
                : data == null ? "" : (data.optBoolean("error") ? context.getString(R.string.widget_offline_short) + " · " : "")
                + context.getString(R.string.widget_updated, clock(data.optLong("at")));
        views.setTextViewText(R.id.widget_updated, updated);

        Intent refresh = new Intent(context, TimingsWidget.class).setAction(ACTION_REFRESH)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        views.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, id, refresh,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        manager.updateAppWidget(id, views);
        manager.notifyAppWidgetViewDataChanged(id, R.id.widget_list);
    }

    static String clock(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("HH:mm", Locale.UK);
        f.setTimeZone(TimeZone.getTimeZone("Asia/Singapore"));
        return f.format(new Date(ms));
    }
}
