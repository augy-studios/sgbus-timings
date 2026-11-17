/*
 * Your favourite stops arriving from the phone's app (its WearSync.java puts them on the
 * Wearable Data Layer each time they change), kept for the tile, which is then drawn again.
 */
package org.uwuapps.sgbus.wear;

import androidx.wear.tiles.TileService;

import com.google.android.gms.wearable.DataEvent;
import com.google.android.gms.wearable.DataEventBuffer;
import com.google.android.gms.wearable.DataMapItem;
import com.google.android.gms.wearable.WearableListenerService;

public class FavouritesListener extends WearableListenerService {
    @Override
    public void onDataChanged(DataEventBuffer events) {
        for (DataEvent e : events) {
            if (e.getType() != DataEvent.TYPE_CHANGED || !Store.PATH.equals(e.getDataItem().getUri().getPath())) continue;
            String stops = DataMapItem.fromDataItem(e.getDataItem()).getDataMap().getString("stops");
            if (stops != null) Store.setFavourites(this, stops);
        }
        TileService.getUpdater(this).requestUpdate(TimingsTile.class);
    }
}
