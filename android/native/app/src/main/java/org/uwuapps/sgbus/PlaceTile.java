/*
 * The Quick Settings tiles Bus home and Bus to work (PlaceShortcuts): a tap opens Navigate from
 * where you are to Home or Work in Places. Unavailable, greyed out, until that place is set.
 */
package org.uwuapps.sgbus;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

import org.json.JSONObject;

public abstract class PlaceTile extends TileService {
    abstract String kind();

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile == null) return;
        JSONObject p = PlaceShortcuts.place(this, kind());
        tile.setState(p == null ? Tile.STATE_UNAVAILABLE : Tile.STATE_INACTIVE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            tile.setSubtitle(p == null ? "Set it in Places" : "By bus and train");
        }
        tile.updateTile();
    }

    @Override
    public void onClick() {
        super.onClick();
        JSONObject p = PlaceShortcuts.place(this, kind());
        if (p == null) return;
        if (isLocked()) unlockAndRun(() -> open(p));
        else open(p);
    }

    // The Intent overload, before Android 14 only, where the PendingIntent one doesn't exist.
    @SuppressWarnings("deprecation")
    @SuppressLint("StartActivityAndCollapseDeprecated")
    private void open(JSONObject p) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(p.optString("url")))
                .setClass(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startActivityAndCollapse(PendingIntent.getActivity(this, kind().hashCode(), intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(intent);
        }
    }

    public static class Home extends PlaceTile {
        @Override
        String kind() {
            return "home";
        }
    }

    public static class Work extends PlaceTile {
        @Override
        String kind() {
            return "work";
        }
    }
}
