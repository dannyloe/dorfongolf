import type { CourseHole, CourseTee } from "@shared/schema";

export interface PlayerHandicapInfo {
  playerId: number;
  playerName: string;
  handicapIndex: number | null; // stored as tenths (e.g., 124 = 12.4)
  teeId: number | null;
}

export interface PlayerCourseHandicap {
  playerId: number;
  playerName: string;
  courseHandicap: number; // calculated and rounded to nearest whole number
  relativeHandicap: number; // adjusted so lowest player = 0
}

export interface HoleHandicapData {
  holeNumber: number;
  handicapRank: number; // 1-18, where 1 is the hardest hole
}

export function calculateCourseHandicap(
  handicapIndex: number | null,
  slopeRating: number | null
): number {
  if (handicapIndex === null || slopeRating === null) {
    return 0;
  }
  const index = handicapIndex / 10;
  const rawCourseHandicap = index * (slopeRating / 113);
  return Math.round(rawCourseHandicap);
}

export function calculateRelativeHandicaps(
  players: PlayerHandicapInfo[],
  tees: CourseTee[]
): PlayerCourseHandicap[] {
  if (players.length === 0) {
    return [];
  }
  
  const teeMap = new Map(tees.map(t => [t.id, t]));
  
  const courseHandicaps = players.map(player => {
    const tee = player.teeId ? teeMap.get(player.teeId) : null;
    const slopeRating = tee?.slopeRating ?? null;
    const courseHandicap = calculateCourseHandicap(player.handicapIndex, slopeRating);
    
    return {
      playerId: player.playerId,
      playerName: player.playerName,
      courseHandicap,
      relativeHandicap: courseHandicap,
    };
  });
  
  // Filter out any invalid handicaps and find minimum
  const validHandicaps = courseHandicaps.map(p => p.courseHandicap).filter(h => !isNaN(h) && isFinite(h));
  const minHandicap = validHandicaps.length > 0 ? Math.min(...validHandicaps) : 0;
  
  return courseHandicaps.map(p => ({
    ...p,
    relativeHandicap: isNaN(p.courseHandicap) || !isFinite(p.courseHandicap) 
      ? 0 
      : p.courseHandicap - minHandicap,
  }));
}

export function getStrokesForHole(
  relativeHandicap: number,
  holeHandicapRank: number
): number {
  if (relativeHandicap <= 0 || holeHandicapRank < 1 || holeHandicapRank > 18) {
    return 0;
  }
  
  let strokes = 0;
  let remainingHandicap = relativeHandicap;
  
  while (remainingHandicap >= 18) {
    strokes += 1;
    remainingHandicap -= 18;
  }
  
  if (remainingHandicap >= holeHandicapRank) {
    strokes += 1;
  }
  
  return strokes;
}

export function buildHoleHandicapMap(holes: CourseHole[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const hole of holes) {
    if (hole.handicap !== null) {
      map.set(hole.holeNumber, hole.handicap);
    }
  }
  return map;
}

export function calculateNetScore(
  grossStrokes: number,
  relativeHandicap: number,
  holeHandicapRank: number
): number {
  const strokesReceived = getStrokesForHole(relativeHandicap, holeHandicapRank);
  return grossStrokes - strokesReceived;
}

export interface NetScoringContext {
  playerHandicaps: Map<number, number>; // playerId -> relativeHandicap
  holeHandicaps: Map<number, number>; // holeNumber -> handicapRank
}

export function buildNetScoringContext(
  players: PlayerHandicapInfo[],
  tees: CourseTee[],
  holes: CourseHole[]
): NetScoringContext {
  const relativeHandicaps = calculateRelativeHandicaps(players, tees);
  
  const playerHandicaps = new Map<number, number>();
  for (const p of relativeHandicaps) {
    playerHandicaps.set(p.playerId, p.relativeHandicap);
  }
  
  const holeHandicaps = buildHoleHandicapMap(holes);
  
  return { playerHandicaps, holeHandicaps };
}

export function getNetStrokes(
  grossStrokes: number,
  playerId: number,
  holeNumber: number,
  context: NetScoringContext | null
): number {
  if (!context) {
    return grossStrokes;
  }
  
  const relativeHandicap = context.playerHandicaps.get(playerId) ?? 0;
  const holeHandicapRank = context.holeHandicaps.get(holeNumber) ?? 18;
  
  return calculateNetScore(grossStrokes, relativeHandicap, holeHandicapRank);
}
