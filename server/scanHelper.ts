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
  const sorted = [...bet.players].map(p => p.toLowerCase().trim()).sort().join("|");
  return `${bet.betType.toLowerCase()}:${sorted}:${bet.amountCents}`;
}

/**
 * Use Gemini to parse a free-text SMS bet description into structured bets.
 * Returns null if the text doesn't look like a bet description.
 */
export async function parseSmsBetText(params: {
  rawText: string;
  playerNames: string[];
  matchName?: string;
  senderName?: string;
}): Promise<ParsedSmsBet[] | null> {
  const { rawText, playerNames, matchName, senderName } = params;

  if (!ai) return null;

  const prompt = `You are parsing a golf betting description sent by SMS. Extract all bets described.

Known players in this match: ${playerNames.join(", ")}
${matchName ? `Match: ${matchName}` : ""}
${senderName ? `Message sender (include them as a participant if not explicitly excluded): ${senderName}` : ""}
Message: "${rawText}"

Rules:
- A bet involves two or more players.
- "betType" should be one of: nassau, match_play, skins, stroke_play, side, other
- "amountCents" is the dollar amount × 100 (e.g. "$20 nassau" → 2000). If unclear, use 0.
- "players" should be canonical names from the known players list (fuzzy-match if needed). If a player name is not in the list, include it as-is.
- Always include the sender as a participant unless the message makes it clear they are not involved.
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
 * Detect if a message body is a pure score row: exactly 9 or 18 golf-range
 * integers (1–9) with no extra non-numeric tokens mixed in.
 * "Pure" means the token list contains only single-digit integers — if the
 * body has non-numeric words or double-digit numbers mixed in it's likely a
 * bet description, not scores.
 */
export function detectScoreText(body: string): number[] | null {
  const tokens = body.trim().split(/[\s/,]+/).filter(Boolean);
  const nums: number[] = [];
  for (const t of tokens) {
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || String(n) !== t) return null; // non-numeric token → not a score row
    if (n < 1 || n > 9) return null; // single-digit golf score range only
    nums.push(n);
  }
  if (nums.length === 9 || nums.length === 18) return nums;
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
  extraRules?: string[];
}): Promise<ScanScorecardResult> {
  const { imageBase64, playerNames, courseName, extraRules } = params;

  const extraRulesText =
    extraRules && extraRules.length > 0
      ? `\n\nAdditional rules based on past scan corrections:\n${extraRules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
      : "";

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
- "rawText" is optional free-form notes about the card.

CRITICAL — hole number anchoring:
- The scorecard has a header row that prints the hole numbers (1–9 on the front row, 10–18 on the back row).
- For every score you read, first identify the hole number printed in the HEADER ROW directly above that score cell.
- Assign each score to that header hole number — NEVER by counting column positions from left to right.

CRITICAL — subtotal columns must be completely ignored:
- Golf scorecards contain summary columns labelled "Out", "In", "Back", "Tot", "Total", "Front", or "Hdcp"/"HCP"/"Net". These labels may appear in the hole-number header row or in a separate label row.
- NONE of these columns have a hole number (1–18) above them. If there is no hole number (1–18) in the header directly above a cell, that cell is a subtotal — skip it entirely.
- Do NOT treat the value in an "Out" / "In" / "Back" / "Tot" column as the score for hole 10, hole 11, or any hole. It is a running total and must be discarded.
- Even if a subtotal value looks like a plausible single-hole score (e.g. "37" or "4"), it must still be skipped.

CRITICAL — count sanity check:
- After reading all scores, verify you have exactly 9 scores for holes 1–9 and exactly 9 scores for holes 10–18 (scores that are "" or "X" still count toward the 9).
- If either half has more than 9 entries, you accidentally included a subtotal column. Remove the extra entry before returning results.

CRITICAL — large values in score rows:
- Any value of 30 or higher appearing anywhere in a player's score row is almost certainly a subtotal (e.g. front-9 total = 37), not a hole score. Treat such values with low confidence and skip them unless a hole number (1–18) is unambiguously printed directly above that cell in the header row.${extraRulesText}`;

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

// ─── Bet slip photo parser ───────────────────────────────────────────────────

export interface ScannedBetResult {
  success: boolean;
  matchType?: string;
  isRoundRobin?: boolean;
  roundRobinSubtype?: string;
  teamAPlayerIds?: number[];
  teamBPlayerIds?: number[];
  keyedPlayerIds?: number[];
  skinsPlayerIds?: number[];
  unitAmount?: number | null;
  deathMatchBaseBet?: number | null;
  twoBallBet?: number | null;
  threeBallBet?: number | null;
  useNet?: boolean;
  parsedSummary?: string;
  unmatchedNames?: string[];
}

/**
 * Use Gemini Vision AI to parse a photo of a handwritten bet slip and extract
 * the bet configuration (match type, teams, amounts, handicap settings).
 * Returns a structure compatible with the voice-match parser output.
 */
export async function scanBetSlip(params: {
  imageBase64: string;
  players: Array<{ id: number; name: string }>;
}): Promise<ScannedBetResult> {
  const { imageBase64, players } = params;

  if (!ai) {
    throw new Error("AI features are currently unavailable");
  }

  const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);base64,/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

  if (!base64Data) {
    throw new Error("Invalid image data");
  }

  const playerList = players.map(p => `  - ID ${p.id}: "${p.name}"`).join("\n");

  const prompt = `You are reading a handwritten golf betting slip photo. Extract the bet configuration.

Available players (use exact IDs — fuzzy-match on nicknames, first names, last names, initials):
${playerList}

Match types recognized:
- "nassau" / "nass" → matchType: "nassau"
- "match play" / "1 ball" → matchType: "match_play_1_ball"
- "2 ball match play" → matchType: "match_play_2_ball"
- "stroke play" → matchType: "stroke_play"
- "skins" / "skin" → matchType: "skins"
- "5-5-5-3" → matchType: "five_five_five_three"
- "death match" → matchType: "death_match"
- "2 ball 3 ball" / "2/3 ball" → matchType: "two_three_ball"
- "round robin" → isRoundRobin: true

Player assignment rules:
- teamAPlayerIds = players on the first team / left side / Team A
- teamBPlayerIds = players on the second team / right side / Team B
- For skins: put all players in skinsPlayerIds, leave teamA/B empty
- If a player is listed as "vs everyone" or similar, put them in keyedPlayerIds

Amount rules:
- "$20" or "20" → unitAmount: 20
- For nassau, the dollar amount is usually the per-leg amount (front/back/overall)
- For death match: look for a "base" or "BB" amount → deathMatchBaseBet
- For 2 ball / 3 ball: if two amounts are listed → twoBallBet and threeBallBet

Net/gross:
- "net", "hdcp", "handicap", "strokes" → useNet: true
- "gross", no mention → useNet: false

Return ONLY valid JSON with NO markdown, no code blocks, no explanation:
{
  "matchType": "nassau",
  "isRoundRobin": false,
  "roundRobinSubtype": null,
  "teamAPlayerIds": [],
  "teamBPlayerIds": [],
  "keyedPlayerIds": [],
  "skinsPlayerIds": [],
  "unitAmount": null,
  "deathMatchBaseBet": null,
  "twoBallBet": null,
  "threeBallBet": null,
  "useNet": false,
  "parsedSummary": "Brief human-readable description of what was extracted",
  "unmatchedNames": []
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
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
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not read the bet slip. Please try a clearer photo.");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return { success: true, ...parsed };
}

// ─── Duplicate-bet detection helper ─────────────────────────────────────────

const MATCH_TYPE_TO_BET_TYPE: Record<string, string> = {
  nassau: "nassau",
  match_play_1_ball: "match_play",
  match_play_2_ball: "match_play",
  skins: "skins",
  stroke_play: "stroke_play",
  death_match: "other",
  five_five_five_three: "other",
  two_three_ball: "other",
};

/**
 * Given incoming parsed bets, check whether any of them duplicate:
 *  (a) a non-dismissed pending SMS bet (same betType + players + amount), or
 *  (b) an existing applied eventMatch (signature computed from teams + matchType + unitAmount).
 *
 * Returns `{ isDuplicate: true, duplicateOf: "<description>" }` on first match,
 * or `{ isDuplicate: false }` if no duplicates are found.
 */
export function checkBetDuplicate(
  parsedBets: ParsedSmsBet[],
  existingSmsBets: Array<{ status: string; parsedBets: unknown }>,
  existingEmsWithTeams: Array<{
    matchType: string;
    unitAmount: number | null;
    name: string | null;
    teams: Array<{ members: Array<{ player: { name: string } | undefined }> }>;
  }>
): { isDuplicate: false } | { isDuplicate: true; duplicateOf: string } {
  // Build sig → description map from non-dismissed pending SMS bets
  const sigToDesc = new Map<string, string>();
  for (const eb of existingSmsBets) {
    if (eb.status === "dismissed") continue;
    const ebParsed = eb.parsedBets as ParsedSmsBet[] | null;
    if (!Array.isArray(ebParsed)) continue;
    for (const pb of ebParsed) {
      sigToDesc.set(computeBetSignature(pb), pb.description);
    }
  }

  // Add signatures computed from existing applied eventMatches
  for (const em of existingEmsWithTeams) {
    const betType = MATCH_TYPE_TO_BET_TYPE[em.matchType] ?? "other";
    const playerNames: string[] = [];
    for (const t of em.teams) {
      for (const m of t.members) {
        if (m.player?.name) playerNames.push(m.player.name);
      }
    }
    const fakeBet: ParsedSmsBet = {
      betType,
      amountCents: em.unitAmount ?? 0,
      players: playerNames,
      description: em.name ?? "",
    };
    sigToDesc.set(computeBetSignature(fakeBet), em.name ?? "");
  }

  // Check each incoming parsed bet
  for (const pb of parsedBets) {
    const sig = computeBetSignature(pb);
    if (sigToDesc.has(sig)) {
      return { isDuplicate: true, duplicateOf: sigToDesc.get(sig)! };
    }
  }
  return { isDuplicate: false };
}
