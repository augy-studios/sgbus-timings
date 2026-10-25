/*
 * The app itself, to the page (main-site/js/app-bridge.js):
 *
 *   info()                   { version, versionCode, features }: what this app can do
 *   notify({ channel, tag, title, body, url })   a notification (Notifications.java)
 *   notificationsAllowed()   { allowed }
 *   openSettings({ what })   the app's page in Android's settings ("app"), its notification
 *                            settings ("notifications"), NFC's ("nfc"), or Location's
 *                            ("location", 2.2.0)
 *   location()               { on }: whether the phone's Location is on at all (2.2.0)
 *   turnOnLocation()         Play services' "Turn on location" dialog, or Android's Location
 *                            settings without it: { on, settings } (2.2.0)
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
 *   setPlaces({ home, work })  Home and Work from Places, each { label, lat, lng, url } or
 *                            null, for Bus home and Bus to work (PlaceShortcuts) (2.1.0)
 *   listen()                 Android's own speech screen, for searching by voice: { text },
 *                            or rejects "cancelled" or "unavailable". The app needs no
 *                            microphone permission; the speech screen has its own (2.1.0)
 *   flag({ on, torch })      the flag-down screen (js/flag.js): the screen at full brightness
 *                            while it's up, and the torch on, steady, if asked; { torch } says
 *                            whether there is one (2.1.0)
 *   audioOut()               { earphones }: whether sound would go to earphones or a headset,
 *                            wired or Bluetooth, for the Get Off Alert's earphones-only sound
 *                            (js/trip.js) (2.1.0)
 *   openSettings({ what: "battery" })  asks Android to stop optimising the app's battery use,
 *                            so a trip isn't stopped in the background (2.1.0)
 *   releases()               { on }: whether "New versions of the app" is on (2.1.1)
 *   setReleases({ on })      turns it on or off, as the sgbus-releases FCM topic, which the
 *                            server pushes to when a release is published
 *                            (main-site/api/push/release.js), so it keeps no list of phones.
 *                            Rejects with a sentence when Firebase can't be reached (2.1.1)
 *
 * And intent: links, which a WebView can't follow by itself as Chrome does: the site's
 * SimplyGo button, the calendar permission and the update bar each link to one of this app's
 * activities with one (OpenAppActivity, CalendarPermissionActivity, UpdateActivity), and they're
 * started here; any other app's is opened if it's installed, or its fallback page if not.
 */
package org.uwuapps.sgbus;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.Uri;
import android.nfc.NfcAdapter;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.view.WindowManager;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.location.LocationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;
import com.google.firebase.messaging.FirebaseMessaging;

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
        features.put("shareto"); // share's app, straight to Telegram or WhatsApp (2.1.0)
        // Offline Sharing (OfflineSharePlugin, 2.1.0): by tap, as an NFC tag, and by Nearby.
        if (OfflineSharePlugin.canTap(getContext())) features.put("sharetap");
        if (OfflineSharePlugin.canNearby(getContext())) features.put("sharenearby");
        features.put("widget");
        // 2.1.0
        features.put("places"); // setPlaces: Bus home and Bus to work
        features.put("flag"); // the flag-down screen's brightness
        if (getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH)) features.put("torch");
        features.put("earphones"); // audioOut, and TripPlugin.alert's quiet
        features.put("battery"); // openSettings "battery"
        features.put("lastbus"); // RemindersPlugin.lastBus
        features.put("leavetime"); // RemindersPlugin.leaveTime
        if (OfflineSharePlugin.canNearby(getContext())) {
            features.put("nearstops"); // RemindersPlugin.nearStops, Play services' geofences
            features.put("onabus"); // RemindersPlugin.onABus, Play services' activity recognition
            if (getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
                features.put("scan"); // ScanPlugin, ML Kit's text recognition
            }
        }
        if (NfcAdapter.getDefaultAdapter(getContext()) != null) features.put("sticker"); // OfflineSharePlugin.write
        if (new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).resolveActivity(getContext().getPackageManager()) != null) {
            features.put("listen");
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
            features.put("pip");
        }
        if (NfcAdapter.getDefaultAdapter(getContext()) != null) {
            features.put("card"); // CardPlugin
            features.put("cardtap"); // CardPlugin's "tapped", a card held to the phone (2.0.8)
        }
        // 2.2.0
        features.put("locationon"); // location, turnOnLocation: the phone's Location switch
        features.put("routines"); // RemindersPlugin.routines (Routines)
        // 2.2.1
        features.put("myica"); // OpenAppActivity opens MyICA Mobile, from a trip to a checkpoint
        features.put("routinewild"); // 2.2.3: a routine's buses can be a wildcard, "22*" (NearStops.wanted)
        features.put("cardreading"); // CardPlugin's "reading" event
        // Firebase is set up for this build (google-services.json): the server can push.
        if (firebaseReady()) {
            features.put("push");
            features.put("releases"); // setReleases, "New versions of the app" (2.1.1)
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

    // ---------- new versions of the app (2.1.1) ----------

    // FCM topics are shared by every app in the UwU Apps Firebase project, hence the prefix.
    private static final String RELEASES_TOPIC = "sgbus-releases";
    private static final String PREFS = "sgbus.releases";

    // google-services.json was in the build, so Firebase starts with the app. Without it,
    // FirebaseMessaging.getInstance() throws.
    private boolean firebaseReady() {
        return getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName()) != 0;
    }

    @PluginMethod
    public void releases(PluginCall call) {
        JSObject out = new JSObject();
        out.put("on", getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("on", false));
        call.resolve(out);
    }

    // The page asks for Android's notification permission first (js/app-update.js); this only
    // joins or leaves the topic, and remembers which once Firebase has said it's done.
    @PluginMethod
    public void setReleases(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (!firebaseReady()) {
            call.reject("This copy of the app can't get notifications from the server yet.");
            return;
        }
        FirebaseMessaging messaging = FirebaseMessaging.getInstance();
        messaging.setAutoInitEnabled(true);
        (on ? messaging.subscribeToTopic(RELEASES_TOPIC) : messaging.unsubscribeFromTopic(RELEASES_TOPIC))
                .addOnCompleteListener(task -> {
                    if (!task.isSuccessful()) {
                        call.reject("Couldn't reach Firebase. Check you're online, then try again.");
                        return;
                    }
                    getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("on", on).apply();
                    JSObject out = new JSObject();
                    out.put("on", on);
                    call.resolve(out);
                });
    }

    private static java.lang.ref.WeakReference<SgBusPlugin> sPlugin = new java.lang.ref.WeakReference<>(null);

    @Override
    public void load() {
        sPlugin = new java.lang.ref.WeakReference<>(this);
        // Registered as the app starts, as Android needs: Play services' "Turn on location" dialog.
        mLocationDialog = bridge.registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = mLocationCall;
            mLocationCall = null;
            if (call != null) resolveLocation(call, false);
        });
    }

    // ---------- the phone's Location switch (2.2.0) ----------
    // Location can be allowed for the app and still be off for the whole phone, when nothing
    // finds where you are and the page only hears "couldn't get your location". The page asks
    // first (main-site/js/geo-retry.js), and offers to turn it on.

    private ActivityResultLauncher<IntentSenderRequest> mLocationDialog;
    private PluginCall mLocationCall;

    private boolean locationOn() {
        LocationManager lm = getContext().getSystemService(LocationManager.class);
        return lm != null && LocationManagerCompat.isLocationEnabled(lm);
    }

    private void resolveLocation(PluginCall call, boolean settings) {
        JSObject out = new JSObject();
        out.put("on", locationOn());
        if (settings) out.put("settings", true);
        call.resolve(out);
    }

    @PluginMethod
    public void location(PluginCall call) {
        resolveLocation(call, false);
    }

    // Play services' own "Turn on location" dialog, one tap to say OK: { on } after it. Without
    // Play services, or where it can't ask, Android's Location settings instead, and
    // { on: false, settings: true }, for the page to try again when it's back.
    @PluginMethod
    public void turnOnLocation(PluginCall call) {
        if (locationOn()) {
            resolveLocation(call, false);
            return;
        }
        LocationSettingsRequest ask = new LocationSettingsRequest.Builder()
                .addLocationRequest(new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000).build())
                .setAlwaysShow(true)
                .build();
        try {
            LocationServices.getSettingsClient(getActivity()).checkLocationSettings(ask)
                    .addOnSuccessListener(r -> resolveLocation(call, false))
                    .addOnFailureListener(e -> {
                        if (e instanceof ResolvableApiException && mLocationDialog != null && mLocationCall == null) {
                            mLocationCall = call;
                            try {
                                mLocationDialog.launch(new IntentSenderRequest.Builder(((ResolvableApiException) e).getResolution()).build());
                                return;
                            } catch (RuntimeException failed) {
                                mLocationCall = null;
                            }
                        }
                        openLocationSettings(call);
                    });
        } catch (RuntimeException e) {
            openLocationSettings(call);
        }
    }

    private void openLocationSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
        resolveLocation(call, true);
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
        } else if ("battery".equals(what)) {
            intent = batteryIntent(getContext());
        } else if ("nfc".equals(what)) {
            intent = new Intent(Settings.ACTION_NFC_SETTINGS);
        } else if ("location".equals(what)) {
            intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
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

    // Asks to leave the app out of battery optimisation (the system's own yes/no), or, once it
    // is, the list of apps it applies to.
    @SuppressLint("BatteryLife") // a sideloaded app following trips in the background, not on Play
    static Intent batteryIntent(Context context) {
        PowerManager pm = context.getSystemService(PowerManager.class);
        if (pm != null && pm.isIgnoringBatteryOptimizations(context.getPackageName())) {
            return new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        }
        return new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.getPackageName()));
    }

    static boolean batteryFree(Context context) {
        PowerManager pm = context.getSystemService(PowerManager.class);
        return pm != null && pm.isIgnoringBatteryOptimizations(context.getPackageName());
    }

    // ---------- Home and Work ----------

    @PluginMethod
    public void setPlaces(PluginCall call) {
        PlaceShortcuts.set(getContext(), call.getObject("home"), call.getObject("work"));
        call.resolve();
    }

    // ---------- voice ----------

    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-SG")
                .putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Say a stop, its code, or a bus"))
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try {
            startActivityForResult(call, intent, "afterListen");
        } catch (ActivityNotFoundException e) {
            call.reject("No speech recognition on this phone", "unavailable");
        }
    }

    @ActivityCallback
    private void afterListen(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        java.util.ArrayList<String> heard = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (result.getResultCode() != Activity.RESULT_OK || heard == null || heard.isEmpty()) {
            call.reject("Cancelled", "cancelled");
            return;
        }
        JSObject out = new JSObject();
        out.put("text", heard.get(0));
        out.put("alternatives", new JSArray(heard));
        call.resolve(out);
    }

    // ---------- the flag-down screen ----------

    @PluginMethod
    public void flag(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        boolean torch = on && Boolean.TRUE.equals(call.getBoolean("torch", false));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
            lp.screenBrightness = on ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_FULL : WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
            activity.getWindow().setAttributes(lp);
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
        JSObject out = new JSObject();
        // Only ever turned off here if it was turned on here: not the torch from Quick Settings.
        boolean has = torch || mTorchOn ? setTorch(torch) : hasTorch();
        mTorchOn = torch && has;
        out.put("torch", has);
        call.resolve(out);
    }

    private boolean mTorchOn;

    private boolean hasTorch() {
        return getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH);
    }

    // The back camera's flash, on or off, steady: no camera permission needed. Whether there is
    // one to turn on.
    private boolean setTorch(boolean on) {
        CameraManager cm = getContext().getSystemService(CameraManager.class);
        if (cm == null) return false;
        try {
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics ch = cm.getCameraCharacteristics(id);
                Boolean flash = ch.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
                Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
                if (Boolean.TRUE.equals(flash) && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    cm.setTorchMode(id, on);
                    return true;
                }
            }
        } catch (CameraAccessException | IllegalArgumentException e) {
            // In use by another app, say: no torch this time.
        }
        return false;
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        // Leaving the app with the flag-down screen up: the torch doesn't stay on behind it.
        if (mTorchOn) setTorch(false);
        mTorchOn = false;
    }

    // ---------- where sound goes ----------

    @PluginMethod
    public void audioOut(PluginCall call) {
        JSObject out = new JSObject();
        out.put("earphones", earphones(getContext()));
        call.resolve(out);
    }

    // Wired, Bluetooth (a call-only earpiece too, from 2.2.6), LE Audio or hearing aids: EarBeep.
    static boolean earphones(Context context) {
        return EarBeep.any(context);
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
