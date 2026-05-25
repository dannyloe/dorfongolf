import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

type HoleEntry = { holeNumber: number; strokes: number | null };
type GeminiPlayer = { playerName: string; holes: HoleEntry[] };
type AppliedPlayer = { playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> };

type ScanCorrectionLog = {
  id: number;
  matchId: number;
  pendingScanId: number | null;
  courseName: string;
  geminiOutput: GeminiPlayer[];
  appliedOutput: AppliedPlayer[];
  playerNames: string[];
  createdAt: string | null;
  matchName: string | null;
};

type HoleDiff = {
  hole: number;
  gemini: number | null;
  applied: number | null;
  changed: boolean;
  shiftSuspect: boolean;
};

function detectShift(diffs: HoleDiff[]): boolean {
  const changed = diffs.filter(d => d.changed);
  if (changed.length < 3) return false;
  const sortedHoles = [...changed].sort((a, b) => a.hole - b.hole);
  let consecutiveShifts = 0;
  for (let i = 0; i < sortedHoles.length - 1; i++) {
    const cur = sortedHoles[i];
    const next = sortedHoles[i + 1];
    if (next.hole === cur.hole + 1 && cur.gemini !== null && next.applied !== null && cur.gemini === next.applied) {
      consecutiveShifts++;
    }
  }
  return consecutiveShifts >= 2;
}

function buildDiffs(geminiPlayer: GeminiPlayer, appliedPlayer: AppliedPlayer): HoleDiff[] {
  const geminiMap = new Map<number, number | null>();
  for (const h of geminiPlayer.holes) geminiMap.set(h.holeNumber, h.strokes);
  const appliedMap = new Map<number, number>();
  for (const h of appliedPlayer.holes) appliedMap.set(h.holeNumber, h.strokes);

  const diffs: HoleDiff[] = [];
  for (let hole = 1; hole <= 18; hole++) {
    const gemini = geminiMap.has(hole) ? geminiMap.get(hole)! : null;
    const applied = appliedMap.has(hole) ? appliedMap.get(hole)! : null;
    const changed = gemini !== applied;
    diffs.push({ hole, gemini, applied, changed, shiftSuspect: false });
  }

  const isShift = detectShift(diffs);
  if (isShift) {
    for (const d of diffs) {
      if (d.changed) d.shiftSuspect = true;
    }
  }
  return diffs;
}

function PlayerDiffTable({ geminiPlayer, appliedPlayer }: { geminiPlayer: GeminiPlayer; appliedPlayer: AppliedPlayer }) {
  const diffs = buildDiffs(geminiPlayer, appliedPlayer);
  const hasChanges = diffs.some(d => d.changed);
  const hasShift = diffs.some(d => d.shiftSuspect);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold">{appliedPlayer.playerName}</span>
        {!hasChanges && <Badge variant="secondary" className="text-xs">Accepted as-is</Badge>}
        {hasChanges && !hasShift && <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Edited</Badge>}
        {hasShift && (
          <Badge className="text-xs bg-red-100 text-red-700 border-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />Shift detected
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full min-w-max">
          <thead>
            <tr className="bg-muted/50">
              <td className="px-2 py-1 font-medium text-muted-foreground w-20">Hole</td>
              {diffs.map(d => (
                <td
                  key={d.hole}
                  className={`px-2 py-1 text-center font-medium w-8 ${d.changed ? (d.shiftSuspect ? "bg-red-100 dark:bg-red-900/30" : "bg-orange-50 dark:bg-orange-900/20") : ""}`}
                  data-testid={`hole-header-${d.hole}`}
                >
                  {d.hole}
                </td>
              ))}
            </tr>
            <tr className="border-b border-border/50">
              <td className="px-2 py-1 text-muted-foreground">Gemini</td>
              {diffs.map(d => (
                <td
                  key={d.hole}
                  className={`px-2 py-1 text-center ${d.changed ? (d.shiftSuspect ? "bg-red-100 dark:bg-red-900/30 text-red-700" : "bg-orange-50 dark:bg-orange-900/20 text-orange-700") : ""}`}
                  data-testid={`gemini-hole-${d.hole}`}
                >
                  {d.gemini ?? <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-2 py-1 text-muted-foreground">Saved</td>
              {diffs.map(d => (
                <td
                  key={d.hole}
                  className={`px-2 py-1 text-center font-medium ${d.changed ? (d.shiftSuspect ? "bg-red-100 dark:bg-red-900/30 text-red-800" : "bg-orange-50 dark:bg-orange-900/20 text-orange-800") : ""}`}
                  data-testid={`saved-hole-${d.hole}`}
                >
                  {d.applied ?? <span className="text-muted-foreground">—</span>}
                </td>
              ))}
            </tr>
          </thead>
        </table>
      </div>
    </div>
  );
}

function LogRow({ log }: { log: ScanCorrectionLog }) {
  const [expanded, setExpanded] = useState(false);

  const totalChanges = log.appliedOutput.reduce((acc, ap) => {
    const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
    if (!gp) return acc;
    const diffs = buildDiffs(gp, ap);
    return acc + diffs.filter(d => d.changed).length;
  }, 0);

  const hasShift = log.appliedOutput.some(ap => {
    const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
    if (!gp) return false;
    return detectShift(buildDiffs(gp, ap));
  });

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden" data-testid={`scan-log-row-${log.id}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-expand-log-${log.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{log.matchName || `Match #${log.matchId}`}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground truncate">{log.courseName}</span>
            {hasShift && (
              <Badge className="text-xs bg-red-100 text-red-700 border-red-300 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />Shift
              </Badge>
            )}
            {totalChanges > 0 && !hasShift && (
              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                {totalChanges} edit{totalChanges !== 1 ? "s" : ""}
              </Badge>
            )}
            {totalChanges === 0 && (
              <Badge variant="secondary" className="text-xs">No edits</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {log.createdAt ? format(new Date(log.createdAt), "MMM d, yyyy h:mm a") : "Unknown date"}
            </span>
            <span className="text-xs text-muted-foreground">{log.playerNames.join(", ")}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-4">
          {log.appliedOutput.length === 0 ? (
            <p className="text-sm text-muted-foreground">No score data recorded.</p>
          ) : (
            log.appliedOutput.map(ap => {
              const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
              if (!gp) return null;
              return (
                <PlayerDiffTable key={ap.playerId} geminiPlayer={gp} appliedPlayer={ap} />
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

const ADMIN_USER_ID = "52861828";

export default function AdminScanLogs() {
  const { user } = useAuth();
  const { data: logs, isLoading, error } = useQuery<ScanCorrectionLog[]>({
    queryKey: ["/api/admin/scan-correction-logs"],
    enabled: !!user,
  });

  const isAdmin = user && (user as any).claims?.sub === ADMIN_USER_ID;

  if (!user || !isAdmin) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-destructive">Access denied. Admin only.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-destructive">Failed to load logs.</p>
      </div>
    );
  }

  const totalShifts = (logs ?? []).filter(log =>
    log.appliedOutput.some(ap => {
      const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
      if (!gp) return false;
      return detectShift(buildDiffs(gp, ap));
    })
  ).length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Scan Correction Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gemini scorecard scan output vs. what users actually saved — {logs?.length ?? 0} records
          </p>
        </div>
        {totalShifts > 0 && (
          <Badge className="bg-red-100 text-red-700 border-red-300 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {totalShifts} shift pattern{totalShifts !== 1 ? "s" : ""} detected
          </Badge>
        )}
      </div>

      {(logs ?? []).length === 0 ? (
        <div className="border border-border/50 rounded-lg p-8 text-center">
          <p className="text-muted-foreground">No scan correction logs yet. Logs are created when users apply scores from a pending scan.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs!.map(log => <LogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}
