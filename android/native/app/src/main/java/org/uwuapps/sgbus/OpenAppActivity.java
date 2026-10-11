/*
 * Opens another app for the site, as a native app does: by its package, with
 * PackageManager.getLaunchIntentForPackage. A web page can't, since Chrome only opens apps that
 * answer a link, and SimplyGo's own links aren't safe to use (sg.com.transitlink://main loops).
 *
 * The site links here with an intent link naming this app (main-site/script.js, "SimplyGo"):
 * in this app, SgBusPlugin.shouldOverrideLoad hands it here; in Chrome on a phone with this app,
 * Chrome does, and on one without it, Chrome goes to the link's fallback (the store page):
 *
 *     intent://open/simplygo#Intent;scheme=org.uwuapps.sgbus;package=org.uwuapps.sgbus;...;end
 *
 * Only the apps in APPS can be opened, so no web page can use this to open anything else. One
 * not installed opens its Play Store page instead. Nothing is shown: the activity is
 * translucent and finishes at once. Each app also needs a <queries> entry in AndroidManifest.xml.
 */
package org.uwuapps.sgbus;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

public class OpenAppActivity extends Activity {
    // The name in the link, to the app's package. Each package also needs a <queries> entry in
    // AndroidManifest.xml, or Android 11 and later hide it from this app.
    private static final Map<String, String> APPS;
    static {
        Map<String, String> apps = new HashMap<>();
        apps.put("simplygo", "sg.com.transitlink");
        APPS = Collections.unmodifiableMap(apps);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri link = getIntent().getData();
        String pkg = link == null ? null : APPS.get(link.getLastPathSegment());
        if (pkg != null) open(pkg);
        finish();
    }

    private void open(String pkg) {
        Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(launch);
            return;
        }
        // Not installed: its store page, in the Play Store app where there is one.
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + pkg))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
    }
}
