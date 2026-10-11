/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.uwuapps.sgbus;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsCallback;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

// Bubblewrap's, with three additions of this app's own (not regenerated: see android/README.md):
// the message channel to the site (AppBridge) through getCustomTabsCallback and
// createTwaLauncher, and uwu://sgbus/ links through getLaunchingUrl.
public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    // uwu:// is shared by UwU Apps' apps, each answering its own host; this one's is sgbus.
    private static final String SCHEME = "uwu";
    private static final String HOST = "sgbus";
    private static final String SITE = "https://sgbus.uwuapps.org";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    // This activity lives under the TWA until it's closed, so its launcher's session, and the
    // channel to the page over it, last as long as the app is open.
    @Override
    protected TwaLauncher createTwaLauncher() {
        TwaLauncher launcher = super.createTwaLauncher();
        AppBridge.adopt(launcher);
        return launcher;
    }

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return AppBridge.callback(this);
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();
        boolean appLink = SCHEME.equals(uri.getScheme()) && HOST.equalsIgnoreCase(uri.getHost());
        return appLink ? fromAppLink(uri) : uri;
    }

    // uwu://sgbus/ links, to the page they name: the site's own short links by their path
    // (uwu://sgbus/go/k3v9q2x7ma), anything else as the site's # address (uwu://sgbus/84009 for
    // a stop, uwu://sgbus/bus/22, uwu://sgbus/nav), and uwu://sgbus/ alone to the home page.
    static Uri fromAppLink(Uri link) {
        String path = link.getEncodedPath() == null ? "" : link.getEncodedPath();
        String rest = path.replaceAll("^/+|/+$", "");
        if (rest.isEmpty()) return Uri.parse(SITE + "/");
        if (rest.matches("(go|trip|eta)/[a-z0-9]{10}")) return Uri.parse(SITE + "/" + rest);
        return Uri.parse(SITE + "/#" + rest);
    }
}
