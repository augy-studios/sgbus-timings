/*
 * Bus home and Bus to work: Home and Work from the page's Places (SgBusPlugin.setPlaces), as
 * long-press shortcuts on the app's icon and as Quick Settings tiles (PlaceTile). Each opens
 * Navigate from where you are to there. Kept here too for LeaveTime, which plans from Home
 * when the phone won't say where you are.
 *
 * The launcher shows two static shortcuts (res/xml/shortcuts.xml) and two of these at most,
 * so with Home or Work set, Near me and Navigate stay and Alerts and Card value make way.
 */
package org.uwuapps.sgbus;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.service.quicksettings.TileService;

import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

final class PlaceShortcuts {
    private static final String PREFS = "places";

    private PlaceShortcuts() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // { label, lat, lng, url } for "home" or "work", or null if it isn't set.
    static JSONObject place(Context c, String kind) {
        try {
            String s = prefs(c).getString(kind, null);
            return s == null ? null : new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    // `url` must be a link to the site: Navigate's, from the page.
    static void set(Context c, JSONObject home, JSONObject work) {
        SharedPreferences.Editor edit = prefs(c).edit();
        for (String kind : new String[]{"home", "work"}) {
            JSONObject p = "home".equals(kind) ? home : work;
            if (p != null && p.optString("url").startsWith(MainActivity.SITE + "/")) edit.putString(kind, p.toString());
            else edit.remove(kind);
        }
        edit.apply();
        refresh(c);
    }

    static void refresh(Context c) {
        List<ShortcutInfoCompat> list = new ArrayList<>();
        String[][] kinds = {{"home", "Bus home", "Bus home from here"}, {"work", "Bus to work", "Bus to work from here"}};
        for (String[] k : kinds) {
            JSONObject p = place(c, k[0]);
            if (p == null) continue;
            Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse(p.optString("url"))).setClass(c, MainActivity.class);
            list.add(new ShortcutInfoCompat.Builder(c, k[0])
                    .setShortLabel(k[1])
                    .setLongLabel(k[2])
                    .setIcon(IconCompat.createWithResource(c, "home".equals(k[0]) ? R.drawable.shortcut_home : R.drawable.shortcut_work))
                    .setIntent(open)
                    .setRank(list.size())
                    .build());
        }
        try {
            if (list.isEmpty()) ShortcutManagerCompat.removeAllDynamicShortcuts(c);
            else ShortcutManagerCompat.setDynamicShortcuts(c, list);
        } catch (IllegalStateException | IllegalArgumentException ignored) {
            // Rate-limited, or the launcher won't: the next change tries again.
        }
        // The tiles, if they're in Quick Settings, show whether they've somewhere to go.
        TileService.requestListeningState(c, new ComponentName(c, PlaceTile.Home.class));
        TileService.requestListeningState(c, new ComponentName(c, PlaceTile.Work.class));
    }
}
