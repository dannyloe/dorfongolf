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
      thinkingConfig: { thinkingBudget: 0 },
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

/**
 * Post-processing guard applied after every Gemini response.
 * 1. Nulls any strokes value ≥ 20 — minimum realistic 9-hole total is ~27,
 *    so anything ≥ 20 in a single-hole slot is a subtotal that leaked through.
 * 2. Deduplicates holes within each half: if the same holeNumber appears more
 *    than once (e.g. Gemini included both the score AND the Out column under
 *    hole 10), keep the entry with the lower strokes value.
 * 3. Filters out any player row where every hole ended up null — these are
 *    players Gemini hallucinated from the match list but found no card data for.
 */
function applyPostProcessing(players: NormalizedPlayer[]): NormalizedPlayer[] {
  const processed = players.map(player => {
    // Step 1: strip strokes ≥ 20 (subtotals masquerading as hole scores)
    const stripped = player.holes.map(h => ({
      ...h,
      strokes: h.strokes !== null && h.strokes >= 20 ? null : h.strokes,
    }));

    // Step 2: deduplicate by holeNumber within each half — keep the lower-strokes entry
    const byHole = new Map<number, NormalizedHole>();
    for (const h of stripped) {
      const existing = byHole.get(h.holeNumber);
      if (!existing) {
        byHole.set(h.holeNumber, h);
      } else {
        // Prefer the entry with a non-null, lower strokes value (likely the real score)
        const existingVal = existing.strokes ?? Infinity;
        const newVal = h.strokes ?? Infinity;
        if (newVal < existingVal) byHole.set(h.holeNumber, h);
      }
    }

    // Rebuild sorted hole list
    const cleanHoles = Array.from(byHole.values()).sort(
      (a, b) => a.holeNumber - b.holeNumber
    );

    return { ...player, holes: cleanHoles };
  });

  // Step 3: drop rows where every hole is null (player not on the card)
  return processed.filter(player => player.holes.some(h => h.strokes !== null));
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

CRITICAL — subtotal columns must be completely ignored (column-position rule):
- A standard 18-hole scorecard row contains exactly 20 columns: holes 1–9, then an "Out" subtotal, then holes 10–18, then an "In" or "Total" subtotal.
- Skip by POSITION, not just by label: the value that appears IMMEDIATELY AFTER hole 9's score in the row (before hole 10 begins) is ALWAYS the "Out" running total — skip it even if there is no "Out" label visible. Likewise, the value IMMEDIATELY AFTER hole 18's score is ALWAYS the "In"/"Total" — skip it.
- Do NOT map either of those positional subtotals to any hole number. They are running totals and must be discarded entirely.
- Even if a subtotal value looks like a plausible single-hole score (e.g. "37" or "4"), it must still be skipped.

CRITICAL — count sanity check:
- After reading all scores, verify you have exactly 9 scores for holes 1–9 and exactly 9 scores for holes 10–18 (scores that are "" or "X" still count toward the 9).
- If either half has more than 9 entries, you accidentally included a subtotal column. Remove the extra entry before returning results.

CRITICAL — large values in score rows:
- Any value of 20 or higher appearing anywhere in a player's score row is almost certainly a subtotal (e.g. front-9 total = 37), not a hole score. Skip it.

CRITICAL — match play annotations:
- Some scorecards have running match play totals written next to or near hole scores (e.g. "+2", "-1", "AS", "1UP"). These are NOT hole scores.
- Only read the integer stroke count for each hole. Ignore any +/- notation, "UP", "DN", or "AS" written adjacent to a score.

CRITICAL — visual decorations around scores:
- Scorers sometimes circle, box, or underline individual hole scores as personal notation. These marks are purely decorative — ignore them entirely.
- Read only the numeral(s) inside the mark. Never let a surrounding border, circle outline, or underline bleed into the digit itself.
- Specifically: a boxed "4" is 4, not "14" or "41". A circled "3" is 3, not "03" or "30".${extraRulesText}`;

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
      thinkingConfig: { thinkingBudget: 0 },
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

  const rawScores = (parsed.scores ?? []).map((p: GeminiPlayer) => ({
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
    scores: applyPostProcessing(rawScores),
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
  players: Array<{ id: number; name: string; aliases?: string[] }>;
  extraRulesText?: string;
}): Promise<ScannedBetResult[]> {
  const { imageBase64, players, extraRulesText } = params;

  if (!ai) {
    throw new Error("AI features are currently unavailable");
  }

  const mimeMatch = imageBase64.match(/^data:(image\/[^;]+);base64,/);
  const mimeType = mimeMatch?.[1] || "image/jpeg";
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

  if (!base64Data) {
    throw new Error("Invalid image data");
  }

  const playerList = players.map(p => {
    const aka = p.aliases && p.aliases.length > 0 ? ` (aka: ${p.aliases.join(", ")})` : "";
    return `  - ID ${p.id}: "${p.name}"${aka}`;
  }).join("\n");

  const prompt = `You are reading a handwritten golf betting slip photo. Find EVERY separate bet written on the slip and return them all.

Available players. To match a name written on the slip to a player ID:
- Compare the written name against the canonical name AND all aliases.
- Accept a match if the written text is a prefix of 3+ characters of any canonical name or alias (e.g. "Pat" matches "Patrick", "Sch" matches "Schmidt").
- Accept a match if the written text IS an alias exactly (e.g. "Hot Left" if that is an alias).
- If a name still cannot be matched after these checks, add it to unmatchedNames.
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

Wheel / keyed-player rules:
- A checkmark (✓ or ✓-like mark), asterisk (*), or the word "wheel" or "captain" written next to or above a player's name means that player is "the wheel" (captain) for their side.
- TEAM CONTEXT (player has teammates): The captain MUST appear in BOTH their team array AND keyedPlayerIds. This is a hard constraint — a captain with teammates is NEVER placed only in keyedPlayerIds.
  - Example: "Ty A ✓, DLoe, Spikey, Pat" heading Team A with "Chaney ✓, CP, Sam, Harmon" as Team B:
    teamAPlayerIds: [TyA_id, DLoe_id, Spikey_id, Pat_id]   ← Ty A is HERE in teamA
    teamBPlayerIds: [Chaney_id, CP_id, Sam_id, Harmon_id]   ← Chaney is HERE in teamB
    keyedPlayerIds: [TyA_id, Chaney_id]                     ← both captains are also here
- SOLO CONTEXT (player appears alone with no teammates): Put them ONLY in keyedPlayerIds.
  - Example: "DLoe ✓ vs everyone": teamAPlayerIds: [], keyedPlayerIds: [DLoe_id]
- When keyed players are present, assume matchType: "match_play_1_ball" if not explicitly stated.

1-man vs-multiple expansion rule:
- When a section reads "[SinglePlayer] vs [Player1], [Player2], [Player3]" with a "1 man", "1 ball", or individual match label, this is NOT one bet with many players on one side — it is MULTIPLE separate 1v1 bets, one per opponent. Expand into N separate bet objects, each with the single player in teamAPlayerIds and one opponent in teamBPlayerIds.
- Example: "1 Man $20 Match, DLoe vs CP, Sam, Harmon" → three separate bet objects: {teamA:[DLoe], teamB:[CP]}, {teamA:[DLoe], teamB:[Sam]}, {teamA:[DLoe], teamB:[Harmon]}, all with matchType: "match_play_1_ball" and unitAmount: 20.

Amount rules:
- "$20" or "20" → unitAmount: 20
- For nassau, the dollar amount is usually the per-leg amount (front/back/overall)
- For death match: look for a "base" or "BB" amount → deathMatchBaseBet
- For 2 ball / 3 ball: if two amounts are listed → twoBallBet and threeBallBet

Net/gross:
- "net", "hdcp", "handicap", "strokes" → useNet: true
- "gross", no mention → useNet: false

Return ONLY a valid JSON array with NO markdown, no code blocks, no explanation.
Each element of the array represents one distinct bet found on the slip. If there is only one bet, return an array with one element.

[
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
    "parsedSummary": "Brief human-readable description of this bet",
    "unmatchedNames": []
  }
]${extraRulesText ? `\n\nAdditional rules based on past scan corrections:\n${extraRulesText}` : ""}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config: { thinkingConfig: { thinkingBudget: 0 } } as any,
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

  // ── JSON extraction — parse each part independently (no greedy concat) ──────
  const allParts: Array<{ text?: string }> = response.candidates?.[0]?.content?.parts ?? [];
  console.log("[scanBetSlip] parts count:", allParts.length);

  const tryParsePart = (text: string): any[] | null => {
    const t = text.trim();
    // Strip optional markdown fences
    const stripped = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    // 1. Valid JSON array?
    try {
      const v = JSON.parse(stripped);
      if (Array.isArray(v) && v.length > 0) return v;
    } catch { /* fall through */ }

    // 2. { bets: [...] } wrapper?
    try {
      const v = JSON.parse(stripped);
      if (v && Array.isArray(v.bets) && v.bets.length > 0) return v.bets;
    } catch { /* fall through */ }

    // 3. Single bet object → wrap in array (any object with at least one known key)
    const BET_KEYS = new Set(["matchType","teamAPlayerIds","teamBPlayerIds","skinsPlayerIds","keyedPlayerIds","unitAmount","useNet","unmatchedNames"]);
    try {
      const v = JSON.parse(stripped);
      if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).some(k => BET_KEYS.has(k))) {
        return [v];
      }
    } catch { /* fall through */ }

    return null;
  };

  let betsArray: any[] | null = null;
  for (const part of allParts) {
    const text = part.text ?? "";
    if (!text.trim()) continue;
    console.log("[scanBetSlip] trying part (first 300 chars):", text.substring(0, 300));
    betsArray = tryParsePart(text);
    if (betsArray) break;
  }

  if (!betsArray) {
    throw new Error("Could not read the bet slip. Please try a clearer photo.");
  }

  // ── Server-side fuzzy name matching ────────────────────────────────────────
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  type PlayerEntry = { id: number; name: string; aliases?: string[] };

  const fuzzyMatch = (written: string, playerList: PlayerEntry[]): { id: number; name: string } | null => {
    const w = normalise(written);
    if (w.length < 2) return null;
    // 1. Exact match on any token
    for (const p of playerList) {
      for (const t of [p.name, ...(p.aliases ?? [])]) {
        if (normalise(t) === w) return { id: p.id, name: p.name };
      }
    }
    // 2. Prefix match (written prefixes a token, or a token prefixes written) — min 3 chars
    if (w.length >= 3) {
      for (const p of playerList) {
        for (const t of [p.name, ...(p.aliases ?? [])]) {
          const nt = normalise(t);
          if (nt.startsWith(w) || w.startsWith(nt)) return { id: p.id, name: p.name };
        }
      }
    }
    // 3. Substring match — min 3 chars
    if (w.length >= 3) {
      for (const p of playerList) {
        for (const t of [p.name, ...(p.aliases ?? [])]) {
          if (normalise(t).includes(w)) return { id: p.id, name: p.name };
        }
      }
    }
    return null;
  };

  // Guardrail: ensure every keyed player also appears in a team (or skins) array.
  // Gemini sometimes places captains only in keyedPlayerIds instead of also in their team.
  // If a keyed player is absent from all team arrays, add them to the team with fewer players.
  betsArray = betsArray.map(b => {
    const keyed: number[] = Array.isArray(b.keyedPlayerIds) ? [...b.keyedPlayerIds] : [];
    if (keyed.length === 0) return b;
    const teamA: number[] = Array.isArray(b.teamAPlayerIds) ? [...b.teamAPlayerIds] : [];
    const teamB: number[] = Array.isArray(b.teamBPlayerIds) ? [...b.teamBPlayerIds] : [];
    const skins: number[] = Array.isArray(b.skinsPlayerIds) ? [...b.skinsPlayerIds] : [];
    let changed = false;
    for (const kid of keyed) {
      if (!teamA.includes(kid) && !teamB.includes(kid) && !skins.includes(kid)) {
        // Add to the team with fewer players (balanced heuristic)
        if (teamA.length <= teamB.length) teamA.push(kid);
        else teamB.push(kid);
        changed = true;
      }
    }
    if (!changed) return b;
    return { ...b, teamAPlayerIds: teamA, teamBPlayerIds: teamB };
  });

  betsArray = betsArray.map(b => {
    const unmatched: string[] = Array.isArray(b.unmatchedNames) ? [...b.unmatchedNames] : [];
    if (unmatched.length === 0) return b;

    const teamA: number[] = Array.isArray(b.teamAPlayerIds) ? [...b.teamAPlayerIds] : [];
    const teamB: number[] = Array.isArray(b.teamBPlayerIds) ? [...b.teamBPlayerIds] : [];
    const skins: number[] = Array.isArray(b.skinsPlayerIds) ? [...b.skinsPlayerIds] : [];
    const keyed: number[] = Array.isArray(b.keyedPlayerIds) ? [...b.keyedPlayerIds] : [];
    const serverMatchedNames: Array<{ inputName: string; matchedPlayerId: number; matchedPlayerName: string; targetField: string }> = [];
    const stillUnmatched: string[] = [];

    for (const name of unmatched) {
      const match = fuzzyMatch(name, players);
      if (!match) { stillUnmatched.push(name); continue; }
      const { id, name: playerName } = match;
      // Skip if already assigned anywhere
      if ([...teamA, ...teamB, ...skins, ...keyed].includes(id)) continue;
      // Determine which array gets this player
      let targetField: string;
      if (b.matchType === "skins") {
        skins.push(id); targetField = "skinsPlayerIds";
      } else if (keyed.length > 0) {
        keyed.push(id); targetField = "keyedPlayerIds";
      } else {
        if (teamA.length <= teamB.length) { teamA.push(id); targetField = "teamAPlayerIds"; }
        else { teamB.push(id); targetField = "teamBPlayerIds"; }
      }
      serverMatchedNames.push({ inputName: name, matchedPlayerId: id, matchedPlayerName: playerName, targetField });
    }

    return {
      ...b,
      teamAPlayerIds: teamA,
      teamBPlayerIds: teamB,
      skinsPlayerIds: skins,
      keyedPlayerIds: keyed,
      unmatchedNames: stillUnmatched,
      serverMatchedNames,
    };
  });

  return betsArray.map(b => ({ success: true, ...b }));
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
