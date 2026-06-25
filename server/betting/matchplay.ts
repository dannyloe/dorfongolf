import { type NetScoringContext, getNetStrokes } from './handicap';
export type { NetScoringContext } from './handicap';

// ============================================================================
// Hole Mapping Utilities for "Start on Back 9" Mode
// ============================================================================
// When startOnBack9 is true, playing order is: 10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9
// Physical hole 10 becomes playing position 1, physical hole 1 becomes playing position 10

/**
 * Convert a physical hole number (1-18) to its playing position (1-18) based on startOnBack9
 * When startOnBack9=true: hole 10 → position 1, hole 1 → position 10
 */
export function physicalToPlayingPosition(physicalHole: number, startOnBack9: boolean): number {
  if (!startOnBack9) return physicalHole;
  // Physical 10-18 → Playing 1-9
  // Physical 1-9 → Playing 10-18
  if (physicalHole >= 10) {
    return physicalHole - 9; // 10→1, 11→2, ..., 18→9
  } else {
    return physicalHole + 9; // 1→10, 2→11, ..., 9→18
  }
}

/**
 * Convert a playing position (1-18) back to physical hole number based on startOnBack9
 * When startOnBack9=true: position 1 → hole 10, position 10 → hole 1
 */
export function playingToPhysicalHole(playingPosition: number, startOnBack9: boolean): number {
  if (!startOnBack9) return playingPosition;
  // Playing 1-9 → Physical 10-18
  // Playing 10-18 → Physical 1-9
  if (playingPosition <= 9) {
    return playingPosition + 9; // 1→10, 2→11, ..., 9→18
  } else {
    return playingPosition - 9; // 10→1, 11→2, ..., 18→9
  }
}

/**
 * Transform scores to playing order - changes holeNumber to playing position
 * Returns new array with transformed hole numbers
 */
export function transformScoresToPlayingOrder<T extends { holeNumber: number }>(
  scores: T[],
  startOnBack9: boolean
): T[] {
  if (!startOnBack9) return scores;
  return scores.map(score => ({
    ...score,
    holeNumber: physicalToPlayingPosition(score.holeNumber, startOnBack9),
  }));
}

/**
 * Transform hole data (par, handicap) to playing order
 * Input: array indexed by physical hole (index 0 = hole 1's data)
 * Output: array indexed by playing position (index 0 = first hole played's data)
 */
export function transformHoleDataToPlayingOrder<T>(
  holeData: T[],
  startOnBack9: boolean
): T[] {
  if (!startOnBack9 || holeData.length !== 18) return holeData;
  // When startOnBack9=true, reorder so index 0 = hole 10's data, index 9 = hole 1's data
  const backNine = holeData.slice(9, 18); // holes 10-18 (indices 9-17)
  const frontNine = holeData.slice(0, 9);  // holes 1-9 (indices 0-8)
  return [...backNine, ...frontNine];
}

/**
 * Transform a Map keyed by physical hole to be keyed by playing position
 */
export function transformHoleMapToPlayingOrder<T>(
  holeMap: Map<number, T>,
  startOnBack9: boolean
): Map<number, T> {
  if (!startOnBack9) return holeMap;
  const transformed = new Map<number, T>();
  holeMap.forEach((value, physicalHole) => {
    const playingPosition = physicalToPlayingPosition(physicalHole, startOnBack9);
    transformed.set(playingPosition, value);
  });
  return transformed;
}

/**
 * Transform a NetScoringContext by remapping holeHandicaps to playing order
 */
export function transformNetContextToPlayingOrder(
  netContext: NetScoringContext | null,
  startOnBack9: boolean
): NetScoringContext | null {
  if (!netContext || !startOnBack9) return netContext;
  return {
    ...netContext,
    holeHandicaps: transformHoleMapToPlayingOrder(netContext.holeHandicaps, startOnBack9),
  };
}

interface Score {
  id: number;
  matchId: number;
  playerId: number;
  holeNumber: number;
  strokes: number;
}

function getScoreValue(
  score: Score,
  netContext: NetScoringContext | null
): number {
  return getNetStrokes(score.strokes, score.playerId, score.holeNumber, netContext);
}

interface TeamMember {
  id: number;
  teamId: number;
  playerId: number;
  player?: { id: number; name: string; userId?: string | null };
}

interface Team {
  id: number;
  eventMatchId: number;
  name: string;
  members: TeamMember[];
}

interface EventMatch {
  id: number;
  eventId: number;
  name: string;
  customName?: string | null;
  matchType: string;
  startHole?: number;
  parentMatchId?: number | null;
  autoPressOriginal?: boolean;
  autoPressAllPresses?: boolean;
  autoPressNassauFront9?: boolean;
  autoPressNassauBack9?: boolean;
  autoPressNassauOverall?: boolean;
  useNetScoring?: boolean;
  startOnBack9?: boolean;
  deathMatchBaseBet?: number | null;
  deathMatchBestBallBet?: number | null;
  deathMatchSecondBallBet?: number | null;
  deathMatchFirstPressBet?: number | null;
  deathMatchSubsequentPressBet?: number | null;
  deathMatchSecondBallPressBet?: number | null;
  twoThreeBallTwoBallBet?: number | null;
  twoThreeBallThreeBallBet?: number | null;
  autoPressTwoBallFront9?: boolean;
  autoPressTwoBallBack9?: boolean;
  autoPressTwoBallOverall?: boolean;
  autoPressThreeBallFront9?: boolean;
  autoPressThreeBallBack9?: boolean;
  autoPressThreeBallOverall?: boolean;
  oneTwoThreeBallOneBallBet?: number | null;
  oneTwoThreeBallTwoThirdBallBet?: number | null;
  autoPressOneBallFront9?: boolean;
  autoPressOneBallBack9?: boolean;
  autoPressOneBallOverall?: boolean;
  autoPressTwoThirdBallFront9?: boolean;
  autoPressTwoThirdBallBack9?: boolean;
  autoPressTwoThirdBallOverall?: boolean;
  teams: Team[];
}

export interface HoleResult {
  holeNumber: number;
  teamAScore: number | null;
  teamBScore: number | null;
  winner: 'A' | 'B' | 'tie' | null;
  cumulativeA: number;
  cumulativeB: number;
  status: string;
}

function getTeamHoleScore(
  teamScores: number[],
  matchType: string
): number | null {
  if (teamScores.length === 0) return null;
  
  const sorted = [...teamScores].sort((a, b) => a - b);
  
  if (matchType === 'match_play_2_ball') {
    // 2-ball: sum of lowest 2 scores
    if (sorted.length < 2) {
      // If team has less than 2 scores, use what's available
      return sorted.reduce((sum, s) => sum + s, 0);
    }
    return sorted[0] + sorted[1];
  }
  
  // Default (1-ball): lowest single score
  return sorted[0];
}

export function calculateMatchPlayResults(
  eventMatch: EventMatch,
  scores: Score[],
  netContext: NetScoringContext | null = null
): HoleResult[] {
  const teamA = eventMatch.teams[0];
  const teamB = eventMatch.teams[1];
  const matchType = eventMatch.matchType || 'match_play_1_ball';
  
  const startOnBack9 = eventMatch.startOnBack9 || false;
  const startHole = eventMatch.startHole || 1;

  if (!teamA || !teamB) return [];

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  const results: HoleResult[] = [];
  let cumulativeA = 0;
  let cumulativeB = 0;

  const isStrokePlay = matchType === 'stroke_play';

  // Build the list of holes to iterate in playing order, sliced from press start.
  // When startOnBack9=true, play holes 10-18 first, then 1-9.
  // For press children (startHole > 1) trim everything before the press start in
  // playing order so already-played holes are excluded.
  let holesToPlay: number[];
  if (startOnBack9) {
    const baseOrder = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const idx = startHole > 1 ? baseOrder.indexOf(startHole) : 0;
    holesToPlay = idx >= 0 ? baseOrder.slice(idx) : baseOrder;
  } else {
    holesToPlay = [];
    for (let h = Math.max(1, startHole); h <= 18; h++) {
      holesToPlay.push(h);
    }
  }

  for (const hole of holesToPlay) {
    const teamAScores = scores
      .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
      .map((s) => getScoreValue(s, netContext));
    
    const teamBScores = scores
      .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
      .map((s) => getScoreValue(s, netContext));

    const teamAHoleScore = getTeamHoleScore(teamAScores, matchType);
    const teamBHoleScore = getTeamHoleScore(teamBScores, matchType);

    let winner: 'A' | 'B' | 'tie' | null = null;
    
    if (isStrokePlay) {
      // Stroke play: cumulative tracks total strokes
      if (teamAHoleScore !== null) cumulativeA += teamAHoleScore;
      if (teamBHoleScore !== null) cumulativeB += teamBHoleScore;
      // No per-hole winner in stroke play
    } else {
      // Match play: cumulative tracks holes won
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) {
          winner = 'A';
          cumulativeA++;
        } else if (teamBHoleScore < teamAHoleScore) {
          winner = 'B';
          cumulativeB++;
        } else {
          winner = 'tie';
        }
      }
    }

    let status = 'All Square';
    if (isStrokePlay) {
      const diff = cumulativeA - cumulativeB;
      if (diff < 0) {
        status = `${teamA.name} ${Math.abs(diff)} ahead`;
      } else if (diff > 0) {
        status = `${teamB.name} ${diff} ahead`;
      } else {
        status = 'Tied';
      }
    } else {
      const diff = cumulativeA - cumulativeB;
      if (diff > 0) {
        status = `${teamA.name} ${diff} UP`;
      } else if (diff < 0) {
        status = `${teamB.name} ${Math.abs(diff)} UP`;
      }
    }

    results.push({
      holeNumber: hole,
      teamAScore: teamAHoleScore,
      teamBScore: teamBHoleScore,
      winner,
      cumulativeA,
      cumulativeB,
      status,
    });
  }

  return results;
}

export function getMatchStatus(results: HoleResult[], teamA: Team, teamB: Team, matchType?: string): string {
  const playedHoles = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const lastPlayedHole = playedHoles[playedHoles.length - 1];
  
  if (!lastPlayedHole) return 'Not started';
  
  const isStrokePlay = matchType === 'stroke_play';
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  // Bet window = the hole list this match was scored on (handles press children
  // with startHole > 1 and back-9-first orderings).
  const totalHoles = results.length;
  const holesRemaining = Math.max(0, totalHoles - playedHoles.length);
  
  if (isStrokePlay) {
    // Stroke play: lower total strokes wins
    if (holesRemaining === 0) {
      if (diff < 0) return `${teamA.name} wins by ${Math.abs(diff)}`;
      if (diff > 0) return `${teamB.name} wins by ${diff}`;
      return 'Match tied';
    }
    return lastPlayedHole.status;
  }
  
  // Match play logic
  if (holesRemaining === 0) {
    if (diff > 0) return `${teamA.name} wins ${diff} up`;
    if (diff < 0) return `${teamB.name} wins ${Math.abs(diff)} up`;
    return 'Match halved';
  }
  
  if (Math.abs(diff) > holesRemaining) {
    const winner = diff > 0 ? teamA.name : teamB.name;
    return `${winner} wins ${Math.abs(diff)} & ${holesRemaining}`;
  }
  
  return lastPlayedHole.status;
}

export interface PlayerSettlement {
  playerId: number;
  playerName: string;
  teamName: string;
  amount: number;
}

export interface MatchSettlement {
  isComplete: boolean;
  isTie: boolean;
  winner: 'A' | 'B' | null;
  winningTeamName: string | null;
  settlements: PlayerSettlement[];
  totalPot: number;
  autoPressTriggered?: boolean;
  autoPressMultiplier?: number;
  autoPressReason?: string;
  autoPressNullified?: boolean;
}

export function getMatchWinner(results: HoleResult[], matchType?: string): 'A' | 'B' | 'tie' | null {
  const playedHoles = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const lastPlayedHole = playedHoles[playedHoles.length - 1];
  
  if (!lastPlayedHole) return null;
  
  const isStrokePlay = matchType === 'stroke_play';
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  // Bet window = the hole list this match was scored on (press children may
  // have fewer than 18 holes).
  const totalHoles = results.length;
  const holesRemaining = Math.max(0, totalHoles - playedHoles.length);
  
  if (isStrokePlay) {
    // Stroke play: complete once every hole in the bet window is played
    if (holesRemaining === 0) {
      if (diff < 0) return 'A';
      if (diff > 0) return 'B';
      return 'tie';
    }
    return null;
  }
  
  // Match play logic
  if (holesRemaining === 0) {
    if (diff > 0) return 'A';
    if (diff < 0) return 'B';
    return 'tie';
  }
  
  if (Math.abs(diff) > holesRemaining) {
    return diff > 0 ? 'A' : 'B';
  }
  
  return null;
}

export interface LedgerEntry {
  matchId: number;
  matchName: string;
  playerId: number;
  playerName: string;
  amount: number;
  isComplete: boolean;
  createdAt?: string;
  betType?: string;
  isAutoPress?: boolean;
  pressHole?: number | null;
  teamAMembers?: string[];
  teamBMembers?: string[];
  teamName?: string;
  teamIndex?: number;
  resultText?: string;
  nassauLeg?: 'F9' | 'B9' | 'Ov';
}

export function buildResultText(
  results: HoleResult[],
  winner: 'A' | 'B' | 'tie' | null,
  isComplete: boolean,
  matchType?: string
): string {
  if (results.length === 0) return '';
  const playedHoles = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const lastPlayed = playedHoles[playedHoles.length - 1];
  if (!lastPlayed) return '';

  const diff = lastPlayed.cumulativeA - lastPlayed.cumulativeB;
  const totalHoles = results.length;
  const holesRemaining = Math.max(0, totalHoles - playedHoles.length);

  if (matchType === 'stroke_play') {
    if (!isComplete) return '';
    if (diff === 0) return 'Tied';
    const margin = Math.abs(diff);
    return diff < 0 ? `${margin} Up` : `${margin} Down`;
  }

  if (winner === 'tie') return 'Halved';
  if (winner === null) {
    // In-progress: show current standing
    if (playedHoles.length === 0) return '';
    if (diff > 0) return `${Math.abs(diff)} Up`;
    if (diff < 0) return `${Math.abs(diff)} Down`;
    return 'All Square';
  }

  const absDiff = Math.abs(diff);
  if (holesRemaining > 0 && absDiff > holesRemaining) {
    return diff > 0 ? `${absDiff} & ${holesRemaining}` : `${absDiff} & ${holesRemaining} Down`;
  }
  if (diff > 0) return `${absDiff} Up`;
  if (diff < 0) return `${absDiff} Down`;
  return 'Halved';
}

export interface PlayerBalance {
  playerId: number;
  playerName: string;
  totalWon: number;
  totalLost: number;
  netBalance: number;
  matchesPlayed: number;
}

interface EventMatchWithUnit extends EventMatch {
  unitAmount?: number;
  createdAt?: string;
}

export function calculateLedger(
  eventMatches: EventMatchWithUnit[],
  scores: Score[],
  netContextMap: Map<number, NetScoringContext> | null = null,
  pars: number[] | null = null
): { entries: LedgerEntry[]; balances: PlayerBalance[] } {
  const entries: LedgerEntry[] = [];
  // Use stable key (userId or "guest:name") for aggregation instead of playerId
  const playerTotals: Map<string, { name: string; won: number; lost: number; matches: Set<number>; anyPlayerId: number }> = new Map();
  
  // Build mapping from playerId to stable key and name
  const playerIdToStableKey = new Map<number, string>();
  const playerIdToName = new Map<number, string>();
  
  for (const em of eventMatches) {
    for (const team of em.teams || []) {
      for (const member of team.members || []) {
        const player = member.player;
        if (player) {
          // Normalize guest names: lowercase and trim for consistent matching
          const normalizedName = player.name.toLowerCase().trim();
          const stableKey = player.userId || `guest:${normalizedName}`;
          playerIdToStableKey.set(member.playerId, stableKey);
          playerIdToName.set(member.playerId, player.name);
        }
      }
    }
  }

  for (const em of eventMatches) {
    const teamA = em.teams[0];
    const teamB = em.teams[1];
    if (!teamA || !teamB) continue;

    const shouldAutoPress = em.autoPressOriginal ?? true;

    // Helper to get team member names
    const teamAMembers = teamA.members.map(m => m.player?.name || `Player ${m.playerId}`);
    const teamBMembers = teamB.members.map(m => m.player?.name || `Player ${m.playerId}`);
    const pressHole = em.startHole && em.startHole > 1 ? em.startHole : null;
    // Display label: parent bets keep their stored name; presses become
    // "Press (H#)" with the optional custom label appended.
    const emDisplayName = em.parentMatchId
      ? `Press (H${em.startHole ?? 1})${em.customName ? ` · ${em.customName}` : ''}`
      : em.name;

    if (em.matchType === 'skins') {
      // Skins match - use teamA to get the included player IDs
      const includedPlayerIds = teamA.members.map(m => m.playerId);
      const playerNames = new Map<number, string>();
      for (const member of teamA.members) {
        playerNames.set(member.playerId, member.player?.name || `Player ${member.playerId}`);
      }
      
      // Transform scores and netContext to playing order when startOnBack9 is enabled
      const startOnBack9 = em.startOnBack9 || false;
      const transformedScores = transformScoresToPlayingOrder(scores, startOnBack9);
      // Guard against null pars - provide default pars of 4 for each hole if not available
      const safePars = pars || Array(18).fill(4);
      const transformedPars = transformHoleDataToPlayingOrder(safePars.map((par, i) => ({ holeNumber: i + 1, par })), startOnBack9).map(h => h.par);
      
      // Only use netContext if this specific event match has useNetScoring enabled
      const skinsNetContextRaw = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      const skinsNetContext = transformNetContextToPlayingOrder(skinsNetContextRaw, startOnBack9);
      // For press children, only count holes from press start onward.
      // (When startOnBack9 is on, startHole is still a physical hole number; convert to
      //  playing position so it lines up with already-transformed scores.)
      // For parent rounds (no startHole / startHole === 1), pass 1 to keep all 18 holes.
      const physicalStartHole = em.parentMatchId && em.startHole && em.startHole > 1 ? em.startHole : 1;
      const skinsStartHole = physicalStartHole > 1 && startOnBack9
        ? physicalToPlayingPosition(physicalStartHole, true)
        : physicalStartHole;
      const skinsResult = calculateSkinsResults(includedPlayerIds, playerNames, transformedScores, (em.unitAmount || 0) / 100, skinsNetContext, transformedPars, skinsStartHole);
      
      for (const s of skinsResult.settlements) {
        entries.push({
          matchId: em.id,
          matchName: emDisplayName,
          playerId: s.playerId,
          playerName: s.playerName,
          amount: s.amount,
          isComplete: skinsResult.isComplete,
          createdAt: em.createdAt,
          betType: 'Skins',
          isAutoPress: false,
          pressHole,
          teamAMembers,
          teamBMembers,
          teamName: undefined, // Skins is individual, no team
          teamIndex: 0,
        });

        if (skinsResult.isComplete) {
          const stableKey = playerIdToStableKey.get(s.playerId) || `guest:${s.playerName.toLowerCase().trim()}`;
          const existing = playerTotals.get(stableKey) || { name: s.playerName, won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: s.playerId };
          if (s.amount > 0) {
            existing.won += s.amount;
          } else if (s.amount < 0) {
            existing.lost += Math.abs(s.amount);
          }
          existing.matches.add(em.id);
          playerTotals.set(stableKey, existing);
        }
      }
    } else if (em.matchType === 'nassau') {
      // calculateNassauResults now handles startOnBack9 internally - pass original scores
      const nassauNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      
      const nassauResults = calculateNassauResults(em, scores, nassauNetContext);
      const nassauAutoPressSettings = {
        front9: em.autoPressNassauFront9 ?? true,
        back9: em.autoPressNassauBack9 ?? true,
        overall: em.autoPressNassauOverall ?? true,
      };
      // No longer need to pass startOnBack9 to settlements since scores are already in playing order
      const nassauSettlements = calculateNassauSettlements(em.unitAmount || 0, teamA, teamB, nassauResults, nassauAutoPressSettings);
      
      // Build player ID to team index lookup
      const playerTeamIndex = new Map<number, number>();
      for (const m of teamA.members) playerTeamIndex.set(m.playerId, 0);
      for (const m of teamB.members) playerTeamIndex.set(m.playerId, 1);
      
      const nassauResultsByLeg: Record<string, HoleResult[]> = {
        'Front 9': nassauResults.front9,
        'Back 9': nassauResults.back9,
        'Overall': nassauResults.overall,
      };
      const nassauLegMap: Record<string, 'F9' | 'B9' | 'Ov'> = {
        'Front 9': 'F9',
        'Back 9': 'B9',
        'Overall': 'Ov',
      };

      for (const ns of nassauSettlements) {
        const legResults = nassauResultsByLeg[ns.betName] ?? [];
        const nassauWinner = ns.settlement.winner ?? (ns.settlement.isTie ? 'tie' : null);
        const legResultText = buildResultText(legResults, nassauWinner, ns.settlement.isComplete);
        const nassauLeg = nassauLegMap[ns.betName];
        for (const s of ns.settlement.settlements) {
          const teamIdx = playerTeamIndex.get(s.playerId) ?? (s.teamName === teamA.name ? 0 : 1);
          entries.push({
            matchId: em.id,
            matchName: `${emDisplayName} - ${ns.betName}`,
            playerId: s.playerId,
            playerName: s.playerName,
            amount: s.amount,
            isComplete: ns.settlement.isComplete,
            createdAt: em.createdAt,
            betType: ns.betName,
            isAutoPress: ns.autoPressTriggered || false,
            pressHole,
            teamAMembers,
            teamBMembers,
            teamName: s.teamName,
            teamIndex: teamIdx,
            resultText: legResultText || undefined,
            nassauLeg,
          });

          if (ns.settlement.isComplete) {
            const stableKey = playerIdToStableKey.get(s.playerId) || `guest:${s.playerName.toLowerCase().trim()}`;
            const existing = playerTotals.get(stableKey) || { name: s.playerName, won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: s.playerId };
            if (s.amount > 0) {
              existing.won += s.amount;
            } else if (s.amount < 0) {
              existing.lost += Math.abs(s.amount);
            }
            existing.matches.add(em.id);
            playerTotals.set(stableKey, existing);
          }
        }
      }
    } else if (em.matchType === 'five_five_five_three') {
      // 5-5-5-3 match - only process if complete to avoid $0 entries
      const fiveNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      const fiveResult = calculateFiveMatchResults(em, scores, fiveNetContext);
      
      // Skip incomplete matches entirely to avoid $0 ledger entries
      if (!fiveResult.isComplete) continue;
      
      const unitAmt = (em.unitAmount || 100) / 100;
      const fiveSettlements = calculateFiveSettlements(fiveResult.teamTotals, unitAmt, fiveResult.isComplete, fiveResult.largestTeamSize);
      
      // For 5-5-5-3, we need to distribute team settlements to individual players
      // Each player on a team gets an equal share of their team's settlement
      for (const teamSettlement of fiveSettlements) {
        const team = em.teams.find((_, idx) => idx === teamSettlement.teamIndex);
        if (!team) continue;
        
        const teamSize = team.members.length;
        const perPlayerAmount = teamSize > 0 ? teamSettlement.amount / teamSize : 0;
        
        for (const member of team.members) {
          const playerName = member.player?.name || `Player ${member.playerId}`;
          const teamIdx = teamSettlement.teamIndex;
          
          entries.push({
            matchId: em.id,
            matchName: emDisplayName,
            playerId: member.playerId,
            playerName: playerName,
            amount: Math.round(perPlayerAmount * 100) / 100,
            isComplete: true,
            createdAt: em.createdAt,
            betType: '5-5-5-3',
            isAutoPress: false,
            pressHole,
            teamAMembers,
            teamBMembers,
            teamName: teamIdx === 0 ? teamA.name : teamB.name,
            teamIndex: teamIdx,
          });

          const stableKey = playerIdToStableKey.get(member.playerId) || `guest:${playerName.toLowerCase().trim()}`;
          const existing = playerTotals.get(stableKey) || { name: playerName, won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: member.playerId };
          if (perPlayerAmount > 0) {
            existing.won += perPlayerAmount;
          } else if (perPlayerAmount < 0) {
            existing.lost += Math.abs(perPlayerAmount);
          }
          existing.matches.add(em.id);
          playerTotals.set(stableKey, existing);
        }
      }
    } else if (em.matchType === 'death_match') {
      const dmNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      const dmResults = calculateDeathMatchResults(em, scores, dmNetContext);

      const bestBallBetCents = em.deathMatchBestBallBet || em.unitAmount || 0;
      const secondBallBetCents = em.deathMatchSecondBallBet || Math.round((em.unitAmount || 0) / 2);
      const bestBallBet = bestBallBetCents / 100;
      const secondBallBet = secondBallBetCents / 100;

      const dmPlayerTeamIndex = new Map<number, number>();
      for (const m of teamA.members) dmPlayerTeamIndex.set(m.playerId, 0);
      for (const m of teamB.members) dmPlayerTeamIndex.set(m.playerId, 1);

      const addDeathMatchSettlement = (
        betType: string, winner: 'A' | 'B' | 'tie' | null, isComplete: boolean, betAmount: number, results: HoleResult[]
      ) => {
        const dmResultText = buildResultText(results, winner, isComplete) || undefined;

        if (!isComplete || winner === null) {
          for (const m of [...teamA.members, ...teamB.members]) {
            entries.push({
              matchId: em.id,
              matchName: emDisplayName,
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              amount: 0,
              isComplete: false,
              createdAt: em.createdAt,
              betType,
              isAutoPress: false,
              pressHole,
              teamAMembers,
              teamBMembers,
              teamName: teamA.members.some(tm => tm.playerId === m.playerId) ? teamA.name : teamB.name,
              teamIndex: dmPlayerTeamIndex.get(m.playerId) ?? 0,
              resultText: dmResultText,
            });
          }
          return;
        }

        const winTeam = winner === 'A' ? teamA : teamB;
        const loseTeam = winner === 'A' ? teamB : teamA;

        if (winner === 'tie') {
          for (const m of [...teamA.members, ...teamB.members]) {
            const teamIdx = dmPlayerTeamIndex.get(m.playerId) ?? 0;
            entries.push({
              matchId: em.id,
              matchName: emDisplayName,
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              amount: 0,
              isComplete: true,
              createdAt: em.createdAt,
              betType,
              isAutoPress: false,
              pressHole,
              teamAMembers,
              teamBMembers,
              teamName: teamIdx === 0 ? teamA.name : teamB.name,
              teamIndex: teamIdx,
              resultText: dmResultText,
            });
          }
          return;
        }

        for (const m of winTeam.members) {
          const teamIdx = dmPlayerTeamIndex.get(m.playerId) ?? 0;
          entries.push({
            matchId: em.id,
            matchName: emDisplayName,
            playerId: m.playerId,
            playerName: m.player?.name || `Player ${m.playerId}`,
            amount: betAmount,
            isComplete: true,
            createdAt: em.createdAt,
            betType,
            isAutoPress: false,
            pressHole,
            teamAMembers,
            teamBMembers,
            teamName: teamIdx === 0 ? teamA.name : teamB.name,
            teamIndex: teamIdx,
            resultText: dmResultText,
          });

          if (isComplete) {
            const stableKey = playerIdToStableKey.get(m.playerId) || `guest:${(m.player?.name || '').toLowerCase().trim()}`;
            const existing = playerTotals.get(stableKey) || { name: m.player?.name || '', won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: m.playerId };
            existing.won += betAmount;
            existing.matches.add(em.id);
            playerTotals.set(stableKey, existing);
          }
        }

        for (const m of loseTeam.members) {
          const teamIdx = dmPlayerTeamIndex.get(m.playerId) ?? 0;
          entries.push({
            matchId: em.id,
            matchName: emDisplayName,
            playerId: m.playerId,
            playerName: m.player?.name || `Player ${m.playerId}`,
            amount: -betAmount,
            isComplete: true,
            createdAt: em.createdAt,
            betType,
            isAutoPress: false,
            pressHole,
            teamAMembers,
            teamBMembers,
            teamName: teamIdx === 0 ? teamA.name : teamB.name,
            teamIndex: teamIdx,
            resultText: dmResultText,
          });

          if (isComplete) {
            const stableKey = playerIdToStableKey.get(m.playerId) || `guest:${(m.player?.name || '').toLowerCase().trim()}`;
            const existing = playerTotals.get(stableKey) || { name: m.player?.name || '', won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: m.playerId };
            existing.lost += betAmount;
            existing.matches.add(em.id);
            playerTotals.set(stableKey, existing);
          }
        }
      };

      addDeathMatchSettlement('Best Ball', dmResults.bestBall.winner, dmResults.bestBall.isComplete, bestBallBet, dmResults.bestBall.results);
      addDeathMatchSettlement('2nd Ball', dmResults.secondBall.winner, dmResults.secondBall.isComplete, secondBallBet, dmResults.secondBall.results);
    } else if (em.matchType === 'two_three_ball') {
      const ttbNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      const ttbResults = calculateTwoThreeBallResults(em, scores, ttbNetContext);

      const twoBallBetCents = em.twoThreeBallTwoBallBet ?? em.unitAmount ?? 0;
      const threeBallBetCents = em.twoThreeBallThreeBallBet ?? em.unitAmount ?? 0;

      const twoBallAutoPress = {
        front9: em.autoPressTwoBallFront9 ?? true,
        back9: em.autoPressTwoBallBack9 ?? true,
        overall: em.autoPressTwoBallOverall ?? true,
      };
      const threeBallAutoPress = {
        front9: em.autoPressThreeBallFront9 ?? true,
        back9: em.autoPressThreeBallBack9 ?? true,
        overall: em.autoPressThreeBallOverall ?? true,
      };

      const twoBallSettlements = calculateNassauSettlements(twoBallBetCents, teamA, teamB, ttbResults.twoBall, twoBallAutoPress);
      const threeBallSettlements = calculateNassauSettlements(threeBallBetCents, teamA, teamB, ttbResults.threeBall, threeBallAutoPress);

      const ttbPlayerTeamIndex = new Map<number, number>();
      for (const m of teamA.members) ttbPlayerTeamIndex.set(m.playerId, 0);
      for (const m of teamB.members) ttbPlayerTeamIndex.set(m.playerId, 1);

      const getLegHoles = (legResults: NassauResults, betName: string): HoleResult[] => {
        if (betName.includes('Front 9') || betName.startsWith('F9')) return legResults.front9;
        if (betName.includes('Back 9') || betName.startsWith('B9')) return legResults.back9;
        return legResults.overall;
      };

      const emit = (prefix: '2 Ball' | '3rd Ball', settlements: NassauSettlement[], legResults: NassauResults) => {
        for (const ns of settlements) {
          const betLabel = `${prefix} – ${ns.betName}`;
          const legHoles = getLegHoles(legResults, ns.betName);
          const legResultText = buildResultText(legHoles, ns.settlement.winner, ns.settlement.isComplete) || undefined;
          for (const s of ns.settlement.settlements) {
            const teamIdx = ttbPlayerTeamIndex.get(s.playerId) ?? (s.teamName === teamA.name ? 0 : 1);
            entries.push({
              matchId: em.id,
              matchName: `${emDisplayName} - ${betLabel}`,
              playerId: s.playerId,
              playerName: s.playerName,
              amount: s.amount,
              isComplete: ns.settlement.isComplete,
              createdAt: em.createdAt,
              betType: betLabel,
              isAutoPress: ns.autoPressTriggered || false,
              pressHole,
              teamAMembers,
              teamBMembers,
              teamName: s.teamName,
              teamIndex: teamIdx,
              resultText: legResultText,
            });

            if (ns.settlement.isComplete) {
              const stableKey = playerIdToStableKey.get(s.playerId) || `guest:${s.playerName.toLowerCase().trim()}`;
              const existing = playerTotals.get(stableKey) || { name: s.playerName, won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: s.playerId };
              if (s.amount > 0) existing.won += s.amount;
              else if (s.amount < 0) existing.lost += Math.abs(s.amount);
              existing.matches.add(em.id);
              playerTotals.set(stableKey, existing);
            }
          }
        }
      };

      emit('2 Ball', twoBallSettlements, ttbResults.twoBall);
      emit('3rd Ball', threeBallSettlements, ttbResults.threeBall);
    } else if (em.matchType === 'one_two_three_ball') {
      const otzbNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      const otzbResults = calculateOneTwoThreeBallResults(em, scores, otzbNetContext);

      const oneBallBetCents = em.oneTwoThreeBallOneBallBet ?? em.unitAmount ?? 0;
      const twoThirdBallBetCents = em.oneTwoThreeBallTwoThirdBallBet ?? em.unitAmount ?? 0;

      const oneBallAutoPress = {
        front9: em.autoPressOneBallFront9 ?? true,
        back9: em.autoPressOneBallBack9 ?? true,
        overall: em.autoPressOneBallOverall ?? true,
      };
      const twoThirdBallAutoPress = {
        front9: em.autoPressTwoThirdBallFront9 ?? true,
        back9: em.autoPressTwoThirdBallBack9 ?? true,
        overall: em.autoPressTwoThirdBallOverall ?? true,
      };

      const oneBallSettlements = calculateNassauSettlements(oneBallBetCents, teamA, teamB, otzbResults.oneBall, oneBallAutoPress);
      const twoThirdBallSettlements = calculateNassauSettlements(twoThirdBallBetCents, teamA, teamB, otzbResults.twoThirdBall, twoThirdBallAutoPress);

      const otzbPlayerTeamIndex = new Map<number, number>();
      for (const m of teamA.members) otzbPlayerTeamIndex.set(m.playerId, 0);
      for (const m of teamB.members) otzbPlayerTeamIndex.set(m.playerId, 1);

      const getLegHolesOtzb = (legResults: NassauResults, betName: string): HoleResult[] => {
        if (betName.includes('Front 9') || betName.startsWith('F9')) return legResults.front9;
        if (betName.includes('Back 9') || betName.startsWith('B9')) return legResults.back9;
        return legResults.overall;
      };

      const emitOtzb = (prefix: '1 Ball' | '2nd3rd Ball', settlements: NassauSettlement[], legResults: NassauResults) => {
        for (const ns of settlements) {
          const betLabel = `${prefix} – ${ns.betName}`;
          const legHoles = getLegHolesOtzb(legResults, ns.betName);
          const legResultText = buildResultText(legHoles, ns.settlement.winner, ns.settlement.isComplete) || undefined;
          for (const s of ns.settlement.settlements) {
            const teamIdx = otzbPlayerTeamIndex.get(s.playerId) ?? (s.teamName === teamA.name ? 0 : 1);
            entries.push({
              matchId: em.id,
              matchName: `${emDisplayName} - ${betLabel}`,
              playerId: s.playerId,
              playerName: s.playerName,
              amount: s.amount,
              isComplete: ns.settlement.isComplete,
              createdAt: em.createdAt,
              betType: betLabel,
              isAutoPress: ns.autoPressTriggered || false,
              pressHole,
              teamAMembers,
              teamBMembers,
              teamName: s.teamName,
              teamIndex: teamIdx,
              resultText: legResultText,
            });

            if (ns.settlement.isComplete) {
              const stableKey = playerIdToStableKey.get(s.playerId) || `guest:${s.playerName.toLowerCase().trim()}`;
              const existing = playerTotals.get(stableKey) || { name: s.playerName, won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: s.playerId };
              if (s.amount > 0) existing.won += s.amount;
              else if (s.amount < 0) existing.lost += Math.abs(s.amount);
              existing.matches.add(em.id);
              playerTotals.set(stableKey, existing);
            }
          }
        }
      };

      emitOtzb('1 Ball', oneBallSettlements, otzbResults.oneBall);
      emitOtzb('2nd3rd Ball', twoThirdBallSettlements, otzbResults.twoThirdBall);
    } else {
      // calculateMatchPlayResults now handles startOnBack9 internally - pass original scores
      const matchPlayNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null;
      
      const results = calculateMatchPlayResults(em, scores, matchPlayNetContext);
      const settlement = calculateBetSettlements(em.unitAmount || 0, teamA, teamB, results, em.matchType, shouldAutoPress);
      
      // Determine if auto press was triggered (check if settlement total is doubled)
      const wasAutoPress = shouldAutoPress && settlement.totalPot > ((em.unitAmount || 0) / 100) * Math.max(teamA.members.length, teamB.members.length);
      
      // Get a friendly bet type name
      let betTypeName = 'Match Play';
      if (em.matchType === 'stroke_play') betTypeName = 'Stroke Play';
      else if (em.matchType === 'match_play_2_ball') betTypeName = 'Match Play (2-Ball)';

      // Build player ID to team index lookup for match play
      const matchPlayerTeamIndex = new Map<number, number>();
      for (const m of teamA.members) matchPlayerTeamIndex.set(m.playerId, 0);
      for (const m of teamB.members) matchPlayerTeamIndex.set(m.playerId, 1);
      
      const matchWinner = settlement.winner ?? (settlement.isTie ? 'tie' : null);
      const matchResultText = buildResultText(results, matchWinner, settlement.isComplete, em.matchType);

      for (const s of settlement.settlements) {
        const teamIdx = matchPlayerTeamIndex.get(s.playerId) ?? (s.teamName === teamA.name ? 0 : 1);
        entries.push({
          matchId: em.id,
          matchName: emDisplayName,
          playerId: s.playerId,
          playerName: s.playerName,
          amount: s.amount,
          isComplete: settlement.isComplete,
          createdAt: em.createdAt,
          betType: betTypeName,
          isAutoPress: wasAutoPress,
          pressHole,
          teamAMembers,
          teamBMembers,
          teamName: s.teamName,
          teamIndex: teamIdx,
          resultText: matchResultText || undefined,
        });

        if (settlement.isComplete) {
          const stableKey = playerIdToStableKey.get(s.playerId) || `guest:${s.playerName.toLowerCase().trim()}`;
          const existing = playerTotals.get(stableKey) || { name: s.playerName, won: 0, lost: 0, matches: new Set<number>(), anyPlayerId: s.playerId };
          if (s.amount > 0) {
            existing.won += s.amount;
          } else if (s.amount < 0) {
            existing.lost += Math.abs(s.amount);
          }
          existing.matches.add(em.id);
          playerTotals.set(stableKey, existing);
        }
      }
    }
  }

  const balances: PlayerBalance[] = Array.from(playerTotals.entries()).map(([_stableKey, data]) => ({
    playerId: data.anyPlayerId,
    playerName: data.name,
    totalWon: Math.round(data.won * 100) / 100,
    totalLost: Math.round(data.lost * 100) / 100,
    netBalance: Math.round((data.won - data.lost) * 100) / 100,
    matchesPlayed: data.matches.size,
  }));

  balances.sort((a, b) => b.netBalance - a.netBalance);

  return { entries, balances };
}

export function calculateBetSettlements(
  unitAmountCents: number,
  teamA: Team,
  teamB: Team,
  results: HoleResult[],
  matchType?: string,
  autoPress?: boolean
): MatchSettlement {
  const winner = getMatchWinner(results, matchType);
  let unitAmount = unitAmountCents / 100;
  
  const teamASize = teamA.members.length;
  const teamBSize = teamB.members.length;
  const maxTeamSize = Math.max(teamASize, teamBSize);
  
  // Auto Press logic: check if one team was 2+ down going into the final hole
  let autoPressMultiplier = 1;
  let autoPressNullified = false;
  let autoPressTriggered = false;
  let autoPressReason: string | undefined;

  if (autoPress && results.length >= 2 && matchType !== 'stroke_play') {
    // Get played holes with scores (in playing order)
    const playedHoles = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);

    // Auto-press fires when the bet's full hole range has been played and has at
    // least 2 holes. For a parent Match Play bet that's all 18 holes (2-up at
    // hole 17 → press on hole 18). For a manual press child (results.length < 18,
    // e.g. holes 5..18) it's the press's own closing hole (2-up at the press's
    // second-to-last hole → press on the press's final hole).
    if (playedHoles.length === results.length && playedHoles.length >= 2) {
      // Get the second-to-last and last played holes (by position, not physical number)
      const secondToLastHole = playedHoles[playedHoles.length - 2];
      const lastHole = playedHoles[playedHoles.length - 1];
      
      if (secondToLastHole && lastHole) {
        const statusBeforeLast = secondToLastHole.cumulativeA - secondToLastHole.cumulativeB;
        
        // Check if either team was 2+ down going into the final hole
        if (Math.abs(statusBeforeLast) >= 2) {
          autoPressTriggered = true;
          const leaderBeforeLast = statusBeforeLast > 0 ? 'A' : 'B';
          const leaderName = leaderBeforeLast === 'A' ? teamA.name : teamB.name;
          const lead = Math.abs(statusBeforeLast);
          const lastHoleWinner = lastHole.winner;

          if (lastHoleWinner === leaderBeforeLast) {
            autoPressMultiplier = 2;
            autoPressReason = `${leaderName} was ${lead} UP at hole ${secondToLastHole.holeNumber} and won hole ${lastHole.holeNumber} → 2× pot`;
          } else if (lastHoleWinner === 'tie') {
            autoPressMultiplier = 1;
            autoPressReason = `${leaderName} was ${lead} UP at hole ${secondToLastHole.holeNumber} and tied hole ${lastHole.holeNumber} → no auto-press`;
          } else {
            autoPressNullified = true;
            autoPressReason = `${leaderName} was ${lead} UP at hole ${secondToLastHole.holeNumber} but lost hole ${lastHole.holeNumber} → press nullified`;
          }
        }
      }
    }
  }
  
  const totalPot = unitAmount * maxTeamSize * autoPressMultiplier;
  const autoPressMeta = { autoPressTriggered, autoPressMultiplier, autoPressReason };

  if (winner === null) {
    return {
      isComplete: false,
      isTie: false,
      winner: null,
      winningTeamName: null,
      settlements: [],
      totalPot: unitAmount * maxTeamSize,
      ...autoPressMeta,
    };
  }
  
  // If auto press nullified the bet, treat as a push
  if (autoPressNullified) {
    return {
      isComplete: true,
      isTie: true,
      winner: null,
      winningTeamName: null,
      settlements: [
        ...teamA.members.map((m) => ({
          playerId: m.playerId,
          playerName: m.player?.name || `Player ${m.playerId}`,
          teamName: teamA.name,
          amount: 0,
        })),
        ...teamB.members.map((m) => ({
          playerId: m.playerId,
          playerName: m.player?.name || `Player ${m.playerId}`,
          teamName: teamB.name,
          amount: 0,
        })),
      ],
      totalPot,
      ...autoPressMeta,
      autoPressNullified: true,
    };
  }
  
  if (winner === 'tie') {
    return {
      isComplete: true,
      isTie: true,
      winner: null,
      winningTeamName: null,
      settlements: [
        ...teamA.members.map((m) => ({
          playerId: m.playerId,
          playerName: m.player?.name || `Player ${m.playerId}`,
          teamName: teamA.name,
          amount: 0,
        })),
        ...teamB.members.map((m) => ({
          playerId: m.playerId,
          playerName: m.player?.name || `Player ${m.playerId}`,
          teamName: teamB.name,
          amount: 0,
        })),
      ],
      totalPot,
      ...autoPressMeta,
    };
  }
  
  const winningTeam = winner === 'A' ? teamA : teamB;
  const losingTeam = winner === 'A' ? teamB : teamA;
  
  const winningTeamSize = winningTeam.members.length;
  const losingTeamSize = losingTeam.members.length;
  
  // Apply auto press multiplier to amounts
  const effectiveUnitAmount = unitAmount * autoPressMultiplier;
  const effectiveTotalPot = effectiveUnitAmount * maxTeamSize;
  
  let winAmount: number;
  let loseAmount: number;
  
  if (winningTeamSize >= losingTeamSize) {
    winAmount = effectiveUnitAmount;
    loseAmount = effectiveTotalPot / losingTeamSize;
  } else {
    winAmount = effectiveTotalPot / winningTeamSize;
    loseAmount = effectiveUnitAmount;
  }
  
  const settlements: PlayerSettlement[] = [
    ...winningTeam.members.map((m) => ({
      playerId: m.playerId,
      playerName: m.player?.name || `Player ${m.playerId}`,
      teamName: winningTeam.name,
      amount: Math.round(winAmount * 100) / 100,
    })),
    ...losingTeam.members.map((m) => ({
      playerId: m.playerId,
      playerName: m.player?.name || `Player ${m.playerId}`,
      teamName: losingTeam.name,
      amount: -Math.round(loseAmount * 100) / 100,
    })),
  ];
  
  return {
    isComplete: true,
    isTie: false,
    winner,
    winningTeamName: winningTeam.name,
    settlements,
    totalPot: effectiveTotalPot,
    ...autoPressMeta,
  };
}

export interface SettlementLineItem {
  key: string;
  matchId: number;
  isPress: boolean;
  pressStartHole?: number;
  pressLabel?: string;
  betName: string;
  baseWager: number;
  autoPressTriggered: boolean;
  autoPressMultiplier: number;
  autoPressReason?: string;
  autoPressNullified: boolean;
  finalPot: number;
  isComplete: boolean;
  winnerLabel: string;
  playerSettlements: PlayerSettlement[];
}

export interface CombinedSettlement {
  totalPot: number;
  allComplete: boolean;
  completedCount: number;
  totalMatches: number;
  playerTotals: { playerId: number; playerName: string; amount: number }[];
  lineItems: SettlementLineItem[];
}

export function calculateCombinedMatchSettlements(
  parentMatch: EventMatchWithUnit,
  pressMatches: EventMatchWithUnit[],
  scores: Score[],
  netContext: NetScoringContext | null = null
): CombinedSettlement {
  const allMatches = [parentMatch, ...pressMatches];
  const playerAmounts: Map<number, { name: string; amount: number }> = new Map();
  let totalPot = 0;
  let completedCount = 0;
  let totalBets = 0;
  const lineItems: SettlementLineItem[] = [];

  const winnerLabelFor = (settlement: MatchSettlement, teamAName: string, teamBName: string): string => {
    if (!settlement.isComplete) return 'In progress';
    if (settlement.autoPressNullified) return 'Push (auto-press nullified)';
    if (settlement.isTie) return 'Tied';
    if (settlement.winner === 'A') return `${teamAName} wins`;
    if (settlement.winner === 'B') return `${teamBName} wins`;
    return '—';
  };

  const buildLineItem = (
    match: EventMatchWithUnit,
    betName: string,
    baseWager: number,
    settlement: MatchSettlement,
    teamA: Team,
    teamB: Team,
    keySuffix: string,
  ): SettlementLineItem => {
    const isPress = !!match.parentMatchId;
    const pressStartHole = isPress ? (match.startHole ?? 1) : undefined;
    return {
      key: `${match.id}-${keySuffix}`,
      matchId: match.id,
      isPress,
      pressStartHole,
      pressLabel: isPress ? `Press (H${pressStartHole})${match.customName ? ` · ${match.customName}` : ''}` : undefined,
      betName,
      baseWager,
      autoPressTriggered: !!settlement.autoPressTriggered,
      autoPressMultiplier: settlement.autoPressMultiplier ?? 1,
      autoPressReason: settlement.autoPressReason,
      autoPressNullified: !!settlement.autoPressNullified,
      finalPot: Math.round(settlement.totalPot * 100) / 100,
      isComplete: settlement.isComplete,
      winnerLabel: winnerLabelFor(settlement, teamA.name, teamB.name),
      playerSettlements: settlement.settlements,
    };
  };

  for (const match of allMatches) {
    const teamA = match.teams[0];
    const teamB = match.teams[1];
    if (!teamA || !teamB) continue;

    if (match.matchType === 'nassau') {
      // Nassau has 3 bets
      totalBets += 3;
      // calculateNassauResults now handles startOnBack9 internally - pass original scores
      const nassauResults = calculateNassauResults(match, scores, netContext);
      const nassauAutoPressSettings = {
        front9: match.autoPressNassauFront9 ?? true,
        back9: match.autoPressNassauBack9 ?? true,
        overall: match.autoPressNassauOverall ?? true,
      };
      const nassauSettlements = calculateNassauSettlements(
        match.unitAmount || 0,
        teamA,
        teamB,
        nassauResults,
        nassauAutoPressSettings
      );

      for (const ns of nassauSettlements) {
        totalPot += ns.settlement.totalPot;
        if (ns.settlement.isComplete) {
          completedCount++;
          for (const s of ns.settlement.settlements) {
            const existing = playerAmounts.get(s.playerId) || { name: s.playerName, amount: 0 };
            existing.amount += s.amount;
            playerAmounts.set(s.playerId, existing);
          }
        }
        lineItems.push(buildLineItem(
          match,
          ns.betName,
          (match.unitAmount || 0) / 100,
          ns.settlement,
          teamA,
          teamB,
          `nassau-${ns.betName}`,
        ));
      }
    } else if (match.matchType === 'death_match') {
      totalBets += 2;
      const dmResults = calculateDeathMatchResults(match, scores, netContext);
      const bestBallBet = (match.deathMatchBestBallBet || match.unitAmount || 0) / 100;
      const secondBallBet = (match.deathMatchSecondBallBet || Math.round((match.unitAmount || 0) / 2)) / 100;

      const processDeathBet = (
        label: string,
        winner: 'A' | 'B' | 'tie' | null,
        isComplete: boolean,
        betAmount: number,
      ) => {
        const maxSize = Math.max(teamA.members.length, teamB.members.length);
        const pot = betAmount * maxSize;
        totalPot += pot;
        const playerSettlements: PlayerSettlement[] = [];
        if (isComplete && winner !== null && winner !== 'tie') {
          completedCount++;
          const winTeam = winner === 'A' ? teamA : teamB;
          const loseTeam = winner === 'A' ? teamB : teamA;
          for (const m of winTeam.members) {
            const existing = playerAmounts.get(m.playerId) || { name: m.player?.name || '', amount: 0 };
            existing.amount += betAmount;
            playerAmounts.set(m.playerId, existing);
            playerSettlements.push({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: winTeam.name,
              amount: betAmount,
            });
          }
          for (const m of loseTeam.members) {
            const existing = playerAmounts.get(m.playerId) || { name: m.player?.name || '', amount: 0 };
            existing.amount -= betAmount;
            playerAmounts.set(m.playerId, existing);
            playerSettlements.push({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: loseTeam.name,
              amount: -betAmount,
            });
          }
        } else if (isComplete && winner === 'tie') {
          completedCount++;
        }
        const settlement: MatchSettlement = {
          isComplete,
          isTie: winner === 'tie',
          winner: winner === 'A' || winner === 'B' ? winner : null,
          winningTeamName: winner === 'A' ? teamA.name : winner === 'B' ? teamB.name : null,
          settlements: playerSettlements,
          totalPot: pot,
        };
        lineItems.push(buildLineItem(
          match,
          label,
          betAmount,
          settlement,
          teamA,
          teamB,
          `death-${label.replace(/\s+/g, '-').toLowerCase()}`,
        ));
      };

      processDeathBet('Best Ball', dmResults.bestBall.winner, dmResults.bestBall.isComplete, bestBallBet);
      processDeathBet('Second Ball', dmResults.secondBall.winner, dmResults.secondBall.isComplete, secondBallBet);
    } else if (match.matchType === 'skins') {
      // Skins: one match = one bet. Skins matches store the same player set in
      // both teams; dedupe so the calculator does not see duplicate scores per
      // hole. The wager pot is the buy-in pool (numPlayers * unitAmount).
      totalBets += 1;
      const includedPlayerIds = Array.from(new Set([
        ...teamA.members.map(m => m.playerId),
        ...teamB.members.map(m => m.playerId),
      ]));
      const playerNames = new Map<number, string>();
      [...teamA.members, ...teamB.members].forEach(m => {
        playerNames.set(m.playerId, m.player?.name || `Player ${m.playerId}`);
      });
      const unitAmount = (match.unitAmount || 0) / 100;
      const skinsRes = calculateSkinsResults(
        includedPlayerIds,
        playerNames,
        scores,
        unitAmount,
        netContext,
        null,
        match.parentMatchId ? (match.startHole ?? 1) : 1,
        match.startOnBack9 || false,
      );

      totalPot += skinsRes.totalPool;

      const playerSettlements: PlayerSettlement[] = skinsRes.settlements.map(s => ({
        playerId: s.playerId,
        playerName: s.playerName,
        teamName: '',
        amount: s.amount,
      }));

      if (skinsRes.isComplete) {
        completedCount++;
        for (const s of skinsRes.settlements) {
          const existing = playerAmounts.get(s.playerId) || { name: s.playerName, amount: 0 };
          existing.amount += s.amount;
          playerAmounts.set(s.playerId, existing);
        }
      }

      let winnerLabel: string;
      if (!skinsRes.isComplete) {
        const wonSoFar = skinsRes.holeResults.filter(h => h.isSkin).length;
        winnerLabel = wonSoFar > 0
          ? `${wonSoFar} skin${wonSoFar === 1 ? '' : 's'} so far`
          : 'In progress';
      } else if (skinsRes.totalSkins === 0) {
        winnerLabel = 'No skins won — buy-ins refunded';
      } else {
        const winners = [...skinsRes.skinWinners]
          .sort((a, b) => b.skinsWon - a.skinsWon)
          .map(w => `${w.playerName} ${w.skinsWon}`)
          .join(', ');
        winnerLabel = `${winners} (skin = $${skinsRes.skinValue.toFixed(2)})`;
      }

      const isPress = !!match.parentMatchId;
      const pressStartHole = isPress ? (match.startHole ?? 1) : undefined;
      lineItems.push({
        key: `${match.id}-skins`,
        matchId: match.id,
        isPress,
        pressStartHole,
        pressLabel: isPress ? `Press (H${pressStartHole})${match.customName ? ` · ${match.customName}` : ''}` : undefined,
        betName: `Skins (${includedPlayerIds.length} × $${unitAmount.toFixed(2)})`,
        baseWager: unitAmount,
        autoPressTriggered: false,
        autoPressMultiplier: 1,
        autoPressNullified: false,
        finalPot: Math.round(skinsRes.totalPool * 100) / 100,
        isComplete: skinsRes.isComplete,
        winnerLabel,
        playerSettlements,
      });
    } else if (match.matchType === 'two_three_ball') {
      // 2 Ball / 3 Ball - 6 sub-bets total (2 Nassaus x 3 legs each)
      totalBets += 6;
      const ttbResults = calculateTwoThreeBallResults(match, scores, netContext);
      const twoBallBetCents = match.twoThreeBallTwoBallBet ?? match.unitAmount ?? 0;
      const threeBallBetCents = match.twoThreeBallThreeBallBet ?? match.unitAmount ?? 0;

      const twoBallAutoPress = {
        front9: match.autoPressTwoBallFront9 ?? true,
        back9: match.autoPressTwoBallBack9 ?? true,
        overall: match.autoPressTwoBallOverall ?? true,
      };
      const threeBallAutoPress = {
        front9: match.autoPressThreeBallFront9 ?? true,
        back9: match.autoPressThreeBallBack9 ?? true,
        overall: match.autoPressThreeBallOverall ?? true,
      };

      const twoBallSettlements = calculateNassauSettlements(twoBallBetCents, teamA, teamB, ttbResults.twoBall, twoBallAutoPress);
      const threeBallSettlements = calculateNassauSettlements(threeBallBetCents, teamA, teamB, ttbResults.threeBall, threeBallAutoPress);

      const pushTtbItems = (settlements: typeof twoBallSettlements, prefix: string, betCents: number) => {
        for (const ns of settlements) {
          totalPot += ns.settlement.totalPot;
          if (ns.settlement.isComplete) {
            completedCount++;
            for (const s of ns.settlement.settlements) {
              const existing = playerAmounts.get(s.playerId) || { name: s.playerName, amount: 0 };
              existing.amount += s.amount;
              playerAmounts.set(s.playerId, existing);
            }
          }
          lineItems.push(buildLineItem(
            match,
            `${prefix} - ${ns.betName}`,
            betCents / 100,
            ns.settlement,
            teamA,
            teamB,
            `${prefix.replace(/\s+/g, '-').toLowerCase()}-${ns.betName}`,
          ));
        }
      };
      pushTtbItems(twoBallSettlements, '2 Ball', twoBallBetCents);
      pushTtbItems(threeBallSettlements, '3rd Ball', threeBallBetCents);
    } else if (match.matchType === 'one_two_three_ball') {
      // 1 Ball / 2nd3rd Ball - 6 sub-bets total (2 Nassaus x 3 legs each)
      totalBets += 6;
      const otzbResults = calculateOneTwoThreeBallResults(match, scores, netContext);
      const oneBallBetCents = match.oneTwoThreeBallOneBallBet ?? match.unitAmount ?? 0;
      const twoThirdBallBetCents = match.oneTwoThreeBallTwoThirdBallBet ?? match.unitAmount ?? 0;

      const oneBallAutoPress = {
        front9: match.autoPressOneBallFront9 ?? true,
        back9: match.autoPressOneBallBack9 ?? true,
        overall: match.autoPressOneBallOverall ?? true,
      };
      const twoThirdBallAutoPress = {
        front9: match.autoPressTwoThirdBallFront9 ?? true,
        back9: match.autoPressTwoThirdBallBack9 ?? true,
        overall: match.autoPressTwoThirdBallOverall ?? true,
      };

      const oneBallSettlements = calculateNassauSettlements(oneBallBetCents, teamA, teamB, otzbResults.oneBall, oneBallAutoPress);
      const twoThirdBallSettlements = calculateNassauSettlements(twoThirdBallBetCents, teamA, teamB, otzbResults.twoThirdBall, twoThirdBallAutoPress);

      const pushOtzbItems = (settlements: typeof oneBallSettlements, prefix: string, betCents: number) => {
        for (const ns of settlements) {
          totalPot += ns.settlement.totalPot;
          if (ns.settlement.isComplete) {
            completedCount++;
            for (const s of ns.settlement.settlements) {
              const existing = playerAmounts.get(s.playerId) || { name: s.playerName, amount: 0 };
              existing.amount += s.amount;
              playerAmounts.set(s.playerId, existing);
            }
          }
          lineItems.push(buildLineItem(
            match,
            `${prefix} - ${ns.betName}`,
            betCents / 100,
            ns.settlement,
            teamA,
            teamB,
            `${prefix.replace(/\s+/g, '-').toLowerCase()}-${ns.betName}`,
          ));
        }
      };
      pushOtzbItems(oneBallSettlements, '1 Ball', oneBallBetCents);
      pushOtzbItems(twoThirdBallSettlements, '2nd3rd Ball', twoThirdBallBetCents);
    } else {
      // Regular match play or stroke play - 1 bet
      totalBets += 1;
      // calculateMatchPlayResults now handles startOnBack9 internally - pass original scores
      const results = calculateMatchPlayResults(match, scores, netContext);
      const settlement = calculateBetSettlements(
        match.unitAmount || 0,
        teamA,
        teamB,
        results,
        match.matchType,
        match.autoPressOriginal ?? true
      );

      totalPot += settlement.totalPot;

      if (settlement.isComplete) {
        completedCount++;
        for (const s of settlement.settlements) {
          const existing = playerAmounts.get(s.playerId) || { name: s.playerName, amount: 0 };
          existing.amount += s.amount;
          playerAmounts.set(s.playerId, existing);
        }
      }

      const betLabel = match.matchType === 'stroke_play' ? 'Stroke Play' : 'Match Play';
      lineItems.push(buildLineItem(
        match,
        betLabel,
        (match.unitAmount || 0) / 100,
        settlement,
        teamA,
        teamB,
        `bet-${betLabel.replace(/\s+/g, '-').toLowerCase()}`,
      ));
    }
  }

  const playerTotals = Array.from(playerAmounts.entries())
    .map(([playerId, data]) => ({
      playerId,
      playerName: data.name,
      amount: Math.round(data.amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    totalPot: Math.round(totalPot * 100) / 100,
    allComplete: completedCount === totalBets,
    completedCount,
    totalMatches: totalBets,
    playerTotals,
    lineItems,
  };
}

export interface NassauResults {
  front9: HoleResult[];
  back9: HoleResult[];
  overall: HoleResult[];
}

export interface NassauBetResult {
  name: string;
  results: HoleResult[];
  winner: 'A' | 'B' | 'tie' | null;
  isComplete: boolean;
  finalHole: number;
  autoPressHole: number;
}

export function calculateNassauResults(
  eventMatch: EventMatch,
  scores: Score[],
  netContext: NetScoringContext | null = null
): NassauResults {
  const teamA = eventMatch.teams[0];
  const teamB = eventMatch.teams[1];
  const startOnBack9 = eventMatch.startOnBack9 || false;
  // Manual-press support: a child match has startHole > 1 and only counts from that hole onward.
  const matchStartHole = eventMatch.startHole && eventMatch.startHole > 1 ? eventMatch.startHole : 1;

  if (!teamA || !teamB) return { front9: [], back9: [], overall: [] };

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  const calculateRange = (startHole: number, endHole: number): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

    if (startHole > endHole) return results;
    for (let hole = startHole; hole <= endHole; hole++) {
      const teamAScores = scores
        .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));
      
      const teamBScores = scores
        .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));

      const teamAHoleScore = getTeamHoleScore(teamAScores, 'match_play_1_ball');
      const teamBHoleScore = getTeamHoleScore(teamBScores, 'match_play_1_ball');

      let winner: 'A' | 'B' | 'tie' | null = null;
      
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) {
          winner = 'A';
          cumulativeA++;
        } else if (teamBHoleScore < teamAHoleScore) {
          winner = 'B';
          cumulativeB++;
        } else {
          winner = 'tie';
        }
      }

      const diff = cumulativeA - cumulativeB;
      let status = 'All Square';
      if (diff > 0) {
        status = `${teamA.name} ${diff} UP`;
      } else if (diff < 0) {
        status = `${teamB.name} ${Math.abs(diff)} UP`;
      }

      results.push({
        holeNumber: hole,
        teamAScore: teamAHoleScore,
        teamBScore: teamBHoleScore,
        winner,
        cumulativeA,
        cumulativeB,
        status,
      });
    }

    return results;
  };

  // Calculate overall in playing order for correct cumulative display
  const calculateOverall = (): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

    // Determine hole order based on startOnBack9
    const baseOrder = startOnBack9
      ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    // For presses, drop holes before the press start.
    const holesToPlay = matchStartHole > 1
      ? baseOrder.slice(baseOrder.indexOf(matchStartHole))
      : baseOrder;

    for (const hole of holesToPlay) {
      const teamAScores = scores
        .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));
      
      const teamBScores = scores
        .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));

      const teamAHoleScore = getTeamHoleScore(teamAScores, 'match_play_1_ball');
      const teamBHoleScore = getTeamHoleScore(teamBScores, 'match_play_1_ball');

      let winner: 'A' | 'B' | 'tie' | null = null;
      
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) {
          winner = 'A';
          cumulativeA++;
        } else if (teamBHoleScore < teamAHoleScore) {
          winner = 'B';
          cumulativeB++;
        } else {
          winner = 'tie';
        }
      }

      const diff = cumulativeA - cumulativeB;
      let status = 'All Square';
      if (diff > 0) {
        status = `${teamA.name} ${diff} UP`;
      } else if (diff < 0) {
        status = `${teamB.name} ${Math.abs(diff)} UP`;
      }

      results.push({
        holeNumber: hole,
        teamAScore: teamAHoleScore,
        teamBScore: teamBHoleScore,
        winner,
        cumulativeA,
        cumulativeB,
        status,
      });
    }

    return results;
  };

  // Nassau press semantics: a press belongs to exactly one leg — the leg that
  // contains the physical hole where the press was started. The other two legs
  // and Overall are returned empty so the settlement layer treats them as $0
  // no-bets. Parent Nassau bets keep all three legs. We require both
  // parentMatchId AND matchStartHole > 1 to identify a press, so a parent that
  // somehow has a non-1 startHole is not misclassified.
  const isPress = !!eventMatch.parentMatchId && matchStartHole > 1;
  if (isPress) {
    const pressLeg: 'front9' | 'back9' = matchStartHole <= 9 ? 'front9' : 'back9';
    return {
      front9: pressLeg === 'front9' ? calculateRange(matchStartHole, 9) : [],
      back9: pressLeg === 'back9' ? calculateRange(matchStartHole, 18) : [],
      overall: [],
    };
  }
  return {
    front9: calculateRange(1, 9),
    back9: calculateRange(10, 18),
    overall: calculateOverall(),
  };
}

function getNassauBetWinner(results: HoleResult[], finalHole: number, expectedHoleCount?: number): 'A' | 'B' | 'tie' | null {
  // Get all played holes (with scores)
  const playedHoles = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const lastPlayedHole = playedHoles[playedHoles.length - 1];
  
  if (!lastPlayedHole) return null;
  
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  
  // Determine expected total holes - use explicit count if provided, otherwise infer from finalHole
  // Front 9 = 9 holes, Back 9 = 9 holes (holes 10-18), Overall = 18 holes
  const expectedHoles = expectedHoleCount ?? (finalHole === 9 ? 9 : 18);
  const holesRemaining = expectedHoles - playedHoles.length;
  
  // Check for early clinch (e.g., 3 & 2 means 3 up with 2 holes remaining)
  if (Math.abs(diff) > holesRemaining) {
    return diff > 0 ? 'A' : 'B';
  }
  
  // If we've played all expected holes, determine winner
  if (holesRemaining === 0) {
    if (diff > 0) return 'A';
    if (diff < 0) return 'B';
    return 'tie';
  }
  
  return null;
}

export interface NassauSettlement {
  betName: string;
  settlement: MatchSettlement;
  autoPressTriggered: boolean;
  autoPressMultiplier: number;
  autoPressReason?: string;
  autoPressNullified?: boolean;
}

export interface NassauAutoPressSettings {
  front9: boolean;
  back9: boolean;
  overall: boolean;
}

export function calculateNassauSettlements(
  unitAmountCents: number,
  teamA: Team,
  teamB: Team,
  nassauResults: NassauResults,
  autoPressSettings: boolean | NassauAutoPressSettings
): NassauSettlement[] {
  // Handle both legacy boolean and new object format
  const settings: NassauAutoPressSettings = typeof autoPressSettings === 'boolean'
    ? { front9: autoPressSettings, back9: autoPressSettings, overall: autoPressSettings }
    : autoPressSettings;

  // Note: Scores should be transformed to playing order BEFORE calculating Nassau results
  // when startOnBack9 is enabled. This way all bets use standard playing positions 1-18.
  // Front 9 = playing positions 1-9, Back 9 = playing positions 10-18, Overall = 1-18
  // For manual presses (child match with startHole > 1) the leg's hole list is shorter
  // so we derive expected/final/check hole numbers from the actual results array.
  // Auto-press rule for manual presses (post tasks #10/#11):
  //   - A manual press lives on exactly one leg. Front-9 presses (start hole <= 9)
  //     fire Auto Press on the leg's natural close — hole 9 (2-up at hole 8 → press
  //     on hole 9). Back-9 presses (start hole 10–18) fire on hole 18 (2-up at hole
  //     17 → press on hole 18). The Overall leg is empty for a manual press and
  //     therefore never triggers a separate auto-press.
  const bets: { name: string; results: HoleResult[]; autoPress: boolean }[] = [
    { name: 'Front 9', results: nassauResults.front9, autoPress: settings.front9 },
    { name: 'Back 9', results: nassauResults.back9, autoPress: settings.back9 },
    { name: 'Overall', results: nassauResults.overall, autoPress: settings.overall },
  ];

  return bets.map(bet => {
    const expectedHoleCount = bet.results.length;
    const finalHole = expectedHoleCount > 0 ? bet.results[expectedHoleCount - 1].holeNumber : 0;
    const autoPressCheckHole = expectedHoleCount >= 2 ? bet.results[expectedHoleCount - 2].holeNumber : 0;
    const winner = expectedHoleCount > 0 ? getNassauBetWinner(bet.results, finalHole, expectedHoleCount) : null;
    const unitAmount = unitAmountCents / 100;
    
    const teamASize = teamA.members.length;
    const teamBSize = teamB.members.length;
    const maxTeamSize = Math.max(teamASize, teamBSize);

    // Empty leg (e.g. a press starting after the leg's holes have been played):
    // settle as a complete no-bet so the parent bet's accounting can finalize.
    if (expectedHoleCount === 0) {
      return {
        betName: bet.name,
        settlement: {
          isComplete: true,
          isTie: true,
          winner: null,
          winningTeamName: null,
          settlements: [
            ...teamA.members.map((m) => ({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: teamA.name,
              amount: 0,
            })),
            ...teamB.members.map((m) => ({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: teamB.name,
              amount: 0,
            })),
          ],
          totalPot: 0,
        },
        autoPressTriggered: false,
        autoPressMultiplier: 1,
      };
    }
    
    let autoPressMultiplier = 1;
    let autoPressNullified = false;
    let autoPressTriggered = false;
    let autoPressReason: string | undefined;

    if (bet.autoPress && expectedHoleCount >= 2) {
      const checkHoleResult = bet.results.find(r => r.holeNumber === autoPressCheckHole);
      const finalHoleResult = bet.results.find(r => r.holeNumber === finalHole);
      
      if (checkHoleResult && finalHoleResult && 
          finalHoleResult.teamAScore !== null && finalHoleResult.teamBScore !== null) {
        const statusBeforeFinal = checkHoleResult.cumulativeA - checkHoleResult.cumulativeB;
        
        if (Math.abs(statusBeforeFinal) >= 2) {
          autoPressTriggered = true;
          const leaderBeforeFinal = statusBeforeFinal > 0 ? 'A' : 'B';
          const leaderName = leaderBeforeFinal === 'A' ? teamA.name : teamB.name;
          const lead = Math.abs(statusBeforeFinal);
          const finalHoleWinner = finalHoleResult.winner;

          if (finalHoleWinner === leaderBeforeFinal) {
            autoPressMultiplier = 2;
            autoPressReason = `${leaderName} was ${lead} UP at hole ${autoPressCheckHole} and won hole ${finalHole} → 2× pot`;
          } else if (finalHoleWinner === 'tie') {
            autoPressMultiplier = 1;
            autoPressReason = `${leaderName} was ${lead} UP at hole ${autoPressCheckHole} and tied hole ${finalHole} → no auto-press`;
          } else {
            autoPressNullified = true;
            autoPressReason = `${leaderName} was ${lead} UP at hole ${autoPressCheckHole} but lost hole ${finalHole} → press nullified`;
          }
        }
      }
    }

    const totalPot = unitAmount * maxTeamSize * autoPressMultiplier;
    
    if (winner === null) {
      return {
        betName: bet.name,
        settlement: {
          isComplete: false,
          isTie: false,
          winner: null,
          winningTeamName: null,
          settlements: [],
          totalPot: unitAmount * maxTeamSize,
          autoPressTriggered,
          autoPressMultiplier,
          autoPressReason,
        },
        autoPressTriggered,
        autoPressMultiplier,
        autoPressReason,
      };
    }
    
    if (autoPressNullified) {
      return {
        betName: bet.name,
        settlement: {
          isComplete: true,
          isTie: true,
          winner: null,
          winningTeamName: null,
          settlements: [
            ...teamA.members.map((m) => ({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: teamA.name,
              amount: 0,
            })),
            ...teamB.members.map((m) => ({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: teamB.name,
              amount: 0,
            })),
          ],
          totalPot,
          autoPressTriggered,
          autoPressMultiplier,
          autoPressReason,
          autoPressNullified: true,
        },
        autoPressTriggered,
        autoPressMultiplier,
        autoPressReason,
        autoPressNullified: true,
      };
    }
    
    if (winner === 'tie') {
      return {
        betName: bet.name,
        settlement: {
          isComplete: true,
          isTie: true,
          winner: null,
          winningTeamName: null,
          settlements: [
            ...teamA.members.map((m) => ({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: teamA.name,
              amount: 0,
            })),
            ...teamB.members.map((m) => ({
              playerId: m.playerId,
              playerName: m.player?.name || `Player ${m.playerId}`,
              teamName: teamB.name,
              amount: 0,
            })),
          ],
          totalPot,
          autoPressTriggered,
          autoPressMultiplier,
          autoPressReason,
        },
        autoPressTriggered,
        autoPressMultiplier,
        autoPressReason,
      };
    }
    
    const winningTeam = winner === 'A' ? teamA : teamB;
    const losingTeam = winner === 'A' ? teamB : teamA;
    const winningTeamSize = winningTeam.members.length;
    const losingTeamSize = losingTeam.members.length;
    
    const effectiveUnitAmount = unitAmount * autoPressMultiplier;
    const effectiveTotalPot = effectiveUnitAmount * maxTeamSize;
    
    let winAmount: number;
    let loseAmount: number;
    
    if (winningTeamSize >= losingTeamSize) {
      winAmount = effectiveUnitAmount;
      loseAmount = effectiveTotalPot / losingTeamSize;
    } else {
      winAmount = effectiveTotalPot / winningTeamSize;
      loseAmount = effectiveUnitAmount;
    }
    
    return {
      betName: bet.name,
      settlement: {
        isComplete: true,
        isTie: false,
        winner,
        winningTeamName: winningTeam.name,
        settlements: [
          ...winningTeam.members.map((m) => ({
            playerId: m.playerId,
            playerName: m.player?.name || `Player ${m.playerId}`,
            teamName: winningTeam.name,
            amount: Math.round(winAmount * 100) / 100,
          })),
          ...losingTeam.members.map((m) => ({
            playerId: m.playerId,
            playerName: m.player?.name || `Player ${m.playerId}`,
            teamName: losingTeam.name,
            amount: -Math.round(loseAmount * 100) / 100,
          })),
        ],
        totalPot: effectiveTotalPot,
        autoPressTriggered,
        autoPressMultiplier,
        autoPressReason,
      },
      autoPressTriggered,
      autoPressMultiplier,
      autoPressReason,
    };
  });
}

// Skins Match Types and Calculations
export interface SkinResult {
  holeNumber: number;
  winnerId: number | null;
  winnerName: string | null;
  lowestScore: number | null;
  isSkin: boolean;
}

export interface SkinsMatchResult {
  holeResults: SkinResult[];
  totalSkins: number;
  skinWinners: { playerId: number; playerName: string; skinsWon: number }[];
  skinValue: number;
  totalPool: number;
  isComplete: boolean;
  settlements: { playerId: number; playerName: string; amount: number }[];
}

export function calculateSkinsResults(
  includedPlayerIds: number[],
  playerNames: Map<number, string>,
  scores: Score[],
  unitAmount: number,
  netContext: NetScoringContext | null = null,
  pars: number[] | null = null,
  // For manual presses: only count holes from this hole forward (1-18). Default 1.
  // When `startOnBack9` is true, holesToPlay follows playing order (10..18, 1..9).
  startHole: number = 1,
  startOnBack9: boolean = false
): SkinsMatchResult {
  const holeResults: SkinResult[] = [];
  const skinCounts = new Map<number, number>();
  const firstHole = Math.max(1, Math.min(18, startHole));
  // Determine which holes to count.
  // - Parent bet (firstHole === 1): count all 18 holes (order does not affect skin tallies).
  // - Manual press child (firstHole > 1): count only holes from press start onward,
  //   honoring playing order so a back-9-first round excludes already-played holes.
  let holesToCount: number[];
  if (firstHole === 1) {
    holesToCount = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  } else {
    const baseOrder = startOnBack9
      ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const idx = baseOrder.indexOf(firstHole);
    holesToCount = idx >= 0 ? baseOrder.slice(idx) : baseOrder;
  }
  
  // Initialize skin counts for all included players
  for (const playerId of includedPlayerIds) {
    skinCounts.set(playerId, 0);
  }
  
  // Check that every hole in the press window has scores for all included players.
  let allHolesComplete = true;
  for (const hole of holesToCount) {
    const holesScored = includedPlayerIds.every(pid => 
      scores.some(s => s.playerId === pid && s.holeNumber === hole)
    );
    if (!holesScored) {
      allHolesComplete = false;
      break;
    }
  }
  
  // Calculate skins for each hole in the press window (playing order honored).
  for (const hole of holesToCount) {
    const holeScores = includedPlayerIds.map(playerId => {
      const score = scores.find(s => s.playerId === playerId && s.holeNumber === hole);
      const grossStrokes = score?.strokes ?? null;
      const netStrokes = grossStrokes !== null && score 
        ? getScoreValue(score, netContext) 
        : null;
      return { playerId, strokes: netStrokes };
    }).filter(s => s.strokes !== null) as { playerId: number; strokes: number }[];
    
    if (holeScores.length === 0) {
      holeResults.push({
        holeNumber: hole,
        winnerId: null,
        winnerName: null,
        lowestScore: null,
        isSkin: false,
      });
      continue;
    }
    
    const minScore = Math.min(...holeScores.map(s => s.strokes));
    const playersWithMinScore = holeScores.filter(s => s.strokes === minScore);
    
    // Check if there's a lone low score
    if (playersWithMinScore.length !== 1) {
      // Tie - no skin
      holeResults.push({
        holeNumber: hole,
        winnerId: null,
        winnerName: null,
        lowestScore: minScore,
        isSkin: false,
      });
      continue;
    }
    
    const potentialWinner = playersWithMinScore[0];
    
    // Validation hole = the next hole in PLAYING ORDER (so back-9-first wraps 18 -> 1).
    // The very last played hole has no "next hole" check.
    const orderIdx = holesToCount.indexOf(hole);
    const nextHole = orderIdx >= 0 && orderIdx < holesToCount.length - 1
      ? holesToCount[orderIdx + 1]
      : null;
    if (nextHole !== null) {
      const nextHolePar = pars && pars.length >= nextHole ? pars[nextHole - 1] : null;
      
      // Get the potential winner's score on the next hole
      const winnerNextHoleScore = scores.find(s => s.playerId === potentialWinner.playerId && s.holeNumber === nextHole);
      const winnerNextGross = winnerNextHoleScore?.strokes ?? null;
      const winnerNextNet = winnerNextGross !== null && winnerNextHoleScore 
        ? getScoreValue(winnerNextHoleScore, netContext) 
        : null;
      
      if (winnerNextNet === null) {
        // Next hole not played yet - can't determine if skin is won
        holeResults.push({
          holeNumber: hole,
          winnerId: potentialWinner.playerId,
          winnerName: playerNames.get(potentialWinner.playerId) || 'Unknown',
          lowestScore: minScore,
          isSkin: false, // Pending - need next hole
        });
        continue;
      }
      
      // Check if winner made net par or better on the next hole
      // If pars not provided, fall back to assuming par 4
      const effectivePar = nextHolePar ?? 4;
      const madeParOrBetter = winnerNextNet <= effectivePar;
      
      if (madeParOrBetter) {
        // Winner made net par or better on next hole - skin awarded!
        const currentCount = skinCounts.get(potentialWinner.playerId) || 0;
        skinCounts.set(potentialWinner.playerId, currentCount + 1);
        
        holeResults.push({
          holeNumber: hole,
          winnerId: potentialWinner.playerId,
          winnerName: playerNames.get(potentialWinner.playerId) || 'Unknown',
          lowestScore: minScore,
          isSkin: true,
        });
      } else {
        // Winner didn't make net par or better - no skin
        holeResults.push({
          holeNumber: hole,
          winnerId: potentialWinner.playerId,
          winnerName: playerNames.get(potentialWinner.playerId) || 'Unknown',
          lowestScore: minScore,
          isSkin: false,
        });
      }
    } else {
      // Last played hole: lone low score wins (no validation hole exists).
      const currentCount = skinCounts.get(potentialWinner.playerId) || 0;
      skinCounts.set(potentialWinner.playerId, currentCount + 1);
      
      holeResults.push({
        holeNumber: hole,
        winnerId: potentialWinner.playerId,
        winnerName: playerNames.get(potentialWinner.playerId) || 'Unknown',
        lowestScore: minScore,
        isSkin: true,
      });
    }
  }
  
  // Calculate totals
  const totalSkins = Array.from(skinCounts.values()).reduce((sum, count) => sum + count, 0);
  const totalPool = unitAmount * includedPlayerIds.length;
  const skinValue = totalSkins > 0 ? totalPool / totalSkins : 0;
  
  const skinWinners = Array.from(skinCounts.entries())
    .filter(([_, count]) => count > 0)
    .map(([playerId, skinsWon]) => ({
      playerId,
      playerName: playerNames.get(playerId) || 'Unknown',
      skinsWon,
    }));
  
  // Calculate settlements
  // If no skins were won, everyone breaks even (gets their money back)
  const settlements = includedPlayerIds.map(playerId => {
    if (totalSkins === 0) {
      return {
        playerId,
        playerName: playerNames.get(playerId) || 'Unknown',
        amount: 0,
      };
    }
    
    const skinsWon = skinCounts.get(playerId) || 0;
    const winnings = skinsWon * skinValue;
    const netAmount = winnings - unitAmount; // Everyone pays in, winners get paid
    
    return {
      playerId,
      playerName: playerNames.get(playerId) || 'Unknown',
      amount: Math.round(netAmount * 100) / 100,
    };
  });
  
  return {
    holeResults,
    totalSkins,
    skinWinners,
    skinValue: Math.round(skinValue * 100) / 100,
    totalPool,
    isComplete: allHolesComplete,
    settlements,
  };
}

// ===== 5-5-5-3 SCORING =====

export interface FiveTeamHoleResult {
  holeNumber: number;
  bestBallCount: number;
  teamScores: { teamIndex: number; teamName: string; score: number | null }[];
}

export interface FiveTeamTotalResult {
  teamIndex: number;
  teamName: string;
  totalScore: number;
  holesCompleted: number;
}

export interface FiveSettlement {
  teamIndex: number;
  teamName: string;
  amount: number;
}

export interface FiveMatchResult {
  holeResults: FiveTeamHoleResult[];
  teamTotals: FiveTeamTotalResult[];
  settlements: FiveSettlement[];
  isComplete: boolean;
  smallestTeamSize: number;
  largestTeamSize: number;
}

function getBestBallCount(holeNumber: number, smallestTeamSize: number): number {
  if (holeNumber >= 1 && holeNumber <= 5) return 1;
  if (holeNumber >= 6 && holeNumber <= 10) return 2;
  if (holeNumber >= 11 && holeNumber <= 15) return 3;
  // Holes 16-18: use smallest team size
  return smallestTeamSize;
}

function getTeamBestBallScore(
  teamScores: number[],
  bestBallCount: number
): number | null {
  if (teamScores.length === 0) return null;
  
  const sorted = [...teamScores].sort((a, b) => a - b);
  // Take the lowest N scores and sum them
  const scoresToUse = sorted.slice(0, Math.min(bestBallCount, sorted.length));
  return scoresToUse.reduce((sum, s) => sum + s, 0);
}

export function calculateFiveMatchResults(
  eventMatch: EventMatch,
  scores: Score[],
  netContext: NetScoringContext | null = null
): FiveMatchResult {
  const teams = eventMatch.teams;
  
  if (!teams || teams.length < 2) {
    return {
      holeResults: [],
      teamTotals: [],
      settlements: [],
      isComplete: false,
      smallestTeamSize: 0,
    };
  }
  
  // Find the smallest team size
  const smallestTeamSize = Math.min(...teams.map(t => t.members.length));
  // Manual-press support: only score holes from startHole onward in PLAYING ORDER.
  // For startOnBack9=true, the play sequence is 10..18, 1..9 — so a press starting on
  // physical hole 14 still includes 1..9 (those are after 14 in play order); a press
  // starting on physical hole 2 excludes 10..18 (already played pre-press).
  const startOnBack9 = eventMatch.startOnBack9 || false;
  const firstHole = eventMatch.startHole && eventMatch.startHole > 1 ? eventMatch.startHole : 1;
  const baseOrder = startOnBack9
    ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const holesToPlay = firstHole > 1
    ? baseOrder.slice(baseOrder.indexOf(firstHole))
    : baseOrder;
  const totalHolesInBet = holesToPlay.length;
  
  // Build player ID sets for each team
  const teamPlayerIds = teams.map(team => 
    new Set(team.members.map(m => m.playerId))
  );
  
  const holeResults: FiveTeamHoleResult[] = [];
  const teamCumulativeScores = teams.map(() => 0);
  const teamHolesCompleted = teams.map(() => 0);
  let allComplete = true;
  
  for (const hole of holesToPlay) {
    const bestBallCount = getBestBallCount(hole, smallestTeamSize);
    
    const teamScoresForHole = teams.map((team, teamIdx) => {
      const playerScores = scores
        .filter(s => s.holeNumber === hole && teamPlayerIds[teamIdx].has(s.playerId))
        .map(s => getScoreValue(s, netContext));
      
      const bestScore = getTeamBestBallScore(playerScores, bestBallCount);
      
      if (bestScore !== null) {
        teamCumulativeScores[teamIdx] += bestScore;
        teamHolesCompleted[teamIdx]++;
      } else {
        allComplete = false;
      }
      
      return {
        teamIndex: teamIdx,
        teamName: team.name,
        score: bestScore,
      };
    });
    
    holeResults.push({
      holeNumber: hole,
      bestBallCount,
      teamScores: teamScoresForHole,
    });
  }
  
  // Build team totals
  const teamTotals: FiveTeamTotalResult[] = teams.map((team, idx) => ({
    teamIndex: idx,
    teamName: team.name,
    totalScore: teamCumulativeScores[idx],
    holesCompleted: teamHolesCompleted[idx],
  }));
  
  // Check if all teams have completed every hole in the bet's range
  const isComplete = allComplete && teamHolesCompleted.every(h => h === totalHolesInBet);
  
  const largestTeamSize = Math.max(...teams.map(t => t.members.length));

  return {
    holeResults,
    teamTotals,
    settlements: [], // Settlements calculated separately with wager amount
    isComplete,
    smallestTeamSize,
    largestTeamSize,
  };
}

export function calculateFiveSettlements(
  teamTotals: FiveTeamTotalResult[],
  unitAmount: number, // Amount in dollars per player per stroke (e.g. 1 = $1/player/stroke)
  isComplete: boolean,
  largestTeamSize: number = 1
): FiveSettlement[] {
  if (!isComplete || teamTotals.length < 2) {
    return teamTotals.map(t => ({
      teamIndex: t.teamIndex,
      teamName: t.teamName,
      amount: 0,
    }));
  }
  
  // Round-robin settlement: each team pays each other team the stroke difference × wager × players
  const settlements: FiveSettlement[] = teamTotals.map(t => ({
    teamIndex: t.teamIndex,
    teamName: t.teamName,
    amount: 0,
  }));
  
  for (let i = 0; i < teamTotals.length; i++) {
    for (let j = i + 1; j < teamTotals.length; j++) {
      const teamI = teamTotals[i];
      const teamJ = teamTotals[j];
      const strokeDiff = teamI.totalScore - teamJ.totalScore;
      // Lower score is better in golf
      // If Team I has lower score, Team J pays Team I
      // strokeDiff < 0 means Team I wins
      // Multiply by largestTeamSize: unit amount is per player
      const payment = strokeDiff * unitAmount * largestTeamSize;
      
      settlements[i].amount -= payment; // Team I gets paid if strokeDiff < 0
      settlements[j].amount += payment; // Team J pays if strokeDiff < 0
    }
  }
  
  // Round to 2 decimal places
  settlements.forEach(s => {
    s.amount = Math.round(s.amount * 100) / 100;
  });
  
  return settlements;
}

export interface DeathMatchResults {
  bestBall: {
    results: HoleResult[];
    isComplete: boolean;
    totalA: number;
    totalB: number;
    winner: 'A' | 'B' | 'tie' | null;
  };
  secondBall: {
    results: HoleResult[];
    isComplete: boolean;
    holesWonA: number;
    holesWonB: number;
    winner: 'A' | 'B' | 'tie' | null;
  };
}

export function calculateDeathMatchResults(
  eventMatch: EventMatch,
  scores: Score[],
  netContext: NetScoringContext | null = null
): DeathMatchResults {
  const teamA = eventMatch.teams[0];
  const teamB = eventMatch.teams[1];
  const startOnBack9 = eventMatch.startOnBack9 || false;

  if (!teamA || !teamB) {
    return {
      bestBall: { results: [], isComplete: false, totalA: 0, totalB: 0, winner: null },
      secondBall: { results: [], isComplete: false, holesWonA: 0, holesWonB: 0, winner: null },
    };
  }

  const teamAPlayerIds = new Set(teamA.members.map(m => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map(m => m.playerId));

  let holesToPlay: number[];
  if (startOnBack9) {
    holesToPlay = [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  } else {
    holesToPlay = [];
    for (let h = 1; h <= 18; h++) holesToPlay.push(h);
  }

  const bestBallResults: HoleResult[] = [];
  const secondBallResults: HoleResult[] = [];
  let bbCumA = 0, bbCumB = 0;
  let sbCumA = 0, sbCumB = 0;

  for (const hole of holesToPlay) {
    const teamAScoresRaw = scores
      .filter(s => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
      .map(s => getScoreValue(s, netContext));
    const teamBScoresRaw = scores
      .filter(s => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
      .map(s => getScoreValue(s, netContext));

    const teamASorted = [...teamAScoresRaw].sort((a, b) => a - b);
    const teamBSorted = [...teamBScoresRaw].sort((a, b) => a - b);

    const bestA = teamASorted.length > 0 ? teamASorted[0] : null;
    const bestB = teamBSorted.length > 0 ? teamBSorted[0] : null;
    const secondA = teamASorted.length > 1 ? teamASorted[1] : null;
    const secondB = teamBSorted.length > 1 ? teamBSorted[1] : null;

    // Best Ball (Stroke Play) - cumulative total strokes
    if (bestA !== null) bbCumA += bestA;
    if (bestB !== null) bbCumB += bestB;
    
    let bbStatus = 'All Square';
    const bbDiff = bbCumA - bbCumB;
    if (bbDiff < 0) bbStatus = `${teamA.name} ${Math.abs(bbDiff)} ahead`;
    else if (bbDiff > 0) bbStatus = `${teamB.name} ${bbDiff} ahead`;

    bestBallResults.push({
      holeNumber: hole,
      teamAScore: bestA,
      teamBScore: bestB,
      winner: null,
      cumulativeA: bbCumA,
      cumulativeB: bbCumB,
      status: bbStatus,
    });

    // Second Ball (Match Play) - hole-by-hole comparison
    let sbWinner: 'A' | 'B' | 'tie' | null = null;
    if (secondA !== null && secondB !== null) {
      if (secondA < secondB) { sbWinner = 'A'; sbCumA++; }
      else if (secondB < secondA) { sbWinner = 'B'; sbCumB++; }
      else { sbWinner = 'tie'; }
    }

    let sbStatus = 'All Square';
    const sbDiff = sbCumA - sbCumB;
    if (sbDiff > 0) sbStatus = `${teamA.name} ${sbDiff} UP`;
    else if (sbDiff < 0) sbStatus = `${teamB.name} ${Math.abs(sbDiff)} UP`;

    secondBallResults.push({
      holeNumber: hole,
      teamAScore: secondA,
      teamBScore: secondB,
      winner: sbWinner,
      cumulativeA: sbCumA,
      cumulativeB: sbCumB,
      status: sbStatus,
    });
  }

  const playedBB = bestBallResults.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const bbComplete = playedBB.length === 18;
  let bbWinner: 'A' | 'B' | 'tie' | null = null;
  if (bbComplete) {
    if (bbCumA < bbCumB) bbWinner = 'A';
    else if (bbCumB < bbCumA) bbWinner = 'B';
    else bbWinner = 'tie';
  }

  const playedSB = secondBallResults.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const sbComplete = playedSB.length === 18;
  let sbWinner: 'A' | 'B' | 'tie' | null = null;
  if (sbComplete) {
    if (sbCumA > sbCumB) sbWinner = 'A';
    else if (sbCumB > sbCumA) sbWinner = 'B';
    else sbWinner = 'tie';
  }

  return {
    bestBall: { results: bestBallResults, isComplete: bbComplete, totalA: bbCumA, totalB: bbCumB, winner: bbWinner },
    secondBall: { results: secondBallResults, isComplete: sbComplete, holesWonA: sbCumA, holesWonB: sbCumB, winner: sbWinner },
  };
}

// ============================================================================
// 2 Ball / 3 Ball Bet Type
// ============================================================================
// Each match generates two simultaneous Nassaus:
//   - 2 Ball: per-hole team score = sum of the team's two lowest scores (match play)
//   - 3 Ball: per-hole team score = the team's third-lowest single score (match play)
// Each Nassau has Front 9 / Back 9 / Overall legs with independent auto-press.

export interface TwoThreeBallResults {
  twoBall: NassauResults;
  threeBall: NassauResults;
}

export function calculateTwoThreeBallResults(
  eventMatch: EventMatch,
  scores: Score[],
  netContext: NetScoringContext | null = null
): TwoThreeBallResults {
  const teamA = eventMatch.teams[0];
  const teamB = eventMatch.teams[1];
  const startOnBack9 = eventMatch.startOnBack9 || false;
  // Manual-press support: child match with startHole > 1 starts both nested Nassaus from that hole.
  const matchStartHole = eventMatch.startHole && eventMatch.startHole > 1 ? eventMatch.startHole : 1;

  const empty: NassauResults = { front9: [], back9: [], overall: [] };
  if (!teamA || !teamB) return { twoBall: empty, threeBall: empty };

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  // Compute the per-hole team score for each derivation
  const sumOfTwoLowest = (sorted: number[]): number | null =>
    sorted.length >= 2 ? sorted[0] + sorted[1] : null;
  const thirdLowest = (sorted: number[]): number | null =>
    sorted.length >= 3 ? sorted[2] : null;

  type Deriver = (sorted: number[]) => number | null;

  // Calculate a per-leg match-play range using a custom team-score derivation
  const calculateRange = (startHole: number, endHole: number, derive: Deriver, teamAName: string, teamBName: string): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

    if (startHole > endHole) return results;
    for (let hole = startHole; hole <= endHole; hole++) {
      const teamARaw = scores
        .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));
      const teamBRaw = scores
        .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));

      const teamASorted = [...teamARaw].sort((a, b) => a - b);
      const teamBSorted = [...teamBRaw].sort((a, b) => a - b);

      const teamAHoleScore = derive(teamASorted);
      const teamBHoleScore = derive(teamBSorted);

      let winner: 'A' | 'B' | 'tie' | null = null;
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) { winner = 'A'; cumulativeA++; }
        else if (teamBHoleScore < teamAHoleScore) { winner = 'B'; cumulativeB++; }
        else { winner = 'tie'; }
      }

      const diff = cumulativeA - cumulativeB;
      let status = 'All Square';
      if (diff > 0) status = `${teamAName} ${diff} UP`;
      else if (diff < 0) status = `${teamBName} ${Math.abs(diff)} UP`;

      results.push({
        holeNumber: hole,
        teamAScore: teamAHoleScore,
        teamBScore: teamBHoleScore,
        winner,
        cumulativeA,
        cumulativeB,
        status,
      });
    }

    return results;
  };

  const calculateOverall = (derive: Deriver, teamAName: string, teamBName: string): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

    const baseOrder = startOnBack9
      ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const holesToPlay = matchStartHole > 1
      ? baseOrder.slice(baseOrder.indexOf(matchStartHole))
      : baseOrder;

    for (const hole of holesToPlay) {
      const teamARaw = scores
        .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));
      const teamBRaw = scores
        .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));

      const teamASorted = [...teamARaw].sort((a, b) => a - b);
      const teamBSorted = [...teamBRaw].sort((a, b) => a - b);

      const teamAHoleScore = derive(teamASorted);
      const teamBHoleScore = derive(teamBSorted);

      let winner: 'A' | 'B' | 'tie' | null = null;
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) { winner = 'A'; cumulativeA++; }
        else if (teamBHoleScore < teamAHoleScore) { winner = 'B'; cumulativeB++; }
        else { winner = 'tie'; }
      }

      const diff = cumulativeA - cumulativeB;
      let status = 'All Square';
      if (diff > 0) status = `${teamAName} ${diff} UP`;
      else if (diff < 0) status = `${teamBName} ${Math.abs(diff)} UP`;

      results.push({
        holeNumber: hole,
        teamAScore: teamAHoleScore,
        teamBScore: teamBHoleScore,
        winner,
        cumulativeA,
        cumulativeB,
        status,
      });
    }

    return results;
  };

  // 2 Ball / 3 Ball press semantics (mirrors Nassau): a press belongs to exactly
  // one leg — the leg that contains the physical hole where the press was started
  // — and never produces an Overall result. The other two legs (and Overall) are
  // returned empty so the settlement layer treats them as $0 no-bets. Parent
  // bets keep all three legs. Require both parentMatchId AND startHole > 1 so a
  // parent with a non-1 startHole is not misclassified as a press.
  const isPress = !!eventMatch.parentMatchId && matchStartHole > 1;
  if (isPress) {
    const pressLeg: 'front9' | 'back9' = matchStartHole <= 9 ? 'front9' : 'back9';
    const f9Start = matchStartHole, f9End = 9;
    const b9Start = matchStartHole, b9End = 18;
    return {
      twoBall: {
        front9: pressLeg === 'front9' ? calculateRange(f9Start, f9End, sumOfTwoLowest, teamA.name, teamB.name) : [],
        back9: pressLeg === 'back9' ? calculateRange(b9Start, b9End, sumOfTwoLowest, teamA.name, teamB.name) : [],
        overall: [],
      },
      threeBall: {
        front9: pressLeg === 'front9' ? calculateRange(f9Start, f9End, thirdLowest, teamA.name, teamB.name) : [],
        back9: pressLeg === 'back9' ? calculateRange(b9Start, b9End, thirdLowest, teamA.name, teamB.name) : [],
        overall: [],
      },
    };
  }
  return {
    twoBall: {
      front9: calculateRange(1, 9, sumOfTwoLowest, teamA.name, teamB.name),
      back9: calculateRange(10, 18, sumOfTwoLowest, teamA.name, teamB.name),
      overall: calculateOverall(sumOfTwoLowest, teamA.name, teamB.name),
    },
    threeBall: {
      front9: calculateRange(1, 9, thirdLowest, teamA.name, teamB.name),
      back9: calculateRange(10, 18, thirdLowest, teamA.name, teamB.name),
      overall: calculateOverall(thirdLowest, teamA.name, teamB.name),
    },
  };
}

// ============================================================================
// 1 Ball / 2nd3rd Ball
// ============================================================================
// Two simultaneous Nassau matches:
//   - 1 Ball: per-hole team score = team's lowest (best) score (match play)
//   - 2nd3rd Ball: per-hole team score = sum of team's 2nd-best + 3rd-best scores (match play)
// Each Nassau has Front 9 / Back 9 / Overall legs with independent auto-press.

export interface OneTwoThreeBallResults {
  oneBall: NassauResults;
  twoThirdBall: NassauResults;
}

export function calculateOneTwoThreeBallResults(
  eventMatch: EventMatch,
  scores: Score[],
  netContext: NetScoringContext | null = null
): OneTwoThreeBallResults {
  const teamA = eventMatch.teams[0];
  const teamB = eventMatch.teams[1];
  const startOnBack9 = eventMatch.startOnBack9 || false;
  const matchStartHole = eventMatch.startHole && eventMatch.startHole > 1 ? eventMatch.startHole : 1;

  const empty: NassauResults = { front9: [], back9: [], overall: [] };
  if (!teamA || !teamB) return { oneBall: empty, twoThirdBall: empty };

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  const lowestScore = (sorted: number[]): number | null =>
    sorted.length >= 1 ? sorted[0] : null;
  const sumOfSecondAndThird = (sorted: number[]): number | null =>
    sorted.length >= 3 ? sorted[1] + sorted[2] : null;

  type Deriver = (sorted: number[]) => number | null;

  const calculateRange = (startHole: number, endHole: number, derive: Deriver, teamAName: string, teamBName: string): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

    if (startHole > endHole) return results;
    for (let hole = startHole; hole <= endHole; hole++) {
      const teamARaw = scores
        .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));
      const teamBRaw = scores
        .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));

      const teamASorted = [...teamARaw].sort((a, b) => a - b);
      const teamBSorted = [...teamBRaw].sort((a, b) => a - b);

      const teamAHoleScore = derive(teamASorted);
      const teamBHoleScore = derive(teamBSorted);

      let winner: 'A' | 'B' | 'tie' | null = null;
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) { winner = 'A'; cumulativeA++; }
        else if (teamBHoleScore < teamAHoleScore) { winner = 'B'; cumulativeB++; }
        else { winner = 'tie'; }
      }

      const diff = cumulativeA - cumulativeB;
      let status = 'All Square';
      if (diff > 0) status = `${teamAName} ${diff} UP`;
      else if (diff < 0) status = `${teamBName} ${Math.abs(diff)} UP`;

      results.push({
        holeNumber: hole,
        teamAScore: teamAHoleScore,
        teamBScore: teamBHoleScore,
        winner,
        cumulativeA,
        cumulativeB,
        status,
      });
    }

    return results;
  };

  const calculateOverall = (derive: Deriver, teamAName: string, teamBName: string): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

    const baseOrder = startOnBack9
      ? [10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const holesToPlay = matchStartHole > 1
      ? baseOrder.slice(baseOrder.indexOf(matchStartHole))
      : baseOrder;

    for (const hole of holesToPlay) {
      const teamARaw = scores
        .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));
      const teamBRaw = scores
        .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
        .map((s) => getScoreValue(s, netContext));

      const teamASorted = [...teamARaw].sort((a, b) => a - b);
      const teamBSorted = [...teamBRaw].sort((a, b) => a - b);

      const teamAHoleScore = derive(teamASorted);
      const teamBHoleScore = derive(teamBSorted);

      let winner: 'A' | 'B' | 'tie' | null = null;
      if (teamAHoleScore !== null && teamBHoleScore !== null) {
        if (teamAHoleScore < teamBHoleScore) { winner = 'A'; cumulativeA++; }
        else if (teamBHoleScore < teamAHoleScore) { winner = 'B'; cumulativeB++; }
        else { winner = 'tie'; }
      }

      const diff = cumulativeA - cumulativeB;
      let status = 'All Square';
      if (diff > 0) status = `${teamAName} ${diff} UP`;
      else if (diff < 0) status = `${teamBName} ${Math.abs(diff)} UP`;

      results.push({
        holeNumber: hole,
        teamAScore: teamAHoleScore,
        teamBScore: teamBHoleScore,
        winner,
        cumulativeA,
        cumulativeB,
        status,
      });
    }

    return results;
  };

  const isPress = !!eventMatch.parentMatchId && matchStartHole > 1;
  if (isPress) {
    const pressLeg: 'front9' | 'back9' = matchStartHole <= 9 ? 'front9' : 'back9';
    const f9Start = matchStartHole, f9End = 9;
    const b9Start = matchStartHole, b9End = 18;
    return {
      oneBall: {
        front9: pressLeg === 'front9' ? calculateRange(f9Start, f9End, lowestScore, teamA.name, teamB.name) : [],
        back9: pressLeg === 'back9' ? calculateRange(b9Start, b9End, lowestScore, teamA.name, teamB.name) : [],
        overall: [],
      },
      twoThirdBall: {
        front9: pressLeg === 'front9' ? calculateRange(f9Start, f9End, sumOfSecondAndThird, teamA.name, teamB.name) : [],
        back9: pressLeg === 'back9' ? calculateRange(b9Start, b9End, sumOfSecondAndThird, teamA.name, teamB.name) : [],
        overall: [],
      },
    };
  }
  return {
    oneBall: {
      front9: calculateRange(1, 9, lowestScore, teamA.name, teamB.name),
      back9: calculateRange(10, 18, lowestScore, teamA.name, teamB.name),
      overall: calculateOverall(lowestScore, teamA.name, teamB.name),
    },
    twoThirdBall: {
      front9: calculateRange(1, 9, sumOfSecondAndThird, teamA.name, teamB.name),
      back9: calculateRange(10, 18, sumOfSecondAndThird, teamA.name, teamB.name),
      overall: calculateOverall(sumOfSecondAndThird, teamA.name, teamB.name),
    },
  };
}

// Storage format for event match results
export interface StorableEventMatchResult {
  eventMatchId: number;
  playerId: number;
  playerName: string;
  amount: number; // in cents
  betType?: string;
  isComplete?: boolean;
  isAutoPress?: boolean;
  teamName?: string;
  teamIndex?: number;
}

/**
 * Calculate results for a single event match and return them in a format suitable for storage.
 * This is useful for persisting calculated results to ensure consistency between views.
 */
export function calculateEventMatchResults(
  eventMatch: EventMatchWithUnit,
  scores: Score[],
  netContext: NetScoringContext | null = null,
  pars: number[] | null = null
): StorableEventMatchResult[] {
  // Use calculateLedger to get entries for this single event match
  // Key by eventMatch.id (event match ID), not eventId (parent match), to match calculateLedger's lookup
  const { entries } = calculateLedger([eventMatch], scores, netContext ? new Map([[eventMatch.id, netContext]]) : null, pars);
  
  // Convert ledger entries to storable format (amounts in cents)
  return entries.map(entry => ({
    eventMatchId: eventMatch.id,
    playerId: entry.playerId,
    playerName: entry.playerName,
    amount: Math.round(entry.amount * 100), // Convert dollars to cents
    betType: entry.betType,
    isComplete: entry.isComplete,
    isAutoPress: entry.isAutoPress || false,
    teamName: entry.teamName,
    teamIndex: entry.teamIndex,
  }));
}

/**
 * Calculate results for all event matches in a list and return them grouped by event match ID.
 */
export function calculateAllEventMatchResults(
  eventMatches: EventMatchWithUnit[],
  scores: Score[],
  netContextMap: Map<number, NetScoringContext> | null = null,
  pars: number[] | null = null
): Map<number, StorableEventMatchResult[]> {
  const { entries } = calculateLedger(eventMatches, scores, netContextMap, pars);
  
  // Group entries by event match ID
  const resultsByMatch = new Map<number, StorableEventMatchResult[]>();
  
  for (const entry of entries) {
    const results = resultsByMatch.get(entry.matchId) || [];
    results.push({
      eventMatchId: entry.matchId,
      playerId: entry.playerId,
      playerName: entry.playerName,
      amount: Math.round(entry.amount * 100), // Convert dollars to cents
      betType: entry.betType,
      isComplete: entry.isComplete,
      isAutoPress: entry.isAutoPress || false,
      teamName: entry.teamName,
      teamIndex: entry.teamIndex,
    });
    resultsByMatch.set(entry.matchId, results);
  }
  
  return resultsByMatch;
}
