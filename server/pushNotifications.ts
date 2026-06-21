import admin from 'firebase-admin';
import { db } from './db';
import { devicePushTokens } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { storage } from './storage';

let initialized = false;

function getFirebaseApp(): admin.app.App | null {
  if (initialized) return admin.app();

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    return admin.app();
  } catch (err) {
    console.error('[pushNotifications] Failed to initialize Firebase Admin SDK:', err);
    return null;
  }
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  // Persist notification for the in-app feed regardless of FCM availability
  try {
    await storage.createNotification(userId, title, body, data?.route ?? null);
  } catch (err) {
    console.error('[pushNotifications] Failed to persist notification:', err);
  }

  const app = getFirebaseApp();
  if (!app) {
    return;
  }

  const tokens = await db
    .select({ token: devicePushTokens.token, id: devicePushTokens.id })
    .from(devicePushTokens)
    .where(eq(devicePushTokens.userId, userId));

  if (tokens.length === 0) return;

  const tokenStrings = tokens.map(t => t.token);

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokenStrings,
      notification: { title, body },
      data,
    });

    const invalidTokenIds: number[] = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        if (
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered'
        ) {
          invalidTokenIds.push(tokens[idx].id);
        }
      }
    });

    if (invalidTokenIds.length > 0) {
      await db.delete(devicePushTokens).where(inArray(devicePushTokens.id, invalidTokenIds));
    }
  } catch (err) {
    console.error('[pushNotifications] FCM sendEachForMulticast error:', err);
  }
}
