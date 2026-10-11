# Setting up Firebase for the Android app's notifications

The Android app shows the site in its own WebView, which has no Web Push. So when the
server sends a notification to the app (Service Alerts, and the Get Off Alert if the app has
been closed mid-trip), it goes through **Firebase Cloud Messaging (FCM)**, Google's push
service for Android.

SG Bus Timings goes into one shared **UwU Apps** Firebase project, which every UwU Apps app
can join as an app of its own. Only FCM is used: no Analytics, no Firebase database,
nothing else. It's free.

Until this is done, the app works fully but can't get notifications **from the server**:
Service alerts says "This copy of the app can't get notifications from the server yet". The
Get Off Alert during a trip still works, because the app sounds that itself.

It takes about 15 minutes. You'll end up with two files:

| File | What it is | Where it goes | Secret? |
|---|---|---|---|
| `google-services.json` | Tells the app which Firebase project it belongs to | `android/native/app/` | No, but kept out of git anyway |
| SG Bus Timings' service account key (`….json`) | Lets this site's server send pushes | Vercel, as `FIREBASE_SERVICE_ACCOUNT` | **Yes.** Anyone with it can push to phones with any app in the UwU Apps project |

## How the shared project fits together

```text
Firebase project "UwU Apps"
  Android app  org.uwuapps.sgbus        <- this app
  Android app  org.uwuapps.<another>    <- each other UwU App, added the same way
  Service account  sgbus-timings-push   <- this site's server's key: FCM only
  Service account  <another>-push       <- one per other app's server
```

- **One Android app entry per app**, each with its own package name. A push goes to one
  phone's token, and a token belongs to one app, so SG Bus Timings' server only ever
  reaches SG Bus Timings.
- **One service account per server**, allowed only to send through FCM. Each can be deleted
  without touching the others. Don't use the project's "Firebase Admin SDK" key for this: it
  can do anything in the project, for every app in it.

## 1. The UwU Apps project

If it already exists, open it at <https://console.firebase.google.com> and skip to step 2.
Otherwise:

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Create a project** (or **Add project**). Name it `UwU Apps`. Firebase makes a project
   ID from it, such as `uwu-apps-1a2b3`; any will do.
3. When it asks about **Google Analytics**, it's your choice for the other apps. SG Bus
   Timings doesn't use it.
4. **Create project**, wait, then **Continue**.

## 2. Add SG Bus Timings, and get `google-services.json`

1. In the UwU Apps project: the gear by **Project Overview** > **Project settings** >
   **Your apps** > **Add app** > **Android**. (In a new project, the **Android** icon on its
   home page does the same.)
2. **Android package name**: `org.uwuapps.sgbus`. It has to be exactly this.
3. **App nickname**: `SG Bus Timings`. Leave **Debug signing certificate SHA-1** empty: FCM
   doesn't need it.
4. **Register app**.
5. **Download google-services.json**. Save it as
   `android\native\app\google-services.json` in this project (beside `build.gradle`).
6. Click **Next** through the remaining steps without changing anything: the project already
   has what they describe (`native/build.gradle` and `native/app/build.gradle` apply the
   Google services plugin when the file is there).

The file lists every app in the project registered so far; the build takes the entry for
`org.uwuapps.sgbus` from it. Download it **after** SG Bus Timings is added, or that entry
isn't in it and the build stops with "No matching client found for package name". Adding
other apps later doesn't change this app's entry, so there's no need to download it again
for them.

## 3. Turn on FCM's API

In Firebase: **Project settings** > **Cloud Messaging**. Under **Firebase Cloud Messaging API
(V1)** it should say **Enabled**. If it says Disabled, use its menu (⋮) to open it in Google
Cloud and click **Enable**. This is once for the whole project.

## 4. Make SG Bus Timings' own key

The key comes from Google Cloud, which Firebase projects live in.

1. Open <https://console.cloud.google.com/iam-admin/serviceaccounts>. At the top, pick the
   **UwU Apps** project (the same project ID as in Firebase).
2. **Create service account**.
   - **Service account name**: `sgbus-timings-push`.
   - **Description**: `SG Bus Timings' server, sending notifications through FCM`.
   - **Create and continue**.
3. **Grant this service account access to project**: in **Select a role**, search for
   `Firebase Cloud Messaging API Admin` and pick it. Only this one. **Continue**, then
   **Done**.
4. In the list, click `sgbus-timings-push@…` > the **Keys** tab > **Add key** > **Create new
   key** > **JSON** > **Create**. A `.json` file downloads.

> [!WARNING]
> That key is a password. Don't commit it, email it, or paste it anywhere but Vercel. FCM
> doesn't fence a key to one app, so a leaked key can push to every app in UwU Apps. If it
> ever leaks, delete it on the same **Keys** tab and make a new one: the other apps' keys
> carry on working.

## 5. Give the key to the server (Vercel)

1. Open the key file in Notepad and copy **everything** in it, from `{` to `}`.
2. On <https://vercel.com>, open the **sgbus-timings** project > **Settings** >
   **Environment Variables**.
3. **Key**: `FIREBASE_SERVICE_ACCOUNT`. **Value**: paste the whole JSON. Tick
   **Production** (and **Preview** if you test there). Mark it **Sensitive**. **Save**.
4. Redeploy so the functions see it: **Deployments**, the newest one's **⋯** menu,
   **Redeploy**.
5. Delete the downloaded key file from your Downloads folder. Vercel has it now.

The server reads it in `main-site/api/_push/fcm.js`, and sends to the project the key
names (its `project_id`), so nothing else needs setting. It accepts the JSON as it is, or
base64-encoded if you'd rather paste it that way.

## 6. Build the app with Firebase in it

```powershell
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

The build picks up `google-services.json` by itself. Install the new APK on your phone.

## 7. Check it works

1. In the app, open **Service alerts** (the bell in the tray) and pick **All** for trains.
2. Android asks to allow notifications: **Allow**. The note under the buttons should say
   what you'll be notified of, not an error.
3. To test without waiting for a disruption, send every phone with SG Bus Timings a message
   from Firebase (while that's just you, it only reaches you):
   1. In the UwU Apps project, open **Messaging** (left menu, under **Run**; or search for
      it).
   2. **New campaign** > **Notifications**.
   3. Type a title and some text, then **Next**. (Skip **Send test message**: it needs the
      phone's own token, which the app doesn't show.)
   4. **Target**: **App**, `org.uwuapps.sgbus`. Pick only this one, so the other apps'
      users don't get it. **Next**.
   5. **Scheduling**: **Now**. **Review** > **Publish**.
   6. Lock your phone. It should arrive within a minute.

When a real alert goes out, Vercel's logs for `/api/push/poll` show `sent` going up.

## Adding another UwU App later

The same steps, in the same project: step 2 with that app's package name (and its own
`google-services.json`, downloaded into that app's project), and step 4 with a service
account of its own, such as `<app>-push`, for that app's server. Steps 1 and 3 are already
done.

## If something goes wrong

| What happens | What to do |
|---|---|
| The build stops with `No matching client found for package name 'org.uwuapps.sgbus'` | `google-services.json` was downloaded before SG Bus Timings was added. Download it again from **Project settings** > **Your apps** > **SG Bus Timings**. |
| Service alerts still says the app "can't get notifications from the server yet" | The APK was built without `google-services.json`. Check it's at `android\native\app\google-services.json`, build again and reinstall. |
| "Notifications are off for SG Bus Timings" | You said no to Android's prompt. Android **Settings** > **Apps** > **SG Bus Timings** > **Notifications**, turn them on, then pick again. |
| The test campaign never arrives | Check the package name in Firebase is exactly `org.uwuapps.sgbus`, and that the phone has Google Play services (most do; Huawei phones without them can't get FCM). |
| Vercel logs say `FIREBASE_SERVICE_ACCOUNT isn't the service account's JSON key` | The value isn't the whole file. Paste it again from `{` to `}`, and redeploy. |
| Vercel logs say `Google token responded 400: invalid_grant` | The key was deleted or the server's clock is off. Make a new key (step 4.4), replace the variable, redeploy. |
| Vercel logs say `FCM responded 403` | The service account is missing its role (step 4.3), or FCM's API is off for the project (step 3). |
| Vercel logs say `FCM responded 403` with `SENDER_ID_MISMATCH`, or `404` for every phone | The key is from a different project than `google-services.json`. Both have to come from UwU Apps. |
