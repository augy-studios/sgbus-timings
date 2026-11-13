/*
 * Your favourite stops, handed to the Wear OS app (android/native/wear/) over the Wearable
 * Data Layer each time the page sends them (SgBusPlugin.setFavourites): its tile shows the
 * nearest one's buses. Kept by Google Play services, so a watch paired later still gets them.
 * Nothing happens without a watch, or without Play services.
 */
package org.uwuapps.sgbus;

import android.content.Context;

import com.google.android.gms.wearable.PutDataMapRequest;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONArray;

final class WearSync {
    // Keep in step with wear/.../Store.PATH.
    private static final String PATH = "/favourites";

    private WearSync() {}

    static void send(Context c, JSONArray stops) {
        if (!OfflineSharePlugin.canNearby(c)) return;
        try {
            PutDataMapRequest req = PutDataMapRequest.create(PATH);
            req.getDataMap().putString("stops", stops.toString());
            Wearable.getDataClient(c).putDataItem(req.asPutDataRequest().setUrgent())
                    .addOnFailureListener(e -> { /* no Wear OS on this phone */ });
        } catch (RuntimeException ignored) {
            // The Wearable API isn't there: no watch to tell.
        }
    }
}
