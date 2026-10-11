/*
 * Setting up a Bus timings widget (TimingsWidget.java), as the Windows widget's setup does:
 * a stop, from your favourites or by its 5-digit code, and optionally just some of its buses.
 * Opened when the widget's added, and again from its stop's name to change it. A small window
 * over the home screen, like UpdateActivity's.
 *
 * The favourites come from the page (WidgetStore.favourites); a stop typed in is named from
 * the site's stop list, fetched once here.
 */
package org.uwuapps.sgbus;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;

public class WidgetConfigActivity extends Activity {
    private int mId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private EditText mCode;
    private EditText mBuses;
    private TextView mNote;
    private Button mSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bundle extras = getIntent().getExtras();
        if (extras != null) mId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        // Backing out of a new widget's setup leaves no widget.
        setResult(RESULT_CANCELED, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, mId));
        if (mId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        setContentView(build());
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView label(String text, int sp, boolean bold) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        return t;
    }

    private View build() {
        JSONObject config = WidgetStore.config(this, mId);
        int pad = dp(24);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad, pad, dp(16));
        box.setMinimumWidth(dp(300));

        box.addView(label(getString(R.string.widget_setup_title), 20, true));
        TextView intro = label(getString(R.string.widget_setup_intro), 14, false);
        intro.setPadding(0, dp(8), 0, dp(12));
        box.addView(intro);

        // The favourite stops, each a button that picks it.
        JSONArray favs = WidgetStore.favourites(this);
        if (favs.length() > 0) {
            box.addView(label(getString(R.string.widget_setup_favourites), 14, true));
            for (int i = 0; i < favs.length(); i++) {
                JSONObject f = favs.optJSONObject(i);
                if (f == null) continue;
                String code = f.optString("code");
                String name = f.optString("name");
                Button b = new Button(this, null, android.R.attr.borderlessButtonStyle);
                b.setAllCaps(false);
                b.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
                b.setText(name.isEmpty() ? code : name + "  ·  " + code);
                b.setOnClickListener(v -> {
                    mCode.setText(code);
                    mCode.setTag(name);
                    mNote.setText("");
                });
                box.addView(b, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
        } else {
            TextView none = label(getString(R.string.widget_setup_no_favourites), 13, false);
            none.setPadding(0, 0, 0, dp(8));
            box.addView(none);
        }

        mCode = new EditText(this);
        mCode.setHint(R.string.widget_setup_code);
        mCode.setInputType(InputType.TYPE_CLASS_NUMBER);
        mCode.setSingleLine(true);
        if (config != null) {
            mCode.setText(config.optString("code"));
            mCode.setTag(config.optString("name"));
        }
        box.addView(mCode);

        mBuses = new EditText(this);
        mBuses.setHint(R.string.widget_setup_buses);
        mBuses.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        mBuses.setSingleLine(true);
        mBuses.setImeOptions(EditorInfo.IME_ACTION_DONE);
        if (config != null) {
            JSONArray buses = config.optJSONArray("buses");
            StringBuilder b = new StringBuilder();
            for (int i = 0; buses != null && i < buses.length(); i++) b.append(i == 0 ? "" : ", ").append(buses.optString(i));
            mBuses.setText(b);
        }
        box.addView(mBuses);

        mNote = label("", 13, false);
        mNote.setPadding(0, dp(8), 0, 0);
        box.addView(mNote);

        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.END);
        buttons.setPadding(0, dp(12), 0, 0);
        Button cancel = new Button(this, null, android.R.attr.borderlessButtonStyle);
        cancel.setText(android.R.string.cancel);
        cancel.setOnClickListener(v -> finish());
        mSave = new Button(this, null, android.R.attr.borderlessButtonStyle);
        mSave.setText(R.string.widget_setup_save);
        mSave.setOnClickListener(v -> save());
        buttons.addView(cancel);
        buttons.addView(mSave);
        box.addView(buttons);

        ScrollView scroll = new ScrollView(this);
        scroll.addView(box);
        return scroll;
    }

    private void save() {
        String code = mCode.getText().toString().trim();
        if (!code.matches("\\d{5}")) {
            mNote.setText(R.string.widget_setup_bad_code);
            return;
        }
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String b : mBuses.getText().toString().toUpperCase().split("[\\s,]+")) if (!b.isEmpty()) set.add(b);
        for (String b : set) {
            if (!b.matches("[0-9A-Z]{1,4}")) {
                mNote.setText(R.string.widget_setup_bad_buses);
                return;
            }
        }
        List<String> buses = new ArrayList<>(set);
        Object tag = mCode.getTag();
        String known = tag instanceof String && code.equals(codeOfTag()) ? (String) tag : null;
        mSave.setEnabled(false);
        mNote.setText(R.string.widget_loading);
        new Thread(() -> {
            String name = known != null && !known.isEmpty() ? known : nameOf(code);
            WidgetStore.setConfig(this, mId, code, name, buses);
            WidgetStore.refresh(this, mId);
            runOnUiThread(() -> {
                AppWidgetManager manager = AppWidgetManager.getInstance(this);
                TimingsWidget.draw(this, manager, mId, false);
                WidgetRefreshWorker.schedule(this);
                setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, mId));
                finish();
            });
        }).start();
    }

    // The code the name in the box's tag belongs to: the one picked or kept, not one typed over it.
    private String codeOfTag() {
        JSONArray favs = WidgetStore.favourites(this);
        Object tag = mCode.getTag();
        for (int i = 0; i < favs.length(); i++) {
            JSONObject f = favs.optJSONObject(i);
            if (f != null && f.optString("name").equals(tag)) return f.optString("code");
        }
        JSONObject config = WidgetStore.config(this, mId);
        return config != null && config.optString("name").equals(tag) ? config.optString("code") : null;
    }

    // A stop's name from the site's stop list, or "" if it can't be had.
    private static String nameOf(String code) {
        try {
            JSONArray stops = new JSONArray(WidgetStore.get(MainActivity.SITE + "/api/bus-stops"));
            for (int i = 0; i < stops.length(); i++) {
                JSONObject s = stops.optJSONObject(i);
                if (s != null && code.equals(s.optString("c"))) return s.optString("n");
            }
        } catch (Exception ignored) {
            // Offline: the widget calls it by its code.
        }
        return "";
    }
}
