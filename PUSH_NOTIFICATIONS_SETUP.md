# Push Notifications Setup Guide

This guide explains how to configure Firebase Cloud Messaging (FCM) and Apple Push Notification Service (APNs) for the Golf Betting iOS app.

## Prerequisites

- A Mac with Xcode installed
- An Apple Developer account (for APNs)
- A Firebase account (free tier is sufficient)

---

## Step 1: Create a Firebase Project and Enable FCM

1. Go to [Firebase Console](https://console.firebase.google.com/) and click **Add project**.
2. Name your project (e.g. `Golf Betting`) and follow the setup wizard.
3. In your project, click the **iOS** icon to add an iOS app.
4. Enter the bundle ID: `com.golfbetting.app` (must match `capacitor.config.ts`).
5. Download the `GoogleService-Info.plist` file — you will add this to Xcode later.
6. FCM is enabled by default for all Firebase projects.

## Step 2: Download the Service Account Key

The server uses the Firebase Admin SDK to send push notifications. It needs a service account key.

1. In the Firebase Console, go to **Project Settings → Service Accounts**.
2. Click **Generate new private key** and confirm.
3. A JSON file will be downloaded — keep it secret and do not commit it to version control.
4. Open the Replit **Secrets** (Environment Variables) panel.
5. Create a secret named `FIREBASE_SERVICE_ACCOUNT_JSON` and paste the entire contents of the JSON file as the value.

## Step 3: Build the Web App and Initialize the iOS Project

Run these commands from the project root (on any machine):

```bash
npm run build
npx cap add ios       # Only needed the first time
npx cap sync          # Syncs web assets and plugins into the Xcode project
```

This creates an `ios/` directory containing the Xcode project.

## Step 4: Open in Xcode and Enable Push Notifications

1. Run `npx cap open ios` to open the project in Xcode.
2. Select the `App` target in the project navigator.
3. Go to the **Signing & Capabilities** tab.
4. Click **+ Capability** and add **Push Notifications**.
5. Also add **Background Modes** and enable **Remote notifications**.

## Step 5: Add the GoogleService-Info.plist to Xcode

1. Drag the `GoogleService-Info.plist` file you downloaded in Step 1 into the `App` group in Xcode.
2. Make sure **Copy items if needed** is checked and the file is added to the `App` target.

## Step 6: Configure APNs in Firebase

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

## Step 7: Build and Test

1. Build the app in Xcode and run it on a real device (push notifications do not work in the simulator).
2. When the app first opens, it will prompt the user to allow notifications.
3. Accept the permission — the app will register the device token with the backend.
4. Trigger a match invite or score update to verify that a push notification arrives on the device.

---

## Environment Variables Summary

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full contents of the Firebase service account JSON key file |

---

## Troubleshooting

- **No notifications received**: Check that the APNs key/certificate is correctly configured in Firebase Console.
- **Token not registered**: Make sure the user accepted notification permission when prompted.
- **Firebase not initialized**: Verify the `FIREBASE_SERVICE_ACCOUNT_JSON` secret is set and contains valid JSON.
- **Simulator**: Push notifications only work on a physical iOS device.
