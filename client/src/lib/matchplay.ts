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

export function calculateMatchPlayResults(
  eventMatch: EventMatch,
  scores: Score[]
): HoleResult[] {
  const teamA = eventMatch.teams[0];
  const teamB = eventMatch.teams[1];

  if (!teamA || !teamB) return [];

  const teamAPlayerIds = new Set(teamA.members.map((m) => m.playerId));
  const teamBPlayerIds = new Set(teamB.members.map((m) => m.playerId));

  const results: HoleResult[] = [];
  let cumulativeA = 0;
  let cumulativeB = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const teamAScores = scores
      .filter((s) => s.holeNumber === hole && teamAPlayerIds.has(s.playerId))
      .map((s) => s.strokes);
    
    const teamBScores = scores
      .filter((s) => s.holeNumber === hole && teamBPlayerIds.has(s.playerId))
      .map((s) => s.strokes);

    const teamABest = teamAScores.length > 0 ? Math.min(...teamAScores) : null;
    const teamBBest = teamBScores.length > 0 ? Math.min(...teamBScores) : null;

    let winner: 'A' | 'B' | 'tie' | null = null;
    
    if (teamABest !== null && teamBBest !== null) {
      if (teamABest < teamBBest) {
        winner = 'A';
        cumulativeA++;
      } else if (teamBBest < teamABest) {
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
      teamAScore: teamABest,
      teamBScore: teamBBest,
      winner,
      cumulativeA,
      cumulativeB,
      status,
    });
  }

  return results;
}

export function getMatchStatus(results: HoleResult[], teamA: Team, teamB: Team): string {
  const lastPlayedHole = results.filter(r => r.teamAScore !== null && r.teamBScore !== null).pop();
  
  if (!lastPlayedHole) return 'Not started';
  
  const diff = lastPlayedHole.cumulativeA - lastPlayedHole.cumulativeB;
  const holesRemaining = 18 - lastPlayedHole.holeNumber;
  
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
