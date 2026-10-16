/*
 * Offline Sharing, the share card's fifth button (main-site/js/offline-share.js, through
 * js/app-bridge.js): a link to the site handed straight to a phone nearby, with no internet on
 * either. Two ways, both at once while the sheet is open:
 *
 *   Tap     the phones held back to back. This one answers as an NFC tag with the link on it
 *           (ShareTagService), which the other phone reads as it would any tag, so it needs
 *           nothing open: Android opens the link in this app (MainActivity.tappedLink) or, on a
 *           phone without it, in the browser.
 *   Nearby  Google's Nearby Connections, over Bluetooth and Wi-Fi with no network between them.
 *           The phone receiving has Receive nearby open, and shows up here by its name; picking
 *           it sends the link. Needs Google Play services, and Bluetooth's and Nearby devices'
 *           permissions (location's before Android 12), asked for the first time it's used.
 *
 * Sharing:
 *   status()              { nfc: "on" | "off" | "none", tap, nearby, allowed }: tap, whether
 *                         this phone can act as a tag; nearby, whether it has Play services;
 *                         allowed, whether Nearby's permissions are given
 *   share({ url })        this link, on the tag while the sheet's open
 *   find()                asks for Nearby's permissions if it needs to, then looks for phones
 *                         receiving; rejects "permission" if they're refused
 *   send({ id, name })    the link to the phone found, by Nearby
 *   stop()                the sheet's closed: no tag, no looking
 * Receiving:
 *   receive({ name })     shows this phone to phones sharing, by `name`; rejects "permission"
 *   stopReceiving()
 *
 * Events: "found" { id, name } and "lost" { id }, phones receiving; "sent" { via: "tap" |
 * "nearby", id, name }; "failed" { id, message }; "incoming" { name }, a phone connecting to
 * send; "received" { url, name }, only ever a link to the site.
 */
package org.uwuapps.sgbus;

import android.Manifest;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.cardemulation.CardEmulation;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

@CapacitorPlugin(
        name = "OfflineShare",
        permissions = {
                // Android 12 and later.
                @Permission(alias = "bluetooth", strings = {
                        Manifest.permission.BLUETOOTH_ADVERTISE, Manifest.permission.BLUETOOTH_CONNECT,
                        Manifest.permission.BLUETOOTH_SCAN}),
                // Android 13 and later.
                @Permission(alias = "wifi", strings = {Manifest.permission.NEARBY_WIFI_DEVICES}),
                // Before Android 13: Bluetooth and Wi-Fi scans count as location there.
                @Permission(alias = "location", strings = {
                        Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}),
        }
)
public class OfflineSharePlugin extends Plugin {
    // Only phones running this app find each other.
    private static final String SERVICE_ID = "org.uwuapps.sgbus.share";
    // Any number sharing and receiving at once, over Bluetooth: a link needs no more.
    private static final Strategy STRATEGY = Strategy.P2P_CLUSTER;
    // A phone that's taken the link closes the connection; if it doesn't, this does.
    private static final long HANG_UP_MS = 5000;

    private String mUrl;
    private boolean mFinding;
    private boolean mReceiving;
    // Nearby's been started since the app opened, so there may be connections to close.
    private boolean mUsedNearby;
    // The phones being sent to, by their Nearby id: their names.
    private final Map<String, String> mSending = new HashMap<>();
    private final Handler mMain = new Handler(Looper.getMainLooper());

    // ---------- what this phone can do (SgBusPlugin.info) ----------

    static boolean canTap(Context context) {
        return NfcAdapter.getDefaultAdapter(context) != null
                && context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION);
    }

    static boolean canNearby(Context context) {
        return GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS;
    }

    private ConnectionsClient client() {
        return Nearby.getConnectionsClient(getContext());
    }

    private String[] aliases() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return new String[]{"bluetooth", "wifi"};
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) return new String[]{"bluetooth", "location"};
        return new String[]{"location"};
    }

    private boolean allowed() {
        for (String alias : aliases()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) return false;
        }
        return true;
    }

    @PluginMethod
    public void status(PluginCall call) {
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        JSObject out = new JSObject();
        out.put("nfc", nfc == null ? "none" : nfc.isEnabled() ? "on" : "off");
        out.put("tap", canTap(getContext()));
        out.put("nearby", canNearby(getContext()));
        out.put("allowed", allowed());
        call.resolve(out);
    }

    // ---------- sharing ----------

    // A link to the site only: this is never a way to send anything else.
    private static boolean ours(String url) {
        return url != null && url.startsWith(MainActivity.SITE + "/") && url.length() < 4000;
    }

    @PluginMethod
    public void share(PluginCall call) {
        String url = call.getString("url");
        if (!ours(url)) {
            call.reject("Not a link to the site");
            return;
        }
        mUrl = url;
        if (canTap(getContext())) {
            byte[] message = new NdefMessage(NdefRecord.createUri(Uri.parse(url))).toByteArray();
            ShareTagService.share(message, () -> {
                JSObject out = new JSObject();
                out.put("via", "tap");
                notifyListeners("sent", out);
            });
            getActivity().runOnUiThread(this::preferTag);
        }
        call.resolve();
    }

    // While the sheet's open, this app's tag comes before any other app's on the same AID.
    private void preferTag() {
        Activity activity = getActivity();
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        if (activity == null || nfc == null || !ShareTagService.sharing()) return;
        try {
            CardEmulation.getInstance(nfc).setPreferredService(activity, new ComponentName(activity, ShareTagService.class));
        } catch (RuntimeException ignored) {
            // Not resumed, or card emulation's unavailable: the tag still answers, unpreferred.
        }
    }

    private void unpreferTag() {
        Activity activity = getActivity();
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        if (activity == null || nfc == null) return;
        try {
            CardEmulation.getInstance(nfc).unsetPreferredService(activity);
        } catch (RuntimeException ignored) {
            // Never set.
        }
    }

    @PluginMethod
    public void find(PluginCall call) {
        if (!canNearby(getContext())) {
            call.reject("Google Play services aren't available", "unavailable");
            return;
        }
        if (!allowed()) {
            requestPermissionForAliases(aliases(), call, "afterFindPermission");
            return;
        }
        startFinding(call);
    }

    @PermissionCallback
    private void afterFindPermission(PluginCall call) {
        if (!allowed()) {
            call.reject("Nearby devices weren't allowed", "permission");
            return;
        }
        startFinding(call);
    }

    private void startFinding(PluginCall call) {
        mUsedNearby = true;
        client().stopDiscovery();
        DiscoveryOptions options = new DiscoveryOptions.Builder().setStrategy(STRATEGY).build();
        client().startDiscovery(SERVICE_ID, discovery, options)
                .addOnSuccessListener(unused -> {
                    mFinding = true;
                    call.resolve();
                })
                .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "Couldn't look for phones" : e.getMessage(), "failed"));
    }

    private final EndpointDiscoveryCallback discovery = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String id, DiscoveredEndpointInfo info) {
            if (!SERVICE_ID.equals(info.getServiceId())) return;
            JSObject out = new JSObject();
            out.put("id", id);
            out.put("name", info.getEndpointName());
            notifyListeners("found", out);
        }

        @Override
        public void onEndpointLost(String id) {
            JSObject out = new JSObject();
            out.put("id", id);
            notifyListeners("lost", out);
        }
    };

    @PluginMethod
    public void send(PluginCall call) {
        String id = call.getString("id");
        String name = call.getString("name", "");
        if (id == null || mUrl == null) {
            call.reject("Nothing to send");
            return;
        }
        mSending.put(id, name);
        client().requestConnection(myName(call.getString("from")), id, sender)
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(e -> {
                    // Already connected to it, from a send a moment ago: carry on with that one.
                    if (e instanceof ApiException
                            && ((ApiException) e).getStatusCode() == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) {
                        sendTo(id);
                        call.resolve();
                        return;
                    }
                    mSending.remove(id);
                    failed(id, "Couldn't reach that phone. Try again, closer to it.");
                    call.resolve();
                });
    }

    private void failed(String id, String message) {
        JSObject out = new JSObject();
        out.put("id", id);
        out.put("message", message);
        notifyListeners("failed", out);
    }

    // The name the other phone sees: the one in Settings, or the phone's model.
    private static String myName(String name) {
        if (name != null && !name.trim().isEmpty()) return name.trim();
        return Build.MODEL == null || Build.MODEL.isEmpty() ? "A phone" : Build.MODEL;
    }

    private void sendTo(String id) {
        String url = mUrl;
        if (url == null) return;
        client().sendPayload(id, Payload.fromBytes(url.getBytes(StandardCharsets.UTF_8)));
    }

    private final ConnectionLifecycleCallback sender = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String id, ConnectionInfo info) {
            // Asked for by this phone, to the phone picked: accepted at once.
            client().acceptConnection(id, senderPayloads);
        }

        @Override
        public void onConnectionResult(String id, ConnectionResolution result) {
            if (result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_OK) {
                sendTo(id);
            } else if (mSending.remove(id) != null) {
                failed(id, result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_CONNECTION_REJECTED
                        ? "That phone said no." : "Couldn't reach that phone. Try again, closer to it.");
            }
        }

        @Override
        public void onDisconnected(String id) {
            if (mSending.remove(id) != null) failed(id, "That phone went out of reach. Try again, closer to it.");
        }
    };

    private final PayloadCallback senderPayloads = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String id, Payload payload) {
            // Nothing comes back.
        }

        @Override
        public void onPayloadTransferUpdate(String id, PayloadTransferUpdate update) {
            if (update.getStatus() == PayloadTransferUpdate.Status.SUCCESS) {
                String name = mSending.remove(id);
                if (name == null) return;
                JSObject out = new JSObject();
                out.put("via", "nearby");
                out.put("id", id);
                out.put("name", name);
                notifyListeners("sent", out);
                mMain.postDelayed(() -> client().disconnectFromEndpoint(id), HANG_UP_MS);
            } else if (update.getStatus() == PayloadTransferUpdate.Status.FAILURE
                    || update.getStatus() == PayloadTransferUpdate.Status.CANCELED) {
                if (mSending.remove(id) != null) failed(id, "It didn't go through. Try again.");
                client().disconnectFromEndpoint(id);
            }
        }
    };

    @PluginMethod
    public void stop(PluginCall call) {
        stopSharing();
        call.resolve();
    }

    private void stopSharing() {
        mUrl = null;
        ShareTagService.stop();
        Activity activity = getActivity();
        if (activity != null) activity.runOnUiThread(this::unpreferTag);
        if (mFinding) {
            client().stopDiscovery();
            mFinding = false;
        }
        if (mUsedNearby && !mReceiving) client().stopAllEndpoints();
        mSending.clear();
    }

    // ---------- receiving ----------

    @PluginMethod
    public void receive(PluginCall call) {
        if (!canNearby(getContext())) {
            call.reject("Google Play services aren't available", "unavailable");
            return;
        }
        if (!allowed()) {
            requestPermissionForAliases(aliases(), call, "afterReceivePermission");
            return;
        }
        startReceiving(call);
    }

    @PermissionCallback
    private void afterReceivePermission(PluginCall call) {
        if (!allowed()) {
            call.reject("Nearby devices weren't allowed", "permission");
            return;
        }
        startReceiving(call);
    }

    private void startReceiving(PluginCall call) {
        mUsedNearby = true;
        client().stopAdvertising();
        AdvertisingOptions options = new AdvertisingOptions.Builder().setStrategy(STRATEGY).build();
        client().startAdvertising(myName(call.getString("name")), SERVICE_ID, receiver, options)
                .addOnSuccessListener(unused -> {
                    mReceiving = true;
                    call.resolve();
                })
                .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "Couldn't start receiving" : e.getMessage(), "failed"));
    }

    // Who's connecting to send, by Nearby id: their names.
    private final Map<String, String> mIncoming = new HashMap<>();

    private final ConnectionLifecycleCallback receiver = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String id, ConnectionInfo info) {
            // Receive nearby is open to take a link: what comes is only ever opened if it's a
            // link to the site, and the page shows it before anything's done with it.
            mIncoming.put(id, info.getEndpointName());
            client().acceptConnection(id, receiverPayloads);
            JSObject out = new JSObject();
            out.put("name", info.getEndpointName());
            notifyListeners("incoming", out);
        }

        @Override
        public void onConnectionResult(String id, ConnectionResolution result) {
            if (result.getStatus().getStatusCode() != ConnectionsStatusCodes.STATUS_OK) mIncoming.remove(id);
        }

        @Override
        public void onDisconnected(String id) {
            mIncoming.remove(id);
        }
    };

    private final PayloadCallback receiverPayloads = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String id, Payload payload) {
            if (payload.getType() != Payload.Type.BYTES || payload.asBytes() == null) return;
            String url = new String(payload.asBytes(), StandardCharsets.UTF_8);
            String name = mIncoming.remove(id);
            client().disconnectFromEndpoint(id);
            if (!ours(url)) return;
            JSObject out = new JSObject();
            out.put("url", url);
            out.put("name", name == null ? "" : name);
            notifyListeners("received", out, true);
        }

        @Override
        public void onPayloadTransferUpdate(String id, PayloadTransferUpdate update) {
            // A link comes in one piece, in onPayloadReceived.
        }
    };

    @PluginMethod
    public void stopReceiving(PluginCall call) {
        stopReceivingNow();
        call.resolve();
    }

    private void stopReceivingNow() {
        if (mReceiving) {
            client().stopAdvertising();
            mReceiving = false;
        }
        mIncoming.clear();
        if (mUsedNearby && mUrl == null) client().stopAllEndpoints();
    }

    // ---------- an NFC sticker (2.1.0) ----------
    // write({ url }) waits for a sticker held to the phone and writes the link onto it, so a tap
    // on it opens the link, in this app (MainActivity's NDEF_DISCOVERED) or the browser.
    // Resolves once it's written, or rejects "readonly", "small" (too little room on it),
    // "not-ndef" (a card or tag that can't hold a link), "lost", "off" or "cancelled".
    // cancelWrite() stops waiting.

    private PluginCall mWriting;

    @PluginMethod
    public void write(PluginCall call) {
        String url = call.getString("url");
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        if (!ours(url)) {
            call.reject("Not a link to the site");
            return;
        }
        if (nfc == null || !nfc.isEnabled()) {
            call.reject("NFC is off", "off");
            return;
        }
        if (mWriting != null) mWriting.reject("Another write started", "cancelled");
        mWriting = call;
        call.setKeepAlive(true);
        NdefMessage message = new NdefMessage(NdefRecord.createUri(Uri.parse(url)));
        Activity activity = getActivity();
        activity.runOnUiThread(() -> nfc.enableReaderMode(activity, tag -> onSticker(tag, message),
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B | NfcAdapter.FLAG_READER_NFC_F
                        | NfcAdapter.FLAG_READER_NFC_V, null));
    }

    @PluginMethod
    public void cancelWrite(PluginCall call) {
        stopWriting("cancelled");
        call.resolve();
    }

    private void stopWriting(String why) {
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        Activity activity = getActivity();
        if (nfc != null && activity != null) activity.runOnUiThread(() -> nfc.disableReaderMode(activity));
        if (mWriting != null && why != null) {
            mWriting.setKeepAlive(false);
            mWriting.reject("Cancelled", why);
        }
        mWriting = null;
    }

    private void onSticker(android.nfc.Tag tag, NdefMessage message) {
        PluginCall call = mWriting;
        if (call == null) return;
        String code = null;
        String text = null;
        try {
            android.nfc.tech.Ndef ndef = android.nfc.tech.Ndef.get(tag);
            if (ndef != null) {
                ndef.connect();
                try {
                    if (!ndef.isWritable()) {
                        code = "readonly";
                        text = "That sticker's locked: it can't be written to.";
                    } else if (ndef.getMaxSize() < message.toByteArray().length) {
                        code = "small";
                        text = "That sticker's too small for this link.";
                    } else {
                        ndef.writeNdefMessage(message);
                    }
                } finally {
                    ndef.close();
                }
            } else {
                android.nfc.tech.NdefFormatable blank = android.nfc.tech.NdefFormatable.get(tag);
                if (blank == null) {
                    code = "not-ndef";
                    text = "That can't hold a link. Use a blank NFC sticker (NTAG213 or bigger).";
                } else {
                    blank.connect();
                    try {
                        blank.format(message);
                    } finally {
                        blank.close();
                    }
                }
            }
        } catch (java.io.IOException | android.nfc.FormatException | SecurityException e) {
            code = "lost";
            text = "The sticker moved away too soon. Hold it still and try again.";
        }
        mWriting = null;
        call.setKeepAlive(false);
        if (code == null) call.resolve();
        else call.reject(text, code);
        stopWriting(null);
    }

    // ---------- the app coming and going ----------

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (ShareTagService.sharing()) preferTag();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        unpreferTag();
        // Reader mode ends with the app leaving the screen: the page asks again when it's back.
        if (mWriting != null) stopWriting("cancelled");
    }

    @Override
    protected void handleOnDestroy() {
        stopSharing();
        stopReceivingNow();
        super.handleOnDestroy();
    }
}
