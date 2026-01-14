import { type NetScoringContext, getNetStrokes } from './handicap';
export type { NetScoringContext } from './handicap';

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
  matchType: string;
  startHole?: number;
  parentMatchId?: number | null;
  autoPressOriginal?: boolean;
  autoPressAllPresses?: boolean;
  autoPressNassauFront9?: boolean;
  autoPressNassauBack9?: boolean;
  autoPressNassauOverall?: boolean;
  useNetScoring?: boolean;
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
  const startHole = eventMatch.startHole || 1;

  if (!teamA || !teamB) return [];

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  const results: HoleResult[] = [];
  let cumulativeA = 0;
  let cumulativeB = 0;

  const isStrokePlay = matchType === 'stroke_play';

  for (let hole = startHole; hole <= 18; hole++) {
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
  const lastPlayedHole = results.filter(r => r.teamAScore !== null && r.teamBScore !== null).pop();
  
  if (!lastPlayedHole) return 'Not started';
  
  const isStrokePlay = matchType === 'stroke_play';
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  const holesRemaining = 18 - lastPlayedHole.holeNumber;
  
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
}

export function getMatchWinner(results: HoleResult[], matchType?: string): 'A' | 'B' | 'tie' | null {
  const lastPlayedHole = results.filter(r => r.teamAScore !== null && r.teamBScore !== null).pop();
  
  if (!lastPlayedHole) return null;
  
  const isStrokePlay = matchType === 'stroke_play';
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  const holesRemaining = 18 - lastPlayedHole.holeNumber;
  
  if (isStrokePlay) {
    // Stroke play: only complete after 18 holes, lower strokes wins
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
  netContextMap: Map<number, NetScoringContext> | null = null
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

    if (em.matchType === 'skins') {
      // Skins match - use teamA to get the included player IDs
      const includedPlayerIds = teamA.members.map(m => m.playerId);
      const playerNames = new Map<number, string>();
      for (const member of teamA.members) {
        playerNames.set(member.playerId, member.player?.name || `Player ${member.playerId}`);
      }
      
      // Only use netContext if this specific event match has useNetScoring enabled
      const skinsNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.eventId) || null : null;
      const skinsResult = calculateSkinsResults(includedPlayerIds, playerNames, scores, (em.unitAmount || 0) / 100, skinsNetContext);
      
      for (const s of skinsResult.settlements) {
        entries.push({
          matchId: em.id,
          matchName: em.name,
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
          teamName: s.teamName,
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
      const nassauNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.eventId) || null : null;
      const nassauResults = calculateNassauResults(em, scores, nassauNetContext);
      const nassauAutoPressSettings = {
        front9: em.autoPressNassauFront9 ?? true,
        back9: em.autoPressNassauBack9 ?? true,
        overall: em.autoPressNassauOverall ?? true,
      };
      const nassauSettlements = calculateNassauSettlements(em.unitAmount || 0, teamA, teamB, nassauResults, nassauAutoPressSettings);
      
      // Build player ID to team index lookup
      const playerTeamIndex = new Map<number, number>();
      for (const m of teamA.members) playerTeamIndex.set(m.playerId, 0);
      for (const m of teamB.members) playerTeamIndex.set(m.playerId, 1);
      
      for (const ns of nassauSettlements) {
        for (const s of ns.settlement.settlements) {
          const teamIdx = playerTeamIndex.get(s.playerId) ?? (s.teamName === teamA.name ? 0 : 1);
          entries.push({
            matchId: em.id,
            matchName: `${em.name} - ${ns.betName}`,
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
      const fiveNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.eventId) || null : null;
      const fiveResult = calculateFiveMatchResults(em, scores, fiveNetContext);
      
      // Skip incomplete matches entirely to avoid $0 ledger entries
      if (!fiveResult.isComplete) continue;
      
      const unitAmt = (em.unitAmount || 100) / 100;
      const fiveSettlements = calculateFiveSettlements(fiveResult.teamTotals, unitAmt, fiveResult.isComplete);
      
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
            matchName: em.name,
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
    } else {
      const matchPlayNetContext = em.useNetScoring && netContextMap ? netContextMap.get(em.eventId) || null : null;
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
      
      for (const s of settlement.settlements) {
        const teamIdx = matchPlayerTeamIndex.get(s.playerId) ?? (s.teamName === teamA.name ? 0 : 1);
        entries.push({
          matchId: em.id,
          matchName: em.name,
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
  
  // Auto Press logic: check if one team was 2+ down going into hole 18
  let autoPressMultiplier = 1;
  let autoPressNullified = false;
  
  if (autoPress && results.length >= 2 && matchType !== 'stroke_play') {
    // Get status before hole 18 (after hole 17)
    const hole17Result = results.find(r => r.holeNumber === 17);
    const hole18Result = results.find(r => r.holeNumber === 18);
    
    if (hole17Result && hole18Result && hole18Result.teamAScore !== null && hole18Result.teamBScore !== null) {
      const statusBefore18 = hole17Result.cumulativeA - hole17Result.cumulativeB;
      
      // Check if either team was 2+ down going into 18
      if (Math.abs(statusBefore18) >= 2) {
        const leaderBefore18 = statusBefore18 > 0 ? 'A' : 'B';
        const hole18Winner = hole18Result.winner;
        
        if (hole18Winner === leaderBefore18) {
          // Leader won hole 18 - double the bet
          autoPressMultiplier = 2;
        } else if (hole18Winner === 'tie') {
          // Tie on 18 - unchanged
          autoPressMultiplier = 1;
        } else {
          // Leader lost hole 18 - bet is nullified (push)
          autoPressNullified = true;
        }
      }
    }
  }
  
  const totalPot = unitAmount * maxTeamSize * autoPressMultiplier;
  
  if (winner === null) {
    return {
      isComplete: false,
      isTie: false,
      winner: null,
      winningTeamName: null,
      settlements: [],
      totalPot: unitAmount * maxTeamSize,
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
  };
}

export interface CombinedSettlement {
  totalPot: number;
  allComplete: boolean;
  completedCount: number;
  totalMatches: number;
  playerTotals: { playerId: number; playerName: string; amount: number }[];
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

  for (const match of allMatches) {
    const teamA = match.teams[0];
    const teamB = match.teams[1];
    if (!teamA || !teamB) continue;

    if (match.matchType === 'nassau') {
      // Nassau has 3 bets
      totalBets += 3;
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
      }
    } else {
      // Regular match play or stroke play - 1 bet
      totalBets += 1;
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

  if (!teamA || !teamB) return { front9: [], back9: [], overall: [] };

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  const calculateRange = (startHole: number, endHole: number): HoleResult[] => {
    const results: HoleResult[] = [];
    let cumulativeA = 0;
    let cumulativeB = 0;

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

  return {
    front9: calculateRange(1, 9),
    back9: calculateRange(10, 18),
    overall: calculateRange(1, 18),
  };
}

function getNassauBetWinner(results: HoleResult[], finalHole: number): 'A' | 'B' | 'tie' | null {
  const lastPlayedHole = results.filter(r => r.teamAScore !== null && r.teamBScore !== null).pop();
  
  if (!lastPlayedHole) return null;
  
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  const holesRemaining = finalHole - lastPlayedHole.holeNumber;
  
  // Check for early clinch (e.g., 3 & 2 means 3 up with 2 holes remaining)
  if (Math.abs(diff) > holesRemaining) {
    return diff > 0 ? 'A' : 'B';
  }
  
  // If we've played the final hole, determine winner
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

  const bets: { name: string; results: HoleResult[]; finalHole: number; autoPressCheckHole: number; autoPress: boolean }[] = [
    { name: 'Front 9', results: nassauResults.front9, finalHole: 9, autoPressCheckHole: 8, autoPress: settings.front9 },
    { name: 'Back 9', results: nassauResults.back9, finalHole: 18, autoPressCheckHole: 17, autoPress: settings.back9 },
    { name: 'Overall', results: nassauResults.overall, finalHole: 18, autoPressCheckHole: 17, autoPress: settings.overall },
  ];

  return bets.map(bet => {
    const winner = getNassauBetWinner(bet.results, bet.finalHole);
    const unitAmount = unitAmountCents / 100;
    
    const teamASize = teamA.members.length;
    const teamBSize = teamB.members.length;
    const maxTeamSize = Math.max(teamASize, teamBSize);
    
    let autoPressMultiplier = 1;
    let autoPressNullified = false;
    let autoPressTriggered = false;
    
    if (bet.autoPress && bet.results.length >= 2) {
      const checkHoleResult = bet.results.find(r => r.holeNumber === bet.autoPressCheckHole);
      const finalHoleResult = bet.results.find(r => r.holeNumber === bet.finalHole);
      
      if (checkHoleResult && finalHoleResult && 
          finalHoleResult.teamAScore !== null && finalHoleResult.teamBScore !== null) {
        const statusBeforeFinal = checkHoleResult.cumulativeA - checkHoleResult.cumulativeB;
        
        if (Math.abs(statusBeforeFinal) >= 2) {
          autoPressTriggered = true;
          const leaderBeforeFinal = statusBeforeFinal > 0 ? 'A' : 'B';
          const finalHoleWinner = finalHoleResult.winner;
          
          if (finalHoleWinner === leaderBeforeFinal) {
            autoPressMultiplier = 2;
          } else if (finalHoleWinner === 'tie') {
            autoPressMultiplier = 1;
          } else {
            autoPressNullified = true;
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
        },
        autoPressTriggered,
        autoPressMultiplier,
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
        },
        autoPressTriggered,
        autoPressMultiplier,
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
        },
        autoPressTriggered,
        autoPressMultiplier,
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
      },
      autoPressTriggered,
      autoPressMultiplier,
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
  netContext: NetScoringContext | null = null
): SkinsMatchResult {
  const holeResults: SkinResult[] = [];
  const skinCounts = new Map<number, number>();
  
  // Initialize skin counts for all included players
  for (const playerId of includedPlayerIds) {
    skinCounts.set(playerId, 0);
  }
  
  // Check if all 18 holes have scores for all included players
  let allHolesComplete = true;
  for (let hole = 1; hole <= 18; hole++) {
    const holesScored = includedPlayerIds.every(pid => 
      scores.some(s => s.playerId === pid && s.holeNumber === hole)
    );
    if (!holesScored) {
      allHolesComplete = false;
      break;
    }
  }
  
  // Calculate skins for each hole
  for (let hole = 1; hole <= 18; hole++) {
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
    
    // For holes 1-17: must also tie or beat lowest on next hole
    if (hole < 18) {
      const nextHoleScores = includedPlayerIds.map(playerId => {
        const score = scores.find(s => s.playerId === playerId && s.holeNumber === hole + 1);
        const grossStrokes = score?.strokes ?? null;
        const netStrokes = grossStrokes !== null && score 
          ? getScoreValue(score, netContext) 
          : null;
        return { playerId, strokes: netStrokes };
      }).filter(s => s.strokes !== null) as { playerId: number; strokes: number }[];
      
      if (nextHoleScores.length === 0) {
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
      
      const nextMinScore = Math.min(...nextHoleScores.map(s => s.strokes));
      const winnerNextScore = nextHoleScores.find(s => s.playerId === potentialWinner.playerId);
      
      if (winnerNextScore && winnerNextScore.strokes <= nextMinScore) {
        // Winner tied or beat lowest on next hole - skin awarded!
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
        // Winner didn't tie/beat on next hole - no skin
        holeResults.push({
          holeNumber: hole,
          winnerId: potentialWinner.playerId,
          winnerName: playerNames.get(potentialWinner.playerId) || 'Unknown',
          lowestScore: minScore,
          isSkin: false,
        });
      }
    } else {
      // Hole 18: just needs lone low score
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
  
  // Build player ID sets for each team
  const teamPlayerIds = teams.map(team => 
    new Set(team.members.map(m => m.playerId))
  );
  
  const holeResults: FiveTeamHoleResult[] = [];
  const teamCumulativeScores = teams.map(() => 0);
  const teamHolesCompleted = teams.map(() => 0);
  let allComplete = true;
  
  for (let hole = 1; hole <= 18; hole++) {
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
  
  // Check if all teams have completed all 18 holes
  const isComplete = allComplete && teamHolesCompleted.every(h => h === 18);
  
  return {
    holeResults,
    teamTotals,
    settlements: [], // Settlements calculated separately with wager amount
    isComplete,
    smallestTeamSize,
  };
}

export function calculateFiveSettlements(
  teamTotals: FiveTeamTotalResult[],
  unitAmount: number, // Amount in dollars (e.g. 1 = $1)
  isComplete: boolean
): FiveSettlement[] {
  if (!isComplete || teamTotals.length < 2) {
    return teamTotals.map(t => ({
      teamIndex: t.teamIndex,
      teamName: t.teamName,
      amount: 0,
    }));
  }
  
  // Round-robin settlement: each team pays each other team the stroke difference × wager
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
      const payment = strokeDiff * unitAmount; // Negative means Team I wins
      
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
