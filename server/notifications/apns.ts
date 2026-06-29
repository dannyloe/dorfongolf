import apn from "apn";

const provider = new apn.Provider({
  token: {
    key: (process.env.APNS_KEY_P8 ?? "").replace(/\\n/g, "\n"),
    keyId: process.env.APNS_KEY_ID ?? "",
    teamId: process.env.APNS_TEAM_ID ?? "",
  },
  production: process.env.NODE_ENV === "production",
});

const bundleId = process.env.APNS_BUNDLE_ID ?? "com.yourcompany.Press";

export async function sendPush(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<void> {
  const note = new apn.Notification();
  note.alert = { title, body };
  note.sound = "default";
  note.topic = bundleId;
  note.payload = data;
  try {
    const result = await provider.send(note, deviceToken);
    if (result.failed.length > 0) {
      console.warn("[APNs] Failed:", result.failed[0].response);
    }
  } catch (err) {
    console.error("[APNs] Error:", err);
  }
}

export async function sendPushToUsers(
  userIds: number[],
  title: string,
  body: string,
  data: Record<string, string>,
  db: any,
  deviceTokensTable: any
) {
  if (userIds.length === 0) return;
  const { inArray } = await import("drizzle-orm");
  const tokens = await db
    .select({ token: deviceTokensTable.token })
    .from(deviceTokensTable)
    .where(inArray(deviceTokensTable.userId, userIds));
  await Promise.all(tokens.map((t: { token: string }) => sendPush(t.token, title, body, data)));
}
