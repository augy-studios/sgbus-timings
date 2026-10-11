/*
 * The value on an EZ-Link or NETS FlashPay card, read over NFC by holding it to the back of the
 * phone (main-site/js/card.js, through js/app-bridge.js). Both are CEPAS cards, Singapore's
 * standard (SS 518): the stored value is in the card's purse, read with CEPAS's Read Purse
 * command, which needs no key. Nothing is written to the card, and nothing read is kept or sent
 * anywhere.
 *
 *   status()  { nfc: "on" | "off" | "none" }
 *   read()    waits for a card, then { balance (cents), can, expiry, autoload (cents),
 *             autoloadOn, version } or rejects "not-cepas", "lost", "off" or "cancelled"
 *   cancel()  stops waiting
 *
 * The purse's layout (from FareBot and Metrodroid, which read the same cards):
 *   0 CEPAS version, 1 purse status (bit 0: auto top-up on), 2-4 balance (signed, cents),
 *   5-7 auto top-up amount (cents), 8-15 CAN (the number printed on the card, as BCD),
 *   16-23 CSN, 24-25 expiry, as days since 1 January 1995.
 *
 * Cards on SimplyGo's account-based ticketing keep their value in the SimplyGo account rather
 * than on the card, so what the card says can be out of date for them; the page says so.
 */
package org.uwuapps.sgbus;

import android.app.Activity;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.util.Arrays;

@CapacitorPlugin(name = "Card")
public class CardPlugin extends Plugin {
    // Read Purse, purse 3 (the one in use), as Metrodroid sends it; then the short form, which
    // some older cards answer instead.
    private static final byte[][] READ_PURSE = {
            {(byte) 0x90, 0x32, 0x03, 0x00, 0x01, 0x00, 0x00},
            {(byte) 0x90, 0x32, 0x03, 0x00, 0x00},
    };
    private static final int MIN_PURSE = 26;
    // 1 January 1995, CEPAS's day 0, in Unix milliseconds.
    private static final long EPOCH_MS = 788918400000L;
    private static final long DAY_MS = 86400000L;

    private PluginCall mWaiting;

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
        IsoDep iso = IsoDep.get(tag);
        if (iso == null) {
            call.reject("That isn't an EZ-Link or NETS FlashPay card", "not-cepas");
        } else {
            try {
                iso.connect();
                iso.setTimeout(2000);
                byte[] purse = readPurse(iso);
                if (purse == null) call.reject("That isn't an EZ-Link or NETS FlashPay card", "not-cepas");
                else call.resolve(parse(purse));
            } catch (IOException e) {
                call.reject("The card moved away too soon. Hold it still and try again.", "lost");
            } finally {
                try {
                    iso.close();
                } catch (IOException ignored) {
                    // Already gone.
                }
            }
        }
        mWaiting = null;
        call.setKeepAlive(false);
        finish();
    }

    private static byte[] readPurse(IsoDep iso) throws IOException {
        for (byte[] command : READ_PURSE) {
            byte[] reply = iso.transceive(command);
            int n = reply.length;
            // The purse, then 90 00 for "done".
            if (n >= MIN_PURSE + 2 && reply[n - 2] == (byte) 0x90 && reply[n - 1] == 0x00) {
                return Arrays.copyOf(reply, n - 2);
            }
        }
        return null;
    }

    private static JSObject parse(byte[] p) {
        JSObject out = new JSObject();
        out.put("version", p[0] & 0xff);
        out.put("autoloadOn", (p[1] & 0x01) != 0);
        out.put("balance", signed24(p, 2));
        out.put("autoload", signed24(p, 5));
        StringBuilder can = new StringBuilder();
        for (int i = 8; i < 16; i++) can.append(String.format("%02X", p[i] & 0xff));
        out.put("can", can.toString());
        int days = ((p[24] & 0xff) << 8) | (p[25] & 0xff);
        out.put("expiry", EPOCH_MS + days * DAY_MS);
        return out;
    }

    private static int signed24(byte[] p, int at) {
        int v = ((p[at] & 0xff) << 16) | ((p[at + 1] & 0xff) << 8) | (p[at + 2] & 0xff);
        return (v & 0x800000) != 0 ? v | 0xff000000 : v;
    }
}
