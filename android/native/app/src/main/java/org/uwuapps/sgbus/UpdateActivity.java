/*
 * Updates the app to its newest release on GitHub, for the site's update bar: the page links
 * here (main-site/js/app-update.js) when main-site/api/app-release.js names a newer version
 * than this one. A small window over the page that downloads the APK, checks it, and hands it
 * to Android's own installer, which asks "Do you want to update this app?" as for any APK.
 *
 * From 2.0.8 the Edge Tray's "Check for app updates" opens it too, as
 * org.uwuapps.sgbus://update/check (CHECK): it looks first, says if this is the newest version,
 * and asks before downloading one that isn't. The update bar's link, without /check, has
 * already asked, so downloads straight away.
 *
 * From 2.1.1 a tapped "new version is out" notification opens it too (MainActivity, check()):
 * a check, naming the version the push was about (VERSION), so the release just published is
 * looked up fresh rather than from the site's few minutes of cache.
 *
 * Checks before anything is installed:
 * - The APK comes only from this repository's releases on GitHub (RELEASES).
 * - Its SHA-256 matches the checksum GitHub publishes for the file, when it has one.
 * - It's this app, with a higher versionCode than the one installed.
 * Android checks the rest: it only updates an app with an APK signed by the same key.
 *
 * Android 8 and later also want this app allowed to install apps, once, in its "Install unknown
 * apps" setting; once there's an update to install, this sends you there first. Android 8 to
 * 10 restart the app when it's allowed, which brings this window back with the setting on, and
 * it carries on from there.
 *
 * Samsung's Auto Blocker (One UI 6 and later) is a second gate, apart from that setting: while
 * it's on, only apps from the Play Store or Galaxy Store install. Nothing public says whether
 * it's on, and Android's installer doesn't name it when it stops an update: in AOSP a
 * confirmation that ends without Install comes back as STATUS_FAILURE_ABORTED, the same as
 * Cancel. So on a Samsung device on Android 14 or later, an update that fails or is cancelled,
 * or that the installer never answers for, gets an explanation of Auto Blocker and a button to
 * Security settings, and Try again carries on with the same version.
 *
 * One of this app's own screens (see android/README.md).
 */
package org.uwuapps.sgbus;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

public class UpdateActivity extends Activity {
    private static final String TAG = "SgBusUpdate";
    // The newest release, read from GitHub and cached by the site.
    private static final String LATEST = MainActivity.SITE + "/api/app-release";
    // Where its APK may come from: this repository's releases, and nowhere else.
    private static final String RELEASES =
            "https://github.com/augy-studios/sgbus-timings/releases/download/";
    // The Edge Tray's "Check for app updates", rather than the update bar's Update.
    private static final String CHECK = "/check";
    // The version a notification said is out, to look it up past the site's cache.
    private static final String EXTRA_VERSION = "org.uwuapps.sgbus.update.VERSION";
    // A Samsung device on One UI 6 (Android 14) or later, where Auto Blocker may be on.
    private static final boolean AUTO_BLOCKER = "samsung".equalsIgnoreCase(Build.MANUFACTURER)
            && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE;
    // How long, on such a device, to wait for the installer to answer before taking its silence
    // as Auto Blocker. An update you've confirmed answers well within it, by restarting the app.
    private static final long NO_ANSWER_MS = 30_000;

    // The window on screen, for InstallStatus to report back to.
    private static WeakReference<UpdateActivity> sShowing = new WeakReference<>(null);

    private TextView mText;
    private ProgressBar mProgress;
    private Button mPrimary;
    private Button mSecondary;

    private Thread mWork;
    private volatile boolean mCancelled;
    private boolean mAskedToAllow;
    // Sent to Security settings to turn Auto Blocker off.
    private boolean mAskedToUnblock;
    // Handed to the installer, with no final answer from it yet.
    private boolean mInstalling;
    private final Handler mHandler = new Handler(Looper.getMainLooper());
    private final Runnable mNoAnswer = this::autoBlocked;
    // Only checking, so ask before downloading what it finds.
    private boolean mCheckOnly;
    private String mExpected;
    // The update to install, once found and wanted: kept while you're in "Install unknown
    // apps", and for "Try again", so neither looks it up again.
    private Release mRelease;

    // A check for the version a tapped notification named (MainActivity).
    static void check(Context context, String version) {
        Intent intent = new Intent(context, UpdateActivity.class)
                .setData(Uri.parse("org.uwuapps.sgbus://update" + CHECK));
        if (version != null && version.matches("\\d+(\\.\\d+)*")) intent.putExtra(EXTRA_VERSION, version);
        if (!(context instanceof Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setFinishOnTouchOutside(false);
        buildWindow();
        sShowing = new WeakReference<>(this);
        Uri link = getIntent().getData();
        mCheckOnly = link != null && CHECK.equals(link.getPath());
        mExpected = getIntent().getStringExtra(EXTRA_VERSION);
        start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Back from "Install unknown apps".
        if (mAskedToAllow && mWork == null) {
            mAskedToAllow = false;
            if (allowedToInstall()) start();
            else show("SG Bus Timings wasn't allowed to install apps, so it can't update itself.",
                    "Try again", this::askToAllow, "Close", this::finish);
        } else if (mAskedToUnblock && mWork == null) {
            // Back from Security settings, with no telling whether Auto Blocker is off now.
            mAskedToUnblock = false;
            show("If Auto Blocker is off now, tap Try again to install " + which() + ".",
                    "Try again", this::start, "Not now", this::finish);
        } else if (mInstalling) {
            // Back from the installer's screen: waiting for its answer again.
            waitForAnswer();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        mHandler.removeCallbacks(mNoAnswer);
        mCancelled = true;
        if (sShowing.get() == this) sShowing.clear();
    }

    // ---------- steps ----------

    private boolean allowedToInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getPackageManager().canRequestPackageInstalls();
    }

    private void askToAllow() {
        String found = mRelease != null ? "Version " + mRelease.version + " is out. " : "";
        show(found + "To update itself, SG Bus Timings needs your OK to install apps. Turn on "
                + "\"Allow from this source\" on the next screen, then come back.",
                "Continue", () -> {
                    mAskedToAllow = true;
                    startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())));
                }, "Not now", this::finish);
    }

    // Samsung's Auto Blocker, the likeliest reason an update didn't install on a Samsung device
    // that allows this app to install apps. Nothing public says whether it's on, so this says
    // "probably", and Try again carries on with the same version.
    private void autoBlocked() {
        mInstalling = false;
        mHandler.removeCallbacks(mNoAnswer);
        show(capitalised(which()) + " didn't install. Samsung's Auto Blocker probably stopped it: it "
                + "only lets apps from the Play Store or Galaxy Store install, even with SG Bus "
                + "Timings allowed to install apps.\n\nTurn it off in Settings > Security and "
                + "privacy > Auto Blocker, then come back and tap Try again. It switches itself "
                + "back on after 30 minutes if \"Turn on automatically\" is on; if not, turn it "
                + "back on there once you've updated.",
                "Open settings", this::openSecuritySettings, "Not now", this::finish);
    }

    // Security and privacy, where Auto Blocker is. Samsung publishes no way to open Auto
    // Blocker's own page, so this opens the one above it, or Settings if even that's missing.
    private void openSecuritySettings() {
        mAskedToUnblock = true;
        try {
            startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
        } catch (ActivityNotFoundException e) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    // Handed to the installer: on a Samsung device, its silence for NO_ANSWER_MS is taken as
    // Auto Blocker. Elsewhere the window waits as long as it takes, as before.
    private void waitForAnswer() {
        mHandler.removeCallbacks(mNoAnswer);
        if (AUTO_BLOCKER) mHandler.postDelayed(mNoAnswer, NO_ANSWER_MS);
    }

    // The installer answered: done, or only asking you first (PENDING_USER_ACTION).
    private void heard(boolean done) {
        mHandler.removeCallbacks(mNoAnswer);
        if (done) mInstalling = false;
    }

    private String which() {
        return mRelease != null ? "version " + mRelease.version : "the update";
    }

    private static String capitalised(String text) {
        return Character.toUpperCase(text.charAt(0)) + text.substring(1);
    }

    // Looks for the update, or carries on with the one already found.
    private void start() {
        mCancelled = false;
        mInstalling = false;
        mHandler.removeCallbacks(mNoAnswer);
        Release found = mRelease;
        progress(found != null ? "Downloading version " + found.version + "…"
                : mCheckOnly ? "Checking for updates…" : "Looking for the update…", -1);
        mWork = new Thread(() -> {
            try {
                Release release = found != null ? found : latest();
                if (release == null) {
                    ui(() -> show("You have the newest version, " + installedVersion() + ".",
                            "Close", this::finish, null, null));
                    return;
                }
                if (found == null && mCheckOnly) {
                    ui(() -> show("Version " + release.version + " is out. You have "
                                    + installedVersion() + ".",
                            "Update", () -> update(release), "Not now", this::finish));
                    return;
                }
                if (!allowedToInstall()) {
                    ui(() -> {
                        mRelease = release;
                        askToAllow();
                    });
                    return;
                }
                File apk = download(release);
                if (apk == null) return; // Cancelled.
                check(apk);
                ui(() -> {
                    // Kept on a Samsung device for Try again after Auto Blocker, which then
                    // carries on with this version rather than looking again.
                    if (AUTO_BLOCKER) mRelease = release;
                    progress("Opening Android's installer…", -1);
                });
                install(apk);
            } catch (Problem p) {
                failed(p.getMessage());
            } catch (IOException | JSONException | NoSuchAlgorithmException | RuntimeException e) {
                Log.w(TAG, e);
                failed("Couldn't download the update. Check you're online, then try again.");
            } finally {
                ui(() -> mWork = null);
            }
        }, "update");
        mWork.start();
    }

    // "Update" on what a check found: on to downloading it, by way of "Install unknown apps"
    // if this app isn't allowed to install it yet.
    private void update(Release release) {
        mRelease = release;
        if (allowedToInstall()) start();
        else askToAllow();
    }

    // The newest release if it's newer than this app, or null.
    private Release latest() throws IOException, JSONException, Problem {
        // A version from a notification makes a URL of its own, which the site's cache hasn't
        // seen, so it's read from GitHub now rather than up to ten minutes ago.
        HttpURLConnection conn = open(mExpected == null ? LATEST : LATEST + "?v=" + mExpected);
        if (conn.getResponseCode() != 200) {
            throw new Problem("Couldn't find out what the newest version is. Try again later.");
        }
        JSONObject json;
        try (InputStream in = conn.getInputStream()) {
            json = new JSONObject(read(in));
        } finally {
            conn.disconnect();
        }
        String version = json.optString("version", "");
        if (version.isEmpty() || !newer(version, installedVersion())) return null;
        Release release = new Release(version, json.getString("apk"),
                json.optLong("size", -1), json.isNull("sha256") ? null : json.getString("sha256"));
        if (!release.apk.startsWith(RELEASES)) {
            throw new Problem("The update isn't on SG Bus Timings' GitHub page, so it wasn't downloaded.");
        }
        return release;
    }

    // The APK, in this app's cache, or null if cancelled on the way.
    private File download(Release release) throws IOException, NoSuchAlgorithmException, Problem {
        File dir = new File(getCacheDir(), "update");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("No room for " + dir);
        File apk = new File(dir, "sg-bus-timings.apk");
        String label = "Downloading version " + release.version + "…";
        ui(() -> progress(label, 0));

        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        HttpURLConnection conn = open(release.apk);
        try {
            if (conn.getResponseCode() != 200) {
                throw new Problem("GitHub didn't send the update (" + conn.getResponseCode() + "). Try again later.");
            }
            long total = conn.getContentLength() > 0 ? conn.getContentLength() : release.size;
            try (InputStream in = new DigestInputStream(conn.getInputStream(), sha256);
                 OutputStream out = new FileOutputStream(apk)) {
                byte[] buf = new byte[16 * 1024];
                long done = 0;
                int lastPercent = -1;
                for (int n; (n = in.read(buf)) != -1; ) {
                    if (mCancelled) {
                        apk.delete();
                        return null;
                    }
                    out.write(buf, 0, n);
                    done += n;
                    int percent = total > 0 ? (int) Math.min(100, done * 100 / total) : -1;
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        String sizes = total > 0 ? " " + megabytes(done) + " of " + megabytes(total) : "";
                        ui(() -> progress(label + sizes, percent));
                    }
                }
            }
        } finally {
            conn.disconnect();
        }

        if (release.sha256 != null && !release.sha256.equalsIgnoreCase(hex(sha256.digest()))) {
            apk.delete();
            throw new Problem("The download doesn't match the file on GitHub. Try again.");
        }
        return apk;
    }

    // That the file is this app, and newer than the one installed.
    private void check(File apk) throws Problem {
        PackageInfo info = getPackageManager().getPackageArchiveInfo(apk.getPath(), 0);
        if (info == null || !getPackageName().equals(info.packageName)) {
            apk.delete();
            throw new Problem("The download isn't SG Bus Timings, so it wasn't installed.");
        }
        if (versionCode(info) <= versionCode(installed())) {
            apk.delete();
            throw new Problem("The download isn't newer than this app, so it wasn't installed.");
        }
    }

    // Hands the APK to Android's installer. Its answer comes to InstallStatus: first that it
    // needs you to confirm, with the screen that asks, then whether it worked.
    private void install(File apk) throws IOException {
        PackageInstaller installer = getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params =
                new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getPackageName());
        params.setSize(apk.length());
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(apk);
                 OutputStream out = session.openWrite("sg-bus-timings.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                for (int n; (n = in.read(buf)) != -1; ) out.write(buf, 0, n);
                session.fsync(out);
            }
            // Mutable, for the installer to add its answer to. Explicit, to InstallStatus only.
            int flags = PendingIntent.FLAG_UPDATE_CURRENT
                    | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent status = PendingIntent.getBroadcast(this, id,
                    new Intent(this, InstallStatus.class), flags);
            // Waiting from before the commit, so even the quickest answer comes after it.
            ui(() -> {
                mInstalling = true;
                waitForAnswer();
            });
            session.commit(status.getIntentSender());
        } catch (IOException | RuntimeException e) {
            installer.abandonSession(id);
            throw e;
        } finally {
            // The session has its own copy now.
            apk.delete();
        }
    }

    // The installer's answers. Not exported, so only the installer, through the PendingIntent
    // above, can send them: an exported one would start any screen another app handed it.
    public static class InstallStatus extends BroadcastReceiver {
        @Override
        public void onReceive(Context context, Intent intent) {
            int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
            UpdateActivity showing = sShowing.get();
            // An answer, so not silence. Waiting starts again when you're back from the screen
            // that asks.
            if (showing != null) showing.heard(status != PackageInstaller.STATUS_PENDING_USER_ACTION);
            if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm == null) return;
                // Started while the update window is still on screen, so Android lets it open.
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(confirm);
            } else if (status == PackageInstaller.STATUS_SUCCESS) {
                // Android stops the app to replace it, so this rarely runs.
                if (showing != null) showing.finish();
            } else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) {
                // "Cancel" on Android's own screen. Also what a screen that ends without
                // Install answers, as Samsung's does when Auto Blocker stops it, so there the
                // window stays to say so.
                Log.i(TAG, "Install aborted: " + intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
                if (showing != null && AUTO_BLOCKER) showing.autoBlocked();
                else if (showing != null) showing.finish();
            } else {
                String why = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                Log.w(TAG, "Install failed: " + status + " " + why);
                boolean conflict = status == PackageInstaller.STATUS_FAILURE_CONFLICT
                        || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE;
                boolean storage = status == PackageInstaller.STATUS_FAILURE_STORAGE;
                if (AUTO_BLOCKER && !conflict && !storage) {
                    if (showing != null) showing.autoBlocked();
                    else Toast.makeText(context, "Samsung's Auto Blocker probably stopped the update. Turn it "
                            + "off in Settings > Security and privacy > Auto Blocker, then update again.",
                            Toast.LENGTH_LONG).show();
                    return;
                }
                String message = conflict
                        ? "Android wouldn't install the update over this app. Uninstall SG Bus Timings, then install it from GitHub."
                        : storage
                        ? "There isn't room on this phone for the update."
                        : "Android couldn't install the update. Try again.";
                if (showing != null) showing.failed(message);
                else Toast.makeText(context, message, Toast.LENGTH_LONG).show();
            }
        }
    }

    // ---------- the window ----------

    private void buildWindow() {
        int pad = dp(24);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, dp(12));
        box.setMinimumWidth(dp(280));

        TextView title = new TextView(this);
        title.setText("Update SG Bus Timings");
        title.setTextAppearance(this, android.R.style.TextAppearance_DeviceDefault_Large);
        box.addView(title);

        mText = new TextView(this);
        mText.setTextAppearance(this, android.R.style.TextAppearance_DeviceDefault_Medium);
        mText.setPadding(0, dp(16), 0, dp(12));
        box.addView(mText);

        mProgress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        mProgress.setMax(100);
        box.addView(mProgress, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.END);
        buttons.setPadding(0, dp(12), 0, 0);
        mSecondary = new Button(this, null, android.R.attr.buttonBarButtonStyle);
        mPrimary = new Button(this, null, android.R.attr.buttonBarButtonStyle);
        buttons.addView(mSecondary);
        buttons.addView(mPrimary);
        box.addView(buttons, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        setContentView(box);
    }

    // A step under way: percent from 0 to 100, or -1 while there's no telling.
    private void progress(String text, int percent) {
        mText.setText(text);
        mProgress.setVisibility(View.VISIBLE);
        mProgress.setIndeterminate(percent < 0);
        if (percent >= 0) mProgress.setProgress(percent);
        button(mPrimary, null, null);
        button(mSecondary, "Cancel", () -> {
            mCancelled = true;
            finish();
        });
    }

    // A message and up to two buttons, with nothing under way.
    private void show(String text, String primary, Runnable onPrimary, String secondary, Runnable onSecondary) {
        mText.setText(text);
        mProgress.setVisibility(View.GONE);
        button(mPrimary, primary, onPrimary);
        button(mSecondary, secondary, onSecondary);
    }

    private void failed(String message) {
        ui(() -> {
            mInstalling = false;
            mHandler.removeCallbacks(mNoAnswer);
            show(message, "Try again", this::start, "Close", this::finish);
        });
    }

    private static void button(Button button, String label, Runnable onClick) {
        button.setVisibility(label == null ? View.GONE : View.VISIBLE);
        button.setText(label);
        button.setOnClickListener(onClick == null ? null : v -> onClick.run());
    }

    private void ui(Runnable step) {
        runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed()) step.run();
        });
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    // ---------- helpers ----------

    private static final class Release {
        final String version;
        final String apk;
        final long size;
        final String sha256;

        Release(String version, String apk, long size, String sha256) {
            this.version = version;
            this.apk = apk;
            this.size = size;
            this.sha256 = sha256;
        }
    }

    // A message for the window, not a stack trace.
    private static final class Problem extends Exception {
        Problem(String message) {
            super(message);
        }
    }

    private HttpURLConnection open(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(30_000);
        conn.setRequestProperty("User-Agent", "SG Bus Timings for Android " + installedVersion());
        // GitHub sends the APK on from its own address to its file storage's, both https.
        conn.setInstanceFollowRedirects(true);
        return conn;
    }

    private PackageInfo installed() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0);
        } catch (PackageManager.NameNotFoundException e) {
            throw new IllegalStateException(e); // This app is always installed.
        }
    }

    private String installedVersion() {
        return installed().versionName;
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    // Whether version a comes after version b, number by number: 1.10.0 after 1.9.0. The same
    // as newer() in main-site/api/app-release.js.
    static boolean newer(String a, String b) {
        String[] x = a.split("\\.");
        String[] y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int d = number(x, i) - number(y, i);
            if (d != 0) return d > 0;
        }
        return false;
    }

    private static int number(String[] parts, int i) {
        try {
            return i < parts.length ? Integer.parseInt(parts[i].replaceAll("\\D", "")) : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static String read(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8 * 1024];
        for (int n; (n = in.read(buf)) != -1; ) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    private static String hex(byte[] bytes) {
        StringBuilder s = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) s.append(String.format(Locale.ROOT, "%02x", b));
        return s.toString();
    }

    private static String megabytes(long bytes) {
        return String.format(Locale.ROOT, "%.1f MB", bytes / 1_000_000.0);
    }
}
