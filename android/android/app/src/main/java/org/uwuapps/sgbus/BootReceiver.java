/*
 * After the phone restarts, or the app's updated: what Android forgets is set again. The
 * geofences for Timings near a stop (NearStops), the last bus and routine alarms (LastBus,
 * Routines) and the watch
 * for riding (OnABus). Time to leave's planning is WorkManager's, which carries on by itself,
 * and sets its alarms again on its next run.
 */
package org.uwuapps.sgbus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        Context app = context.getApplicationContext();
        // Each fails quietly without its permission: the page says so when it's next opened.
        if (NearStops.stops(app).length() > 0) NearStops.arm(app);
        LastBus.arm(app);
        Routines.arm(app);
        if (OnABus.on(app)) OnABus.arm(app);
    }
}
