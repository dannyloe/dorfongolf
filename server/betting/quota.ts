/**
 * server/betting/quota.ts
 *
 * Pure calculation functions for the Quota game (2026-07-20, Phase 2).
 * Same shape as matchplay.ts: no DB access here, just scores/pars/handicaps in,
 * points/rank/payout numbers out. server/betting/calculate.ts owns loading rows
 * from the DB and calling into these functions (see calculateQuotaPool there).
 *
 * Quota is NOT a two-sided bet like everything else in matchplay.ts — it's an
 * entry-fee pool ranked on a leaderboard, paid out by finishing position. See
 * QUOTA_GAME_PLAN.md in the Press folder for the full design.
 *
 * Source for the base format: livetourney.com's Quota golf game article.
 * Individual quota = 36 - course handicap. Team quota = 36*teamSize - sum(member
 * handicaps) (generalizes the article's fixed 4-man "144 - sum" formula to a
 * variable team size, per Danny's call on 2026-07-18).
 * Points are based on GROSS score, not net-adjusted per hole — the quota target
 * itself already bakes in the handicap, so there's no separate net-scoring step
 * per hole the way Nassau/match-play need.
 */

// ============================================================================
// Per-hole points
// ============================================================================

/** One gross score on one hole, as already captured by the existing scores table. */
export interface QuotaHoleScore {
  holeNumber: number;
  strokes: number;
}

/**
 * bogey-or-worse-by-2+ = 0, bogey = 1, par = 2, birdie = 4, eagle-or-better = 8.
 * `par` and `grossStrokes` are both required — a hole with no par on record or
 * no score recorded yet contributes 0 rather than throwing, since Quota entries
 * get read mid-round while scores are still being entered.
 */
export function pointsForHole(par: number | null | undefined, grossStrokes: number | null | undefined): number {
  if (par == null || grossStrokes == null) return 0;
  const relativeToPar = grossStrokes - par;
  if (relativeToPar <= -2) return 8; // eagle or better
  if (relativeToPar === -1) return 4; // birdie
  if (relativeToPar === 0) return 2; // par
  if (relativeToPar === 1) return 1; // bogey
  return 0; // double bogey or worse
}

/**
 * Sums points across a set of holes for one player on one course/round.
 * `pars` is indexed like calculate.ts's existing pars[] array: pars[0] = hole 1's par.
 * Scores for holes with no matching par entry are skipped (contribute 0), matching
 * the "someone sat out that day" rule from the plan's Phase 3 section.
 */
export function calculateQuotaPoints(pars: number[], scores: QuotaHoleScore[]): number {
  let total = 0;
  for (const score of scores) {
    const par = pars[score.holeNumber - 1];
    total += pointsForHole(par, score.strokes);
  }
  return total;
}

// ============================================================================
// Quota targets
// ============================================================================

/** Individual mode: 36 - course handicap. Can go negative for very low handicaps. */
export function calculateIndividualQuota(courseHandicap: number): number {
  return 36 - courseHandicap;
}

/**
 * Team mode, variable team size: 36*teamSize - sum(member course handicaps).
 * memberHandicaps.length is the team size — callers don't pass teamSize separately
 * to avoid the two ever disagreeing.
 */
export function calculateTeamQuota(memberHandicaps: number[]): number {
  const teamSize = memberHandicaps.length;
  const sum = memberHandicaps.reduce((a, b) => a + b, 0);
  return 36 * teamSize - sum;
}

// ============================================================================
// Ranking
// ============================================================================

export interface QuotaEntryForRanking {
  entryId: number;
  pointsTotal: number;
  quota: number;
}

export interface RankedQuotaEntry extends QuotaEntryForRanking {
  netScore: number; // pointsTotal - quota
  rank: number;
}

/**
 * Sorts by netScore descending (higher = better, matching the article's "+4" style
 * result). Ties share the same rank and occupy that many payout slots — standard
 * competition ranking (1, 2, 2, 4), not dense ranking (1, 2, 2, 3). This is a
 * default per QUOTA_GAME_PLAN.md's Phase 2 note, not yet confirmed with Danny;
 * easy to change before this ships if he wants a different tiebreaker.
 */
export function rankQuotaEntries(entries: QuotaEntryForRanking[]): RankedQuotaEntry[] {
  const withNet = entries.map((e) => ({ ...e, netScore: e.pointsTotal - e.quota }));
  const sorted = [...withNet].sort((a, b) => b.netScore - a.netScore);

  const ranked: RankedQuotaEntry[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rank = i > 0 && sorted[i].netScore === sorted[i - 1].netScore
      ? ranked[i - 1].rank
      : i + 1;
    ranked.push({ ...sorted[i], rank });
  }
  return ranked;
}

// ============================================================================
// Payouts
// ============================================================================

/** One row of the payout split config stored on quotaPools.payoutSplits (jsonb). */
export interface QuotaPayoutSplit {
  rank: number;
  percent: number; // percent of the total pool, e.g. 50 for 50%
}

export interface QuotaEntryWithPayout extends RankedQuotaEntry {
  payoutCents: number;
}

/**
 * Splits totalCents evenly across n shares with no lost or invented pennies —
 * same even-split-with-remainder approach the project already uses for
 * createEventTransaction (formerly createRyderCupTransaction). Extra cents go to
 * the first entries in the (already-deterministic, entryId-sorted) input order.
 */
function distributeEvenSplit(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  const shares = new Array(n).fill(base);
  for (let i = 0; i < remainder; i++) shares[i] += 1;
  return shares;
}

/**
 * totalPoolCents = entryFeeCents * number of entries. payoutSplits gives a percent
 * of that pool per finishing rank (e.g. [{rank:1,percent:50},{rank:2,percent:30},
 * {rank:3,percent:20}]). Ranks with no matching split (finished out of the money)
 * get 0. When entries tie for a rank, their combined slots' percentages are pooled
 * and then split evenly among the tied entries (e.g. 2 players tied for 1st occupy
 * the 1st AND 2nd place percentages combined, then split that combined amount
 * between the two of them) — consistent with the competition-ranking rule above.
 * This ranking-to-dollars step has no precedent elsewhere in the codebase.
 */
export function calculateQuotaPayouts(
  rankedEntries: RankedQuotaEntry[],
  entryFeeCents: number,
  payoutSplits: QuotaPayoutSplit[]
): QuotaEntryWithPayout[] {
  const totalPoolCents = entryFeeCents * rankedEntries.length;
  const splitByRank = new Map(payoutSplits.map((s) => [s.rank, s.percent]));

  // Group entries by rank (order within a group follows entryId for determinism).
  const byRank = new Map<number, RankedQuotaEntry[]>();
  for (const e of rankedEntries) {
    const arr = byRank.get(e.rank) ?? [];
    arr.push(e);
    byRank.set(e.rank, arr);
  }
  for (const group of byRank.values()) {
    group.sort((a, b) => a.entryId - b.entryId);
  }

  const payoutByEntryId = new Map<number, number>();
  for (const [rank, group] of byRank.entries()) {
    let percentForGroup = 0;
    for (let r = rank; r < rank + group.length; r++) {
      percentForGroup += splitByRank.get(r) ?? 0;
    }
    const groupCents = Math.round(totalPoolCents * (percentForGroup / 100));
    const shares = distributeEvenSplit(groupCents, group.length);
    group.forEach((entry, idx) => payoutByEntryId.set(entry.entryId, shares[idx]));
  }

  return rankedEntries.map((e) => ({
    ...e,
    payoutCents: payoutByEntryId.get(e.entryId) ?? 0,
  }));
}
