import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, AlertTriangle, BarChart2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

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

function getLogStats(log: ScanCorrectionLog) {
  let totalChanges = 0;
  let hasShift = false;
  for (const ap of log.appliedOutput) {
    const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
    if (!gp) continue;
    const diffs = buildDiffs(gp, ap);
    totalChanges += diffs.filter(d => d.changed).length;
    if (detectShift(diffs)) hasShift = true;
  }
  return { totalChanges, hasShift };
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
  const { totalChanges, hasShift } = getLogStats(log);

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

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card border border-border/50 rounded-lg px-4 py-3 flex-1 min-w-[120px]" data-testid={`stat-card-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className={`text-2xl font-bold ${color ?? "text-foreground"}`}>{value}</div>
      <div className="text-xs font-medium text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function HoleHeatMap({ logs }: { logs: ScanCorrectionLog[] }) {
  const data = useMemo(() => {
    const counts = Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, edits: 0 }));
    for (const log of logs) {
      for (const ap of log.appliedOutput) {
        const gp = log.geminiOutput.find(g => g.playerName === ap.playerName);
        if (!gp) continue;
        const diffs = buildDiffs(gp, ap);
        for (const d of diffs) {
          if (d.changed) counts[d.hole - 1].edits++;
        }
      }
    }
    return counts;
  }, [logs]);

  const maxEdits = Math.max(...data.map(d => d.edits), 1);

  return (
    <div className="bg-card border border-border/50 rounded-lg p-4" data-testid="hole-heatmap">
      <div className="flex items-center gap-2 mb-3">
        <BarChart2 className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Edit frequency by hole</span>
        <span className="text-xs text-muted-foreground ml-1">— how often each hole was corrected</span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="hole" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            formatter={(v: number) => [v, "edits"]}
            labelFormatter={(l: number) => `Hole ${l}`}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          <Bar dataKey="edits" radius={[3, 3, 0, 0]}>
            {data.map(d => {
              const intensity = maxEdits > 0 ? d.edits / maxEdits : 0;
              const color = d.edits === 0
                ? "hsl(var(--muted))"
                : intensity > 0.66
                  ? "#ef4444"
                  : intensity > 0.33
                    ? "#f97316"
                    : "#eab308";
              return <Cell key={d.hole} fill={color} data-testid={`heatmap-bar-hole-${d.hole}`} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#eab308" }} />low</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#f97316" }} />medium</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#ef4444" }} />high</span>
      </div>
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

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");

  const isAdmin = user && (user as any).claims?.sub === ADMIN_USER_ID;

  const courseNames = useMemo(() => {
    if (!logs) return [];
    return Array.from(new Set(logs.map(l => l.courseName).filter(Boolean))).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      if (courseFilter !== "all" && log.courseName !== courseFilter) return false;
      if (dateFrom && log.createdAt && new Date(log.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && log.createdAt && new Date(log.createdAt) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [logs, courseFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filteredLogs.length;
    let accepted = 0;
    let edited = 0;
    let shifted = 0;
    for (const log of filteredLogs) {
      const { totalChanges, hasShift } = getLogStats(log);
      if (hasShift) shifted++;
      else if (totalChanges > 0) edited++;
      else accepted++;
    }
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) + "%" : "—";
    return { total, accepted, edited, shifted, pct };
  }, [filteredLogs]);

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

  const hasActiveFilters = courseFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Scan Correction Logs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gemini scorecard scan output vs. what users actually saved — {logs?.length ?? 0} total records
        </p>
      </div>

      {/* Filters */}
      <div className="bg-muted/40 border border-border/50 rounded-lg p-4 flex flex-wrap gap-4 items-end" data-testid="filters-bar">
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label htmlFor="filter-from" className="text-xs">From date</Label>
          <Input
            id="filter-from"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 text-sm"
            data-testid="input-filter-from"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label htmlFor="filter-to" className="text-xs">To date</Label>
          <Input
            id="filter-to"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 text-sm"
            data-testid="input-filter-to"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <Label className="text-xs">Course</Label>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="h-8 text-sm" data-testid="select-course-filter">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courseNames.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters && (
          <button
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors self-end pb-1"
            onClick={() => { setDateFrom(""); setDateTo(""); setCourseFilter("all"); }}
            data-testid="button-clear-filters"
          >
            Clear filters
          </button>
        )}
        {hasActiveFilters && (
          <span className="text-xs text-muted-foreground self-end pb-1" data-testid="text-filtered-count">
            Showing {filteredLogs.length} of {logs?.length ?? 0}
          </span>
        )}
      </div>

      {/* Summary stats */}
      <div className="flex flex-wrap gap-3" data-testid="stats-bar">
        <StatCard label="Total scans" value={String(stats.total)} />
        <StatCard
          label="Accepted as-is"
          value={stats.pct(stats.accepted)}
          sub={`${stats.accepted} scan${stats.accepted !== 1 ? "s" : ""}`}
          color="text-green-600 dark:text-green-400"
        />
        <StatCard
          label="Edited"
          value={stats.pct(stats.edited)}
          sub={`${stats.edited} scan${stats.edited !== 1 ? "s" : ""}`}
          color="text-orange-500"
        />
        <StatCard
          label="Shift detected"
          value={stats.pct(stats.shifted)}
          sub={`${stats.shifted} scan${stats.shifted !== 1 ? "s" : ""}`}
          color={stats.shifted > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}
        />
      </div>

      {/* Per-hole heat map */}
      {filteredLogs.length > 0 && <HoleHeatMap logs={filteredLogs} />}

      {/* Log list */}
      {filteredLogs.length === 0 ? (
        <div className="border border-border/50 rounded-lg p-8 text-center">
          <p className="text-muted-foreground">
            {hasActiveFilters ? "No logs match the current filters." : "No scan correction logs yet. Logs are created when users apply scores from a pending scan."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map(log => <LogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}
