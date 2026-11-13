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

import org.uwuapps.sgbus.bridge.JSObject;
import org.uwuapps.sgbus.bridge.Plugin;
import org.uwuapps.sgbus.bridge.PluginCall;
import org.uwuapps.sgbus.bridge.PluginMethod;
import org.uwuapps.sgbus.bridge.AppPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

@AppPlugin(name = "Scan")
public class ScanPlugin extends Plugin {
    private TextRecognizer mRecognizer;
    private volatile boolean mBusy;

    // A camera still says which way up it is in its EXIF (the Flutter app's frames); a frame drawn
    // from the page's video (the WebView app's) has none, and is the right way up already.
    private static int rotationOf(String base64) {
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            android.media.ExifInterface exif = new android.media.ExifInterface(new java.io.ByteArrayInputStream(bytes));
            switch (exif.getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, android.media.ExifInterface.ORIENTATION_NORMAL)) {
                case android.media.ExifInterface.ORIENTATION_ROTATE_90: return 90;
                case android.media.ExifInterface.ORIENTATION_ROTATE_180: return 180;
                case android.media.ExifInterface.ORIENTATION_ROTATE_270: return 270;
                default: return 0;
            }
        } catch (Exception e) {
            return 0;
        }
    }

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
        mRecognizer.process(InputImage.fromBitmap(bitmap, rotationOf(image)))
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
