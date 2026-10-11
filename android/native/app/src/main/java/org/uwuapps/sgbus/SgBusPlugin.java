/*
 * The app itself, to the page (main-site/js/app-bridge.js):
 *
 *   info()                   { version, versionCode, features }: what this app can do
 *   notify({ channel, tag, title, body, url })   a notification (Notifications.java)
 *   notificationsAllowed()   { allowed }
 *   openSettings({ what })   the app's page in Android's settings ("app"), its notification
 *                            settings ("notifications"), or NFC's ("nfc")
 *
 * And intent: links, which a WebView can't follow by itself as Chrome does: the site's
 * SimplyGo button, the calendar permission and the update bar each link to one of this app's
 * activities with one (OpenAppActivity, CalendarPermissionActivity, UpdateActivity), and they're
 * started here; any other app's is opened if it's installed, or its fallback page if not.
 */
package org.uwuapps.sgbus;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.nfc.NfcAdapter;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.URISyntaxException;

@CapacitorPlugin(name = "SgBus")
public class SgBusPlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        JSObject out = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            out.put("version", info.versionName);
            out.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode);
        } catch (PackageManager.NameNotFoundException e) {
            out.put("version", null);
        }
        JSArray features = new JSArray();
        features.put("calendar"); // PhoneCalendarPlugin
        features.put("update"); // UpdateActivity
        features.put("trip"); // TripPlugin
        features.put("notify");
        if (NfcAdapter.getDefaultAdapter(getContext()) != null) features.put("card"); // CardPlugin
        // Firebase is set up for this build (google-services.json): the server can push.
        if (getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName()) != 0) {
            features.put("push");
        }
        out.put("features", features);
        out.put("android", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    @PluginMethod
    public void notify(PluginCall call) {
        String channel = call.getString("channel", Notifications.ALERTS);
        if (!Notifications.ALERTS.equals(channel) && !Notifications.GET_OFF.equals(channel)) {
            call.reject("Unknown channel");
            return;
        }
        String url = call.getString("url");
        if (url != null && !url.startsWith(MainActivity.SITE + "/")) url = null;
        boolean shown = Notifications.post(getContext(), channel, call.getString("tag", channel),
                call.getString("title", "SG Bus Timings"), call.getString("body", ""), url);
        JSObject out = new JSObject();
        out.put("shown", shown);
        call.resolve(out);
    }

    @PluginMethod
    public void notificationsAllowed(PluginCall call) {
        JSObject out = new JSObject();
        out.put("allowed", Notifications.allowed(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        String what = call.getString("what", "app");
        String pkg = getContext().getPackageName();
        Intent intent;
        if ("notifications".equals(what) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        } else if ("nfc".equals(what)) {
            intent = new Intent(Settings.ACTION_NFC_SETTINGS);
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", pkg, null));
        }
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
        call.resolve();
    }

    // Called by Capacitor for every navigation in the page: true when it's been dealt with here.
    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        if (!"intent".equals(url.getScheme())) return null;
        Intent intent;
        try {
            intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
        } catch (URISyntaxException e) {
            return true;
        }
        // As Chrome does: only what a link may open, never a particular component of an app.
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setComponent(null);
        intent.setSelector(null);
        String fallback = intent.getStringExtra("browser_fallback_url");
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            if (fallback != null && fallback.startsWith("https://")) {
                try {
                    getActivity().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(fallback)));
                } catch (ActivityNotFoundException ignored) {
                    // No browser at all: nothing to do.
                }
            }
        }
        return true;
    }
}
