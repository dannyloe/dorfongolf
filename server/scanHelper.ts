import { ai } from "./replit_integrations/image/client";
import { Type as GenAIType } from "@google/genai";
import { z } from "zod";
import type { ParsedSmsBet } from "@shared/schema";

// ─── Bet text parser ────────────────────────────────────────────────────────

/**
 * Compute a dedup signature for a parsed bet so we can detect duplicate reports
 * of the same bet (first-report-wins).
 * Format: "{betType}:{sortedPlayers.join('|')}:{amountCents}"
 */
export function computeBetSignature(bet: ParsedSmsBet): string {
  const sorted = [...bet.players].sort().join("|");
  return `${bet.betType}:${sorted}:${bet.amountCents}`;
}

/**
 * Use Gemini to parse a free-text SMS bet description into structured bets.
 * Returns null if the text doesn't look like a bet description.
 */
export async function parseSmsBetText(params: {
  rawText: string;
  playerNames: string[];
  matchName?: string;
}): Promise<ParsedSmsBet[] | null> {
  const { rawText, playerNames, matchName } = params;

  if (!ai) return null;

  const prompt = `You are parsing a golf betting description sent by SMS. Extract all bets described.

Known players in this match: ${playerNames.join(", ")}
${matchName ? `Match: ${matchName}` : ""}
Message: "${rawText}"

Rules:
- A bet involves two or more players.
- "betType" should be one of: nassau, match_play, skins, stroke_play, side, other
- "amountCents" is the dollar amount × 100 (e.g. "$20 nassau" → 2000). If unclear, use 0.
- "players" should be canonical names from the known players list (fuzzy-match if needed). If a player name is not in the list, include it as-is.
- "description" is a short human-readable summary of the bet (e.g. "Nassau $20 — DLoe vs Zimm").
- If the message does not describe any bets (e.g. it's just a score or a greeting), return an empty array.
- If the amount applies to each leg of a nassau (front/back/overall), report the per-leg amount.

Return JSON array. Each element: { betType, amountCents, players, description }`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: GenAIType.ARRAY,
        items: {
          type: GenAIType.OBJECT,
          properties: {
            betType: { type: GenAIType.STRING },
            amountCents: { type: GenAIType.INTEGER },
            players: { type: GenAIType.ARRAY, items: { type: GenAIType.STRING } },
            description: { type: GenAIType.STRING },
          },
          required: ["betType", "amountCents", "players", "description"],
        },
      },
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as ParsedSmsBet[];
  } catch {
    return null;
  }
}

/**
 * Detect if a message body looks like a score row (≥9 golf-range numbers
 * separated by spaces or slashes). Returns scores as array[18] or null.
 */
export function detectScoreText(body: string): number[] | null {
  const tokens = body.trim().split(/[\s/,]+/);
  const nums = tokens.map(t => parseInt(t, 10)).filter(n => Number.isFinite(n) && n >= 1 && n <= 15);
  if (nums.length >= 9) return nums;
  return null;
}

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
