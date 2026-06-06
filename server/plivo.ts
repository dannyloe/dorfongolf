import plivo from 'plivo';

function getCredentials() {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const phoneNumber = process.env.PLIVO_PHONE_NUMBER;

  if (!authId || !authToken || !phoneNumber) {
    throw new Error('Plivo not configured: set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, and PLIVO_PHONE_NUMBER in Secrets.');
  }

  return { authId, authToken, phoneNumber };
}

export function getPlivoClient() {
  const { authId, authToken } = getCredentials();
  return new plivo.Client(authId, authToken);
}

export function getPlivoFromPhoneNumber(): string {
  const { phoneNumber } = getCredentials();
  return phoneNumber;
}

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  if (phone.startsWith('+')) return phone;
  return `+1${cleaned}`;
}

export async function sendSMS(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  console.error('[Plivo sendSMS] Starting SMS send to:', to);
  try {
    const client = getPlivoClient();
    const fromNumber = getPlivoFromPhoneNumber();

    if (!fromNumber) {
      throw new Error('Plivo phone number not configured');
    }

    const formattedTo = formatPhoneNumber(to);
    console.error(`[Plivo sendSMS] Sending SMS from ${fromNumber} to ${formattedTo}`);
    console.error(`[Plivo sendSMS] Message: ${message.substring(0, 50)}...`);

    const result = await client.messages.create(fromNumber, formattedTo, message);
    const messageUuid = (result as any).messageUuid || (result as any).message_uuid || JSON.stringify(result);
    console.error(`[Plivo sendSMS] SUCCESS - UUID: ${messageUuid}`);
    return { success: true, sid: String(messageUuid) };
  } catch (error: any) {
    console.error('[Plivo sendSMS] ERROR:', error.message);
    return { success: false, error: error.message };
  }
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationCode(to: string, code: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `Your Golf Betting verification code is: ${code}. This code expires in 10 minutes.`;
  return sendSMS(to, message);
}

export async function sendMatchInvitation(to: string, matchName: string, inviterName: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `${inviterName} has added you to the match "${matchName}" on Golf Betting. Open the app to view details.`;
  return sendSMS(to, message);
}

export async function sendScoreUpdate(to: string, matchName: string, playerName: string, holeNumber: number): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `Score update in "${matchName}": ${playerName} finished hole ${holeNumber}.`;
  return sendSMS(to, message);
}

export async function sendBetResult(to: string, matchName: string, result: string, amount: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `Bet result in "${matchName}": ${result}. Amount: ${amount}`;
  return sendSMS(to, message);
}
