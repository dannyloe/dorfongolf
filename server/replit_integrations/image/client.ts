import { GoogleGenAI, Modality } from "@google/genai";

// Supports both Replit AI Integrations (AI_INTEGRATIONS_GEMINI_API_KEY + AI_INTEGRATIONS_GEMINI_BASE_URL)
// and a standard Gemini API key (GEMINI_API_KEY) for Railway / other hosts.
function createAIClient() {
  const replitKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const replitBase = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (replitKey && replitBase) {
    return new GoogleGenAI({
      apiKey: replitKey,
      httpOptions: { apiVersion: "", baseUrl: replitBase },
    });
  }

  if (geminiKey) {
    return new GoogleGenAI({ apiKey: geminiKey });
  }

  console.warn("No Gemini API key found (GEMINI_API_KEY or AI_INTEGRATIONS_GEMINI_API_KEY). AI features will be unavailable.");
  return null;
}

export const ai = createAIClient();

/**
 * Generate an image and return as base64 data URL.
 * Uses gemini-2.5-flash-image model via Replit AI Integrations.
 */
export async function generateImage(prompt: string): Promise<string> {
  if (!ai) {
    throw new Error("AI features are currently unavailable");
  }
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    },
  });

  const candidate = response.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find(
    (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData
  );

  if (!imagePart?.inlineData?.data) {
    throw new Error("No image data in response");
  }

  const mimeType = imagePart.inlineData.mimeType || "image/png";
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}
