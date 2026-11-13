/*
 * Walking or riding, by your average speed over a trip's last WINDOW_MS of fixes (TripService),
 * for the Get Off Alert (main-site/js/trip.js). With the screen off the page can't read the
 * accelerometer for your steps, so in the app this tells it walking from riding instead; with
 * the screen on, the two go together (js/trip.js, Motion.state).
 *
 * Walking is about 5 km/h, and WALK_KMH (10 km/h, a brisk walk or a jog) at most. A bus or a
 * train averages about 40 km/h, its stops and lights included, so RIDE_KMH, half that, is
 * riding for sure. In between (a bus in a jam, a run for the bus) it keeps what it last said.
 * A walker never touches WALK_PEAK_KMH, and a bus pulling away from the lights does, so a slow
 * average with a moment that fast isn't walking. Under STILL_KMH you're standing, or the bus
 * is at a stop: not walking either way.
 *
 * Each second's speed is the fix's own (from the GPS's Doppler, which a wobbling fix doesn't
 * throw off), or, without one, the way from the last fix over the time between. Rough fixes
 * are left out, and underground, with no fixes at all, it says nothing (null) after STALE_MS.
 */
package org.uwuapps.sgbus;

import android.location.Location;
import android.os.SystemClock;

import androidx.annotation.Nullable;

import java.util.ArrayDeque;

final class Pace {
    static final String WALKING = "walking";
    static final String RIDING = "riding";
    static final String STILL = "still";

    private static final long WINDOW_MS = 20_000;
    // Enough of the window seen to go by, and one second's speed kept of the many fixes in it.
    private static final long MIN_SPAN_MS = 10_000;
    private static final long SAMPLE_MS = 1000;
    private static final long STALE_MS = 10_000;
    private static final float GOOD_FIX_M = 50;

    private static final double STILL_KMH = 1.5;
    private static final double WALK_KMH = 10;
    private static final double WALK_PEAK_KMH = 15;
    private static final double RIDE_KMH = 20;

    // { when (elapsed realtime, ms), km/h }
    private final ArrayDeque<double[]> mSamples = new ArrayDeque<>();
    private Location mLast;
    private long mLastAt;
    private String mState;
    private double mKmh = -1;

    synchronized void add(Location fix) {
        if (!fix.hasAccuracy() || fix.getAccuracy() > GOOD_FIX_M) return;
        long at = fix.getElapsedRealtimeNanos() / 1_000_000;
        if (mLast != null && at - mLastAt < SAMPLE_MS) return;
        double kmh;
        if (fix.hasSpeed()) kmh = fix.getSpeed() * 3.6;
        else if (mLast != null && at > mLastAt) kmh = mLast.distanceTo(fix) / ((at - mLastAt) / 1000.0) * 3.6;
        else kmh = -1;
        mLast = fix;
        mLastAt = at;
        if (kmh < 0) return;

        mSamples.addLast(new double[]{at, kmh});
        while (!mSamples.isEmpty() && at - mSamples.peekFirst()[0] > WINDOW_MS) mSamples.removeFirst();
        if (at - mSamples.peekFirst()[0] < MIN_SPAN_MS) return;

        double sum = 0;
        double peak = 0;
        for (double[] s : mSamples) {
            sum += s[1];
            peak = Math.max(peak, s[1]);
        }
        mKmh = sum / mSamples.size();
        if (mKmh >= RIDE_KMH) mState = RIDING;
        else if (mKmh < STILL_KMH) mState = STILL;
        else if (mKmh <= WALK_KMH && peak <= WALK_PEAK_KMH) mState = WALKING;
    }

    private synchronized boolean fresh() {
        return mLast != null && SystemClock.elapsedRealtime() - mLastAt <= STALE_MS;
    }

    // "walking", "riding", "still", or null with nothing recent to go by.
    @Nullable
    synchronized String state() {
        return fresh() ? mState : null;
    }

    // The average speed, in km/h, or -1 with nothing recent to go by.
    synchronized double kmh() {
        return fresh() ? mKmh : -1;
    }
}
