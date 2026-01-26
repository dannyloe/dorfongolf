// Twilio Integration for SMS messaging
// Uses Replit Connectors for credential management

import twilio from 'twilio';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  console.log(`[Twilio Debug] hostname: ${hostname}, hasToken: ${!!xReplitToken}`);

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio';
  console.log(`[Twilio Debug] Fetching credentials from: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });
  
  const data = await response.json();
  connectionSettings = data.items?.[0];
  
  console.log(`[Twilio Debug] Connection response:`, JSON.stringify({ hasSettings: !!connectionSettings, hasAccountSid: !!connectionSettings?.settings?.account_sid, hasPhoneNumber: !!connectionSettings?.settings?.phone_number }));

  if (!connectionSettings || (!connectionSettings.settings.account_sid || !connectionSettings.settings.api_key || !connectionSettings.settings.api_key_secret)) {
    throw new Error('Twilio not connected');
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number
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
