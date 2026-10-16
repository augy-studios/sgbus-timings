/*
 * Offline Sharing's tap (OfflineSharePlugin): while the share card's Offline Sharing is open,
 * the phone answers as an NFC tag holding the link, so another phone held back to back reads it
 * as it would any tag. Android opens a link to the site in this app (MainActivity), or in the
 * browser without it; nothing goes through the internet. Since Android Beam went in Android 10,
 * this is how one phone hands another something over NFC: host card emulation (HCE).
 *
 * The tag is an NFC Forum Type 4 Tag (Type 4 Tag Technical Specification 2.0): the NDEF tag
 * application (AID D2760000850101) with its two files, the capability container (E103) saying
 * how big the NDEF file is and that it's read-only, and the NDEF file (E104), the message's
 * length in two bytes and then the message, one URI record. A reader selects the application,
 * then each file, and reads them with READ BINARY.
 *
 * Registered for the AID all the time (AndroidManifest.xml, res/xml/share_tag_service.xml),
 * but answering "not found" to everything unless something's being shared, so a phone that
 * isn't sharing looks like no tag at all.
 */
package org.uwuapps.sgbus;

import android.nfc.cardemulation.HostApduService;
import android.os.Bundle;
import android.os.SystemClock;

import java.util.Arrays;

public class ShareTagService extends HostApduService {
    private static final byte[] OK = {(byte) 0x90, 0x00};
    private static final byte[] NOT_FOUND = {0x6A, (byte) 0x82};
    private static final byte[] WRONG_OFFSET = {0x6B, 0x00};
    private static final byte[] NOT_SUPPORTED = {0x6D, 0x00};

    private static final byte[] NDEF_APP = {(byte) 0xD2, 0x76, 0x00, 0x00, (byte) 0x85, 0x01, 0x01};
    private static final byte[] CC_FILE = {(byte) 0xE1, 0x03};
    private static final byte[] NDEF_FILE = {(byte) 0xE1, 0x04};
    // The most a reader's asked for in one READ BINARY (MLe) and sent in one UPDATE (MLc).
    private static final int MAX_APDU = 0xF0;
    // A reader that reads the message twice in a row still sends it once.
    private static final long READ_AGAIN_MS = 2000;

    // The NDEF file being shared, or null when nothing is; and what to call when it's been read.
    private static volatile byte[] sFile;
    private static volatile Runnable sOnRead;
    private static long sLastRead;

    private boolean mAppSelected;
    private byte[] mSelected;

    // `message` is an NdefMessage's bytes.
    static void share(byte[] message, Runnable onRead) {
        byte[] file = new byte[message.length + 2];
        file[0] = (byte) (message.length >> 8);
        file[1] = (byte) message.length;
        System.arraycopy(message, 0, file, 2, message.length);
        sOnRead = onRead;
        sFile = file;
    }

    static void stop() {
        sFile = null;
        sOnRead = null;
    }

    static boolean sharing() {
        return sFile != null;
    }

    private static byte[] capabilityContainer(int ndefSize) {
        return new byte[]{
                0x00, 0x0F, // its length
                0x20, // mapping version 2.0
                0x00, (byte) MAX_APDU, // MLe
                0x00, (byte) MAX_APDU, // MLc
                0x04, 0x06, // NDEF file control TLV
                NDEF_FILE[0], NDEF_FILE[1],
                (byte) (ndefSize >> 8), (byte) ndefSize, // the NDEF file's size
                0x00, // read: anyone
                (byte) 0xFF, // write: no one
        };
    }

    @Override
    public byte[] processCommandApdu(byte[] apdu, Bundle extras) {
        byte[] file = sFile;
        if (file == null || apdu == null || apdu.length < 4 || apdu[0] != 0x00) return NOT_FOUND;
        byte ins = apdu[1];

        // SELECT
        if (ins == (byte) 0xA4) {
            int lc = apdu.length > 4 ? apdu[4] & 0xff : 0;
            if (apdu.length < 5 + lc) return NOT_FOUND;
            byte[] data = Arrays.copyOfRange(apdu, 5, 5 + lc);
            if (apdu[2] == 0x04) {
                mAppSelected = Arrays.equals(data, NDEF_APP);
                mSelected = null;
                return mAppSelected ? OK : NOT_FOUND;
            }
            if (apdu[2] == 0x00 && mAppSelected) {
                if (Arrays.equals(data, CC_FILE)) {
                    mSelected = capabilityContainer(file.length);
                    return OK;
                }
                if (Arrays.equals(data, NDEF_FILE)) {
                    mSelected = file;
                    return OK;
                }
            }
            return NOT_FOUND;
        }

        // READ BINARY: P1 P2 the offset, Le how much (0 for 256).
        if (ins == (byte) 0xB0) {
            byte[] selected = mSelected;
            if (selected == null) return NOT_FOUND;
            int offset = ((apdu[2] & 0x7f) << 8) | (apdu[3] & 0xff);
            int le = apdu.length > 4 ? apdu[4] & 0xff : 0;
            if (le == 0) le = 256;
            if (offset > selected.length) return WRONG_OFFSET;
            int n = Math.min(le, selected.length - offset);
            byte[] out = new byte[n + 2];
            System.arraycopy(selected, offset, out, 0, n);
            out[n] = (byte) 0x90;
            out[n + 1] = 0x00;
            // To its end: the other phone has the whole link.
            if (selected == file && offset + n >= file.length && file.length > 2) read();
            return out;
        }

        return NOT_SUPPORTED;
    }

    private static synchronized void read() {
        long now = SystemClock.elapsedRealtime();
        if (now - sLastRead < READ_AGAIN_MS) return;
        sLastRead = now;
        Runnable onRead = sOnRead;
        if (onRead != null) onRead.run();
    }

    @Override
    public void onDeactivated(int reason) {
        mAppSelected = false;
        mSelected = null;
    }
}
