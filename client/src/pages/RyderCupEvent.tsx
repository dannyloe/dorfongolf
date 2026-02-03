import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Trophy, Flag, Users, Calendar, ArrowLeft, Plus, Check, X, Minus, DollarSign, Pencil, Clock, GripVertical, ClipboardList, ChevronLeft, ChevronRight, ChevronDown, Circle, Camera, Loader2, AlertCircle, CheckCircle2, RefreshCw, Receipt, Trash2, Eye, Settings, UserMinus } from "lucide-react";
import { useScanScorecard, ScannedPlayer } from "@/hooks/use-matches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { calculateLedger, type LedgerEntry, type NetScoringContext } from "@/lib/matchplay";
import { calculateCourseHandicap } from "@/lib/handicap";
import type { RyderCupEventResponse, RyderCupPairingSide, RyderCupPairingSideWithScores, RyderCupPairingScore, MATCH_TYPES, Match, Course, CourseTee, CourseHole } from "@shared/schema";

type StoredResult = {
  id: number;
  eventMatchId: number;
  playerId: number;
  playerName: string;
  amount: number;
  betType?: string | null;
  isComplete: boolean;
  isAutoPress: boolean;
  teamName?: string | null;
  teamIndex?: number | null;
  updatedAt?: string | null;
};

type SideMatchLedgerData = {
  matches: Array<{ id: number; name: string | null; createdAt: string; courseId: number | null; isHandicapped?: boolean; ryderCupDayNumber?: number | null }>;
  eventMatches: Array<{ eventId: number; useNetScoring?: boolean; teams?: Array<{ members?: Array<{ playerId: number; player?: { handicapIndex: number | null; teeId: number | null; name?: string } }> }>; [key: string]: any }>;
  scores: Array<any>;
  courseData?: Record<number, { holes: Array<{ holeNumber: number; handicap: number | null }>; tees: Array<{ id: number; slopeRating: number; courseRating: number }> }>;
  ryderCupScoresByDay?: Record<number, Record<string, Record<number, number>>>;
  ryderCupPlayerDataByDay?: Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>>;
  storedResults?: StoredResult[];
  handicapOverrides?: Record<number, Record<number, number>>; // eventMatchId -> playerId -> courseHandicap
};

type CourseWithHoles = Course & { holes: CourseHole[]; totalPar?: number };

function PayoutSettingsForm({ event, courses, eventId }: { 
  event: RyderCupEventResponse; 
  courses: CourseWithHoles[]; 
  eventId: string;
}) {
  const [teamWinBonus, setTeamWinBonus] = useState(String(event.teamWinBonus / 100));
  const [matchWinBonus, setMatchWinBonus] = useState(String(event.matchWinBonus / 100));
  const [dailySkinsPot, setDailySkinsPot] = useState(String(event.dailySkinsPot / 100));
  const [closestToHolePayout, setClosestToHolePayout] = useState(String(event.closestToHolePayout / 100));
  const [includeBuyInInLedger, setIncludeBuyInInLedger] = useState(event.includeBuyInInLedger ?? true);

  const numPlayers = 12;
  const numDays = event.days.length || 4;
  const matchesPerDay = 3;
  const playersPerMatch = 2;
  
  const par3sByDay = event.days.map(day => {
    const dayCourseId = day.courseId || event.courseId;
    const dayCourse = courses.find(c => c.id === dayCourseId);
    const par3Count = dayCourse?.holes?.filter(h => h.par === 3).length || 0;
    return { dayNumber: day.dayNumber, par3Count, courseName: dayCourse?.name || day.courseName };
  });
  const totalPar3s = par3sByDay.reduce((sum, d) => sum + d.par3Count, 0);
  
  const teamWinValue = parseFloat(teamWinBonus) || 0;
  const matchWinValue = parseFloat(matchWinBonus) || 0;
  const dailySkinsValue = parseFloat(dailySkinsPot) || 0;
  const cthValue = parseFloat(closestToHolePayout) || 0;
  
  const totalTeamWin = teamWinValue * 100 * 6;
  const totalMatchWins = matchWinValue * 100 * playersPerMatch * matchesPerDay * numDays;
  const totalSkins = dailySkinsValue * 100 * numDays;
  const totalCTH = cthValue * 100 * totalPar3s;
  const totalPot = totalTeamWin + totalMatchWins + totalSkins + totalCTH;
  const calculatedBuyIn = Math.ceil(totalPot / numPlayers);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  };

  const savePayout = async (field: string, value: number) => {
    try {
      await apiRequest("PATCH", `/api/ryder-cup/${eventId}/payouts`, {
        [field]: Math.round(value * 100),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", eventId] });
    } catch (err) {
      console.error("Failed to update payout:", err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Team Win Bonus (per player)</label>
          <Input
            type="number"
            value={teamWinBonus}
            onChange={(e) => setTeamWinBonus(e.target.value)}
            onBlur={() => savePayout("teamWinBonus", parseFloat(teamWinBonus) || 0)}
            placeholder="0"
            data-testid="input-team-win-bonus"
          />
          <p className="text-xs text-muted-foreground mt-1">× 6 = {formatCurrency(totalTeamWin)}</p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Match Win (per player)</label>
          <Input
            type="number"
            value={matchWinBonus}
            onChange={(e) => setMatchWinBonus(e.target.value)}
            onBlur={async () => {
              const winValue = parseFloat(matchWinBonus) || 0;
              const tieValue = winValue / 2;
              try {
                await apiRequest("PATCH", `/api/ryder-cup/${eventId}/payouts`, {
                  matchWinBonus: Math.round(winValue * 100),
                  matchTieBonus: Math.round(tieValue * 100),
                });
                queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", eventId] });
              } catch (err) {
                console.error("Failed to update payout:", err);
              }
            }}
            placeholder="0"
            data-testid="input-match-win-bonus"
          />
          <p className="text-xs text-muted-foreground mt-1">
            × 2 players × {matchesPerDay * numDays} matches = {formatCurrency(totalMatchWins)}
            <br />
            <span className="text-muted-foreground/70">Tie = {formatCurrency(matchWinValue * 50)}/player</span>
          </p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Daily Skins Pot</label>
          <Input
            type="number"
            value={dailySkinsPot}
            onChange={(e) => setDailySkinsPot(e.target.value)}
            onBlur={() => savePayout("dailySkinsPot", parseFloat(dailySkinsPot) || 0)}
            placeholder="0"
            data-testid="input-daily-skins-pot"
          />
          <p className="text-xs text-muted-foreground mt-1">× {numDays} days = {formatCurrency(totalSkins)}</p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">CTH (per winner)</label>
          <Input
            type="number"
            value={closestToHolePayout}
            onChange={(e) => setClosestToHolePayout(e.target.value)}
            onBlur={() => savePayout("closestToHolePayout", parseFloat(closestToHolePayout) || 0)}
            placeholder="0"
            data-testid="input-cth-payout"
          />
          <div className="text-xs text-muted-foreground mt-1">
            {par3sByDay.map(d => (
              <div key={d.dayNumber}>Day {d.dayNumber}: {d.par3Count} par 3s = {formatCurrency(cthValue * 100 * d.par3Count)}</div>
            ))}
            <div className="font-medium mt-1">Total CTH: {formatCurrency(totalCTH)}</div>
          </div>
        </div>
      </div>
      
      <div className="border-t pt-4 mt-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">Calculated Buy-in</span>
            <p className="text-xs text-muted-foreground">Total pot ÷ {numPlayers} players</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold">{formatCurrency(calculatedBuyIn)}</span>
            <p className="text-xs text-muted-foreground">Total pot: {formatCurrency(totalPot)}</p>
          </div>
        </div>
      </div>
      
      <div className="border-t pt-4 mt-4">
        <div className="flex items-start gap-3">
          <Checkbox
            id="include-buy-in"
            checked={includeBuyInInLedger}
            onCheckedChange={async (checked) => {
              const newValue = checked === true;
              setIncludeBuyInInLedger(newValue);
              try {
                await apiRequest("PATCH", `/api/ryder-cup/${eventId}/payouts`, {
                  includeBuyInInLedger: newValue,
                });
                queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", eventId] });
              } catch (err) {
                console.error("Failed to update setting:", err);
              }
            }}
            data-testid="checkbox-include-buy-in"
          />
          <div className="grid gap-1.5 leading-none">
            <label
              htmlFor="include-buy-in"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Include Buy-in and payouts in Ledger totals
            </label>
            <p className="text-xs text-muted-foreground">
              When checked, Buy-In costs and earnings are included in Net totals
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RyderCupEvent() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [recordResultDialogOpen, setRecordResultDialogOpen] = useState(false);
  const [selectedPairingId, setSelectedPairingId] = useState<number | null>(null);
  const [selectedWinnerId, setSelectedWinnerId] = useState<number | null>(null);
  const [winningMargin, setWinningMargin] = useState("");
  const [editingDayCourse, setEditingDayCourse] = useState<number | null>(null);
  const [editingDaySchedule, setEditingDaySchedule] = useState<number | null>(null);
  const [editingDayDate, setEditingDayDate] = useState<number | null>(null);
  const [newTeeTime, setNewTeeTime] = useState("");
  const [draggingPairingId, setDraggingPairingId] = useState<number | null>(null);
  const [currentHole, setCurrentHole] = useState(1);
  const [editingScore, setEditingScore] = useState<{ sideId: number; playerNumber: 1 | 2; hole: number } | null>(null);
  const [editScoreValue, setEditScoreValue] = useState("");
  const [expandedPairingId, setExpandedPairingId] = useState<number | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanningPairingId, setScanningPairingId] = useState<number | null>(null);
  const [scannedScores, setScannedScores] = useState<ScannedPlayer[]>([]);
  const [editableScores, setEditableScores] = useState<Record<string, Record<number, string>>>({});
  const [playerMappings, setPlayerMappings] = useState<Record<string, { sideId: number; playerNumber: 1 | 2 } | null>>({});
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editingMemberHandicap, setEditingMemberHandicap] = useState("");
  const [editingMemberNameId, setEditingMemberNameId] = useState<number | null>(null);
  const [editingMemberName, setEditingMemberName] = useState("");
  const [replacingPlayer, setReplacingPlayer] = useState<{ name: string; presetPlayerId: number } | null>(null);
  const [replacementPlayerId, setReplacementPlayerId] = useState<string>("");
  const [editingSideHandicap, setEditingSideHandicap] = useState<{ sideId: number; playerNumber: 1 | 2 } | null>(null);
  const [editingSideHandicapValue, setEditingSideHandicapValue] = useState("");
  const [selectedSkinsDay, setSelectedSkinsDay] = useState<number>(1);
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const [transactionPayer, setTransactionPayer] = useState("");
  const [transactionDescription, setTransactionDescription] = useState("");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionSplitPlayers, setTransactionSplitPlayers] = useState<string[]>([]);
  
  // Manual bet state
  const [addBetOpen, setAddBetOpen] = useState(false);
  const [betDescription, setBetDescription] = useState("");
  const [betEntries, setBetEntries] = useState<{ presetPlayerId: number | null; playerName: string; amount: string }[]>([
    { presetPlayerId: null, playerName: "", amount: "" },
    { presetPlayerId: null, playerName: "", amount: "" },
  ]);
  
  const [earningsBreakdownPlayer, setEarningsBreakdownPlayer] = useState<string | null>(null);
  const [sideBetsBreakdownPlayer, setSideBetsBreakdownPlayer] = useState<string | null>(null);
  const [expensesBreakdownPlayer, setExpensesBreakdownPlayer] = useState<string | null>(null);
  const [earningsExpanded, setEarningsExpanded] = useState(false);
  const [sideBetsExpanded, setSideBetsExpanded] = useState(false);
  const [dayEarningsBreakdown, setDayEarningsBreakdown] = useState<{ player: string; day: number } | null>(null);
  const [daySideBetsBreakdown, setDaySideBetsBreakdown] = useState<{ player: string; day: number } | null>(null);
  const [activeTab, setActiveTab] = useState("schedule");
  const [isRefreshingLedger, setIsRefreshingLedger] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scoreInputRef = useRef<HTMLInputElement | null>(null);
  const scanScorecard = useScanScorecard();

  // Focus the score input when editing starts
  useEffect(() => {
    if (editingScore && scoreInputRef.current) {
      scoreInputRef.current.focus();
      scoreInputRef.current.select();
    }
  }, [editingScore]);

  const { data: event, isLoading } = useQuery<RyderCupEventResponse>({
    queryKey: ["/api/ryder-cup", id],
  });

  const { data: sideMatches = [] } = useQuery<Match[]>({
    queryKey: ["/api/ryder-cup", id, "matches"],
    enabled: !!id,
  });

  const { data: sideMatchLedger } = useQuery<SideMatchLedgerData>({
    queryKey: ["/api/ryder-cup", id, "side-match-ledger"],
    enabled: !!id,
  });

  const { data: courses = [] } = useQuery<CourseWithHoles[]>({
    queryKey: ["/api/courses"],
  });

  const { data: presetPlayers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/preset-players"],
  });
  
  // Query for manual bets for this event
  const { data: manualBets = [] } = useQuery<{
    id: number;
    description: string;
    createdAt: string | null;
    entries: { id: number; playerName: string; presetPlayerId: number | null; amount: number }[];
  }[]>({
    queryKey: [`/api/manual-bets?ryderCupEventId=${id}`],
    enabled: !!id,
  });

  // Get current day's course info for scorecard
  const currentDay = event?.days.find(d => d.dayNumber === selectedDay);
  const currentDayCourseId = currentDay?.courseId || event?.courseId;

  const { data: courseTees = [] } = useQuery<CourseTee[]>({
    queryKey: ["/api/courses", currentDayCourseId, "tees"],
    enabled: !!currentDayCourseId,
  });

  // Get holes from the already-loaded courses data
  const currentCourse = courses.find(c => c.id === currentDayCourseId);
  const courseHoles: CourseHole[] = currentCourse?.holes || [];

  // CTH winners for current day
  type ClosestToHoleWinner = {
    id: number;
    dayId: number;
    holeNumber: number;
    winnerName: string | null;
  };

  const { data: cthWinners = [] } = useQuery<ClosestToHoleWinner[]>({
    queryKey: ["/api/ryder-cup/days", currentDay?.id, "closest-to-hole"],
    enabled: !!currentDay?.id,
  });

  // All CTH winners for the entire event (for ledger calculations)
  const { data: allCthWinners = [] } = useQuery<ClosestToHoleWinner[]>({
    queryKey: ["/api/ryder-cup", id, "closest-to-hole"],
    enabled: !!id,
  });

  // Transaction types
  type TransactionSplit = {
    id: number;
    transactionId: number;
    playerName: string;
    amount: number;
  };
  
  type Transaction = {
    id: number;
    eventId: number;
    payerName: string;
    description: string;
    amount: number;
    createdAt: string | null;
    splits: TransactionSplit[];
  };

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/ryder-cup", id, "transactions"],
    enabled: !!id,
  });

  const isCreatorOrAdmin = event && (event.creatorId === user?.id || user?.isAdmin);

  const updateDayCourseMutation = useMutation({
    mutationFn: async ({ dayId, courseId, courseName }: { dayId: number; courseId: number; courseName: string }) => {
      return apiRequest("PATCH", `/api/ryder-cup/days/${dayId}/course`, { courseId, courseName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Course Updated" });
      setEditingDayCourse(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update course", variant: "destructive" });
    },
  });

  const updateDayScheduleMutation = useMutation({
    mutationFn: async ({ dayId, date, teeTimes }: { dayId: number; date?: string; teeTimes?: string[] }) => {
      return apiRequest("PATCH", `/api/ryder-cup/days/${dayId}/schedule`, { date, teeTimes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Schedule Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update schedule", variant: "destructive" });
    },
  });

  const updatePairingTeeTimeMutation = useMutation({
    mutationFn: async ({ pairingId, teeTime }: { pairingId: number; teeTime: string | null }) => {
      return apiRequest("PATCH", `/api/ryder-cup/pairings/${pairingId}/tee-time`, { teeTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to assign tee time", variant: "destructive" });
    },
  });

  const reorderPairingsMutation = useMutation({
    mutationFn: async ({ dayId, pairingOrder }: { dayId: number; pairingOrder: number[] }) => {
      return apiRequest("PATCH", `/api/ryder-cup/days/${dayId}/reorder-pairings`, { pairingOrder });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Order Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reorder matches", variant: "destructive" });
    },
  });

  const recordResultMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPairingId) return;
      return apiRequest("POST", `/api/ryder-cup/pairings/${selectedPairingId}/result`, {
        winningSideId: selectedWinnerId || undefined,
        winningMargin: winningMargin || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Result Recorded" });
      setRecordResultDialogOpen(false);
      setSelectedPairingId(null);
      setSelectedWinnerId(null);
      setWinningMargin("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to record result", variant: "destructive" });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ teamId, name }: { teamId: number; name: string }) => {
      return apiRequest("PATCH", `/api/ryder-cup/teams/${teamId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Team name updated" });
      setEditingTeamId(null);
      setEditingTeamName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update team name", variant: "destructive" });
    },
  });

  const recalculateResultsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/ryder-cup/${id}/recalculate-results`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Results recalculated", description: `Updated ${data.updatedCount || 0} matches` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to recalculate results", variant: "destructive" });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async ({ payerName, description, amount, splitPlayerNames }: { payerName: string; description: string; amount: number; splitPlayerNames: string[] }) => {
      return apiRequest("POST", `/api/ryder-cup/${id}/transactions`, { payerName, description, amount, splitPlayerNames });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "transactions"] });
      toast({ title: "Transaction added" });
      setAddTransactionOpen(false);
      setTransactionPayer("");
      setTransactionDescription("");
      setTransactionAmount("");
      setTransactionSplitPlayers([]);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add transaction", variant: "destructive" });
    },
  });
  
  // Manual bet mutation
  const createManualBetMutation = useMutation({
    mutationFn: async (data: { description: string; ryderCupEventId?: number; entries: { playerName: string; presetPlayerId?: number; amount: number }[] }) => {
      return apiRequest("POST", "/api/manual-bets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/manual-bets?ryderCupEventId=${id}`] });
      toast({ title: "Bet recorded successfully" });
      setAddBetOpen(false);
      setBetDescription("");
      setBetEntries([{ presetPlayerId: null, playerName: "", amount: "" }, { presetPlayerId: null, playerName: "", amount: "" }]);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTransactionMutation = useMutation({
    mutationFn: async (transactionId: number) => {
      return apiRequest("DELETE", `/api/ryder-cup/${id}/transactions/${transactionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "transactions"] });
      toast({ title: "Transaction deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete transaction", variant: "destructive" });
    },
  });

  const deleteManualBetMutation = useMutation({
    mutationFn: async (betId: number) => {
      return apiRequest("DELETE", `/api/manual-bets/${betId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/manual-bets?ryderCupEventId=${id}`] });
      toast({ title: "Bet deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete bet", variant: "destructive" });
    },
  });

  const updateMemberHandicapMutation = useMutation({
    mutationFn: async ({ memberId, handicapIndex }: { memberId: number; handicapIndex: number | null }) => {
      return apiRequest("PATCH", `/api/ryder-cup/members/${memberId}/handicap`, { handicapIndex });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Handicap updated" });
      setEditingMemberId(null);
      setEditingMemberHandicap("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update handicap", variant: "destructive" });
    },
  });

  const updateMemberNameMutation = useMutation({
    mutationFn: async ({ memberId, playerName }: { memberId: number; playerName: string }) => {
      return apiRequest("PATCH", `/api/ryder-cup/members/${memberId}/name`, { playerName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "side-match-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "cth-winners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Player name updated" });
      setEditingMemberNameId(null);
      setEditingMemberName("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update player name", variant: "destructive" });
    },
  });

  const replacePlayerMutation = useMutation({
    mutationFn: async ({ oldPresetPlayerId, newPresetPlayerId }: { oldPresetPlayerId: number; newPresetPlayerId: number }) => {
      return apiRequest("POST", `/api/ryder-cup/${id}/replace-player`, { oldPresetPlayerId, newPresetPlayerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "side-match-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "cth-winners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      toast({ title: "Player replaced successfully" });
      setReplacingPlayer(null);
      setReplacementPlayerId("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to replace player", variant: "destructive" });
    },
  });

  const updateSidePlayerMutation = useMutation({
    mutationFn: async ({ sideId, playerNumber, teeId, handicapIndex }: { sideId: number; playerNumber: 1 | 2; teeId?: number | null; handicapIndex?: number | null }) => {
      const payload: { playerNumber: number; teeId?: number | null; handicapIndex?: number | null } = { playerNumber };
      if (teeId !== undefined) payload.teeId = teeId;
      if (handicapIndex !== undefined) payload.handicapIndex = handicapIndex;
      return apiRequest("PATCH", `/api/ryder-cup/sides/${sideId}/player`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      setEditingSideHandicap(null);
      setEditingSideHandicapValue("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update player", variant: "destructive" });
    },
  });

  // Helper to get or create a side match container for a specific day
  const getOrCreateDaySideMatchContainer = async (dayNumber: number): Promise<Match> => {
    const eventName = event?.name || "Ryder Cup";
    const containerName = `${eventName} - Day ${dayNumber} Side Matches`;
    
    // Check if container already exists for this day
    const existingContainer = sideMatches.find(m => 
      m.ryderCupDayNumber === dayNumber && 
      m.name?.includes("Side Matches")
    );
    
    if (existingContainer) {
      return existingContainer;
    }
    
    // Create new container for this day
    const dayData = event?.days.find(d => d.dayNumber === dayNumber);
    const courseName = dayData?.courseName || event?.courseName || "";
    const courseId = dayData?.courseId || event?.courseId;
    
    // Build a map of player names to their tee and handicap info from Ryder Cup pairings
    const playerTeeInfo: Record<string, { teeId: number | null; handicapIndex: number | null }> = {};
    if (dayData?.pairings) {
      for (const pairing of dayData.pairings) {
        for (const side of pairing.sides) {
          if (side.player1Name) {
            playerTeeInfo[side.player1Name] = {
              teeId: side.player1TeeId ?? null,
              handicapIndex: side.player1HandicapIndex ?? null,
            };
          }
          if (side.player2Name) {
            playerTeeInfo[side.player2Name] = {
              teeId: side.player2TeeId ?? null,
              handicapIndex: side.player2HandicapIndex ?? null,
            };
          }
        }
      }
    }
    
    // Create the container match
    const res = await apiRequest("POST", "/api/matches", {
      name: containerName,
      courseName,
      courseId,
      ryderCupEventId: parseInt(id!),
      ryderCupDayNumber: dayNumber,
      groupId: null,
      isHandicapped: event?.useHandicaps ?? true,
    });
    const newMatch = await res.json();
    
    // Get all player names from both teams
    const allPlayerNames = [
      ...(event?.teams[0]?.members || []).map(m => m.playerName),
      ...(event?.teams[1]?.members || []).map(m => m.playerName),
    ];
    
    // Add all tournament players to the match with their tee/handicap info from the day's pairings
    for (const playerName of allPlayerNames) {
      const teeInfo = playerTeeInfo[playerName] || { teeId: null, handicapIndex: null };
      await apiRequest("POST", `/api/matches/${newMatch.id}/players`, { 
        name: playerName,
        teeId: teeInfo.teeId,
        handicapIndex: teeInfo.handicapIndex,
      });
    }
    
    return newMatch;
  };

  const createSideMatchMutation = useMutation({
    mutationFn: async ({ forAllDays = false }: { forAllDays?: boolean } = {}): Promise<{ container: Match | null; daysCreated: number }> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Filter to only include today or future days when creating for all days
      const daysToCreate = forAllDays 
        ? (event?.days || [])
            .filter(d => {
              if (!d.date) return true; // Include days without dates
              const dayDate = new Date(d.date);
              dayDate.setHours(0, 0, 0, 0);
              return dayDate >= today;
            })
            .map(d => d.dayNumber)
            .sort((a, b) => a - b)
        : [selectedDay];
      
      let firstContainer: Match | null = null;
      
      // Get or create containers for each day
      for (const dayNumber of daysToCreate) {
        const container = await getOrCreateDaySideMatchContainer(dayNumber);
        if (!firstContainer) {
          firstContainer = container;
        }
      }
      
      return { container: firstContainer, daysCreated: daysToCreate.length };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "matches"] });
      if (variables?.forAllDays) {
        toast({ title: `Side match containers ready for ${result.daysCreated} day${result.daysCreated !== 1 ? 's' : ''} (today and future)` });
      } else {
        toast({ title: "Side match container ready" });
      }
      // Navigate to the container to add betting games
      if (result.container) {
        setLocation(`/match/${result.container.id}`);
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create side match container", variant: "destructive" });
    },
  });

  const saveScoresMutation = useMutation({
    mutationFn: async ({ sideId, scores, matchResult }: {
      sideId: number;
      scores: { holeNumber: number; player1Strokes: number | null; player2Strokes: number | null }[];
      matchResult?: { winningSideId: number | null; winningMargin: string | null; isComplete: boolean };
    }) => {
      return apiRequest("POST", `/api/ryder-cup/sides/${sideId}/scores`, { scores, matchResult });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save score", variant: "destructive" });
    },
  });

  const recordCTHWinnerMutation = useMutation({
    mutationFn: async ({ dayId, holeNumber, winnerName }: {
      dayId: number;
      holeNumber: number;
      winnerName: string | null;
    }) => {
      return apiRequest("POST", `/api/ryder-cup/days/${dayId}/closest-to-hole`, { holeNumber, winnerName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup/days", currentDay?.id, "closest-to-hole"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "closest-to-hole"] });
      toast({ title: "Saved", description: "Closest to hole winner updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save CTH winner", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Event not found</p>
      </div>
    );
  }

  const teamA = event.teams[0];
  const teamB = event.teams[1];
  
  // Helper functions for manual bet dialog
  const allEventPlayers = [...(teamA?.members || []), ...(teamB?.members || [])];
  
  const addBetEntry = () => {
    setBetEntries([...betEntries, { presetPlayerId: null, playerName: "", amount: "" }]);
  };
  
  const removeBetEntry = (index: number) => {
    if (betEntries.length > 2) {
      setBetEntries(betEntries.filter((_, i) => i !== index));
    }
  };
  
  const updateBetEntryPlayer = (index: number, playerName: string) => {
    const updated = [...betEntries];
    const player = allEventPlayers.find(p => p.playerName === playerName);
    updated[index].presetPlayerId = player?.presetPlayerId || null;
    updated[index].playerName = playerName;
    setBetEntries(updated);
  };
  
  const updateBetEntryAmount = (index: number, amount: string) => {
    const updated = [...betEntries];
    updated[index].amount = amount;
    setBetEntries(updated);
  };
  
  const calculateBetTotal = () => {
    return betEntries.reduce((sum, e) => {
      const amount = parseFloat(e.amount) || 0;
      return sum + amount;
    }, 0);
  };
  
  const handleSubmitBet = () => {
    if (!betDescription.trim()) {
      toast({ title: "Please enter a description", variant: "destructive" });
      return;
    }
    
    const validEntries = betEntries.filter(e => e.playerName.trim() && e.amount);
    if (validEntries.length < 2) {
      toast({ title: "At least 2 players required", variant: "destructive" });
      return;
    }
    
    // Check for duplicate players
    const playerNames = validEntries.map(e => e.playerName);
    if (new Set(playerNames).size !== playerNames.length) {
      toast({ title: "Each player can only appear once", variant: "destructive" });
      return;
    }
    
    const total = calculateBetTotal();
    if (Math.abs(total) > 0.01) {
      toast({ title: "Total must equal zero", description: `Current total: $${total.toFixed(2)}`, variant: "destructive" });
      return;
    }
    
    createManualBetMutation.mutate({
      description: betDescription.trim(),
      ryderCupEventId: parseInt(id),
      entries: validEntries.map(e => ({
        playerName: e.playerName.trim(),
        presetPlayerId: e.presetPlayerId || undefined,
        amount: Math.round(parseFloat(e.amount) * 100), // Convert to cents
      })),
    });
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const getTeamById = (teamId: number) => event.teams.find(t => t.id === teamId);
  
  const getSideDisplay = (side: RyderCupPairingSide) => {
    const team = getTeamById(side.teamId);
    const names = [side.player1Name, side.player2Name].filter(Boolean).join(" & ");
    return { names, teamName: team?.name || "", color: team?.color || "#888" };
  };

  const calculatePayouts = () => {
    const payouts: Record<string, number> = {};
    const allPlayers = [...(teamA?.members || []), ...(teamB?.members || [])];
    allPlayers.forEach(m => { payouts[m.playerName] = 0; });

    for (const day of event.days) {
      for (const pairing of day.pairings) {
        if (!pairing.result || !pairing.isPrimary) continue;
        
        for (const side of pairing.sides) {
          const players = [side.player1Name, side.player2Name].filter((n): n is string => n !== null);
          const isWinner = pairing.result.winningSideId === side.id;
          const isTie = !pairing.result.winningSideId;
          
          for (const playerName of players) {
            if (isWinner) {
              payouts[playerName] = (payouts[playerName] || 0) + event.matchWinBonus;
            } else if (isTie) {
              payouts[playerName] = (payouts[playerName] || 0) + event.matchTieBonus;
            }
          }
        }
      }
    }

    if (event.status === "completed" && event.winningTeamId) {
      const winningTeam = event.teams.find(t => t.id === event.winningTeamId);
      winningTeam?.members.forEach(m => {
        payouts[m.playerName] = (payouts[m.playerName] || 0) + event.teamWinBonus;
      });
    }

    // Add CTH winnings
    if (event.closestToHolePayout > 0) {
      for (const cth of allCthWinners) {
        if (cth.winnerName) {
          payouts[cth.winnerName] = (payouts[cth.winnerName] || 0) + event.closestToHolePayout;
        }
      }
    }

    // Note: Skins winnings are added separately after calculateDaySkins is defined
    return payouts;
  };

  const payouts = calculatePayouts();

  // Calculate per-day earnings breakdown
  const calculateEarningsByDay = (): Record<number, Record<string, number>> => {
    const earningsByDay: Record<number, Record<string, number>> = {};
    
    for (const day of event.days) {
      earningsByDay[day.dayNumber] = {};
      const allPlayers = [...(teamA?.members || []), ...(teamB?.members || [])];
      allPlayers.forEach(m => { earningsByDay[day.dayNumber][m.playerName] = 0; });
      
      for (const pairing of day.pairings) {
        if (!pairing.result || !pairing.isPrimary) continue;
        
        for (const side of pairing.sides) {
          const players = [side.player1Name, side.player2Name].filter((n): n is string => n !== null);
          const isWinner = pairing.result.winningSideId === side.id;
          const isTie = !pairing.result.winningSideId;
          
          for (const playerName of players) {
            if (isWinner) {
              earningsByDay[day.dayNumber][playerName] = (earningsByDay[day.dayNumber][playerName] || 0) + event.matchWinBonus;
            } else if (isTie) {
              earningsByDay[day.dayNumber][playerName] = (earningsByDay[day.dayNumber][playerName] || 0) + event.matchTieBonus;
            }
          }
        }
      }
      
      // Add CTH winnings for this day
      if (event.closestToHolePayout > 0) {
        const dayCthWinners = allCthWinners.filter(cth => cth.dayId === day.id);
        for (const cth of dayCthWinners) {
          if (cth.winnerName) {
            earningsByDay[day.dayNumber][cth.winnerName] = (earningsByDay[day.dayNumber][cth.winnerName] || 0) + event.closestToHolePayout;
          }
        }
      }
    }
    
    return earningsByDay;
  };
  
  const earningsByDay = calculateEarningsByDay();

  // Function to recalculate and save all side match results for the Event Ledger
  const refreshSideMatchResults = async () => {
    if (!sideMatchLedger?.eventMatches || sideMatchLedger.eventMatches.length === 0) return;
    
    setIsRefreshingLedger(true);
    try {
      // Calculate results using the same logic as computeSideBetData
      const results = calculateSideBetResults();
      
      // Save results to the database for each event match
      for (const em of sideMatchLedger.eventMatches) {
        const matchEntries = results.entries.filter(e => e.matchId === em.id);
        if (matchEntries.length === 0) continue;
        
        // Convert entries to the format expected by the API (amounts already in cents)
        const resultsToSave = matchEntries.map(e => ({
          eventMatchId: em.id,
          playerId: e.playerId,
          playerName: e.playerName,
          amount: e.amount, // Already in cents
          betType: e.betType || null,
          isComplete: e.isComplete,
          isAutoPress: e.isAutoPress || false,
          teamName: e.teamName || null,
          teamIndex: e.teamIndex ?? null,
        }));
        
        // Save to the event match results table (API expects array directly)
        await apiRequest('POST', `/api/event-matches/${em.id}/results`, resultsToSave);
      }
      
      // Refresh the side match ledger data to get the updated stored results
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "side-match-ledger"] });
    } catch (error) {
      console.error("Error refreshing side match results:", error);
    } finally {
      setIsRefreshingLedger(false);
    }
  };
  
  // Calculate side bet results (extracted for reuse)
  const calculateSideBetResults = (): { balances: Record<string, number>; entries: LedgerEntry[] } => {
    if (!sideMatchLedger?.eventMatches) {
      return { balances: {}, entries: [] };
    }

    // Convert Ryder Cup scores to the format expected by calculateLedger
    // Build a map of playerId -> scores by hole from Ryder Cup pairings
    const convertedScores: Array<{ playerId: number; matchId: number; holeNumber: number; strokes: number }> = [];
    
    for (const em of sideMatchLedger.eventMatches) {
      // Find the match to get the day number
      const match = sideMatchLedger.matches.find((m: { id: number }) => m.id === em.eventId);
      const dayNumber = match?.ryderCupDayNumber;
      
      if (dayNumber && sideMatchLedger.ryderCupScoresByDay?.[dayNumber]) {
        const dayScores = sideMatchLedger.ryderCupScoresByDay[dayNumber];
        
        // For each team member, get their Ryder Cup scores
        for (const team of em.teams || []) {
          for (const member of team.members || []) {
            const playerName = member.player?.name;
            if (playerName && dayScores[playerName]) {
              // Convert player's Ryder Cup scores to the expected format
              for (const [holeStr, strokes] of Object.entries(dayScores[playerName])) {
                const holeNumber = parseInt(holeStr);
                convertedScores.push({
                  playerId: member.playerId,
                  matchId: em.eventId,
                  holeNumber,
                  strokes: strokes as number,
                });
              }
            }
          }
        }
      }
    }

    // Build net context map for net scoring calculations
    // Use ryderCupPlayerDataByDay as authoritative source for handicaps (same as Ledger)
    const netContextMap = new Map<number, NetScoringContext>();
    for (const em of sideMatchLedger.eventMatches) {
      if (em.useNetScoring && sideMatchLedger.courseData) {
        const match = sideMatchLedger.matches.find((m: { id: number }) => m.id === em.eventId);
        const courseId = match?.courseId;
        const dayNumber = match?.ryderCupDayNumber;
        
        // Get Ryder Cup player data for this day as authoritative source
        const rcPlayerData = dayNumber ? sideMatchLedger.ryderCupPlayerDataByDay?.[dayNumber] : undefined;
        
        if (courseId && sideMatchLedger.courseData[courseId]) {
          const courseData = sideMatchLedger.courseData[courseId];
          const holeHandicaps = new Map<number, number>();
          for (const hole of courseData.holes) {
            if (hole.handicap !== null) {
              holeHandicaps.set(hole.holeNumber, hole.handicap);
            }
          }
          
          // Calculate course par from holes (holes data includes par field at runtime)
          const coursePar = (courseData.holes as Array<{ par?: number }>).reduce((sum: number, h) => sum + (h.par ?? 0), 0);
          
          // Build tee lookup for course handicap calculation
          const teeLookup = new Map<number, { slopeRating: number; courseRating: number }>();
          for (const tee of courseData.tees) {
            teeLookup.set(tee.id, { slopeRating: tee.slopeRating, courseRating: tee.courseRating });
          }
          
          const courseHandicaps = new Map<number, number>();
          
          // Get handicap overrides for this event match (em.id is the event match ID)
          const eventMatchOverrides = sideMatchLedger.handicapOverrides?.[em.id] || {};
          
          for (const team of em.teams || []) {
            for (const member of team.members || []) {
              if (courseHandicaps.has(member.playerId)) continue;
              
              const player = member.player;
              if (!player) continue;
              
              // Check for handicap override first - this takes priority
              const overrideCourseHcp = eventMatchOverrides[member.playerId];
              if (overrideCourseHcp !== undefined) {
                courseHandicaps.set(member.playerId, overrideCourseHcp);
                continue;
              }
              
              // For Ryder Cup side matches, use pairing data as authoritative source
              const playerName = player.name;
              const pairingData = playerName ? rcPlayerData?.[playerName] : undefined;
              const handicapIndex = pairingData?.handicapIndex ?? player.handicapIndex;
              const teeId = pairingData?.teeId ?? player.teeId;
              
              if (handicapIndex === null || handicapIndex === undefined) continue;
              
              if (teeId && teeLookup.has(teeId)) {
                const teeInfo = teeLookup.get(teeId)!;
                // USGA formula: Handicap Index × (Slope ÷ 113) + (Course Rating - Par)
                const courseHcp = calculateCourseHandicap(handicapIndex, teeInfo.slopeRating, teeInfo.courseRating, coursePar);
                if (courseHcp !== null) {
                  courseHandicaps.set(member.playerId, courseHcp);
                }
              } else {
                // Fall back to handicap index as course handicap
                courseHandicaps.set(member.playerId, Math.round(handicapIndex / 10));
              }
            }
          }
          
          // Calculate relative handicaps based on course handicaps
          if (courseHandicaps.size > 0) {
            const minHandicap = Math.min(...Array.from(courseHandicaps.values()));
            const playerHandicaps = new Map<number, number>();
            courseHandicaps.forEach((ch, playerId) => {
              playerHandicaps.set(playerId, ch - minHandicap);
            });
            
            netContextMap.set(em.eventId, { holeHandicaps, playerHandicaps, courseHandicaps });
          }
        }
      }
    }

    // Prefer regular match scores when they exist, otherwise use Ryder Cup pairing scores
    // Build a set of match IDs that have regular scores
    const matchIdsWithRegularScores = new Set<number>();
    for (const score of sideMatchLedger.scores || []) {
      matchIdsWithRegularScores.add(score.matchId);
    }
    
    // For each event match, decide which scores to use:
    // - If regular scores exist for this match, use them
    // - Otherwise, use converted Ryder Cup pairing scores
    const scoresToUse: Array<{ playerId: number; matchId: number; holeNumber: number; strokes: number }> = [];
    
    for (const em of sideMatchLedger.eventMatches) {
      const matchId = em.eventId;
      
      if (matchIdsWithRegularScores.has(matchId)) {
        // Use regular match scores for this event match
        const matchScores = (sideMatchLedger.scores || []).filter((s: any) => s.matchId === matchId);
        scoresToUse.push(...matchScores);
      } else {
        // Use converted Ryder Cup pairing scores for this event match
        const convertedForThisMatch = convertedScores.filter(s => s.matchId === matchId);
        scoresToUse.push(...convertedForThisMatch);
      }
    }

    // Build pars array from courseHoles (courseHoles is available from currentCourse)
    const parsArray = courseHoles.length > 0 
      ? Array.from({ length: 18 }, (_, i) => {
          const hole = courseHoles.find(h => h.holeNumber === i + 1);
          return hole?.par ?? 4;
        })
      : null;

    const { entries, balances: playerBalances } = calculateLedger(
      sideMatchLedger.eventMatches as any,
      scoresToUse as any,
      netContextMap.size > 0 ? netContextMap : null,
      parsArray
    );

    // Aggregate balances by player name (normalize to handle duplicates)
    // Convert from dollars to cents to match other amounts (payouts, expenses)
    const balancesByName: Record<string, number> = {};
    for (const balance of playerBalances) {
      const name = balance.playerName;
      balancesByName[name] = (balancesByName[name] || 0) + Math.round(balance.netBalance * 100);
    }

    // Also convert entry amounts from dollars to cents
    const entriesInCents = entries.map(e => ({
      ...e,
      amount: Math.round(e.amount * 100),
    }));

    return { balances: balancesByName, entries: entriesInCents };
  };

  // Use stored results if available, otherwise calculate fresh
  const computeSideBetData = (): { balances: Record<string, number>; entries: LedgerEntry[] } => {
    // If we have stored results from the API, use them directly
    if (sideMatchLedger?.storedResults && sideMatchLedger.storedResults.length > 0) {
      const balancesByName: Record<string, number> = {};
      const entries: LedgerEntry[] = [];
      
      // Group stored results by event match to build entries
      for (const result of sideMatchLedger.storedResults) {
        // Find the event match details
        const eventMatch = sideMatchLedger.eventMatches?.find((em: any) => em.id === result.eventMatchId);
        const match = eventMatch ? sideMatchLedger.matches?.find((m: any) => m.id === eventMatch.eventId) : null;
        
        // Build the entry from stored result (amounts are already in cents)
        entries.push({
          matchId: result.eventMatchId,
          matchName: `${match?.name || 'Unknown'} - ${result.betType || 'Bet'}`,
          playerId: result.playerId,
          playerName: result.playerName,
          amount: result.amount, // Already in cents from database
          isComplete: result.isComplete,
          createdAt: match?.createdAt || '',
          betType: result.betType || undefined,
          isAutoPress: result.isAutoPress,
          pressHole: null,
          teamAMembers: [],
          teamBMembers: [],
          teamName: result.teamName || undefined,
          teamIndex: result.teamIndex ?? 0,
        });
        
        // Aggregate balances (amounts already in cents)
        balancesByName[result.playerName] = (balancesByName[result.playerName] || 0) + result.amount;
      }
      
      return { balances: balancesByName, entries };
    }
    
    // Fallback to calculating fresh if no stored results
    return calculateSideBetResults();
  };

  const sideBetData = computeSideBetData();

  // Calculate per-day side bet breakdown
  const computeSideBetsByDay = (): Record<number, Record<string, number>> => {
    const sideBetsByDay: Record<number, Record<string, number>> = {};
    
    // Initialize all days with all players
    for (const day of event?.days || []) {
      sideBetsByDay[day.dayNumber] = {};
      const allPlayers = [...(teamA?.members || []), ...(teamB?.members || [])];
      allPlayers.forEach(m => { sideBetsByDay[day.dayNumber][m.playerName] = 0; });
    }
    
    // Group entries by day
    for (const entry of sideBetData.entries) {
      // Find which day this entry belongs to
      const eventMatch = sideMatchLedger?.eventMatches?.find((em: any) => em.id === entry.matchId);
      const match = sideMatchLedger?.matches?.find((m: any) => m.id === eventMatch?.eventId);
      const dayNumber = match?.ryderCupDayNumber;
      
      if (dayNumber && sideBetsByDay[dayNumber]) {
        sideBetsByDay[dayNumber][entry.playerName] = (sideBetsByDay[dayNumber][entry.playerName] || 0) + entry.amount;
      }
    }
    
    return sideBetsByDay;
  };
  
  const sideBetsByDay = computeSideBetsByDay();

  // Get entries for a specific player's earnings breakdown (from Ryder Cup matches)
  const getEarningsBreakdown = (playerName: string) => {
    const breakdown: { description: string; amount: number }[] = [];
    
    for (const day of event?.days || []) {
      for (const pairing of day.pairings) {
        if (!pairing.result || !pairing.isPrimary) continue;
        
        for (const side of pairing.sides) {
          const players = [side.player1Name, side.player2Name].filter((n): n is string => n !== null);
          if (!players.includes(playerName)) continue;
          
          const isWinner = pairing.result.winningSideId === side.id;
          const isTie = !pairing.result.winningSideId;
          const otherSide = pairing.sides.find(s => s.id !== side.id);
          const opponents = [otherSide?.player1Name, otherSide?.player2Name].filter((n): n is string => n !== null).join(" & ");
          
          if (isWinner) {
            breakdown.push({
              description: `Day ${day.dayNumber}: Won vs ${opponents}`,
              amount: event!.matchWinBonus,
            });
          } else if (isTie) {
            breakdown.push({
              description: `Day ${day.dayNumber}: Tied vs ${opponents}`,
              amount: event!.matchTieBonus,
            });
          }
        }
      }
    }
    
    if (event?.status === "completed" && event.winningTeamId) {
      const winningTeam = event.teams.find(t => t.id === event.winningTeamId);
      const isOnWinningTeam = winningTeam?.members.some(m => m.playerName === playerName);
      if (isOnWinningTeam) {
        breakdown.push({
          description: `Overall team win bonus (${winningTeam?.name})`,
          amount: event.teamWinBonus,
        });
      }
    }
    
    // Add CTH winnings to breakdown
    if (event?.closestToHolePayout > 0) {
      const playerCthWins = allCthWinners.filter(cth => cth.winnerName === playerName);
      for (const cth of playerCthWins) {
        const day = event.days.find(d => d.id === cth.dayId);
        breakdown.push({
          description: `Day ${day?.dayNumber || '?'}: Closest to hole #${cth.holeNumber}`,
          amount: event.closestToHolePayout,
        });
      }
    }
    
    // Add skins winnings to breakdown
    if (event?.dailySkinsPot > 0 && courseHoles.length > 0) {
      for (const day of event.days) {
        try {
          const daySkins = calculateDaySkins(day.dayNumber);
          if (daySkins) {
            const playerWins = daySkins.skinWinners.find(w => w.name === playerName);
            if (playerWins && playerWins.skinsWon > 0) {
              breakdown.push({
                description: `Day ${day.dayNumber}: ${playerWins.skinsWon} skin${playerWins.skinsWon > 1 ? 's' : ''} won`,
                amount: Math.round(playerWins.earnings * 100), // Convert dollars to cents
              });
            }
          }
        } catch (e) {
          // Ignore errors in skins calculation
        }
      }
    }
    
    return breakdown;
  };

  // Get entries for a specific player's side bet breakdown
  const getSideBetBreakdown = (playerName: string) => {
    if (!sideBetData.entries) return [];
    
    const normalized = playerName.toLowerCase().trim();
    return sideBetData.entries.filter(e => 
      e.playerName.toLowerCase().trim() === normalized && e.isComplete
    );
  };

  // Get per-day earnings breakdown for a specific player and day
  const getDayEarningsBreakdown = (playerName: string, dayNumber: number) => {
    const breakdown: { description: string; amount: number }[] = [];
    const day = event?.days?.find(d => d.dayNumber === dayNumber);
    if (!day) return breakdown;
    
    for (const pairing of day.pairings) {
      if (!pairing.result || !pairing.isPrimary) continue;
      
      for (const side of pairing.sides) {
        const players = [side.player1Name, side.player2Name].filter((n): n is string => n !== null);
        if (!players.includes(playerName)) continue;
        
        const isWinner = pairing.result.winningSideId === side.id;
        const isTie = !pairing.result.winningSideId;
        const otherSide = pairing.sides.find(s => s.id !== side.id);
        const opponents = [otherSide?.player1Name, otherSide?.player2Name].filter((n): n is string => n !== null).join(" & ");
        
        if (isWinner) {
          breakdown.push({
            description: `Won vs ${opponents}`,
            amount: event!.matchWinBonus,
          });
        } else if (isTie) {
          breakdown.push({
            description: `Tied vs ${opponents}`,
            amount: event!.matchTieBonus,
          });
        }
      }
    }
    
    // Add CTH winnings for this day
    if (event?.closestToHolePayout > 0) {
      const dayCthWins = allCthWinners.filter(cth => cth.dayId === day.id && cth.winnerName === playerName);
      for (const cth of dayCthWins) {
        breakdown.push({
          description: `Closest to hole #${cth.holeNumber}`,
          amount: event.closestToHolePayout,
        });
      }
    }
    
    return breakdown;
  };

  // Get per-day side bet breakdown for a specific player and day
  const getDaySideBetBreakdown = (playerName: string, dayNumber: number) => {
    if (!sideBetData.entries || !sideMatchLedger?.eventMatches || !sideMatchLedger?.matches) return [];
    
    const normalized = playerName.toLowerCase().trim();
    return sideBetData.entries.filter(e => {
      if (e.playerName.toLowerCase().trim() !== normalized || !e.isComplete) return false;
      
      // Find which day this entry belongs to
      const eventMatch = sideMatchLedger.eventMatches.find((em: any) => em.id === e.matchId);
      const match = sideMatchLedger.matches.find((m: any) => m.id === eventMatch?.eventId);
      return match?.ryderCupDayNumber === dayNumber;
    });
  };

  // Calculate skins for a specific day
  interface DaySkinResult {
    holeNumber: number;
    winnerId: string | null; // player name as ID
    winnerName: string | null;
    lowestScore: number | null;
    isSkin: boolean;
    isPending: boolean; // waiting for next hole to be played
  }

  interface DaySkinsData {
    players: { name: string; teamColor: string; scores: (number | null)[]; strokesPerHole: number[]; courseHandicap: number | null }[];
    holeResults: DaySkinResult[];
    totalSkins: number;
    skinWinners: { name: string; skinsWon: number; earnings: number }[];
    skinValue: number;
    totalPot: number;
    isComplete: boolean;
    pars: (number | null)[];
  }

  const calculateDaySkins = (dayNumber: number): DaySkinsData | null => {
    const day = event.days.find(d => d.dayNumber === dayNumber);
    if (!day) return null;

    // Gather all unique players, their scores, and their handicap info from all pairings
    const playerMap = new Map<string, { teamColor: string; scores: (number | null)[]; courseHandicap: number | null }>();

    // Calculate course par for handicap calculations
    const coursePar = courseHoles.reduce((sum, h) => sum + (h.par ?? 0), 0) || 72;

    // Build a lookup of team member handicaps by player name (fallback when side doesn't have handicap)
    const memberHandicapLookup = new Map<string, number | null>();
    for (const team of event.teams) {
      for (const member of team.members || []) {
        if (member.playerName) {
          memberHandicapLookup.set(member.playerName, member.handicapIndex ?? null);
        }
      }
    }

    // Helper to calculate course handicap from handicap index
    const getCourseHandicap = (handicapIndexTenths: number | null, teeId: number | null): number | null => {
      if (handicapIndexTenths === null || handicapIndexTenths === undefined) return null;
      const handicapIndex = handicapIndexTenths / 10;
      const tee = courseTees?.find(t => t.id === teeId);
      if (tee) {
        const slopeAdj = handicapIndex * ((tee.slopeRating || 113) / 113);
        const ratingDiff = ((tee.courseRating || 720) / 10) - coursePar;
        return Math.round(slopeAdj + ratingDiff);
      }
      return Math.round(handicapIndex);
    };

    for (const pairing of day.pairings) {
      for (const side of pairing.sides) {
        const team = getTeamById(side.teamId);
        const color = team?.color || "#888";

        // Player 1
        if (side.player1Name) {
          if (!playerMap.has(side.player1Name)) {
            // Try side handicap first, fall back to team member handicap
            const sideHcp = side.player1HandicapIndex;
            const memberHcp = memberHandicapLookup.get(side.player1Name);
            const handicapIndexTenths = sideHcp ?? memberHcp ?? null;
            const courseHcp = getCourseHandicap(handicapIndexTenths, side.player1TeeId);
            playerMap.set(side.player1Name, { teamColor: color, scores: Array(18).fill(null), courseHandicap: courseHcp });
          }
          // Fill in scores from this side
          for (const score of side.scores) {
            if (score.player1Strokes !== null) {
              playerMap.get(side.player1Name)!.scores[score.holeNumber - 1] = score.player1Strokes;
            }
          }
        }

        // Player 2
        if (side.player2Name) {
          if (!playerMap.has(side.player2Name)) {
            // Try side handicap first, fall back to team member handicap
            const sideHcp = side.player2HandicapIndex;
            const memberHcp = memberHandicapLookup.get(side.player2Name);
            const handicapIndexTenths = sideHcp ?? memberHcp ?? null;
            const courseHcp = getCourseHandicap(handicapIndexTenths, side.player2TeeId);
            playerMap.set(side.player2Name, { teamColor: color, scores: Array(18).fill(null), courseHandicap: courseHcp });
          }
          for (const score of side.scores) {
            if (score.player2Strokes !== null) {
              playerMap.get(side.player2Name)!.scores[score.holeNumber - 1] = score.player2Strokes;
            }
          }
        }
      }
    }

    if (playerMap.size === 0) return null;

    // Build hole handicap lookup first (needed to calculate strokes per hole)
    const holeHandicaps = new Map<number, number>();
    for (const hole of courseHoles) {
      if (hole.handicap !== null) {
        holeHandicaps.set(hole.holeNumber, hole.handicap);
      }
    }

    // Helper to get strokes a player receives on a specific hole
    const getPlayerStrokesOnHole = (courseHandicap: number | null, holeNumber: number): number => {
      if (courseHandicap === null || courseHandicap <= 0) return 0;
      const holeHcp = holeHandicaps.get(holeNumber);
      if (holeHcp === undefined) return 0;
      // Player gets a stroke if their course handicap >= hole handicap
      // For each 18 strokes, they get an extra stroke on each hole
      const baseStrokes = Math.floor(courseHandicap / 18);
      const extraStrokes = courseHandicap % 18;
      return baseStrokes + (holeHcp <= extraStrokes ? 1 : 0);
    };

    // Build players array with strokes per hole
    const players = Array.from(playerMap.entries()).map(([name, data]) => {
      // Calculate strokes for each hole (1-18)
      const strokesPerHole = Array.from({ length: 18 }, (_, i) => 
        getPlayerStrokesOnHole(data.courseHandicap, i + 1)
      );
      return {
        name,
        teamColor: data.teamColor,
        scores: data.scores,
        courseHandicap: data.courseHandicap,
        strokesPerHole,
      };
    });

    // Calculate net scores for each player
    const getNetScore = (player: typeof players[0], holeIndex: number): number | null => {
      const grossScore = player.scores[holeIndex];
      if (grossScore === null) return null;
      const strokes = getPlayerStrokesOnHole(player.courseHandicap, holeIndex + 1);
      return grossScore - strokes;
    };

    // Calculate skins for each hole
    const holeResults: DaySkinResult[] = [];
    const skinCounts = new Map<string, number>();
    players.forEach(p => skinCounts.set(p.name, 0));

    // Check if all 18 holes have scores for all players
    let allHolesComplete = true;
    for (let hole = 0; hole < 18; hole++) {
      const allHaveScores = players.every(p => p.scores[hole] !== null);
      if (!allHaveScores) {
        allHolesComplete = false;
        break;
      }
    }

    for (let hole = 0; hole < 18; hole++) {
      const holeNumber = hole + 1;
      // Use NET scores for skins when handicaps are enabled
      const holeScores = players
        .filter(p => p.scores[hole] !== null)
        .map(p => {
          const netScore = event.useHandicaps ? getNetScore(p, hole) : p.scores[hole];
          return { name: p.name, strokes: netScore!, grossStrokes: p.scores[hole]!, courseHandicap: p.courseHandicap };
        });

      if (holeScores.length === 0) {
        holeResults.push({
          holeNumber,
          winnerId: null,
          winnerName: null,
          lowestScore: null,
          isSkin: false,
          isPending: false,
        });
        continue;
      }

      const minScore = Math.min(...holeScores.map(s => s.strokes));
      const playersWithMinScore = holeScores.filter(s => s.strokes === minScore);

      // Tie - no skin
      if (playersWithMinScore.length !== 1) {
        holeResults.push({
          holeNumber,
          winnerId: null,
          winnerName: null,
          lowestScore: minScore,
          isSkin: false,
          isPending: false,
        });
        continue;
      }

      const potentialWinner = playersWithMinScore[0];

      // For holes 1-17: must make NET par or better on next hole to validate the skin
      if (hole < 17) {
        const nextHoleNumber = hole + 2; // hole is 0-indexed, holeNumber is 1-indexed
        const nextHolePar = courseHoles.find(h => h.holeNumber === nextHoleNumber)?.par ?? 4;
        
        // Get the potential winner's score on the next hole (use net score if handicaps enabled)
        const winnerData = players.find(p => p.name === potentialWinner.name);
        const winnerNextGross = winnerData?.scores[hole + 1] ?? null;
        const winnerNextNet = winnerData && event.useHandicaps 
          ? getNetScore(winnerData, hole + 1) 
          : winnerNextGross;

        if (winnerNextNet === null) {
          // Next hole not played yet - pending
          holeResults.push({
            holeNumber,
            winnerId: potentialWinner.name,
            winnerName: potentialWinner.name,
            lowestScore: minScore,
            isSkin: false,
            isPending: true,
          });
          continue;
        }

        // Check if winner made NET par or better on the next hole
        const madeParOrBetter = winnerNextNet <= nextHolePar;

        if (madeParOrBetter) {
          // Winner made par or better on next hole - skin awarded
          skinCounts.set(potentialWinner.name, (skinCounts.get(potentialWinner.name) || 0) + 1);
          holeResults.push({
            holeNumber,
            winnerId: potentialWinner.name,
            winnerName: potentialWinner.name,
            lowestScore: minScore,
            isSkin: true,
            isPending: false,
          });
        } else {
          // Winner didn't make par or better on next hole - no skin
          holeResults.push({
            holeNumber,
            winnerId: potentialWinner.name,
            winnerName: potentialWinner.name,
            lowestScore: minScore,
            isSkin: false,
            isPending: false,
          });
        }
      } else {
        // Hole 18: just needs lone low score
        skinCounts.set(potentialWinner.name, (skinCounts.get(potentialWinner.name) || 0) + 1);
        holeResults.push({
          holeNumber,
          winnerId: potentialWinner.name,
          winnerName: potentialWinner.name,
          lowestScore: minScore,
          isSkin: true,
          isPending: false,
        });
      }
    }

    // Calculate totals
    const totalSkins = Array.from(skinCounts.values()).reduce((sum, count) => sum + count, 0);
    const totalPot = (event.dailySkinsPot + (day.skinsCarryover || 0)) / 100; // Convert cents to dollars
    const skinValue = totalSkins > 0 ? totalPot / totalSkins : 0;

    const skinWinners = Array.from(skinCounts.entries())
      .filter(([_, count]) => count > 0)
      .map(([name, skinsWon]) => ({
        name,
        skinsWon,
        earnings: skinsWon * skinValue,
      }))
      .sort((a, b) => b.skinsWon - a.skinsWon);

    // Build pars array for display
    const pars = Array.from({ length: 18 }, (_, i) => {
      const hole = courseHoles.find(h => h.holeNumber === i + 1);
      return hole?.par ?? null;
    });

    return {
      players,
      holeResults,
      totalSkins,
      skinWinners,
      skinValue: Math.round(skinValue * 100) / 100,
      totalPot,
      isComplete: allHolesComplete,
      pars,
    };
  };

  const skinsData = calculateDaySkins(selectedSkinsDay);
  
  // Calculate payouts with skins included (now that calculateDaySkins is defined)
  const payoutsWithSkins = (() => {
    const result = { ...payouts };
    
    if (event.dailySkinsPot > 0 && courseHoles.length > 0) {
      for (const day of event.days) {
        try {
          const daySkins = calculateDaySkins(day.dayNumber);
          if (daySkins) {
            for (const winner of daySkins.skinWinners) {
              // earnings is in dollars, need to convert to cents
              result[winner.name] = (result[winner.name] || 0) + Math.round(winner.earnings * 100);
            }
          }
        } catch (e) {
          console.error(`Error calculating skins for day ${day.dayNumber}:`, e);
        }
      }
    }
    
    return result;
  })();

  const openRecordResult = (pairingId: number) => {
    setSelectedPairingId(pairingId);
    setSelectedWinnerId(null);
    setWinningMargin("");
    setRecordResultDialogOpen(true);
  };

  const selectedPairing = currentDay?.pairings.find(p => p.id === selectedPairingId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/ryder-cup")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {event.name}
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><Flag className="w-4 h-4" /> {event.courseName}</span>
            <Badge variant={event.status === "active" ? "default" : "secondary"}>
              {event.status === "setup" ? "Setting Up" : event.status === "active" ? "In Progress" : "Completed"}
            </Badge>
            {event.useHandicaps && <Badge variant="outline">Handicapped</Badge>}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card style={{ borderTop: `4px solid ${teamA?.color}` }}>
          <CardContent className="pt-4 text-center">
            {editingTeamId === teamA?.id ? (
              <div className="flex items-center justify-center gap-1">
                <Input
                  value={editingTeamName}
                  onChange={(e) => setEditingTeamName(e.target.value)}
                  className="h-8 text-center font-semibold text-lg max-w-32"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editingTeamName.trim()) {
                      updateTeamMutation.mutate({ teamId: teamA.id, name: editingTeamName.trim() });
                    } else if (e.key === "Escape") {
                      setEditingTeamId(null);
                      setEditingTeamName("");
                    }
                  }}
                  data-testid="input-team-a-name"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (editingTeamName.trim()) {
                      updateTeamMutation.mutate({ teamId: teamA.id, name: editingTeamName.trim() });
                    }
                  }}
                  disabled={updateTeamMutation.isPending}
                  data-testid="button-save-team-a-name"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditingTeamId(null);
                    setEditingTeamName("");
                  }}
                  data-testid="button-cancel-team-a-name"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <h3
                className="font-semibold text-lg cursor-pointer hover-elevate inline-flex items-center gap-1 px-2 py-1 rounded"
                onClick={() => {
                  if (isCreatorOrAdmin) {
                    setEditingTeamId(teamA?.id || null);
                    setEditingTeamName(teamA?.name || "");
                  }
                }}
                data-testid="text-team-a-name"
              >
                {teamA?.name}
                {isCreatorOrAdmin && <Pencil className="w-3 h-3 text-muted-foreground" />}
              </h3>
            )}
            <p className="text-4xl font-bold text-primary mt-2">
              {(teamA?.totalPoints || 0) / 10}
            </p>
            <p className="text-sm text-muted-foreground">points</p>
          </CardContent>
        </Card>

        <Card className="bg-muted/30">
          <CardContent className="pt-4 text-center">
            <p className="text-sm text-muted-foreground">First to</p>
            <p className="text-3xl font-bold">{event.targetPoints / 10}</p>
            <p className="text-sm text-muted-foreground">points wins</p>
            {event.status === "completed" && event.winningTeamId && (
              <Badge className="mt-2 bg-green-500">
                {getTeamById(event.winningTeamId)?.name} Wins!
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card style={{ borderTop: `4px solid ${teamB?.color}` }}>
          <CardContent className="pt-4 text-center">
            {editingTeamId === teamB?.id ? (
              <div className="flex items-center justify-center gap-1">
                <Input
                  value={editingTeamName}
                  onChange={(e) => setEditingTeamName(e.target.value)}
                  className="h-8 text-center font-semibold text-lg max-w-32"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && editingTeamName.trim()) {
                      updateTeamMutation.mutate({ teamId: teamB.id, name: editingTeamName.trim() });
                    } else if (e.key === "Escape") {
                      setEditingTeamId(null);
                      setEditingTeamName("");
                    }
                  }}
                  data-testid="input-team-b-name"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (editingTeamName.trim()) {
                      updateTeamMutation.mutate({ teamId: teamB.id, name: editingTeamName.trim() });
                    }
                  }}
                  disabled={updateTeamMutation.isPending}
                  data-testid="button-save-team-b-name"
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditingTeamId(null);
                    setEditingTeamName("");
                  }}
                  data-testid="button-cancel-team-b-name"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <h3
                className="font-semibold text-lg cursor-pointer hover-elevate inline-flex items-center gap-1 px-2 py-1 rounded"
                onClick={() => {
                  if (isCreatorOrAdmin) {
                    setEditingTeamId(teamB?.id || null);
                    setEditingTeamName(teamB?.name || "");
                  }
                }}
                data-testid="text-team-b-name"
              >
                {teamB?.name}
                {isCreatorOrAdmin && <Pencil className="w-3 h-3 text-muted-foreground" />}
              </h3>
            )}
            <p className="text-4xl font-bold text-primary mt-2">
              {(teamB?.totalPoints || 0) / 10}
            </p>
            <p className="text-sm text-muted-foreground">points</p>
          </CardContent>
        </Card>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(value) => {
          setActiveTab(value);
          // When switching to ledger tab, refresh all side match results
          if (value === "ledger") {
            refreshSideMatchResults();
          }
        }}
      >
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="schedule" data-testid="tab-schedule">Schedule</TabsTrigger>
          <TabsTrigger value="ledger" data-testid="tab-ledger">
            {isRefreshingLedger ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Ledger
          </TabsTrigger>
          <TabsTrigger value="skins" data-testid="tab-skins">Skins</TabsTrigger>
          <TabsTrigger value="payouts" data-testid="tab-payouts">Payouts</TabsTrigger>
          <TabsTrigger value="teams" data-testid="tab-teams">Teams</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {event.days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.dayNumber ? "default" : "outline"}
                onClick={() => setSelectedDay(day.dayNumber)}
                data-testid={`button-day-${day.dayNumber}`}
                className="flex-col h-auto py-2"
              >
                <span>Day {day.dayNumber}</span>
                {day.date && (
                  <span className="text-xs opacity-75 font-normal">{new Date(day.date).toLocaleDateString()}</span>
                )}
                {day.courseName && (
                  <span className="text-xs opacity-75 font-normal">{day.courseName}</span>
                )}
              </Button>
            ))}
          </div>

          {currentDay && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">Day {currentDay.dayNumber} Matches</h3>
                {isCreatorOrAdmin && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => recalculateResultsMutation.mutate()}
                    disabled={recalculateResultsMutation.isPending}
                    data-testid="button-recalculate-results"
                  >
                    <RefreshCw className={`w-4 h-4 mr-1 ${recalculateResultsMutation.isPending ? 'animate-spin' : ''}`} />
                    Recalculate Results
                  </Button>
                )}
                {editingDayCourse === currentDay.id ? (
                  <div className="flex items-center gap-2">
                    <Select
                      value={currentDay.courseId?.toString() || ""}
                      onValueChange={(val) => {
                        const course = courses.find(c => c.id === parseInt(val));
                        if (course) {
                          updateDayCourseMutation.mutate({
                            dayId: currentDay.id,
                            courseId: course.id,
                            courseName: course.name,
                          });
                        }
                      }}
                    >
                      <SelectTrigger className="w-[200px]" data-testid="select-day-course">
                        <SelectValue placeholder="Select course" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map((course) => (
                          <SelectItem key={course.id} value={course.id.toString()} data-testid={`select-item-course-${course.id}`}>
                            {course.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => setEditingDayCourse(null)}
                      data-testid="button-cancel-edit-course"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-xs" data-testid={`badge-day-course-${currentDay.id}`}>
                      <Flag className="w-3 h-3 mr-1" /> <span data-testid={`text-day-course-${currentDay.id}`}>{currentDay.courseName || "No course set"}</span>
                    </Badge>
                    {isCreatorOrAdmin ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            data-testid={`button-day-date-${currentDay.id}`}
                          >
                            <Calendar className="w-3 h-3 mr-1" /> {currentDay.date ? new Date(currentDay.date).toLocaleDateString() : "Set date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={currentDay.date ? new Date(currentDay.date) : undefined}
                            onSelect={(date: Date | undefined) => {
                              if (date) {
                                updateDayScheduleMutation.mutate({
                                  dayId: currentDay.id,
                                  date: date.toISOString(),
                                  teeTimes: currentDay.teeTimes || [],
                                });
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      currentDay.date && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          data-testid={`badge-day-date-${currentDay.id}`}
                        >
                          <Calendar className="w-3 h-3 mr-1" /> {new Date(currentDay.date).toLocaleDateString()}
                        </Badge>
                      )
                    )}
                    {isCreatorOrAdmin && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        onClick={() => setEditingDayCourse(currentDay.id)}
                        data-testid="button-edit-day-course"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {isCreatorOrAdmin && (
                <div className="p-3 border rounded-md space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Tee Times
                    </h4>
                    {editingDaySchedule === currentDay.id ? (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setEditingDaySchedule(null)}
                        data-testid={`button-done-edit-schedule-${currentDay.id}`}
                      >
                        Done
                      </Button>
                    ) : (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => setEditingDaySchedule(currentDay.id)}
                        data-testid={`button-edit-schedule-${currentDay.id}`}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Edit
                      </Button>
                    )}
                  </div>
                  
                  {editingDaySchedule === currentDay.id && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="w-16 text-sm">Date:</Label>
                        <Input
                          type="date"
                          value={currentDay.date ? new Date(currentDay.date).toISOString().split('T')[0] : ''}
                          onChange={(e) => {
                            updateDayScheduleMutation.mutate({
                              dayId: currentDay.id,
                              date: e.target.value,
                            });
                          }}
                          className="w-40"
                          data-testid={`input-date-day-${currentDay.id}`}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="w-16 text-sm">Add:</Label>
                        <Input
                          type="time"
                          value={newTeeTime}
                          onChange={(e) => setNewTeeTime(e.target.value)}
                          className="w-28"
                          data-testid={`input-tee-time-day-${currentDay.id}`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-add-tee-time-day-${currentDay.id}`}
                          onClick={() => {
                            if (newTeeTime) {
                              const [hours, mins] = newTeeTime.split(':');
                              const hour = parseInt(hours);
                              const ampm = hour >= 12 ? 'PM' : 'AM';
                              const displayHour = hour % 12 || 12;
                              const formattedTime = `${displayHour}:${mins} ${ampm}`;
                              const existingTimes = currentDay.teeTimes || [];
                              if (!existingTimes.includes(formattedTime)) {
                                const sortByTime = (a: string, b: string) => {
                                  const parseTime = (t: string) => {
                                    const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
                                    if (!match) return 0;
                                    let h = parseInt(match[1]);
                                    const m = parseInt(match[2]);
                                    const pm = match[3].toUpperCase() === 'PM';
                                    if (pm && h !== 12) h += 12;
                                    if (!pm && h === 12) h = 0;
                                    return h * 60 + m;
                                  };
                                  return parseTime(a) - parseTime(b);
                                };
                                updateDayScheduleMutation.mutate({
                                  dayId: currentDay.id,
                                  teeTimes: [...existingTimes, formattedTime].sort(sortByTime),
                                });
                              }
                              setNewTeeTime('');
                            }
                          }}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex flex-wrap gap-2">
                    {(currentDay.teeTimes || []).map((time, idx) => (
                      <Badge 
                        key={idx} 
                        variant="secondary" 
                        className="gap-1"
                        data-testid={`badge-tee-time-${currentDay.id}-${idx}`}
                      >
                        <Clock className="w-3 h-3" /> Slot {idx + 1}: {time}
                        {editingDaySchedule === currentDay.id && (
                          <button
                            onClick={() => {
                              const existingTimes = currentDay.teeTimes || [];
                              updateDayScheduleMutation.mutate({
                                dayId: currentDay.id,
                                teeTimes: existingTimes.filter((_, i) => i !== idx),
                              });
                            }}
                            className="ml-1 hover:text-destructive"
                            data-testid={`button-remove-tee-time-${currentDay.id}-${idx}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </Badge>
                    ))}
                    {(!currentDay.teeTimes || currentDay.teeTimes.length === 0) && (
                      <span className="text-sm text-muted-foreground">No tee times set - add tee times to assign them to matches</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Drag matches below to reorder. The first match gets the first tee time, second match gets second tee time, etc.
                  </p>
                </div>
              )}

              {(() => {
                // Sort by matchNumber which represents the slot/position
                const sortedPairings = [...currentDay.pairings.filter(p => p.isPrimary)].sort((a, b) => a.matchNumber - b.matchNumber);
                const teeTimes = currentDay.teeTimes || [];
                
                return sortedPairings.map((pairing, index) => {
                  const sideA = pairing.sides.find(s => s.teamId === teamA?.id);
                  const sideB = pairing.sides.find(s => s.teamId === teamB?.id);
                  const displayA = sideA ? getSideDisplay(sideA) : null;
                  const displayB = sideB ? getSideDisplay(sideB) : null;
                  // Tee time is based on position, not stored on pairing
                  const slotTeeTime = index < teeTimes.length ? teeTimes[index] : null;
                  
                  return (
                    <Card 
                      key={pairing.id} 
                      data-testid={`card-pairing-${pairing.id}`}
                      draggable={!!isCreatorOrAdmin}
                      onDragStart={() => setDraggingPairingId(pairing.id)}
                      onDragEnd={() => setDraggingPairingId(null)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (draggingPairingId && draggingPairingId !== pairing.id) {
                          e.currentTarget.classList.add('ring-2', 'ring-primary');
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('ring-2', 'ring-primary');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('ring-2', 'ring-primary');
                        if (draggingPairingId && draggingPairingId !== pairing.id) {
                          // Reorder: move dragged pairing to this position
                          const draggedIndex = sortedPairings.findIndex(p => p.id === draggingPairingId);
                          const targetIndex = index;
                          if (draggedIndex !== -1) {
                            const newOrder = [...sortedPairings];
                            const [removed] = newOrder.splice(draggedIndex, 1);
                            newOrder.splice(targetIndex, 0, removed);
                            reorderPairingsMutation.mutate({
                              dayId: currentDay.id,
                              pairingOrder: newOrder.map(p => p.id),
                            });
                          }
                          setDraggingPairingId(null);
                        }
                      }}
                      className={isCreatorOrAdmin ? "cursor-grab active:cursor-grabbing" : ""}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-center gap-2 mb-2">
                          {isCreatorOrAdmin && (
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                          )}
                          {slotTeeTime ? (
                            <Badge variant="outline" className="gap-1">
                              <Clock className="w-3 h-3" /> {slotTeeTime}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs opacity-60">
                              Slot {index + 1}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <div 
                              className="p-3 rounded-lg"
                              style={{ backgroundColor: `${displayA?.color}20` }}
                            >
                              <p className="text-xs text-muted-foreground mb-1 text-center">{displayA?.teamName}</p>
                              {[sideA?.player1Name, sideA?.player2Name].filter(Boolean).map((playerName, pIdx) => {
                                const playerNumber = (pIdx + 1) as 1 | 2;
                                const teeId = playerNumber === 1 ? sideA?.player1TeeId : sideA?.player2TeeId;
                                const sideHcpTenths = playerNumber === 1 ? sideA?.player1HandicapIndex : sideA?.player2HandicapIndex;
                                const member = [...(teamA?.members || []), ...(teamB?.members || [])].find(m => m.playerName === playerName);
                                const memberHcpTenths = member?.handicapIndex;
                                const hasOverride = sideHcpTenths !== null && sideHcpTenths !== undefined;
                                const handicapIndexTenths = hasOverride ? sideHcpTenths : memberHcpTenths;
                                const handicapIndex = handicapIndexTenths !== null && handicapIndexTenths !== undefined ? handicapIndexTenths / 10 : null;
                                const tee = (teeId ? courseTees.find(t => t.id === teeId) : null) ?? courseTees[0];
                                // Use full USGA formula: Course Handicap = Handicap Index × (Slope Rating ÷ 113) + (Course Rating - Par)
                                const courseParForDisplay = courseHoles.reduce((sum, h) => sum + (h.par ?? 0), 0);
                                const courseHcp = handicapIndex !== null && tee
                                  ? (() => {
                                      const slopeAdj = handicapIndex * ((tee.slopeRating || 113) / 113);
                                      const ratingAdj = tee.courseRating && courseParForDisplay > 0 ? (tee.courseRating / 10) - courseParForDisplay : 0;
                                      return Math.round(slopeAdj + ratingAdj);
                                    })()
                                  : null;
                                const isEditingThis = editingSideHandicap?.sideId === sideA?.id && editingSideHandicap?.playerNumber === playerNumber;
                                return (
                                  <div key={pIdx} className="flex items-center justify-between gap-1 sm:gap-2 py-1 min-w-0">
                                    <span className="font-medium text-xs sm:text-sm truncate flex-1 min-w-0">{playerName}</span>
                                    <Select
                                      value={teeId?.toString() || ""}
                                      onValueChange={(val) => sideA && updateSidePlayerMutation.mutate({
                                        sideId: sideA.id,
                                        playerNumber,
                                        teeId: val ? parseInt(val) : null,
                                      })}
                                    >
                                      <SelectTrigger className="h-6 w-16 sm:w-28 text-xs shrink-0" data-testid={`select-tee-${sideA?.id}-${playerNumber}`}>
                                        <SelectValue placeholder="Tee" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {courseTees.map(t => (
                                          <SelectItem key={t.id} value={t.id.toString()}>
                                            {t.name}{t.yardage ? ` (${t.yardage.toLocaleString()})` : ''}{t.slopeRating ? ` / ${t.slopeRating}` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {isEditingThis ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="CH"
                                          value={editingSideHandicapValue}
                                          onChange={(e) => setEditingSideHandicapValue(e.target.value)}
                                          className="w-12 h-6 text-xs text-center"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && sideA) {
                                              const val = editingSideHandicapValue.trim();
                                              const handicapIndex = val === "" ? null : Math.round(parseFloat(val) * 10);
                                              updateSidePlayerMutation.mutate({ sideId: sideA.id, playerNumber, handicapIndex });
                                            } else if (e.key === "Escape") {
                                              setEditingSideHandicap(null);
                                              setEditingSideHandicapValue("");
                                            }
                                          }}
                                          autoFocus
                                          data-testid={`input-course-hcp-${sideA?.id}-${playerNumber}`}
                                        />
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5"
                                          onClick={() => {
                                            if (sideA) {
                                              const val = editingSideHandicapValue.trim();
                                              const handicapIndex = val === "" ? null : Math.round(parseFloat(val) * 10);
                                              updateSidePlayerMutation.mutate({ sideId: sideA.id, playerNumber, handicapIndex });
                                            }
                                          }}
                                        >
                                          <Check className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs w-8 justify-center cursor-pointer hover-elevate shrink-0 ${hasOverride ? "border-primary" : ""}`}
                                        onClick={() => {
                                          if (sideA) {
                                            setEditingSideHandicap({ sideId: sideA.id, playerNumber });
                                            setEditingSideHandicapValue(courseHcp?.toString() || "");
                                          }
                                        }}
                                        data-testid={`badge-course-hcp-${sideA?.id}-${playerNumber}`}
                                      >
                                        {courseHcp ?? "?"}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <span className="hidden sm:block text-muted-foreground font-semibold text-center">vs</span>
                          <div className="flex-1 min-w-0">
                            <div 
                              className="p-3 rounded-lg"
                              style={{ backgroundColor: `${displayB?.color}20` }}
                            >
                              <p className="text-xs text-muted-foreground mb-1 text-center">{displayB?.teamName}</p>
                              {[sideB?.player1Name, sideB?.player2Name].filter(Boolean).map((playerName, pIdx) => {
                                const playerNumber = (pIdx + 1) as 1 | 2;
                                const teeId = playerNumber === 1 ? sideB?.player1TeeId : sideB?.player2TeeId;
                                const sideHcpTenths = playerNumber === 1 ? sideB?.player1HandicapIndex : sideB?.player2HandicapIndex;
                                const member = [...(teamA?.members || []), ...(teamB?.members || [])].find(m => m.playerName === playerName);
                                const memberHcpTenths = member?.handicapIndex;
                                const hasOverride = sideHcpTenths !== null && sideHcpTenths !== undefined;
                                const handicapIndexTenths = hasOverride ? sideHcpTenths : memberHcpTenths;
                                const handicapIndex = handicapIndexTenths !== null && handicapIndexTenths !== undefined ? handicapIndexTenths / 10 : null;
                                const tee = (teeId ? courseTees.find(t => t.id === teeId) : null) ?? courseTees[0];
                                // Use full USGA formula: Course Handicap = Handicap Index × (Slope Rating ÷ 113) + (Course Rating - Par)
                                const courseParForDisplayB = courseHoles.reduce((sum, h) => sum + (h.par ?? 0), 0);
                                const courseHcp = handicapIndex !== null && tee
                                  ? (() => {
                                      const slopeAdj = handicapIndex * ((tee.slopeRating || 113) / 113);
                                      const ratingAdj = tee.courseRating && courseParForDisplayB > 0 ? (tee.courseRating / 10) - courseParForDisplayB : 0;
                                      return Math.round(slopeAdj + ratingAdj);
                                    })()
                                  : null;
                                const isEditingThis = editingSideHandicap?.sideId === sideB?.id && editingSideHandicap?.playerNumber === playerNumber;
                                return (
                                  <div key={pIdx} className="flex items-center justify-between gap-1 sm:gap-2 py-1 min-w-0">
                                    <span className="font-medium text-xs sm:text-sm truncate flex-1 min-w-0">{playerName}</span>
                                    <Select
                                      value={teeId?.toString() || ""}
                                      onValueChange={(val) => sideB && updateSidePlayerMutation.mutate({
                                        sideId: sideB.id,
                                        playerNumber,
                                        teeId: val ? parseInt(val) : null,
                                      })}
                                    >
                                      <SelectTrigger className="h-6 w-16 sm:w-28 text-xs shrink-0" data-testid={`select-tee-${sideB?.id}-${playerNumber}`}>
                                        <SelectValue placeholder="Tee" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {courseTees.map(t => (
                                          <SelectItem key={t.id} value={t.id.toString()}>
                                            {t.name}{t.yardage ? ` (${t.yardage.toLocaleString()})` : ''}{t.slopeRating ? ` / ${t.slopeRating}` : ''}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {isEditingThis ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="CH"
                                          value={editingSideHandicapValue}
                                          onChange={(e) => setEditingSideHandicapValue(e.target.value)}
                                          className="w-12 h-6 text-xs text-center"
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" && sideB) {
                                              const val = editingSideHandicapValue.trim();
                                              const handicapIndex = val === "" ? null : Math.round(parseFloat(val) * 10);
                                              updateSidePlayerMutation.mutate({ sideId: sideB.id, playerNumber, handicapIndex });
                                            } else if (e.key === "Escape") {
                                              setEditingSideHandicap(null);
                                              setEditingSideHandicapValue("");
                                            }
                                          }}
                                          autoFocus
                                          data-testid={`input-course-hcp-${sideB?.id}-${playerNumber}`}
                                        />
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-5 w-5"
                                          onClick={() => {
                                            if (sideB) {
                                              const val = editingSideHandicapValue.trim();
                                              const handicapIndex = val === "" ? null : Math.round(parseFloat(val) * 10);
                                              updateSidePlayerMutation.mutate({ sideId: sideB.id, playerNumber, handicapIndex });
                                            }
                                          }}
                                        >
                                          <Check className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs w-8 justify-center cursor-pointer hover-elevate shrink-0 ${hasOverride ? "border-primary" : ""}`}
                                        onClick={() => {
                                          if (sideB) {
                                            setEditingSideHandicap({ sideId: sideB.id, playerNumber });
                                            setEditingSideHandicapValue(courseHcp?.toString() || "");
                                          }
                                        }}
                                        data-testid={`badge-course-hcp-${sideB?.id}-${playerNumber}`}
                                      >
                                        {courseHcp ?? "?"}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {pairing.result && (
                            <div className="ml-4">
                              <Badge variant="secondary" className="flex items-center gap-1">
                                {pairing.result.winningSideId ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    {pairing.result.winningSideId === sideA?.id ? displayA?.teamName : displayB?.teamName}
                                    {pairing.result.winningMargin && ` (${pairing.result.winningMargin})`}
                                  </>
                                ) : (
                                  <>
                                    <Minus className="w-3 h-3" /> Halved
                                  </>
                                )}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                });
              })()}

              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">Side Matches</h4>
                  {(() => {
                    // Check if a container already exists for this day
                    const existingContainer = sideMatches.find(m => 
                      m.ryderCupDayNumber === selectedDay && 
                      m.name?.includes("Side Matches")
                    );
                    
                    if (existingContainer) {
                      // Container exists - just show button to go to it
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/match/${existingContainer.id}`)}
                          data-testid="button-go-to-side-match"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Add Betting Game
                        </Button>
                      );
                    }
                    
                    // No container - show options to create
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={createSideMatchMutation.isPending}
                            data-testid="button-add-side-match"
                          >
                            <Plus className="w-3 h-3 mr-1" /> Set Up Side Matches
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-56 p-2" align="end">
                          <div className="flex flex-col gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="justify-start"
                              onClick={() => createSideMatchMutation.mutate({ forAllDays: false })}
                              disabled={createSideMatchMutation.isPending}
                              data-testid="button-add-side-match-this-day"
                            >
                              Set up Day {selectedDay} only
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="justify-start"
                              onClick={() => createSideMatchMutation.mutate({ forAllDays: true })}
                              disabled={createSideMatchMutation.isPending}
                              data-testid="button-add-side-match-all-days"
                            >
                              Set up all {event?.days.length || 4} days
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>
                {(() => {
                  // Find the single container for this day (should only be one)
                  const dayContainer = sideMatches.find(m => 
                    m.ryderCupDayNumber === selectedDay && 
                    m.name?.includes("Side Matches")
                  );
                  
                  if (!dayContainer) {
                    return <p className="text-sm text-muted-foreground">No side matches set up for this day</p>;
                  }

                  // Get all event match IDs (betting games) for this container
                  const containerEventMatches = (sideMatchLedger?.eventMatches || [])
                    .filter((em: any) => em.eventId === dayContainer.id);
                  
                  // Get ALL entries for this container
                  const allMatchEntries = sideBetData.entries.filter(e => 
                    containerEventMatches.map((em: any) => em.id).includes(e.matchId)
                  );
                  
                  // Calculate player earnings from all entries
                  const playerEarnings: Record<string, number> = {};
                  allMatchEntries.forEach(r => {
                    playerEarnings[r.playerName] = (playerEarnings[r.playerName] || 0) + r.amount;
                  });
                  const sortedEarnings = Object.entries(playerEarnings)
                    .filter(([_, amount]) => amount !== 0)
                    .sort((a, b) => b[1] - a[1]);
                  
                  
                  const isComplete = dayContainer.completed || allMatchEntries.length > 0;

                  return (
                    <Card 
                      className="border-dashed cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/match/${dayContainer.id}`)}
                      data-testid={`card-side-match-${dayContainer.id}`}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{dayContainer.name || "Side Matches"}</span>
                            <span className="text-xs text-muted-foreground">
                              {containerEventMatches.length} betting game{containerEventMatches.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{dayContainer.courseName}</Badge>
                            {isComplete && (
                              <Badge variant="secondary">
                                <Check className="w-3 h-3 mr-1" /> Complete
                              </Badge>
                            )}
                          </div>
                        </div>
                        {isComplete && sortedEarnings.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-dashed">
                            <div className="flex flex-wrap gap-2">
                              {sortedEarnings.slice(0, 4).map(([name, amount]) => (
                                <div key={name} className="flex items-center gap-1 text-xs">
                                  <span className="text-muted-foreground">{name}:</span>
                                  <span className={`font-medium ${amount > 0 ? "text-green-600" : amount < 0 ? "text-red-600" : ""}`}>
                                    {amount > 0 ? "+" : ""}{formatCurrency(amount)}
                                  </span>
                                </div>
                              ))}
                              {sortedEarnings.length > 4 && (
                                <span className="text-xs text-muted-foreground">
                                  +{sortedEarnings.length - 4} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}
              </div>

              {/* Closest to Hole Section */}
              {currentDayCourseId && courseHoles.length > 0 && courseHoles.some(h => h.par === 3) && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <Flag className="w-4 h-4" /> Closest to Hole
                      {event.closestToHolePayout > 0 ? (
                        <span className="text-sm font-normal text-muted-foreground">
                          ({formatCurrency(event.closestToHolePayout)} per winner)
                        </span>
                      ) : (
                        <span className="text-sm font-normal text-yellow-600">
                          (Set payout in Payouts tab)
                        </span>
                      )}
                    </h4>
                  </div>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {courseHoles
                          .filter(h => h.par === 3)
                          .sort((a, b) => a.holeNumber - b.holeNumber)
                          .map(hole => {
                            const existingWinner = cthWinners.find(w => w.holeNumber === hole.holeNumber);
                            const allPlayers = [
                              ...(teamA?.members.map(m => m.playerName) || []),
                              ...(teamB?.members.map(m => m.playerName) || []),
                            ];
                            
                            return (
                              <div key={hole.holeNumber} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
                                <div className="min-w-[60px]">
                                  <span className="font-medium">Hole {hole.holeNumber}</span>
                                  <span className="text-xs text-muted-foreground ml-1">(Par 3)</span>
                                </div>
                                <Select
                                  value={existingWinner?.winnerName || "none"}
                                  onValueChange={(value) => {
                                    if (!currentDay?.id) return;
                                    recordCTHWinnerMutation.mutate({
                                      dayId: currentDay.id,
                                      holeNumber: hole.holeNumber,
                                      winnerName: value === "none" ? null : value,
                                    });
                                  }}
                                  disabled={!isCreatorOrAdmin}
                                  data-testid={`select-cth-hole-${hole.holeNumber}`}
                                >
                                  <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select winner" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">No winner</SelectItem>
                                    {allPlayers.map(name => (
                                      <SelectItem key={name} value={name}>{name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          })}
                      </div>
                      {courseHoles.filter(h => h.par === 3).length === 0 && (
                        <p className="text-sm text-muted-foreground">No par 3 holes found for this course</p>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Full 18-Hole Scorecards Section */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-lg">Scorecards</h4>
                </div>

                {(() => {
                  const sortedPairings = currentDay?.pairings
                    ?.slice()
                    .sort((a, b) => a.matchNumber - b.matchNumber) || [];

                  if (sortedPairings.length === 0) {
                    return <p className="text-sm text-muted-foreground">No matches for this day</p>;
                  }

                  const getScoreColor = (score: number | null, par: number): string => {
                    if (score === null) return "text-foreground";
                    const diff = score - par;
                    if (diff <= -2) return "text-yellow-600 font-bold";
                    if (diff === -1) return "text-red-600 font-bold";
                    if (diff === 0) return "text-foreground";
                    if (diff === 1) return "text-blue-600 font-bold";
                    return "text-blue-800 font-bold";
                  };

                  // USGA formula: Course Handicap = Handicap Index × (Slope Rating ÷ 113) + (Course Rating - Par)
                  const courseParTotal = courseHoles.reduce((sum, h) => sum + (h.par ?? 0), 0);
                  const calculateCourseHandicap = (handicapIndex: number | null, tee: CourseTee | undefined): number | null => {
                    if (handicapIndex === null || !tee) return null;
                    const slopeRating = tee.slopeRating || 113;
                    const slopeAdjustment = handicapIndex * (slopeRating / 113);
                    // Course rating is stored as tenths (e.g., 721 = 72.1)
                    const courseRatingAdjustment = tee.courseRating && courseParTotal > 0 
                      ? (tee.courseRating / 10) - courseParTotal 
                      : 0;
                    return Math.round(slopeAdjustment + courseRatingAdjustment);
                  };

                  const getPlayerTee = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2): CourseTee | undefined => {
                    const teeId = playerNumber === 1 ? side.player1TeeId : side.player2TeeId;
                    if (teeId) {
                      const found = courseTees.find(t => t.id === teeId);
                      // If tee not found in this course, fall back to first available
                      return found ?? courseTees[0];
                    }
                    // Fall back to first available tee for handicap calculations
                    return courseTees[0];
                  };

                  const getPlayerHandicap = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2): number | null => {
                    // First check pairing-specific handicap (stored as tenths)
                    const pairingHcp = playerNumber === 1 ? side.player1HandicapIndex : side.player2HandicapIndex;
                    if (pairingHcp !== null) return pairingHcp / 10;
                    
                    // Fall back to team member handicap (stored as tenths)
                    const playerName = playerNumber === 1 ? side.player1Name : side.player2Name;
                    if (!playerName) return null;
                    const allMembers = [...(teamA?.members || []), ...(teamB?.members || [])];
                    const member = allMembers.find(m => m.playerName === playerName);
                    return member?.handicapIndex != null ? member.handicapIndex / 10 : null;
                  };

                  const getPlayerCourseHandicap = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2): number | null => {
                    const hcpIndex = getPlayerHandicap(side, playerNumber);
                    if (hcpIndex === null) return null;
                    const tee = getPlayerTee(side, playerNumber);
                    if (!tee) return null;
                    return calculateCourseHandicap(hcpIndex, tee);
                  };

                  const getStrokesOnHole = (courseHandicap: number, lowHandicap: number, holeHandicap: number): number => {
                    const relativeHcp = courseHandicap - lowHandicap;
                    if (relativeHcp <= 0) return 0;
                    if (relativeHcp <= 18) return holeHandicap <= relativeHcp ? 1 : 0;
                    const baseStrokes = Math.floor(relativeHcp / 18);
                    const remainder = relativeHcp % 18;
                    return baseStrokes + (holeHandicap <= remainder ? 1 : 0);
                  };

                  const getPlayerScore = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2, hole: number): number | null => {
                    const scoreEntry = side.scores.find(s => s.holeNumber === hole);
                    return playerNumber === 1 ? scoreEntry?.player1Strokes ?? null : scoreEntry?.player2Strokes ?? null;
                  };

                  const getNetScore = (grossScore: number | null, courseHcp: number | null, lowHandicap: number, holeHcp: number): number | null => {
                    if (grossScore === null || courseHcp === null) return null;
                    const strokes = getStrokesOnHole(courseHcp, lowHandicap, holeHcp);
                    return grossScore - strokes;
                  };

                  const getTeamBestBall = (side: RyderCupPairingSideWithScores, hole: number, lowHandicap: number, useNet: boolean): number | null => {
                    const holeData = courseHoles.find(h => h.holeNumber === hole);
                    const holeHcp = holeData?.handicap || hole;
                    const p1Score = getPlayerScore(side, 1, hole);
                    const p2Score = side.player2Name ? getPlayerScore(side, 2, hole) : null;
                    
                    if (useNet) {
                      const p1Hcp = getPlayerCourseHandicap(side, 1);
                      const p2Hcp = side.player2Name ? getPlayerCourseHandicap(side, 2) : null;
                      const p1Net = getNetScore(p1Score, p1Hcp, lowHandicap, holeHcp);
                      const p2Net = p2Score !== null && p2Hcp !== null ? getNetScore(p2Score, p2Hcp, lowHandicap, holeHcp) : null;
                      if (p1Net === null && p2Net === null) return null;
                      if (p1Net === null) return p2Net;
                      if (p2Net === null) return p1Net;
                      return Math.min(p1Net, p2Net);
                    } else {
                      if (p1Score === null && p2Score === null) return null;
                      if (p1Score === null) return p2Score;
                      if (p2Score === null) return p1Score;
                      return Math.min(p1Score, p2Score);
                    }
                  };

                  type HoleResult = { winner: 'A' | 'B' | 'tie' | null; winningPlayers: { sideId: number; playerNumber: 1 | 2 }[] };

                  const calculateHoleResults = (sideA: RyderCupPairingSideWithScores, sideB: RyderCupPairingSideWithScores, lowHandicap: number, useNet: boolean): HoleResult[] => {
                    const results: HoleResult[] = [];
                    for (let hole = 1; hole <= 18; hole++) {
                      const holeData = courseHoles.find(h => h.holeNumber === hole);
                      const holeHcp = holeData?.handicap || hole;
                      const teamABest = getTeamBestBall(sideA, hole, lowHandicap, useNet);
                      const teamBBest = getTeamBestBall(sideB, hole, lowHandicap, useNet);

                      if (teamABest === null || teamBBest === null) {
                        results.push({ winner: null, winningPlayers: [] });
                        continue;
                      }

                      const winningPlayers: { sideId: number; playerNumber: 1 | 2 }[] = [];
                      
                      if (teamABest < teamBBest) {
                        // Find which player(s) on team A had the best ball
                        const p1Score = getPlayerScore(sideA, 1, hole);
                        const p2Score = sideA.player2Name ? getPlayerScore(sideA, 2, hole) : null;
                        const p1Hcp = getPlayerCourseHandicap(sideA, 1);
                        const p2Hcp = sideA.player2Name ? getPlayerCourseHandicap(sideA, 2) : null;
                        const p1Net = useNet ? getNetScore(p1Score, p1Hcp, lowHandicap, holeHcp) : p1Score;
                        const p2Net = useNet && p2Score !== null ? getNetScore(p2Score, p2Hcp, lowHandicap, holeHcp) : p2Score;
                        if (p1Net === teamABest) winningPlayers.push({ sideId: sideA.id, playerNumber: 1 });
                        if (p2Net === teamABest && sideA.player2Name) winningPlayers.push({ sideId: sideA.id, playerNumber: 2 });
                        results.push({ winner: 'A', winningPlayers });
                      } else if (teamBBest < teamABest) {
                        // Find which player(s) on team B had the best ball
                        const p1Score = getPlayerScore(sideB, 1, hole);
                        const p2Score = sideB.player2Name ? getPlayerScore(sideB, 2, hole) : null;
                        const p1Hcp = getPlayerCourseHandicap(sideB, 1);
                        const p2Hcp = sideB.player2Name ? getPlayerCourseHandicap(sideB, 2) : null;
                        const p1Net = useNet ? getNetScore(p1Score, p1Hcp, lowHandicap, holeHcp) : p1Score;
                        const p2Net = useNet && p2Score !== null ? getNetScore(p2Score, p2Hcp, lowHandicap, holeHcp) : p2Score;
                        if (p1Net === teamBBest) winningPlayers.push({ sideId: sideB.id, playerNumber: 1 });
                        if (p2Net === teamBBest && sideB.player2Name) winningPlayers.push({ sideId: sideB.id, playerNumber: 2 });
                        results.push({ winner: 'B', winningPlayers });
                      } else {
                        results.push({ winner: 'tie', winningPlayers: [] });
                      }
                    }
                    return results;
                  };

                  const calculateRunningScore = (holeResults: HoleResult[]): { score: number; text: string }[] => {
                    const running: { score: number; text: string }[] = [];
                    let score = 0; // Positive = Team A up, Negative = Team B up
                    for (let i = 0; i < 18; i++) {
                      const result = holeResults[i];
                      if (result.winner === 'A') score++;
                      else if (result.winner === 'B') score--;
                      
                      let text = '';
                      if (result.winner === null) {
                        text = running.length > 0 ? running[running.length - 1].text : 'AS';
                      } else if (score === 0) {
                        text = 'AS';
                      } else if (score > 0) {
                        text = `${score}`;
                      } else {
                        text = `${Math.abs(score)}`;
                      }
                      running.push({ score, text });
                    }
                    return running;
                  };

                  const handleScoreClick = (sideId: number, playerNumber: 1 | 2, hole: number, currentScore: number | null) => {
                    setEditScoreValue(currentScore?.toString() || "");
                    setEditingScore({ sideId, playerNumber, hole });
                  };

                  const handleScoreSubmit = async (
                    side: RyderCupPairingSideWithScores, 
                    hole: number,
                    context?: { sideA: RyderCupPairingSideWithScores; sideB: RyderCupPairingSideWithScores; useNetScoring: boolean; lowHandicap: number }
                  ) => {
                    if (!editingScore) return;
                    const strokes = editScoreValue ? parseInt(editScoreValue) : null;
                    if (editScoreValue && (isNaN(strokes!) || strokes! < 1 || strokes! > 15)) {
                      toast({ title: "Invalid score", description: "Enter 1-15", variant: "destructive" });
                      return;
                    }
                    const existingScore = side.scores.find(s => s.holeNumber === hole);
                    const player1Strokes = editingScore.playerNumber === 1 ? strokes : (existingScore?.player1Strokes ?? null);
                    const player2Strokes = editingScore.playerNumber === 2 ? strokes : (existingScore?.player2Strokes ?? null);
                    
                    let matchResult: { winningSideId: number | null; winningMargin: string | null; isComplete: boolean } | undefined;
                    
                    // Calculate match result if we have context (for 2-sided pairings)
                    if (context) {
                      const { sideA, sideB, useNetScoring, lowHandicap } = context;
                      
                      // Create simulated side data with the updated score
                      const simulatedSideA: RyderCupPairingSideWithScores = sideA.id === side.id ? {
                        ...sideA,
                        scores: sideA.scores.some(s => s.holeNumber === hole)
                          ? sideA.scores.map(s => s.holeNumber === hole ? { ...s, player1Strokes, player2Strokes } : s)
                          : [...sideA.scores, { id: 0, sideId: sideA.id, holeNumber: hole, player1Strokes, player2Strokes }]
                      } : sideA;
                      
                      const simulatedSideB: RyderCupPairingSideWithScores = sideB.id === side.id ? {
                        ...sideB,
                        scores: sideB.scores.some(s => s.holeNumber === hole)
                          ? sideB.scores.map(s => s.holeNumber === hole ? { ...s, player1Strokes, player2Strokes } : s)
                          : [...sideB.scores, { id: 0, sideId: sideB.id, holeNumber: hole, player1Strokes, player2Strokes }]
                      } : sideB;
                      
                      // Recompute getTeamBestBall for simulated sides
                      const getSimulatedTeamBestBall = (simSide: RyderCupPairingSideWithScores, h: number, origSide: RyderCupPairingSideWithScores): number | null => {
                        const holeData = courseHoles.find(ch => ch.holeNumber === h);
                        const holeHcp = holeData?.handicap || h;
                        const scoreEntry = simSide.scores.find(s => s.holeNumber === h);
                        const p1Score = scoreEntry?.player1Strokes ?? null;
                        const p2Score = origSide.player2Name ? (scoreEntry?.player2Strokes ?? null) : null;
                        
                        if (useNetScoring) {
                          const p1Hcp = getPlayerCourseHandicap(origSide, 1);
                          const p2Hcp = origSide.player2Name ? getPlayerCourseHandicap(origSide, 2) : null;
                          const p1Net = getNetScore(p1Score, p1Hcp, lowHandicap, holeHcp);
                          const p2Net = p2Score !== null && p2Hcp !== null ? getNetScore(p2Score, p2Hcp, lowHandicap, holeHcp) : null;
                          if (p1Net === null && p2Net === null) return null;
                          if (p1Net === null) return p2Net;
                          if (p2Net === null) return p1Net;
                          return Math.min(p1Net, p2Net);
                        } else {
                          if (p1Score === null && p2Score === null) return null;
                          if (p1Score === null) return p2Score;
                          if (p2Score === null) return p1Score;
                          return Math.min(p1Score, p2Score);
                        }
                      };
                      
                      // Calculate hole results with simulated data (same logic as calculateHoleResults)
                      let score = 0;
                      let decidedOnHole: number | null = null;
                      let allHolesComplete = true;
                      
                      for (let h = 1; h <= 18; h++) {
                        const teamABest = getSimulatedTeamBestBall(simulatedSideA, h, sideA);
                        const teamBBest = getSimulatedTeamBestBall(simulatedSideB, h, sideB);
                        
                        if (teamABest === null || teamBBest === null) {
                          allHolesComplete = false;
                          // If match not yet clinched, continue to check remaining holes
                          if (decidedOnHole === null) continue;
                          break;
                        }
                        
                        if (teamABest < teamBBest) score++;
                        else if (teamBBest < teamABest) score--;
                        
                        const holesRemaining = 18 - h;
                        const lead = Math.abs(score);
                        // Only consider match "clinched" if decided before hole 18
                        if (h < 18 && lead > holesRemaining && decidedOnHole === null) {
                          decidedOnHole = h;
                          break;
                        }
                      }
                      
                      const isComplete = decidedOnHole !== null || allHolesComplete;
                      if (isComplete) {
                        let winningSideId: number | null = null;
                        let winningMargin: string | null = null;
                        
                        if (score > 0) winningSideId = sideA.id;
                        else if (score < 0) winningSideId = sideB.id;
                        
                        const lead = Math.abs(score);
                        if (decidedOnHole !== null && decidedOnHole < 18) {
                          // Match clinched early (before hole 18)
                          winningMargin = `${lead}&${18 - decidedOnHole}`;
                        } else if (lead > 0) {
                          // Match went full 18 holes
                          winningMargin = `${lead} up`;
                        }
                        
                        matchResult = { winningSideId, winningMargin, isComplete: true };
                      }
                    }
                    
                    await saveScoresMutation.mutateAsync({
                      sideId: side.id,
                      scores: [{ holeNumber: hole, player1Strokes, player2Strokes }],
                      matchResult,
                    });
                    setEditingScore(null);
                    setEditScoreValue("");
                  };

                  const handleKeyDown = (
                    e: React.KeyboardEvent, 
                    side: RyderCupPairingSideWithScores, 
                    hole: number,
                    context?: { sideA: RyderCupPairingSideWithScores; sideB: RyderCupPairingSideWithScores; useNetScoring: boolean; lowHandicap: number }
                  ) => {
                    if (e.key === "Enter") handleScoreSubmit(side, hole, context);
                    else if (e.key === "Escape") {
                      setEditingScore(null);
                      setEditScoreValue("");
                    }
                  };

                  const calculateTotals = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2) => {
                    let front9 = 0, back9 = 0, front9Count = 0, back9Count = 0;
                    for (let hole = 1; hole <= 9; hole++) {
                      const score = getPlayerScore(side, playerNumber, hole);
                      if (score !== null) { front9 += score; front9Count++; }
                    }
                    for (let hole = 10; hole <= 18; hole++) {
                      const score = getPlayerScore(side, playerNumber, hole);
                      if (score !== null) { back9 += score; back9Count++; }
                    }
                    return {
                      front9: front9Count === 9 ? front9 : null,
                      back9: back9Count === 9 ? back9 : null,
                      total: front9Count === 9 && back9Count === 9 ? front9 + back9 : null,
                    };
                  };

                  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, pairing: typeof sortedPairings[0]) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    // Collect ALL player names from ALL matches in the current day for better AI matching
                    const allPlayerNames: string[] = [];
                    const allSides: Array<{ side: typeof pairing.sides[0]; playerNumber: 1 | 2; playerName: string }> = [];
                    
                    sortedPairings.forEach(p => {
                      p.sides.forEach(side => {
                        if (side.player1Name) {
                          allPlayerNames.push(side.player1Name);
                          allSides.push({ side, playerNumber: 1, playerName: side.player1Name });
                        }
                        if (side.player2Name) {
                          allPlayerNames.push(side.player2Name);
                          allSides.push({ side, playerNumber: 2, playerName: side.player2Name });
                        }
                      });
                    });

                    const reader = new FileReader();
                    reader.onloadend = async () => {
                      const base64 = reader.result as string;
                      try {
                        const result = await scanScorecard.mutateAsync({
                          imageBase64: base64,
                          playerNames: allPlayerNames,
                          courseName: currentDay?.courseName || event?.courseName || "",
                        });
                        if (result.success && result.scores.length > 0) {
                          setScannedScores(result.scores);
                          const editable: Record<string, Record<number, string>> = {};
                          const mappings: Record<string, { sideId: number; playerNumber: 1 | 2 } | null> = {};
                          result.scores.forEach(ps => {
                            editable[ps.playerName] = {};
                            ps.holes.forEach(h => {
                              if (h.holeNumber >= 1 && h.holeNumber <= 18) {
                                editable[ps.playerName][h.holeNumber] = h.strokes?.toString() || '';
                              }
                            });
                            // Search across ALL sides from ALL matches to find the matching player
                            const matchedSide = allSides.find(s => 
                              s.playerName.toLowerCase() === ps.playerName.toLowerCase()
                            );
                            if (matchedSide) {
                              mappings[ps.playerName] = { sideId: matchedSide.side.id, playerNumber: matchedSide.playerNumber };
                            } else {
                              mappings[ps.playerName] = null;
                            }
                          });
                          setEditableScores(editable);
                          setPlayerMappings(mappings);
                          setScanningPairingId(pairing.id);
                          setShowScanModal(true);
                        } else {
                          toast({ variant: "destructive", title: "Scan Failed", description: "Could not extract scores from the image." });
                        }
                      } catch (err) {
                        toast({ variant: "destructive", title: "Scan Error", description: err instanceof Error ? err.message : "Failed to process scorecard" });
                      }
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  };

                  const handleConfirmScannedScores = async () => {
                    let successCount = 0;
                    for (const [scannedName, mapping] of Object.entries(playerMappings)) {
                      if (!mapping) continue;
                      const scores = editableScores[scannedName] || {};
                      const scoreEntries: { holeNumber: number; player1Strokes: number | null; player2Strokes: number | null }[] = [];
                      for (let hole = 1; hole <= 18; hole++) {
                        const strokes = parseInt(scores[hole] || '');
                        if (!isNaN(strokes) && strokes > 0) {
                          scoreEntries.push({
                            holeNumber: hole,
                            player1Strokes: mapping.playerNumber === 1 ? strokes : null,
                            player2Strokes: mapping.playerNumber === 2 ? strokes : null,
                          });
                        }
                      }
                      if (scoreEntries.length > 0) {
                        try {
                          await saveScoresMutation.mutateAsync({ sideId: mapping.sideId, scores: scoreEntries });
                          successCount += scoreEntries.length;
                        } catch { /* ignore */ }
                      }
                    }
                    setShowScanModal(false);
                    setScannedScores([]);
                    setEditableScores({});
                    setPlayerMappings({});
                    setScanningPairingId(null);
                    if (successCount > 0) toast({ title: "Scores Saved", description: `${successCount} scores saved successfully.` });
                  };

                  return (
                    <div className="space-y-4">
                      {sortedPairings.map((pairing) => {
                        const sideA = pairing.sides[0];
                        const sideB = pairing.sides[1];
                        if (!sideA || !sideB) return null;

                        const allHandicaps = [
                          getPlayerCourseHandicap(sideA, 1),
                          sideA.player2Name ? getPlayerCourseHandicap(sideA, 2) : null,
                          getPlayerCourseHandicap(sideB, 1),
                          sideB.player2Name ? getPlayerCourseHandicap(sideB, 2) : null,
                        ].filter((h): h is number => h !== null);
                        const lowHandicap = allHandicaps.length > 0 ? Math.min(...allHandicaps) : 0;

                        const isExpanded = expandedPairingId === pairing.id;

                        const holeResults = calculateHoleResults(sideA, sideB, lowHandicap, pairing.useNetScoring);
                        const runningScore = calculateRunningScore(holeResults);

                        const renderPlayerRow = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2, teamColor?: string, isTeamA?: boolean) => {
                          const playerName = playerNumber === 1 ? side.player1Name : side.player2Name;
                          if (!playerName) return null;
                          const courseHcp = getPlayerCourseHandicap(side, playerNumber);
                          const totals = calculateTotals(side, playerNumber);
                          const sideHcpTenths = playerNumber === 1 ? side.player1HandicapIndex : side.player2HandicapIndex;
                          const hasOverride = sideHcpTenths !== null && sideHcpTenths !== undefined;

                          const isWinningPlayer = (hole: number) => {
                            const result = holeResults[hole - 1];
                            return result.winningPlayers.some(wp => wp.sideId === side.id && wp.playerNumber === playerNumber);
                          };

                          return (
                            <tr key={`${side.id}-${playerNumber}`} className="border-b last:border-b-0">
                              <td className="py-1 px-2 font-medium text-sm sticky left-0 bg-card z-10" style={{ borderLeft: teamColor ? `3px solid ${teamColor}` : undefined }}>
                                <div className="flex items-center gap-1">
                                  <span className="truncate max-w-20">{playerName.split(" ")[0]}</span>
                                  {courseHcp !== null && (
                                    <span className={`text-xs ${hasOverride ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                                      ({courseHcp})
                                    </span>
                                  )}
                                </div>
                              </td>
                              {[1,2,3,4,5,6,7,8,9].map(hole => {
                                const holeData = courseHoles.find(h => h.holeNumber === hole);
                                const holePar = holeData?.par || 4;
                                const holeHcp = holeData?.handicap || hole;
                                const score = getPlayerScore(side, playerNumber, hole);
                                const strokes = courseHcp !== null ? getStrokesOnHole(courseHcp, lowHandicap, holeHcp) : 0;
                                const isEditing = editingScore?.sideId === side.id && editingScore?.playerNumber === playerNumber && editingScore?.hole === hole;
                                const isWinner = isWinningPlayer(hole);
                                return (
                                  <td key={hole} className="text-center p-0 relative">
                                    {strokes > 0 && (
                                      <div className="absolute top-0 right-0 flex gap-px p-px">
                                        {Array.from({ length: strokes }, (_, i) => (
                                          <Circle key={i} className="w-1.5 h-1.5 fill-primary text-primary" />
                                        ))}
                                      </div>
                                    )}
                                    <input
                                      ref={isEditing ? scoreInputRef : undefined}
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      maxLength={2}
                                      readOnly={!isEditing}
                                      value={isEditing ? editScoreValue : (score?.toString() ?? "")}
                                      onChange={(e) => setEditScoreValue(e.target.value)}
                                      onBlur={() => isEditing && handleScoreSubmit(side, hole, { sideA, sideB, useNetScoring: pairing.useNetScoring, lowHandicap })}
                                      onKeyDown={(e) => isEditing && handleKeyDown(e, side, hole, { sideA, sideB, useNetScoring: pairing.useNetScoring, lowHandicap })}
                                      onClick={() => !isEditing && handleScoreClick(side.id, playerNumber, hole, score)}
                                      className={`w-8 h-7 text-center text-sm font-medium border-0 bg-transparent cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary rounded ${getScoreColor(score, holePar)}`}
                                      style={isWinner && teamColor ? { backgroundColor: `${teamColor}20`, fontWeight: 700 } : undefined}
                                      data-testid={`input-score-${pairing.id}-${side.id}-${playerNumber}-${hole}`}
                                    />
                                  </td>
                                );
                              })}
                              <td className="text-center text-sm font-bold bg-muted/50 px-2">{totals.front9 ?? "-"}</td>
                              {[10,11,12,13,14,15,16,17,18].map(hole => {
                                const holeData = courseHoles.find(h => h.holeNumber === hole);
                                const holePar = holeData?.par || 4;
                                const holeHcp = holeData?.handicap || hole;
                                const score = getPlayerScore(side, playerNumber, hole);
                                const strokes = courseHcp !== null ? getStrokesOnHole(courseHcp, lowHandicap, holeHcp) : 0;
                                const isEditing = editingScore?.sideId === side.id && editingScore?.playerNumber === playerNumber && editingScore?.hole === hole;
                                const isWinner = isWinningPlayer(hole);
                                return (
                                  <td key={hole} className="text-center p-0 relative">
                                    {strokes > 0 && (
                                      <div className="absolute top-0 right-0 flex gap-px p-px">
                                        {Array.from({ length: strokes }, (_, i) => (
                                          <Circle key={i} className="w-1.5 h-1.5 fill-primary text-primary" />
                                        ))}
                                      </div>
                                    )}
                                    <input
                                      ref={isEditing ? scoreInputRef : undefined}
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      maxLength={2}
                                      readOnly={!isEditing}
                                      value={isEditing ? editScoreValue : (score?.toString() ?? "")}
                                      onChange={(e) => setEditScoreValue(e.target.value)}
                                      onBlur={() => isEditing && handleScoreSubmit(side, hole, { sideA, sideB, useNetScoring: pairing.useNetScoring, lowHandicap })}
                                      onKeyDown={(e) => isEditing && handleKeyDown(e, side, hole, { sideA, sideB, useNetScoring: pairing.useNetScoring, lowHandicap })}
                                      onClick={() => !isEditing && handleScoreClick(side.id, playerNumber, hole, score)}
                                      className={`w-8 h-7 text-center text-sm font-medium border-0 bg-transparent cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary rounded ${getScoreColor(score, holePar)}`}
                                      style={isWinner && teamColor ? { backgroundColor: `${teamColor}20`, fontWeight: 700 } : undefined}
                                      data-testid={`input-score-${pairing.id}-${side.id}-${playerNumber}-${hole}`}
                                    />
                                  </td>
                                );
                              })}
                              <td className="text-center text-sm font-bold bg-muted/50 px-2">{totals.back9 ?? "-"}</td>
                              <td className="text-center text-sm font-bold bg-primary/10 text-primary px-2">{totals.total ?? "-"}</td>
                            </tr>
                          );
                        };

                        const renderMatchStatusRow = () => {
                          const finalScore = runningScore[17]?.score ?? 0;
                          const finalText = finalScore === 0 ? 'All Square' : 
                            finalScore > 0 ? `${sideA.player1Name?.split(" ")[0]} ${finalScore} UP` : 
                            `${sideB.player1Name?.split(" ")[0]} ${Math.abs(finalScore)} UP`;
                          
                          return (
                            <tr className="bg-muted/20 border-t-2">
                              <td className="py-1 px-2 text-xs font-semibold sticky left-0 bg-muted/20 z-10">Match</td>
                              {[1,2,3,4,5,6,7,8,9].map(hole => {
                                const result = holeResults[hole - 1];
                                const run = runningScore[hole - 1];
                                const color = run.score > 0 ? teamAColor : run.score < 0 ? teamBColor : undefined;
                                return (
                                  <td key={hole} className="text-center text-xs font-bold" style={{ color: color || undefined }}>
                                    {result.winner === null ? '' : run.text}
                                  </td>
                                );
                              })}
                              <td className="text-center text-xs font-bold bg-muted/50"></td>
                              {[10,11,12,13,14,15,16,17,18].map(hole => {
                                const result = holeResults[hole - 1];
                                const run = runningScore[hole - 1];
                                const color = run.score > 0 ? teamAColor : run.score < 0 ? teamBColor : undefined;
                                return (
                                  <td key={hole} className="text-center text-xs font-bold" style={{ color: color || undefined }}>
                                    {result.winner === null ? '' : run.text}
                                  </td>
                                );
                              })}
                              <td className="text-center text-xs font-bold bg-muted/50"></td>
                              <td className="text-center text-[10px] font-bold bg-primary/10 px-1" style={{ color: finalScore > 0 ? (teamAColor || undefined) : finalScore < 0 ? (teamBColor || undefined) : undefined }}>
                                {holeResults.some(r => r.winner !== null) ? finalText : ''}
                              </td>
                            </tr>
                          );
                        };

                        const teamAColor = event?.teams.find(t => t.id === sideA.teamId)?.color;
                        const teamBColor = event?.teams.find(t => t.id === sideB.teamId)?.color;

                        return (
                          <Card key={pairing.id} data-testid={`scorecard-pairing-${pairing.id}`}>
                            <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => setExpandedPairingId(isExpanded ? null : pairing.id)}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">Match {pairing.matchNumber}</Badge>
                                  <span className="text-sm text-muted-foreground">{pairing.matchFormat}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    id={`scan-input-${pairing.id}`}
                                    onChange={(e) => handleFileSelect(e, pairing)}
                                  />
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      document.getElementById(`scan-input-${pairing.id}`)?.click();
                                    }}
                                    disabled={scanScorecard.isPending}
                                    data-testid={`button-scan-${pairing.id}`}
                                  >
                                    {scanScorecard.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                  </Button>
                                  <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1 text-sm">
                                <span style={{ color: teamAColor || undefined }}>{sideA.player1Name?.split(" ")[0]}{sideA.player2Name ? ` / ${sideA.player2Name.split(" ")[0]}` : ""}</span>
                                <span className="text-muted-foreground">vs</span>
                                <span style={{ color: teamBColor || undefined }}>{sideB.player1Name?.split(" ")[0]}{sideB.player2Name ? ` / ${sideB.player2Name.split(" ")[0]}` : ""}</span>
                              </div>
                            </CardHeader>
                            {isExpanded && (
                              <CardContent className="pt-0 pb-3 px-0">
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs border-collapse">
                                    <thead>
                                      <tr className="bg-muted/30">
                                        <th className="py-1 px-2 text-left sticky left-0 bg-muted/30 z-10">Hole</th>
                                        {[1,2,3,4,5,6,7,8,9].map(h => <th key={h} className="w-8 text-center">{h}</th>)}
                                        <th className="text-center px-2 bg-muted/50">OUT</th>
                                        {[10,11,12,13,14,15,16,17,18].map(h => <th key={h} className="w-8 text-center">{h}</th>)}
                                        <th className="text-center px-2 bg-muted/50">IN</th>
                                        <th className="text-center px-2 bg-primary/10">TOT</th>
                                      </tr>
                                      <tr className="text-muted-foreground border-b">
                                        <td className="py-1 px-2 sticky left-0 bg-card z-10">Par</td>
                                        {[1,2,3,4,5,6,7,8,9].map(h => {
                                          const holeData = courseHoles.find(hole => hole.holeNumber === h);
                                          return <td key={h} className="text-center">{holeData?.par ?? "-"}</td>;
                                        })}
                                        <td className="text-center bg-muted/50">{courseHoles.filter(h => h.holeNumber <= 9).reduce((sum, h) => sum + h.par, 0) || "-"}</td>
                                        {[10,11,12,13,14,15,16,17,18].map(h => {
                                          const holeData = courseHoles.find(hole => hole.holeNumber === h);
                                          return <td key={h} className="text-center">{holeData?.par ?? "-"}</td>;
                                        })}
                                        <td className="text-center bg-muted/50">{courseHoles.filter(h => h.holeNumber > 9).reduce((sum, h) => sum + h.par, 0) || "-"}</td>
                                        <td className="text-center bg-primary/10">{courseHoles.reduce((sum, h) => sum + h.par, 0) || "-"}</td>
                                      </tr>
                                      <tr className="text-muted-foreground text-[10px] border-b">
                                        <td className="py-0.5 px-2 sticky left-0 bg-card z-10">HCP</td>
                                        {[1,2,3,4,5,6,7,8,9].map(h => {
                                          const holeData = courseHoles.find(hole => hole.holeNumber === h);
                                          return <td key={h} className="text-center">{holeData?.handicap ?? "-"}</td>;
                                        })}
                                        <td className="bg-muted/50"></td>
                                        {[10,11,12,13,14,15,16,17,18].map(h => {
                                          const holeData = courseHoles.find(hole => hole.holeNumber === h);
                                          return <td key={h} className="text-center">{holeData?.handicap ?? "-"}</td>;
                                        })}
                                        <td className="bg-muted/50"></td>
                                        <td className="bg-primary/10"></td>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {renderPlayerRow(sideA, 1, teamAColor || undefined, true)}
                                      {sideA.player2Name && renderPlayerRow(sideA, 2, teamAColor || undefined, true)}
                                      {renderPlayerRow(sideB, 1, teamBColor || undefined, false)}
                                      {sideB.player2Name && renderPlayerRow(sideB, 2, teamBColor || undefined, false)}
                                      {renderMatchStatusRow()}
                                    </tbody>
                                  </table>
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}

                      {/* Scan Review Modal */}
                      <Dialog open={showScanModal} onOpenChange={setShowScanModal}>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>Review Scanned Scores</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-6">
                            {scannedScores.map((ps) => {
                              const mapping = playerMappings[ps.playerName];
                              const totals = (() => {
                                const scores = editableScores[ps.playerName] || {};
                                let f9 = 0, b9 = 0, f9c = 0, b9c = 0;
                                for (let h = 1; h <= 9; h++) { const v = parseInt(scores[h] || ''); if (!isNaN(v) && v > 0) { f9 += v; f9c++; } }
                                for (let h = 10; h <= 18; h++) { const v = parseInt(scores[h] || ''); if (!isNaN(v) && v > 0) { b9 += v; b9c++; } }
                                return { front9: f9c === 9 ? f9 : null, back9: b9c === 9 ? b9 : null, total: f9c === 9 && b9c === 9 ? f9 + b9 : null };
                              })();
                              return (
                                <div key={ps.playerName} className="space-y-3 p-3 border rounded-lg">
                                  <div className="flex items-center justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">Scanned:</span>
                                      <span className="font-semibold">{ps.playerName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Select
                                        value={mapping ? `${mapping.sideId}-${mapping.playerNumber}` : "none"}
                                        onValueChange={(value) => {
                                          if (value === "none") {
                                            setPlayerMappings(prev => ({ ...prev, [ps.playerName]: null }));
                                          } else {
                                            const [sideIdStr, playerNumStr] = value.split("-");
                                            setPlayerMappings(prev => ({
                                              ...prev,
                                              [ps.playerName]: { sideId: parseInt(sideIdStr), playerNumber: parseInt(playerNumStr) as 1 | 2 }
                                            }));
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="w-[180px]" data-testid={`select-player-mapping-${ps.playerName}`}>
                                          <SelectValue placeholder="Choose golfer" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="none">No match</SelectItem>
                                          {(() => {
                                            // Get all player options from all pairings in the current day
                                            const options: { sideId: number; playerNumber: 1 | 2; name: string }[] = [];
                                            currentDay?.pairings.forEach(p => {
                                              p.sides.forEach(side => {
                                                if (side.player1Name) options.push({ sideId: side.id, playerNumber: 1, name: side.player1Name });
                                                if (side.player2Name) options.push({ sideId: side.id, playerNumber: 2, name: side.player2Name });
                                              });
                                            });
                                            return options.map(opt => (
                                              <SelectItem key={`${opt.sideId}-${opt.playerNumber}`} value={`${opt.sideId}-${opt.playerNumber}`}>
                                                {opt.name}
                                              </SelectItem>
                                            ));
                                          })()}
                                        </SelectContent>
                                      </Select>
                                      {mapping ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertCircle className="w-4 h-4 text-yellow-500" />}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-10 gap-1">
                                    {[1,2,3,4,5,6,7,8,9].map(hole => {
                                      const holeData = ps.holes.find(h => h.holeNumber === hole);
                                      const value = editableScores[ps.playerName]?.[hole] || '';
                                      return (
                                        <div key={hole} className="text-center">
                                          <div className="text-xs text-muted-foreground mb-1">{hole}</div>
                                          <div className="relative">
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              value={value}
                                              onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '');
                                                setEditableScores(prev => ({ ...prev, [ps.playerName]: { ...prev[ps.playerName], [hole]: val } }));
                                              }}
                                              className="w-full h-8 text-center text-sm font-medium border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                                              data-testid={`input-scan-${ps.playerName}-${hole}`}
                                            />
                                            {holeData?.confidence && (
                                              <div className="absolute -top-1 -right-1">
                                                {holeData.confidence === 'high' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                                                 holeData.confidence === 'medium' ? <AlertCircle className="w-3 h-3 text-yellow-500" /> :
                                                 <AlertCircle className="w-3 h-3 text-red-500" />}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    <div className="text-center">
                                      <div className="text-xs text-muted-foreground mb-1">OUT</div>
                                      <div className="h-8 flex items-center justify-center text-sm font-bold bg-muted rounded">{totals.front9 ?? '-'}</div>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-10 gap-1">
                                    {[10,11,12,13,14,15,16,17,18].map(hole => {
                                      const holeData = ps.holes.find(h => h.holeNumber === hole);
                                      const value = editableScores[ps.playerName]?.[hole] || '';
                                      return (
                                        <div key={hole} className="text-center">
                                          <div className="text-xs text-muted-foreground mb-1">{hole}</div>
                                          <div className="relative">
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              value={value}
                                              onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '');
                                                setEditableScores(prev => ({ ...prev, [ps.playerName]: { ...prev[ps.playerName], [hole]: val } }));
                                              }}
                                              className="w-full h-8 text-center text-sm font-medium border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                                              data-testid={`input-scan-${ps.playerName}-${hole}`}
                                            />
                                            {holeData?.confidence && (
                                              <div className="absolute -top-1 -right-1">
                                                {holeData.confidence === 'high' ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                                                 holeData.confidence === 'medium' ? <AlertCircle className="w-3 h-3 text-yellow-500" /> :
                                                 <AlertCircle className="w-3 h-3 text-red-500" />}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    <div className="text-center">
                                      <div className="text-xs text-muted-foreground mb-1">IN</div>
                                      <div className="h-8 flex items-center justify-center text-sm font-bold bg-muted rounded">{totals.back9 ?? '-'}</div>
                                    </div>
                                  </div>
                                  <div className="flex justify-end">
                                    <div className="text-center">
                                      <div className="text-xs text-muted-foreground mb-1">TOTAL</div>
                                      <div className="h-8 w-12 flex items-center justify-center text-sm font-bold bg-primary/10 text-primary rounded">{totals.total ?? '-'}</div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-end gap-2 mt-4">
                            <Button variant="outline" onClick={() => { setShowScanModal(false); setScannedScores([]); setEditableScores({}); setPlayerMappings({}); }} data-testid="button-cancel-scan">Cancel</Button>
                            <Button onClick={handleConfirmScannedScores} data-testid="button-confirm-scan">Confirm Scores</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="teams">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader style={{ borderBottom: `3px solid ${teamA?.color}` }}>
                <CardTitle>{teamA?.name}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2">
                  {teamA?.members.map((member) => (
                    <li key={member.id} className="flex justify-between items-center gap-2 p-2 bg-muted/50 rounded">
                      {editingMemberNameId === member.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            type="text"
                            value={editingMemberName}
                            onChange={(e) => setEditingMemberName(e.target.value)}
                            className="h-7 text-sm flex-1"
                            data-testid={`input-name-${member.id}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingMemberName.trim()) {
                                updateMemberNameMutation.mutate({ memberId: member.id, playerName: editingMemberName.trim() });
                              } else if (e.key === "Escape") {
                                setEditingMemberNameId(null);
                                setEditingMemberName("");
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              if (editingMemberName.trim()) {
                                updateMemberNameMutation.mutate({ memberId: member.id, playerName: editingMemberName.trim() });
                              }
                            }}
                            data-testid={`button-save-name-${member.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingMemberNameId(null);
                              setEditingMemberName("");
                            }}
                            data-testid={`button-cancel-name-${member.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => {
                            setEditingMemberNameId(member.id);
                            setEditingMemberName(member.playerName);
                          }}
                          data-testid={`text-member-name-${member.id}`}
                        >
                          {member.playerName}
                        </span>
                      )}
                      {editingMemberId === member.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="HCP"
                            value={editingMemberHandicap}
                            onChange={(e) => setEditingMemberHandicap(e.target.value)}
                            className="w-16 h-7 text-xs"
                            data-testid={`input-handicap-${member.id}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const value = editingMemberHandicap.trim();
                                const handicapIndex = value === "" ? null : Math.round(parseFloat(value) * 10);
                                updateMemberHandicapMutation.mutate({ memberId: member.id, handicapIndex });
                              } else if (e.key === "Escape") {
                                setEditingMemberId(null);
                                setEditingMemberHandicap("");
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const value = editingMemberHandicap.trim();
                              const handicapIndex = value === "" ? null : Math.round(parseFloat(value) * 10);
                              updateMemberHandicapMutation.mutate({ memberId: member.id, handicapIndex });
                            }}
                            data-testid={`button-save-handicap-${member.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingMemberId(null);
                              setEditingMemberHandicap("");
                            }}
                            data-testid={`button-cancel-handicap-${member.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover-elevate"
                            onClick={() => {
                              setEditingMemberId(member.id);
                              setEditingMemberHandicap(member.handicapIndex !== null ? (member.handicapIndex / 10).toFixed(1) : "");
                            }}
                            data-testid={`badge-handicap-${member.id}`}
                          >
                            {member.handicapIndex !== null ? (member.handicapIndex / 10).toFixed(1) : "Set HCP"}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (member.presetPlayerId) {
                                setReplacementPlayerId("");
                                setReplacingPlayer({ name: member.playerName, presetPlayerId: member.presetPlayerId });
                              }
                            }}
                            title="Replace player"
                            disabled={!member.presetPlayerId}
                            data-testid={`button-replace-${member.id}`}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader style={{ borderBottom: `3px solid ${teamB?.color}` }}>
                <CardTitle>{teamB?.name}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ul className="space-y-2">
                  {teamB?.members.map((member) => (
                    <li key={member.id} className="flex justify-between items-center gap-2 p-2 bg-muted/50 rounded">
                      {editingMemberNameId === member.id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Input
                            type="text"
                            value={editingMemberName}
                            onChange={(e) => setEditingMemberName(e.target.value)}
                            className="h-7 text-sm flex-1"
                            data-testid={`input-name-${member.id}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && editingMemberName.trim()) {
                                updateMemberNameMutation.mutate({ memberId: member.id, playerName: editingMemberName.trim() });
                              } else if (e.key === "Escape") {
                                setEditingMemberNameId(null);
                                setEditingMemberName("");
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              if (editingMemberName.trim()) {
                                updateMemberNameMutation.mutate({ memberId: member.id, playerName: editingMemberName.trim() });
                              }
                            }}
                            data-testid={`button-save-name-${member.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingMemberNameId(null);
                              setEditingMemberName("");
                            }}
                            data-testid={`button-cancel-name-${member.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:underline"
                          onClick={() => {
                            setEditingMemberNameId(member.id);
                            setEditingMemberName(member.playerName);
                          }}
                          data-testid={`text-member-name-${member.id}`}
                        >
                          {member.playerName}
                        </span>
                      )}
                      {editingMemberId === member.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="HCP"
                            value={editingMemberHandicap}
                            onChange={(e) => setEditingMemberHandicap(e.target.value)}
                            className="w-16 h-7 text-xs"
                            data-testid={`input-handicap-${member.id}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const value = editingMemberHandicap.trim();
                                const handicapIndex = value === "" ? null : Math.round(parseFloat(value) * 10);
                                updateMemberHandicapMutation.mutate({ memberId: member.id, handicapIndex });
                              } else if (e.key === "Escape") {
                                setEditingMemberId(null);
                                setEditingMemberHandicap("");
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const value = editingMemberHandicap.trim();
                              const handicapIndex = value === "" ? null : Math.round(parseFloat(value) * 10);
                              updateMemberHandicapMutation.mutate({ memberId: member.id, handicapIndex });
                            }}
                            data-testid={`button-save-handicap-${member.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingMemberId(null);
                              setEditingMemberHandicap("");
                            }}
                            data-testid={`button-cancel-handicap-${member.id}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Badge
                            variant="outline"
                            className="cursor-pointer hover-elevate"
                            onClick={() => {
                              setEditingMemberId(member.id);
                              setEditingMemberHandicap(member.handicapIndex !== null ? (member.handicapIndex / 10).toFixed(1) : "");
                            }}
                            data-testid={`badge-handicap-${member.id}`}
                          >
                            {member.handicapIndex !== null ? (member.handicapIndex / 10).toFixed(1) : "Set HCP"}
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (member.presetPlayerId) {
                                setReplacementPlayerId("");
                                setReplacingPlayer({ name: member.playerName, presetPlayerId: member.presetPlayerId });
                              }
                            }}
                            title="Replace player"
                            disabled={!member.presetPlayerId}
                            data-testid={`button-replace-${member.id}`}
                          >
                            <RefreshCw className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Replace Player Dialog */}
          <Dialog open={!!replacingPlayer} onOpenChange={(open) => { if (!open) { setReplacingPlayer(null); setReplacementPlayerId(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Replace {replacingPlayer?.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Select a player from your roster to replace {replacingPlayer?.name}. All tee times, expenses, skins wins, and CTH wins will be transferred to the new player.
                </p>
                <div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-2">
                  {(() => {
                    const currentPlayerIds = [
                      ...(teamA?.members.map(m => m.presetPlayerId) || []),
                      ...(teamB?.members.map(m => m.presetPlayerId) || [])
                    ].filter(id => id !== null);
                    const availablePlayers = presetPlayers?.filter(p => !currentPlayerIds.includes(p.id)) || [];
                    
                    if (availablePlayers.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground py-2 text-center">
                          No available players to select
                        </p>
                      );
                    }
                    
                    return availablePlayers.map(p => (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-muted"
                        data-testid={`option-player-${p.id}`}
                      >
                        <input
                          type="radio"
                          name="replacementPlayer"
                          value={String(p.id)}
                          checked={replacementPlayerId === String(p.id)}
                          onChange={(e) => setReplacementPlayerId(e.target.value)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">{p.name}</span>
                      </label>
                    ));
                  })()}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setReplacingPlayer(null); setReplacementPlayerId(""); }} data-testid="button-cancel-replace">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => {
                      console.log("Replace button clicked, replacementPlayerId:", replacementPlayerId, "replacingPlayer:", replacingPlayer);
                      const oldId = replacingPlayer?.presetPlayerId;
                      const newId = parseInt(replacementPlayerId);
                      console.log("Parsed values - oldId:", oldId, "newId:", newId, "isNaN(newId):", isNaN(newId));
                      if (typeof oldId === 'number' && !isNaN(newId)) {
                        console.log("Calling mutation with:", { oldPresetPlayerId: oldId, newPresetPlayerId: newId });
                        replacePlayerMutation.mutate({ 
                          oldPresetPlayerId: oldId, 
                          newPresetPlayerId: newId 
                        });
                      } else {
                        console.log("Validation failed - not calling mutation");
                      }
                    }}
                    disabled={!replacementPlayerId || !replacingPlayer?.presetPlayerId || replacePlayerMutation.isPending}
                    data-testid="button-confirm-replace"
                  >
                    {replacePlayerMutation.isPending ? "Replacing..." : "Replace Player"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="skins">
          <Card>
            <CardHeader>
              <CardTitle>Daily Skins Game</CardTitle>
              <CardDescription>
                {formatCurrency(event.dailySkinsPot)} pot per day (rolls over if no winner)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Day selector */}
              <div className="flex flex-wrap gap-2">
                {event.days.map((day) => (
                  <Button
                    key={day.id}
                    variant={selectedSkinsDay === day.dayNumber ? "default" : "outline"}
                    onClick={() => setSelectedSkinsDay(day.dayNumber)}
                    data-testid={`button-skins-day-${day.dayNumber}`}
                    className="flex-col h-auto py-2"
                  >
                    <span>Day {day.dayNumber}</span>
                    <span className="text-xs opacity-75 font-normal">
                      {formatCurrency(event.dailySkinsPot + (day.skinsCarryover || 0))} pot
                    </span>
                  </Button>
                ))}
              </div>

              {skinsData ? (
                <div className="space-y-4">
                  {/* Skins Summary */}
                  <div className="flex flex-wrap gap-4 items-center">
                    <div className="text-sm">
                      <span className="font-medium">Total Pot:</span>{" "}
                      ${skinsData.totalPot.toFixed(2)}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Skins Won:</span>{" "}
                      {skinsData.totalSkins}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Value per Skin:</span>{" "}
                      ${skinsData.skinValue.toFixed(2)}
                    </div>
                    <Badge variant={skinsData.isComplete ? "secondary" : "outline"}>
                      {skinsData.isComplete ? "Complete" : "In Progress"}
                    </Badge>
                  </div>

                  {/* Winners Summary */}
                  {skinsData.skinWinners.length > 0 && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-primary" /> Skin Winners
                      </h4>
                      <div className="flex flex-wrap gap-3">
                        {skinsData.skinWinners.map((winner) => {
                          const player = skinsData.players.find(p => p.name === winner.name);
                          return (
                            <div
                              key={winner.name}
                              className="flex items-center gap-2 px-3 py-2 bg-background rounded-md border"
                            >
                              <span
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: player?.teamColor }}
                              />
                              <span className="font-medium">{winner.name}</span>
                              <Badge variant="secondary">{winner.skinsWon} skin{winner.skinsWon !== 1 ? 's' : ''}</Badge>
                              <span className="text-green-600 font-semibold">
                                ${winner.earnings.toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Skins Scorecard */}
                  {event.useHandicaps && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
                      <span className="flex items-center gap-1">
                        <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
                        <span>= 1 stroke received</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="text-blue-600 dark:text-blue-400 font-bold">••</span>
                        <span>= 2 strokes received</span>
                      </span>
                    </div>
                  )}
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium sticky left-0 bg-muted/50 z-10">Player</th>
                          {event.useHandicaps && (
                            <th className="px-2 py-2 text-center font-medium text-xs" title="Course Handicap">HCP</th>
                          )}
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((hole) => (
                            <th key={hole} className="px-2 py-2 text-center font-medium min-w-[36px]">
                              {hole}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-medium bg-muted/30">OUT</th>
                          {[10, 11, 12, 13, 14, 15, 16, 17, 18].map((hole) => (
                            <th key={hole} className="px-2 py-2 text-center font-medium min-w-[36px]">
                              {hole}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-center font-medium bg-muted/30">IN</th>
                          <th className="px-2 py-2 text-center font-medium bg-muted/50">TOT</th>
                          <th className="px-2 py-2 text-center font-medium bg-primary/10">Skins</th>
                        </tr>
                        {/* Par row */}
                        <tr className="bg-muted/30 text-xs text-muted-foreground">
                          <td className="px-3 py-1 font-medium sticky left-0 bg-muted/30 z-10">Par</td>
                          {event.useHandicaps && <td className="px-2 py-1"></td>}
                          {skinsData.pars.slice(0, 9).map((par, idx) => (
                            <td key={idx} className="px-2 py-1 text-center">{par ?? '-'}</td>
                          ))}
                          <td className="px-2 py-1 text-center bg-muted/50">
                            {skinsData.pars.slice(0, 9).reduce<number>((sum, p) => sum + (p ?? 0), 0) || '-'}
                          </td>
                          {skinsData.pars.slice(9, 18).map((par, idx) => (
                            <td key={idx + 9} className="px-2 py-1 text-center">{par ?? '-'}</td>
                          ))}
                          <td className="px-2 py-1 text-center bg-muted/50">
                            {skinsData.pars.slice(9, 18).reduce<number>((sum, p) => sum + (p ?? 0), 0) || '-'}
                          </td>
                          <td className="px-2 py-1 text-center bg-muted/70 font-medium">
                            {skinsData.pars.reduce<number>((sum, p) => sum + (p ?? 0), 0) || '-'}
                          </td>
                          <td className="px-2 py-1"></td>
                        </tr>
                      </thead>
                      <tbody>
                        {skinsData.players.map((player) => {
                          const front9Scores = player.scores.slice(0, 9);
                          const back9Scores = player.scores.slice(9, 18);
                          const front9Complete = front9Scores.every(s => s !== null);
                          const back9Complete = back9Scores.every(s => s !== null);
                          const front9 = front9Complete ? front9Scores.reduce<number>((sum, s) => sum + (s ?? 0), 0) : null;
                          const back9 = back9Complete ? back9Scores.reduce<number>((sum, s) => sum + (s ?? 0), 0) : null;
                          const total = front9 !== null && back9 !== null ? front9 + back9 : null;
                          const skinCount = skinsData.skinWinners.find(w => w.name === player.name)?.skinsWon || 0;

                          return (
                            <tr key={player.name} className="border-t" data-testid={`skins-player-row-${player.name.replace(/\s+/g, '-').toLowerCase()}`}>
                              <td className="px-3 py-2 font-medium sticky left-0 bg-background z-10">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: player.teamColor }}
                                  />
                                  {player.name}
                                </div>
                              </td>
                              {event.useHandicaps && (
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                                  {player.courseHandicap !== null ? player.courseHandicap : '-'}
                                </td>
                              )}
                              {player.scores.slice(0, 9).map((score, idx) => {
                                const holeResult = skinsData.holeResults[idx];
                                const isSkinWinner = holeResult?.isSkin && holeResult?.winnerId === player.name;
                                const isLowScore = holeResult?.lowestScore === score && holeResult?.winnerId === player.name;
                                const strokesOnHole = player.strokesPerHole[idx] || 0;
                                return (
                                  <td
                                    key={idx}
                                    className={`px-2 py-2 text-center relative ${
                                      isSkinWinner 
                                        ? 'bg-green-100 dark:bg-green-900/30 font-bold text-green-700 dark:text-green-400' 
                                        : isLowScore && !holeResult?.isSkin
                                          ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                          : ''
                                    }`}
                                  >
                                    {score ?? '-'}
                                    {strokesOnHole > 0 && event.useHandicaps && (
                                      <span className="absolute top-0.5 right-0.5 text-[8px] text-blue-600 dark:text-blue-400 font-bold">
                                        {'•'.repeat(strokesOnHole)}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2 text-center font-medium bg-muted/30">
                                {front9 || '-'}
                              </td>
                              {player.scores.slice(9, 18).map((score, idx) => {
                                const holeResult = skinsData.holeResults[idx + 9];
                                const isSkinWinner = holeResult?.isSkin && holeResult?.winnerId === player.name;
                                const isLowScore = holeResult?.lowestScore === score && holeResult?.winnerId === player.name;
                                const strokesOnHole = player.strokesPerHole[idx + 9] || 0;
                                return (
                                  <td
                                    key={idx + 9}
                                    className={`px-2 py-2 text-center relative ${
                                      isSkinWinner 
                                        ? 'bg-green-100 dark:bg-green-900/30 font-bold text-green-700 dark:text-green-400' 
                                        : isLowScore && !holeResult?.isSkin
                                          ? 'bg-yellow-50 dark:bg-yellow-900/20'
                                          : ''
                                    }`}
                                  >
                                    {score ?? '-'}
                                    {strokesOnHole > 0 && event.useHandicaps && (
                                      <span className="absolute top-0.5 right-0.5 text-[8px] text-blue-600 dark:text-blue-400 font-bold">
                                        {'•'.repeat(strokesOnHole)}
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2 text-center font-medium bg-muted/30" data-testid={`skins-back9-${player.name.replace(/\s+/g, '-').toLowerCase()}`}>
                                {back9 !== null ? back9 : '-'}
                              </td>
                              <td className="px-2 py-2 text-center font-bold bg-muted/50" data-testid={`skins-total-${player.name.replace(/\s+/g, '-').toLowerCase()}`}>
                                {total !== null ? total : '-'}
                              </td>
                              <td className="px-2 py-2 text-center font-bold bg-primary/10" data-testid={`skins-count-${player.name.replace(/\s+/g, '-').toLowerCase()}`}>
                                {skinCount > 0 ? (
                                  <span className="text-green-600">{skinCount}</span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Skins row */}
                        <tr className="border-t-2 border-primary/20 bg-primary/5" data-testid="skins-results-row">
                          <td className="px-3 py-2 font-semibold sticky left-0 bg-primary/5 z-10">
                            Skins
                          </td>
                          {skinsData.holeResults.slice(0, 9).map((result, idx) => (
                            <td key={idx} className="px-2 py-2 text-center text-xs" data-testid={`skins-hole-${idx + 1}`}>
                              {result.isSkin ? (
                                <span className="text-green-600 font-bold">
                                  {result.winnerName?.split(' ')[0]?.slice(0, 3)}
                                </span>
                              ) : result.isPending ? (
                                <span className="text-yellow-600" title="Pending - waiting for next hole">?</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center bg-muted/30" />
                          {skinsData.holeResults.slice(9, 18).map((result, idx) => (
                            <td key={idx + 9} className="px-2 py-2 text-center text-xs" data-testid={`skins-hole-${idx + 10}`}>
                              {result.isSkin ? (
                                <span className="text-green-600 font-bold">
                                  {result.winnerName?.split(' ')[0]?.slice(0, 3)}
                                </span>
                              ) : result.isPending ? (
                                <span className="text-yellow-600" title="Pending - waiting for next hole">?</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          ))}
                          <td className="px-2 py-2 text-center bg-muted/30" />
                          <td className="px-2 py-2 text-center bg-muted/50" />
                          <td className="px-2 py-2 text-center font-bold bg-primary/10 text-primary" data-testid="skins-total-count">
                            {skinsData.totalSkins}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 bg-green-100 dark:bg-green-900/30 rounded" />
                      <span>Skin Won</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-4 h-4 bg-yellow-50 dark:bg-yellow-900/20 rounded border" />
                      <span>Low Score (pending)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-yellow-600 font-bold">?</span>
                      <span>Pending next hole</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No scores entered for Day {selectedSkinsDay} yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          {/* Payout Settings Configuration */}
          {isCreatorOrAdmin && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Payout Settings
                </CardTitle>
                <CardDescription>Configure event payouts (amounts in dollars)</CardDescription>
              </CardHeader>
              <CardContent>
                <PayoutSettingsForm event={event} courses={courses} eventId={id!} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" /> Payout Summary
              </CardTitle>
              <CardDescription>
                {(() => {
                  const numPlayers = 12;
                  const numDays = event.days.length || 4;
                  const matchesPerDay = 3;
                  const par3sByDay = event.days.map(day => {
                    const dayCourseId = day.courseId || event.courseId;
                    const dayCourse = courses.find(c => c.id === dayCourseId);
                    return dayCourse?.holes?.filter(h => h.par === 3).length || 0;
                  });
                  const totalPar3s = par3sByDay.reduce((sum, p) => sum + p, 0);
                  const playersPerMatch = 2;
                  const totalPot = (event.teamWinBonus * 6) + (event.matchWinBonus * playersPerMatch * matchesPerDay * numDays) + (event.dailySkinsPot * numDays) + (event.closestToHolePayout * totalPar3s);
                  const calculatedBuyIn = Math.ceil(totalPot / numPlayers);
                  return `Buy-in: ${formatCurrency(calculatedBuyIn)} | Total pot: ${formatCurrency(totalPot)}`;
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                  <span>Player</span>
                  <span className="text-center">Team</span>
                  <span className="text-right">Earnings</span>
                </div>
                {Object.entries(payouts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([playerName, amount]) => {
                    const team = teamA?.members.find(m => m.playerName === playerName) ? teamA : teamB;
                    return (
                      <div key={playerName} className="grid grid-cols-3 gap-4 text-sm py-2 border-b border-muted/50">
                        <span className="font-medium">{playerName}</span>
                        <span className="text-center">
                          <Badge 
                            variant="outline" 
                            style={{ borderColor: team?.color || undefined, color: team?.color || undefined }}
                          >
                            {team?.name}
                          </Badge>
                        </span>
                        <span className={`text-right font-semibold ${amount > 0 ? "text-green-600" : ""}`}>
                          {formatCurrency(amount)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="w-5 h-5" /> Event Ledger
                </CardTitle>
                <CardDescription>
                  Track shared expenses and who owes who
                </CardDescription>
              </div>
              {isCreatorOrAdmin && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => setAddTransactionOpen(true)}
                    data-testid="button-add-transaction"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Expense
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddBetOpen(true)}
                    data-testid="button-add-bet"
                  >
                    <Plus className="w-4 h-4 mr-1" /> Add Bet
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {(() => {
                const allPlayers = [
                  ...(teamA?.members.map(m => m.playerName) || []),
                  ...(teamB?.members.map(m => m.playerName) || []),
                ];
                
                // Calculate expense balances
                const expenseBalances: Record<string, number> = {};
                allPlayers.forEach(name => { expenseBalances[name] = 0; });
                
                transactions.forEach(t => {
                  expenseBalances[t.payerName] = (expenseBalances[t.payerName] || 0) + t.amount;
                  t.splits.forEach(s => {
                    expenseBalances[s.playerName] = (expenseBalances[s.playerName] || 0) - s.amount;
                  });
                });
                
                // Calculate manual bet balances
                const manualBetBalances: Record<string, number> = {};
                allPlayers.forEach(name => { manualBetBalances[name] = 0; });
                
                manualBets.forEach(bet => {
                  bet.entries.forEach(entry => {
                    manualBetBalances[entry.playerName] = (manualBetBalances[entry.playerName] || 0) + entry.amount;
                  });
                });

                // Calculate net position based on includeBuyInInLedger setting
                const includeBuyIn = event?.includeBuyInInLedger ?? true;
                
                // Calculate buy-in amount (must match PayoutsTab calculation exactly)
                const numPlayers = 12;
                const numDays = event.days.length || 4;
                const matchesPerDay = 3;
                const playersPerMatch = 2;
                const par3sByDay = event.days.map(day => {
                  const dayCourseId = day.courseId || event.courseId;
                  const dayCourse = courses?.find((c: { id: number }) => c.id === dayCourseId);
                  return dayCourse?.holes?.filter((h: { par: number }) => h.par === 3).length || 0;
                });
                const totalPar3s = par3sByDay.reduce((sum: number, p: number) => sum + p, 0);
                const totalTeamWin = event.teamWinBonus * 6;
                const totalMatchWins = event.matchWinBonus * playersPerMatch * matchesPerDay * numDays;
                const totalSkins = event.dailySkinsPot * numDays;
                const totalCTH = event.closestToHolePayout * totalPar3s;
                const totalPot = totalTeamWin + totalMatchWins + totalSkins + totalCTH;
                const buyInAmount = Math.ceil(totalPot / numPlayers);
                
                const netPosition: Record<string, number> = {};
                allPlayers.forEach(name => {
                  const sideBets = sideBetData.balances[name] || 0;
                  const manualBetsTotal = manualBetBalances[name] || 0;
                  if (includeBuyIn) {
                    // Include buy-in (negative) + earnings + side bets + expenses + manual bets
                    netPosition[name] = -buyInAmount + (payoutsWithSkins[name] || 0) + sideBets + (expenseBalances[name] || 0) + manualBetsTotal;
                  } else {
                    // Exclude earnings and buy-in from net - show side bets + expenses + manual bets only
                    netPosition[name] = sideBets + (expenseBalances[name] || 0) + manualBetsTotal;
                  }
                });

                return (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold mb-3">
                        {includeBuyIn 
                          ? "Net Position (Buy-In + Earnings + Side Bets + Expenses)" 
                          : "Position Summary (Earnings shown separately)"}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 pr-4">Player</th>
                              {includeBuyIn && <th className="text-right py-2 px-2">Buy-In</th>}
                              <th 
                                className="text-right py-2 px-2 cursor-pointer hover-elevate select-none"
                                onClick={() => setEarningsExpanded(!earningsExpanded)}
                                data-testid="header-earnings-toggle"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Earnings</span>
                                  <ChevronDown className={`w-3 h-3 transition-transform ${earningsExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </th>
                              {earningsExpanded && event.days.map(day => (
                                <th key={`earn-day-${day.dayNumber}`} className="text-right py-2 px-2 text-xs text-muted-foreground">
                                  D{day.dayNumber}
                                </th>
                              ))}
                              <th 
                                className={`text-right py-2 px-2 cursor-pointer hover-elevate select-none ${!includeBuyIn ? "border-l-2 border-muted-foreground/30" : ""}`}
                                onClick={() => setSideBetsExpanded(!sideBetsExpanded)}
                                data-testid="header-sidebets-toggle"
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <span>Side Bets</span>
                                  <ChevronDown className={`w-3 h-3 transition-transform ${sideBetsExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </th>
                              {sideBetsExpanded && event.days.map(day => (
                                <th key={`side-day-${day.dayNumber}`} className="text-right py-2 px-2 text-xs text-muted-foreground">
                                  D{day.dayNumber}
                                </th>
                              ))}
                              {sideBetsExpanded && (
                                <th className="text-right py-2 px-2 text-xs text-muted-foreground">
                                  M
                                </th>
                              )}
                              <th className="text-right py-2 px-2">Expenses</th>
                              <th className="text-right py-2 pl-2 font-bold">
                                {includeBuyIn ? "Net" : "Owed"}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {allPlayers
                              .sort((a, b) => (netPosition[b] || 0) - (netPosition[a] || 0))
                              .map(playerName => {
                                const team = teamA?.members.find(m => m.playerName === playerName) ? teamA : teamB;
                                const earnings = payoutsWithSkins[playerName] || 0;
                                const sideBetsOnly = sideBetData.balances[playerName] || 0;
                                const manualBetsAmount = manualBetBalances[playerName] || 0;
                                const sideBets = sideBetsOnly + manualBetsAmount;
                                const expenses = expenseBalances[playerName] || 0;
                                const net = netPosition[playerName] || 0;
                                return (
                                  <tr key={playerName} className="border-b border-muted/50">
                                    <td className="py-2 pr-4">
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-2 h-2 rounded-full" 
                                          style={{ backgroundColor: team?.color || "#888" }}
                                        />
                                        <span className="font-medium">{playerName}</span>
                                      </div>
                                    </td>
                                    {includeBuyIn && (
                                      <td className="text-right py-2 px-2 text-red-600">
                                        {formatCurrency(-buyInAmount)}
                                      </td>
                                    )}
                                    <td className="text-right py-2 px-2">
                                      <button
                                        onClick={() => setEarningsBreakdownPlayer(playerName)}
                                        className={`hover:underline cursor-pointer ${earnings > 0 ? "text-green-600" : ""}`}
                                        data-testid={`button-earnings-breakdown-${playerName}`}
                                      >
                                        {formatCurrency(earnings)}
                                      </button>
                                    </td>
                                    {earningsExpanded && event.days.map(day => {
                                      const dayEarning = earningsByDay[day.dayNumber]?.[playerName] || 0;
                                      return (
                                        <td 
                                          key={`earn-${playerName}-${day.dayNumber}`} 
                                          className="text-right py-2 px-2 text-xs"
                                        >
                                          <button
                                            onClick={() => setDayEarningsBreakdown({ player: playerName, day: day.dayNumber })}
                                            className={`hover:underline cursor-pointer ${dayEarning > 0 ? "text-green-600" : "text-muted-foreground"}`}
                                            data-testid={`button-day-earnings-${playerName}-${day.dayNumber}`}
                                          >
                                            {formatCurrency(dayEarning)}
                                          </button>
                                        </td>
                                      );
                                    })}
                                    <td className={`text-right py-2 px-2 ${!includeBuyIn ? "border-l-2 border-muted-foreground/30" : ""}`}>
                                      <button
                                        onClick={() => setSideBetsBreakdownPlayer(playerName)}
                                        className={`hover:underline cursor-pointer ${sideBets > 0 ? "text-green-600" : sideBets < 0 ? "text-red-600" : ""}`}
                                        data-testid={`button-sidebets-breakdown-${playerName}`}
                                      >
                                        {sideBets > 0 ? "+" : ""}{formatCurrency(sideBets)}
                                      </button>
                                    </td>
                                    {sideBetsExpanded && event.days.map(day => {
                                      const daySideBet = sideBetsByDay[day.dayNumber]?.[playerName] || 0;
                                      return (
                                        <td 
                                          key={`side-${playerName}-${day.dayNumber}`} 
                                          className="text-right py-2 px-2 text-xs"
                                        >
                                          <button
                                            onClick={() => setDaySideBetsBreakdown({ player: playerName, day: day.dayNumber })}
                                            className={`hover:underline cursor-pointer ${daySideBet > 0 ? "text-green-600" : daySideBet < 0 ? "text-red-600" : "text-muted-foreground"}`}
                                            data-testid={`button-day-sidebets-${playerName}-${day.dayNumber}`}
                                          >
                                            {daySideBet !== 0 ? (daySideBet > 0 ? "+" : "") : ""}{formatCurrency(daySideBet)}
                                          </button>
                                        </td>
                                      );
                                    })}
                                    {sideBetsExpanded && (
                                      <td className="text-right py-2 px-2 text-xs">
                                        <span className={`${manualBetsAmount > 0 ? "text-green-600" : manualBetsAmount < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                          {manualBetsAmount !== 0 ? (manualBetsAmount > 0 ? "+" : "") : ""}{formatCurrency(manualBetsAmount)}
                                        </span>
                                      </td>
                                    )}
                                    <td className={`text-right py-2 px-2`}>
                                      <button
                                        onClick={() => setExpensesBreakdownPlayer(playerName)}
                                        className={`hover:underline cursor-pointer ${expenses > 0 ? "text-green-600" : expenses < 0 ? "text-red-600" : ""}`}
                                        data-testid={`button-expenses-breakdown-${playerName}`}
                                      >
                                        {expenses > 0 ? "+" : ""}{formatCurrency(expenses)}
                                      </button>
                                    </td>
                                    <td className={`text-right py-2 pl-2 font-bold ${net > 0 ? "text-green-600" : net < 0 ? "text-red-600" : ""}`}>
                                      {net > 0 ? "+" : ""}{formatCurrency(net)}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {transactions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3">Expense History</h4>
                        <div className="space-y-3">
                          {transactions.map(t => (
                            <div key={t.id} className="border rounded p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{t.description}</span>
                                    <Badge variant="secondary">{formatCurrency(t.amount)}</Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    Paid by <span className="font-medium">{t.payerName}</span>
                                    {t.createdAt && ` on ${new Date(t.createdAt).toLocaleDateString()}`}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Split between: {t.splits.map(s => s.playerName).join(", ")}
                                    {" "}({formatCurrency(t.splits[0]?.amount || 0)} each)
                                  </p>
                                </div>
                                {isCreatorOrAdmin && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteTransactionMutation.mutate(t.id)}
                                    disabled={deleteTransactionMutation.isPending}
                                    data-testid={`button-delete-transaction-${t.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {manualBets.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-3">Manual Bets</h4>
                        <div className="space-y-3">
                          {manualBets.map(bet => (
                            <div key={bet.id} className="border rounded p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium">{bet.description}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {bet.entries.map(e => (
                                      <span key={e.playerName} className="mr-2">
                                        {e.playerName}: <span className={e.amount > 0 ? "text-green-600" : e.amount < 0 ? "text-red-600" : ""}>{e.amount > 0 ? "+" : ""}{formatCurrency(e.amount)}</span>
                                      </span>
                                    ))}
                                  </p>
                                </div>
                                {isCreatorOrAdmin && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteManualBetMutation.mutate(bet.id)}
                                    disabled={deleteManualBetMutation.isPending}
                                    data-testid={`button-delete-manual-bet-${bet.id}`}
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addTransactionOpen} onOpenChange={setAddTransactionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Who paid?</Label>
              <Select value={transactionPayer} onValueChange={setTransactionPayer}>
                <SelectTrigger data-testid="select-payer">
                  <SelectValue placeholder="Select player" />
                </SelectTrigger>
                <SelectContent>
                  {[...(teamA?.members || []), ...(teamB?.members || [])].map(m => (
                    <SelectItem key={m.id} value={m.playerName} data-testid={`select-item-payer-${m.id}`}>
                      {m.playerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={transactionDescription}
                onChange={(e) => setTransactionDescription(e.target.value)}
                placeholder="e.g., Dinner, Golf cart, Drinks"
                data-testid="input-transaction-description"
              />
            </div>

            <div>
              <Label>Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={transactionAmount}
                  onChange={(e) => setTransactionAmount(e.target.value)}
                  placeholder="0.00"
                  className="pl-7"
                  data-testid="input-transaction-amount"
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Split between (select players)</Label>
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                {[...(teamA?.members || []), ...(teamB?.members || [])].map(m => {
                  const isSelected = transactionSplitPlayers.includes(m.playerName);
                  const team = teamA?.members.find(tm => tm.id === m.id) ? teamA : teamB;
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setTransactionSplitPlayers(prev => prev.filter(n => n !== m.playerName));
                        } else {
                          setTransactionSplitPlayers(prev => [...prev, m.playerName]);
                        }
                      }}
                      className="justify-start"
                      style={isSelected ? { backgroundColor: team?.color || undefined } : undefined}
                      data-testid={`button-split-player-${m.id}`}
                    >
                      {isSelected && <Check className="w-3 h-3 mr-1" />}
                      {m.playerName}
                    </Button>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  const allNames = [...(teamA?.members || []), ...(teamB?.members || [])].map(m => m.playerName);
                  setTransactionSplitPlayers(allNames);
                }}
                data-testid="button-select-all-players"
              >
                Select All
              </Button>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddTransactionOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const amountInCents = Math.round(parseFloat(transactionAmount) * 100);
                  if (!transactionPayer || !transactionDescription || !amountInCents || transactionSplitPlayers.length === 0) {
                    toast({ title: "Error", description: "Please fill in all fields", variant: "destructive" });
                    return;
                  }
                  createTransactionMutation.mutate({
                    payerName: transactionPayer,
                    description: transactionDescription,
                    amount: amountInCents,
                    splitPlayerNames: transactionSplitPlayers,
                  });
                }}
                disabled={createTransactionMutation.isPending}
                data-testid="button-save-transaction"
              >
                Add Expense
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Add Manual Bet Dialog */}
      <Dialog open={addBetOpen} onOpenChange={setAddBetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Manual Bet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="bet-description">Description</Label>
              <Input
                id="bet-description"
                placeholder="e.g., Nassau bet at Torrey Pines"
                value={betDescription}
                onChange={(e) => setBetDescription(e.target.value)}
                data-testid="input-bet-description"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Players & Amounts</Label>
              <p className="text-xs text-muted-foreground">
                Positive amounts are winnings, negative are losses. Total must equal zero.
              </p>
              {betEntries.map((entry, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Select
                    value={entry.playerName || ""}
                    onValueChange={(value) => updateBetEntryPlayer(index, value)}
                  >
                    <SelectTrigger className="flex-1" data-testid={`select-bet-player-${index}`}>
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {allEventPlayers.map((p) => (
                        <SelectItem key={p.playerName} value={p.playerName}>{p.playerName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Amount"
                    className="w-24"
                    value={entry.amount}
                    onChange={(e) => updateBetEntryAmount(index, e.target.value)}
                    data-testid={`input-bet-amount-${index}`}
                  />
                  {betEntries.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeBetEntry(index)}
                      data-testid={`button-remove-entry-${index}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              
              <Button
                variant="outline"
                size="sm"
                onClick={addBetEntry}
                className="w-full"
                data-testid="button-add-entry"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Player
              </Button>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className={calculateBetTotal() === 0 ? "text-green-600" : "text-red-600"}>
                ${calculateBetTotal().toFixed(2)}
                {calculateBetTotal() !== 0 && " (must be $0.00)"}
              </span>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAddBetOpen(false)}
                data-testid="button-cancel-bet"
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmitBet}
                disabled={createManualBetMutation.isPending || calculateBetTotal() !== 0}
                data-testid="button-save-bet"
              >
                {createManualBetMutation.isPending ? "Saving..." : "Save Bet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recordResultDialogOpen} onOpenChange={setRecordResultDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Match Result</DialogTitle>
          </DialogHeader>
          {selectedPairing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Winner</Label>
                <div className="grid grid-cols-3 gap-2">
                  {selectedPairing.sides.map((side) => {
                    const display = getSideDisplay(side);
                    return (
                      <Button
                        key={side.id}
                        variant={selectedWinnerId === side.id ? "default" : "outline"}
                        onClick={() => setSelectedWinnerId(side.id)}
                        className="h-auto py-3"
                        style={selectedWinnerId === side.id ? { backgroundColor: display.color } : {}}
                        data-testid={`button-winner-${side.id}`}
                      >
                        <div className="text-center">
                          <p className="text-xs">{display.teamName}</p>
                          <p className="text-sm font-medium">{display.names}</p>
                        </div>
                      </Button>
                    );
                  })}
                  <Button
                    variant={selectedWinnerId === null ? "default" : "outline"}
                    onClick={() => setSelectedWinnerId(null)}
                    data-testid="button-winner-tie"
                  >
                    Halved
                  </Button>
                </div>
              </div>

              {selectedWinnerId && (
                <div>
                  <Label>Margin (optional)</Label>
                  <Input
                    value={winningMargin}
                    onChange={(e) => setWinningMargin(e.target.value)}
                    placeholder="e.g., 2&1, 3&2"
                    data-testid="input-margin"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRecordResultDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => recordResultMutation.mutate()}
                  disabled={recordResultMutation.isPending}
                  data-testid="button-save-result"
                >
                  Save Result
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!earningsBreakdownPlayer} onOpenChange={(open) => !open && setEarningsBreakdownPlayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Earnings Breakdown - {earningsBreakdownPlayer}</DialogTitle>
          </DialogHeader>
          {earningsBreakdownPlayer && (() => {
            const breakdown = getEarningsBreakdown(earningsBreakdownPlayer);
            const total = breakdown.reduce((sum, b) => sum + b.amount, 0);
            return (
              <div className="space-y-3">
                {breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No earnings yet</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {breakdown.map((b, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span>{b.description}</span>
                          <span className="font-medium text-green-600">{formatCurrency(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-semibold">
                      <span>Total</span>
                      <span className="text-green-600">{formatCurrency(total)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!sideBetsBreakdownPlayer} onOpenChange={(open) => !open && setSideBetsBreakdownPlayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Side Bets Breakdown - {sideBetsBreakdownPlayer}</DialogTitle>
          </DialogHeader>
          {sideBetsBreakdownPlayer && (() => {
            const entries = getSideBetBreakdown(sideBetsBreakdownPlayer);
            const manualBetEntries = manualBets
              .filter(bet => bet.entries.some(e => e.playerName === sideBetsBreakdownPlayer))
              .map(bet => {
                const entry = bet.entries.find(e => e.playerName === sideBetsBreakdownPlayer);
                return {
                  matchName: bet.description,
                  betType: "Manual",
                  amount: entry?.amount || 0
                };
              });
            const allEntries = [...entries, ...manualBetEntries];
            const total = allEntries.reduce((sum, e) => sum + e.amount, 0);
            return (
              <div className="space-y-3">
                {allEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No side bet results yet</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {allEntries.map((e, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b pb-2">
                          <div>
                            <span className="font-medium">{e.matchName}</span>
                            {e.betType && <Badge variant="outline" className="ml-2">{e.betType}</Badge>}
                          </div>
                          <span className={`font-medium ${e.amount > 0 ? "text-green-600" : e.amount < 0 ? "text-red-600" : ""}`}>
                            {e.amount > 0 ? "+" : ""}{formatCurrency(e.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-semibold">
                      <span>Total</span>
                      <span className={total > 0 ? "text-green-600" : total < 0 ? "text-red-600" : ""}>
                        {total > 0 ? "+" : ""}{formatCurrency(total)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!expensesBreakdownPlayer} onOpenChange={(open) => !open && setExpensesBreakdownPlayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expenses Breakdown - {expensesBreakdownPlayer}</DialogTitle>
          </DialogHeader>
          {expensesBreakdownPlayer && (() => {
            // Filter transactions where this player is the payer or is in the splits
            const playerTransactions = transactions.filter(t => 
              t.payerName === expensesBreakdownPlayer || 
              t.splits.some(s => s.playerName === expensesBreakdownPlayer)
            );
            
            // Calculate expense entries for this player
            const entries = playerTransactions.map(t => {
              let amount = 0;
              if (t.payerName === expensesBreakdownPlayer) {
                // Player paid, so they get credit
                amount += t.amount;
              }
              const split = t.splits.find(s => s.playerName === expensesBreakdownPlayer);
              if (split) {
                // Player owes their share
                amount -= split.amount;
              }
              return {
                description: t.description,
                amount,
                date: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : null,
                isPayer: t.payerName === expensesBreakdownPlayer,
              };
            }).filter(e => e.amount !== 0);
            
            const total = entries.reduce((sum, e) => sum + e.amount, 0);
            
            return (
              <div className="space-y-3">
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No expense transactions</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {entries.map((e, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b pb-2">
                          <div>
                            <span className="font-medium">{e.description}</span>
                            {e.isPayer && <Badge variant="outline" className="ml-2">Paid</Badge>}
                            {e.date && <span className="text-xs text-muted-foreground ml-2">{e.date}</span>}
                          </div>
                          <span className={`font-medium ${e.amount > 0 ? "text-green-600" : e.amount < 0 ? "text-red-600" : ""}`}>
                            {e.amount > 0 ? "+" : ""}{formatCurrency(e.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-semibold">
                      <span>Total</span>
                      <span className={total > 0 ? "text-green-600" : total < 0 ? "text-red-600" : ""}>
                        {total > 0 ? "+" : ""}{formatCurrency(total)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!dayEarningsBreakdown} onOpenChange={(open) => !open && setDayEarningsBreakdown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Day {dayEarningsBreakdown?.day} Earnings - {dayEarningsBreakdown?.player}</DialogTitle>
          </DialogHeader>
          {dayEarningsBreakdown && (() => {
            const breakdown = getDayEarningsBreakdown(dayEarningsBreakdown.player, dayEarningsBreakdown.day);
            const total = breakdown.reduce((sum, b) => sum + b.amount, 0);
            return (
              <div className="space-y-3">
                {breakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No earnings for Day {dayEarningsBreakdown.day}</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {breakdown.map((b, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span>{b.description}</span>
                          <span className="font-medium text-green-600">{formatCurrency(b.amount)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-semibold">
                      <span>Total</span>
                      <span className="text-green-600">{formatCurrency(total)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!daySideBetsBreakdown} onOpenChange={(open) => !open && setDaySideBetsBreakdown(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Day {daySideBetsBreakdown?.day} Side Bets - {daySideBetsBreakdown?.player}</DialogTitle>
          </DialogHeader>
          {daySideBetsBreakdown && (() => {
            const entries = getDaySideBetBreakdown(daySideBetsBreakdown.player, daySideBetsBreakdown.day);
            const total = entries.reduce((sum, e) => sum + e.amount, 0);
            return (
              <div className="space-y-3">
                {entries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No side bet results for Day {daySideBetsBreakdown.day}</p>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {entries.map((e, i) => (
                        <div key={i} className="flex justify-between items-center text-sm border-b pb-2">
                          <div>
                            <span className="font-medium">{e.matchName}</span>
                            {e.betType && <Badge variant="outline" className="ml-2">{e.betType}</Badge>}
                          </div>
                          <span className={`font-medium ${e.amount > 0 ? "text-green-600" : e.amount < 0 ? "text-red-600" : ""}`}>
                            {e.amount > 0 ? "+" : ""}{formatCurrency(e.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t pt-2 flex justify-between items-center font-semibold">
                      <span>Total</span>
                      <span className={total > 0 ? "text-green-600" : total < 0 ? "text-red-600" : ""}>
                        {total > 0 ? "+" : ""}{formatCurrency(total)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
