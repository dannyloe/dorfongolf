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
  slopeRating: number | null,
  courseRating: number | null = null,
  par: number | null = null
): number {
  if (handicapIndex === null || slopeRating === null) {
    return 0;
  }
  const index = handicapIndex / 10;
  const slopeAdjustment = index * (slopeRating / 113);
  
  // USGA formula: Course Handicap = Handicap Index × (Slope Rating ÷ 113) + (Course Rating - Par)
  // Course rating is stored as tenths (e.g., 721 = 72.1)
  let courseRatingAdjustment = 0;
  if (courseRating !== null && par !== null) {
    const ratingValue = courseRating / 10;
    courseRatingAdjustment = ratingValue - par;
  }
  
  const rawCourseHandicap = slopeAdjustment + courseRatingAdjustment;
  return Math.round(rawCourseHandicap);
}

export function calculateRelativeHandicaps(
  players: PlayerHandicapInfo[],
  tees: CourseTee[],
  holes: CourseHole[] = []
): PlayerCourseHandicap[] {
  if (players.length === 0) {
    return [];
  }
  
  const teeMap = new Map(tees.map(t => [t.id, t]));
  
  // Calculate course par from holes (sum of all hole pars)
  const coursePar = holes.length > 0 
    ? holes.reduce((sum, h) => sum + (h.par ?? 0), 0)
    : null;
  
  const courseHandicaps = players.map(player => {
    const tee = player.teeId ? teeMap.get(player.teeId) : null;
    const slopeRating = tee?.slopeRating ?? null;
    const courseRating = tee?.courseRating ?? null;
    const courseHandicap = calculateCourseHandicap(player.handicapIndex, slopeRating, courseRating, coursePar);
    
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
  courseHandicaps: Map<number, number>; // playerId -> courseHandicap (before relative adjustment)
}

export interface CourseHandicapOverride {
  playerId: number;
  courseHandicap: number;
}

export function buildNetScoringContext(
  players: PlayerHandicapInfo[],
  tees: CourseTee[],
  holes: CourseHole[],
  courseHandicapOverrides?: CourseHandicapOverride[]
): NetScoringContext {
  // Calculate course handicaps from handicap index, slope rating, course rating, and par
  const calculatedHandicaps = calculateRelativeHandicaps(players, tees, holes);
  
  // Create a map to track course handicaps (with overrides applied)
  const courseHandicaps = new Map<number, number>();
  const overrideMap = new Map((courseHandicapOverrides ?? []).map(o => [o.playerId, o.courseHandicap]));
  
  for (const p of calculatedHandicaps) {
    // Use override if available, otherwise use calculated value
    const courseHcp = overrideMap.has(p.playerId) ? overrideMap.get(p.playerId)! : p.courseHandicap;
    courseHandicaps.set(p.playerId, courseHcp);
  }
  
  // Calculate relative handicaps (lowest = 0) based on final course handicaps
  const finalCourseHandicaps = Array.from(courseHandicaps.values()).filter(h => !isNaN(h) && isFinite(h));
  const minHandicap = finalCourseHandicaps.length > 0 ? Math.min(...finalCourseHandicaps) : 0;
  
  const playerHandicaps = new Map<number, number>();
  const entries = Array.from(courseHandicaps.entries());
  for (const entry of entries) {
    const playerId = entry[0];
    const courseHcp = entry[1];
    const relative = isNaN(courseHcp) || !isFinite(courseHcp) ? 0 : courseHcp - minHandicap;
    playerHandicaps.set(playerId, relative);
  }
  
  const holeHandicaps = buildHoleHandicapMap(holes);
  
  return { playerHandicaps, holeHandicaps, courseHandicaps };
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
