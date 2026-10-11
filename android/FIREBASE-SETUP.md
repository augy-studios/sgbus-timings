# Setting up Firebase for the Android app's notifications

The Android app shows the site in its own WebView, which has no Web Push. So when the
server sends a notification to the app (Service Alerts, and the Get Off Alert if the app has
been closed mid-trip), it goes through **Firebase Cloud Messaging (FCM)**, Google's push
service for Android.

Only FCM is used: no Analytics, no Firebase database, nothing else. It's free.

Until this is done, the app works fully but can't get notifications **from the server**:
Service alerts says "This copy of the app can't get notifications from the server yet". The
Get Off Alert during a trip still works, because the app sounds that itself.

It takes about 15 minutes. You'll end up with two files:

| File | What it is | Where it goes | Secret? |
|---|---|---|---|
| `google-services.json` | Tells the app which Firebase project it belongs to | `android/native/app/` | No, but kept out of git anyway |
| The service account key (`….json`) | Lets the server send pushes | Vercel, as `FIREBASE_SERVICE_ACCOUNT` | **Yes.** Anyone with it can push to every phone with the app |

## 1. Make the Firebase project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Create a project** (or **Add project**). Name it `sgbus-timings`.
3. When it asks about **Google Analytics**, turn it **off**: the app doesn't use it.
4. **Create project**, wait, then **Continue**.

## 2. Add the Android app, and get `google-services.json`

1. On the project's home page, click the **Android** icon (under "Get started by adding
   Firebase to your app"). Or: the gear by **Project Overview** > **Project settings** >
   **Your apps** > **Add app** > **Android**.
2. **Android package name**: `org.uwuapps.sgbus`. It has to be exactly this.
3. **App nickname**: `SG Bus Timings`. Leave **Debug signing certificate SHA-1** empty: FCM
   doesn't need it.
4. **Register app**.
5. **Download google-services.json**. Save it as
   `android\native\app\google-services.json` in this project (beside `build.gradle`).
6. Click **Next** through the remaining steps without changing anything: the project already
   has what they describe (`native/build.gradle` and `native/app/build.gradle` apply the
   Google services plugin when the file is there).

## 3. Make the server's key

1. In Firebase: the gear by **Project Overview** > **Project settings** > **Service
   accounts**.
2. Under **Firebase Admin SDK**, click **Generate new private key**, then **Generate key**. A
   `.json` file downloads, named something like `sgbus-timings-firebase-adminsdk-….json`.
3. Check FCM's API is on: **Project settings** > **Cloud Messaging**. Under **Firebase Cloud
   Messaging API (V1)** it should say **Enabled**. If it says Disabled, use its menu (⋮) to
   open it in Google Cloud and click **Enable**.

> [!WARNING]
> That key is a password. Don't commit it, email it, or paste it anywhere but Vercel. If it
> ever leaks, go back to **Service accounts**, click **Manage service account permissions**,
> and delete that key in Google Cloud, then make a new one.

## 4. Give the key to the server (Vercel)

1. Open the key file in Notepad and copy **everything** in it, from `{` to `}`.
2. On <https://vercel.com>, open the **sgbus-timings** project > **Settings** >
   **Environment Variables**.
3. **Key**: `FIREBASE_SERVICE_ACCOUNT`. **Value**: paste the whole JSON. Tick
   **Production** (and **Preview** if you test there). Mark it **Sensitive**. **Save**.
4. Redeploy so the functions see it: **Deployments**, the newest one's **⋯** menu,
   **Redeploy**.
5. Delete the downloaded key file from your Downloads folder. Vercel has it now.

The server reads it in `main-site/api/_push/fcm.js`. It accepts the JSON as it is, or
base64-encoded if you'd rather paste it that way.

## 5. Build the app with Firebase in it

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

The build picks up `google-services.json` by itself. Install the new APK on your phone.

## 6. Check it works

1. In the app, open **Service alerts** (the bell in the tray) and pick **All** for trains.
2. Android asks to allow notifications: **Allow**. The note under the buttons should say
   what you'll be notified of, not an error.
3. To test without waiting for a disruption, send every phone with the app a message from
   Firebase (while that's just you, it only reaches you):
   1. In Firebase, open **Messaging** (left menu, under **Run**; or search for it).
   2. **New campaign** > **Notifications**.
   3. Type a title and some text, then **Next**. (Skip **Send test message**: it needs the
      phone's own token, which the app doesn't show.)
   4. **Target**: **App**, `org.uwuapps.sgbus`. **Next**.
   5. **Scheduling**: **Now**. **Review** > **Publish**.
   6. Lock your phone. It should arrive within a minute.

When a real alert goes out, Vercel's logs for `/api/push/poll` show `sent` going up.

## If something goes wrong

| What happens | What to do |
|---|---|
| Service alerts still says the app "can't get notifications from the server yet" | The APK was built without `google-services.json`. Check it's at `android\native\app\google-services.json`, build again and reinstall. |
| "Notifications are off for SG Bus Timings" | You said no to Android's prompt. Android **Settings** > **Apps** > **SG Bus Timings** > **Notifications**, turn them on, then pick again. |
| The test campaign never arrives | Check the package name in Firebase is exactly `org.uwuapps.sgbus`, and that the phone has Google Play services (most do; Huawei phones without them can't get FCM). |
| Vercel logs say `FIREBASE_SERVICE_ACCOUNT isn't the service account's JSON key` | The value isn't the whole file. Paste it again from `{` to `}`, and redeploy. |
| Vercel logs say `Google token responded 400: invalid_grant` | The key was deleted or the server's clock is off. Make a new key (step 3), replace the variable, redeploy. |
| Vercel logs say `FCM responded 403` | FCM's API is off for the project: see step 3.3. |
