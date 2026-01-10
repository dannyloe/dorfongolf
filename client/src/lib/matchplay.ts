interface Score {
  id: number;
  matchId: number;
  playerId: number;
  holeNumber: number;
  strokes: number;
}

interface TeamMember {
  id: number;
  teamId: number;
  playerId: number;
  player?: { id: number; name: string };
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
  scores: Score[]
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
      .map((s) => s.strokes);
    
    const teamBScores = scores
      .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
      .map((s) => s.strokes);

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
}

export function calculateLedger(
  eventMatches: EventMatchWithUnit[],
  scores: Score[]
): { entries: LedgerEntry[]; balances: PlayerBalance[] } {
  const entries: LedgerEntry[] = [];
  const playerTotals: Map<number, { name: string; won: number; lost: number; matches: number }> = new Map();

  for (const em of eventMatches) {
    const teamA = em.teams[0];
    const teamB = em.teams[1];
    if (!teamA || !teamB) continue;

    const results = calculateMatchPlayResults(em, scores);
    const settlement = calculateBetSettlements(em.unitAmount || 0, teamA, teamB, results, em.matchType);

    for (const s of settlement.settlements) {
      entries.push({
        matchId: em.id,
        matchName: em.name,
        playerId: s.playerId,
        playerName: s.playerName,
        amount: s.amount,
        isComplete: settlement.isComplete,
      });

      if (settlement.isComplete) {
        const existing = playerTotals.get(s.playerId) || { name: s.playerName, won: 0, lost: 0, matches: 0 };
        if (s.amount > 0) {
          existing.won += s.amount;
        } else if (s.amount < 0) {
          existing.lost += Math.abs(s.amount);
        }
        existing.matches++;
        playerTotals.set(s.playerId, existing);
      }
    }
  }

  const balances: PlayerBalance[] = Array.from(playerTotals.entries()).map(([playerId, data]) => ({
    playerId,
    playerName: data.name,
    totalWon: Math.round(data.won * 100) / 100,
    totalLost: Math.round(data.lost * 100) / 100,
    netBalance: Math.round((data.won - data.lost) * 100) / 100,
    matchesPlayed: data.matches,
  }));

  balances.sort((a, b) => b.netBalance - a.netBalance);

  return { entries, balances };
}

export function calculateBetSettlements(
  unitAmountCents: number,
  teamA: Team,
  teamB: Team,
  results: HoleResult[],
  matchType?: string
): MatchSettlement {
  const winner = getMatchWinner(results, matchType);
  const unitAmount = unitAmountCents / 100;
  
  const teamASize = teamA.members.length;
  const teamBSize = teamB.members.length;
  const maxTeamSize = Math.max(teamASize, teamBSize);
  const totalPot = unitAmount * maxTeamSize;
  
  if (winner === null) {
    return {
      isComplete: false,
      isTie: false,
      winner: null,
      winningTeamName: null,
      settlements: [],
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
  
  let winAmount: number;
  let loseAmount: number;
  
  if (winningTeamSize >= losingTeamSize) {
    winAmount = unitAmount;
    loseAmount = totalPot / losingTeamSize;
  } else {
    winAmount = totalPot / winningTeamSize;
    loseAmount = unitAmount;
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
    totalPot,
  };
}
