---
name: Gemini scan prompt findings
description: What works and what backfires in the scanHelper.ts Gemini prompt for scorecard scanning
---

## Rule: Remove hole-anchoring instruction

The prompt previously contained a "CRITICAL — hole number anchoring" block that told Gemini to re-verify each score against the header row. This caused Gemini to return the **same wrong value for H10 across all players on a card** (e.g. H10=3 for every player on Card 1 of 7W5R). When asked directly without that instruction, Gemini reads H10 correctly.

**Why:** During structured JSON generation, the anchoring re-verification pass misfires on the Out/back-9 boundary, overriding correct natural reads with a consistently wrong value. Removing it lifted Card 1 accuracy from 0/4 to 3/4 perfect.

**How to apply:** Never add "anchor each score to the header row" style instructions. The subtotal, count sanity, and large-value rules are sufficient.

## Rule: Add match play annotation ignore rule

Some scorecards (especially Hardscrabble CC) have running match play totals written inline next to hole scores (e.g. "5 +2", "4 -1", "3 AS"). Without a rule, Gemini reads these as part of the score (e.g. reading "14" for a "4 +2" cell), corrupting every player on the card.

**Added rule (CRITICAL — match play annotations):**
> Some scorecards have running match play totals written next to or near hole scores (e.g. "+2", "-1", "AS", "1UP"). These are NOT hole scores. Only read the integer stroke count for each hole. Ignore any +/- notation, "UP", "DN", or "AS" written adjacent to a score.

## Production accuracy baseline (as of May 2026)

Tested against two Hardscrabble CC rounds (7W5R 17 players, 5KY5 25 players):
- Without anchoring instruction: **~80–84% of named players perfect**
- With anchoring instruction: **~46% perfect** (systemic H10 failure)
- Cards with match play +/- annotations: 0/4 perfect without the annotation rule

## Known remaining failure modes
1. **Column collapse** — on crowded cards Gemini silently drops a player column (seen on 7W5R Card 2). Fix: pass exact player count + names so Gemini knows how many columns to expect.
2. **High-scorer row confusion** — players with scores in the 80s/88s on dense cards get mangled.
3. **Photo angle / clutter** — rotated cards + heavy annotations reduce accuracy significantly.
