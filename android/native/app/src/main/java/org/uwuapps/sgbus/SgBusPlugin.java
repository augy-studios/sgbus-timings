/*
 * The app itself, to the page (main-site/js/app-bridge.js):
 *
 *   info()                   { version, versionCode, features }: what this app can do
 *   notify({ channel, tag, title, body, url })   a notification (Notifications.java)
 *   notificationsAllowed()   { allowed }
 *   openSettings({ what })   the app's page in Android's settings ("app"), its notification
 *                            settings ("notifications"), or NFC's ("nfc")
 *   pip({ auto, ratio })     whether leaving the app now shrinks it into picture-in-picture,
 *                            and its shape as [width, height] (MainActivity); "pip" events
 *                            say { active } as it goes in and out
 *   setFavourites({ stops })  the favourite stops, [{ code, name }], for the widget's setup
 *                            (WidgetStore)
 *   share({ title, text, url })  Android's share sheet, as navigator.share is in Chrome: the
 *                            WebView has none (js/app-bridge.js stands this in for it)
 *   share({ text, url, app })  straight to Telegram or WhatsApp ("telegram", "whatsapp"), for
 *                            the share card's buttons (js/share.js): { sent: false } when it
 *                            isn't installed
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
        features.put("checkupdate"); // UpdateActivity's check, for the Edge Tray (2.0.8)
        features.put("trip"); // TripPlugin
        features.put("pace"); // TripPlugin's walking or riding by speed (Pace, 2.0.8)
        features.put("notify");
        features.put("board"); // the board channel, for Get ready to board (Notifications)
        features.put("share");
        features.put("shareto"); // share's app, straight to Telegram or WhatsApp (2.0.9)
        features.put("widget");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            features.put("pip");
        }
        if (NfcAdapter.getDefaultAdapter(getContext()) != null) {
            features.put("card"); // CardPlugin
            features.put("cardtap"); // CardPlugin's "tapped", a card held to the phone (2.0.8)
        }
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
        if (!Notifications.ALERTS.equals(channel) && !Notifications.GET_OFF.equals(channel)
                && !Notifications.BOARD.equals(channel)) {
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

    private static java.lang.ref.WeakReference<SgBusPlugin> sPlugin = new java.lang.ref.WeakReference<>(null);

    @Override
    public void load() {
        sPlugin = new java.lang.ref.WeakReference<>(this);
    }

    static void onPip(boolean active) {
        SgBusPlugin plugin = sPlugin.get();
        if (plugin == null) return;
        JSObject out = new JSObject();
        out.put("active", active);
        plugin.notifyListeners("pip", out);
    }

    @PluginMethod
    public void pip(PluginCall call) {
        boolean auto = Boolean.TRUE.equals(call.getBoolean("auto", false));
        android.util.Rational ratio = null;
        com.getcapacitor.JSArray r = call.getArray("ratio");
        try {
            if (r != null && r.length() == 2) {
                // Android takes 1:2.39 to 2.39:1.
                int w = r.getInt(0), h = r.getInt(1);
                if (w > 0 && h > 0 && w * 100 / h >= 42 && w * 100 / h <= 239) ratio = new android.util.Rational(w, h);
            }
        } catch (org.json.JSONException ignored) {
            // No shape: the last one stands.
        }
        android.util.Rational shape = ratio;
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).setAutoPip(auto, shape);
            call.resolve();
        });
    }

    @PluginMethod
    public void setFavourites(PluginCall call) {
        JSArray stops = call.getArray("stops");
        if (stops != null) WidgetStore.setFavourites(getContext(), stops);
        call.resolve();
    }

    // The apps share({ app }) sends straight to, each by its builds in the order tried: the Play
    // Store's first, then Telegram's own download and Telegram X, and WhatsApp Business.
    private static final java.util.Map<String, String[]> SHARE_APPS = new java.util.HashMap<>();
    static {
        SHARE_APPS.put("telegram", new String[]{"org.telegram.messenger", "org.telegram.messenger.web", "org.thunderdog.challegram"});
        SHARE_APPS.put("whatsapp", new String[]{"com.whatsapp", "com.whatsapp.w4b"});
    }

    // With app ("telegram" or "whatsapp"), straight to that app's own chat picker rather than
    // the share sheet: { sent: false } when it isn't installed, and the page opens its web link.
    @PluginMethod
    public void share(PluginCall call) {
        String text = call.getString("text", "");
        String url = call.getString("url", "");
        String body = text.isEmpty() ? url : url.isEmpty() ? text : text + " " + url;
        Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, body);
        JSObject out = new JSObject();
        String[] packages = SHARE_APPS.get(call.getString("app", ""));
        if (packages != null) {
            // No subject: Telegram puts it above the message, and the text already says it.
            for (String pkg : packages) {
                try {
                    getActivity().startActivity(new Intent(send).setPackage(pkg));
                    out.put("sent", true);
                    call.resolve(out);
                    return;
                } catch (ActivityNotFoundException e) {
                    // Not installed: the next build of it.
                }
            }
            out.put("sent", false);
            call.resolve(out);
            return;
        }
        String title = call.getString("title");
        if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
        getActivity().startActivity(Intent.createChooser(send, title));
        out.put("sent", true);
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
