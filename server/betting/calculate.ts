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
} from './handicap';
import {
  calculateAllEventMatchResults,
  type StorableEventMatchResult,
} from './matchplay';

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
        const ctx = buildNetScoringContext(playerInfos, courseTees, courseHoles);
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
