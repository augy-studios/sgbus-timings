# Not Bubblewrap's. AppBridge.java reads TwaLauncher's session by its field's name, so R8 must
# keep that name in the release build.
-keepclassmembers class com.google.androidbrowserhelper.trusted.TwaLauncher {
    private androidx.browser.customtabs.CustomTabsSession mSession;
}
