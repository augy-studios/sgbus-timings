/*
 * The app (2.4.0): its screens are Flutter's (android/lib/), in a FlutterFragment here, with this
 * app's plugins reached from the Dart side over the bridge (bridge/Bridge.java,
 * android/lib/native/native_bridge.dart):
 *
 *   SgBusPlugin              what the app can do, notifications, links, opening SimplyGo
 *   PhoneCalendarPlugin      the phone's calendar, for Navigate's Calendar tab
 *   TripPlugin               following a trip with the screen off, for the Get Off Alert
 *   CardPlugin               an EZ-Link or NETS FlashPay card's value, over NFC
 *   OfflineSharePlugin       the share card's Offline Sharing, by NFC tap or Nearby, and NFC
 *                            stickers (2.1.0)
 *   RemindersPlugin          Timings near a stop, last bus, Time to leave, "On a bus?" (2.1.0)
 *   ScanPlugin               reading a stop's code off its pole with the camera (2.1.0)
 *   PushNotificationsPlugin  Service Alerts and the Get Off Alert from the server (FCM)
 *   MigratePlugin            the data the site kept when the app was a WebView (2.3.1 and before)
 *
 * Here: what the app was opened with (a uwu://sgbus/ link, one of the site's own links, a
 * shortcut, something shared into it, a tapped notification, a card held to the phone, or
 * another phone's Offline Sharing held to it) handed to the Dart side as the site's address for
 * it (SgBusPlugin.open), and the notification channels. While the app's open, a card held to the
 * phone comes straight to it rather than Android asking which app should have it.
 *
 * An AppCompatActivity, as the Capacitor app's was, so the app's own language (AppCompat's
 * per-app languages before Android 13) and the splash screen work as they did.
 */
package org.uwuapps.sgbus;

import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.Configuration;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.nfc.tech.Ndef;
import android.os.Build;
import android.os.Bundle;
import android.os.Parcelable;
import android.util.Rational;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.splashscreen.SplashScreen;
import androidx.fragment.app.FragmentManager;

import org.uwuapps.sgbus.bridge.Bridge;

import io.flutter.embedding.android.FlutterFragment;
import io.flutter.embedding.android.RenderMode;
import io.flutter.embedding.android.TransparencyMode;
import io.flutter.embedding.engine.FlutterEngine;
import io.flutter.embedding.android.FlutterEngineConfigurator;

public class MainActivity extends AppCompatActivity implements FlutterEngineConfigurator {
    static final String SITE = "https://sgbus.uwuapps.org";
    static final String HOST = "sgbus.uwuapps.org";
    // A notification's page, put on the intent that a tap on it opens (Notifications.java).
    static final String EXTRA_URL = "org.uwuapps.sgbus.URL";
    private static final String FLUTTER_TAG = "flutter";

    private Bridge mBridge;
    private FlutterFragment mFlutter;

    Bridge bridge() {
        return mBridge;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        mBridge = new Bridge(this);
        mBridge.registerPlugin(SgBusPlugin.class);
        mBridge.registerPlugin(PhoneCalendarPlugin.class);
        mBridge.registerPlugin(TripPlugin.class);
        mBridge.registerPlugin(CardPlugin.class);
        mBridge.registerPlugin(OfflineSharePlugin.class);
        mBridge.registerPlugin(RemindersPlugin.class);
        mBridge.registerPlugin(ScanPlugin.class);
        mBridge.registerPlugin(PushNotificationsPlugin.class);
        mBridge.registerPlugin(MigratePlugin.class);
        Notifications.createChannels(this);

        FrameLayout root = new FrameLayout(this);
        root.setId(R.id.flutter_container);
        setContentView(root);
        FragmentManager fm = getSupportFragmentManager();
        mFlutter = (FlutterFragment) fm.findFragmentByTag(FLUTTER_TAG);
        if (mFlutter == null) {
            // Back is the Dart side's (its own screens, then "Press back again to exit").
            mFlutter = FlutterFragment.withNewEngine()
                    .renderMode(RenderMode.surface)
                    .transparencyMode(TransparencyMode.opaque)
                    .shouldAutomaticallyHandleOnBackPressed(true)
                    .build();
            fm.beginTransaction().add(R.id.flutter_container, mFlutter, FLUTTER_TAG).commit();
        }
        // What the app was opened with, the first time: its screen, once the Dart side listens.
        if (savedInstanceState == null) route(getIntent());
    }

    // The Flutter engine's made: the bridge to it.
    @Override
    public void configureFlutterEngine(@NonNull FlutterEngine engine) {
        mBridge.connect(engine.getDartExecutor().getBinaryMessenger());
    }

    @Override
    public void cleanUpFlutterEngine(@NonNull FlutterEngine engine) {
        mBridge.disconnect();
    }

    @Override
    protected void onDestroy() {
        mBridge.onDestroy();
        super.onDestroy();
    }

    @Override
    protected void onStart() {
        super.onStart();
        mBridge.onStart();
    }

    @Override
    protected void onStop() {
        mBridge.onStop();
        super.onStop();
    }

    @Override
    public void onPostResume() {
        super.onPostResume();
        if (mFlutter != null) mFlutter.onPostResume();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (mFlutter != null) mFlutter.onTrimMemory(level);
    }

    // ---------- picture-in-picture ----------
    // While a trip runs or the live map is open, leaving the app shrinks it into a small window
    // showing just that (main-site/js/pip.js asks for it through SgBusPlugin.pip). Android 12
    // and later do it themselves (auto-enter); before that, onUserLeaveHint does.

    private boolean mAutoPip;
    private Rational mPipRatio = new Rational(16, 9);

    void setAutoPip(boolean auto, Rational ratio) {
        mAutoPip = auto;
        if (ratio != null) mPipRatio = ratio;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setPictureInPictureParams(pipParams());
    }

    boolean enterPip() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            return enterPictureInPictureMode(pipParams());
        } catch (IllegalStateException e) {
            return false; // turned off for this app in Android's settings
        }
    }

    // Callers check for Android 8 first.
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.O)
    private PictureInPictureParams pipParams() {
        PictureInPictureParams.Builder b = new PictureInPictureParams.Builder().setAspectRatio(mPipRatio);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setAutoEnterEnabled(mAutoPip).setSeamlessResizeEnabled(true);
        return b.build();
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (mFlutter != null) mFlutter.onUserLeaveHint();
        if (mAutoPip && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S) enterPip();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean inPip, Configuration config) {
        super.onPictureInPictureModeChanged(inPip, config);
        SgBusPlugin.onPip(inPip);
    }

    // ---------- a card held to the phone ----------
    // Android offers a card to this app (AndroidManifest.xml, res/xml/nfc_tech.xml) when the app
    // isn't open; while it is, it comes here first (foreground dispatch), unless the card value
    // is already waiting for one (CardPlugin's reader mode). Either way it lands in
    // onNewIntent, and CardPlugin reads it and tells the Dart side (lib/features/card/).

    // The app's language changed in Android's settings (Settings, Apps, SG Bus Timings,
    // Language): told to the Dart side, which follows it (SgBusPlugin.onLanguage). The activity
    // handles a locale change itself (AndroidManifest.xml's configChanges), so the screens
    // aren't made again for it.
    @Override
    public void onConfigurationChanged(Configuration config) {
        super.onConfigurationChanged(config);
        SgBusPlugin.onLanguage();
    }

    @Override
    public void onResume() {
        super.onResume();
        mBridge.onResume();
        SgBusPlugin.onLanguage();
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(this);
        if (nfc == null) return;
        PendingIntent self = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0));
        try {
            nfc.enableForegroundDispatch(this, self,
                    new IntentFilter[]{new IntentFilter(NfcAdapter.ACTION_TECH_DISCOVERED)},
                    new String[][]{{IsoDep.class.getName()}});
        } catch (IllegalStateException | SecurityException ignored) {
            // Not resumed after all, or NFC's turned off for apps: Android asks as usual.
        }
    }

    @Override
    public void onPause() {
        mBridge.onPause();
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(this);
        if (nfc != null) {
            try {
                nfc.disableForegroundDispatch(this);
            } catch (IllegalStateException | SecurityException ignored) {
                // Never enabled.
            }
        }
        super.onPause();
    }

    @Override
    protected void onNewIntent(@NonNull Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (mFlutter != null) mFlutter.onNewIntent(intent);
        route(intent);
    }

    // What an intent asks for, the one the app was opened with or a later one.
    private void route(Intent intent) {
        mBridge.onNewIntent(intent);
        // "SG Bus Timings 2.1.1 is out", tapped (main-site/api/push/release.js): FCM opens the
        // app with the push's data as extras. Straight to the update window, which looks up
        // that version and asks before downloading it (2.1.1). The extras go, so the window
        // doesn't open again when Android recreates this screen.
        if ("release".equals(intent.getStringExtra("type"))) {
            UpdateActivity.check(this, intent.getStringExtra("version"));
            intent.removeExtra("type");
            intent.removeExtra("version");
            return;
        }
        // Another phone's Offline Sharing held to this one: it comes as a tag, like a card, but
        // with a link to the site on it.
        String link = tappedLink(intent);
        if (link != null) {
            SgBusPlugin.open(link);
            return;
        }
        // Sharing offline, this phone's a tag itself, and the phone it's held to can look like a
        // card to it: that's not one to read.
        if (ShareTagService.sharing() && isTag(intent)) return;
        // A card: shown wherever the app is.
        if (CardPlugin.tapped(intent)) return;
        String url = pageFor(intent);
        if (url != null) SgBusPlugin.open(url);
    }

    private static boolean isTag(Intent intent) {
        String action = intent == null ? null : intent.getAction();
        return NfcAdapter.ACTION_NDEF_DISCOVERED.equals(action) || NfcAdapter.ACTION_TECH_DISCOVERED.equals(action)
                || NfcAdapter.ACTION_TAG_DISCOVERED.equals(action);
    }

    // The link to the site on a tag, as Offline Sharing's (ShareTagService), or null. Android
    // reads a tag's NDEF message before handing it over, and puts it on the intent; a tag
    // that comes without, as some phones send them in foreground dispatch, is asked for it.
    @SuppressWarnings("deprecation")
    static String tappedLink(Intent intent) {
        if (!isTag(intent) || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null;
        java.util.List<NdefMessage> messages = new java.util.ArrayList<>();
        Parcelable[] extra = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES);
        if (extra != null) {
            for (Parcelable p : extra) if (p instanceof NdefMessage) messages.add((NdefMessage) p);
        }
        if (messages.isEmpty()) {
            Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
            Ndef ndef = tag == null ? null : Ndef.get(tag);
            NdefMessage cached = ndef == null ? null : ndef.getCachedNdefMessage();
            if (cached != null) messages.add(cached);
        }
        for (NdefMessage message : messages) {
            for (NdefRecord record : message.getRecords()) {
                Uri uri = record.toUri();
                if (uri != null && "https".equals(uri.getScheme()) && HOST.equalsIgnoreCase(uri.getHost())) return uri.toString();
            }
        }
        return null;
    }

    // The site's page an intent asks for, or null for the home page as it is.
    static String pageFor(Intent intent) {
        if (intent == null) return null;
        String extra = intent.getStringExtra(EXTRA_URL);
        if (extra != null && extra.startsWith(SITE + "/")) return extra;

        if (Intent.ACTION_SEND.equals(intent.getAction())) return shared(intent);

        Uri data = intent.getData();
        if (data == null) return null;
        if ("uwu".equals(data.getScheme()) && "sgbus".equalsIgnoreCase(data.getHost())) {
            return fromAppLink(data);
        }
        // The site's own links, and the launcher shortcuts (res/xml/shortcuts.xml).
        if ("https".equals(data.getScheme()) && HOST.equalsIgnoreCase(data.getHost())) {
            if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return null;
            return data.toString();
        }
        return null;
    }

    // uwu://sgbus/ links, to the page they name: the site's own short links by their path
    // (uwu://sgbus/go/k3v9q2x7ma), anything else as the site's # address (uwu://sgbus/84009 for
    // a stop, uwu://sgbus/bus/22, uwu://sgbus/nav, uwu://sgbus/map/84009), and uwu://sgbus/
    // alone to the home page. uwu:// is shared by UwU Apps' apps, each answering its own host.
    static String fromAppLink(Uri link) {
        String path = link.getEncodedPath() == null ? "" : link.getEncodedPath();
        String rest = path.replaceAll("^/+|/+$", "");
        if (rest.isEmpty()) return SITE + "/";
        if (rest.matches("(go|trip|eta)/[a-z0-9]{10}")) return SITE + "/" + rest;
        return SITE + "/#" + rest;
    }

    // Something shared into the app, usually a Google Maps place, as the site's share target
    // takes it (manifest.json's share_target): /?title=...&text=... into Navigate's To.
    private static String shared(Intent intent) {
        Uri.Builder url = Uri.parse(SITE + "/").buildUpon();
        String title = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (title != null && !title.trim().isEmpty()) url.appendQueryParameter("title", title);
        if (text != null && !text.trim().isEmpty()) url.appendQueryParameter("text", text);
        return url.build().toString();
    }
}
