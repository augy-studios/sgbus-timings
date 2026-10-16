/*
 * Scan a stop's code (main-site/js/scan.js): the page shows the camera, as any web page can,
 * and hands a frame here every so often; Google's ML Kit reads the text in it, on the phone,
 * and the page looks for a stop's 5-digit code in what it says. ML Kit's model comes with
 * Google Play services (AndroidManifest.xml asks for it at install), so nothing's sent anywhere.
 *
 *   read({ image })   a JPEG, base64, without the data: prefix: { text }, or rejects "busy"
 *                     while the last is still being read
 */
package org.uwuapps.sgbus;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

@CapacitorPlugin(name = "Scan")
public class ScanPlugin extends Plugin {
    private TextRecognizer mRecognizer;
    private volatile boolean mBusy;

    @PluginMethod
    public void read(PluginCall call) {
        String image = call.getString("image");
        if (image == null) {
            call.reject("No image");
            return;
        }
        if (mBusy) {
            call.reject("Still reading the last one", "busy");
            return;
        }
        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(image, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            bitmap = null;
        }
        if (bitmap == null) {
            call.reject("Not an image");
            return;
        }
        if (mRecognizer == null) mRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        mBusy = true;
        mRecognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener(text -> {
                    JSObject out = new JSObject();
                    out.put("text", text.getText());
                    call.resolve(out);
                })
                .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "Couldn't read it" : e.getMessage(), "failed"))
                .addOnCompleteListener(t -> mBusy = false);
    }

    @Override
    protected void handleOnDestroy() {
        if (mRecognizer != null) mRecognizer.close();
        mRecognizer = null;
        super.handleOnDestroy();
    }
}
