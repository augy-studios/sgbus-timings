/*
 * The Get Off Alert's beeps when Settings has its sound in earphones only (TripPlugin.alert's
 * quiet): three short beeps that only you hear, or none at all. Never out loud (2.2.6).
 *
 * Earphones are wired or USB ones, Bluetooth earbuds or a headset, LE Audio ones, or hearing
 * aids (onEar). Most Bluetooth earbuds take media (A2DP), and the beeps go there as a
 * navigation app's prompts do, ducking any music for the moment. A one-ear earpiece often only
 * takes calls (SCO, the hands-free profile), which media never reaches: there the beeps go over
 * the call link, opened for them and closed straight after. Before 2.2.6 a call-only earpiece
 * didn't count as earphones, and the alert only buzzed.
 *
 * The beeps only start once Android says the sound is going to the earphones (the track's
 * routed device). Until then, and for LEAD_MS after, it plays silence, which also gives a
 * Bluetooth link time to wake, so the first beep isn't cut off. If that isn't so within
 * WAIT_MS, or the sound moves off the earphones partway, it stops: the alert still buzzes.
 * Everything's given back (the call link, the phone's audio mode, the music) within MAX_MS,
 * whatever happens; if the app dies meanwhile, Android takes them back itself.
 *
 * Not BLE speakers (out loud), nor LE Audio broadcasts (Auracast), which may be to a speaker
 * or a room. A car's hands-free counts as a call-only earpiece, as a car's media already
 * counted as earphones: Android can't tell them apart without the Bluetooth permission.
 */
package org.uwuapps.sgbus;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Build;
import android.os.SystemClock;

import java.util.concurrent.atomic.AtomicBoolean;

final class EarBeep {
    private static final int RATE = 16000;
    private static final int TONE_HZ = 880;
    // 3 beeps of 180 ms, 250 ms apart, as ToneGenerator's were before 2.2.6.
    private static final int BEEPS = 3;
    private static final int BEEP_MS = 180;
    private static final int GAP_MS = 70;
    private static final int FADE_MS = 10;
    private static final double LEVEL = 0.8;
    // Written a CHUNK_MS at a time, so a move off the earphones stops it within about that.
    private static final int CHUNK_MS = 20;
    private static final int LEAD_MS = 400;
    // A call link takes a second or two to open.
    private static final long WAIT_MS = 3000;
    private static final long MAX_MS = 6000;

    // One alert's beeps at a time.
    private static final AtomicBoolean sBusy = new AtomicBoolean(false);

    private EarBeep() {}

    // Whether there are earphones of any kind to beep in (SgBusPlugin.earphones).
    static boolean any(Context context) {
        AudioManager am = context.getSystemService(AudioManager.class);
        if (am == null) return false;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (onEar(d)) return true;
        }
        return false;
    }

    // The beeps, off the main thread. Nothing at all without earphones.
    static void beep(Context context) {
        Context app = context.getApplicationContext();
        if (!sBusy.compareAndSet(false, true)) return;
        new Thread(() -> {
            try {
                play(app);
            } catch (RuntimeException | InterruptedException ignored) {
                // No beeps this time: it still buzzes.
            } finally {
                sBusy.set(false);
            }
        }, "get-off-beep").start();
    }

    private static boolean isMedia(int t) {
        return t == AudioDeviceInfo.TYPE_WIRED_HEADSET || t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                || t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || t == AudioDeviceInfo.TYPE_USB_HEADSET
                || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && t == AudioDeviceInfo.TYPE_HEARING_AID)
                || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && t == AudioDeviceInfo.TYPE_BLE_HEADSET);
    }

    private static boolean onEar(AudioDeviceInfo d) {
        return d != null && (isMedia(d.getType()) || d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO);
    }

    private static void play(Context context) throws InterruptedException {
        AudioManager am = context.getSystemService(AudioManager.class);
        if (am == null) return;
        // On a call, or in another app's: that has the sound, and the alert just buzzes.
        if (am.getMode() != AudioManager.MODE_NORMAL) return;
        AudioDeviceInfo media = null;
        AudioDeviceInfo call = null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            if (media == null && isMedia(d.getType())) media = d;
            else if (call == null && d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) call = d;
        }
        long deadline = SystemClock.elapsedRealtime() + MAX_MS;
        // Earbuds that take both go by media, which needs no call link.
        if (media != null) playMedia(am, media, deadline);
        else if (call != null) playCall(am, deadline);
    }

    private static void playMedia(AudioManager am, AudioDeviceInfo device, long deadline) throws InterruptedException {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        Object focus = takeFocus(am, attrs, AudioManager.STREAM_MUSIC);
        AudioTrack track = null;
        try {
            track = track(attrs);
            track.setPreferredDevice(device);
            run(track, deadline);
        } finally {
            if (track != null) track.release();
            giveFocus(am, focus);
        }
    }

    // Over the call link: the phone in "in a call" mode for the moment, with the earpiece as its
    // call device (Android 12 and later), or Bluetooth's SCO link opened (before). Both undone,
    // the track first, so nothing's left playing as the sound comes back to the phone.
    @SuppressWarnings("deprecation")
    private static void playCall(AudioManager am, long deadline) throws InterruptedException {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
        int mode = am.getMode();
        Object focus = null;
        AudioTrack track = null;
        boolean moded = false;
        boolean linked = false;
        try {
            focus = takeFocus(am, attrs, AudioManager.STREAM_VOICE_CALL);
            am.setMode(AudioManager.MODE_IN_COMMUNICATION);
            moded = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo target = null;
                for (AudioDeviceInfo d : am.getAvailableCommunicationDevices()) {
                    if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                        target = d;
                        break;
                    }
                }
                if (target == null || !am.setCommunicationDevice(target)) return;
            } else {
                if (!am.isBluetoothScoAvailableOffCall()) return;
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
            }
            linked = true;
            track = track(attrs);
            run(track, deadline);
        } finally {
            if (track != null) track.release();
            if (linked) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    am.clearCommunicationDevice();
                } else {
                    am.setBluetoothScoOn(false);
                    am.stopBluetoothSco();
                }
            }
            if (moded) am.setMode(mode);
            giveFocus(am, focus);
        }
    }

    private static AudioTrack track(AudioAttributes attrs) {
        int min = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT);
        AudioTrack track = new AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(new AudioFormat.Builder()
                        .setSampleRate(RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .build())
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(Math.max(min, RATE * 2 * CHUNK_MS * 2 / 1000))
                .build();
        if (track.getState() != AudioTrack.STATE_INITIALIZED) {
            track.release();
            throw new IllegalStateException("no audio track");
        }
        return track;
    }

    // Silence until the track's going to earphones, and LEAD_MS more; then the beeps, checking
    // before each CHUNK_MS that it still is; then waits for them to finish playing. The caller
    // releases the track.
    private static void run(AudioTrack track, long deadline) throws InterruptedException {
        short[] silence = new short[RATE * CHUNK_MS / 1000];
        short[] beeps = beeps();
        long waitUntil = SystemClock.elapsedRealtime() + WAIT_MS;
        int written = 0;
        int lead = -1; // chunks of silence since it's been going to earphones
        track.play();
        while (lead < LEAD_MS / CHUNK_MS) {
            if (lead < 0 && SystemClock.elapsedRealtime() > waitUntil) return;
            if (!write(track, silence, 0, silence.length, deadline)) return;
            written += silence.length;
            if (lead >= 0) lead++;
            else if (onEar(track.getRoutedDevice())) lead = 0;
        }
        for (int at = 0; at < beeps.length; at += silence.length) {
            if (!onEar(track.getRoutedDevice())) {
                halt(track);
                return;
            }
            int n = Math.min(silence.length, beeps.length - at);
            if (!write(track, beeps, at, n, deadline)) return;
            written += n;
        }
        // What's still waiting in the track plays out (a buffer's worth, and a little), before
        // the caller lets it go.
        long drainUntil = Math.min(deadline, SystemClock.elapsedRealtime()
                + track.getBufferSizeInFrames() * 1000L / RATE + 300);
        while (track.getPlaybackHeadPosition() < written && SystemClock.elapsedRealtime() < drainUntil) {
            if (!onEar(track.getRoutedDevice())) {
                halt(track);
                return;
            }
            Thread.sleep(CHUNK_MS);
        }
        track.stop();
    }

    // Not a sound more: what's waiting to play is dropped.
    private static void halt(AudioTrack track) {
        track.pause();
        track.flush();
    }

    // Without blocking, so a track that stops taking sound can't hold the call link open past
    // the deadline.
    private static boolean write(AudioTrack track, short[] data, int off, int len, long deadline) throws InterruptedException {
        while (len > 0) {
            int n = track.write(data, off, len, AudioTrack.WRITE_NON_BLOCKING);
            if (n < 0) return false;
            off += n;
            len -= n;
            if (len > 0) {
                if (SystemClock.elapsedRealtime() > deadline) return false;
                Thread.sleep(5);
            }
        }
        return true;
    }

    private static short[] beeps() {
        int beep = RATE * BEEP_MS / 1000;
        int gap = RATE * GAP_MS / 1000;
        int fade = RATE * FADE_MS / 1000;
        short[] out = new short[BEEPS * (beep + gap)];
        for (int b = 0; b < BEEPS; b++) {
            int start = b * (beep + gap);
            for (int i = 0; i < beep; i++) {
                // Faded in and out, so it doesn't click.
                double edge = Math.min(1.0, Math.min(i, beep - 1 - i) / (double) fade);
                out[start + i] = (short) (Math.sin(2 * Math.PI * TONE_HZ * i / RATE) * edge * LEVEL * Short.MAX_VALUE);
            }
        }
        return out;
    }

    // Music in the earphones ducks for the moment, as for a navigation prompt. Returns what
    // giveFocus needs to give it back. Refused, the beeps still go.
    @SuppressWarnings("deprecation")
    private static Object takeFocus(AudioManager am, AudioAttributes attrs, int stream) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioFocusRequest request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .build();
            am.requestAudioFocus(request);
            return request;
        }
        AudioManager.OnAudioFocusChangeListener listener = change -> { };
        am.requestAudioFocus(listener, stream, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
        return listener;
    }

    @SuppressWarnings("deprecation")
    private static void giveFocus(AudioManager am, Object focus) {
        if (focus == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            am.abandonAudioFocusRequest((AudioFocusRequest) focus);
        } else {
            am.abandonAudioFocus((AudioManager.OnAudioFocusChangeListener) focus);
        }
    }
}
