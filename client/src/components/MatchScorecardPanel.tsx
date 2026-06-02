import { useQuery } from "@tanstack/react-query";
import { buildUrl, api } from "@shared/routes";
import { Loader2 } from "lucide-react";
import {
  calculateMatchPlayResults,
  calculateNassauResults,
  calculateNassauSettlements,
  calculateBetSettlements,
  calculateDeathMatchResults,
  calculateTwoThreeBallResults,
  calculateOneTwoThreeBallResults,
  type HoleResult,
  type NassauResults,
  type NassauSettlement,
  type NetScoringContext,
} from "@/lib/matchplay";
import { buildNetScoringContext, type PlayerHandicapInfo } from "@/lib/handicap";

interface MatchScorecardPanelProps {
  parentMatchId: number;
  eventMatchId: number;
}

function ScoreCellCompact({ score }: { score: number | null }) {
  if (score === null) return <span className="text-muted-foreground font-mono text-xs">–</span>;
  return <span className="font-mono text-xs">{score}</span>;
}

// Renders a diff cell for a given hole result, placed by holeNumber
function DiffCellForHole({ results, hole }: { results: HoleResult[]; hole: number }) {
  const r = results.find(res => res.holeNumber === hole);
  if (!r) return <td className="p-1 text-center text-muted-foreground/20 text-xs">–</td>;
  const has = r.teamAScore !== null && r.teamBScore !== null;
  if (!has) return <td className="p-1 text-center text-muted-foreground/40 text-xs">–</td>;
  const diff = r.cumulativeA - r.cumulativeB;
  if (diff > 0) return <td className="p-1 text-center font-bold text-primary text-xs">{diff}↑</td>;
  if (diff < 0) return <td className="p-1 text-center font-bold text-destructive text-xs">{Math.abs(diff)}↑</td>;
  return <td className="p-1 text-center text-muted-foreground text-xs">AS</td>;
}

function legStatusLabel(results: HoleResult[], ns: NassauSettlement | undefined, teamAName: string, teamBName: string): string {
  const played = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  if (!played.length) return '–';
  const last = played[played.length - 1];
  const d = last.cumulativeA - last.cumulativeB;
  if (ns?.settlement.isComplete) {
    if (ns.settlement.winner === 'A') return `${teamAName} wins`;
    if (ns.settlement.winner === 'B') return `${teamBName} wins`;
    return 'Halved';
  }
  if (d > 0) return `${teamAName} ${d} Up`;
  if (d < 0) return `${teamBName} ${Math.abs(d)} Up`;
  return 'A/S';
}

// Nassau-style status rows for a given NassauResults leg set (3 rows: F9 / B9 / Overall)
function NassauStatusRows({
  nassauResults,
  nassauSettlements,
  teamAName,
  teamBName,
  label,
}: {
  nassauResults: NassauResults;
  nassauSettlements: NassauSettlement[];
  teamAName: string;
  teamBName: string;
  label?: string;
}) {
  const firstNine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const secondNine = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const prefix = label ? `${label} ` : '';
  return (
    <>
      <tr className="border-t-2 border-border bg-blue-50/50 dark:bg-blue-950/30">
        <td className="p-1 font-semibold text-xs text-primary">{prefix}F9</td>
        {firstNine.map(h => <DiffCellForHole key={h} results={nassauResults.front9} hole={h} />)}
        <td className="bg-muted/30 p-1" />
        {secondNine.map(h => (
          <td key={h} className="p-1 text-center text-muted-foreground/20 text-xs">–</td>
        ))}
        <td className="bg-muted/30 p-1" />
        <td className="text-center p-1 text-xs font-semibold">
          {legStatusLabel(nassauResults.front9, nassauSettlements.find(n => n.betName === 'Front 9'), teamAName, teamBName)}
        </td>
      </tr>
      <tr className="border-t border-border/50 bg-green-50/50 dark:bg-green-950/30">
        <td className="p-1 font-semibold text-xs text-emerald-700 dark:text-emerald-400">{prefix}B9</td>
        {firstNine.map(h => (
          <td key={h} className="p-1 text-center text-muted-foreground/20 text-xs">–</td>
        ))}
        <td className="bg-muted/30 p-1" />
        {secondNine.map(h => <DiffCellForHole key={h} results={nassauResults.back9} hole={h} />)}
        <td className="bg-muted/30 p-1" />
        <td className="text-center p-1 text-xs font-semibold">
          {legStatusLabel(nassauResults.back9, nassauSettlements.find(n => n.betName === 'Back 9'), teamAName, teamBName)}
        </td>
      </tr>
      <tr className="border-t border-border/50 bg-amber-50/50 dark:bg-amber-950/30">
        <td className="p-1 font-semibold text-xs text-amber-700 dark:text-amber-400">{prefix}Ov</td>
        {firstNine.map(h => <DiffCellForHole key={h} results={nassauResults.overall} hole={h} />)}
        <td className="bg-muted/30 p-1" />
        {secondNine.map(h => <DiffCellForHole key={h} results={nassauResults.overall} hole={h} />)}
        <td className="bg-muted/30 p-1" />
        <td className="text-center p-1 text-xs font-semibold">
          {legStatusLabel(nassauResults.overall, nassauSettlements.find(n => n.betName === 'Overall'), teamAName, teamBName)}
        </td>
      </tr>
    </>
  );
}

// Single match-play/stroke-play status row, placed by holeNumber
function MatchPlayStatusRow({
  results,
  label,
  settlement,
  teamAName,
  teamBName,
  colorClass = 'bg-blue-50/50 dark:bg-blue-950/30',
}: {
  results: HoleResult[];
  label: string;
  settlement: { isComplete: boolean; winner: 'A' | 'B' | 'tie' | null } | null;
  teamAName: string;
  teamBName: string;
  colorClass?: string;
}) {
  const firstNine = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const secondNine = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const played = results.filter(r => r.teamAScore !== null && r.teamBScore !== null);
  const last = played[played.length - 1];
  let statusText = '–';
  if (last) {
    const d = last.cumulativeA - last.cumulativeB;
    if (settlement?.isComplete) {
      statusText = settlement.winner === 'A' ? `${teamAName} wins` : settlement.winner === 'B' ? `${teamBName} wins` : 'Halved';
    } else {
      statusText = d > 0 ? `${teamAName} ${d} Up` : d < 0 ? `${teamBName} ${Math.abs(d)} Up` : 'A/S';
    }
  }
  return (
    <tr className={`border-t-2 border-border ${colorClass}`}>
      <td className="p-1 font-semibold text-xs text-primary">{label}</td>
      {firstNine.map(h => <DiffCellForHole key={h} results={results} hole={h} />)}
      <td className="bg-muted/30 p-1" />
      {secondNine.map(h => <DiffCellForHole key={h} results={results} hole={h} />)}
      <td className="bg-muted/30 p-1" />
      <td className="text-center p-1 text-xs font-semibold">{statusText}</td>
    </tr>
  );
}

export function MatchScorecardPanel({ parentMatchId, eventMatchId }: MatchScorecardPanelProps) {
  const { data: match, isLoading } = useQuery({
    queryKey: [api.matches.get.path, parentMatchId],
    queryFn: async () => {
      const url = buildUrl(api.matches.get.path, { id: parentMatchId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch match");
      return res.json();
    },
    enabled: !!parentMatchId,
  });

  const needsNetContext = !!(match?.isHandicapped && match?.courseId);

  const { data: courseTees } = useQuery({
    queryKey: [api.courses.getTees.path, match?.courseId],
    queryFn: async () => {
      const url = buildUrl(api.courses.getTees.path, { id: match!.courseId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: needsNetContext,
  });

  const { data: allCourses } = useQuery({
    queryKey: [api.courses.list.path],
    queryFn: async () => {
      const res = await fetch(api.courses.list.path, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: needsNetContext,
  });

  const { data: handicapOverrides } = useQuery({
    queryKey: [`/api/matches/${parentMatchId}/all-player-handicaps`],
    queryFn: async () => {
      const res = await fetch(`/api/matches/${parentMatchId}/all-player-handicaps`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: needsNetContext,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground gap-2 text-sm bg-muted/10">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading scorecard…
      </div>
    );
  }

  if (!match) return null;

  const scores: any[] = match.scores || [];
  const eventMatches: any[] = match.eventMatches || [];
  const eventMatch = eventMatches.find((em: any) => em.id === eventMatchId);

  if (!eventMatch) {
    return (
      <div className="py-4 px-6 text-sm text-muted-foreground bg-muted/10">
        Scorecard not available.
      </div>
    );
  }

  const teamA = eventMatch.teams?.[0];
  const teamB = eventMatch.teams?.[1];
  const teamAName: string = teamA?.name ?? 'Team A';
  const teamBName: string = teamB?.name ?? 'Team B';

  // Build net scoring context for handicapped matches
  let netContext: NetScoringContext | null = null;
  if (eventMatch.useNetScoring && needsNetContext && courseTees && allCourses && handicapOverrides) {
    try {
      const courseHoles = (allCourses as any[]).find((c: any) => c.id === match.courseId)?.holes ?? [];
      const playerInfos: PlayerHandicapInfo[] = [];
      for (const team of eventMatch.teams || []) {
        for (const m of team.members || []) {
          playerInfos.push({
            playerId: m.playerId,
            playerName: m.player?.name || `Player ${m.playerId}`,
            handicapIndex: m.player?.handicapIndex ?? null,
            teeId: m.player?.teeId ?? null,
          });
        }
      }
      const overridesForEm = (handicapOverrides as any[]).filter((o: any) => o.eventMatchId === eventMatchId);
      netContext = buildNetScoringContext(playerInfos, courseTees, courseHoles, overridesForEm);
    } catch (_) {}
  }

  const getScore = (playerId: number, hole: number): number | null => {
    const s = scores.find((sc: any) => sc.playerId === playerId && sc.holeNumber === hole && sc.matchId === parentMatchId);
    return s ? s.strokes : null;
  };

  const holeSum = (playerId: number, from: number, to: number): number | null => {
    let total = 0, hasAny = false;
    for (let h = from; h <= to; h++) {
      const s = getScore(playerId, h);
      if (s !== null) { total += s; hasAny = true; }
    }
    return hasAny ? total : null;
  };

  const firstNineHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const secondNineHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const matchType = eventMatch.matchType as string;

  // ── Calculate results by match type ──
  const isNassau = matchType === 'nassau';
  const isDeathMatch = matchType === 'death_match';
  const isTwoThreeBall = matchType === 'two_three_ball';
  const isOneTwoThreeBall = matchType === 'one_two_three_ball';

  let nassauResults: ReturnType<typeof calculateNassauResults> | null = null;
  let nassauSettlements: NassauSettlement[] | null = null;
  let matchPlayResults: HoleResult[] | null = null;
  let matchPlaySettlement: ReturnType<typeof calculateBetSettlements> | null = null;
  let dmResults: ReturnType<typeof calculateDeathMatchResults> | null = null;
  let ttbResults: ReturnType<typeof calculateTwoThreeBallResults> | null = null;
  let otzbResults: ReturnType<typeof calculateOneTwoThreeBallResults> | null = null;

  if (isNassau && teamA && teamB) {
    nassauResults = calculateNassauResults(eventMatch, scores, netContext);
    nassauSettlements = calculateNassauSettlements(
      eventMatch.unitAmount || 0, teamA, teamB, nassauResults,
      { front9: eventMatch.autoPressNassauFront9 ?? true, back9: eventMatch.autoPressNassauBack9 ?? true, overall: eventMatch.autoPressNassauOverall ?? true }
    );
  } else if (isDeathMatch && teamA && teamB) {
    dmResults = calculateDeathMatchResults(eventMatch, scores, netContext);
  } else if (isTwoThreeBall && teamA && teamB) {
    ttbResults = calculateTwoThreeBallResults(eventMatch, scores, netContext);
  } else if (isOneTwoThreeBall && teamA && teamB) {
    otzbResults = calculateOneTwoThreeBallResults(eventMatch, scores, netContext);
  } else if (teamA && teamB) {
    matchPlayResults = calculateMatchPlayResults(eventMatch, scores, netContext);
    matchPlaySettlement = calculateBetSettlements(
      eventMatch.unitAmount || 0, teamA, teamB, matchPlayResults,
      matchType, eventMatch.autoPressOriginal || false
    );
  }

  // Death match settlement snapshots
  const dmBBSettlement = dmResults ? {
    isComplete: dmResults.bestBall.isComplete,
    winner: dmResults.bestBall.winner,
  } : null;
  const dm2BSettlement = dmResults ? {
    isComplete: dmResults.secondBall.isComplete,
    winner: dmResults.secondBall.winner,
  } : null;

  return (
    <div className="bg-muted/10 border-t border-border/40">
      <div className="overflow-x-auto">
        <div className="min-w-[680px] p-3 space-y-3">

          {/* ── Scorecard Table ── */}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left p-1 pr-3 font-medium min-w-[90px]">Player</th>
                {firstNineHoles.map(h => (
                  <th key={h} className="text-center p-1 w-7 font-normal">{h}</th>
                ))}
                <th className="text-center p-1 w-8 font-semibold text-foreground">Out</th>
                {secondNineHoles.map(h => (
                  <th key={h} className="text-center p-1 w-7 font-normal">{h}</th>
                ))}
                <th className="text-center p-1 w-8 font-semibold text-foreground">In</th>
                <th className="text-center p-1 w-8 font-semibold text-foreground">Tot</th>
              </tr>
            </thead>
            <tbody>
              {[...(teamA?.members ?? []), ...(teamB?.members ?? [])].map((m: any) => {
                const pid: number = m.playerId;
                const name: string = m.player?.name || `#${pid}`;
                const out = holeSum(pid, 1, 9);
                const inVal = holeSum(pid, 10, 18);
                const total = out !== null && inVal !== null ? out + inVal : (out ?? inVal);
                return (
                  <tr key={pid} className="border-t border-border/20">
                    <td className="p-1 pr-3 font-medium truncate max-w-[90px]">{name}</td>
                    {firstNineHoles.map(h => (
                      <td key={h} className="text-center p-0.5">
                        <ScoreCellCompact score={getScore(pid, h)} />
                      </td>
                    ))}
                    <td className="text-center p-0.5 font-semibold bg-muted/20">
                      {out !== null ? out : <span className="text-muted-foreground">–</span>}
                    </td>
                    {secondNineHoles.map(h => (
                      <td key={h} className="text-center p-0.5">
                        <ScoreCellCompact score={getScore(pid, h)} />
                      </td>
                    ))}
                    <td className="text-center p-0.5 font-semibold bg-muted/20">
                      {inVal !== null ? inVal : <span className="text-muted-foreground">–</span>}
                    </td>
                    <td className="text-center p-0.5 font-bold bg-muted/30">
                      {total !== null ? total : <span className="text-muted-foreground">–</span>}
                    </td>
                  </tr>
                );
              })}

              {/* ── Nassau Status Rows ── */}
              {isNassau && nassauResults && nassauSettlements && (
                <NassauStatusRows
                  nassauResults={nassauResults}
                  nassauSettlements={nassauSettlements}
                  teamAName={teamAName}
                  teamBName={teamBName}
                />
              )}

              {/* ── Death Match Status Rows: Best Ball (stroke) + 2nd Ball (match play) ── */}
              {isDeathMatch && dmResults && (
                <>
                  <MatchPlayStatusRow
                    results={dmResults.bestBall.results}
                    label="BB"
                    settlement={dmBBSettlement}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    colorClass="bg-blue-50/50 dark:bg-blue-950/30"
                  />
                  <MatchPlayStatusRow
                    results={dmResults.secondBall.results}
                    label="2nd"
                    settlement={dm2BSettlement}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    colorClass="bg-green-50/50 dark:bg-green-950/30"
                  />
                </>
              )}

              {/* ── Two/Three Ball Nassau-Style Rows ── */}
              {isTwoThreeBall && ttbResults && teamA && teamB && (
                <>
                  <NassauStatusRows
                    nassauResults={ttbResults.twoBall}
                    nassauSettlements={[]}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    label="2B"
                  />
                  <NassauStatusRows
                    nassauResults={ttbResults.threeBall}
                    nassauSettlements={[]}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    label="3B"
                  />
                </>
              )}

              {/* ── One/Two/Three Ball Nassau-Style Rows ── */}
              {isOneTwoThreeBall && otzbResults && teamA && teamB && (
                <>
                  <NassauStatusRows
                    nassauResults={otzbResults.oneBall}
                    nassauSettlements={[]}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    label="1B"
                  />
                  <NassauStatusRows
                    nassauResults={otzbResults.twoThirdBall}
                    nassauSettlements={[]}
                    teamAName={teamAName}
                    teamBName={teamBName}
                    label="23B"
                  />
                </>
              )}

              {/* ── Standard Match Play Status Row ── */}
              {!isNassau && !isDeathMatch && !isTwoThreeBall && !isOneTwoThreeBall && matchPlayResults && (
                <MatchPlayStatusRow
                  results={matchPlayResults}
                  label="Status"
                  settlement={matchPlaySettlement ? { isComplete: matchPlaySettlement.isComplete, winner: matchPlaySettlement.winner } : null}
                  teamAName={teamAName}
                  teamBName={teamBName}
                />
              )}
            </tbody>
          </table>

          {/* ── Net Scoring Indicator ── */}
          {eventMatch.useNetScoring && (
            <p className="text-xs text-muted-foreground italic">
              {netContext ? 'Net scoring applied (handicap-adjusted).' : 'Net scoring enabled; handicap data loading…'}
            </p>
          )}

          {/* ── Team Names ── */}
          {teamA && teamB && (
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />
                <span className="font-semibold text-primary">{teamAName}</span>
                <span className="text-muted-foreground">
                  ({teamA.members?.map((m: any) => m.player?.name || `#${m.playerId}`).join(', ')})
                </span>
              </div>
              <span className="text-muted-foreground">vs</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-destructive inline-block" />
                <span className="font-semibold text-destructive">{teamBName}</span>
                <span className="text-muted-foreground">
                  ({teamB.members?.map((m: any) => m.player?.name || `#${m.playerId}`).join(', ')})
                </span>
              </div>
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
