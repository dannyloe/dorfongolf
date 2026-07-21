/**
 * server/betting/calculate.ts
 *
 * Server-side bet calculation helper.
 * Loads all data for a match from the DB, runs calculateAllEventMatchResults,
 * and returns results grouped by event match ID.
 *
 * Usage in routes.ts:
 *   import { calculateMatchBets } from './betting/calculate';
 *   app.get('/api/matches/:id/calculate', isAuthenticated, async (req, res) => {
 *     const results = await calculateMatchBets(parseInt(req.params.id));
 *     res.json({ matchId: parseInt(req.params.id), results });
 *   });
 */

import { db } from '../db';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@shared/schema';
import {
  buildNetScoringContext,
  type PlayerHandicapInfo,
  type NetScoringContext,
  type CourseHandicapOverride,
} from './handicap';
import {
  calculateAllEventMatchResults,
  type StorableEventMatchResult,
} from './matchplay';
import {
  calculateQuotaPoints,
  rankQuotaEntries,
  calculateQuotaPayouts,
  type QuotaHoleScore,
  type QuotaEntryForRanking,
  type QuotaPayoutSplit,
  type QuotaEntryWithPayout,
} from './quota';

export async function calculateMatchBets(
  matchId: number
): Promise<Record<number, StorableEventMatchResult[]>> {

  // ── 1. Match row (courseId, isHandicapped) ───────────────────────────────
  const [matchRow] = await db
    .select()
    .from(schema.matches)
    .where(eq(schema.matches.id, matchId))
    .limit(1);

  if (!matchRow) return {};

  const courseId = matchRow.courseId;
  const isHandicapped = matchRow.isHandicapped ?? false;

  // ── 2. Event matches for this match ──────────────────────────────────────
  const eventMatchRows = await db
    .select()
    .from(schema.eventMatches)
    .where(eq(schema.eventMatches.eventId, matchId));

  if (eventMatchRows.length === 0) return {};

  const eventMatchIds = eventMatchRows.map((em) => em.id);

  // ── 3. Teams ─────────────────────────────────────────────────────────────
  const teamRows = await db
    .select()
    .from(schema.teams)
    .where(inArray(schema.teams.eventMatchId, eventMatchIds));

  // ── 4. Team members ──────────────────────────────────────────────────────
  const teamIds = teamRows.map((t) => t.id);
  const memberRows =
    teamIds.length > 0
      ? await db
          .select()
          .from(schema.teamMembers)
          .where(inArray(schema.teamMembers.teamId, teamIds))
      : [];

  // ── 5. Players (names, handicap, tee) ────────────────────────────────────
  const playerRows = await db
    .select()
    .from(schema.players)
    .where(eq(schema.players.matchId, matchId));

  const playerMap = new Map(playerRows.map((p) => [p.id, p]));

  // ── 6. Scores ─────────────────────────────────────────────────────────────
  const scoreRows = await db
    .select()
    .from(schema.scores)
    .where(eq(schema.scores.matchId, matchId));

  // ── 6b. Per-bet handicap overrides ───────────────────────────────────────
  // Fixed 2026-07-20: this table (and the "Course Handicaps (click to
  // edit)" UI that saves to it) has always been fully wired on the web
  // client, which builds its own net-scoring context in the browser and
  // already fetches+applies these overrides (client/src/pages/MatchDetail.tsx,
  // buildMatchNetContext). This server-side calculator — the one the iOS
  // app actually calls via GET /api/matches/:id/calculate — never fetched
  // them, so any override saved from the web app (or, once built, from iOS)
  // was silently ignored for every real bet's calculated payout. Same query
  // storage.getAllMatchPlayerHandicapsForMatch already runs for the
  // /all-player-handicaps route, inlined here since this function loads its
  // own DB rows directly rather than going through storage.ts.
  const overrideRows = await db
    .select()
    .from(schema.matchPlayerHandicaps)
    .where(inArray(schema.matchPlayerHandicaps.eventMatchId, eventMatchIds));

  const overridesByEventMatch = new Map<number, CourseHandicapOverride[]>();
  for (const o of overrideRows) {
    const arr = overridesByEventMatch.get(o.eventMatchId) ?? [];
    arr.push({ playerId: o.playerId, courseHandicap: o.courseHandicap });
    overridesByEventMatch.set(o.eventMatchId, arr);
  }

  // ── 7. Course data for net scoring ───────────────────────────────────────
  let courseHoles: (typeof schema.courseHoles.$inferSelect)[] = [];
  let courseTees: (typeof schema.courseTees.$inferSelect)[] = [];

  if (courseId && isHandicapped) {
    [courseHoles, courseTees] = await Promise.all([
      db.select().from(schema.courseHoles).where(eq(schema.courseHoles.courseId, courseId)),
      db.select().from(schema.courseTees).where(eq(schema.courseTees.courseId, courseId)),
    ]);
  }

  // ── 8. Pars array [par_hole1, ..., par_hole18] ────────────────────────────
  const pars: number[] | null =
    courseHoles.length > 0
      ? Array.from({ length: 18 }, (_, i) => {
          const hole = courseHoles.find((h) => h.holeNumber === i + 1);
          return hole?.par ?? 4;
        })
      : null;

  // ── 9. Index teams and members ───────────────────────────────────────────
  const membersByTeam = new Map<number, typeof memberRows>();
  for (const m of memberRows) {
    const arr = membersByTeam.get(m.teamId) ?? [];
    arr.push(m);
    membersByTeam.set(m.teamId, arr);
  }

  const teamsByEventMatch = new Map<number, typeof teamRows>();
  for (const t of teamRows) {
    const arr = teamsByEventMatch.get(t.eventMatchId) ?? [];
    arr.push(t);
    teamsByEventMatch.set(t.eventMatchId, arr);
  }

  // ── 10. Net scoring context per event match ───────────────────────────────
  // Built when: match is handicapped, course holes have handicap ranks,
  // and the specific event match has useNetScoring enabled.
  const hasHoleHandicaps = courseHoles.some((h) => h.handicap !== null);
  const netContextMap = new Map<number, NetScoringContext>();

  if (isHandicapped && hasHoleHandicaps && courseTees.length > 0) {
    for (const em of eventMatchRows) {
      if (!em.useNetScoring) continue;

      const emTeams = teamsByEventMatch.get(em.id) ?? [];
      const playerIdsInMatch = new Set<number>();
      for (const t of emTeams) {
        for (const m of membersByTeam.get(t.id) ?? []) {
          playerIdsInMatch.add(m.playerId);
        }
      }

      const playerInfos: PlayerHandicapInfo[] = Array.from(playerIdsInMatch)
        .map((pid) => {
          const p = playerMap.get(pid);
          if (!p) return null;
          return {
            playerId: p.id,
            playerName: p.name,
            handicapIndex: p.handicapIndex ?? null,
            teeId: p.teeId ?? null,
          } satisfies PlayerHandicapInfo;
        })
        .filter((x): x is PlayerHandicapInfo => x !== null);

      if (playerInfos.length > 0) {
        const ctx = buildNetScoringContext(
          playerInfos,
          courseTees,
          courseHoles,
          overridesByEventMatch.get(em.id)
        );
        netContextMap.set(em.id, ctx);
      }
    }
  }

  // ── 11. Assemble full eventMatch shape expected by matchplay.ts ───────────
  const eventMatches = eventMatchRows.map((em) => {
    const teams = (teamsByEventMatch.get(em.id) ?? []).map((t) => ({
      id: t.id,
      eventMatchId: t.eventMatchId,
      name: t.name,
      members: (membersByTeam.get(t.id) ?? []).map((m) => ({
        id: m.id,
        teamId: m.teamId,
        playerId: m.playerId,
        player: playerMap.has(m.playerId)
          ? {
              id: m.playerId,
              name: playerMap.get(m.playerId)!.name,
              userId: playerMap.get(m.playerId)!.userId ?? null,
            }
          : undefined,
      })),
    }));

    return {
      id: em.id,
      eventId: em.eventId,
      name: em.name,
      customName: em.customName ?? null,
      matchType: em.matchType,
      unitAmount: em.unitAmount,
      startHole: em.startHole,
      pressSegment: (em as any).pressSegment ?? null,
      parentMatchId: em.parentMatchId ?? null,
      autoPressOriginal: em.autoPressOriginal,
      autoPressAllPresses: em.autoPressAllPresses,
      autoPressNassauFront9: em.autoPressNassauFront9,
      autoPressNassauBack9: em.autoPressNassauBack9,
      autoPressNassauOverall: em.autoPressNassauOverall,
      useNetScoring: em.useNetScoring,
      startOnBack9: em.startOnBack9,
      deathMatchBaseBet: em.deathMatchBaseBet ?? null,
      deathMatchBestBallBet: em.deathMatchBestBallBet ?? null,
      deathMatchSecondBallBet: em.deathMatchSecondBallBet ?? null,
      deathMatchFirstPressBet: em.deathMatchFirstPressBet ?? null,
      deathMatchSubsequentPressBet: em.deathMatchSubsequentPressBet ?? null,
      deathMatchSecondBallPressBet: em.deathMatchSecondBallPressBet ?? null,
      twoThreeBallTwoBallBet: em.twoThreeBallTwoBallBet ?? null,
      twoThreeBallThreeBallBet: em.twoThreeBallThreeBallBet ?? null,
      autoPressTwoBallFront9: em.autoPressTwoBallFront9,
      autoPressTwoBallBack9: em.autoPressTwoBallBack9,
      autoPressTwoBallOverall: em.autoPressTwoBallOverall,
      autoPressThreeBallFront9: em.autoPressThreeBallFront9,
      autoPressThreeBallBack9: em.autoPressThreeBallBack9,
      autoPressThreeBallOverall: em.autoPressThreeBallOverall,
      oneTwoThreeBallOneBallBet: em.oneTwoThreeBallOneBallBet ?? null,
      oneTwoThreeBallTwoThirdBallBet: em.oneTwoThreeBallTwoThirdBallBet ?? null,
      autoPressOneBallFront9: em.autoPressOneBallFront9,
      autoPressOneBallBack9: em.autoPressOneBallBack9,
      autoPressOneBallOverall: em.autoPressOneBallOverall,
      autoPressTwoThirdBallFront9: em.autoPressTwoThirdBallFront9,
      autoPressTwoThirdBallBack9: em.autoPressTwoThirdBallBack9,
      autoPressTwoThirdBallOverall: em.autoPressTwoThirdBallOverall,
      downPressFormat: (em as any).downPressFormat ?? 'nine_and_nine',
      createdAt: em.createdAt?.toISOString(),
      teams,
    };
  });

  const scores = scoreRows.map((s) => ({
    id: s.id,
    matchId: s.matchId,
    playerId: s.playerId,
    holeNumber: s.holeNumber,
    strokes: s.strokes,
  }));

  // ── 12. Calculate ─────────────────────────────────────────────────────────
  const resultsMap = calculateAllEventMatchResults(
    eventMatches,
    scores,
    netContextMap.size > 0 ? netContextMap : null,
    pars
  );

  // ── 13. Serialize Map → plain object keyed by event match ID ──────────────
  const out: Record<number, StorableEventMatchResult[]> = {};
  resultsMap.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

/**
 * calculateQuotaPool — Phase 2 (2026-07-20).
 *
 * Deliberately a separate top-level function, not a branch inside calculateMatchBets:
 * a Quota pool spans either one match (single-day) or every match under an Event
 * (multi-day), never exactly one eventMatch the way calculateMatchBets assumes, and
 * the response shape is a ranked leaderboard, not per-eventMatch dollar settlements.
 * See QUOTA_GAME_PLAN.md's Phase 2 section — this is the "DB-loading" half of the
 * calc engine; server/betting/quota.ts holds the pure point/rank/payout math this
 * calls into, same split as calculateMatchBets/matchplay.ts.
 *
 * Read-only, same as calculateMatchBets — does not write pointsTotal/rank/payoutCents
 * back to the quotaEntries rows. Persisting is a Phase 3 (API endpoint) concern.
 */
export interface QuotaLeaderboardEntry extends QuotaEntryWithPayout {
  displayName: string; // team name (team mode) or resolved player name (individual mode)
}

export async function calculateQuotaPool(
  quotaPoolId: number
): Promise<{ pool: typeof schema.quotaPools.$inferSelect; entries: QuotaLeaderboardEntry[] } | null> {
  // ── 1. Pool row ────────────────────────────────────────────────────────────
  const [pool] = await db
    .select()
    .from(schema.quotaPools)
    .where(eq(schema.quotaPools.id, quotaPoolId))
    .limit(1);

  if (!pool) return null;

  // ── 2. Which match(es) feed this pool ───────────────────────────────────────
  // Single-day: exactly the one match. Multi-day: every match under the Event.
  // (Phase 3 enforces exactly one of matchId/eventId is set at creation time.)
  const matchRows = pool.matchId
    ? await db.select().from(schema.matches).where(eq(schema.matches.id, pool.matchId))
    : pool.eventId
      ? await db.select().from(schema.matches).where(eq(schema.matches.eventId, pool.eventId))
      : [];

  if (matchRows.length === 0) return { pool, entries: [] };

  const matchIds = matchRows.map((m) => m.id);

  // ── 3. Per-match pars, players, scores ──────────────────────────────────────
  const [allPlayerRows, allScoreRows] = await Promise.all([
    db.select().from(schema.players).where(inArray(schema.players.matchId, matchIds)),
    db.select().from(schema.scores).where(inArray(schema.scores.matchId, matchIds)),
  ]);

  interface MatchContext {
    pars: number[];
    playersByPersonId: Map<number, typeof allPlayerRows[number]>;
    playersById: Map<number, typeof allPlayerRows[number]>;
    scoresByPlayerId: Map<number, QuotaHoleScore[]>;
  }

  const matchContexts = new Map<number, MatchContext>();
  for (const match of matchRows) {
    const courseHoles = match.courseId
      ? await db.select().from(schema.courseHoles).where(eq(schema.courseHoles.courseId, match.courseId))
      : [];
    const pars = Array.from({ length: 18 }, (_, i) => {
      const hole = courseHoles.find((h) => h.holeNumber === i + 1);
      return hole?.par ?? 4;
    });

    const playersInMatch = allPlayerRows.filter((p) => p.matchId === match.id);
    const playersByPersonId = new Map<number, typeof allPlayerRows[number]>();
    const playersById = new Map<number, typeof allPlayerRows[number]>();
    for (const p of playersInMatch) {
      playersById.set(p.id, p);
      if (p.personId != null) playersByPersonId.set(p.personId, p);
    }

    const scoresByPlayerId = new Map<number, QuotaHoleScore[]>();
    for (const s of allScoreRows.filter((s) => s.matchId === match.id)) {
      const arr = scoresByPlayerId.get(s.playerId) ?? [];
      arr.push({ holeNumber: s.holeNumber, strokes: s.strokes });
      scoresByPlayerId.set(s.playerId, arr);
    }

    matchContexts.set(match.id, { pars, playersByPersonId, playersById, scoresByPlayerId });
  }

  // Resolves one player-or-member's identity to their points in one match. Falls
  // back to 0 (not an error) when that person didn't play that day's match —
  // matches the "someone sat out that day" rule from QUOTA_GAME_PLAN.md Phase 3.
  function pointsForOneMatch(
    ctx: MatchContext,
    personId: number | null,
    playerId: number | null
  ): number {
    const player = personId != null
      ? ctx.playersByPersonId.get(personId)
      : playerId != null
        ? ctx.playersById.get(playerId)
        : undefined;
    if (!player) return 0;
    const scores = ctx.scoresByPlayerId.get(player.id) ?? [];
    return calculateQuotaPoints(ctx.pars, scores);
  }

  // ── 4. Entries (+ members for team mode) ────────────────────────────────────
  const entryRows = await db
    .select()
    .from(schema.quotaEntries)
    .where(eq(schema.quotaEntries.quotaPoolId, quotaPoolId));

  const entryIds = entryRows.map((e) => e.id);
  const memberRows =
    pool.mode === 'team' && entryIds.length > 0
      ? await db.select().from(schema.quotaEntryMembers).where(inArray(schema.quotaEntryMembers.quotaEntryId, entryIds))
      : [];

  const membersByEntryId = new Map<number, typeof memberRows>();
  for (const m of memberRows) {
    const arr = membersByEntryId.get(m.quotaEntryId) ?? [];
    arr.push(m);
    membersByEntryId.set(m.quotaEntryId, arr);
  }

  // ── 5. Points per entry, summed across every match this pool spans ─────────
  const forRanking: Array<QuotaEntryForRanking & { displayName: string }> = entryRows.map((entry) => {
    let pointsTotal = 0;

    if (pool.mode === 'team') {
      for (const member of membersByEntryId.get(entry.id) ?? []) {
        for (const ctx of matchContexts.values()) {
          pointsTotal += pointsForOneMatch(ctx, member.personId ?? null, member.playerId ?? null);
        }
      }
    } else {
      for (const ctx of matchContexts.values()) {
        pointsTotal += pointsForOneMatch(ctx, entry.personId ?? null, entry.playerId ?? null);
      }
    }

    const displayName =
      pool.mode === 'team'
        ? entry.teamName ?? `Team ${entry.id}`
        : (() => {
            for (const ctx of matchContexts.values()) {
              const player = entry.personId != null
                ? ctx.playersByPersonId.get(entry.personId)
                : entry.playerId != null
                  ? ctx.playersById.get(entry.playerId)
                  : undefined;
              if (player) return player.name;
            }
            return `Entry ${entry.id}`;
          })();

    return {
      entryId: entry.id,
      pointsTotal,
      quota: entry.quota ?? 0,
      displayName,
    };
  });

  // ── 6. Rank, then apply payout splits ───────────────────────────────────────
  const ranked = rankQuotaEntries(forRanking);
  const payoutSplits = (pool.payoutSplits ?? []) as QuotaPayoutSplit[];
  const withPayouts = calculateQuotaPayouts(ranked, pool.entryFeeCents, payoutSplits);

  // rankQuotaEntries/calculateQuotaPayouts don't carry displayName through (pure
  // functions only know entryId/pointsTotal/quota) — rejoin it here by entryId.
  const displayNameByEntryId = new Map(forRanking.map((e) => [e.entryId, e.displayName]));
  const entries: QuotaLeaderboardEntry[] = withPayouts.map((e) => ({
    ...e,
    displayName: displayNameByEntryId.get(e.entryId) ?? `Entry ${e.entryId}`,
  }));

  return { pool, entries };
}
