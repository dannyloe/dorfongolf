import { ai } from "./replit_integrations/image/client";
import { Type as GenAIType } from "@google/genai";
import { z } from "zod";

export interface NormalizedHole {
  holeNumber: number;
  strokes: number | null;
  confidence?: "high" | "medium" | "low";
}

export interface NormalizedPlayer {
  playerName: string;
  holes: NormalizedHole[];
}

export interface ScanScorecardResult {
  success: boolean;
  scores: NormalizedPlayer[];
  rawText?: string;
}

const PICKUP_MARKERS = new Set([
  "X", "X-OUT", "XOUT", "PICKUP", "PICK UP", "PICKED UP",
  "NF", "DNF", "NR", "WD",
]);

function isPickupMarker(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const t = v.trim().toUpperCase();
  if (!t) return false;
  if (PICKUP_MARKERS.has(t)) return true;
  if (/\b(PICK(ED)?\s*UP|DID\s*NOT\s*FINISH|NO\s*RETURN|WITHDR(AW|EW)|SCRATCH)\b/.test(t)) return true;
  return false;
}

const geminiHoleSchema = z
  .object({
    holeNumber: z.union([z.number(), z.string()]).optional(),
    strokes: z.union([z.number(), z.string(), z.null()]).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    status: z.string().optional(),
    annotation: z.string().optional(),
    result: z.string().optional(),
    note: z.string().optional(),
    mark: z.string().optional(),
    symbol: z.string().optional(),
  })
  .passthrough();

const geminiPlayerSchema = z
  .object({
    playerName: z.string().optional(),
    holes: z.array(geminiHoleSchema).optional(),
  })
  .passthrough();

const geminiResponseSchema = z
  .object({
    scores: z.array(geminiPlayerSchema).optional(),
    rawText: z.string().optional(),
  })
  .passthrough();

type GeminiHole = z.infer<typeof geminiHoleSchema>;
type GeminiPlayer = z.infer<typeof geminiPlayerSchema>;

function normalizeHole(h: GeminiHole): NormalizedHole {
  const holeNumber =
    typeof h.holeNumber === "number"
      ? h.holeNumber
      : parseInt(String(h.holeNumber ?? ""), 10);
  let strokes: number | null = null;
  let confidence: "high" | "medium" | "low" | undefined = h.confidence;

  const auxFields: Array<unknown> = [
    h.status, h.annotation, h.result, h.note, h.mark, h.symbol,
  ];
  const auxIsPickup = auxFields.some(isPickupMarker);

  const raw = h.strokes;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    strokes = Math.round(raw);
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "-" || trimmed.toLowerCase() === "null") {
      strokes = null;
    } else if (isPickupMarker(trimmed)) {
      strokes = 8;
      confidence = "low";
    } else {
      const n = parseInt(trimmed, 10);
      strokes = Number.isFinite(n) && n > 0 ? n : null;
    }
  }

  if (auxIsPickup) {
    strokes = 8;
    confidence = "low";
  }

  return { holeNumber, strokes, confidence };
}

export async function scanScorecardImage(params: {
  imageBase64: string;
  playerNames: string[];
  courseName?: string;
}): Promise<ScanScorecardResult> {
  const { imageBase64, playerNames, courseName } = params;

  const prompt = `You are reading a golf scorecard photo. Extract per-hole scores.

Known players in this match: ${playerNames.join(", ")}
${courseName ? `Course: ${courseName}` : ""}

Rules:
- Only include players whose scores are actually visible on the card.
- For each included player, include all 18 holes (holeNumber 1..18).
- "strokes" must be a STRING. Use the digits for a numeric score (e.g. "4", "10").
  - If a hole shows an "X", "X-out", "pickup", "NF", or "DNF" mark, return "X" (the player did not finish that hole).
  - If a specific hole score is blank or unreadable, return "" (empty string).
- Set "confidence" to "high", "medium", or "low" based on legibility of that hole.
- Try to match visible names to the known players list; otherwise use the name as written.
- Do NOT include Front 9, Back 9, or Total subtotals — only the 18 hole rows.
- "rawText" is optional free-form notes about the card.`;

  const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);base64,/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

  if (!base64Data) {
    throw new Error("Invalid image data");
  }

  if (!ai) {
    throw new Error("AI features are currently unavailable");
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: GenAIType.OBJECT,
        properties: {
          scores: {
            type: GenAIType.ARRAY,
            items: {
              type: GenAIType.OBJECT,
              properties: {
                playerName: { type: GenAIType.STRING },
                holes: {
                  type: GenAIType.ARRAY,
                  items: {
                    type: GenAIType.OBJECT,
                    properties: {
                      holeNumber: { type: GenAIType.INTEGER },
                      strokes: { type: GenAIType.STRING },
                      confidence: {
                        type: GenAIType.STRING,
                        enum: ["high", "medium", "low"],
                      },
                    },
                    required: ["holeNumber", "strokes"],
                  },
                },
              },
              required: ["playerName", "holes"],
            },
          },
          rawText: { type: GenAIType.STRING },
        },
        required: ["scores"],
      },
    },
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  let parsed: z.infer<typeof geminiResponseSchema>;
  try {
    parsed = geminiResponseSchema.parse(JSON.parse(text));
  } catch {
    throw new Error("Could not parse scorecard. Please try with a clearer image.");
  }

  const scores = (parsed.scores ?? []).map((p: GeminiPlayer) => ({
    playerName: String(p.playerName ?? ""),
    holes: (p.holes ?? [])
      .map(normalizeHole)
      .filter(
        (h: NormalizedHole) =>
          Number.isFinite(h.holeNumber) && h.holeNumber >= 1 && h.holeNumber <= 18
      ),
  }));

  return {
    success: true,
    scores,
    rawText: parsed.rawText ?? "",
  };
}
