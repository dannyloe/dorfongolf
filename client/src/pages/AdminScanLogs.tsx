import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, AlertTriangle, BarChart2, Camera, MessageSquare, RefreshCw, CheckCircle, RotateCcw, Zap, BookOpen, Receipt, Bot, Send, Phone, Settings, SplitSquareHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type HoleEntry = { holeNumber: number; strokes: number | null };
type GeminiPlayer = { playerName: string; holes: HoleEntry[] };
type AppliedPlayer = { playerName: string; playerId: number; holes: Array<{ holeNumber: number; strokes: number }> };

type ScanCorrectionLog = {
  id: number;
  matchId: number | null;
  pendingScanId: number | null;
  source: "camera" | "mms" | "bet_slip" | null;
  scanProvider: "gemini" | "grok" | null;
  courseName: string;
  geminiOutput: GeminiPlayer[] | any[];
  appliedOutput: AppliedPlayer[] | any[];
  playerNames: string[];
  geminiRawText: string | null;
  createdAt: string | null;
  matchName: string | null;
};

type ScanPattern = {
  id: number;
  patternType: string;
  patternKey: string;
  description: string;
  promptRule: string;
  occurrences: number;
  exampleLogIds: number[];
  addressed: boolean;
  addressedAt: string | null;
  machineGenerated: boolean;
  createdAt: string | null;
  updatedAt: string | null;
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

function getLogStats(log: ScanCorrectionLog): { totalChanges: number; hasShift: boolean } {
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

function GeminiNotesSection({ rawText, logId }: { rawText: string; logId: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-border/20 pt-3" data-testid={`gemini-notes-${logId}`}>
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-toggle-gemini-notes-${logId}`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Gemini notes
      </button>
      {expanded && (
        <blockquote className="mt-2 text-xs italic text-muted-foreground border-l-2 border-border/50 pl-3 leading-relaxed whitespace-pre-wrap" data-testid={`gemini-notes-text-${logId}`}>
          {rawText}
        </blockquote>
      )}
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
            {log.source === "camera" ? (
              <Badge variant="secondary" className="text-xs flex items-center gap-1" data-testid={`badge-source-${log.id}`}>
                <Camera className="w-3 h-3" />Camera
              </Badge>
            ) : log.source === "bet_slip" ? (
              <Badge variant="outline" className="text-xs flex items-center gap-1 border-green-300 text-green-700 dark:text-green-400" data-testid={`badge-source-${log.id}`}>
                <Receipt className="w-3 h-3" />Bet Slip
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs flex items-center gap-1 border-blue-300 text-blue-600 dark:text-blue-400" data-testid={`badge-source-${log.id}`}>
                <MessageSquare className="w-3 h-3" />MMS
              </Badge>
            )}
            {log.scanProvider === "grok" ? (
              <Badge variant="outline" className="text-xs flex items-center gap-1 border-purple-300 text-purple-700 dark:text-purple-400" data-testid={`badge-provider-${log.id}`}>
                <Bot className="w-3 h-3" />Grok
              </Badge>
            ) : log.scanProvider === "gemini" || log.source !== "bet_slip" ? (
              <Badge variant="outline" className="text-xs flex items-center gap-1 border-sky-300 text-sky-700 dark:text-sky-400" data-testid={`badge-provider-${log.id}`}>
                <Bot className="w-3 h-3" />Gemini
              </Badge>
            ) : null}
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
          {log.geminiRawText && <GeminiNotesSection rawText={log.geminiRawText} logId={log.id} />}
        </div>
      )}
    </div>
  );
}

function BetSlipLogRow({ log }: { log: ScanCorrectionLog }) {
  const [expanded, setExpanded] = useState(false);
  const gemini = log.geminiOutput?.[0] as any;
  const applied = log.appliedOutput?.[0] as any;

  const diffFields: { label: string; gemini: any; applied: any }[] = [];
  if (gemini && applied) {
    const fields = ["matchType", "unitAmount", "deathMatchBaseBet", "useNet", "teamAPlayerIds", "teamBPlayerIds", "skinsPlayerIds"];
    for (const f of fields) {
      const g = gemini[f];
      const a = applied[f];
      const gStr = JSON.stringify(g);
      const aStr = JSON.stringify(a);
      if (gStr !== aStr) {
        diffFields.push({ label: f, gemini: g, applied: a });
      }
    }
  }

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden" data-testid={`scan-log-row-${log.id}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-expand-log-${log.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{log.matchName || (log.matchId ? `Event #${log.matchId}` : "No match")}</span>
            <Badge variant="outline" className="text-xs flex items-center gap-1 border-green-300 text-green-700 dark:text-green-400" data-testid={`badge-source-${log.id}`}>
              <Receipt className="w-3 h-3" />Bet Slip
            </Badge>
            {diffFields.length === 0 ? (
              <Badge variant="secondary" className="text-xs">No edits</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">
                {diffFields.length} field{diffFields.length !== 1 ? "s" : ""} changed
              </Badge>
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
        <div className="px-4 pb-4 border-t border-border/30 pt-3">
          {diffFields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Gemini output accepted without changes.</p>
          ) : (
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-muted/50">
                  <td className="px-3 py-1.5 font-medium text-muted-foreground">Field</td>
                  <td className="px-3 py-1.5 font-medium text-muted-foreground">Gemini</td>
                  <td className="px-3 py-1.5 font-medium text-muted-foreground">Applied</td>
                </tr>
              </thead>
              <tbody>
                {diffFields.map(d => (
                  <tr key={d.label} className="border-t border-border/30">
                    <td className="px-3 py-1.5 font-medium">{d.label}</td>
                    <td className="px-3 py-1.5 text-red-600 dark:text-red-400">{JSON.stringify(d.gemini)}</td>
                    <td className="px-3 py-1.5 text-green-700 dark:text-green-400">{JSON.stringify(d.applied)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      if (log.source === "bet_slip") continue;
      for (const ap of (log.appliedOutput as AppliedPlayer[]) ) {
        const gp = (log.geminiOutput as GeminiPlayer[]).find(g => g.playerName === ap.playerName);
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

function PatternRow({ pattern, onToggleAddressed }: { pattern: ScanPattern; onToggleAddressed: (id: number, addressed: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg overflow-hidden ${pattern.addressed ? "border-border/30 opacity-60" : "border-border/50"}`}
      data-testid={`scan-pattern-row-${pattern.id}`}
    >
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-expand-pattern-${pattern.id}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className={`text-xs ${pattern.patternType === "hole_shift" ? "text-red-600 border-red-300" : "text-orange-600 border-orange-300"}`}
            >
              {pattern.patternType === "hole_shift" ? "Hole shift" : "Digit misread"}
            </Badge>
            {pattern.machineGenerated && (
              <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 flex items-center gap-1">
                <Bot className="w-3 h-3" />Machine generated
              </Badge>
            )}
            <span className="text-sm font-medium truncate">{pattern.description}</span>
            {pattern.addressed && (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />Addressed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {pattern.occurrences} occurrence{pattern.occurrences !== 1 ? "s" : ""}
            </span>
            {pattern.addressedAt && (
              <span className="text-xs text-muted-foreground">
                Addressed {format(new Date(pattern.addressedAt), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/30 pt-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Prompt rule injected into Gemini</p>
            <div className="bg-muted/50 rounded p-3 text-sm font-mono leading-relaxed border border-border/30">
              {pattern.promptRule}
            </div>
          </div>
          {pattern.exampleLogIds.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Example log IDs: {pattern.exampleLogIds.join(", ")}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1">
            {!pattern.addressed ? (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => onToggleAddressed(pattern.id, true)}
                data-testid={`button-address-pattern-${pattern.id}`}
              >
                <CheckCircle className="w-3 h-3" />Mark as addressed
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1"
                onClick={() => onToggleAddressed(pattern.id, false)}
                data-testid={`button-reactivate-pattern-${pattern.id}`}
              >
                <RotateCcw className="w-3 h-3" />Reactivate
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              {pattern.addressed
                ? "This rule is no longer injected into the Gemini prompt."
                : "This rule is currently injected into every scorecard scan."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const ADMIN_USER_ID = "52861828";

export default function AdminScanLogs() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"logs" | "patterns" | "sms-test" | "settings" | "compare">("logs");
  const [compareImage, setCompareImage] = useState<string | null>(null);
  const [compareImageName, setCompareImageName] = useState<string>("");
  const [compareThumbnail, setCompareThumbnail] = useState<string | null>(null);
  const [comparePlayers, setComparePlayers] = useState<string>("");
  const [compareResult, setCompareResult] = useState<{
    gemini: { scores: any[]; rawText: string; durationMs: number; error: string | null };
    grok: { scores: any[]; rawText: string; durationMs: number; error: string | null };
    comparisonId?: number;
    totalHoles?: number;
    matchedHoles?: number;
  } | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [scanProvider, setScanProvider] = useState<"gemini" | "grok">("gemini");
  const [providerSaving, setProviderSaving] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "scorecard" | "bet_slip">("all");
  const [providerFilter, setProviderFilter] = useState<"all" | "gemini" | "grok">("all");
  const [smsPhone, setSmsPhone] = useState("");
  const [smsResult, setSmsResult] = useState<{ ok: boolean; sid?: string; to?: string; error?: string } | null>(null);
  const [testScanFile, setTestScanFile] = useState<File | null>(null);
  const [testScanResult, setTestScanResult] = useState<{ ok: boolean; scores?: any[]; rawText?: string; message?: string } | null>(null);

  const { data: logs, isLoading: logsLoading, error: logsError } = useQuery<ScanCorrectionLog[]>({
    queryKey: ["/api/admin/scan-correction-logs"],
    enabled: !!user,
  });

  const { data: patterns, isLoading: patternsLoading } = useQuery<ScanPattern[]>({
    queryKey: ["/api/admin/scan-patterns"],
    enabled: !!user,
  });

  const { data: adminSettings } = useQuery<{ scanProvider: "gemini" | "grok" }>({
    queryKey: ["/api/admin/settings"],
    enabled: !!user,
  });

  type ScanComparisonRow = {
    id: number;
    playerNames: string[];
    imageThumbnail: string | null;
    geminiResult: { scores: any[]; rawText: string; durationMs: number; error: string | null };
    grokResult: { scores: any[]; rawText: string; durationMs: number; error: string | null };
    totalHoles: number;
    matchedHoles: number;
    createdAt: string | null;
  };
  const { data: comparisonHistory, isLoading: historyLoading } = useQuery<ScanComparisonRow[]>({
    queryKey: ["/api/admin/scan-comparisons"],
    enabled: !!user && activeTab === "compare",
  });

  const settingsMutation = useMutation({
    mutationFn: (provider: "gemini" | "grok") =>
      apiRequest("POST", "/api/admin/settings", { scanProvider: provider }),
    onSuccess: async (res) => {
      const data = await res.json();
      setScanProvider(data.scanProvider);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Saved", description: `Scan provider set to ${data.scanProvider === "grok" ? "Grok" : "Gemini"}.` });
      setProviderSaving(false);
    },
    onError: () => {
      toast({ title: "Save failed", description: "Could not update scan provider.", variant: "destructive" });
      setProviderSaving(false);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/scan-patterns/analyze", { minOccurrences: 2 }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-patterns"] });
      toast({
        title: "Analysis complete",
        description: `Analyzed ${data.analyzed} logs, found ${data.detected} pattern${data.detected !== 1 ? "s" : ""}.`,
      });
    },
    onError: () => {
      toast({ title: "Analysis failed", description: "Could not analyze logs.", variant: "destructive" });
    },
  });

  const autoLearnMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/scan-patterns/auto-learn", { minOccurrences: 2 }),
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-patterns"] });
      toast({
        title: "Auto-learn complete",
        description: `Scanned ${data.analyzed} scorecard${data.analyzed !== 1 ? "s" : ""} across ${data.courses} course${data.courses !== 1 ? "s" : ""}, promoted ${data.detected} per-course rule${data.detected !== 1 ? "s" : ""}.`,
      });
    },
    onError: () => {
      toast({ title: "Auto-learn failed", description: "Could not run auto-learn.", variant: "destructive" });
    },
  });

  const addressMutation = useMutation({
    mutationFn: ({ id, addressed }: { id: number; addressed: boolean }) =>
      apiRequest("PATCH", `/api/admin/scan-patterns/${id}/addressed`, { addressed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-patterns"] });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not update pattern.", variant: "destructive" });
    },
  });

  const testScanMutation = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      return apiRequest("POST", "/api/admin/test-scan", { imageBase64: base64, playerNames: [] });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      setTestScanResult(data);
    },
    onError: (err: any) => {
      let message = "Scan failed";
      try {
        const text: string = err?.message ?? "";
        const jsonPart = text.replace(/^\d+:\s*/, "");
        const data = JSON.parse(jsonPart);
        if (data?.message) message = data.message;
        else if (typeof data === "string") message = data;
      } catch {}
      setTestScanResult({ ok: false, message });
    },
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      if (!compareImage) throw new Error("No image selected");
      const playerNames = comparePlayers.split(",").map(s => s.trim()).filter(Boolean);
      return apiRequest("POST", "/api/admin/scan-compare", {
        imageBase64: compareImage,
        playerNames,
        imageThumbnail: compareThumbnail ?? undefined,
      });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      setCompareResult(data);
      setSelectedHistoryId(data.comparisonId ?? null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/scan-comparisons"] });
    },
    onError: (err: any) => {
      toast({ title: "Comparison failed", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const testSmsMutation = useMutation({
    mutationFn: (to: string) => apiRequest("POST", "/api/admin/test-sms", { to: to || undefined }),
    onSuccess: async (res) => {
      const data = await res.json();
      setSmsResult(data);
    },
    onError: async (err: any) => {
      let message = "Failed to send test SMS";
      try {
        const data = await err.json?.();
        if (data?.message) message = data.message;
        if (data?.error) message = data.error;
        setSmsResult({ ok: false, error: message });
      } catch {
        setSmsResult({ ok: false, error: message });
      }
    },
  });

  const isAdmin = user && ((user as any).isAdmin === true || (user as any).id === ADMIN_USER_ID);

  const courseNames = useMemo(() => {
    if (!logs) return [];
    return Array.from(new Set(logs.map(l => l.courseName).filter(Boolean))).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      if (sourceFilter === "scorecard" && log.source === "bet_slip") return false;
      if (sourceFilter === "bet_slip" && log.source !== "bet_slip") return false;
      if (providerFilter !== "all" && (log.scanProvider ?? "gemini") !== providerFilter) return false;
      if (courseFilter !== "all" && log.courseName !== courseFilter) return false;
      if (dateFrom && log.createdAt && new Date(log.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && log.createdAt && new Date(log.createdAt) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [logs, courseFilter, dateFrom, dateTo, sourceFilter, providerFilter]);

  const stats = useMemo(() => {
    const scorecardLogs = filteredLogs.filter(l => l.source !== "bet_slip");
    const total = filteredLogs.length;
    const scorecardTotal = scorecardLogs.length;
    const betSlipTotal = filteredLogs.length - scorecardTotal;
    let accepted = 0;
    let edited = 0;
    let shifted = 0;
    for (const log of scorecardLogs) {
      const { totalChanges, hasShift } = getLogStats(log);
      if (hasShift) shifted++;
      else if (totalChanges > 0) edited++;
      else accepted++;
    }
    const pct = (n: number) => scorecardTotal > 0 ? Math.round((n / scorecardTotal) * 100) + "%" : "—";
    return { total, scorecardTotal, betSlipTotal, accepted, edited, shifted, pct };
  }, [filteredLogs]);

  if (authLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-destructive">Access denied. Admin only.</p>
      </div>
    );
  }

  if (logsLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (logsError) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Scan Correction Logs</h1>
        <p className="text-destructive">Failed to load logs.</p>
      </div>
    );
  }

  const hasActiveFilters = courseFilter !== "all" || dateFrom || dateTo || sourceFilter !== "all" || providerFilter !== "all";
  const activePatterns = (patterns ?? []).filter(p => !p.addressed);
  const addressedPatterns = (patterns ?? []).filter(p => p.addressed);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Scan Correction Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gemini scorecard scan output vs. what users actually saved — {logs?.length ?? 0} total records
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {stats.shifted > 0 && (
            <Badge className="bg-red-100 text-red-700 border-red-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {stats.shifted} shift pattern{stats.shifted !== 1 ? "s" : ""} detected
            </Badge>
          )}
          {activePatterns.length > 0 && (
            <Badge className="bg-blue-100 text-blue-700 border-blue-300 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {activePatterns.length} rule{activePatterns.length !== 1 ? "s" : ""} active in prompt
            </Badge>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border/50">
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "logs" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("logs")}
          data-testid="tab-logs"
        >
          <BookOpen className="w-4 h-4" />
          Correction Logs
          <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">{logs?.length ?? 0}</span>
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "patterns" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("patterns")}
          data-testid="tab-patterns"
        >
          <Zap className="w-4 h-4" />
          Detected Patterns
          {(patterns ?? []).length > 0 && (
            <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">{(patterns ?? []).length}</span>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "sms-test" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("sms-test")}
          data-testid="tab-sms-test"
        >
          <Phone className="w-4 h-4" />
          SMS Test
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "settings" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("settings")}
          data-testid="tab-settings"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${activeTab === "compare" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
          onClick={() => setActiveTab("compare")}
          data-testid="tab-compare"
        >
          <SplitSquareHorizontal className="w-4 h-4" />
          Compare
        </button>
      </div>

      {activeTab === "logs" && (
        <div className="space-y-5">
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
            <div className="flex flex-col gap-1 min-w-[160px]">
              <Label className="text-xs">Source</Label>
              <Select value={sourceFilter} onValueChange={v => setSourceFilter(v as any)}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-source-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="scorecard">Scorecard only</SelectItem>
                  <SelectItem value="bet_slip">Bet Slip only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1 min-w-[140px]">
              <Label className="text-xs">AI Model</Label>
              <Select value={providerFilter} onValueChange={v => setProviderFilter(v as "all" | "gemini" | "grok")}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-provider-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All models</SelectItem>
                  <SelectItem value="gemini">Gemini</SelectItem>
                  <SelectItem value="grok">Grok</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {hasActiveFilters && (
              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors self-end pb-1"
                onClick={() => { setDateFrom(""); setDateTo(""); setCourseFilter("all"); setSourceFilter("all"); setProviderFilter("all"); }}
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
              {filteredLogs.map(log =>
                log.source === "bet_slip"
                  ? <BetSlipLogRow key={log.id} log={log} />
                  : <LogRow key={log.id} log={log} />
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "patterns" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm text-muted-foreground">
                Patterns are detected from correction logs. Active rules are automatically injected into every Gemini scan prompt.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => autoLearnMutation.mutate()}
                disabled={autoLearnMutation.isPending || analyzeMutation.isPending}
                data-testid="button-auto-learn-patterns"
                title="Group correction logs by course and auto-promote recurring per-course errors into pattern rules"
              >
                <Bot className={`w-4 h-4 ${autoLearnMutation.isPending ? "animate-spin" : ""}`} />
                {autoLearnMutation.isPending ? "Learning…" : "Auto-learn by course"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending || autoLearnMutation.isPending}
                data-testid="button-analyze-patterns"
              >
                <RefreshCw className={`w-4 h-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
                {analyzeMutation.isPending ? "Analyzing…" : "Re-analyze logs"}
              </Button>
            </div>
          </div>

          {patternsLoading ? (
            <p className="text-sm text-muted-foreground">Loading patterns…</p>
          ) : (patterns ?? []).length === 0 ? (
            <div className="border border-border/50 rounded-lg p-8 text-center space-y-3">
              <p className="text-muted-foreground">No patterns detected yet.</p>
              <p className="text-xs text-muted-foreground">Click "Re-analyze logs" to scan correction logs for recurring errors (requires at least 2 occurrences of the same mistake).</p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => analyzeMutation.mutate()}
                disabled={analyzeMutation.isPending}
                data-testid="button-analyze-patterns-empty"
              >
                <RefreshCw className={`w-4 h-4 ${analyzeMutation.isPending ? "animate-spin" : ""}`} />
                {analyzeMutation.isPending ? "Analyzing…" : "Re-analyze logs"}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {activePatterns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Zap className="w-3 h-3 text-blue-500" />Active rules ({activePatterns.length})
                  </p>
                  {activePatterns.map(p => (
                    <PatternRow
                      key={p.id}
                      pattern={p}
                      onToggleAddressed={(id, addressed) => addressMutation.mutate({ id, addressed })}
                    />
                  ))}
                </div>
              )}

              {addressedPatterns.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-green-500" />Addressed ({addressedPatterns.length})
                  </p>
                  {addressedPatterns.map(p => (
                    <PatternRow
                      key={p.id}
                      pattern={p}
                      onToggleAddressed={(id, addressed) => addressMutation.mutate({ id, addressed })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "settings" && (
        <div className="space-y-4 max-w-md">
          <div>
            <h2 className="text-base font-semibold">Scorecard Scan Provider</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose which AI model reads scorecard photos. Gemini is the default. Grok requires an <code className="text-xs bg-muted px-1 py-0.5 rounded">XAI_API_KEY</code> secret.
            </p>
          </div>

          <div className="bg-muted/40 border border-border/50 rounded-lg p-4 space-y-3">
            {(["gemini", "grok"] as const).map((p) => {
              const current = adminSettings?.scanProvider ?? "gemini";
              const isSelected = current === p;
              return (
                <label
                  key={p}
                  data-testid={`radio-scan-provider-${p}`}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"}`}
                >
                  <input
                    type="radio"
                    name="scanProvider"
                    value={p}
                    checked={isSelected}
                    disabled={settingsMutation.isPending}
                    onChange={() => {
                      setProviderSaving(true);
                      settingsMutation.mutate(p);
                    }}
                    className="mt-0.5 accent-primary"
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {p === "gemini" ? "Gemini" : "Grok"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p === "gemini"
                        ? "Google Gemini 2.5 Flash — current default"
                        : "xAI Grok Vision — requires XAI_API_KEY secret"}
                    </div>
                  </div>
                </label>
              );
            })}
            {providerSaving && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 animate-spin" /> Saving…
              </p>
            )}
          </div>

          <div>
            <h2 className="text-base font-semibold">Test Grok Scan</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a scorecard photo to verify your <code className="text-xs bg-muted px-1 py-0.5 rounded">XAI_API_KEY</code> is valid and check the quality of Grok's output before switching providers.
            </p>
          </div>

          <div className="bg-muted/40 border border-border/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                id="grok-test-file"
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="input-grok-test-file"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setTestScanFile(f);
                  setTestScanResult(null);
                }}
              />
              <label
                htmlFor="grok-test-file"
                className="cursor-pointer inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted/60 transition-colors"
                data-testid="label-grok-test-file"
              >
                {testScanFile ? testScanFile.name : "Choose image…"}
              </label>
              <Button
                size="sm"
                disabled={!testScanFile || testScanMutation.isPending}
                data-testid="button-grok-test-scan"
                onClick={() => {
                  if (testScanFile) {
                    setTestScanResult(null);
                    testScanMutation.mutate(testScanFile);
                  }
                }}
                className="flex items-center gap-1.5"
              >
                {testScanMutation.isPending ? (
                  <><RefreshCw className="w-3 h-3 animate-spin" />Scanning…</>
                ) : (
                  <><Zap className="w-3 h-3" />Test scan</>
                )}
              </Button>
            </div>

            {testScanResult && (
              <div
                className={`rounded-md border p-3 space-y-2 text-sm ${testScanResult.ok ? "border-green-300 bg-green-50 dark:bg-green-950/30" : "border-red-300 bg-red-50 dark:bg-red-950/30"}`}
                data-testid="grok-test-scan-result"
              >
                {!testScanResult.ok ? (
                  <>
                    <p className="text-red-700 dark:text-red-400 font-medium flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {testScanResult.message}
                    </p>
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">Raw response</summary>
                      <pre className="mt-1 text-xs bg-muted/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all" data-testid="grok-test-scan-raw-json">{JSON.stringify(testScanResult, null, 2)}</pre>
                    </details>
                  </>
                ) : (
                  <>
                    <p className="text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 shrink-0" />
                      Grok returned {testScanResult.scores?.length ?? 0} player{(testScanResult.scores?.length ?? 0) !== 1 ? "s" : ""}
                    </p>
                    {(testScanResult.scores ?? []).length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="text-xs border-collapse w-full">
                          <thead>
                            <tr className="border-b border-border/40">
                              <td className="py-1 pr-3 font-medium text-muted-foreground w-24">Player</td>
                              {Array.from({ length: 18 }, (_, i) => (
                                <td key={i + 1} className="px-1 py-1 text-center font-medium text-muted-foreground w-7">{i + 1}</td>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(testScanResult.scores ?? []).map((player: any) => {
                              const holeMap = new Map<number, number | null>();
                              for (const h of (player.holes ?? [])) holeMap.set(h.holeNumber, h.strokes);
                              return (
                                <tr key={player.playerName} className="border-b border-border/20 last:border-0">
                                  <td className="py-1 pr-3 font-medium truncate max-w-[6rem]" title={player.playerName}>{player.playerName || "—"}</td>
                                  {Array.from({ length: 18 }, (_, i) => {
                                    const v = holeMap.get(i + 1);
                                    return (
                                      <td key={i + 1} className="px-1 py-1 text-center">
                                        {v != null ? v : <span className="text-muted-foreground">—</span>}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {testScanResult.rawText && (
                      <p className="text-xs text-muted-foreground italic border-t border-border/30 pt-2">{testScanResult.rawText}</p>
                    )}
                    <details className="border-t border-border/30 pt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer select-none hover:text-foreground">Raw JSON response</summary>
                      <pre className="mt-1 text-xs bg-muted/60 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all" data-testid="grok-test-scan-raw-json">{JSON.stringify(testScanResult, null, 2)}</pre>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "compare" && (
        <div className="space-y-5 max-w-3xl">
          <div>
            <h2 className="text-base font-semibold">Gemini vs Grok Side-by-Side</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload a scorecard photo and run both models at once to see where they agree and differ.
            </p>
          </div>

          <div className="bg-muted/40 border border-border/50 rounded-lg p-4 space-y-3">
            <div className="flex flex-col gap-1">
              <Label className="text-sm">Scorecard photo</Label>
              <input
                id="compare-image-input"
                type="file"
                accept="image/*"
                className="hidden"
                data-testid="input-compare-image"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCompareImageName(file.name);
                  setCompareResult(null);
                  setCompareThumbnail(null);
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    setCompareImage(dataUrl);
                    // Generate a small thumbnail (150px wide) for history display
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      const maxW = 150;
                      const scale = Math.min(1, maxW / img.width);
                      canvas.width = Math.round(img.width * scale);
                      canvas.height = Math.round(img.height * scale);
                      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                      setCompareThumbnail(canvas.toDataURL("image/jpeg", 0.7));
                    };
                    img.src = dataUrl;
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <label
                htmlFor="compare-image-input"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-border cursor-pointer text-sm hover:bg-muted/60 transition-colors w-fit"
              >
                <Camera className="w-4 h-4 text-muted-foreground" />
                {compareImageName || "Choose image…"}
              </label>
              {compareImage && (
                <img src={compareImage} alt="Preview" className="rounded border border-border max-h-[120px] w-auto object-contain mt-1" />
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="compare-players-input" className="text-sm">Player names (comma-separated, optional)</Label>
              <Input
                id="compare-players-input"
                data-testid="input-compare-players"
                placeholder="Alice, Bob, Charlie"
                value={comparePlayers}
                onChange={e => setComparePlayers(e.target.value)}
                className="h-9 max-w-sm"
              />
            </div>

            <Button
              onClick={() => { setCompareResult(null); compareMutation.mutate(); }}
              disabled={!compareImage || compareMutation.isPending}
              data-testid="button-run-compare"
              className="flex items-center gap-2"
            >
              <SplitSquareHorizontal className="w-4 h-4" />
              {compareMutation.isPending ? "Running…" : "Run comparison"}
            </Button>
          </div>

          {compareResult && (() => {
            const { gemini, grok } = compareResult;

            const allPlayerNames = Array.from(new Set([
              ...(gemini.scores ?? []).map((p: any) => p.playerName),
              ...(grok.scores ?? []).map((p: any) => p.playerName),
            ]));

            const geminiMs = (gemini.durationMs / 1000).toFixed(1);
            const grokMs = (grok.durationMs / 1000).toFixed(1);

            return (
              <div className="space-y-5">
                <p className="text-xs text-muted-foreground">
                  Gemini {geminiMs}s · Grok {grokMs}s
                </p>

                {allPlayerNames.length === 0 && !gemini.error && !grok.error && (
                  <p className="text-sm text-muted-foreground">No player scores found in either result.</p>
                )}

                {allPlayerNames.map(playerName => {
                  const gPlayer = (gemini.scores ?? []).find((p: any) => p.playerName === playerName);
                  const rPlayer = (grok.scores ?? []).find((p: any) => p.playerName === playerName);

                  const holes = Array.from({ length: 18 }, (_, i) => i + 1);
                  let matches = 0;
                  let compared = 0;

                  return (
                    <div key={playerName} data-testid={`compare-results-${playerName}`} className="space-y-2">
                      <h3 className="text-sm font-semibold">{playerName}</h3>
                      <div className="overflow-x-auto rounded-md border border-border">
                        <table className="text-xs w-full border-collapse">
                          <thead>
                            <tr className="bg-muted/50">
                              <th className="px-2 py-1.5 text-left font-medium border-r border-border/50 w-10">Hole</th>
                              <th className={`px-2 py-1.5 text-center font-medium border-r border-border/50 ${gemini.error ? "text-red-500" : ""}`}>
                                Gemini{gemini.error ? " ✗" : ""}
                              </th>
                              <th className={`px-2 py-1.5 text-center font-medium border-r border-border/50 ${grok.error ? "text-red-500" : ""}`}>
                                Grok{grok.error ? " ✗" : ""}
                              </th>
                              <th className="px-2 py-1.5 text-center font-medium w-10">Match</th>
                            </tr>
                          </thead>
                          <tbody>
                            {holes.map(h => {
                              const gHole = gPlayer?.holes?.find((x: any) => x.holeNumber === h);
                              const rHole = rPlayer?.holes?.find((x: any) => x.holeNumber === h);
                              const gVal = gemini.error ? "—" : (gHole?.strokes ?? "—");
                              const rVal = grok.error ? "—" : (rHole?.strokes ?? "—");
                              const bothKnown = gVal !== "—" && rVal !== "—";
                              const agree = bothKnown && String(gVal) === String(rVal);
                              if (bothKnown) { compared++; if (agree) matches++; }
                              return (
                                <tr key={h} className={agree ? "bg-green-50 dark:bg-green-950/20" : bothKnown ? "bg-red-50 dark:bg-red-950/20" : ""}>
                                  <td className="px-2 py-1 border-r border-b border-border/30 font-medium text-muted-foreground">{h}</td>
                                  <td className="px-2 py-1 border-r border-b border-border/30 text-center">{gVal}</td>
                                  <td className="px-2 py-1 border-r border-b border-border/30 text-center">{rVal}</td>
                                  <td className="px-2 py-1 border-b border-border/30 text-center">
                                    {bothKnown ? (agree ? <span className="text-green-600">✓</span> : <span className="text-red-500">✗</span>) : ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {compared > 0 ? `${matches}/${compared} holes match` : "No comparable holes"}
                      </p>
                    </div>
                  );
                })}

                {(gemini.error || grok.error) && (
                  <div className="space-y-1">
                    {gemini.error && <p className="text-xs text-red-500">Gemini error: {gemini.error}</p>}
                    {grok.error && <p className="text-xs text-red-500">Grok error: {grok.error}</p>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* History section */}
          <div className="border-t border-border/40 pt-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Past Runs</h3>
            {historyLoading && <p className="text-xs text-muted-foreground">Loading history…</p>}
            {!historyLoading && (!comparisonHistory || comparisonHistory.length === 0) && (
              <p className="text-xs text-muted-foreground">No comparison runs saved yet.</p>
            )}
            {comparisonHistory && comparisonHistory.length > 0 && (
              <div className="space-y-2">
                {comparisonHistory.map(run => {
                  const pct = run.totalHoles > 0 ? Math.round((run.matchedHoles / run.totalHoles) * 100) : null;
                  const isSelected = selectedHistoryId === run.id;
                  return (
                    <button
                      key={run.id}
                      data-testid={`history-run-${run.id}`}
                      onClick={() => {
                        setSelectedHistoryId(run.id);
                        setCompareResult({
                          gemini: run.geminiResult,
                          grok: run.grokResult,
                          comparisonId: run.id,
                          totalHoles: run.totalHoles,
                          matchedHoles: run.matchedHoles,
                        });
                        setCompareImage(null);
                        setCompareImageName("");
                        setCompareThumbnail(null);
                        setComparePlayers(run.playerNames.join(", "));
                      }}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md border text-sm transition-colors ${isSelected ? "border-primary bg-primary/5" : "border-border/50 bg-muted/30 hover:bg-muted/60"}`}
                    >
                      {run.imageThumbnail ? (
                        <img src={run.imageThumbnail} alt="Scorecard" className="w-10 h-10 rounded object-cover shrink-0 border border-border/50" data-testid={`history-thumb-${run.id}`} />
                      ) : (
                        <div className="w-10 h-10 rounded border border-dashed border-border/50 bg-muted/30 flex items-center justify-center shrink-0">
                          <Camera className="w-4 h-4 text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <span className="font-medium truncate">
                          {run.playerNames.length > 0 ? run.playerNames.join(", ") : "No named players"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {run.playerNames.length} {run.playerNames.length === 1 ? "player" : "players"} · {run.createdAt ? format(new Date(run.createdAt), "MMM d, yyyy h:mm a") : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {pct !== null && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${pct >= 80 ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" : pct >= 60 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"}`}>
                            {pct}%
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{run.matchedHoles}/{run.totalHoles} holes</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "sms-test" && (
        <div className="space-y-4 max-w-md">
          <div>
            <h2 className="text-base font-semibold">Send Test SMS</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Fire a test message to confirm Plivo is wired up correctly. Leave the phone field blank to send to your own profile number.
            </p>
          </div>

          <div className="bg-muted/40 border border-border/50 rounded-lg p-4 space-y-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="sms-test-phone" className="text-sm">Phone number (optional)</Label>
              <Input
                id="sms-test-phone"
                type="tel"
                placeholder="Leave blank to use your profile number"
                value={smsPhone}
                onChange={e => { setSmsPhone(e.target.value); setSmsResult(null); }}
                data-testid="input-sms-test-phone"
                className="h-9"
              />
            </div>

            <Button
              onClick={() => { setSmsResult(null); testSmsMutation.mutate(smsPhone); }}
              disabled={testSmsMutation.isPending}
              data-testid="button-send-test-sms"
              className="flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              {testSmsMutation.isPending ? "Sending…" : "Send test SMS"}
            </Button>

            {smsResult && (
              <div
                data-testid="sms-test-result"
                className={`rounded-md border px-4 py-3 text-sm flex flex-col gap-1 ${smsResult.ok ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/40 dark:border-green-800 dark:text-green-300" : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300"}`}
              >
                {smsResult.ok ? (
                  <>
                    <span className="font-semibold flex items-center gap-1.5"><CheckCircle className="w-4 h-4" />Message sent</span>
                    {smsResult.to && <span className="text-xs">To: {smsResult.to}</span>}
                    {smsResult.sid && <span className="text-xs text-muted-foreground">SID: {smsResult.sid}</span>}
                  </>
                ) : (
                  <>
                    <span className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />Failed to send</span>
                    {smsResult.error && <span className="text-xs">{smsResult.error}</span>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
