/*
 * The app: the site at sgbus.uwuapps.org in Capacitor's WebView (capacitor.config.json's
 * server.url), so the site's own updates reach it at once, with this app's plugins injected
 * into its pages for what a web page can't do (main-site/js/app-bridge.js):
 *
 *   SgBusPlugin          what the app can do, notifications, intent: links, opening SimplyGo
 *   PhoneCalendarPlugin  the phone's calendar, for Navigate's Calendar tab
 *   TripPlugin           following a trip with the screen off, for the Get Off Alert
 *   CardPlugin           an EZ-Link or NETS FlashPay card's value, over NFC
 *   PushNotifications    Capacitor's, for Service Alerts and the Get Off Alert from the server
 *
 * Here: what the app was opened with (a uwu://sgbus/ link, one of the site's own links, a
 * shortcut, something shared into it, or a tapped notification) opened in the page, the back
 * button going back through the page's history, and the notification channels.
 */
package org.uwuapps.sgbus;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    static final String SITE = "https://sgbus.uwuapps.org";
    static final String HOST = "sgbus.uwuapps.org";
    // A notification's page, put on the intent that a tap on it opens (Notifications.java).
    static final String EXTRA_URL = "org.uwuapps.sgbus.URL";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(SgBusPlugin.class);
        registerPlugin(PhoneCalendarPlugin.class);
        registerPlugin(TripPlugin.class);
        registerPlugin(CardPlugin.class);
        Notifications.createChannels(this);
        super.onCreate(savedInstanceState);

        // Back goes back through the page's history, as in a browser: its panels and cards
        // each add a step. Off the first page, the app goes to the background rather than
        // closing, so a trip being followed carries on.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = bridge == null ? null : bridge.getWebView();
                if (web != null && web.canGoBack()) web.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    // BridgeActivity calls this with the intent the app was opened with too, once the page has
    // started loading the site's home page.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String url = pageFor(intent);
        if (url != null && bridge != null) bridge.getWebView().loadUrl(url);
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
