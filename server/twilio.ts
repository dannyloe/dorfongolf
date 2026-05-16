// Twilio Integration for SMS messaging
// Uses environment secrets (TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_KEY_SECRET, TWILIO_PHONE_NUMBER)
// with fallback to Replit Connectors if secrets are not set.

import twilio from 'twilio';

async function getCredentials() {
  // Primary: environment secrets
  const envAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const envApiKey = process.env.TWILIO_API_KEY;
  const envApiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const envPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (envAccountSid && envApiKey && envApiKeySecret && envPhoneNumber) {
    console.log('[Twilio] Using credentials from environment secrets');
    if (!envAccountSid.startsWith('AC')) {
      throw new Error(
        `Twilio configuration error: TWILIO_ACCOUNT_SID starts with "${envAccountSid.slice(0, 4)}..." — it must start with "AC". ` +
        'Find your Account SID at console.twilio.com.'
      );
    }
    return {
      accountSid: envAccountSid,
      apiKey: envApiKey,
      apiKeySecret: envApiKeySecret,
      phoneNumber: envPhoneNumber,
    };
  }

  // Fallback: Replit Connector
  console.log('[Twilio] Environment secrets not set, trying Replit connector...');
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Twilio not connected: set TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_KEY_SECRET, and TWILIO_PHONE_NUMBER in Secrets.');
  }

  const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio';
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken }
  });
  const data = await response.json();
  const connectionSettings = data.items?.[0];

  if (!connectionSettings?.settings?.account_sid || !connectionSettings?.settings?.api_key || !connectionSettings?.settings?.api_key_secret) {
    throw new Error('Twilio not connected: set TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_KEY_SECRET, and TWILIO_PHONE_NUMBER in Secrets.');
  }

  const accountSidValue: string = connectionSettings.settings.account_sid;
  if (!accountSidValue.startsWith('AC')) {
    throw new Error(
      `Twilio configuration error: the connector "account_sid" starts with "${accountSidValue.slice(0, 6)}..." — it must start with "AC". ` +
      'Go to console.twilio.com and copy the Account SID (starts with AC).'
    );
  }

  return {
    accountSid: accountSidValue,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number,
  };
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}

// Send an SMS message
export async function sendSMS(to: string, message: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  console.error('[Twilio sendSMS] Starting SMS send to:', to);
  try {
    console.error('[Twilio sendSMS] Getting Twilio client...');
    const client = await getTwilioClient();
    console.error('[Twilio sendSMS] Got client, getting from number...');
    const fromNumber = await getTwilioFromPhoneNumber();
    console.error('[Twilio sendSMS] From number:', fromNumber);
    
    if (!fromNumber) {
      console.error('[Twilio sendSMS] ERROR: No from number configured');
      throw new Error('Twilio phone number not configured');
    }
    
    // Format phone number if needed (ensure it has country code)
    const formattedTo = formatPhoneNumber(to);
    
    console.error(`[Twilio sendSMS] Sending SMS from ${fromNumber} to ${formattedTo}`);
    console.error(`[Twilio sendSMS] Message: ${message.substring(0, 50)}...`);
    
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedTo
    });
    
    console.error(`[Twilio sendSMS] SUCCESS - SID: ${result.sid}, Status: ${result.status}`);
    return { success: true, sid: result.sid };
  } catch (error: any) {
    console.error('[Twilio sendSMS] ERROR:', error.message);
    console.error('[Twilio sendSMS] Error code:', error.code);
    console.error('[Twilio sendSMS] More info:', error.moreInfo);
    console.error('[Twilio sendSMS] Full error:', JSON.stringify(error, null, 2));
    return { success: false, error: error.message };
  }
}

// Generate a 6-digit verification code
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send verification code SMS
export async function sendVerificationCode(to: string, code: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `Your Golf Betting verification code is: ${code}. This code expires in 10 minutes.`;
  return sendSMS(to, message);
}

// Send match invitation notification
export async function sendMatchInvitation(to: string, matchName: string, inviterName: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `${inviterName} has added you to the match "${matchName}" on Golf Betting. Open the app to view details.`;
  return sendSMS(to, message);
}

// Send score update notification
export async function sendScoreUpdate(to: string, matchName: string, playerName: string, holeNumber: number): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `Score update in "${matchName}": ${playerName} finished hole ${holeNumber}.`;
  return sendSMS(to, message);
}

// Send bet result notification
export async function sendBetResult(to: string, matchName: string, result: string, amount: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const message = `Bet result in "${matchName}": ${result}. Amount: ${amount}`;
  return sendSMS(to, message);
}

// Format phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '');
  
  // If it's a 10-digit US number, add +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }
  
  // If it already has country code
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }
  
  // If it already starts with +, return as is
  if (phone.startsWith('+')) {
    return phone;
  }
  
  // Default: assume US number
  return `+1${cleaned}`;
}
