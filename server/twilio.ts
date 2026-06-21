import twilio from 'twilio';

// Required secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER
// TWILIO_WHATSAPP_NUMBER should be in E.164 format, e.g. +14155238886
// In the Twilio console, enable WhatsApp on that number (or use the Sandbox).
// Set VITE_TWILIO_WHATSAPP_NUMBER to the same value so the frontend can display it.

export function isWhatsappConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_WHATSAPP_NUMBER
  );
}

function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!accountSid || !authToken) {
    throw new Error('Twilio not configured: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Secrets.');
  }
  return { accountSid, authToken, whatsappNumber: whatsappNumber || null };
}

export function getTwilioClient() {
  const { accountSid, authToken } = getCredentials();
  return twilio(accountSid, authToken);
}

export function getTwilioWhatsappNumber(): string {
  const wn = process.env.TWILIO_WHATSAPP_NUMBER;
  if (!wn) throw new Error('TWILIO_WHATSAPP_NUMBER not configured in Secrets.');
  return wn;
}

export function formatWhatsappNumber(phone: string): string {
  const stripped = phone.replace(/^whatsapp:/i, '');
  const cleaned = stripped.replace(/\D/g, '');
  let e164: string;
  if (cleaned.length === 10) e164 = `+1${cleaned}`;
  else if (cleaned.length === 11 && cleaned.startsWith('1')) e164 = `+${cleaned}`;
  else if (stripped.startsWith('+')) e164 = stripped;
  else e164 = `+1${cleaned}`;
  return `whatsapp:${e164}`;
}

export function stripWhatsappPrefix(phone: string): string {
  return phone.replace(/^whatsapp:/i, '');
}

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  mediaUrl?: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const client = getTwilioClient();
    const fromNumber = getTwilioWhatsappNumber();
    const from = formatWhatsappNumber(fromNumber);
    const toFormatted = formatWhatsappNumber(to);

    const params: Parameters<typeof client.messages.create>[0] = {
      from,
      to: toFormatted,
      body,
    };
    if (mediaUrl) params.mediaUrl = [mediaUrl];

    const msg = await client.messages.create(params);
    console.error(`[Twilio WhatsApp] Sent to ${toFormatted} — SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (error: any) {
    console.error('[Twilio WhatsApp] ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

export async function sendMatchInvitationWhatsApp(
  to: string,
  matchName: string,
  inviterName: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const body = `${inviterName} has added you to the match "${matchName}" on Golf Betting. Open the app to view details.`;
  return sendWhatsAppMessage(to, body);
}

export async function sendBetResultWhatsApp(
  to: string,
  matchName: string,
  result: string,
  amount: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const body = `Bet result in "${matchName}": ${result}. Amount: ${amount}`;
  return sendWhatsAppMessage(to, body);
}

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}
