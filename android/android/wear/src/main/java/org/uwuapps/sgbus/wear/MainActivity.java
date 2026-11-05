/*
 * The watch's screen: your favourite stops, nearest first, and the next buses at the one
 * picked (the nearest to start with). Asks once for the watch's location, to know which is
 * nearest, for here and the tile (TimingsTile). Plain views, scrolled with the crown.
 */
package org.uwuapps.sgbus.wear;

import android.Manifest;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.location.Location;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.wear.tiles.TileService;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int ASK_LOCATION = 1;
    private static final int BRAND = 0xFFCCFFCC;
    private static final int GREY = 0xFFAAAAAA;

    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private LinearLayout list;
    private ScrollView scroll;
    private String picked;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        scroll = new ScrollView(this);
        scroll.setBackgroundColor(Color.BLACK);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        list.setGravity(Gravity.CENTER_HORIZONTAL);
        // Round screens: room at the top and bottom, and in from the edges.
        int side = dp(18), ends = dp(28);
        list.setPadding(side, ends, side, ends);
        scroll.addView(list);
        setContentView(scroll);
        if (!Store.canLocate(this)) requestPermissions(new String[]{Manifest.permission.ACCESS_COARSE_LOCATION}, ASK_LOCATION);
        load();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        load();
        TileService.getUpdater(this).requestUpdate(TimingsTile.class);
    }

    @Override
    protected void onDestroy() {
        work.shutdown();
        super.onDestroy();
    }

    private void load() {
        list.removeAllViews();
        list.addView(text("Getting the timings…", 14, GREY, false));
        work.execute(() -> {
            if (Store.favourites(this).length() == 0) Store.pullFavourites(this);
            Location here = Store.where(this);
            List<JSONObject> stops = Store.byDistance(this, here);
            JSONObject stop = null;
            for (JSONObject s : stops) if (s.optString("code").equals(picked)) stop = s;
            if (stop == null && !stops.isEmpty()) stop = stops.get(0);
            List<Store.Bus> buses = null;
            String error = null;
            if (stop != null) {
                try {
                    buses = Store.timings(stop.optString("code"));
                } catch (Exception e) {
                    error = "Couldn’t get the timings just now.";
                }
            }
            JSONObject shown = stop;
            List<Store.Bus> got = buses;
            String why = error;
            main.post(() -> show(stops, shown, got, why, here != null));
        });
    }

    private void show(List<JSONObject> stops, JSONObject stop, List<Store.Bus> buses, String error, boolean located) {
        list.removeAllViews();
        if (stop == null) {
            list.addView(text("Star your stops in SG Bus Timings on your phone, and they show up here.", 14, Color.WHITE, false));
            return;
        }
        list.addView(text(stop.optString("name", stop.optString("code")), 16, BRAND, true));
        list.addView(text(stop.optString("code") + (located && stop == stops.get(0) ? " · nearest" : ""), 12, GREY, false));
        if (error != null) {
            list.addView(text(error, 14, Color.WHITE, false));
        } else if (buses.isEmpty()) {
            list.addView(text("No buses due right now.", 14, Color.WHITE, false));
        } else {
            for (Store.Bus b : buses) {
                StringBuilder when = new StringBuilder();
                for (int i = 0; i < b.arrivals.size() && i < 2; i++) {
                    if (i > 0) when.append(", ");
                    when.append(Store.minutes(b.arrivals.get(i)));
                }
                TextView row = text(b.service + "   " + when, 15, Color.WHITE, false);
                row.setGravity(Gravity.START);
                list.addView(row);
            }
        }
        Button refresh = new Button(this);
        refresh.setText("Refresh");
        refresh.setOnClickListener(v -> load());
        list.addView(refresh);
        if (stops.size() > 1) {
            list.addView(text("Your other stops", 12, GREY, false));
            for (JSONObject s : stops) {
                if (s == stop) continue;
                Button b = new Button(this);
                b.setText(s.optString("name", s.optString("code")));
                b.setAllCaps(false);
                b.setOnClickListener(v -> {
                    picked = s.optString("code");
                    scroll.scrollTo(0, 0);
                    load();
                });
                list.addView(b);
            }
        }
    }

    private TextView text(String s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setPadding(0, dp(3), 0, dp(3));
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setLayoutParams(new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        t.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        return t;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
