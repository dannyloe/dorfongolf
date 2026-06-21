# Push Notifications Setup Guide

This guide explains how to configure Firebase Cloud Messaging (FCM) and Apple Push Notification Service (APNs) for the Golf Betting iOS and Android apps.

## Prerequisites

- A Firebase account (free tier is sufficient)
- **iOS only**: A Mac with Xcode installed and an Apple Developer account
- **Android only**: Android Studio installed

---

## Step 1: Create a Firebase Project and Enable FCM

1. Go to [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Name your project (e.g. `Golf Betting`) and follow the setup wizard.
3. FCM is enabled by default for all Firebase projects.

---

## Step 2: Download the Service Account Key

The server uses the Firebase Admin SDK to send push notifications. It needs a service account key.

1. In the Firebase Console, go to **Project Settings → Service Accounts**.
2. Click **Generate new private key** and confirm.
3. A JSON file will be downloaded — keep it secret and do not commit it to version control.
4. Open the Replit **Secrets** (Environment Variables) panel.
5. Create a secret named `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the entire contents of the JSON file as the value.

---

## iOS Setup

### Step 3 (iOS): Add an iOS App to Firebase

1. In the Firebase Console, click the **iOS** icon to add an iOS app.
2. Enter the bundle ID: `com.golfbetting.app` (must match `capacitor.config.ts`).
3. Download the `GoogleService-Info.plist` file — you will add this to Xcode later.

### Step 4 (iOS): Build the Web App and Initialize the iOS Project

Run these commands from the project root:

```bash
npm run build
npx cap add ios       # Only needed the first time
npx cap sync          # Syncs web assets and plugins into the Xcode project
```

This creates an `ios/` directory containing the Xcode project.

### Step 5 (iOS): Open in Xcode and Enable Push Notifications

1. Run `npx cap open ios` to open the project in Xcode.
2. Select the `App` target in the project navigator.
3. Go to the **Signing & Capabilities** tab.
4. Click **+ Capability** and add **Push Notifications**.
5. Also add **Background Modes** and enable **Remote notifications**.

### Step 6 (iOS): Add the GoogleService-Info.plist to Xcode

1. Drag the `GoogleService-Info.plist` file you downloaded in Step 3 into the `App` group in Xcode.
2. Make sure **Copy items if needed** is checked and the file is added to the `App` target.

### Step 7 (iOS): Configure APNs in Firebase

Firebase uses APNs to deliver notifications to iOS devices. You need to link them.

**Option A — APNs Auth Key (recommended):**

1. In the [Apple Developer Portal](https://developer.apple.com/account/), go to **Certificates, Identifiers & Profiles → Keys**.
2. Create a new key, enable **Apple Push Notifications service (APNs)**, and download the `.p8` file.
3. Note the **Key ID** and your **Team ID** (shown at the top right of the portal).
4. In the Firebase Console, go to **Project Settings → Cloud Messaging → Apple app configuration**.
5. Upload the `.p8` file and enter the Key ID and Team ID.

**Option B — APNs Certificate:**

1. In Xcode, go to **Preferences → Accounts** and select your Apple ID.
2. Manage certificates and create an **Apple Push Services** certificate for your App ID.
3. Export it as a `.p12` file and upload it to Firebase Console under **Cloud Messaging → Apple app configuration**.

### Step 8 (iOS): Build and Test

1. Build the app in Xcode and run it on a real device (push notifications do not work in the simulator).
2. When the app first opens, it will prompt the user to allow notifications.
3. Accept the permission — the app will register the device token with the backend.
4. Trigger a match invite or score update to verify that a push notification arrives on the device.

---

## Android Setup

### Step 3 (Android): Add an Android App to Firebase

1. In the Firebase Console, click the **Android** icon to add an Android app.
2. Enter the package name: `com.golfbetting.app` (must match `capacitor.config.ts`).
3. (Optional) Enter a nickname like `Golf Betting Android`.
4. Click **Register app**.
5. Download the `google-services.json` file — you will place this in the Android project.

### Step 4 (Android): Build the Web App and Initialize the Android Project

Run these commands from the project root:

```bash
npm run build
npx cap add android   # Only needed the first time
npx cap sync          # Syncs web assets and plugins into the Android project
```

This creates an `android/` directory containing the Android Studio project.

### Step 5 (Android): Place the google-services.json File

Copy the `google-services.json` file you downloaded in Step 3 into the Android app module directory:

```
android/app/google-services.json
```

This file must be placed here before building. Do **not** commit it to version control — `android/app/google-services.json` is already listed in `.gitignore` to prevent accidental commits.

### Step 6 (Android): Open in Android Studio

1. Run `npx cap open android` to open the project in Android Studio.
2. Android Studio will sync the Gradle files automatically. Wait for the sync to complete.
3. The `google-services.json` file is picked up automatically by the Google Services Gradle plugin, which is already included in Capacitor's Android template.

### Step 7 (Android): Build and Test

1. Connect a physical Android device via USB (or use an AVD emulator — FCM works in the emulator with Google Play Services).
2. Run the app from Android Studio.
3. The app will automatically request notification permission (Android 13+) on first launch.
4. Accept the permission — the app will register the FCM device token with the backend.
5. Trigger a match invite or score update to verify that a push notification arrives on the device.

> **Note**: On Android 12 and below, notification permission is granted automatically — no prompt is shown.

---

## How It Works (Both Platforms)

The `use-push-notifications` hook in `client/src/hooks/use-push-notifications.ts` handles both iOS and Android using the same Capacitor API:

- `Capacitor.isNativePlatform()` — returns `true` on both iOS and Android native builds, `false` in the browser.
- `PushNotifications.requestPermissions()` — prompts the user on iOS and Android 13+; auto-grants on older Android.
- `PushNotifications.register()` — registers with APNs (iOS) or FCM (Android) and fires the `registration` event.
- On the `registration` event, the token is sent to `/api/notifications/device-token` along with the platform (`'ios'` or `'android'`). The server uses this to route notifications via Firebase Admin SDK.

No code changes are needed in the hook to support Android — the Capacitor push notification plugin abstracts the platform difference.

---

## Environment Variables Summary

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full contents of the Firebase service account JSON key file |

---

## Troubleshooting

### iOS
- **No notifications received**: Check that the APNs key/certificate is correctly configured in Firebase Console.
- **Simulator**: Push notifications only work on a physical iOS device.

### Android
- **No notifications on Android 13+**: Make sure the user accepted the notification permission prompt.
- **google-services.json missing**: Ensure the file is at `android/app/google-services.json` and re-run `npx cap sync`.
- **Gradle sync errors**: Open Android Studio and let it download missing SDK components or run `./gradlew clean` from the `android/` directory.
- **FCM token not received**: Confirm Google Play Services is available on the device/emulator.

### Both Platforms
- **Token not registered**: Make sure the user accepted notification permission when prompted.
- **Firebase not initialized**: Verify the `FIREBASE_SERVICE_ACCOUNT_JSON` secret is set and contains valid JSON.
