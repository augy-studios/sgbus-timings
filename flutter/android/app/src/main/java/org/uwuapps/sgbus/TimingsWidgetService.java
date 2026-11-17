/*
 * The rows of the Bus timings widget (TimingsWidget.java): one per bus, with its next three
 * as minutes from now, worked out when they're drawn from when each is due. A list, so the
 * widget shows as many as fit at whatever size it's given, and scrolls for the rest.
 */
package org.uwuapps.sgbus;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

public class TimingsWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext(), intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0));
    }

    private static final class Rows implements RemoteViewsFactory {
        private final Context mContext;
        private final int mId;
        private JSONArray mRows = new JSONArray();
        private String mCode = "";

        Rows(Context context, int id) {
            mContext = context;
            mId = id;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            JSONObject data = WidgetStore.data(mContext, mId);
            JSONObject config = WidgetStore.config(mContext, mId);
            mRows = data == null || data.optJSONArray("rows") == null ? new JSONArray() : data.optJSONArray("rows");
            mCode = config == null ? "" : config.optString("code");
        }

        @Override
        public void onDestroy() {}

        @Override
        public int getCount() {
            return mRows.length();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews row = new RemoteViews(mContext.getPackageName(), R.layout.widget_row);
            JSONObject r = mRows.optJSONObject(position);
            if (r == null) return row;
            String service = r.optString("service");
            row.setTextViewText(R.id.widget_row_service, service);
            JSONArray arrivals = r.optJSONArray("arrivals");
            long now = System.currentTimeMillis();
            int[] cells = {R.id.widget_row_eta1, R.id.widget_row_eta2, R.id.widget_row_eta3};
            for (int i = 0; i < cells.length; i++) {
                String text = "";
                if (arrivals != null && i < arrivals.length()) {
                    long mins = (arrivals.optLong(i) - now) / 60000;
                    text = mins < 1 ? "Arr" : mins + " min";
                } else if (i == 0) {
                    text = "No estimate";
                }
                row.setTextViewText(cells[i], text);
            }
            // The stop, narrowed to this bus, in the app.
            row.setOnClickFillInIntent(R.id.widget_row, new Intent()
                    .putExtra(MainActivity.EXTRA_URL, MainActivity.SITE + "/#" + mCode + "," + service));
            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
