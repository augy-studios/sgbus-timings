/*
 * The Bus timings tile: your nearest favourite stop's next buses, the minutes counting down on
 * the watch by themselves (ProtoLayout's dynamic time) between fetches. Fetched again each
 * time the tile's shown after a minute or more (its freshness), and when the phone sends
 * new favourites (FavouritesListener). A tap opens the watch's screen (MainActivity).
 *
 * Nearest by the watch's location (or the phone's, through it) once it's allowed on that
 * screen; until then, your first favourite.
 */
package org.uwuapps.sgbus.wear;

import android.location.Location;

import androidx.annotation.NonNull;
import androidx.concurrent.futures.CallbackToFutureAdapter;
import androidx.wear.protolayout.ActionBuilders;
import androidx.wear.protolayout.ColorBuilders;
import androidx.wear.protolayout.DimensionBuilders;
import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.ModifiersBuilders;
import androidx.wear.protolayout.ResourceBuilders;
import androidx.wear.protolayout.TimelineBuilders;
import androidx.wear.protolayout.TypeBuilders;
import androidx.wear.protolayout.expression.DynamicBuilders;
import androidx.wear.tiles.RequestBuilders;
import androidx.wear.tiles.TileBuilders;
import androidx.wear.tiles.TileService;

import com.google.common.util.concurrent.ListenableFuture;

import org.json.JSONObject;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class TimingsTile extends TileService {
    private static final String RESOURCES = "1";
    private static final long FRESH_MS = 60 * 1000;
    private static final int ROWS = 4;
    // The app's green, and the watch's white and grey.
    private static final int BRAND = 0xFFCCFFCC;
    private static final int WHITE = 0xFFFFFFFF;
    private static final int GREY = 0xFFAAAAAA;

    private final ExecutorService work = Executors.newSingleThreadExecutor();

    @NonNull
    @Override
    protected ListenableFuture<TileBuilders.Tile> onTileRequest(@NonNull RequestBuilders.TileRequest request) {
        return CallbackToFutureAdapter.getFuture(done -> {
            work.execute(() -> {
                try {
                    done.set(tile(layout()));
                } catch (Exception e) {
                    done.set(tile(message("Couldn’t get the timings just now.")));
                }
            });
            return "timings tile";
        });
    }

    @NonNull
    @Override
    protected ListenableFuture<ResourceBuilders.Resources> onTileResourcesRequest(@NonNull RequestBuilders.ResourcesRequest request) {
        return CallbackToFutureAdapter.getFuture(done -> {
            done.set(new ResourceBuilders.Resources.Builder().setVersion(RESOURCES).build());
            return "timings tile resources";
        });
    }

    @Override
    public void onDestroy() {
        work.shutdown();
        super.onDestroy();
    }

    private TileBuilders.Tile tile(LayoutElementBuilders.LayoutElement content) {
        return new TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES)
                .setFreshnessIntervalMillis(FRESH_MS)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(openOnTap(content)))
                .build();
    }

    private LayoutElementBuilders.LayoutElement layout() throws Exception {
        if (Store.favourites(this).length() == 0) Store.pullFavourites(this);
        Location here = Store.where(this);
        List<JSONObject> stops = Store.byDistance(this, here);
        if (stops.isEmpty()) return message("Star your stops in SG Bus Timings on your phone, and they show up here.");
        JSONObject stop = stops.get(0);
        String code = stop.optString("code");
        List<Store.Bus> buses = Store.timings(code);

        LayoutElementBuilders.Column.Builder col = new LayoutElementBuilders.Column.Builder()
                .setWidth(DimensionBuilders.expand())
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .addContent(text(stop.optString("name", code), 14, BRAND, true))
                .addContent(text(here == null ? code + " · first favourite" : code + " · nearest favourite", 11, GREY, false))
                .addContent(gap(6));
        if (buses.isEmpty()) col.addContent(text("No buses due right now", 13, WHITE, false));
        for (int i = 0; i < buses.size() && i < ROWS; i++) {
            Store.Bus b = buses.get(i);
            LayoutElementBuilders.Row.Builder row = new LayoutElementBuilders.Row.Builder()
                    .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                    .addContent(text(b.service, 15, BRAND, true))
                    .addContent(gapWide(8))
                    .addContent(countdown(b.arrivals.get(0), WHITE));
            if (b.arrivals.size() > 1) {
                row.addContent(gapWide(6)).addContent(countdown(b.arrivals.get(1), GREY));
            }
            col.addContent(row.build());
        }
        return col.build();
    }

    // Minutes to `at`, counting down on the watch: "Arr" once it's due.
    private LayoutElementBuilders.LayoutElement countdown(long at, int color) {
        DynamicBuilders.DynamicInt32 mins = DynamicBuilders.DynamicInstant.platformTimeWithSecondsPrecision()
                .durationUntil(DynamicBuilders.DynamicInstant.withSecondsPrecision(Instant.ofEpochMilli(at)))
                .toIntMinutes();
        DynamicBuilders.DynamicString said = DynamicBuilders.DynamicString.onCondition(mins.lte(0))
                .use("Arr")
                .elseUse(mins.format().concat(DynamicBuilders.DynamicString.constant(" min")));
        return new LayoutElementBuilders.Text.Builder()
                .setText(new TypeBuilders.StringProp.Builder(Store.minutes(at)).setDynamicValue(said).build())
                .setLayoutConstraintsForDynamicText(new TypeBuilders.StringLayoutConstraint.Builder("00 min").build())
                .setFontStyle(style(14, color, false))
                .build();
    }

    private LayoutElementBuilders.LayoutElement message(String text) {
        return new LayoutElementBuilders.Text.Builder()
                .setText(text)
                .setMaxLines(4)
                .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
                .setFontStyle(style(13, WHITE, false))
                .build();
    }

    private static LayoutElementBuilders.LayoutElement text(String s, float sp, int color, boolean bold) {
        return new LayoutElementBuilders.Text.Builder()
                .setText(s)
                .setMaxLines(1)
                .setFontStyle(style(sp, color, bold))
                .build();
    }

    private static LayoutElementBuilders.FontStyle style(float sp, int color, boolean bold) {
        return new LayoutElementBuilders.FontStyle.Builder()
                .setSize(DimensionBuilders.sp(sp))
                .setColor(ColorBuilders.argb(color))
                .setWeight(bold ? LayoutElementBuilders.FONT_WEIGHT_BOLD : LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                .build();
    }

    private static LayoutElementBuilders.LayoutElement gap(float dp) {
        return new LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(dp)).build();
    }

    private static LayoutElementBuilders.LayoutElement gapWide(float dp) {
        return new LayoutElementBuilders.Spacer.Builder().setWidth(DimensionBuilders.dp(dp)).build();
    }

    // The whole tile opens the watch's screen.
    private LayoutElementBuilders.LayoutElement openOnTap(LayoutElementBuilders.LayoutElement content) {
        ActionBuilders.LaunchAction open = new ActionBuilders.LaunchAction.Builder()
                .setAndroidActivity(new ActionBuilders.AndroidActivity.Builder()
                        .setPackageName(getPackageName())
                        .setClassName(MainActivity.class.getName())
                        .build())
                .build();
        return new LayoutElementBuilders.Box.Builder()
                .setWidth(DimensionBuilders.expand())
                .setHeight(DimensionBuilders.expand())
                .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                        .setClickable(new ModifiersBuilders.Clickable.Builder().setId("open").setOnClick(open).build())
                        .setPadding(new ModifiersBuilders.Padding.Builder().setAll(DimensionBuilders.dp(14)).build())
                        .build())
                .addContent(content)
                .build();
    }
}
