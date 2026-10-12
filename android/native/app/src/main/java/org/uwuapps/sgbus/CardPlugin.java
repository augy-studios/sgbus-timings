/*
 * The value on an EZ-Link or NETS FlashPay card, read over NFC by holding it to the back of the
 * phone (main-site/js/card.js, through js/app-bridge.js). Both are CEPAS cards, Singapore's
 * standard (SS 518): the stored value is in the card's purse, read with CEPAS's Read Purse
 * command, which needs no key. Nothing is written to the card, and nothing read is kept or sent
 * anywhere.
 *
 *   status()  { nfc: "on" | "off" | "none" }
 *   read()    waits for a card, then { balance (cents), can, expiry, autoload (cents),
 *             autoloadOn, purseEnabled, version, raw, history } or rejects "not-cepas", "lost",
 *             "off" or "cancelled"
 *   cancel()  stops waiting
 *
 * Event: "tapped", a card held to the phone while it wasn't waiting for one, which Android
 * offers to this app (AndroidManifest.xml's TECH_DISCOVERED, res/xml/nfc_tech.xml), even with
 * the app closed: the card's read at once, before it's taken away, and the page gets what
 * read() would have answered, or { error, message, raw } (2.0.8). Kept until the page is
 * listening, as on a tap that opens the app it's still loading.
 *
 * The purse's layout (from FareBot and Metrodroid, which read the same cards):
 *   0 CEPAS version, 1 purse status (bit 0: purse enabled, bit 1: auto top-up on),
 *   2-4 balance (signed, cents),
 *   5-7 auto top-up amount (cents), 8-15 CAN (the number printed on the card, as BCD),
 *   16-23 CSN, 24-25 expiry, as days since 1 January 1995.
 *
 * Read Purse is 90 32 <purse> 00 with no data. With one data byte (90 32 03 00 01 00 00), the
 * same command answers the purse's history instead: an EZ-Link card read on 12 October 2026
 * did, which first read as a value of -$201.65. So the purse is asked for in the short form,
 * and only taken if it looks like one (its first byte, the CEPAS version, is small; a history
 * record's is its type, 0x30 and up).
 *
 * The history is the last rides and top-ups, newest first, 16 bytes each: 0 type (0x30 MRT,
 * 0x31 bus, 0x75 top-up, 0x76 bus refund), 1-3 amount (signed, cents), 4-7 when, as seconds
 * since 1 January 1995 Singapore time, 8-15 what, in ASCII ("BUS  21", "HBC-BDK").
 *
 * Cards on SimplyGo's account-based ticketing keep their value in the SimplyGo account rather
 * than on the card, so what the card says can be out of date for them; the page says so. It
 * shows no value outside what a card can hold.
 *
 * `raw` is the purse as read, in hex, with the card's numbers (CAN and CSN, bytes 8 to 23)
 * blanked out, for working out a card that reads wrongly (the page offers to copy it).
 */
package org.uwuapps.sgbus;

import android.app.Activity;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Bundle;

import androidx.core.content.IntentCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.lang.ref.WeakReference;
import java.util.Arrays;

@CapacitorPlugin(name = "Card")
public class CardPlugin extends Plugin {
    // Purse 3, the one in use: the purse itself, and its history.
    private static final byte[] READ_PURSE = {(byte) 0x90, 0x32, 0x03, 0x00, 0x00};
    private static final byte[] READ_HISTORY = {(byte) 0x90, 0x32, 0x03, 0x00, 0x01, 0x00, 0x00};
    private static final int MIN_PURSE = 26;
    private static final int RECORD = 16;
    // 1 January 1995 in Singapore, CEPAS's second 0 for its history, in Unix milliseconds.
    private static final long EPOCH_SG_MS = 788918400000L - 8L * 60 * 60 * 1000;
    // 1 January 1995, CEPAS's day 0, in Unix milliseconds.
    private static final long EPOCH_MS = 788918400000L;
    private static final long DAY_MS = 86400000L;

    private PluginCall mWaiting;

    private static WeakReference<CardPlugin> sPlugin = new WeakReference<>(null);
    // A tapped card's read, waiting for the plugin to load.
    private static JSObject sTapped;

    // What reading a card came to: the card, or why not.
    private static final class Read {
        JSObject card;
        String code;
        String message;
        JSObject data;

        static Read failed(String code, String message, JSObject data) {
            Read r = new Read();
            r.code = code;
            r.message = message;
            r.data = data;
            return r;
        }
    }

    @Override
    public void load() {
        sPlugin = new WeakReference<>(this);
        JSObject tapped;
        synchronized (CardPlugin.class) {
            tapped = sTapped;
            sTapped = null;
        }
        if (tapped != null) notifyListeners("tapped", tapped, true);
    }

    // A card Android gave the app (MainActivity), read off the main thread while it's still
    // there. Says whether the intent was one.
    static boolean tapped(Intent intent) {
        // Opened again from recents with the intent it was first opened with: that card's long gone.
        if (intent == null || (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false;
        String action = intent.getAction();
        if (!NfcAdapter.ACTION_TECH_DISCOVERED.equals(action) && !NfcAdapter.ACTION_TAG_DISCOVERED.equals(action)) return false;
        Tag tag = IntentCompat.getParcelableExtra(intent, NfcAdapter.EXTRA_TAG, Tag.class);
        if (tag == null) return false;
        new Thread(() -> {
            Read r = readCard(tag);
            JSObject out;
            if (r.card != null) {
                out = r.card;
            } else {
                out = new JSObject();
                out.put("error", r.code);
                out.put("message", r.message);
                if (r.data != null && r.data.has("raw")) out.put("raw", r.data.getString("raw"));
            }
            CardPlugin plugin = sPlugin.get();
            if (plugin != null) {
                plugin.notifyListeners("tapped", out, true);
            } else {
                synchronized (CardPlugin.class) {
                    sTapped = out;
                }
            }
        }, "card-tapped").start();
        return true;
    }

    @PluginMethod
    public void status(PluginCall call) {
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        JSObject out = new JSObject();
        out.put("nfc", nfc == null ? "none" : nfc.isEnabled() ? "on" : "off");
        call.resolve(out);
    }

    @PluginMethod
    public void read(PluginCall call) {
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        if (nfc == null) {
            call.reject("This phone has no NFC", "none");
            return;
        }
        if (!nfc.isEnabled()) {
            call.reject("NFC is off", "off");
            return;
        }
        if (mWaiting != null) mWaiting.reject("Another read started", "cancelled");
        mWaiting = call;
        call.setKeepAlive(true);
        Activity activity = getActivity();
        Bundle options = new Bundle();
        options.putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 250);
        // Reader mode: the card comes straight here, not to whatever other app answers it.
        activity.runOnUiThread(() -> nfc.enableReaderMode(activity, this::onTag,
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B
                        | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
                options));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        finish();
        if (mWaiting != null) {
            mWaiting.reject("Cancelled", "cancelled");
            mWaiting = null;
        }
        call.resolve();
    }

    // Leaving the app stops reader mode; the page asks again when it's back.
    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (mWaiting != null) {
            finish();
            mWaiting.reject("Cancelled", "cancelled");
            mWaiting = null;
        }
    }

    private void finish() {
        NfcAdapter nfc = NfcAdapter.getDefaultAdapter(getContext());
        Activity activity = getActivity();
        if (nfc != null && activity != null) activity.runOnUiThread(() -> nfc.disableReaderMode(activity));
    }

    private void onTag(Tag tag) {
        PluginCall call = mWaiting;
        if (call == null) return;
        Read r = readCard(tag);
        if (r.card != null) call.resolve(r.card);
        else call.reject(r.message, r.code, null, r.data);
        mWaiting = null;
        call.setKeepAlive(false);
        finish();
    }

    private static Read readCard(Tag tag) {
        IsoDep iso = IsoDep.get(tag);
        if (iso == null) return Read.failed("not-cepas", "That isn't an EZ-Link or NETS FlashPay card", null);
        try {
            iso.connect();
            iso.setTimeout(2000);
            byte[] purse = command(iso, READ_PURSE);
            if (purse == null || purse.length < MIN_PURSE || (purse[0] & 0xff) >= 0x30) {
                JSObject data = new JSObject();
                if (purse != null) data.put("raw", hex(purse));
                return Read.failed("not-cepas", "That isn't an EZ-Link or NETS FlashPay card", data);
            }
            Read r = new Read();
            r.card = parse(purse);
            // The history's a nicety: a card that won't give it still has its value.
            try {
                r.card.put("history", history(command(iso, READ_HISTORY)));
            } catch (IOException e) {
                r.card.put("history", new JSArray());
            }
            return r;
        } catch (IOException | SecurityException e) {
            // SecurityException: the tag's gone stale, as an intent's can be by the time it's read.
            return Read.failed("lost", "The card moved away too soon. Hold it still and try again.", null);
        } finally {
            try {
                iso.close();
            } catch (IOException | SecurityException ignored) {
                // Already gone.
            }
        }
    }

    // A command's answer without its 90 00 ("done"), or null if it didn't end so.
    private static byte[] command(IsoDep iso, byte[] command) throws IOException {
        byte[] reply = iso.transceive(command);
        int n = reply.length;
        if (n < 2 || reply[n - 2] != (byte) 0x90 || reply[n - 1] != 0x00) return null;
        return Arrays.copyOf(reply, n - 2);
    }

    private static JSArray history(byte[] h) {
        JSArray out = new JSArray();
        if (h == null) return out;
        for (int at = 0; at + RECORD <= h.length; at += RECORD) {
            int type = h[at] & 0xff;
            long secs = ((h[at + 4] & 0xffL) << 24) | ((h[at + 5] & 0xff) << 16) | ((h[at + 6] & 0xff) << 8) | (h[at + 7] & 0xff);
            StringBuilder what = new StringBuilder();
            for (int i = at + 8; i < at + RECORD; i++) {
                int c = h[i] & 0xff;
                if (c >= 0x20 && c < 0x7f) what.append((char) c);
            }
            JSObject r = new JSObject();
            r.put("type", type == 0x30 ? "train" : type == 0x31 ? "bus" : type == 0x75 ? "topup" : type == 0x76 ? "refund" : "other");
            r.put("amount", signed24(h, at + 1));
            r.put("time", EPOCH_SG_MS + secs * 1000);
            r.put("what", what.toString().trim().replaceAll("\\s+", " "));
            out.put(r);
        }
        return out;
    }

    // In hex, with the card's numbers (CAN and CSN, bytes 8 to 23) blanked out.
    private static String hex(byte[] p) {
        StringBuilder raw = new StringBuilder();
        for (int i = 0; i < p.length; i++) {
            if (i > 0) raw.append(' ');
            raw.append(i >= 8 && i < 24 ? "--" : String.format("%02X", p[i] & 0xff));
        }
        return raw.toString();
    }

    private static JSObject parse(byte[] p) {
        JSObject out = new JSObject();
        out.put("version", p[0] & 0xff);
        out.put("purseEnabled", (p[1] & 0x01) != 0);
        out.put("autoloadOn", (p[1] & 0x02) != 0);
        out.put("balance", signed24(p, 2));
        out.put("autoload", signed24(p, 5));
        StringBuilder can = new StringBuilder();
        for (int i = 8; i < 16; i++) can.append(String.format("%02X", p[i] & 0xff));
        out.put("can", can.toString());
        int days = ((p[24] & 0xff) << 8) | (p[25] & 0xff);
        out.put("expiry", EPOCH_MS + days * DAY_MS);
        out.put("raw", hex(p));
        return out;
    }

    private static int signed24(byte[] p, int at) {
        int v = ((p[at] & 0xff) << 16) | ((p[at + 1] & 0xff) << 8) | (p[at + 2] & 0xff);
        return (v & 0x800000) != 0 ? v | 0xff000000 : v;
    }
}
