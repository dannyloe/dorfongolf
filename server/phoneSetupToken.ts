import { createHmac } from "crypto";

const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET environment variable is not set");
  return secret;
}

export function generatePhoneSetupToken(userId: string): string {
  const expiresAt = Date.now() + EXPIRY_MS;
  const payload = `${userId}:${expiresAt}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export function verifyPhoneSetupToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const colonIdx = decoded.lastIndexOf(":");
    if (colonIdx === -1) return null;
    const sig = decoded.slice(colonIdx + 1);
    const rest = decoded.slice(0, colonIdx);
    const secondColonIdx = rest.lastIndexOf(":");
    if (secondColonIdx === -1) return null;
    const userId = rest.slice(0, secondColonIdx);
    const expiresAtStr = rest.slice(secondColonIdx + 1);
    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return null;
    const payload = `${userId}:${expiresAt}`;
    const expectedSig = createHmac("sha256", getSecret()).update(payload).digest("hex");
    if (sig !== expectedSig) return null;
    return userId;
  } catch {
    return null;
  }
}
