import { useQuery } from "@tanstack/react-query";
import { useMatch, useAddPlayer, useRemovePlayer, useSubmitScore, useDeleteMatch, useCreateEventMatch, useDeleteEventMatch, useReplicateEventMatchToSiblings, useCreatePress, useUpdateAutoPress, useUpdateNetScoring, useUpdateUnitAmount, useUpdateMatchType, useCourses, useUpdateHandicapped, usePlayerHandicaps, useUpsertPlayerHandicap, useUpdatePlayerMatchHandicap, useCourseTees, useUpdatePlayerTee, useMatchPlayerHandicaps, useUpsertMatchPlayerHandicap, useCopyBetsFromEvent, useMatches, useUpdateMatchDetails, useGroups, useCreateGroup, useFullPlayerData, useMyMatchRole, useMatchRoles, useUpsertMatchRole, useDeleteMatchRole, type MatchPlayerHandicap, type UserMatchRole } from "@/hooks/use-matches";
import { Checkbox } from "@/components/ui/checkbox";
import MatchChat from "@/components/MatchChat";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useRoute, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Calendar, UserPlus, Trophy, Plus, Trash2, Users, Swords, X, ChevronDown, ChevronUp, Receipt, Camera, Filter, Copy, Pencil, Check, RotateCcw, AlertTriangle, Mic, MicOff, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useState, useRef, useEffect, useCallback } from "react";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareButton } from "@/components/ShareButton";
import { calculateMatchPlayResults, getMatchStatus, calculateBetSettlements, calculateLedger, calculateCombinedMatchSettlements, calculateNassauResults, calculateNassauSettlements, calculateSkinsResults, calculateFiveMatchResults, calculateFiveSettlements, calculateDeathMatchResults, calculateTwoThreeBallResults, physicalToPlayingPosition, type NetScoringContext } from "@/lib/matchplay";
import { buildNetScoringContext, getStrokesForHole, type PlayerHandicapInfo, type CourseHandicapOverride } from "@/lib/handicap";
import { MATCH_TYPES, ALL_MATCH_OPTIONS, MATCH_TYPE_LABELS, WIZARD_TYPES, type MatchType } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Player {
  id: number;
  matchId: number;
  userId: string | null;
  name: string;
  handicapIndex: number | null;
  teeId: number | null;
}

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
  player?: Player;
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
  unitAmount: number;
  startHole?: number;
  parentMatchId?: number | null;
  autoPressOriginal?: boolean;
  autoPressAllPresses?: boolean;
  autoPressNassauFront9?: boolean;
  autoPressNassauBack9?: boolean;
  autoPressNassauOverall?: boolean;
  useNetScoring?: boolean;
  startOnBack9?: boolean;
  hasBeenReplicated?: boolean;
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
  teams: Team[];
}

function ScoreCell({ score, par, testId, strokesReceived = 0 }: { score: number | null; par: number; testId: string; strokesReceived?: number }) {
  const strokeDots = strokesReceived > 0 ? (
    <span className="absolute -top-0.5 -right-0.5 flex gap-0.5">
      {Array.from({ length: Math.min(strokesReceived, 3) }, (_, i) => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      ))}
    </span>
  ) : null;

  if (score === null) {
    return (
      <span className="font-mono font-medium inline-block w-10 h-8 leading-8 text-muted-foreground relative" data-testid={testId}>
        -
        {strokeDots}
      </span>
    );
  }
  
  const diff = score - par;
  
  if (diff === 0) {
    return (
      <span className="font-mono font-medium inline-block w-10 h-8 leading-8 text-foreground relative" data-testid={testId}>
        {score}
        {strokeDots}
      </span>
    );
  }
  
  if (diff < 0) {
    const circleCount = Math.abs(diff);
    const circles = Array.from({ length: circleCount }, (_, i) => (
      <span 
        key={i} 
        className="absolute inset-0 flex items-center justify-center"
        style={{ 
          transform: `scale(${1 + i * 0.35})`,
        }}
      >
        <span className="w-6 h-6 rounded-full border-2 border-red-500" />
      </span>
    ));
    
    return (
      <span className="font-mono font-bold inline-flex items-center justify-center w-10 h-8 text-red-500 relative" data-testid={testId}>
        {circles}
        <span className="relative z-10">{score}</span>
        {strokeDots}
      </span>
    );
  }
  
  const squareCount = Math.min(diff, 3);
  const squares = Array.from({ length: squareCount }, (_, i) => (
    <span 
      key={i} 
      className="absolute inset-0 flex items-center justify-center"
      style={{ 
        transform: `scale(${1 + i * 0.35})`,
      }}
    >
      <span className="w-6 h-6 border-2 border-blue-500" />
    </span>
  ));
  
  return (
    <span className="font-mono font-bold inline-flex items-center justify-center w-10 h-8 text-blue-500 relative" data-testid={testId}>
      {squares}
      <span className="relative z-10">{score}</span>
      {strokeDots}
    </span>
  );
}

export default function MatchDetail() {
  const [, params] = useRoute("/match/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id || "0");
  const { data: match, isLoading, error } = useMatch(matchId);
  const { data: coursesList } = useCourses();
  const { data: groups } = useGroups();
  const createGroup = useCreateGroup();
  const { user } = useAuth();
  const { toast } = useToast();
  const addPlayer = useAddPlayer(matchId);
  const removePlayer = useRemovePlayer(matchId);
  const submitScore = useSubmitScore(matchId);
  const deleteMatch = useDeleteMatch();
  const createEventMatch = useCreateEventMatch(matchId, match?.ryderCupEventId);
  const deleteEventMatch = useDeleteEventMatch(matchId, match?.ryderCupEventId);
  const replicateEventMatch = useReplicateEventMatchToSiblings(matchId, match?.ryderCupEventId);
  const createPress = useCreatePress(matchId);
  const updateAutoPress = useUpdateAutoPress(matchId);
  const updateNetScoring = useUpdateNetScoring(matchId);
  const updateUnitAmount = useUpdateUnitAmount(matchId);
  const updateMatchType = useUpdateMatchType(matchId);
  const updateHandicapped = useUpdateHandicapped(matchId);
  const [editingUnitAmountId, setEditingUnitAmountId] = useState<number | null>(null);
  const [editUnitAmountValue, setEditUnitAmountValue] = useState("");
  const [editingMatchTypeId, setEditingMatchTypeId] = useState<number | null>(null);
  const updateMatchDetails = useUpdateMatchDetails(matchId);
  const { data: playerHandicaps } = usePlayerHandicaps();
  const { data: fullPlayerData = [] } = useFullPlayerData();
  const upsertPlayerHandicap = useUpsertPlayerHandicap();
  
  const { data: groupPlayerNames } = useQuery<string[]>({
    queryKey: ['/api/groups', match?.groupId, 'player-names'],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${match!.groupId}/players`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((gp: any) => gp.presetPlayer?.name).filter(Boolean) as string[];
    },
    enabled: !!match?.groupId,
  });
  const updatePlayerMatchHandicap = useUpdatePlayerMatchHandicap(matchId);
  const updatePlayerTee = useUpdatePlayerTee(matchId);
  
  // Get course tees for the match's course
  const matchCourseId = coursesList?.find(c => c.name === match?.courseName)?.id;
  const { data: courseTees } = useCourseTees(matchCourseId);
  
  // For Ryder Cup side matches, fetch the pairing player data (authoritative source for handicaps)
  const { data: ryderCupSideMatchData } = useQuery<{
    ryderCupPlayerDataByDay?: Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>>;
    startOnBack9ByDay?: Record<number, boolean>;
  }>({
    queryKey: ["/api/ryder-cup", match?.ryderCupEventId, "side-match-ledger"],
    enabled: !!match?.ryderCupEventId,
  });
  
  // Get Ryder Cup pairing player data for this day (if this is a side match)
  const ryderCupPlayerData = match?.ryderCupEventId && match?.ryderCupDayNumber
    ? ryderCupSideMatchData?.ryderCupPlayerDataByDay?.[match.ryderCupDayNumber]
    : undefined;
  
  // Get the day's startOnBack9 setting (if this is a Ryder Cup side match)
  const dayStartOnBack9 = match?.ryderCupEventId && match?.ryderCupDayNumber
    ? ryderCupSideMatchData?.startOnBack9ByDay?.[match.ryderCupDayNumber] ?? false
    : false;
  
  // Get match-specific player handicap overrides
  const { data: matchHandicapOverrides } = useMatchPlayerHandicaps(matchId);
  const upsertMatchHandicap = useUpsertMatchPlayerHandicap(matchId);
  
  // Get user's role for this match
  const { data: myRole } = useMyMatchRole(matchId);
  const { data: matchRoles } = useMatchRoles(matchId);
  const upsertMatchRole = useUpsertMatchRole(matchId);
  const deleteMatchRole = useDeleteMatchRole(matchId);
  
  // Fetch user's match type frequency for sorting the selector
  const { data: matchTypeFrequency } = useQuery<Record<string, number>>({
    queryKey: ["/api/users/match-type-frequency"],
  });

  const sortedMatchOptions = (() => {
    if (!matchTypeFrequency) return ALL_MATCH_OPTIONS;
    const indexed = ALL_MATCH_OPTIONS.map((opt, i) => ({ ...opt, originalIndex: i }));
    return indexed.sort((a, b) => {
      const freqA = matchTypeFrequency[a.value] || 0;
      const freqB = matchTypeFrequency[b.value] || 0;
      if (freqB !== freqA) return freqB - freqA;
      return a.originalIndex - b.originalIndex;
    });
  })();

  useEffect(() => {
    if (matchTypeFrequency && !showCreateMatch) {
      const topOption = sortedMatchOptions[0];
      if (topOption) {
        setSelectedMatchType(topOption.value as MatchType);
      }
    }
  }, [matchTypeFrequency]);

  // Copy bets from another event
  const copyBetsFromEvent = useCopyBetsFromEvent(matchId);
  const { data: allMatches } = useMatches();
  const [showCopyBetsDialog, setShowCopyBetsDialog] = useState(false);
  const [selectedSourceEventId, setSelectedSourceEventId] = useState<number | null>(null);
  
  const [newPlayerName, setNewPlayerName] = useState("");
  const [editingHandicap, setEditingHandicap] = useState<string | null>(null);
  const [handicapEditValue, setHandicapEditValue] = useState("");
  const [editingPlayerHandicap, setEditingPlayerHandicap] = useState<number | null>(null);
  const [playerHandicapEditValue, setPlayerHandicapEditValue] = useState("");
  const [editingMatchCourseHcp, setEditingMatchCourseHcp] = useState<{eventMatchId: number; playerId: number} | null>(null);
  const [matchCourseHcpEditValue, setMatchCourseHcpEditValue] = useState("");
  const [pressDialogMatch, setPressDialogMatch] = useState<number | null>(null);
  const [pressStartHole, setPressStartHole] = useState<number>(2);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRoleManagement, setShowRoleManagement] = useState(false);
  const [newRoleUserId, setNewRoleUserId] = useState("");
  const [newRoleType, setNewRoleType] = useState<'organizer' | 'viewer'>('organizer');
  const [editingCell, setEditingCell] = useState<{ playerId: number; hole: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  // Event Match creation state
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [selectedMatchType, setSelectedMatchType] = useState<MatchType>(
    (ALL_MATCH_OPTIONS[0]?.value as MatchType) || MATCH_TYPES.NASSAU
  );
  const [unitAmount, setUnitAmount] = useState<number>(20);
  const [teamAPlayerIds, setTeamAPlayerIds] = useState<number[]>([]);
  const [teamBPlayerIds, setTeamBPlayerIds] = useState<number[]>([]);
  const [keyedTeamAIds, setKeyedTeamAIds] = useState<number[]>([]);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [autoPressOriginal, setAutoPressOriginal] = useState(true);
  const [addPlayerCollapsed, setAddPlayerCollapsed] = useState(true);
  const [matchesCollapsed, setMatchesCollapsed] = useState(false);
  const [ledgerCollapsed, setLedgerCollapsed] = useState(false);
  const bettingLedgerRef = useRef<HTMLDivElement | null>(null);
  
  // Round Robin wizard state (two groups)
  const [isRoundRobinMode, setIsRoundRobinMode] = useState(false);
  const [roundRobinMatchType, setRoundRobinMatchType] = useState<MatchType>(MATCH_TYPES.MATCH_PLAY_1_BALL);
  const [roundRobinGroupAIds, setRoundRobinGroupAIds] = useState<number[]>([]);
  const [roundRobinGroupBIds, setRoundRobinGroupBIds] = useState<number[]>([]);
  const [roundRobinKeyedAIds, setRoundRobinKeyedAIds] = useState<number[]>([]);
  const [roundRobinKeyedBIds, setRoundRobinKeyedBIds] = useState<number[]>([]);
  const [roundRobinStep, setRoundRobinStep] = useState<'select' | 'preview'>('select');
  const [isCreatingRoundRobin, setIsCreatingRoundRobin] = useState(false);
  
  // Skins match state
  const [skinsPlayerIds, setSkinsPlayerIds] = useState<number[]>([]);
  
  // 5-5-5-3 match state
  const [fiveTeamCount, setFiveTeamCount] = useState<number>(2);
  const [fiveTeams, setFiveTeams] = useState<{name: string; playerIds: number[]}[]>([
    { name: "Team 1", playerIds: [] },
    { name: "Team 2", playerIds: [] },
  ]);
  
  // Death Match state
  const [deathMatchBaseBet, setDeathMatchBaseBet] = useState<number>(50);
  const [deathMatchBestBallBet, setDeathMatchBestBallBet] = useState<number>(50);
  const [deathMatchSecondBallBet, setDeathMatchSecondBallBet] = useState<number>(25);
  const [deathMatchFirstPressBet, setDeathMatchFirstPressBet] = useState<number>(25);
  const [deathMatchSubsequentPressBet, setDeathMatchSubsequentPressBet] = useState<number>(15);
  const [deathMatchSecondBallPressBet, setDeathMatchSecondBallPressBet] = useState<number>(15);

  // 2 Ball / 3 Ball state
  const [twoBallBet, setTwoBallBet] = useState<number>(20);
  const [threeBallBet, setThreeBallBet] = useState<number>(20);
  const [autoPressTwoBallFront9, setAutoPressTwoBallFront9] = useState<boolean>(true);
  const [autoPressTwoBallBack9, setAutoPressTwoBallBack9] = useState<boolean>(true);
  const [autoPressTwoBallOverall, setAutoPressTwoBallOverall] = useState<boolean>(true);
  const [autoPressThreeBallFront9, setAutoPressThreeBallFront9] = useState<boolean>(true);
  const [autoPressThreeBallBack9, setAutoPressThreeBallBack9] = useState<boolean>(true);
  const [autoPressThreeBallOverall, setAutoPressThreeBallOverall] = useState<boolean>(true);
  
  // Net scoring state (for handicapped events) - defaults to true when match is handicapped
  const [useNetScoring, setUseNetScoring] = useState(false);
  const [useNetScoringInitialized, setUseNetScoringInitialized] = useState(false);

  // Voice match creation state
  const [isVoiceProcessing, setIsVoiceProcessing] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceParsedSummary, setVoiceParsedSummary] = useState<string | null>(null);
  const [voiceUnmatched, setVoiceUnmatched] = useState<string[]>([]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceStrokeOverrides, setVoiceStrokeOverrides] = useState<Record<number, number>>({});
  const voiceStrokeOverridesRef = useRef<Record<number, number>>({});
  
  // Match filter state
  const [filterByPlayer, setFilterByPlayer] = useState<string>("all");
  const [filterByMatchType, setFilterByMatchType] = useState<string>("all");
  
  // Header editing state
  const [editingName, setEditingName] = useState(false);
  const [editingCourse, setEditingCourse] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [headerNameValue, setHeaderNameValue] = useState("");
  const [headerDateValue, setHeaderDateValue] = useState("");
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  
  // Selected player in standings (for filtering Match Results)
  const [selectedStandingsPlayer, setSelectedStandingsPlayer] = useState<number | null>(null);

  // Focus input when editing cell changes
  useEffect(() => {
    if (editingCell) {
      const key = `${editingCell.playerId}-${editingCell.hole}`;
      const input = inputRefs.current[key];
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [editingCell]);

  // Initialize useNetScoring to true when match is handicapped (only once)
  useEffect(() => {
    if (!useNetScoringInitialized && match?.isHandicapped) {
      setUseNetScoring(true);
      setUseNetScoringInitialized(true);
    }
  }, [match?.isHandicapped, useNetScoringInitialized]);

  // Voice match creation hooks — MUST be before early returns to keep hook call count stable
  const roundUpToFive = useCallback((amount: number): number => {
    return Math.ceil(amount / 5) * 5;
  }, []);

  const updateDeathMatchDefaults = useCallback((baseBet: number) => {
    setDeathMatchBaseBet(baseBet);
    setDeathMatchBestBallBet(baseBet);
    setDeathMatchSecondBallBet(Math.round(baseBet / 2));
    setDeathMatchFirstPressBet(roundUpToFive(baseBet / 2));
    setDeathMatchSubsequentPressBet(roundUpToFive(baseBet / 4));
    setDeathMatchSecondBallPressBet(roundUpToFive(baseBet / 4));
  }, [roundUpToFive]);

  const applyVoiceMatchResult = useCallback((result: any) => {
    const {
      matchType, isRoundRobin, roundRobinSubtype,
      teamAPlayerIds: tA, teamBPlayerIds: tB,
      keyedPlayerIds, skinsPlayerIds,
      unitAmount: ua, deathMatchBaseBet: dmBase,
      twoBallBet: tbb, threeBallBet: trb,
      useNet, parsedSummary, unmatchedNames,
      strokeAllocations,
    } = result;

    const strokeMap: Record<number, number> = {};
    if (strokeAllocations && strokeAllocations.length > 0) {
      for (const { playerId, strokes } of strokeAllocations) {
        strokeMap[playerId] = strokes;
      }
    }
    voiceStrokeOverridesRef.current = strokeMap;
    setVoiceStrokeOverrides(strokeMap);

    setShowCreateMatch(true);
    setVoiceParsedSummary(parsedSummary || "Match parsed successfully");
    setVoiceUnmatched(unmatchedNames || []);

    if (isRoundRobin) {
      setIsRoundRobinMode(true);
      setRoundRobinStep('select');
      setRoundRobinGroupAIds(tA || []);
      setRoundRobinGroupBIds(tB || []);
      setRoundRobinKeyedAIds(keyedPlayerIds || []);
      setRoundRobinKeyedBIds([]);
      const subtype = roundRobinSubtype === 'nassau' ? MATCH_TYPES.NASSAU : MATCH_TYPES.MATCH_PLAY_1_BALL;
      setRoundRobinMatchType(subtype as MatchType);
      if (ua != null) setUnitAmount(ua);
    } else if (matchType === 'skins') {
      setSelectedMatchType(MATCH_TYPES.SKINS);
      setIsRoundRobinMode(false);
      setSkinsPlayerIds(skinsPlayerIds || tA || []);
      if (ua != null) setUnitAmount(ua);
    } else if (matchType === 'five_five_five_three') {
      setSelectedMatchType(MATCH_TYPES.FIVE_FIVE_FIVE_THREE);
      setIsRoundRobinMode(false);
      if (ua != null) setUnitAmount(ua);
    } else if (matchType === 'death_match') {
      setSelectedMatchType(MATCH_TYPES.DEATH_MATCH);
      setIsRoundRobinMode(false);
      setTeamAPlayerIds(tA || []);
      setTeamBPlayerIds(tB || []);
      const base = dmBase ?? 50;
      updateDeathMatchDefaults(base);
    } else if (matchType === 'two_three_ball') {
      setSelectedMatchType(MATCH_TYPES.TWO_THREE_BALL);
      setIsRoundRobinMode(false);
      setTeamAPlayerIds(tA || []);
      setTeamBPlayerIds(tB || []);
      const fallback = ua ?? 20;
      setTwoBallBet(tbb ?? fallback);
      setThreeBallBet(trb ?? fallback);
      setAutoPressTwoBallFront9(true);
      setAutoPressTwoBallBack9(true);
      setAutoPressTwoBallOverall(true);
      setAutoPressThreeBallFront9(true);
      setAutoPressThreeBallBack9(true);
      setAutoPressThreeBallOverall(true);
    } else {
      setSelectedMatchType((matchType || MATCH_TYPES.NASSAU) as MatchType);
      setIsRoundRobinMode(false);
      setTeamAPlayerIds(tA || []);
      setTeamBPlayerIds(tB || []);
      setKeyedTeamAIds(keyedPlayerIds || []);
      if (ua != null) setUnitAmount(ua);
    }

    if (useNet != null && match?.isHandicapped) {
      setUseNetScoring(useNet);
    }
  }, [match?.isHandicapped, updateDeathMatchDefaults]);

  const handleVoiceTranscriptComplete = useCallback(async (transcript: string) => {
    if (!transcript.trim() || isVoiceProcessing) return;
    setIsVoiceProcessing(true);
    setVoiceError(null);
    setVoiceParsedSummary(null);
    try {
      const playerList = (match?.players || []).map((p: Player) => ({ id: p.id, name: p.name }));
      const res = await apiRequest("POST", "/api/ai/parse-match-voice", {
        transcript,
        players: playerList,
      });
      const data = await res.json();
      if (data.success) {
        applyVoiceMatchResult(data);
      } else {
        setVoiceError(data.message || "Could not understand the match description");
      }
    } catch (err: any) {
      setVoiceError(err.message || "Failed to process voice input");
    } finally {
      setIsVoiceProcessing(false);
    }
  }, [match?.players, isVoiceProcessing, applyVoiceMatchResult]);

  const { isListening, isSupported: voiceSupported, toggleListening, stopListening, transcript: liveTranscript } = useVoiceInput({
    continuous: false,
    onCommand: (cmd) => {
      if (cmd.rawTranscript) {
        setVoiceTranscript(cmd.rawTranscript);
        handleVoiceTranscriptComplete(cmd.rawTranscript);
      }
    },
  });

  const applyStrokesToEventMatch = useCallback((createdEventMatch: any) => {
    const overrides = voiceStrokeOverridesRef.current;
    if (!createdEventMatch || Object.keys(overrides).length === 0) return;

    const allPlayerIds: number[] = [];
    for (const team of (createdEventMatch.teams || [])) {
      for (const member of (team.members || [])) {
        if (member.playerId != null && !allPlayerIds.includes(member.playerId)) {
          allPlayerIds.push(member.playerId);
        }
      }
    }

    for (const pid of allPlayerIds) {
      upsertMatchHandicap.mutate({
        eventMatchId: createdEventMatch.id,
        playerId: pid,
        courseHandicap: overrides[pid] ?? 0,
      });
    }

    voiceStrokeOverridesRef.current = {};
    setVoiceStrokeOverrides({});
  }, [upsertMatchHandicap]);

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading event details...</div>;
  if (error || !match) return <div className="p-12 text-center text-destructive">Event not found</div>;

  const players: Player[] = match.players || [];
  const scores: Score[] = match.scores || [];
  const eventMatches: EventMatch[] = match.eventMatches || [];
  const ADMIN_USER_ID = "52861828";
  const isAdmin = user?.id === ADMIN_USER_ID;
  const isCreator = user?.id === match.creatorId || isAdmin; // Only creator/admin can delete, add players, manage settings
  const isOrganizer = myRole === 'organizer';
  const isViewer = myRole === 'viewer';
  const canEditScoresAndBets = isCreator || isOrganizer; // Organizers can edit scores/bets
  const isPlayer = players.some((p: Player) => p.userId === user?.id);
  const currentPlayer = players.find((p: Player) => p.userId === user?.id);
  
  // Daily match containers (e.g., "Day 1 Side Match") should have limited editing - no add player, no manage access, read-only header
  const isDailyMatchContainer = !!(match?.ryderCupEventId && match?.name?.includes("Side Match"));
  
  // Find course par data for this match
  const matchCourse = coursesList?.find(c => c.name === match.courseName);
  const getHolePar = (hole: number) => matchCourse?.holes.find(h => h.holeNumber === hole)?.par ?? 4;

  // Build net scoring context for handicapped matches
  const buildMatchNetContext = (eventMatch: EventMatch): NetScoringContext | null => {
    if (!eventMatch.useNetScoring || !matchCourse || !courseTees) {
      return null;
    }
    
    // Check if course has hole handicaps configured
    const hasHoleHandicaps = matchCourse.holes.some(h => h.handicap !== null);
    if (!hasHoleHandicaps) {
      return null; // Can't calculate net scores without hole handicaps
    }
    
    // Get all players involved in this match
    const matchPlayerIds = new Set<number>();
    for (const team of eventMatch.teams) {
      for (const member of team.members) {
        matchPlayerIds.add(member.playerId);
      }
    }
    
    // Build player handicap info from players in the match
    // For Ryder Cup side matches, use the pairing data as the authoritative source
    const playerHandicapInfo: PlayerHandicapInfo[] = players
      .filter(p => matchPlayerIds.has(p.id))
      .map(p => {
        // Check if we have Ryder Cup pairing data for this player (by name)
        const pairingData = ryderCupPlayerData?.[p.name];
        return {
          playerId: p.id,
          playerName: p.name,
          // Use pairing data if available, otherwise fall back to player data
          handicapIndex: pairingData?.handicapIndex ?? p.handicapIndex,
          teeId: pairingData?.teeId ?? p.teeId,
        };
      });
    
    const overridesForMatch = matchHandicapOverrides?.get(eventMatch.id) || [];
    
    const courseHandicapOverrides: CourseHandicapOverride[] = overridesForMatch.map(o => ({
      playerId: o.playerId,
      courseHandicap: o.courseHandicap,
    }));
    
    return buildNetScoringContext(
      playerHandicapInfo,
      courseTees,
      matchCourse.holes,
      courseHandicapOverrides
    );
  };

  // Build match-level net context for scorecard stroke indicators
  const scorecardNetContext: NetScoringContext | null = (() => {
    if (!match?.isHandicapped || !matchCourse || !courseTees) {
      return null;
    }
    
    const hasHoleHandicaps = matchCourse.holes.some(h => h.handicap !== null);
    if (!hasHoleHandicaps) {
      return null;
    }
    
    // For Ryder Cup side matches, use pairing data as authoritative source
    const playerHandicapInfo: PlayerHandicapInfo[] = players.map(p => {
      const pairingData = ryderCupPlayerData?.[p.name];
      return {
        playerId: p.id,
        playerName: p.name,
        handicapIndex: pairingData?.handicapIndex ?? p.handicapIndex,
        teeId: pairingData?.teeId ?? p.teeId,
      };
    });
    
    return buildNetScoringContext(playerHandicapInfo, courseTees, matchCourse.holes);
  })();
  
  // Get strokes received for a player on a specific hole
  const getPlayerStrokesForHole = (playerId: number, holeNumber: number): number => {
    if (!scorecardNetContext) return 0;
    const relativeHandicap = scorecardNetContext.playerHandicaps.get(playerId) ?? 0;
    const holeHandicapRank = scorecardNetContext.holeHandicaps.get(holeNumber) ?? 18;
    return getStrokesForHole(relativeHandicap, holeHandicapRank);
  };

  const getPlayerScore = (playerId: number) => {
    return scores.filter((s: Score) => s.playerId === playerId).reduce((acc, curr) => acc + curr.strokes, 0) || 0;
  };

  const getTeamNameFromPlayerIds = (playerIds: number[]) => {
    return playerIds
      .map(id => players.find(p => p.id === id)?.name || '')
      .filter(Boolean)
      .join('/');
  };

  // Generate canonical signature for duplicate detection
  // Format: "matchType|netScoring|sortedTeamAIds|sortedTeamBIds" (teams sorted so A < B)
  // Includes useNetScoring so gross and net matches with same players are allowed
  const getMatchSignature = (matchType: string, teamAIds: number[], teamBIds: number[], isNetScoring: boolean): string => {
    const sortedA = [...teamAIds].sort((a, b) => a - b).join(',');
    const sortedB = [...teamBIds].sort((a, b) => a - b).join(',');
    // Sort teams alphabetically so A vs B and B vs A are the same
    const teams = [sortedA, sortedB].sort();
    return `${matchType}|${isNetScoring ? 'net' : 'gross'}|${teams[0]}|${teams[1]}`;
  };

  // Check if a match with the same players, type, and scoring mode already exists
  const findDuplicateMatch = (matchType: string, teamAIds: number[], teamBIds: number[], isNetScoring: boolean): EventMatch | null => {
    const signature = getMatchSignature(matchType, teamAIds, teamBIds, isNetScoring);
    for (const em of eventMatches) {
      if (em.parentMatchId) continue; // Skip press matches
      const existingTeamAIds = em.teams[0]?.members.map(m => m.playerId) || [];
      const existingTeamBIds = em.teams[1]?.members.map(m => m.playerId) || [];
      const existingSignature = getMatchSignature(em.matchType, existingTeamAIds, existingTeamBIds, em.useNetScoring ?? false);
      if (signature === existingSignature) {
        return em;
      }
    }
    return null;
  };

  // Find all duplicates for a set of proposed matches (for keyed/round robin)
  const findDuplicateMatches = (proposedMatches: { matchType: string; teamAIds: number[]; teamBIds: number[]; isNetScoring: boolean }[]): { proposed: typeof proposedMatches[0]; existing: EventMatch }[] => {
    const duplicates: { proposed: typeof proposedMatches[0]; existing: EventMatch }[] = [];
    for (const proposed of proposedMatches) {
      const existing = findDuplicateMatch(proposed.matchType, proposed.teamAIds, proposed.teamBIds, proposed.isNetScoring);
      if (existing) {
        duplicates.push({ proposed, existing });
      }
    }
    return duplicates;
  };

  const handleCreateEventMatch = async () => {
    if (teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) return;
    
    const isMatchPlay = selectedMatchType === MATCH_TYPES.MATCH_PLAY_1_BALL || selectedMatchType === MATCH_TYPES.MATCH_PLAY_2_BALL;
    const isNassau = selectedMatchType === MATCH_TYPES.NASSAU;
    
    // If keyed players exist, create individual matches for each keyed player vs each Team B player
    const currentNetScoring = match.isHandicapped ? useNetScoring : false;
    
    if (keyedTeamAIds.length > 0) {
      // Build list of proposed matches for duplicate checking
      const proposedMatches: { matchType: string; teamAIds: number[]; teamBIds: number[]; isNetScoring: boolean }[] = [];
      for (const keyedPlayerId of keyedTeamAIds) {
        for (const opponentId of teamBPlayerIds) {
          proposedMatches.push({
            matchType: selectedMatchType,
            teamAIds: [keyedPlayerId],
            teamBIds: [opponentId],
            isNetScoring: currentNetScoring,
          });
        }
      }
      
      // Check for duplicates
      const duplicates = findDuplicateMatches(proposedMatches);
      if (duplicates.length > 0) {
        const dupNames = duplicates.map(d => d.existing.name).join(', ');
        toast({
          title: "Duplicate matches found",
          description: `${duplicates.length} match(es) already exist: ${dupNames}. Skipping duplicates.`,
          variant: "destructive",
        });
      }
      
      // Filter out duplicates
      const matchesToCreate = proposedMatches.filter(pm => 
        !findDuplicateMatch(pm.matchType, pm.teamAIds, pm.teamBIds, pm.isNetScoring)
      );
      
      if (matchesToCreate.length === 0) {
        toast({
          title: "No new matches to create",
          description: "All proposed matches already exist.",
        });
        return;
      }
      
      try {
        for (const pm of matchesToCreate) {
          const keyedPlayerName = players.find(p => p.id === pm.teamAIds[0])?.name || '';
          const opponentName = players.find(p => p.id === pm.teamBIds[0])?.name || '';
          const matchName = `${keyedPlayerName} vs ${opponentName}`;
          
          await new Promise<void>((resolve, reject) => {
            createEventMatch.mutate({
              name: matchName,
              matchType: selectedMatchType,
              unitAmount: unitAmount * 100,
              teamA: { name: keyedPlayerName, playerIds: pm.teamAIds },
              teamB: { name: opponentName, playerIds: pm.teamBIds },
              autoPressOriginal: (isMatchPlay || isNassau) ? autoPressOriginal : false,
              autoPressAllPresses: false,
              autoPressNassauFront9: isNassau ? autoPressOriginal : true,
              autoPressNassauBack9: isNassau ? autoPressOriginal : true,
              autoPressNassauOverall: isNassau ? autoPressOriginal : true,
              useNetScoring: match.isHandicapped ? useNetScoring : false,
              startOnBack9: dayStartOnBack9,
            }, {
              onSuccess: (created) => { applyStrokesToEventMatch(created); resolve(); },
              onError: (err) => reject(err),
            });
          });
        }
        
        toast({
          title: "Matches created",
          description: `Created ${matchesToCreate.length} new match(es).`,
        });
        
        // Reset state after all matches created
        setShowCreateMatch(false);
        setIsRoundRobinMode(false);
        setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
        setUnitAmount(20);
        setTeamAPlayerIds([]);
        setTeamBPlayerIds([]);
        setKeyedTeamAIds([]);
        setAutoPressOriginal(true);
        setUseNetScoring(match.isHandicapped ?? false);
      } catch (error) {
        console.error('Error creating keyed matches:', error);
      }
      return;
    }
    
    // Normal single match creation (no keyed players)
    // Check for duplicate (including scoring mode)
    const existingMatch = findDuplicateMatch(selectedMatchType, teamAPlayerIds, teamBPlayerIds, currentNetScoring);
    if (existingMatch) {
      toast({
        title: "Duplicate match",
        description: `A match with these players already exists: ${existingMatch.name}`,
        variant: "destructive",
      });
      return;
    }
    
    const autoTeamAName = getTeamNameFromPlayerIds(teamAPlayerIds);
    const autoTeamBName = getTeamNameFromPlayerIds(teamBPlayerIds);
    const autoMatchName = `${autoTeamAName} vs ${autoTeamBName}`;
    
    createEventMatch.mutate({
      name: autoMatchName,
      matchType: selectedMatchType,
      unitAmount: unitAmount * 100,
      teamA: { name: autoTeamAName, playerIds: teamAPlayerIds },
      teamB: { name: autoTeamBName, playerIds: teamBPlayerIds },
      autoPressOriginal: (isMatchPlay || isNassau) ? autoPressOriginal : false,
      autoPressAllPresses: false,
      autoPressNassauFront9: isNassau ? autoPressOriginal : true,
      autoPressNassauBack9: isNassau ? autoPressOriginal : true,
      autoPressNassauOverall: isNassau ? autoPressOriginal : true,
      useNetScoring: match.isHandicapped ? useNetScoring : false,
      startOnBack9: dayStartOnBack9,
    }, {
      onSuccess: (created) => {
        applyStrokesToEventMatch(created);
        setShowCreateMatch(false);
        setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
        setUnitAmount(20);
        setTeamAPlayerIds([]);
        setTeamBPlayerIds([]);
        setKeyedTeamAIds([]);
        setAutoPressOriginal(true);
        setUseNetScoring(match.isHandicapped ?? false);
      }
    });
  };

  const togglePlayerInTeam = (playerId: number, team: 'A' | 'B') => {
    if (team === 'A') {
      if (teamAPlayerIds.includes(playerId)) {
        setTeamAPlayerIds(teamAPlayerIds.filter(id => id !== playerId));
        // Also remove from keyed if removed from team
        setKeyedTeamAIds(keyedTeamAIds.filter(id => id !== playerId));
      } else {
        setTeamAPlayerIds([...teamAPlayerIds, playerId]);
        setTeamBPlayerIds(teamBPlayerIds.filter(id => id !== playerId));
      }
    } else {
      if (teamBPlayerIds.includes(playerId)) {
        setTeamBPlayerIds(teamBPlayerIds.filter(id => id !== playerId));
      } else {
        setTeamBPlayerIds([...teamBPlayerIds, playerId]);
        setTeamAPlayerIds(teamAPlayerIds.filter(id => id !== playerId));
        // Also remove from keyed if moved to team B
        setKeyedTeamAIds(keyedTeamAIds.filter(id => id !== playerId));
      }
    }
  };

  const toggleKeyedTeamA = (playerId: number) => {
    if (keyedTeamAIds.includes(playerId)) {
      setKeyedTeamAIds(keyedTeamAIds.filter(id => id !== playerId));
    } else {
      setKeyedTeamAIds([...keyedTeamAIds, playerId]);
    }
  };

  const toggleSkinsPlayer = (playerId: number) => {
    if (skinsPlayerIds.includes(playerId)) {
      setSkinsPlayerIds(skinsPlayerIds.filter(id => id !== playerId));
    } else {
      setSkinsPlayerIds([...skinsPlayerIds, playerId]);
    }
  };

  const handleCreateSkinsMatch = () => {
    if (skinsPlayerIds.length < 2) return;
    
    const playerNames = skinsPlayerIds.map(id => players.find(p => p.id === id)?.name || '').join(', ');
    const matchName = `Skins: ${playerNames}`;
    
    createEventMatch.mutate({
      name: matchName,
      matchType: MATCH_TYPES.SKINS,
      unitAmount: unitAmount * 100,
      teamA: { name: 'Skins Players', playerIds: skinsPlayerIds },
      teamB: { name: 'Skins Players', playerIds: skinsPlayerIds },
      autoPressOriginal: false,
      autoPressAllPresses: false,
      autoPressNassauFront9: true,
      autoPressNassauBack9: true,
      autoPressNassauOverall: true,
      useNetScoring: match.isHandicapped ? useNetScoring : false,
      startOnBack9: dayStartOnBack9,
    }, {
      onSuccess: (created) => {
        applyStrokesToEventMatch(created);
        setShowCreateMatch(false);
        setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
        setUnitAmount(20);
        setSkinsPlayerIds([]);
        setUseNetScoring(match.isHandicapped ?? false);
      }
    });
  };

  // Helper to update team count for 5-5-5-3
  const updateFiveTeamCount = (count: number) => {
    setFiveTeamCount(count);
    const newTeams: {name: string; playerIds: number[]}[] = [];
    for (let i = 0; i < count; i++) {
      if (fiveTeams[i]) {
        newTeams.push(fiveTeams[i]);
      } else {
        newTeams.push({ name: `Team ${i + 1}`, playerIds: [] });
      }
    }
    setFiveTeams(newTeams);
  };

  // Toggle player in a 5-5-5-3 team
  const toggleFiveTeamPlayer = (teamIndex: number, playerId: number) => {
    setFiveTeams(prevTeams => {
      const newTeams = [...prevTeams];
      const currentTeam = { ...newTeams[teamIndex] };
      
      // Check if player is in any other team and remove them
      newTeams.forEach((team, idx) => {
        if (team.playerIds.includes(playerId)) {
          newTeams[idx] = { ...team, playerIds: team.playerIds.filter(id => id !== playerId) };
        }
      });
      
      // Add player to this team if they weren't already in it
      if (!currentTeam.playerIds.includes(playerId)) {
        newTeams[teamIndex] = { ...newTeams[teamIndex], playerIds: [...newTeams[teamIndex].playerIds, playerId] };
      }
      
      return newTeams;
    });
  };

  // Create 5-5-5-3 match
  const handleCreateFiveMatch = () => {
    // Validate all teams have at least 1 player
    if (fiveTeams.some(t => t.playerIds.length === 0)) return;
    if (fiveTeams.length < 2) return;
    
    const teamNames = fiveTeams.map(t => {
      const names = t.playerIds.map(id => players.find(p => p.id === id)?.name || '').join('/');
      return names;
    });
    const matchName = `5-5-5-3: ${teamNames.join(' vs ')}`;
    
    createEventMatch.mutate({
      name: matchName,
      matchType: MATCH_TYPES.FIVE_FIVE_FIVE_THREE,
      unitAmount: unitAmount * 100,
      teamA: fiveTeams[0] ? { name: teamNames[0], playerIds: fiveTeams[0].playerIds } : { name: 'Team 1', playerIds: [] },
      teamB: fiveTeams[1] ? { name: teamNames[1], playerIds: fiveTeams[1].playerIds } : { name: 'Team 2', playerIds: [] },
      teams: fiveTeams.map((t, i) => ({ name: teamNames[i], playerIds: t.playerIds })),
      autoPressOriginal: false,
      autoPressAllPresses: false,
      autoPressNassauFront9: false,
      autoPressNassauBack9: false,
      autoPressNassauOverall: false,
      useNetScoring: match.isHandicapped ? useNetScoring : false,
      startOnBack9: dayStartOnBack9,
    }, {
      onSuccess: (created) => {
        applyStrokesToEventMatch(created);
        setShowCreateMatch(false);
        setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
        setUnitAmount(1);
        setFiveTeamCount(2);
        setFiveTeams([{ name: "Team 1", playerIds: [] }, { name: "Team 2", playerIds: [] }]);
        setUseNetScoring(match.isHandicapped ?? false);
      }
    });
  };

  const handleCreateDeathMatch = () => {
    if (teamAPlayerIds.length !== 2 || teamBPlayerIds.length !== 2) return;
    
    const autoTeamAName = getTeamNameFromPlayerIds(teamAPlayerIds);
    const autoTeamBName = getTeamNameFromPlayerIds(teamBPlayerIds);
    const autoMatchName = `Death Match: ${autoTeamAName} vs ${autoTeamBName}`;
    
    createEventMatch.mutate({
      name: autoMatchName,
      matchType: MATCH_TYPES.DEATH_MATCH,
      unitAmount: deathMatchBaseBet * 100,
      teamA: { name: autoTeamAName, playerIds: teamAPlayerIds },
      teamB: { name: autoTeamBName, playerIds: teamBPlayerIds },
      autoPressOriginal: false,
      autoPressAllPresses: false,
      autoPressNassauFront9: false,
      autoPressNassauBack9: false,
      autoPressNassauOverall: false,
      useNetScoring: match.isHandicapped ? useNetScoring : false,
      startOnBack9: dayStartOnBack9,
      deathMatchBaseBet: deathMatchBaseBet * 100,
      deathMatchBestBallBet: deathMatchBestBallBet * 100,
      deathMatchSecondBallBet: deathMatchSecondBallBet * 100,
      deathMatchFirstPressBet: deathMatchFirstPressBet * 100,
      deathMatchSubsequentPressBet: deathMatchSubsequentPressBet * 100,
      deathMatchSecondBallPressBet: deathMatchSecondBallPressBet * 100,
    }, {
      onSuccess: (created) => {
        applyStrokesToEventMatch(created);
        setShowCreateMatch(false);
        setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
        setUnitAmount(20);
        setTeamAPlayerIds([]);
        setTeamBPlayerIds([]);
        setDeathMatchBaseBet(50);
        setUseNetScoring(match.isHandicapped ?? false);
      }
    });
  };

  const handleCreateTwoThreeBall = () => {
    if (teamAPlayerIds.length < 3 || teamBPlayerIds.length < 3) return;

    const autoTeamAName = getTeamNameFromPlayerIds(teamAPlayerIds);
    const autoTeamBName = getTeamNameFromPlayerIds(teamBPlayerIds);
    const autoMatchName = `2 Ball / 3 Ball: ${autoTeamAName} vs ${autoTeamBName}`;

    createEventMatch.mutate({
      name: autoMatchName,
      matchType: MATCH_TYPES.TWO_THREE_BALL,
      unitAmount: twoBallBet * 100, // legacy field — primary value pair lives in dedicated columns
      teamA: { name: autoTeamAName, playerIds: teamAPlayerIds },
      teamB: { name: autoTeamBName, playerIds: teamBPlayerIds },
      autoPressOriginal: false,
      autoPressAllPresses: false,
      autoPressNassauFront9: false,
      autoPressNassauBack9: false,
      autoPressNassauOverall: false,
      useNetScoring: match.isHandicapped ? useNetScoring : false,
      startOnBack9: dayStartOnBack9,
      twoThreeBallTwoBallBet: twoBallBet * 100,
      twoThreeBallThreeBallBet: threeBallBet * 100,
      autoPressTwoBallFront9,
      autoPressTwoBallBack9,
      autoPressTwoBallOverall,
      autoPressThreeBallFront9,
      autoPressThreeBallBack9,
      autoPressThreeBallOverall,
      isRoundRobinGenerated: false,
    }, {
      onSuccess: (created) => {
        applyStrokesToEventMatch(created);
        setShowCreateMatch(false);
        setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
        setUnitAmount(20);
        setTeamAPlayerIds([]);
        setTeamBPlayerIds([]);
        setUseNetScoring(match.isHandicapped ?? false);
      }
    });
  };

  // Generate all 2-player combinations from selected players
  // If keyedIds is provided and non-empty, only generate teams that include at least one keyed player
  const generateTwoPlayerTeams = (playerIds: number[], keyedIds: number[] = []): [number, number][] => {
    const teams: [number, number][] = [];
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        teams.push([playerIds[i], playerIds[j]]);
      }
    }
    // If there are keyed players, filter to only teams containing at least one keyed player
    if (keyedIds.length > 0) {
      return teams.filter(team => keyedIds.includes(team[0]) || keyedIds.includes(team[1]));
    }
    return teams;
  };

  // Generate cross-product matches between Group A teams and Group B teams
  // Uses keyed player arrays to filter teams if keyed players are selected
  const generateRoundRobinMatches = (groupAIds: number[], groupBIds: number[], keyedAIds: number[] = [], keyedBIds: number[] = []): { teamA: [number, number]; teamB: [number, number] }[] => {
    const groupATeams = generateTwoPlayerTeams(groupAIds, keyedAIds);
    const groupBTeams = generateTwoPlayerTeams(groupBIds, keyedBIds);
    const matches: { teamA: [number, number]; teamB: [number, number] }[] = [];

    // Cross-product: every Group A team vs every Group B team
    for (const teamA of groupATeams) {
      for (const teamB of groupBTeams) {
        matches.push({ teamA, teamB });
      }
    }
    return matches;
  };

  const getPlayerNameById = (id: number) => players.find(p => p.id === id)?.name || 'Unknown';

  const handleCreateRoundRobinMatches = async () => {
    if (roundRobinGroupAIds.length < 2 || roundRobinGroupBIds.length < 2) return;
    
    setIsCreatingRoundRobin(true);
    const matchPairings = generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds, roundRobinKeyedAIds, roundRobinKeyedBIds);
    const currentNetScoring = match.isHandicapped ? useNetScoring : false;
    
    // Build proposed matches for duplicate checking
    const proposedMatches = matchPairings.map(pairing => ({
      matchType: roundRobinMatchType,
      teamAIds: [...pairing.teamA],
      teamBIds: [...pairing.teamB],
      isNetScoring: currentNetScoring,
    }));
    
    // Check for duplicates
    const duplicates = findDuplicateMatches(proposedMatches);
    if (duplicates.length > 0) {
      const dupCount = duplicates.length;
      toast({
        title: "Duplicate matches found",
        description: `${dupCount} match(es) already exist. Skipping duplicates.`,
        variant: "destructive",
      });
    }
    
    // Filter out duplicates
    const pairingsToCreate = matchPairings.filter(pairing => 
      !findDuplicateMatch(roundRobinMatchType, [...pairing.teamA], [...pairing.teamB], currentNetScoring)
    );
    
    if (pairingsToCreate.length === 0) {
      toast({
        title: "No new matches to create",
        description: "All proposed matches already exist.",
      });
      setIsCreatingRoundRobin(false);
      return;
    }
    
    try {
      for (const pairing of pairingsToCreate) {
        const teamAName = pairing.teamA.map(id => getPlayerNameById(id)).join('/');
        const teamBName = pairing.teamB.map(id => getPlayerNameById(id)).join('/');
        
        await new Promise<void>((resolve, reject) => {
          createEventMatch.mutate({
            name: `${teamAName} vs ${teamBName}`,
            matchType: roundRobinMatchType,
            unitAmount: unitAmount * 100,
            teamA: { name: teamAName, playerIds: pairing.teamA },
            teamB: { name: teamBName, playerIds: pairing.teamB },
            autoPressOriginal: autoPressOriginal,
            autoPressAllPresses: false,
            autoPressNassauFront9: true,
            autoPressNassauBack9: true,
            autoPressNassauOverall: true,
            useNetScoring: match.isHandicapped ? useNetScoring : false,
            startOnBack9: dayStartOnBack9,
            isRoundRobinGenerated: true,
          }, {
            onSuccess: (created) => { applyStrokesToEventMatch(created); resolve(); },
            onError: (err) => reject(err),
          });
        });
      }
      
      toast({
        title: "Round Robin created",
        description: `Created ${pairingsToCreate.length} new match(es).`,
      });
      
      // Reset wizard state
      setShowCreateMatch(false);
      setIsRoundRobinMode(false);
      setRoundRobinGroupAIds([]);
      setRoundRobinGroupBIds([]);
      setRoundRobinKeyedAIds([]);
      setRoundRobinKeyedBIds([]);
      setRoundRobinStep('select');
      setSelectedMatchType((sortedMatchOptions[0]?.value as MatchType) || MATCH_TYPES.NASSAU);
      // Keep useNetScoring true for handicapped matches
      setUseNetScoring(match.isHandicapped ?? false);
    } catch (error) {
      console.error('Error creating round robin matches:', error);
    } finally {
      setIsCreatingRoundRobin(false);
    }
  };

  const toggleRoundRobinPlayerInGroup = (playerId: number, group: 'A' | 'B') => {
    if (group === 'A') {
      if (roundRobinGroupAIds.includes(playerId)) {
        setRoundRobinGroupAIds(roundRobinGroupAIds.filter(id => id !== playerId));
        // Also remove from keyed if they're removed from the group
        setRoundRobinKeyedAIds(roundRobinKeyedAIds.filter(id => id !== playerId));
      } else {
        setRoundRobinGroupAIds([...roundRobinGroupAIds, playerId]);
        setRoundRobinGroupBIds(roundRobinGroupBIds.filter(id => id !== playerId));
        // Remove from other group's keyed list
        setRoundRobinKeyedBIds(roundRobinKeyedBIds.filter(id => id !== playerId));
      }
    } else {
      if (roundRobinGroupBIds.includes(playerId)) {
        setRoundRobinGroupBIds(roundRobinGroupBIds.filter(id => id !== playerId));
        // Also remove from keyed if they're removed from the group
        setRoundRobinKeyedBIds(roundRobinKeyedBIds.filter(id => id !== playerId));
      } else {
        setRoundRobinGroupBIds([...roundRobinGroupBIds, playerId]);
        setRoundRobinGroupAIds(roundRobinGroupAIds.filter(id => id !== playerId));
        // Remove from other group's keyed list
        setRoundRobinKeyedAIds(roundRobinKeyedAIds.filter(id => id !== playerId));
      }
    }
  };

  const toggleRoundRobinKeyed = (playerId: number, group: 'A' | 'B') => {
    if (group === 'A') {
      if (roundRobinKeyedAIds.includes(playerId)) {
        setRoundRobinKeyedAIds(roundRobinKeyedAIds.filter(id => id !== playerId));
      } else {
        setRoundRobinKeyedAIds([...roundRobinKeyedAIds, playerId]);
      }
    } else {
      if (roundRobinKeyedBIds.includes(playerId)) {
        setRoundRobinKeyedBIds(roundRobinKeyedBIds.filter(id => id !== playerId));
      } else {
        setRoundRobinKeyedBIds([...roundRobinKeyedBIds, playerId]);
      }
    }
  };

  const getScore = (playerId: number, hole: number): number | null => {
    const score = scores.find((s: Score) => s.playerId === playerId && s.holeNumber === hole);
    return score ? score.strokes : null;
  };

  const handleJoinMatch = () => {
    if (!user) return;
    const name = user.firstName 
      ? `${user.firstName} ${user.lastName || ''}`.trim() 
      : user.email || "Player";
    addPlayer.mutate({ name, userId: user.id });
  };

  const handleAddGuest = () => {
    if (!newPlayerName.trim()) return;
    addPlayer.mutate({ name: newPlayerName.trim() });
    setNewPlayerName("");
  };

  const handleCellClick = (playerId: number, hole: number) => {
    const currentScore = getScore(playerId, hole);
    setEditingCell({ playerId, hole });
    setEditValue(currentScore !== null ? String(currentScore) : "");
  };

  const handleScoreSubmit = (playerId: number, hole: number) => {
    const strokes = parseInt(editValue);
    if (!isNaN(strokes) && strokes >= 1 && strokes <= 20) {
      submitScore.mutate({ playerId, holeNumber: hole, strokes });
    }
    
    // Move to next hole
    if (hole < 18) {
      setEditingCell({ playerId, hole: hole + 1 });
      setEditValue(getScore(playerId, hole + 1)?.toString() || "");
    } else {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, playerId: number, hole: number) => {
    if (e.key === "Enter") {
      handleScoreSubmit(playerId, hole);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleScoreSubmit(playerId, hole);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header - Compact */}
      <div className="bg-white dark:bg-card rounded-xl px-4 py-3 shadow-md border border-border/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          {editingName && isCreator && !isDailyMatchContainer ? (
            <div className="flex items-center gap-1">
              <Input
                value={headerNameValue}
                onChange={(e) => setHeaderNameValue(e.target.value)}
                className="h-8 w-48 text-lg font-bold"
                data-testid="input-edit-event-name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    updateMatchDetails.mutate({ name: headerNameValue.trim() || undefined });
                    setEditingName(false);
                  } else if (e.key === "Escape") {
                    setEditingName(false);
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  updateMatchDetails.mutate({ name: headerNameValue.trim() || undefined });
                  setEditingName(false);
                }}
                data-testid="button-save-event-name"
              >
                <Check className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <h1 
              className={`text-xl font-display font-bold text-foreground ${isCreator && !isDailyMatchContainer ? 'cursor-pointer hover:text-primary' : ''}`}
              onClick={() => {
                if (isCreator && !isDailyMatchContainer) {
                  setHeaderNameValue(match.name || "");
                  setEditingName(true);
                }
              }}
              data-testid="text-event-name"
            >
              {match.name || (match.createdAt ? format(new Date(match.createdAt), "MMMM d, yyyy") : "Untitled Event")}
              {isCreator && !isDailyMatchContainer && <Pencil className="w-3 h-3 inline ml-1 text-muted-foreground" />}
            </h1>
          )}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {editingCourse && isCreator && !isDailyMatchContainer ? (
              <div className="flex items-center gap-1">
                <Select
                  value={match.courseId?.toString() || ""}
                  onValueChange={(val) => {
                    const course = coursesList?.find(c => c.id === parseInt(val));
                    if (course) {
                      updateMatchDetails.mutate({ courseId: course.id, courseName: course.name });
                    }
                    setEditingCourse(false);
                  }}
                >
                  <SelectTrigger className="h-8 w-48" data-testid="select-edit-course">
                    <SelectValue placeholder="Select course" />
                  </SelectTrigger>
                  <SelectContent>
                    {coursesList?.map((course) => (
                      <SelectItem key={course.id} value={course.id.toString()}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setEditingCourse(false)}
                  data-testid="button-cancel-edit-course"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <span 
                className={`flex items-center gap-1 ${isCreator && !isDailyMatchContainer ? 'cursor-pointer hover:text-primary' : ''}`}
                onClick={() => isCreator && !isDailyMatchContainer && setEditingCourse(true)}
                data-testid="text-event-course"
              >
                <MapPin className="w-4 h-4 text-accent" />
                {match.courseName}
                {isCreator && !isDailyMatchContainer && <Pencil className="w-3 h-3 text-muted-foreground" />}
              </span>
            )}
            {editingDate && isCreator && !isDailyMatchContainer ? (
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={headerDateValue}
                  onChange={(e) => setHeaderDateValue(e.target.value)}
                  className="h-8 w-36"
                  data-testid="input-edit-event-date"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && headerDateValue) {
                      updateMatchDetails.mutate({ createdAt: new Date(headerDateValue).toISOString() });
                      setEditingDate(false);
                    } else if (e.key === "Escape") {
                      setEditingDate(false);
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (headerDateValue) {
                      updateMatchDetails.mutate({ createdAt: new Date(headerDateValue).toISOString() });
                    }
                    setEditingDate(false);
                  }}
                  data-testid="button-save-event-date"
                >
                  <Check className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <span 
                className={`flex items-center gap-1 ${isCreator && !isDailyMatchContainer ? 'cursor-pointer hover:text-primary' : ''}`}
                onClick={() => {
                  if (isCreator && !isDailyMatchContainer && match.createdAt) {
                    setHeaderDateValue(format(new Date(match.createdAt), "yyyy-MM-dd"));
                    setEditingDate(true);
                  }
                }}
                data-testid="text-event-date"
              >
                <Calendar className="w-4 h-4 text-primary" />
                {match.createdAt && format(new Date(match.createdAt), "MMM d, yyyy")}
                {isCreator && !isDailyMatchContainer && <Pencil className="w-3 h-3 text-muted-foreground" />}
              </span>
            )}
            {editingGroup && isCreator && !isDailyMatchContainer ? (
              showNewGroupInput ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name..."
                    className="h-8 w-32"
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === "Enter" && newGroupName.trim()) {
                        try {
                          const newGroup = await createGroup.mutateAsync(newGroupName.trim());
                          updateMatchDetails.mutate({ groupId: newGroup.id });
                          setNewGroupName("");
                          setShowNewGroupInput(false);
                          setEditingGroup(false);
                        } catch (err) {
                          console.error("Failed to create group:", err);
                        }
                      } else if (e.key === "Escape") {
                        setShowNewGroupInput(false);
                        setNewGroupName("");
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={async () => {
                      if (newGroupName.trim()) {
                        try {
                          const newGroup = await createGroup.mutateAsync(newGroupName.trim());
                          updateMatchDetails.mutate({ groupId: newGroup.id });
                          setNewGroupName("");
                          setShowNewGroupInput(false);
                          setEditingGroup(false);
                        } catch (err) {
                          console.error("Failed to create group:", err);
                        }
                      }
                    }}
                    disabled={!newGroupName.trim() || createGroup.isPending}
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setShowNewGroupInput(false);
                      setNewGroupName("");
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Select
                    value={match.groupId?.toString() || "none"}
                    onValueChange={(val) => {
                      if (val === "add_new") {
                        setShowNewGroupInput(true);
                      } else {
                        updateMatchDetails.mutate({ groupId: val === "none" ? null : parseInt(val) });
                        setEditingGroup(false);
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Group</SelectItem>
                      {groups?.map((group: { id: number; name: string }) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="add_new" className="text-primary font-medium">
                        + Add New Group
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditingGroup(false)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )
            ) : (
              <span 
                className={`flex items-center gap-1 ${isCreator && !isDailyMatchContainer ? 'cursor-pointer hover:text-primary' : ''}`}
                onClick={() => {
                  if (isCreator && !isDailyMatchContainer) {
                    setEditingGroup(true);
                  }
                }}
                data-testid="text-event-group"
              >
                <Users className="w-4 h-4 text-muted-foreground" />
                {match.groupId && groups ? (
                  groups.find((g: { id: number; name: string }) => g.id === match.groupId)?.name || "No Group"
                ) : (
                  <span className="text-muted-foreground italic">No Group</span>
                )}
                {isCreator && !isDailyMatchContainer && <Pencil className="w-3 h-3 text-muted-foreground" />}
              </span>
            )}
            {isCreator && !isDailyMatchContainer ? (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={match.isHandicapped || false}
                  onCheckedChange={(checked) => updateHandicapped.mutate(!!checked)}
                  data-testid="checkbox-handicapped-event"
                />
                <span className={match.isHandicapped ? "text-foreground font-medium" : ""}>
                  Handicapped
                </span>
              </label>
            ) : match.isHandicapped ? (
              <span className="text-foreground font-medium">Handicapped Event</span>
            ) : null}
          </div>
        </div>

        <div className="flex gap-2">
          {!isPlayer && (
            <Button
              size="sm"
              onClick={handleJoinMatch}
              disabled={addPlayer.isPending}
              data-testid="button-join-match"
            >
              <UserPlus className="w-4 h-4 mr-1" />
              {addPlayer.isPending ? "Joining..." : "Join"}
            </Button>
          )}
          {isCreator && (
            showDeleteConfirm ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    deleteMatch.mutate(matchId, {
                      onSuccess: () => navigate("/")
                    });
                  }}
                  disabled={deleteMatch.isPending}
                  data-testid="button-confirm-delete-match"
                >
                  {deleteMatch.isPending ? "..." : "Confirm"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="button-cancel-delete-match"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-muted-foreground hover:text-destructive"
                data-testid="button-delete-match"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )
          )}
        </div>
      </div>

      {/* Role Management Section (visible only to actual creator, not organizers, hidden for daily match containers) */}
      {isCreator && !isDailyMatchContainer && (
        <div className="bg-card rounded-xl shadow-md border border-border/50 overflow-hidden mb-4">
          <button
            onClick={() => setShowRoleManagement(!showRoleManagement)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
            data-testid="button-toggle-role-management"
          >
            <h3 className="font-display font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Manage Access ({matchRoles?.length || 0} shared)
            </h3>
            {showRoleManagement ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          
          {showRoleManagement && (
            <div className="px-4 pb-4 pt-2 border-t border-border/50 space-y-4">
              <p className="text-sm text-muted-foreground">
                Share this event with others. <strong>Organizers</strong> can edit scores and bets. <strong>Viewers</strong> have read-only access.
              </p>
              
              {/* Add new role form */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Select value={newRoleType} onValueChange={(v) => setNewRoleType(v as 'organizer' | 'viewer')}>
                  <SelectTrigger className="w-full sm:w-32" data-testid="select-role-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="organizer">Organizer</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1 flex gap-2">
                  <Select value={newRoleUserId} onValueChange={setNewRoleUserId}>
                    <SelectTrigger className="flex-1" data-testid="select-role-user">
                      <SelectValue placeholder="Select a player..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fullPlayerData
                        ?.filter(p => p.claimedByUserId && p.claimedByUserId !== user?.id && !matchRoles?.some(r => r.userId === p.claimedByUserId))
                        .map(p => (
                          <SelectItem key={p.claimedByUserId} value={p.claimedByUserId!}>
                            {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="default"
                    disabled={!newRoleUserId || upsertMatchRole.isPending}
                    onClick={() => {
                      if (newRoleUserId) {
                        upsertMatchRole.mutate(
                          { userId: newRoleUserId, role: newRoleType },
                          {
                            onSuccess: () => {
                              setNewRoleUserId("");
                              toast({ title: "Access granted" });
                            },
                            onError: (err) => {
                              toast({ title: "Failed to add", description: err.message, variant: "destructive" });
                            }
                          }
                        );
                      }
                    }}
                    data-testid="button-add-role"
                  >
                    {upsertMatchRole.isPending ? "..." : <Plus className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              
              {/* Current roles list */}
              {matchRoles && matchRoles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Access</p>
                  <div className="space-y-1">
                    {matchRoles.map(role => {
                      const playerInfo = fullPlayerData?.find(p => p.claimedByUserId === role.userId);
                      return (
                        <div key={role.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-md">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{playerInfo?.name || role.userId}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              role.role === 'organizer' 
                                ? 'bg-primary/10 text-primary' 
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              {role.role === 'organizer' ? 'Organizer' : 'Viewer'}
                            </span>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              deleteMatchRole.mutate(role.userId, {
                                onSuccess: () => toast({ title: "Access removed" }),
                                onError: (err) => toast({ title: "Failed", description: err.message, variant: "destructive" })
                              });
                            }}
                            disabled={deleteMatchRole.isPending}
                            data-testid={`button-remove-role-${role.userId}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Player Section (visible to creator, hidden for daily match containers) - Collapsible */}
      {isCreator && !isDailyMatchContainer && (() => {
        const existingPlayerNames = players.map(p => p.name.toLowerCase());
        
        return (
          <div className="bg-white rounded-xl shadow-md border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setAddPlayerCollapsed(!addPlayerCollapsed)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                data-testid="button-toggle-add-player"
              >
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Add Player ({players.length} added)
                </h3>
                {addPlayerCollapsed ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              <Link href={`/match/${matchId}/scores?scan=true`}>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="gap-1"
                  data-testid="button-scan-scorecard-header"
                >
                  <Camera className="w-4 h-4" />
                  Scan Scorecard
                </Button>
              </Link>
            </div>
            
            {!addPlayerCollapsed && (
              <div className="px-4 pb-4 pt-2 border-t border-border/50">
                {/* Quick Add Roster Grid - only shows players NOT yet added */}
                {(() => {
                  const groupNameSet = groupPlayerNames ? new Set(groupPlayerNames.map(n => n.toLowerCase())) : null;
                  const availableRosterPlayers = (fullPlayerData || [])
                    .filter(p => {
                      if (existingPlayerNames.includes(p.name.toLowerCase())) return false;
                      if (groupNameSet) return groupNameSet.has(p.name.toLowerCase());
                      return p.showInRoster;
                    })
                    .sort((a, b) => a.name.localeCompare(b.name));
                  
                  return availableRosterPlayers.length > 0 ? (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-2">Quick add from roster:</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {availableRosterPlayers.map((playerInfo) => {
                          const name = playerInfo.name;
                          const defaultHandicap = playerHandicaps?.find(h => h.presetPlayerName.toLowerCase() === name.toLowerCase());
                          const handicapValue = defaultHandicap?.handicapIndex ?? playerInfo.handicapIndex;
                          const displayHandicap = handicapValue !== null && handicapValue !== undefined 
                            ? (handicapValue / 10).toFixed(1) 
                            : '';
                          const isEditingThis = editingHandicap === name;
                          
                          return (
                            <div
                              key={name}
                              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors bg-muted/50 hover:bg-muted border border-transparent"
                            >
                              <button
                                onClick={() => addPlayer.mutate({ name })}
                                disabled={addPlayer.isPending}
                                className="flex items-center gap-1 flex-1 cursor-pointer text-left"
                                data-testid={`button-quick-add-${name.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="truncate">{name}</span>
                              </button>
                              {isEditingThis ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={handicapEditValue}
                                  onChange={(e) => setHandicapEditValue(e.target.value)}
                                  onBlur={() => {
                                    const parsed = parseFloat(handicapEditValue);
                                    if (!isNaN(parsed) && parsed >= -10 && parsed <= 54) {
                                      upsertPlayerHandicap.mutate({ 
                                        presetPlayerName: name, 
                                        handicapIndex: Math.round(parsed * 10) 
                                      });
                                    } else if (handicapEditValue === '') {
                                      upsertPlayerHandicap.mutate({ 
                                        presetPlayerName: name, 
                                        handicapIndex: null 
                                      });
                                    }
                                    setEditingHandicap(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.currentTarget.blur();
                                    } else if (e.key === 'Escape') {
                                      setEditingHandicap(null);
                                    }
                                  }}
                                  autoFocus
                                  className="w-12 h-5 text-center text-xs border rounded px-1"
                                  placeholder="HCP"
                                  data-testid={`input-handicap-${name.toLowerCase().replace(/\s+/g, '-')}`}
                                />
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditingHandicap(name);
                                    setHandicapEditValue(displayHandicap);
                                  }}
                                  className="w-12 h-5 text-center text-xs bg-background border rounded hover:bg-muted/50 text-muted-foreground"
                                  data-testid={`button-handicap-${name.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  {displayHandicap || '-'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null;
                })()}
                
                {/* Custom Name Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter player name..."
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddGuest()}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-player-name"
                  />
                  <Button 
                    size="sm"
                    onClick={handleAddGuest} 
                    disabled={!newPlayerName.trim() || addPlayer.isPending}
                    data-testid="button-add-player"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>

              </div>
            )}

            {/* Added Players List - always visible regardless of collapse state */}
            {players.length > 0 && (
              <div className="px-4 pb-3 pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Players in this match ({players.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {players.map((p) => {
                    const playerHasScores = scores.some((s: Score) => s.playerId === p.id);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-primary/10 text-primary border border-primary/20"
                        data-testid={`added-player-${p.id}`}
                      >
                        <span className="truncate max-w-[120px]">{p.name}</span>
                        {canEditScoresAndBets && (
                          <button
                            onClick={() => {
                              if (removePlayer.isPending) return;
                              if (playerHasScores) {
                                toast({ title: "Can't remove", description: "This player has recorded scores. Delete their scores first.", variant: "destructive" });
                              } else {
                                removePlayer.mutate(p.id);
                              }
                            }}
                            className={`ml-0.5 rounded-full p-0.5 transition-colors ${
                              playerHasScores ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            title={playerHasScores ? "Has recorded scores — delete scores first" : "Remove from match"}
                            data-testid={`button-remove-player-${p.id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Matches Section */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setMatchesCollapsed(!matchesCollapsed)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              data-testid="button-toggle-matches"
            >
              <h3 className="font-display font-bold text-lg flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary" />
                Matches ({eventMatches.length})
              </h3>
              {matchesCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {isCreator && players.length >= 2 && !matchesCollapsed && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCopyBetsDialog(true)}
                  data-testid="button-copy-bets"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy From Event
                </Button>
                {voiceSupported && (
                  <Button
                    size="sm"
                    variant={isListening ? "destructive" : "outline"}
                    onClick={() => {
                      setVoiceError(null);
                      setVoiceParsedSummary(null);
                      setVoiceTranscript("");
                      toggleListening();
                    }}
                    disabled={isVoiceProcessing}
                    title="Describe a match by voice"
                    data-testid="button-voice-match"
                    className={isListening ? "animate-pulse" : ""}
                  >
                    {isVoiceProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isListening ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setShowCreateMatch(true)}
                  data-testid="button-create-match"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Match
                </Button>
              </div>
            )}
          </div>
          
          {!matchesCollapsed && eventMatches.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterByPlayer} onValueChange={setFilterByPlayer}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-filter-player">
                  <SelectValue placeholder="Player" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Players</SelectItem>
                  {players.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterByMatchType} onValueChange={setFilterByMatchType}>
                <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-filter-match-type">
                  <SelectValue placeholder="Match Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="match_play_1_ball">Match Play - 1 Ball</SelectItem>
                  <SelectItem value="match_play_2_ball">Match Play - 2 Ball</SelectItem>
                  <SelectItem value="stroke_play">Stroke Play</SelectItem>
                  <SelectItem value="nassau">Nassau</SelectItem>
                  <SelectItem value="skins">Skins</SelectItem>
                </SelectContent>
              </Select>
              {(filterByPlayer !== "all" || filterByMatchType !== "all") && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 text-xs"
                  onClick={() => { setFilterByPlayer("all"); setFilterByMatchType("all"); }}
                  data-testid="button-clear-filters"
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Voice status banner (shown when form is closed) */}
        {!showCreateMatch && (isListening || isVoiceProcessing || voiceTranscript || voiceParsedSummary || voiceError) && (
          <div className="mb-4 space-y-2">
            {isListening && (
              <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-destructive font-medium">
                  {liveTranscript ? `"${liveTranscript}"` : "Listening… speak now"}
                </span>
              </div>
            )}
            {isVoiceProcessing && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Parsing with AI…</span>
              </div>
            )}
            {voiceError && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                <span className="text-destructive">{voiceError}</span>
                <button onClick={() => setVoiceError(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create Match Form */}
        {!matchesCollapsed && showCreateMatch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 p-4 bg-muted/30 rounded-xl border border-border"
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">
                {isRoundRobinMode ? 'Round Robin - Match Play 1 Ball (2 man teams)' : 'Create Match Play'}
              </h4>
              <div className="flex items-center gap-2">
                {voiceSupported && (
                  <Button
                    size="icon"
                    variant={isListening ? "destructive" : "ghost"}
                    onClick={() => {
                      setVoiceError(null);
                      setVoiceParsedSummary(null);
                      setVoiceTranscript("");
                      toggleListening();
                    }}
                    disabled={isVoiceProcessing}
                    title={isListening ? "Stop recording" : "Describe a match by voice"}
                    data-testid="button-voice-match-form"
                    className={isListening ? "animate-pulse" : ""}
                  >
                    {isVoiceProcessing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isListening ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => {
                  setShowCreateMatch(false);
                  setIsRoundRobinMode(false);
                  setRoundRobinGroupAIds([]);
                  setRoundRobinGroupBIds([]);
                  setRoundRobinStep('select');
                  setVoiceParsedSummary(null);
                  setVoiceError(null);
                  setVoiceTranscript("");
                }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Voice status banners */}
            {(isListening || isVoiceProcessing || voiceTranscript || voiceParsedSummary || voiceError) && (
              <div className="mb-4 space-y-2">
                {isListening && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                    <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                    <span className="text-destructive font-medium">
                      {liveTranscript ? `"${liveTranscript}"` : "Listening… speak now"}
                    </span>
                  </div>
                )}
                {voiceTranscript && !isListening && (
                  <div className="px-3 py-2 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground italic">
                    "{voiceTranscript}"
                  </div>
                )}
                {isVoiceProcessing && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Parsing with AI…</span>
                  </div>
                )}
                {voiceParsedSummary && !isVoiceProcessing && (
                  <div className="flex items-start justify-between gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">{voiceParsedSummary}</span>
                      {Object.keys(voiceStrokeOverrides).length > 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                          Strokes:{" "}
                          {players
                            .filter(p => voiceStrokeOverrides[p.id] != null)
                            .map(p => `${p.name}: ${voiceStrokeOverrides[p.id]}`)
                            .join(", ")}
                          {" "}· others: 0
                        </p>
                      )}
                      {voiceUnmatched.length > 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          Could not find: {voiceUnmatched.join(", ")} — please assign manually
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => { setVoiceParsedSummary(null); setVoiceTranscript(""); setVoiceStrokeOverrides({}); voiceStrokeOverridesRef.current = {}; }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {voiceError && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
                    <span className="text-destructive">{voiceError}</span>
                    <button
                      onClick={() => setVoiceError(null)}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Round Robin Wizard */}
            {isRoundRobinMode ? (
              <div className="space-y-4">
                {roundRobinStep === 'select' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Wager ($ per player per match)</label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="20"
                          value={unitAmount}
                          onChange={(e) => setUnitAmount(parseFloat(e.target.value) || 0)}
                          className="mt-1"
                          data-testid="input-rr-unit-amount"
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="space-y-2 p-3 bg-muted/30 rounded-lg flex-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoPressOriginal}
                              onChange={(e) => setAutoPressOriginal(e.target.checked)}
                              className="w-4 h-4 rounded border-border"
                              data-testid="checkbox-rr-auto-press"
                            />
                            <span className="text-sm font-medium">Auto Press</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Select players for Group 1 (left) and Group 2 (right). All 2-man teams from Group 1 will play against all 2-man teams from Group 2.
                      Check "Key" to only create teams that include that player.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg min-h-[40px] flex items-center">
                          <span className="font-semibold text-primary text-sm">
                            Group 1 ({roundRobinGroupAIds.length} players, {generateTwoPlayerTeams(roundRobinGroupAIds, roundRobinKeyedAIds).length} teams)
                          </span>
                        </div>
                        <div className="space-y-1">
                          {players.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <button
                                onClick={() => toggleRoundRobinPlayerInGroup(p.id, 'A')}
                                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                  roundRobinGroupAIds.includes(p.id)
                                    ? "bg-primary text-primary-foreground"
                                    : roundRobinGroupBIds.includes(p.id)
                                    ? "bg-muted/50 text-muted-foreground line-through"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                                data-testid={`button-rr-group-a-${p.id}`}
                              >
                                {p.name}
                              </button>
                              {roundRobinGroupAIds.includes(p.id) && (
                                <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={roundRobinKeyedAIds.includes(p.id)}
                                    onChange={() => toggleRoundRobinKeyed(p.id, 'A')}
                                    className="w-3 h-3 rounded border-border"
                                    data-testid={`checkbox-rr-key-a-${p.id}`}
                                  />
                                  <Check className={`w-3 h-3 ${roundRobinKeyedAIds.includes(p.id) ? 'text-primary' : 'text-muted-foreground'}`} />
                                </label>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 px-3 py-2 bg-accent/10 rounded-lg min-h-[40px] flex items-center">
                          <span className="font-semibold text-accent text-sm">
                            Group 2 ({roundRobinGroupBIds.length} players, {generateTwoPlayerTeams(roundRobinGroupBIds, roundRobinKeyedBIds).length} teams)
                          </span>
                        </div>
                        <div className="space-y-1">
                          {players.map((p) => (
                            <div key={p.id} className="flex items-center gap-2">
                              <button
                                onClick={() => toggleRoundRobinPlayerInGroup(p.id, 'B')}
                                className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                  roundRobinGroupBIds.includes(p.id)
                                    ? "bg-accent text-accent-foreground"
                                    : roundRobinGroupAIds.includes(p.id)
                                    ? "bg-muted/50 text-muted-foreground line-through"
                                    : "bg-muted hover:bg-muted/80"
                                }`}
                                data-testid={`button-rr-group-b-${p.id}`}
                              >
                                {p.name}
                              </button>
                              {roundRobinGroupBIds.includes(p.id) && (
                                <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                                  <input
                                    type="checkbox"
                                    checked={roundRobinKeyedBIds.includes(p.id)}
                                    onChange={() => toggleRoundRobinKeyed(p.id, 'B')}
                                    className="w-3 h-3 rounded border-border"
                                    data-testid={`checkbox-rr-key-b-${p.id}`}
                                  />
                                  <Check className={`w-3 h-3 ${roundRobinKeyedBIds.includes(p.id) ? 'text-accent' : 'text-muted-foreground'}`} />
                                </label>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {roundRobinGroupAIds.length >= 2 && roundRobinGroupBIds.length >= 2 && (
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-sm font-medium text-primary">
                          {generateTwoPlayerTeams(roundRobinGroupAIds, roundRobinKeyedAIds).length} Group 1 teams x {generateTwoPlayerTeams(roundRobinGroupBIds, roundRobinKeyedBIds).length} Group 2 teams = {generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds, roundRobinKeyedAIds, roundRobinKeyedBIds).length} matches
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsRoundRobinMode(false);
                          setRoundRobinGroupAIds([]);
                          setRoundRobinGroupBIds([]);
                          setRoundRobinKeyedAIds([]);
                          setRoundRobinKeyedBIds([]);
                        }}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setRoundRobinStep('preview')}
                        disabled={roundRobinGroupAIds.length < 2 || roundRobinGroupBIds.length < 2}
                        className="flex-1"
                        data-testid="button-rr-preview"
                      >
                        Preview Matches
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds, roundRobinKeyedAIds, roundRobinKeyedBIds).map((match, idx) => {
                        const teamAName = match.teamA.map(id => getPlayerNameById(id)).join('/');
                        const teamBName = match.teamB.map(id => getPlayerNameById(id)).join('/');
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-border/50">
                            <span className="text-sm font-medium text-primary">{teamAName}</span>
                            <span className="text-xs text-muted-foreground">vs</span>
                            <span className="text-sm font-medium text-accent">{teamBName}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-3 bg-muted/50 rounded-lg text-sm">
                      <p><strong>Match Type:</strong> {MATCH_TYPE_LABELS[roundRobinMatchType]}</p>
                      <p><strong>Wager:</strong> ${unitAmount} per player per match</p>
                      <p><strong>Auto Press:</strong> {autoPressOriginal ? 'Enabled' : 'Disabled'}</p>
                      <p><strong>Total Matches:</strong> {generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds, roundRobinKeyedAIds, roundRobinKeyedBIds).length}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setRoundRobinStep('select')}
                        className="flex-1"
                        disabled={isCreatingRoundRobin}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleCreateRoundRobinMatches}
                        disabled={isCreatingRoundRobin}
                        className="flex-1"
                        data-testid="button-rr-create"
                      >
                        {isCreatingRoundRobin ? 'Creating...' : `Create ${generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds, roundRobinKeyedAIds, roundRobinKeyedBIds).length} Matches`}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Match Type</label>
                  <Select
                    value={selectedMatchType}
                    onValueChange={(value) => {
                      if (value === WIZARD_TYPES.ROUND_ROBIN_2_MAN) {
                        setIsRoundRobinMode(true);
                        setRoundRobinMatchType(MATCH_TYPES.MATCH_PLAY_1_BALL);
                        setRoundRobinGroupAIds([]);
                        setRoundRobinGroupBIds([]);
                        setRoundRobinStep('select');
                      } else if (value === WIZARD_TYPES.ROUND_ROBIN_NASSAU) {
                        setIsRoundRobinMode(true);
                        setRoundRobinMatchType(MATCH_TYPES.NASSAU);
                        setRoundRobinGroupAIds([]);
                        setRoundRobinGroupBIds([]);
                        setRoundRobinStep('select');
                      } else if (value === MATCH_TYPES.SKINS) {
                        setSelectedMatchType(MATCH_TYPES.SKINS);
                        setSkinsPlayerIds(players.map(p => p.id));
                      } else if (value === MATCH_TYPES.FIVE_FIVE_FIVE_THREE) {
                        setSelectedMatchType(MATCH_TYPES.FIVE_FIVE_FIVE_THREE);
                        setUnitAmount(1); // Default $1 wager for 5-5-5-3
                        setFiveTeamCount(2);
                        setFiveTeams([{ name: "Team 1", playerIds: [] }, { name: "Team 2", playerIds: [] }]);
                      } else if (value === MATCH_TYPES.DEATH_MATCH) {
                        setSelectedMatchType(MATCH_TYPES.DEATH_MATCH);
                        setDeathMatchBaseBet(50);
                        setDeathMatchBestBallBet(50);
                        setDeathMatchSecondBallBet(25);
                        setDeathMatchFirstPressBet(25);
                        setDeathMatchSubsequentPressBet(15);
                        setDeathMatchSecondBallPressBet(15);
                        setTeamAPlayerIds([]);
                        setTeamBPlayerIds([]);
                      } else if (value === MATCH_TYPES.TWO_THREE_BALL) {
                        setSelectedMatchType(MATCH_TYPES.TWO_THREE_BALL);
                        setTwoBallBet(20);
                        setThreeBallBet(20);
                        setAutoPressTwoBallFront9(true);
                        setAutoPressTwoBallBack9(true);
                        setAutoPressTwoBallOverall(true);
                        setAutoPressThreeBallFront9(true);
                        setAutoPressThreeBallBack9(true);
                        setAutoPressThreeBallOverall(true);
                        setTeamAPlayerIds([]);
                        setTeamBPlayerIds([]);
                      } else {
                        setSelectedMatchType(value as MatchType);
                        setSkinsPlayerIds([]);
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-match-type">
                      <SelectValue placeholder="Select match type" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedMatchOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} data-testid={`option-${opt.value}`}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Wager ($ per player)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="5"
                    value={unitAmount}
                    onChange={(e) => setUnitAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                    data-testid="input-unit-amount"
                  />
                </div>
              </div>

              {/* Auto Press Option - For Match Play and Nassau */}
              {(selectedMatchType === MATCH_TYPES.MATCH_PLAY_1_BALL || selectedMatchType === MATCH_TYPES.MATCH_PLAY_2_BALL || selectedMatchType === MATCH_TYPES.NASSAU) && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPressOriginal}
                      onChange={(e) => setAutoPressOriginal(e.target.checked)}
                      className="w-4 h-4 rounded border-border"
                      data-testid="checkbox-auto-press"
                    />
                    <span className="text-sm font-medium">Auto Press</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedMatchType === MATCH_TYPES.NASSAU 
                      ? "When 2+ down: Win doubles bet, loss pushes. Applies to Front 9 (hole 9), Back 9 (hole 18), and Overall (hole 18)"
                      : "When 2+ down going into 18: Win doubles bet, loss pushes, tie unchanged"}
                  </p>
                </div>
              )}

              {/* Net/Gross Scoring Option - Only for Handicapped Events */}
              {match.isHandicapped && (
                <div className="space-y-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={useNetScoring}
                      onCheckedChange={(checked) => setUseNetScoring(!!checked)}
                      data-testid="checkbox-use-net-scoring"
                    />
                    <span className="text-sm font-medium">Use Net Scoring</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {useNetScoring 
                      ? "Match results based on handicap-adjusted scores"
                      : "Match results based on gross (raw) scores"}
                  </p>
                </div>
              )}

              {/* Skins Player Selection */}
              {selectedMatchType === MATCH_TYPES.SKINS ? (
                <>
                  <div>
                    <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg">
                      <span className="font-semibold text-primary text-sm">
                        Players in Skins ({skinsPlayerIds.length} selected)
                      </span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {players.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={skinsPlayerIds.includes(p.id)}
                            onChange={() => toggleSkinsPlayer(p.id)}
                            className="w-4 h-4 rounded border-border"
                            data-testid={`checkbox-skins-player-${p.id}`}
                          />
                          <span className={`text-sm ${skinsPlayerIds.includes(p.id) ? 'font-medium' : 'text-muted-foreground'}`}>
                            {p.name}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Pool: ${unitAmount * skinsPlayerIds.length} (${unitAmount} x {skinsPlayerIds.length} players)
                    </p>
                  </div>

                  <Button
                    onClick={handleCreateSkinsMatch}
                    disabled={skinsPlayerIds.length < 2 || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-skins"
                  >
                    {createEventMatch.isPending ? "Creating..." : "Create Skins Match"}
                  </Button>
                </>
              ) : selectedMatchType === MATCH_TYPES.FIVE_FIVE_FIVE_THREE ? (
                <>
                  {/* 5-5-5-3 Team Selection */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-muted-foreground">Number of Teams:</label>
                      <Select
                        value={fiveTeamCount.toString()}
                        onValueChange={(val) => updateFiveTeamCount(parseInt(val))}
                      >
                        <SelectTrigger className="w-20" data-testid="select-five-team-count">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                          <SelectItem value="4">4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                      <p className="font-medium mb-1">Scoring:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>Holes 1-5: Best 1 ball</li>
                        <li>Holes 6-10: Best 2 balls</li>
                        <li>Holes 11-15: Best 3 balls</li>
                        <li>Holes 16-18: Best N balls (N = smallest team size)</li>
                      </ul>
                    </div>
                    
                    <div className={`grid gap-3 ${fiveTeamCount === 2 ? 'grid-cols-2' : fiveTeamCount === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      {fiveTeams.slice(0, fiveTeamCount).map((team, teamIdx) => {
                        const teamColors = ['bg-primary/10 text-primary', 'bg-accent/10 text-accent', 'bg-orange-100 text-orange-700', 'bg-purple-100 text-purple-700'];
                        const bgColors = ['bg-primary text-primary-foreground', 'bg-accent text-accent-foreground', 'bg-orange-500 text-white', 'bg-purple-500 text-white'];
                        return (
                          <div key={teamIdx}>
                            <div className={`mb-2 px-3 py-2 rounded-lg min-h-[40px] flex items-center ${teamColors[teamIdx]}`}>
                              <span className="font-semibold text-sm">
                                {team.playerIds.length > 0 
                                  ? team.playerIds.map(id => players.find(p => p.id === id)?.name || '').join('/')
                                  : `Team ${teamIdx + 1}`}
                              </span>
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {players.map((p) => {
                                const isInThisTeam = team.playerIds.includes(p.id);
                                const isInOtherTeam = fiveTeams.some((t, idx) => idx !== teamIdx && t.playerIds.includes(p.id));
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => toggleFiveTeamPlayer(teamIdx, p.id)}
                                    className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                      isInThisTeam
                                        ? bgColors[teamIdx]
                                        : isInOtherTeam
                                        ? "bg-muted/50 text-muted-foreground line-through"
                                        : "bg-muted hover:bg-muted/80"
                                    }`}
                                    data-testid={`button-five-team-${teamIdx}-${p.id}`}
                                  >
                                    {p.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      Each team pays each other team the stroke difference x ${unitAmount} wager
                    </p>
                  </div>

                  <Button
                    onClick={handleCreateFiveMatch}
                    disabled={fiveTeams.slice(0, fiveTeamCount).some(t => t.playerIds.length === 0) || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-five"
                  >
                    {createEventMatch.isPending ? "Creating..." : "Create 5-5-5-3 Match"}
                  </Button>
                </>
              ) : selectedMatchType === MATCH_TYPES.DEATH_MATCH ? (
                <>
                  <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Death Match - Two bets in one:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><strong>Best Ball (Stroke Play)</strong> — Best score of each 2-player team per hole, cumulative</li>
                      <li><strong>Second Ball (Match Play)</strong> — Other ball for each team, hole-by-hole</li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Base Bet ($)</label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={deathMatchBaseBet}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          updateDeathMatchDefaults(val);
                        }}
                        className="mt-1"
                        data-testid="input-death-match-base-bet"
                      />
                      <p className="text-xs text-muted-foreground mt-1">All other amounts are calculated from this. You can override them below.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Best Ball Bet ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={deathMatchBestBallBet}
                          onChange={(e) => setDeathMatchBestBallBet(parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          data-testid="input-death-match-best-ball-bet"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">2nd Ball Bet ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={deathMatchSecondBallBet}
                          onChange={(e) => setDeathMatchSecondBallBet(parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          data-testid="input-death-match-second-ball-bet"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">1st Press ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="5"
                          value={deathMatchFirstPressBet}
                          onChange={(e) => setDeathMatchFirstPressBet(parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          data-testid="input-death-match-first-press"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Add'l Press ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="5"
                          value={deathMatchSubsequentPressBet}
                          onChange={(e) => setDeathMatchSubsequentPressBet(parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          data-testid="input-death-match-subsequent-press"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">2nd Ball Press ($)</label>
                        <Input
                          type="number"
                          min="0"
                          step="5"
                          value={deathMatchSecondBallPressBet}
                          onChange={(e) => setDeathMatchSecondBallPressBet(parseFloat(e.target.value) || 0)}
                          className="mt-1 h-8 text-sm"
                          data-testid="input-death-match-second-ball-press"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg min-h-[40px] flex items-center">
                        <span className="font-semibold text-primary text-sm">
                          {teamAPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamAPlayerIds) : "Team A (2 players)"}
                        </span>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {players.map((p) => {
                          const isInA = teamAPlayerIds.includes(p.id);
                          const isInB = teamBPlayerIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (isInA) {
                                  setTeamAPlayerIds(teamAPlayerIds.filter(id => id !== p.id));
                                } else if (!isInB && teamAPlayerIds.length < 2) {
                                  setTeamAPlayerIds([...teamAPlayerIds, p.id]);
                                }
                              }}
                              disabled={isInB || (!isInA && teamAPlayerIds.length >= 2)}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                isInA
                                  ? "bg-primary text-primary-foreground"
                                  : isInB
                                  ? "bg-muted/50 text-muted-foreground line-through"
                                  : teamAPlayerIds.length >= 2
                                  ? "bg-muted/30 text-muted-foreground"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-death-team-a-${p.id}`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 px-3 py-2 bg-accent/10 rounded-lg min-h-[40px] flex items-center">
                        <span className="font-semibold text-accent text-sm">
                          {teamBPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamBPlayerIds) : "Team B (2 players)"}
                        </span>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {players.map((p) => {
                          const isInA = teamAPlayerIds.includes(p.id);
                          const isInB = teamBPlayerIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (isInB) {
                                  setTeamBPlayerIds(teamBPlayerIds.filter(id => id !== p.id));
                                } else if (!isInA && teamBPlayerIds.length < 2) {
                                  setTeamBPlayerIds([...teamBPlayerIds, p.id]);
                                }
                              }}
                              disabled={isInA || (!isInB && teamBPlayerIds.length >= 2)}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                isInB
                                  ? "bg-accent text-accent-foreground"
                                  : isInA
                                  ? "bg-muted/50 text-muted-foreground line-through"
                                  : teamBPlayerIds.length >= 2
                                  ? "bg-muted/30 text-muted-foreground"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-death-team-b-${p.id}`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={handleCreateDeathMatch}
                    disabled={teamAPlayerIds.length !== 2 || teamBPlayerIds.length !== 2 || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-death-match"
                  >
                    {createEventMatch.isPending ? "Creating..." : "Create Death Match"}
                  </Button>
                </>
              ) : selectedMatchType === MATCH_TYPES.TWO_THREE_BALL ? (
                <>
                  <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                    <p className="font-medium mb-1">2 Ball / 3 Ball — Two Nassaus running at once:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li><strong>2 Ball</strong> — Each hole's team score = sum of the team's two lowest scores (match play)</li>
                      <li><strong>3 Ball</strong> — Each hole's team score = the team's third-lowest score (match play)</li>
                    </ul>
                    <p className="mt-1">Each Nassau has Front 9, Back 9, and Overall legs with optional auto-press = 6 settleable bets.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">2 Ball Bet ($)</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={twoBallBet}
                        onChange={(e) => setTwoBallBet(parseFloat(e.target.value) || 0)}
                        className="mt-1 h-8 text-sm"
                        data-testid="input-two-ball-bet"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">3 Ball Bet ($)</label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={threeBallBet}
                        onChange={(e) => setThreeBallBet(parseFloat(e.target.value) || 0)}
                        className="mt-1 h-8 text-sm"
                        data-testid="input-three-ball-bet"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">2 Ball Auto-Press</p>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={autoPressTwoBallFront9} onChange={(e) => setAutoPressTwoBallFront9(e.target.checked)} data-testid="checkbox-autopress-2b-f9" />
                        Front 9
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={autoPressTwoBallBack9} onChange={(e) => setAutoPressTwoBallBack9(e.target.checked)} data-testid="checkbox-autopress-2b-b9" />
                        Back 9
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={autoPressTwoBallOverall} onChange={(e) => setAutoPressTwoBallOverall(e.target.checked)} data-testid="checkbox-autopress-2b-overall" />
                        Overall
                      </label>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-semibold">3 Ball Auto-Press</p>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={autoPressThreeBallFront9} onChange={(e) => setAutoPressThreeBallFront9(e.target.checked)} data-testid="checkbox-autopress-3b-f9" />
                        Front 9
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={autoPressThreeBallBack9} onChange={(e) => setAutoPressThreeBallBack9(e.target.checked)} data-testid="checkbox-autopress-3b-b9" />
                        Back 9
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input type="checkbox" checked={autoPressThreeBallOverall} onChange={(e) => setAutoPressThreeBallOverall(e.target.checked)} data-testid="checkbox-autopress-3b-overall" />
                        Overall
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg min-h-[40px] flex items-center">
                        <span className="font-semibold text-primary text-sm">
                          {teamAPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamAPlayerIds) : "Team A (3+ players)"}
                        </span>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {players.map((p) => {
                          const isInA = teamAPlayerIds.includes(p.id);
                          const isInB = teamBPlayerIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (isInA) setTeamAPlayerIds(teamAPlayerIds.filter(id => id !== p.id));
                                else if (!isInB) setTeamAPlayerIds([...teamAPlayerIds, p.id]);
                              }}
                              disabled={isInB}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                isInA ? "bg-primary text-primary-foreground" : isInB ? "bg-muted/50 text-muted-foreground line-through" : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-ttb-team-a-${p.id}`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 px-3 py-2 bg-accent/10 rounded-lg min-h-[40px] flex items-center">
                        <span className="font-semibold text-accent text-sm">
                          {teamBPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamBPlayerIds) : "Team B (3+ players)"}
                        </span>
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {players.map((p) => {
                          const isInA = teamAPlayerIds.includes(p.id);
                          const isInB = teamBPlayerIds.includes(p.id);
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (isInB) setTeamBPlayerIds(teamBPlayerIds.filter(id => id !== p.id));
                                else if (!isInA) setTeamBPlayerIds([...teamBPlayerIds, p.id]);
                              }}
                              disabled={isInA}
                              className={`w-full text-left px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                isInB ? "bg-accent text-accent-foreground" : isInA ? "bg-muted/50 text-muted-foreground line-through" : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-ttb-team-b-${p.id}`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {(teamAPlayerIds.length > 0 || teamBPlayerIds.length > 0) && (teamAPlayerIds.length < 3 || teamBPlayerIds.length < 3) && (
                    <p className="text-xs text-destructive" data-testid="text-ttb-min-players">
                      Each team needs at least 3 players for the 3 Ball portion.
                    </p>
                  )}

                  <Button
                    onClick={handleCreateTwoThreeBall}
                    disabled={teamAPlayerIds.length < 3 || teamBPlayerIds.length < 3 || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-two-three-ball"
                  >
                    {createEventMatch.isPending ? "Creating..." : "Create 2 Ball / 3 Ball Match"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Check "Key" to create individual matches for that player vs each opponent.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg min-h-[40px] flex items-center">
                        <span className="font-semibold text-primary text-sm">
                          {teamAPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamAPlayerIds) : "Select players..."}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {players.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <button
                              onClick={() => togglePlayerInTeam(p.id, 'A')}
                              className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                teamAPlayerIds.includes(p.id)
                                  ? "bg-primary text-primary-foreground"
                                  : teamBPlayerIds.includes(p.id)
                                  ? "bg-muted/50 text-muted-foreground line-through"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-add-team-a-${p.id}`}
                            >
                              {p.name}
                            </button>
                            {teamAPlayerIds.includes(p.id) && (
                              <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                                <input
                                  type="checkbox"
                                  checked={keyedTeamAIds.includes(p.id)}
                                  onChange={() => toggleKeyedTeamA(p.id)}
                                  className="w-3 h-3 rounded border-border"
                                  data-testid={`checkbox-key-a-${p.id}`}
                                />
                                <Check className={`w-3 h-3 ${keyedTeamAIds.includes(p.id) ? 'text-primary' : 'text-muted-foreground'}`} />
                              </label>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 px-3 py-2 bg-accent/10 rounded-lg min-h-[40px] flex items-center">
                        <span className="font-semibold text-accent text-sm">
                          {teamBPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamBPlayerIds) : "Select players..."}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {players.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => togglePlayerInTeam(p.id, 'B')}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                              teamBPlayerIds.includes(p.id)
                                ? "bg-accent text-accent-foreground"
                                : teamAPlayerIds.includes(p.id)
                                ? "bg-muted/50 text-muted-foreground line-through"
                                : "bg-muted hover:bg-muted/80"
                            }`}
                            data-testid={`button-add-team-b-${p.id}`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {keyedTeamAIds.length > 0 && teamBPlayerIds.length > 0 && (
                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <p className="text-sm font-medium text-primary">
                        {keyedTeamAIds.length} keyed player{keyedTeamAIds.length > 1 ? 's' : ''} x {teamBPlayerIds.length} opponent{teamBPlayerIds.length > 1 ? 's' : ''} = {keyedTeamAIds.length * teamBPlayerIds.length} matches
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={handleCreateEventMatch}
                    disabled={teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0 || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-match"
                  >
                    {createEventMatch.isPending ? "Creating..." : 
                      keyedTeamAIds.length > 0 
                        ? `Create ${keyedTeamAIds.length * teamBPlayerIds.length} Matches` 
                        : "Create Match"}
                  </Button>
                </>
              )}
            </div>
            )}
          </motion.div>
        )}

        {/* Event Matches List */}
        {!matchesCollapsed && (() => {
          const filteredMatches = eventMatches.filter(em => {
            if (em.parentMatchId) return false;
            
            if (filterByMatchType !== "all" && em.matchType !== filterByMatchType) {
              return false;
            }
            
            if (filterByPlayer !== "all") {
              const playerId = parseInt(filterByPlayer);
              const allMembers = em.teams.flatMap(t => t.members.map(m => m.playerId));
              if (!allMembers.includes(playerId)) {
                return false;
              }
            }
            
            return true;
          });
          
          return eventMatches.length === 0 ? (
          <p className="text-muted-foreground text-sm mt-4">
            {players.length < 2 
              ? "Add at least 2 players to create a match." 
              : "No matches yet. Create a match to track team competition!"}
          </p>
        ) : filteredMatches.length === 0 ? (
          <p className="text-muted-foreground text-sm mt-4">
            No matches match the selected filters.
          </p>
        ) : (
          <div className="space-y-3 mt-4">
            {filteredMatches.map((em) => {
              const teamA = em.teams[0];
              const teamB = em.teams[1];
              // For Ryder Cup side matches, use the day's setting (authoritative source) for startOnBack9
              const isBack9First = match?.ryderCupEventId ? dayStartOnBack9 : (em.startOnBack9 || false);
              
              // Create a modified event match with the correct startOnBack9 for calculations
              const emWithCorrectBack9 = { ...em, startOnBack9: isBack9First };
              
              const netContext = buildMatchNetContext(emWithCorrectBack9);
              const isDeathMatch = emWithCorrectBack9.matchType === 'death_match';
              const isTwoThreeBall = emWithCorrectBack9.matchType === 'two_three_ball';
              const dmResults = isDeathMatch ? calculateDeathMatchResults(emWithCorrectBack9, scores, netContext) : null;
              const ttbResults = isTwoThreeBall ? calculateTwoThreeBallResults(emWithCorrectBack9, scores, netContext) : null;
              const results = (isDeathMatch || isTwoThreeBall) ? [] : calculateMatchPlayResults(emWithCorrectBack9, scores, netContext);
              const status = isDeathMatch && dmResults && teamA && teamB
                ? (() => {
                    const bbStatus = dmResults.bestBall.isComplete
                      ? (dmResults.bestBall.winner === 'A' ? `${teamA.name} wins BB` : dmResults.bestBall.winner === 'B' ? `${teamB.name} wins BB` : 'BB tied')
                      : (dmResults.bestBall.results.filter(r => r.teamAScore !== null && r.teamBScore !== null).length > 0 ? dmResults.bestBall.results.filter(r => r.teamAScore !== null && r.teamBScore !== null).slice(-1)[0]?.status || 'BB: N/A' : 'Not started');
                    const sbStatus = dmResults.secondBall.isComplete
                      ? (dmResults.secondBall.winner === 'A' ? `${teamA.name} wins 2nd` : dmResults.secondBall.winner === 'B' ? `${teamB.name} wins 2nd` : '2nd halved')
                      : (dmResults.secondBall.results.filter(r => r.teamAScore !== null && r.teamBScore !== null).length > 0 ? dmResults.secondBall.results.filter(r => r.teamAScore !== null && r.teamBScore !== null).slice(-1)[0]?.status || '2nd: N/A' : '');
                    return sbStatus ? `${bbStatus} | ${sbStatus}` : bbStatus;
                  })()
                : (teamA && teamB ? getMatchStatus(results, teamA, teamB, emWithCorrectBack9.matchType) : 'Not started');
              const firstNineHoles = isBack9First ? [10, 11, 12, 13, 14, 15, 16, 17, 18] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
              const secondNineHoles = isBack9First ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [10, 11, 12, 13, 14, 15, 16, 17, 18];
              const isExpanded = expandedMatch === em.id;
              const pressMatches = eventMatches.filter(pm => pm.parentMatchId === em.id);

              return (
                <div key={em.id} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center">
                    <button
                      onClick={() => setExpandedMatch(isExpanded ? null : em.id)}
                      className="flex-1 p-3 sm:p-4 flex flex-col gap-1 hover:bg-muted/30 transition-colors"
                      data-testid={`button-expand-match-${em.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Users className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                            <span className="font-semibold text-sm sm:text-base">{teamA?.name || "Team A"}</span>
                          </div>
                          <span className="text-muted-foreground text-xs sm:text-base">vs</span>
                          <div className="flex items-center gap-1 sm:gap-2">
                            <Users className="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
                            <span className="font-semibold text-sm sm:text-base">{teamB?.name || "Team B"}</span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3">
                        <span
                          className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium ${canEditScoresAndBets ? 'cursor-pointer' : ''}`}
                          onClick={(e) => {
                            if (canEditScoresAndBets) {
                              e.stopPropagation();
                              setEditingMatchTypeId(editingMatchTypeId === em.id ? null : em.id);
                            }
                          }}
                          data-testid={`text-match-type-${em.id}`}
                        >
                          {MATCH_TYPE_LABELS[em.matchType as MatchType] || em.matchType}
                          {canEditScoresAndBets && <Pencil className="w-2.5 h-2.5 inline ml-1" />}
                        </span>
                        {editingUnitAmountId === em.id ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-16 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-muted rounded-full font-medium text-center border-0 focus:ring-1 focus:ring-primary"
                            value={editUnitAmountValue}
                            onChange={(e) => setEditUnitAmountValue(e.target.value)}
                            onBlur={() => {
                              const value = parseFloat(editUnitAmountValue) || 0;
                              updateUnitAmount.mutate({ 
                                eventMatchId: em.id, 
                                unitAmount: Math.round(value * 100) 
                              });
                              setEditingUnitAmountId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const value = parseFloat(editUnitAmountValue) || 0;
                                updateUnitAmount.mutate({ 
                                  eventMatchId: em.id, 
                                  unitAmount: Math.round(value * 100) 
                                });
                                setEditingUnitAmountId(null);
                              }
                              if (e.key === 'Escape') {
                                setEditingUnitAmountId(null);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            data-testid={`input-unit-amount-${em.id}`}
                          />
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (canEditScoresAndBets) {
                                setEditUnitAmountValue(String(em.unitAmount / 100));
                                setEditingUnitAmountId(em.id);
                              }
                            }}
                            className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-muted rounded-full font-medium ${canEditScoresAndBets ? "hover:bg-muted/80 cursor-pointer" : "cursor-default"}`}
                            title={canEditScoresAndBets ? "Click to edit wager amount" : undefined}
                            data-testid={`button-edit-unit-amount-${em.id}`}
                          >
                            ${(em.unitAmount / 100).toFixed(2)}
                          </button>
                        )}
                        {match.isHandicapped && (() => {
                          const netCtx = buildMatchNetContext(emWithCorrectBack9);
                          const isNetSkipped = em.useNetScoring && !netCtx;
                          const hasMissingHandicaps = em.useNetScoring && netCtx && netCtx.playersMissingData.size > 0;
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canEditScoresAndBets) {
                                  updateNetScoring.mutate({ 
                                    eventMatchId: em.id, 
                                    useNetScoring: !em.useNetScoring 
                                  });
                                }
                              }}
                              className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-medium transition-colors ${
                                isNetSkipped || hasMissingHandicaps
                                  ? "bg-destructive/20 text-destructive"
                                  : em.useNetScoring 
                                    ? "bg-primary/20 text-primary" 
                                    : "bg-muted text-muted-foreground"
                              } ${canEditScoresAndBets ? "hover:opacity-80 cursor-pointer" : "cursor-default"}`}
                              disabled={!canEditScoresAndBets || updateNetScoring.isPending}
                              title={isNetSkipped ? "Net scoring skipped - missing handicap data or hole handicaps" : hasMissingHandicaps ? "Net scoring active but some players are missing handicap data" : undefined}
                              data-testid={`button-toggle-net-scoring-${em.id}`}
                            >
                              {em.useNetScoring ? "Net" : "Gross"}
                            </button>
                          );
                        })()}
                        <span className="text-xs sm:text-sm font-medium text-primary">{status}</span>
                      </div>
                    </button>
                    {/* Replicate to sibling days button - only for Ryder Cup side match containers, hide if already replicated */}
                    {isCreator && match?.ryderCupEventId && match?.name?.includes("Side Matches") && !em.hasBeenReplicated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mr-1 h-7 px-2 text-xs gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          replicateEventMatch.mutate(em.id, {
                            onSuccess: (result) => {
                              toast({ title: result.message });
                            },
                            onError: (error) => {
                              toast({ title: "Error", description: error.message, variant: "destructive" });
                            },
                          });
                        }}
                        disabled={replicateEventMatch.isPending}
                        title="Copy this betting game to all future days"
                        data-testid={`button-replicate-match-${em.id}`}
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy forward</span>
                      </Button>
                    )}
                    {isCreator && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this match?')) {
                            deleteEventMatch.mutate(em.id);
                          }
                        }}
                        disabled={deleteEventMatch.isPending}
                        data-testid={`button-delete-match-${em.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {editingMatchTypeId === em.id && (
                    <div className="border-t border-border bg-muted/30 px-3 py-2">
                      <select
                        className="w-full text-xs sm:text-sm px-2 py-1.5 bg-background border border-border rounded-md font-medium cursor-pointer focus:ring-1 focus:ring-primary focus:outline-none"
                        value={em.matchType}
                        disabled={updateMatchType.isPending}
                        onChange={(e) => {
                          updateMatchType.mutate({
                            eventMatchId: em.id,
                            matchType: e.target.value,
                          }, {
                            onError: () => {
                              toast({ title: "Failed to update match type", variant: "destructive" });
                            },
                          });
                          setEditingMatchTypeId(null);
                        }}
                        onBlur={() => setEditingMatchTypeId(null)}
                        autoFocus
                        data-testid={`select-match-type-${em.id}`}
                      >
                        {sortedMatchOptions.filter(opt => !(opt as any).isWizard).map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Collapsed Press Matches */}
                  {!isExpanded && pressMatches.length > 0 && (
                    <div className="px-4 pb-3 space-y-1">
                      {pressMatches.map((pm) => {
                        // Press matches inherit startOnBack9 from parent
                        const pmWithCorrectBack9 = { ...pm, startOnBack9: isBack9First };
                        const pressNetContext = buildMatchNetContext(pmWithCorrectBack9);
                        const pressResults = calculateMatchPlayResults(pmWithCorrectBack9, scores, pressNetContext);
                        const pressTeamA = pm.teams[0];
                        const pressTeamB = pm.teams[1];
                        const pressStatus = pressTeamA && pressTeamB ? getMatchStatus(pressResults, pressTeamA, pressTeamB, pm.matchType) : 'Not started';
                        return (
                          <div 
                            key={pm.id} 
                            className="flex items-center justify-between text-xs py-1 px-3 bg-muted/30 rounded"
                            data-testid={`press-collapsed-${pm.id}`}
                          >
                            <span className="font-medium">Press (Hole {pm.startHole})</span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-muted rounded-full">
                                ${(pm.unitAmount / 100).toFixed(2)}
                              </span>
                              <span className="font-medium text-primary">{pressStatus}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 space-y-4">
                        {/* Skins Match View */}
                        {em.matchType === 'skins' ? (() => {
                          const includedPlayerIds = teamA?.members.map(m => m.playerId) || [];
                          const playerNames = new Map<number, string>();
                          teamA?.members.forEach(m => {
                            playerNames.set(m.playerId, m.player?.name || `Player ${m.playerId}`);
                          });
                          // Build pars array for skins calculation
                          const skinsParsArray = matchCourse?.holes.length 
                            ? Array.from({ length: 18 }, (_, i) => {
                                const hole = matchCourse.holes.find(h => h.holeNumber === i + 1);
                                return hole?.par ?? 4;
                              })
                            : null;
                          const skinsResult = calculateSkinsResults(includedPlayerIds, playerNames, scores, (em.unitAmount || 0) / 100, netContext, skinsParsArray);
                          
                          return (
                            <div className="space-y-4">
                              {/* Players in Skins */}
                              <div>
                                <p className="font-medium text-primary mb-2">Players ({includedPlayerIds.length})</p>
                                <div className="flex flex-wrap gap-1">
                                  {teamA?.members.map((m) => {
                                    const playerSkins = skinsResult.skinWinners.find(w => w.playerId === m.playerId);
                                    return (
                                      <span key={m.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                        {m.player?.name} {playerSkins?.skinsWon ? `(${playerSkins.skinsWon})` : ''}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Skins Scoreboard */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="p-2 text-left font-semibold">Hole</th>
                                      {firstNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                      {secondNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                                      <th className="p-2 text-center font-semibold bg-muted/30">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Skin Winners Row */}
                                    <tr className="border-b border-border/50 bg-primary/5">
                                      <td className="p-2 font-semibold">Skin Won</td>
                                      {firstNineHoles.map((hole) => {
                                        const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                        const r = skinsResult.holeResults[playingPos - 1];
                                        return (
                                          <td 
                                            key={hole} 
                                            className={`p-2 text-center ${r?.isSkin ? 'bg-primary/20 text-primary font-bold' : ''}`}
                                          >
                                            {r?.isSkin ? r.winnerName?.split(' ')[0] : (r?.lowestScore !== null ? '-' : '')}
                                          </td>
                                        );
                                      })}
                                      <td className="p-2 text-center font-semibold bg-muted/30">
                                        {firstNineHoles.reduce((count, hole) => {
                                          const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                          const r = skinsResult.holeResults[playingPos - 1];
                                          return count + (r?.isSkin ? 1 : 0);
                                        }, 0)}
                                      </td>
                                      {secondNineHoles.map((hole) => {
                                        const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                        const r = skinsResult.holeResults[playingPos - 1];
                                        return (
                                          <td 
                                            key={hole} 
                                            className={`p-2 text-center ${r?.isSkin ? 'bg-primary/20 text-primary font-bold' : ''}`}
                                          >
                                            {r?.isSkin ? r.winnerName?.split(' ')[0] : (r?.lowestScore !== null ? '-' : '')}
                                          </td>
                                        );
                                      })}
                                      <td className="p-2 text-center font-semibold bg-muted/30">
                                        {secondNineHoles.reduce((count, hole) => {
                                          const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                          const r = skinsResult.holeResults[playingPos - 1];
                                          return count + (r?.isSkin ? 1 : 0);
                                        }, 0)}
                                      </td>
                                      <td className="p-2 text-center font-bold bg-muted/30">
                                        {skinsResult.totalSkins}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              {/* Skins Summary */}
                              <div className="flex justify-between items-center pt-2 border-t border-border">
                                <div className="text-sm">
                                  <span className="font-medium">Total Pool: </span>
                                  <span className="font-bold">${skinsResult.totalPool.toFixed(2)}</span>
                                  <span className="text-muted-foreground mx-2">|</span>
                                  <span className="font-medium">Skins: </span>
                                  <span className="font-bold">{skinsResult.totalSkins}</span>
                                  {skinsResult.totalSkins > 0 && (
                                    <>
                                      <span className="text-muted-foreground mx-2">|</span>
                                      <span className="font-medium">Value each: </span>
                                      <span className="font-bold">${skinsResult.skinValue.toFixed(2)}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Skins Payouts */}
                              {skinsResult.isComplete && skinsResult.settlements.length > 0 && (
                                <div className="pt-3 border-t border-border">
                                  <h5 className="font-semibold text-sm mb-2">Settlements</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {skinsResult.settlements.map((s) => (
                                      <span 
                                        key={s.playerId}
                                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                                          s.amount > 0 
                                            ? 'bg-primary/10 text-primary' 
                                            : s.amount < 0 
                                            ? 'bg-destructive/10 text-destructive'
                                            : 'bg-muted text-muted-foreground'
                                        }`}
                                      >
                                        {s.playerName}: {s.amount > 0 ? '+' : ''}{s.amount === 0 ? 'Even' : `$${s.amount.toFixed(2)}`}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Course Handicaps for Net Skins (Editable by creator) */}
                              {em.useNetScoring && netContext && (() => {
                                const hasMissingPlayers = netContext.playersMissingData.size > 0;
                                return (
                                  <div className={`rounded-lg p-3 ${hasMissingPlayers ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/30'}`}>
                                    <div className="flex items-center gap-1.5 mb-2">
                                      {hasMissingPlayers && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                                      <p className="text-xs font-medium text-muted-foreground">
                                        {hasMissingPlayers
                                          ? 'Some players need handicap info — tap to enter course handicap'
                                          : 'Course Handicaps (click to edit)'}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {(teamA?.members || []).map((m) => {
                                        const overrides = matchHandicapOverrides?.get(em.id) || [];
                                        const override = overrides.find(o => o.playerId === m.playerId);
                                        const isMissingData = netContext.playersMissingData.has(m.playerId);
                                        const calculatedHcp = netContext.courseHandicaps?.get(m.playerId);
                                        const displayHcp = override ? override.courseHandicap : (isMissingData ? null : calculatedHcp);
                                        const isEditing = editingMatchCourseHcp?.eventMatchId === em.id && editingMatchCourseHcp?.playerId === m.playerId;
                                        const hasOverride = !!override;
                                        return (
                                          <div key={m.playerId} className="flex items-center gap-1">
                                            <span className={`text-xs ${isMissingData && !hasOverride ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{m.player?.name}:</span>
                                            {isEditing && canEditScoresAndBets ? (
                                              <Input
                                                type="number"
                                                value={matchCourseHcpEditValue}
                                                onChange={(e) => setMatchCourseHcpEditValue(e.target.value)}
                                                onBlur={() => {
                                                  const val = parseInt(matchCourseHcpEditValue, 10);
                                                  if (!isNaN(val)) {
                                                    upsertMatchHandicap.mutate({ eventMatchId: em.id, playerId: m.playerId, courseHandicap: val });
                                                  }
                                                  setEditingMatchCourseHcp(null);
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    const val = parseInt(matchCourseHcpEditValue, 10);
                                                    if (!isNaN(val)) {
                                                      upsertMatchHandicap.mutate({ eventMatchId: em.id, playerId: m.playerId, courseHandicap: val });
                                                    }
                                                    setEditingMatchCourseHcp(null);
                                                  } else if (e.key === 'Escape') {
                                                    setEditingMatchCourseHcp(null);
                                                  }
                                                }}
                                                className="w-14 h-6 text-xs p-1"
                                                autoFocus
                                                data-testid={`input-match-course-hcp-${em.id}-${m.playerId}`}
                                              />
                                            ) : (
                                              <>
                                                <button
                                                  onClick={() => {
                                                    if (canEditScoresAndBets) {
                                                      setEditingMatchCourseHcp({ eventMatchId: em.id, playerId: m.playerId });
                                                      setMatchCourseHcpEditValue(displayHcp?.toString() ?? '');
                                                    }
                                                  }}
                                                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                                    isMissingData && !hasOverride
                                                      ? 'bg-destructive/20 text-destructive border border-destructive/30 animate-pulse'
                                                      : hasOverride
                                                        ? 'bg-primary/20 text-primary border border-primary/30'
                                                        : 'bg-muted text-muted-foreground'
                                                  } ${canEditScoresAndBets ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-default'}`}
                                                  disabled={!canEditScoresAndBets}
                                                  title={isMissingData && !hasOverride ? 'No handicap data — click to enter course handicap' : hasOverride ? 'Custom override (click to edit)' : 'Calculated from handicap index (click to override)'}
                                                  data-testid={`button-edit-match-course-hcp-${em.id}-${m.playerId}`}
                                                >
                                                  {displayHcp ?? '-'}
                                                </button>
                                                {canEditScoresAndBets && !isMissingData && calculatedHcp !== undefined && (
                                                  <button
                                                    onClick={() => {
                                                      upsertMatchHandicap.mutate({ eventMatchId: em.id, playerId: m.playerId, courseHandicap: calculatedHcp });
                                                    }}
                                                    className="p-0.5 rounded text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                                    title={`Reset to default (${calculatedHcp})`}
                                                    data-testid={`button-reset-match-course-hcp-${em.id}-${m.playerId}`}
                                                  >
                                                    <RotateCcw className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })() : em.matchType === 'five_five_five_three' ? (() => {
                          // 5-5-5-3 Match View
                          const fiveResult = calculateFiveMatchResults(emWithCorrectBack9, scores, netContext);
                          const unitAmt = (em.unitAmount || 100) / 100; // Convert cents to dollars
                          const fiveSettlements = calculateFiveSettlements(fiveResult.teamTotals, unitAmt, fiveResult.isComplete);
                          const teamColors = ['text-primary bg-primary/10', 'text-accent bg-accent/10', 'text-orange-700 bg-orange-100', 'text-purple-700 bg-purple-100'];
                          
                          return (
                            <div className="space-y-4">
                              {/* Teams */}
                              <div>
                                <p className="font-medium text-muted-foreground mb-2">Teams ({em.teams.length})</p>
                                <div className="flex flex-wrap gap-2">
                                  {em.teams.map((team, idx) => (
                                    <div key={team.id} className={`px-3 py-1.5 rounded-lg ${teamColors[idx] || 'bg-muted text-foreground'}`}>
                                      <span className="font-semibold text-sm">{team.name}</span>
                                      <span className="text-xs ml-2">({team.members.length} players)</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Scoring Info */}
                              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                                <p className="font-medium mb-1">Best Ball Format:</p>
                                <div className="flex flex-wrap gap-3">
                                  <span>Holes 1-5: 1 ball</span>
                                  <span>Holes 6-10: 2 balls</span>
                                  <span>Holes 11-15: 3 balls</span>
                                  <span>Holes 16-18: {fiveResult.smallestTeamSize} ball{fiveResult.smallestTeamSize !== 1 ? 's' : ''}</span>
                                </div>
                              </div>
                              
                              {/* Hole-by-Hole Scoreboard */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="p-2 text-left font-semibold sticky left-0 bg-background">Team</th>
                                      {firstNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium min-w-[28px]">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                      {secondNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium min-w-[28px]">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                                      <th className="p-2 text-center font-semibold bg-muted/30">Tot</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {fiveResult.teamTotals.map((teamTotal, idx) => {
                                      const firstNineTotal = firstNineHoles.reduce((sum, hole) => {
                                        const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                        const hr = fiveResult.holeResults[playingPos - 1];
                                        const teamScore = hr?.teamScores.find(ts => ts.teamIndex === idx)?.score;
                                        return sum + (teamScore || 0);
                                      }, 0);
                                      const secondNineTotal = secondNineHoles.reduce((sum, hole) => {
                                        const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                        const hr = fiveResult.holeResults[playingPos - 1];
                                        const teamScore = hr?.teamScores.find(ts => ts.teamIndex === idx)?.score;
                                        return sum + (teamScore || 0);
                                      }, 0);
                                      const teamTextColor = teamColors[idx]?.split(' ')[0] || '';
                                      return (
                                        <tr key={teamTotal.teamIndex} className="border-b border-border/50">
                                          <td className={`p-2 font-semibold sticky left-0 bg-background ${teamTextColor}`}>
                                            {teamTotal.teamName.length > 15 ? teamTotal.teamName.substring(0, 15) + '...' : teamTotal.teamName}
                                          </td>
                                          {firstNineHoles.map((hole) => {
                                            const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                            const hr = fiveResult.holeResults[playingPos - 1];
                                            const teamScore = hr?.teamScores.find(ts => ts.teamIndex === idx)?.score;
                                            return (
                                              <td key={hole} className="p-2 text-center">
                                                {teamScore || '-'}
                                              </td>
                                            );
                                          })}
                                          <td className="p-2 text-center font-semibold bg-muted/30">{firstNineTotal || '-'}</td>
                                          {secondNineHoles.map((hole) => {
                                            const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                            const hr = fiveResult.holeResults[playingPos - 1];
                                            const teamScore = hr?.teamScores.find(ts => ts.teamIndex === idx)?.score;
                                            return (
                                              <td key={hole} className="p-2 text-center">
                                                {teamScore || '-'}
                                              </td>
                                            );
                                          })}
                                          <td className="p-2 text-center font-semibold bg-muted/30">{secondNineTotal || '-'}</td>
                                          <td className="p-2 text-center font-bold bg-muted/30">
                                            {teamTotal.totalScore || '-'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              
                              {/* Settlements */}
                              {fiveResult.isComplete && (
                                <div className="pt-3 border-t border-border">
                                  <h5 className="font-semibold text-sm mb-2">Team Settlements (${unitAmt}/stroke)</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {fiveSettlements.map((s) => (
                                      <span 
                                        key={s.teamIndex}
                                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                                          s.amount > 0 
                                            ? 'bg-primary/10 text-primary' 
                                            : s.amount < 0 
                                            ? 'bg-destructive/10 text-destructive'
                                            : 'bg-muted text-muted-foreground'
                                        }`}
                                      >
                                        {s.teamName}: {s.amount > 0 ? '+' : ''}{s.amount === 0 ? 'Even' : `$${s.amount.toFixed(2)}`}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })() : em.matchType === 'death_match' && dmResults ? (() => {
                          const allPlayers = [...(teamA?.members || []), ...(teamB?.members || [])];
                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="font-medium text-primary mb-1">{teamA?.name}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {teamA?.members.map((m) => (
                                      <span key={m.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                        {m.player?.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium text-accent mb-1">{teamB?.name}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {teamB?.members.map((m) => (
                                      <span key={m.id} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                                        {m.player?.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {em.useNetScoring && netContext && (() => {
                                const hasMissingPlayers = netContext.playersMissingData.size > 0;
                                return (
                                  <div className={`rounded-lg p-3 ${hasMissingPlayers ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/30'}`}>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Course Handicaps</p>
                                    <div className="flex flex-wrap gap-2">
                                      {allPlayers.map((m) => {
                                        const isMissing = netContext.playersMissingData.has(m.playerId);
                                        const hcp = netContext.courseHandicaps?.get(m.playerId);
                                        return (
                                          <span key={m.playerId} className={`text-xs ${isMissing ? 'text-destructive' : 'text-muted-foreground'}`}>
                                            {m.player?.name}: {hcp ?? '-'}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}

                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="p-2 text-left font-semibold sticky left-0 bg-background min-w-[80px]">Player</th>
                                      {firstNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium min-w-[28px]">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                      {secondNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium min-w-[28px]">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                                      <th className="p-2 text-center font-semibold bg-muted/30">Tot</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {allPlayers.map((m) => {
                                      const isTeamA = teamA?.members.some(tm => tm.playerId === m.playerId);
                                      const colorClass = isTeamA ? 'text-primary' : 'text-accent';
                                      const bgClass = isTeamA ? 'bg-primary/5' : 'bg-accent/5';
                                      const firstNineTotal = firstNineHoles.reduce((sum, hole) => {
                                        const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                        return sum + (s?.strokes || 0);
                                      }, 0);
                                      const secondNineTotal = secondNineHoles.reduce((sum, hole) => {
                                        const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                        return sum + (s?.strokes || 0);
                                      }, 0);
                                      return (
                                        <tr key={m.playerId} className={`border-b border-border/30 ${bgClass}`}>
                                          <td className={`p-2 font-medium sticky left-0 bg-background ${colorClass} text-xs`}>{m.player?.name}</td>
                                          {firstNineHoles.map((hole) => {
                                            const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                            return <td key={hole} className="p-2 text-center">{s?.strokes ?? '-'}</td>;
                                          })}
                                          <td className="p-2 text-center font-semibold bg-muted/30">{firstNineTotal || '-'}</td>
                                          {secondNineHoles.map((hole) => {
                                            const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                            return <td key={hole} className="p-2 text-center">{s?.strokes ?? '-'}</td>;
                                          })}
                                          <td className="p-2 text-center font-semibold bg-muted/30">{secondNineTotal || '-'}</td>
                                          <td className="p-2 text-center font-bold bg-muted/30">{(firstNineTotal + secondNineTotal) || '-'}</td>
                                        </tr>
                                      );
                                    })}

                                    <tr className="border-t-2 border-border">
                                      <td colSpan={firstNineHoles.length + secondNineHoles.length + 4} className="p-1"></td>
                                    </tr>

                                    <tr className="border-b border-border/50 bg-blue-50/50 dark:bg-blue-950/30">
                                      <td className="p-2 font-semibold sticky left-0 bg-blue-50/50 dark:bg-blue-950/30 text-xs">BB - {teamA?.name}</td>
                                      {firstNineHoles.map((hole) => {
                                        const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.teamAScore !== null && r?.teamBScore !== null && r.teamAScore! < r.teamBScore!;
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                            {r?.teamAScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      {(() => {
                                        const firstNineBBTotal = firstNineHoles.reduce((sum, hole) => {
                                          const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                          return sum + (r?.teamAScore || 0);
                                        }, 0);
                                        return <td className="p-2 text-center font-semibold bg-muted/30">{firstNineBBTotal || '-'}</td>;
                                      })()}
                                      {secondNineHoles.map((hole) => {
                                        const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.teamAScore !== null && r?.teamBScore !== null && r.teamAScore! < r.teamBScore!;
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                            {r?.teamAScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      {(() => {
                                        const secondNineBBTotal = secondNineHoles.reduce((sum, hole) => {
                                          const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                          return sum + (r?.teamAScore || 0);
                                        }, 0);
                                        return <td className="p-2 text-center font-semibold bg-muted/30">{secondNineBBTotal || '-'}</td>;
                                      })()}
                                      <td className="p-2 text-center font-bold bg-muted/30">{dmResults.bestBall.totalA || '-'}</td>
                                    </tr>
                                    <tr className="border-b border-border/50 bg-blue-50/50 dark:bg-blue-950/30">
                                      <td className="p-2 font-semibold sticky left-0 bg-blue-50/50 dark:bg-blue-950/30 text-xs">BB - {teamB?.name}</td>
                                      {firstNineHoles.map((hole) => {
                                        const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.teamAScore !== null && r?.teamBScore !== null && r.teamBScore! < r.teamAScore!;
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                            {r?.teamBScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      {(() => {
                                        const firstNineBBTotal = firstNineHoles.reduce((sum, hole) => {
                                          const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                          return sum + (r?.teamBScore || 0);
                                        }, 0);
                                        return <td className="p-2 text-center font-semibold bg-muted/30">{firstNineBBTotal || '-'}</td>;
                                      })()}
                                      {secondNineHoles.map((hole) => {
                                        const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.teamAScore !== null && r?.teamBScore !== null && r.teamBScore! < r.teamAScore!;
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                            {r?.teamBScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      {(() => {
                                        const secondNineBBTotal = secondNineHoles.reduce((sum, hole) => {
                                          const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                          return sum + (r?.teamBScore || 0);
                                        }, 0);
                                        return <td className="p-2 text-center font-semibold bg-muted/30">{secondNineBBTotal || '-'}</td>;
                                      })()}
                                      <td className="p-2 text-center font-bold bg-muted/30">{dmResults.bestBall.totalB || '-'}</td>
                                    </tr>

                                    <tr className="bg-blue-50/50 dark:bg-blue-950/30">
                                      <td className="p-2 font-semibold sticky left-0 bg-blue-50/50 dark:bg-blue-950/30 text-xs">BB Status</td>
                                      {firstNineHoles.map((hole) => {
                                        const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                        if (!r || r.teamAScore === null || r.teamBScore === null) return <td key={hole} className="p-2 text-center">-</td>;
                                        const diff = r.cumulativeA - r.cumulativeB;
                                        if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-[10px]">{Math.abs(diff)} UP</td>;
                                        if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-[10px]">{diff} UP</td>;
                                        return <td key={hole} className="p-2 text-center text-muted-foreground text-[10px]">AS</td>;
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      {secondNineHoles.map((hole) => {
                                        const r = dmResults.bestBall.results.find(res => res.holeNumber === hole);
                                        if (!r || r.teamAScore === null || r.teamBScore === null) return <td key={hole} className="p-2 text-center">-</td>;
                                        const diff = r.cumulativeA - r.cumulativeB;
                                        if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-[10px]">{Math.abs(diff)} UP</td>;
                                        if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-[10px]">{diff} UP</td>;
                                        return <td key={hole} className="p-2 text-center text-muted-foreground text-[10px]">AS</td>;
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      <td className="p-2 text-center bg-muted/30"></td>
                                    </tr>

                                    <tr className="border-t-2 border-border">
                                      <td colSpan={firstNineHoles.length + secondNineHoles.length + 4} className="p-1"></td>
                                    </tr>

                                    <tr className="border-b border-border/50 bg-orange-50/50 dark:bg-orange-950/30">
                                      <td className="p-2 font-semibold sticky left-0 bg-orange-50/50 dark:bg-orange-950/30 text-xs">2nd - {teamA?.name}</td>
                                      {firstNineHoles.map((hole) => {
                                        const r = dmResults.secondBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.winner === 'A';
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                            {r?.teamAScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      {secondNineHoles.map((hole) => {
                                        const r = dmResults.secondBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.winner === 'A';
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                            {r?.teamAScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      <td className="p-2 text-center bg-muted/30"></td>
                                    </tr>
                                    <tr className="border-b border-border/50 bg-orange-50/50 dark:bg-orange-950/30">
                                      <td className="p-2 font-semibold sticky left-0 bg-orange-50/50 dark:bg-orange-950/30 text-xs">2nd - {teamB?.name}</td>
                                      {firstNineHoles.map((hole) => {
                                        const r = dmResults.secondBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.winner === 'B';
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                            {r?.teamBScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      {secondNineHoles.map((hole) => {
                                        const r = dmResults.secondBall.results.find(res => res.holeNumber === hole);
                                        const isWinning = r?.winner === 'B';
                                        return (
                                          <td key={hole} className={`p-2 text-center ${isWinning ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                            {r?.teamBScore ?? '-'}
                                          </td>
                                        );
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      <td className="p-2 text-center bg-muted/30"></td>
                                    </tr>

                                    <tr className="bg-orange-50/50 dark:bg-orange-950/30">
                                      <td className="p-2 font-semibold sticky left-0 bg-orange-50/50 dark:bg-orange-950/30 text-xs">2nd Status</td>
                                      {firstNineHoles.map((hole) => {
                                        const r = dmResults.secondBall.results.find(res => res.holeNumber === hole);
                                        if (!r || r.teamAScore === null || r.teamBScore === null) return <td key={hole} className="p-2 text-center">-</td>;
                                        const diff = r.cumulativeA - r.cumulativeB;
                                        if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-[10px]">{diff} UP</td>;
                                        if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-[10px]">{Math.abs(diff)} UP</td>;
                                        return <td key={hole} className="p-2 text-center text-muted-foreground text-[10px]">AS</td>;
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      {secondNineHoles.map((hole) => {
                                        const r = dmResults.secondBall.results.find(res => res.holeNumber === hole);
                                        if (!r || r.teamAScore === null || r.teamBScore === null) return <td key={hole} className="p-2 text-center">-</td>;
                                        const diff = r.cumulativeA - r.cumulativeB;
                                        if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-[10px]">{diff} UP</td>;
                                        if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-[10px]">{Math.abs(diff)} UP</td>;
                                        return <td key={hole} className="p-2 text-center text-muted-foreground text-[10px]">AS</td>;
                                      })}
                                      <td className="p-2 text-center bg-muted/30"></td>
                                      <td className="p-2 text-center bg-muted/30"></td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
                                <p className="font-medium text-muted-foreground">
                                  Best Ball (Stroke Play): ${((em.deathMatchBestBallBet || em.unitAmount || 0) / 100).toFixed(2)} — {dmResults.bestBall.isComplete ? (dmResults.bestBall.winner === 'A' ? `${teamA?.name} wins` : dmResults.bestBall.winner === 'B' ? `${teamB?.name} wins` : 'Tied') : `${teamA?.name}: ${dmResults.bestBall.totalA} | ${teamB?.name}: ${dmResults.bestBall.totalB}`}
                                </p>
                                <p className="font-medium text-muted-foreground">
                                  Second Ball (Match Play): ${((em.deathMatchSecondBallBet || Math.round((em.unitAmount || 0) / 2)) / 100).toFixed(2)} — {dmResults.secondBall.isComplete ? (dmResults.secondBall.winner === 'A' ? `${teamA?.name} wins` : dmResults.secondBall.winner === 'B' ? `${teamB?.name} wins` : 'Halved') : `${teamA?.name}: ${dmResults.secondBall.holesWonA} | ${teamB?.name}: ${dmResults.secondBall.holesWonB}`}
                                </p>
                              </div>
                            </div>
                          );
                        })() : em.matchType === 'two_three_ball' && ttbResults && teamA && teamB ? (() => {
                          const allPlayers = [...(teamA.members || []), ...(teamB.members || [])];
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
                          const twoBallNs = calculateNassauSettlements(twoBallBetCents, teamA, teamB, ttbResults.twoBall, twoBallAutoPress);
                          const threeBallNs = calculateNassauSettlements(threeBallBetCents, teamA, teamB, ttbResults.threeBall, threeBallAutoPress);

                          const renderLegSummary = (label: string, nassau: typeof ttbResults.twoBall) => {
                            const legRow = (legName: string, holes: typeof nassau.front9) => {
                              const last = holes.filter(h => h.teamAScore !== null && h.teamBScore !== null).slice(-1)[0];
                              const status = last ? last.status : 'Not started';
                              const finalA = holes[holes.length - 1]?.cumulativeA ?? 0;
                              const finalB = holes[holes.length - 1]?.cumulativeB ?? 0;
                              return (
                                <tr className="border-b border-border/30" data-testid={`row-ttb-${label}-${legName}`}>
                                  <td className="p-2 font-medium">{legName}</td>
                                  <td className="p-2 text-center">{finalA}</td>
                                  <td className="p-2 text-center">{finalB}</td>
                                  <td className="p-2 text-xs text-muted-foreground">{status}</td>
                                </tr>
                              );
                            };
                            return (
                              <div className="rounded-lg border border-border overflow-hidden">
                                <div className="px-3 py-2 bg-muted/40 text-sm font-semibold">{label}</div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border bg-muted/20">
                                      <th className="p-2 text-left font-medium">Leg</th>
                                      <th className="p-2 text-center font-medium">{teamA.name}</th>
                                      <th className="p-2 text-center font-medium">{teamB.name}</th>
                                      <th className="p-2 text-left font-medium">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {legRow('Front 9', nassau.front9)}
                                    {legRow('Back 9', nassau.back9)}
                                    {legRow('Overall', nassau.overall)}
                                  </tbody>
                                </table>
                              </div>
                            );
                          };

                          const renderSettlements = (label: string, settlements: ReturnType<typeof calculateNassauSettlements>) => {
                            return (
                              <div className="space-y-1">
                                <p className="text-sm font-semibold">{label} Settlements</p>
                                <div className="flex flex-wrap gap-2">
                                  {settlements.map((ns, idx) => (
                                    <span
                                      key={`${label}-${ns.betName}-${idx}`}
                                      className={`px-3 py-1 rounded-lg text-xs ${ns.settlement.isComplete ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}
                                      data-testid={`badge-ttb-${label}-${ns.betName.replace(/\s+/g, '-').toLowerCase()}`}
                                    >
                                      {ns.betName}{ns.autoPressTriggered ? ' (auto-press)' : ''}: ${(ns.settlement.totalPot / 100).toFixed(2)} {ns.settlement.isComplete ? '✓' : '…'}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          };

                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="font-medium text-primary mb-1">{teamA.name}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {teamA.members.map((m) => (
                                      <span key={m.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                        {m.player?.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="font-medium text-accent mb-1">{teamB.name}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {teamB.members.map((m) => (
                                      <span key={m.id} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                                        {m.player?.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="p-2 text-left font-semibold sticky left-0 bg-background min-w-[80px]">Player</th>
                                      {firstNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium min-w-[28px]">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                      {secondNineHoles.map((hole) => (
                                        <th key={hole} className="p-2 text-center font-medium min-w-[28px]">{hole}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                                      <th className="p-2 text-center font-semibold bg-muted/30">Tot</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {allPlayers.map((m) => {
                                      const isTeamA = teamA.members.some(tm => tm.playerId === m.playerId);
                                      const colorClass = isTeamA ? 'text-primary' : 'text-accent';
                                      const bgClass = isTeamA ? 'bg-primary/5' : 'bg-accent/5';
                                      const firstNineTotal = firstNineHoles.reduce((sum, hole) => {
                                        const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                        return sum + (s?.strokes || 0);
                                      }, 0);
                                      const secondNineTotal = secondNineHoles.reduce((sum, hole) => {
                                        const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                        return sum + (s?.strokes || 0);
                                      }, 0);
                                      return (
                                        <tr key={m.playerId} className={`border-b border-border/30 ${bgClass}`}>
                                          <td className={`p-2 font-medium sticky left-0 bg-background ${colorClass} text-xs`}>{m.player?.name}</td>
                                          {firstNineHoles.map((hole) => {
                                            const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                            return <td key={hole} className="p-2 text-center">{s?.strokes ?? '-'}</td>;
                                          })}
                                          <td className="p-2 text-center font-semibold bg-muted/30">{firstNineTotal || '-'}</td>
                                          {secondNineHoles.map((hole) => {
                                            const s = scores.find((sc: Score) => sc.playerId === m.playerId && sc.holeNumber === hole);
                                            return <td key={hole} className="p-2 text-center">{s?.strokes ?? '-'}</td>;
                                          })}
                                          <td className="p-2 text-center font-semibold bg-muted/30">{secondNineTotal || '-'}</td>
                                          <td className="p-2 text-center font-bold bg-muted/30">{(firstNineTotal + secondNineTotal) || '-'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {renderLegSummary(`2 Ball — $${(twoBallBetCents / 100).toFixed(2)}/leg`, ttbResults.twoBall)}
                                {renderLegSummary(`3 Ball — $${(threeBallBetCents / 100).toFixed(2)}/leg`, ttbResults.threeBall)}
                              </div>

                              <div className="p-3 bg-muted/30 rounded-lg space-y-3">
                                {renderSettlements('2 Ball', twoBallNs)}
                                {renderSettlements('3 Ball', threeBallNs)}
                              </div>
                            </div>
                          );
                        })() : (
                        <>
                        {/* Team Members */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium text-primary mb-1">{teamA?.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {teamA?.members.map((m) => (
                                <span key={m.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                  {m.player?.name}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium text-accent mb-1">{teamB?.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {teamB?.members.map((m) => (
                                <span key={m.id} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                                  {m.player?.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Course Handicaps for Net Matches (Editable by creator) */}
                        {em.useNetScoring && netContext && (() => {
                          const hasMissingPlayers = netContext.playersMissingData.size > 0;
                          return (
                          <div className={`rounded-lg p-3 ${hasMissingPlayers ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted/30'}`}>
                            <div className="flex items-center gap-1.5 mb-2">
                              {hasMissingPlayers && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />}
                              <p className="text-xs font-medium text-muted-foreground">
                                {hasMissingPlayers 
                                  ? 'Some players need handicap info — tap to enter course handicap' 
                                  : 'Course Handicaps (click to edit)'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {[...(teamA?.members || []), ...(teamB?.members || [])].map((m) => {
                                const overrides = matchHandicapOverrides?.get(em.id) || [];
                                const override = overrides.find(o => o.playerId === m.playerId);
                                const isMissingData = netContext.playersMissingData.has(m.playerId);
                                const calculatedHcp = netContext.courseHandicaps?.get(m.playerId);
                                const displayHcp = override ? override.courseHandicap : (isMissingData ? null : calculatedHcp);
                                const isEditing = editingMatchCourseHcp?.eventMatchId === em.id && editingMatchCourseHcp?.playerId === m.playerId;
                                const hasOverride = !!override;
                                
                                return (
                                  <div key={m.playerId} className="flex items-center gap-1">
                                    <span className={`text-xs ${isMissingData && !hasOverride ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>{m.player?.name}:</span>
                                    {isEditing && canEditScoresAndBets ? (
                                      <Input
                                        type="number"
                                        value={matchCourseHcpEditValue}
                                        onChange={(e) => setMatchCourseHcpEditValue(e.target.value)}
                                        onBlur={() => {
                                          const val = parseInt(matchCourseHcpEditValue, 10);
                                          if (!isNaN(val)) {
                                            upsertMatchHandicap.mutate({
                                              eventMatchId: em.id,
                                              playerId: m.playerId,
                                              courseHandicap: val,
                                            });
                                          }
                                          setEditingMatchCourseHcp(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const val = parseInt(matchCourseHcpEditValue, 10);
                                            if (!isNaN(val)) {
                                              upsertMatchHandicap.mutate({
                                                eventMatchId: em.id,
                                                playerId: m.playerId,
                                                courseHandicap: val,
                                              });
                                            }
                                            setEditingMatchCourseHcp(null);
                                          } else if (e.key === 'Escape') {
                                            setEditingMatchCourseHcp(null);
                                          }
                                        }}
                                        className="w-14 h-6 text-xs p-1"
                                        autoFocus
                                        data-testid={`input-match-course-hcp-${em.id}-${m.playerId}`}
                                      />
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => {
                                            if (canEditScoresAndBets) {
                                              setEditingMatchCourseHcp({ eventMatchId: em.id, playerId: m.playerId });
                                              setMatchCourseHcpEditValue(displayHcp?.toString() ?? '');
                                            }
                                          }}
                                          className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                            isMissingData && !hasOverride
                                              ? 'bg-destructive/20 text-destructive border border-destructive/30 animate-pulse'
                                              : hasOverride 
                                                ? 'bg-primary/20 text-primary border border-primary/30' 
                                                : 'bg-muted text-muted-foreground'
                                          } ${canEditScoresAndBets ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-default'}`}
                                          disabled={!canEditScoresAndBets}
                                          title={isMissingData && !hasOverride ? 'No handicap data — click to enter course handicap' : hasOverride ? 'Custom override (click to edit)' : 'Calculated from handicap index (click to override)'}
                                          data-testid={`button-edit-match-course-hcp-${em.id}-${m.playerId}`}
                                        >
                                          {displayHcp ?? '-'}
                                        </button>
                                        {canEditScoresAndBets && !isMissingData && calculatedHcp !== undefined && (
                                          <button
                                            onClick={() => {
                                              upsertMatchHandicap.mutate({
                                                eventMatchId: em.id,
                                                playerId: m.playerId,
                                                courseHandicap: calculatedHcp,
                                              });
                                            }}
                                            className="p-0.5 rounded text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                            title={`Reset to default (${calculatedHcp})`}
                                            data-testid={`button-reset-match-course-hcp-${em.id}-${m.playerId}`}
                                          >
                                            <RotateCcw className="w-3 h-3" />
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          );
                        })()}

                        {/* Match Play Scoreboard */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="p-2 text-left font-semibold">Hole</th>
                                {firstNineHoles.map((hole) => (
                                  <th key={hole} className="p-2 text-center font-medium">{hole}</th>
                                ))}
                                <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                {secondNineHoles.map((hole) => (
                                  <th key={hole} className="p-2 text-center font-medium">{hole}</th>
                                ))}
                                <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                                {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                  <th className="p-2 text-center font-semibold text-xs">Auto Press</th>
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {/* Individual Player Rows for Team A (with stroke indicators) */}
                              {netContext && teamA?.members.map((m) => {
                                const relativeHandicap = netContext.playerHandicaps.get(m.playerId) ?? 0;
                                return (
                                  <tr key={`player-${m.playerId}`} className="border-b border-border/30 bg-primary/5">
                                    <td className="p-2 pl-4 text-xs text-primary/70">{m.player?.name}</td>
                                    {firstNineHoles.map((holeNum) => {
                                      const score = scores.find((s: Score) => s.playerId === m.playerId && s.holeNumber === holeNum);
                                      const holeHandicapRank = netContext.holeHandicaps.get(holeNum) ?? 18;
                                      const strokesReceived = getStrokesForHole(relativeHandicap, holeHandicapRank);
                                      return (
                                        <td key={holeNum} className="p-1 text-center relative">
                                          <span className="text-xs relative inline-block">
                                            {score?.strokes ?? '-'}
                                            {strokesReceived > 0 && (
                                              <span className="absolute -top-0.5 -right-1.5 flex gap-0.5">
                                                {Array.from({ length: Math.min(strokesReceived, 3) }, (_, i) => (
                                                  <span key={i} className="w-1 h-1 rounded-full bg-emerald-500" />
                                                ))}
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                      );
                                    })}
                                    <td className="p-1 text-center bg-muted/30 text-xs">
                                      {scores.filter((s: Score) => s.playerId === m.playerId && firstNineHoles.includes(s.holeNumber)).reduce((sum, s) => sum + s.strokes, 0) || '-'}
                                    </td>
                                    {secondNineHoles.map((holeNum) => {
                                      const score = scores.find((s: Score) => s.playerId === m.playerId && s.holeNumber === holeNum);
                                      const holeHandicapRank = netContext.holeHandicaps.get(holeNum) ?? 18;
                                      const strokesReceived = getStrokesForHole(relativeHandicap, holeHandicapRank);
                                      return (
                                        <td key={holeNum} className="p-1 text-center relative">
                                          <span className="text-xs relative inline-block">
                                            {score?.strokes ?? '-'}
                                            {strokesReceived > 0 && (
                                              <span className="absolute -top-0.5 -right-1.5 flex gap-0.5">
                                                {Array.from({ length: Math.min(strokesReceived, 3) }, (_, i) => (
                                                  <span key={i} className="w-1 h-1 rounded-full bg-emerald-500" />
                                                ))}
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                      );
                                    })}
                                    <td className="p-1 text-center bg-muted/30 text-xs">
                                      {scores.filter((s: Score) => s.playerId === m.playerId && secondNineHoles.includes(s.holeNumber)).reduce((sum, s) => sum + s.strokes, 0) || '-'}
                                    </td>
                                    {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                      <td></td>
                                    )}
                                  </tr>
                                );
                              })}
                              {/* Individual Player Rows for Team B (with stroke indicators) */}
                              {netContext && teamB?.members.map((m) => {
                                const relativeHandicap = netContext.playerHandicaps.get(m.playerId) ?? 0;
                                return (
                                  <tr key={`player-${m.playerId}`} className="border-b border-border/30 bg-accent/5">
                                    <td className="p-2 pl-4 text-xs text-accent/70">{m.player?.name}</td>
                                    {firstNineHoles.map((holeNum) => {
                                      const score = scores.find((s: Score) => s.playerId === m.playerId && s.holeNumber === holeNum);
                                      const holeHandicapRank = netContext.holeHandicaps.get(holeNum) ?? 18;
                                      const strokesReceived = getStrokesForHole(relativeHandicap, holeHandicapRank);
                                      return (
                                        <td key={holeNum} className="p-1 text-center relative">
                                          <span className="text-xs relative inline-block">
                                            {score?.strokes ?? '-'}
                                            {strokesReceived > 0 && (
                                              <span className="absolute -top-0.5 -right-1.5 flex gap-0.5">
                                                {Array.from({ length: Math.min(strokesReceived, 3) }, (_, i) => (
                                                  <span key={i} className="w-1 h-1 rounded-full bg-emerald-500" />
                                                ))}
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                      );
                                    })}
                                    <td className="p-1 text-center bg-muted/30 text-xs">
                                      {scores.filter((s: Score) => s.playerId === m.playerId && firstNineHoles.includes(s.holeNumber)).reduce((sum, s) => sum + s.strokes, 0) || '-'}
                                    </td>
                                    {secondNineHoles.map((holeNum) => {
                                      const score = scores.find((s: Score) => s.playerId === m.playerId && s.holeNumber === holeNum);
                                      const holeHandicapRank = netContext.holeHandicaps.get(holeNum) ?? 18;
                                      const strokesReceived = getStrokesForHole(relativeHandicap, holeHandicapRank);
                                      return (
                                        <td key={holeNum} className="p-1 text-center relative">
                                          <span className="text-xs relative inline-block">
                                            {score?.strokes ?? '-'}
                                            {strokesReceived > 0 && (
                                              <span className="absolute -top-0.5 -right-1.5 flex gap-0.5">
                                                {Array.from({ length: Math.min(strokesReceived, 3) }, (_, i) => (
                                                  <span key={i} className="w-1 h-1 rounded-full bg-emerald-500" />
                                                ))}
                                              </span>
                                            )}
                                          </span>
                                        </td>
                                      );
                                    })}
                                    <td className="p-1 text-center bg-muted/30 text-xs">
                                      {scores.filter((s: Score) => s.playerId === m.playerId && secondNineHoles.includes(s.holeNumber)).reduce((sum, s) => sum + s.strokes, 0) || '-'}
                                    </td>
                                    {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                      <td></td>
                                    )}
                                  </tr>
                                );
                              })}
                              <tr className="border-b border-border/50">
                                <td className="p-2 font-semibold text-primary">{teamA?.name}</td>
                                {firstNineHoles.map((hole) => {
                                  // Access by physical hole number, not playing position
                                  const r = results.find(res => res.holeNumber === hole);
                                  return (
                                    <td key={hole} className={`p-2 text-center ${r?.winner === 'A' ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                      {r?.teamAScore ?? '-'}
                                    </td>
                                  );
                                })}
                                {(() => {
                                  // Get the last hole in the first nine for the "Out" summary
                                  const lastFirstNineHole = firstNineHoles[firstNineHoles.length - 1];
                                  const outResult = results.find(res => res.holeNumber === lastFirstNineHole);
                                  const hasOutScores = outResult?.teamAScore !== null;
                                  if (!hasOutScores || !outResult) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{outResult.cumulativeA}</td>;
                                  }
                                  const outDiff = outResult.cumulativeA - outResult.cumulativeB;
                                  if (outDiff > 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{outDiff} UP</td>;
                                  if (outDiff < 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{Math.abs(outDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {secondNineHoles.map((hole) => {
                                  // Access by physical hole number, not playing position
                                  const r = results.find(res => res.holeNumber === hole);
                                  return (
                                    <td key={hole} className={`p-2 text-center ${r?.winner === 'A' ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                      {r?.teamAScore ?? '-'}
                                    </td>
                                  );
                                })}
                                {(() => {
                                  // Get the last hole in the second nine for the "In" summary
                                  const lastSecondNineHole = secondNineHoles[secondNineHoles.length - 1];
                                  const inResult = results.find(res => res.holeNumber === lastSecondNineHole);
                                  const hasInScores = inResult?.teamAScore !== null;
                                  if (!hasInScores) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{inResult!.cumulativeA}</td>;
                                  }
                                  const inDiff = inResult ? inResult.cumulativeA - inResult.cumulativeB : 0;
                                  if (inDiff > 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{inDiff} UP</td>;
                                  if (inDiff < 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{Math.abs(inDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                  <td></td>
                                )}
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="p-2 font-semibold text-accent">{teamB?.name}</td>
                                {firstNineHoles.map((hole) => {
                                  // Access by physical hole number, not playing position
                                  const r = results.find(res => res.holeNumber === hole);
                                  return (
                                    <td key={hole} className={`p-2 text-center ${r?.winner === 'B' ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                      {r?.teamBScore ?? '-'}
                                    </td>
                                  );
                                })}
                                {(() => {
                                  // Get the last hole in the first nine for the "Out" summary
                                  const lastFirstNineHole = firstNineHoles[firstNineHoles.length - 1];
                                  const outResult = results.find(res => res.holeNumber === lastFirstNineHole);
                                  const hasOutScores = outResult?.teamBScore !== null;
                                  if (!hasOutScores || !outResult) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{outResult.cumulativeB}</td>;
                                  }
                                  const outDiff = outResult.cumulativeB - outResult.cumulativeA;
                                  if (outDiff > 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{outDiff} UP</td>;
                                  if (outDiff < 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{Math.abs(outDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {secondNineHoles.map((hole) => {
                                  // Access by physical hole number, not playing position
                                  const r = results.find(res => res.holeNumber === hole);
                                  return (
                                    <td key={hole} className={`p-2 text-center ${r?.winner === 'B' ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                      {r?.teamBScore ?? '-'}
                                    </td>
                                  );
                                })}
                                {(() => {
                                  // Get the last hole in the second nine for the "In" summary
                                  const lastSecondNineHole = secondNineHoles[secondNineHoles.length - 1];
                                  const inResult = results.find(res => res.holeNumber === lastSecondNineHole);
                                  const hasInScores = inResult?.teamBScore !== null;
                                  if (!hasInScores || !inResult) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{inResult.cumulativeB}</td>;
                                  }
                                  const inDiff = inResult.cumulativeB - inResult.cumulativeA;
                                  if (inDiff > 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{inDiff} UP</td>;
                                  if (inDiff < 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{Math.abs(inDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                  <td></td>
                                )}
                              </tr>
                              {em.matchType === 'nassau' ? (
                                <>
                                  {/* Nassau: 3 status rows for Front 9, Back 9, Overall */}
                                  {(() => {
                                    const nassauResults = calculateNassauResults(emWithCorrectBack9, scores, netContext);
                                    const firstNineResultsNassau = isBack9First ? nassauResults.back9 : nassauResults.front9;
                                    const secondNineResultsNassau = isBack9First ? nassauResults.front9 : nassauResults.back9;
                                    const firstNineLabel = isBack9First ? "Back 9" : "Front 9";
                                    const secondNineLabel = isBack9First ? "Front 9" : "Back 9";
                                    const firstNineAutoPress = isBack9First ? em.autoPressNassauBack9 : em.autoPressNassauFront9;
                                    const secondNineAutoPress = isBack9First ? em.autoPressNassauFront9 : em.autoPressNassauBack9;
                                    const firstNinePressKey = isBack9First ? "autoPressNassauBack9" : "autoPressNassauFront9";
                                    const secondNinePressKey = isBack9First ? "autoPressNassauFront9" : "autoPressNassauBack9";
                                    return (
                                      <>
                                        {/* First Nine Status (Front 9 or Back 9 depending on startOnBack9) */}
                                        <tr className="border-t-2 border-border bg-blue-50/50 dark:bg-blue-950/30">
                                          <td className="p-2 font-semibold text-xs">{firstNineLabel}</td>
                                          {firstNineResultsNassau.map((r) => {
                                            const diff = r.cumulativeA - r.cumulativeB;
                                            const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                            if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          {secondNineHoles.map((hole) => (
                                            <td key={hole} className="p-2 text-center text-muted-foreground/30">-</td>
                                          ))}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          <td className="p-2 text-center">
                                            <Checkbox
                                              id={`autopress-nassau-first9-${em.id}`}
                                              checked={firstNineAutoPress ?? true}
                                              onCheckedChange={(checked) => {
                                                updateAutoPress.mutate({ 
                                                  eventMatchId: em.id, 
                                                  [firstNinePressKey]: checked === true 
                                                });
                                              }}
                                              disabled={updateAutoPress.isPending}
                                              data-testid={`checkbox-autopress-nassau-first9-${em.id}`}
                                            />
                                          </td>
                                        </tr>
                                        {/* Second Nine Status (Back 9 or Front 9 depending on startOnBack9) */}
                                        <tr className="border-t border-border/50 bg-green-50/50 dark:bg-green-950/30">
                                          <td className="p-2 font-semibold text-xs">{secondNineLabel}</td>
                                          {firstNineHoles.map((hole) => (
                                            <td key={hole} className="p-2 text-center text-muted-foreground/30">-</td>
                                          ))}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          {secondNineResultsNassau.map((r) => {
                                            const diff = r.cumulativeA - r.cumulativeB;
                                            const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                            if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          <td className="p-2 text-center">
                                            <Checkbox
                                              id={`autopress-nassau-second9-${em.id}`}
                                              checked={secondNineAutoPress ?? true}
                                              onCheckedChange={(checked) => {
                                                updateAutoPress.mutate({ 
                                                  eventMatchId: em.id, 
                                                  [secondNinePressKey]: checked === true 
                                                });
                                              }}
                                              disabled={updateAutoPress.isPending}
                                              data-testid={`checkbox-autopress-nassau-second9-${em.id}`}
                                            />
                                          </td>
                                        </tr>
                                        {/* Overall Status */}
                                        <tr className="border-t border-border/50 bg-amber-50/50 dark:bg-amber-950/30">
                                          <td className="p-2 font-semibold text-xs">Overall</td>
                                          {firstNineHoles.map((hole) => {
                                            // Lookup by holeNumber since overall array is in playing order, not physical hole order
                                            const r = nassauResults.overall.find(res => res.holeNumber === hole);
                                            const diff = r ? r.cumulativeA - r.cumulativeB : 0;
                                            const hasScores = r?.teamAScore !== null && r?.teamBScore !== null;
                                            if (!hasScores) return <td key={hole} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={hole} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          {secondNineHoles.map((hole) => {
                                            // Lookup by holeNumber since overall array is in playing order, not physical hole order
                                            const r = nassauResults.overall.find(res => res.holeNumber === hole);
                                            const diff = r ? r.cumulativeA - r.cumulativeB : 0;
                                            const hasScores = r?.teamAScore !== null && r?.teamBScore !== null;
                                            if (!hasScores) return <td key={hole} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={hole} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          <td className="p-2 text-center">
                                            <Checkbox
                                              id={`autopress-nassau-overall-${em.id}`}
                                              checked={em.autoPressNassauOverall ?? true}
                                              onCheckedChange={(checked) => {
                                                updateAutoPress.mutate({ 
                                                  eventMatchId: em.id, 
                                                  autoPressNassauOverall: checked === true 
                                                });
                                              }}
                                              disabled={updateAutoPress.isPending}
                                              data-testid={`checkbox-autopress-nassau-overall-${em.id}`}
                                            />
                                          </td>
                                        </tr>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                <tr className="border-t-2 border-border">
                                  <td className="p-2 font-semibold">Status</td>
                                  {firstNineHoles.map((hole) => {
                                    // Access by physical hole number, not playing position
                                    const r = results.find(res => res.holeNumber === hole);
                                    const diff = r ? r.cumulativeA - r.cumulativeB : 0;
                                    const hasScores = r?.teamAScore !== null && r?.teamBScore !== null;
                                    if (!hasScores) return <td key={hole} className="p-2 text-center">-</td>;
                                    if (em.matchType === 'stroke_play') {
                                      if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-primary">{Math.abs(diff)}</td>;
                                      if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-accent">{diff}</td>;
                                      return <td key={hole} className="p-2 text-center text-muted-foreground">T</td>;
                                    }
                                    if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary">{diff} UP</td>;
                                    if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent">{Math.abs(diff)} UP</td>;
                                    return <td key={hole} className="p-2 text-center text-muted-foreground">AS</td>;
                                  })}
                                  <td className="p-2 text-center bg-muted/30"></td>
                                  {secondNineHoles.map((hole) => {
                                    // Access by physical hole number, not playing position
                                    const r = results.find(res => res.holeNumber === hole);
                                    const diff = r ? r.cumulativeA - r.cumulativeB : 0;
                                    const hasScores = r?.teamAScore !== null && r?.teamBScore !== null;
                                    if (!hasScores) return <td key={hole} className="p-2 text-center">-</td>;
                                    if (em.matchType === 'stroke_play') {
                                      if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-primary">{Math.abs(diff)}</td>;
                                      if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-accent">{diff}</td>;
                                      return <td key={hole} className="p-2 text-center text-muted-foreground">T</td>;
                                    }
                                    if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary">{diff} UP</td>;
                                    if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent">{Math.abs(diff)} UP</td>;
                                    return <td key={hole} className="p-2 text-center text-muted-foreground">AS</td>;
                                  })}
                                  <td className="p-2 text-center bg-muted/30"></td>
                                  {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball') && !em.parentMatchId && (
                                    <td className="p-2 text-center">
                                      <Checkbox
                                        id={`autopress-${em.id}`}
                                        checked={em.autoPressOriginal ?? true}
                                        onCheckedChange={(checked) => {
                                          updateAutoPress.mutate({ 
                                            eventMatchId: em.id, 
                                            autoPressOriginal: checked === true 
                                          });
                                        }}
                                        disabled={updateAutoPress.isPending}
                                        data-testid={`checkbox-autopress-${em.id}`}
                                      />
                                    </td>
                                  )}
                                </tr>
                              )}
                              {/* Press Match Rows */}
                              {pressMatches.map((pm) => {
                                // Press matches inherit startOnBack9 from parent
                                const pmWithCorrectBack9 = { ...pm, startOnBack9: isBack9First };
                                const pressNetContext = buildMatchNetContext(pmWithCorrectBack9);
                                const pressResults = calculateMatchPlayResults(pmWithCorrectBack9, scores, pressNetContext);
                                const pressStartPlayingPos = pm.startHole || 1;
                                return (
                                  <tr key={pm.id} className="border-t border-border/50 bg-muted/20">
                                    <td className="p-2 font-semibold text-xs">
                                      Press #{pressStartPlayingPos}
                                      <span className="ml-1 text-muted-foreground">(${(pm.unitAmount / 100).toFixed(2)})</span>
                                    </td>
                                    {firstNineHoles.map((hole) => {
                                      const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                      if (playingPos < pressStartPlayingPos) {
                                        return <td key={hole} className="p-2 text-center text-muted-foreground/30">-</td>;
                                      }
                                      // Access by physical hole number, not playing position
                                      const pressResult = pressResults.find(r => r.holeNumber === hole);
                                      if (!pressResult || pressResult.teamAScore === null || pressResult.teamBScore === null) {
                                        return <td key={hole} className="p-2 text-center">-</td>;
                                      }
                                      const diff = pressResult.cumulativeA - pressResult.cumulativeB;
                                      if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                      if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                      return <td key={hole} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                    })}
                                    <td className="p-2 text-center bg-muted/30"></td>
                                    {secondNineHoles.map((hole) => {
                                      const playingPos = physicalToPlayingPosition(hole, isBack9First);
                                      if (playingPos < pressStartPlayingPos) {
                                        return <td key={hole} className="p-2 text-center text-muted-foreground/30">-</td>;
                                      }
                                      // Access by physical hole number, not playing position
                                      const pressResult = pressResults.find(r => r.holeNumber === hole);
                                      if (!pressResult || pressResult.teamAScore === null || pressResult.teamBScore === null) {
                                        return <td key={hole} className="p-2 text-center">-</td>;
                                      }
                                      const diff = pressResult.cumulativeA - pressResult.cumulativeB;
                                      if (diff > 0) return <td key={hole} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                      if (diff < 0) return <td key={hole} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                      return <td key={hole} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                    })}
                                    <td className="p-2 text-center bg-muted/30"></td>
                                    {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball') && !em.parentMatchId && (
                                      <td className="p-2 text-center">
                                        <Checkbox
                                          id={`autopress-press-${pm.id}`}
                                          checked={pm.autoPressOriginal ?? true}
                                          onCheckedChange={(checked) => {
                                            updateAutoPress.mutate({ 
                                              eventMatchId: pm.id, 
                                              autoPressOriginal: checked === true 
                                            });
                                          }}
                                          disabled={updateAutoPress.isPending}
                                          data-testid={`checkbox-autopress-${pm.id}`}
                                        />
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Running Status */}
                        <div className="flex justify-between items-center pt-2 border-t border-border">
                          <div className="text-sm">
                            {em.matchType === 'stroke_play' ? (
                              <>
                                <span className="font-medium">Total Strokes: </span>
                                <span className="text-primary font-bold">{teamA?.name}: {results[results.length - 1]?.cumulativeA ?? 0}</span>
                                <span className="mx-2">|</span>
                                <span className="text-accent font-bold">{teamB?.name}: {results[results.length - 1]?.cumulativeB ?? 0}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">Total Holes Won: </span>
                                <span className="text-primary font-bold">{teamA?.name}: {results.filter(r => r.winner === 'A').length}</span>
                                <span className="mx-2">|</span>
                                <span className="text-accent font-bold">{teamB?.name}: {results.filter(r => r.winner === 'B').length}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball') && !em.parentMatchId && canEditScoresAndBets && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPressDialogMatch(em.id);
                                  setPressStartHole(2);
                                }}
                                data-testid={`button-add-press-${em.id}`}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Press
                              </Button>
                            )}
                            {isCreator && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteEventMatch.mutate(em.id)}
                                className="text-destructive hover:text-destructive"
                                data-testid={`button-delete-event-match-${em.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Press Dialog */}
                        {pressDialogMatch === em.id && (
                          <div className="pt-3 border-t border-border">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Start press on hole:</span>
                              <Select
                                value={pressStartHole.toString()}
                                onValueChange={(val) => setPressStartHole(parseInt(val))}
                              >
                                <SelectTrigger className="w-20" data-testid="select-press-hole">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 16 }, (_, i) => i + 2).map((hole) => (
                                    <SelectItem key={hole} value={hole.toString()}>
                                      {hole}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                onClick={() => {
                                  createPress.mutate({ eventMatchId: em.id, startHole: pressStartHole });
                                  setPressDialogMatch(null);
                                }}
                                disabled={createPress.isPending}
                                data-testid="button-confirm-press"
                              >
                                {createPress.isPending ? "Creating..." : "Create Press"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPressDialogMatch(null)}
                                data-testid="button-cancel-press"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Wager Summary - Combined for parent + all presses */}
                        {em.unitAmount > 0 && (() => {
                          // Apply correct startOnBack9 to press matches for wager calculation
                          const pressMatchesWithCorrectBack9 = pressMatches.map(pm => ({ ...pm, startOnBack9: isBack9First }));
                          // Build netContext for consistent calculation with ledger
                          const wagerNetContext = em.useNetScoring ? buildMatchNetContext(emWithCorrectBack9) : null;
                          const combined = calculateCombinedMatchSettlements(emWithCorrectBack9, pressMatchesWithCorrectBack9, scores, wagerNetContext);
                          return (
                            <div className="pt-3 border-t border-border">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-semibold text-sm flex items-center gap-2">
                                  Wager Summary
                                  <span className="text-xs text-muted-foreground">
                                    ({combined.totalMatches} {combined.totalMatches === 1 ? 'match' : 'matches'} - ${combined.totalPot.toFixed(2)} total pot)
                                  </span>
                                </h5>
                                {combined.completedCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                    {combined.completedCount}/{combined.totalMatches} complete
                                  </span>
                                )}
                              </div>
                              
                              {combined.completedCount === 0 ? (
                                <p className="text-xs text-muted-foreground">Matches in progress</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {combined.playerTotals.map((p) => (
                                    <div 
                                      key={p.playerId}
                                      className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-sm ${
                                        p.amount > 0 
                                          ? 'bg-primary/10 text-primary' 
                                          : p.amount < 0
                                          ? 'bg-destructive/10 text-destructive'
                                          : 'bg-muted text-muted-foreground'
                                      }`}
                                      data-testid={`wager-summary-${p.playerId}`}
                                    >
                                      <span className="font-medium">{p.playerName}</span>
                                      <span className="font-bold">
                                        {p.amount > 0 ? '+' : ''}${p.amount.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        </>
                        )}

                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        );
        })()}
      </div>

      {/* Player Ledger */}
      {eventMatches.length > 0 && (() => {
        // For Ryder Cup side matches, apply the day's startOnBack9 to all event matches
        const eventMatchesWithCorrectBack9 = eventMatches.map(em => 
          match?.ryderCupEventId ? { ...em, startOnBack9: dayStartOnBack9 } : em
        );
        
        // Build netContextMap for proper net scoring in ledger
        // Key by em.id (event match ID), not em.eventId (parent match ID)
        const netContextMap = new Map<number, NetScoringContext>();
        for (const em of eventMatchesWithCorrectBack9) {
          if (em.useNetScoring) {
            const ctx = buildMatchNetContext(em);
            if (ctx) {
              netContextMap.set(em.id, ctx);
            }
          }
        }
        // Build pars array from matchCourse holes
        const parsArray = matchCourse?.holes.length 
          ? Array.from({ length: 18 }, (_, i) => {
              const hole = matchCourse.holes.find(h => h.holeNumber === i + 1);
              return hole?.par ?? 4;
            })
          : null;
        const { entries, balances } = calculateLedger(eventMatchesWithCorrectBack9, scores, netContextMap.size > 0 ? netContextMap : null, parsArray);
        const hasCompletedMatches = entries.some(e => e.isComplete);
        
        if (!hasCompletedMatches) return null;
        
        return (
          <div ref={bettingLedgerRef} className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setLedgerCollapsed(!ledgerCollapsed)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-1"
                data-testid="button-toggle-ledger"
              >
                <h3 className="font-display font-bold text-lg flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-accent" />
                  Betting Ledger
                </h3>
                {ledgerCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <ShareButton
                targetRef={bettingLedgerRef}
                title={`Betting Ledger - ${match?.name || "Match"}`}
                text={`${match?.name || "Match"} - Betting Results`}
                fileName="betting-ledger.png"
              />
            </div>
            
            {!ledgerCollapsed && (
            <div className="grid md:grid-cols-[auto_1fr] gap-6 mt-4">
              {/* Player Balances */}
              <div className="min-w-fit">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Player Standings</h4>
                  {selectedStandingsPlayer !== null && (
                    <button
                      onClick={() => setSelectedStandingsPlayer(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-standings-filter"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {balances.map((b) => (
                    <button 
                      key={b.playerId}
                      onClick={() => setSelectedStandingsPlayer(selectedStandingsPlayer === b.playerId ? null : b.playerId)}
                      className={`w-full flex justify-between items-center gap-4 px-4 py-3 rounded-lg whitespace-nowrap transition-all ${
                        selectedStandingsPlayer === b.playerId
                          ? 'ring-2 ring-primary ring-offset-2'
                          : ''
                      } ${
                        b.netBalance > 0 
                          ? 'bg-primary/10 border border-primary/20' 
                          : b.netBalance < 0 
                          ? 'bg-destructive/10 border border-destructive/20'
                          : 'bg-muted'
                      }`}
                      data-testid={`ledger-balance-${b.playerId}`}
                    >
                      <div className="whitespace-nowrap text-left">
                        <span className="font-semibold">{b.playerName}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({b.matchesPlayed} {b.matchesPlayed === 1 ? 'match' : 'matches'})
                        </span>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span className={`font-bold text-lg ${
                          b.netBalance > 0 ? 'text-primary' : b.netBalance < 0 ? 'text-destructive' : ''
                        }`}>
                          {b.netBalance > 0 ? '+' : ''}${b.netBalance.toFixed(2)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          W: ${b.totalWon.toFixed(2)} / L: ${b.totalLost.toFixed(2)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Individual Bets */}
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                  Match Results
                  {selectedStandingsPlayer !== null && (
                    <span className="ml-2 text-xs text-primary font-normal">
                      (filtered by {balances.find(b => b.playerId === selectedStandingsPlayer)?.playerName})
                    </span>
                  )}
                </h4>
                <div className="space-y-2">
                  {(() => {
                    const completedMatchIds = Array.from(new Set(entries.filter(e => e.isComplete).map(e => e.matchId)));
                    const filteredMatchIds = selectedStandingsPlayer !== null
                      ? completedMatchIds.filter(matchId => {
                          const matchEntries = entries.filter(e => e.matchId === matchId);
                          return matchEntries.some(e => e.playerId === selectedStandingsPlayer);
                        })
                      : completedMatchIds;
                    
                    if (filteredMatchIds.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground">
                          No match results for selected player.
                        </p>
                      );
                    }
                    
                    return filteredMatchIds.map((matchId) => {
                      const matchEntries = entries.filter(e => e.matchId === matchId);
                      const eventMatch = eventMatches.find(em => em.id === matchId);
                      const teamA = eventMatch?.teams[0];
                      const teamB = eventMatch?.teams[1];
                      const matchType = eventMatch?.matchType ? (MATCH_TYPE_LABELS[eventMatch.matchType as MatchType] || eventMatch.matchType) : '';
                      const isSkins = eventMatch?.matchType === 'skins';
                      
                      // Build player ID to team mapping
                      const playerTeamIndex = new Map<number, number>();
                      if (teamA) teamA.members.forEach(m => playerTeamIndex.set(m.playerId, 0));
                      if (teamB) teamB.members.forEach(m => playerTeamIndex.set(m.playerId, 1));
                      
                      // Group entries by bet type and aggregate by team
                      const groupedByBetType = matchEntries.reduce((acc, entry) => {
                        const betType = entry.betType || 'Match';
                        if (!acc[betType]) {
                          acc[betType] = {
                            betType,
                            isAutoPress: entry.isAutoPress,
                            pressHole: entry.pressHole,
                            teamAMembers: [] as { name: string; amount: number; playerId: number }[],
                            teamBMembers: [] as { name: string; amount: number; playerId: number }[],
                            teamATotal: 0,
                            teamBTotal: 0,
                            processedPlayers: new Set<number>(),
                          };
                        }
                        if (!acc[betType].processedPlayers.has(entry.playerId)) {
                          acc[betType].processedPlayers.add(entry.playerId);
                          const teamIdx = entry.teamIndex ?? playerTeamIndex.get(entry.playerId) ?? 0;
                          const memberEntry = { name: entry.playerName, amount: entry.amount, playerId: entry.playerId };
                          if (teamIdx === 0) {
                            acc[betType].teamAMembers.push(memberEntry);
                            acc[betType].teamATotal += entry.amount;
                          } else {
                            acc[betType].teamBMembers.push(memberEntry);
                            acc[betType].teamBTotal += entry.amount;
                          }
                        }
                        return acc;
                      }, {} as Record<string, {
                        betType: string;
                        isAutoPress?: boolean;
                        pressHole?: number | null;
                        teamAMembers: { name: string; amount: number; playerId: number }[];
                        teamBMembers: { name: string; amount: number; playerId: number }[];
                        teamATotal: number;
                        teamBTotal: number;
                        processedPlayers: Set<number>;
                      }>);
                      
                      const betGroups = Object.values(groupedByBetType);
                      
                      // Determine match title - show opponent when a player is selected
                      let matchTitle = matchEntries[0]?.matchName || 'Match';
                      if (teamA && teamB) {
                        if (selectedStandingsPlayer !== null) {
                          // Find which team the selected player is on using match entries
                          // (more reliable than playerTeamIndex since player IDs may differ across matches)
                          const selectedPlayerEntry = matchEntries.find(e => e.playerId === selectedStandingsPlayer);
                          const selectedPlayerTeam = selectedPlayerEntry?.teamIndex ?? playerTeamIndex.get(selectedStandingsPlayer);
                          if (selectedPlayerTeam === 0) {
                            matchTitle = `vs ${teamB.name}${matchType ? ` - ${matchType}` : ''}`;
                          } else if (selectedPlayerTeam === 1) {
                            matchTitle = `vs ${teamA.name}${matchType ? ` - ${matchType}` : ''}`;
                          } else {
                            matchTitle = `${teamA.name} vs ${teamB.name}${matchType ? ` - ${matchType}` : ''}`;
                          }
                        } else {
                          matchTitle = `${teamA.name} vs ${teamB.name}${matchType ? ` - ${matchType}` : ''}`;
                        }
                      }
                      
                      return (
                        <div key={matchId} className="bg-muted/50 rounded-lg p-3" data-testid={`ledger-match-${matchId}`}>
                          <div className="text-sm font-semibold mb-3">{matchTitle}</div>
                          {betGroups.map((group, gIdx) => {
                            const teamAWon = group.teamATotal > 0;
                            const teamBWon = group.teamBTotal > 0;
                            const isTie = group.teamATotal === 0 && group.teamBTotal === 0;
                            const winAmount = Math.max(Math.abs(group.teamATotal), Math.abs(group.teamBTotal));
                            const isSkinsBet = group.betType === 'Skins';
                            
                            return (
                              <div key={gIdx} className={gIdx > 0 ? 'mt-3 pt-3 border-t border-border' : ''}>
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{group.betType}</span>
                                    {group.isAutoPress && (
                                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-amber-500 text-amber-600 text-[10px] font-bold" title="Auto Press">
                                        P
                                      </span>
                                    )}
                                    {group.pressHole && (
                                      <span className="text-xs text-muted-foreground">Press hole {group.pressHole}</span>
                                    )}
                                  </div>
                                  <span className={`text-sm font-bold ${isTie ? 'text-muted-foreground' : 'text-primary'}`}>
                                    {isTie ? 'Tie' : `$${winAmount.toFixed(2)}`}
                                  </span>
                                </div>
                                
                                {isSkinsBet ? (
                                  <div className="space-y-1">
                                    {[...group.teamAMembers, ...group.teamBMembers].map((m, mIdx) => (
                                      <div 
                                        key={mIdx}
                                        className={`flex justify-between text-xs px-2 py-1 rounded ${
                                          selectedStandingsPlayer === m.playerId ? 'ring-1 ring-primary' : ''
                                        } ${
                                          m.amount > 0 
                                            ? 'text-primary bg-primary/5' 
                                            : m.amount < 0 
                                            ? 'text-destructive bg-destructive/5'
                                            : 'text-muted-foreground'
                                        }`}
                                      >
                                        <span>{m.name}</span>
                                        <span className="font-medium">
                                          {m.amount > 0 ? '+' : ''}{m.amount === 0 ? 'Push' : `$${m.amount.toFixed(2)}`}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className={`rounded-lg p-2 ${teamAWon ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                                      <div className={`text-xs font-medium mb-1 ${teamAWon ? 'text-primary' : 'text-muted-foreground'}`}>
                                        {teamA?.name || 'Team A'} {teamAWon && '(Won)'}
                                      </div>
                                      {group.teamAMembers.map((m, mIdx) => (
                                        <div 
                                          key={mIdx}
                                          className={`flex justify-between text-xs px-1 py-0.5 ${
                                            selectedStandingsPlayer === m.playerId ? 'ring-1 ring-primary rounded' : ''
                                          }`}
                                        >
                                          <span>{m.name}</span>
                                          <span className={`font-medium ${m.amount > 0 ? 'text-primary' : m.amount < 0 ? 'text-destructive' : ''}`}>
                                            {m.amount > 0 ? '+' : ''}${m.amount.toFixed(2)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div className={`rounded-lg p-2 ${teamBWon ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'}`}>
                                      <div className={`text-xs font-medium mb-1 ${teamBWon ? 'text-primary' : 'text-muted-foreground'}`}>
                                        {teamB?.name || 'Team B'} {teamBWon && '(Won)'}
                                      </div>
                                      {group.teamBMembers.map((m, mIdx) => (
                                        <div 
                                          key={mIdx}
                                          className={`flex justify-between text-xs px-1 py-0.5 ${
                                            selectedStandingsPlayer === m.playerId ? 'ring-1 ring-primary rounded' : ''
                                          }`}
                                        >
                                          <span>{m.name}</span>
                                          <span className={`font-medium ${m.amount > 0 ? 'text-primary' : m.amount < 0 ? 'text-destructive' : ''}`}>
                                            {m.amount > 0 ? '+' : ''}${m.amount.toFixed(2)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
            )}
          </div>
        );
      })()}

      {/* Scorecard Table */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Scorecard</h2>
        <div className="flex items-center gap-2">
          <Link href={`/match/${matchId}/scores?scan=true`}>
            <Button variant="outline" size="icon" data-testid="button-scan-scorecard">
              <Camera className="w-4 h-4" />
            </Button>
          </Link>
          <Link href={`/match/${matchId}/scores`}>
            <Button variant="outline" size="sm" data-testid="button-quick-score-entry">
              Quick Score Entry
            </Button>
          </Link>
        </div>
      </div>
      <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary/5 text-primary">
              <th className="p-2 text-left font-bold w-32 sticky left-0 bg-white/95 backdrop-blur shadow-sm z-10">Player</th>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                <th key={hole} className="p-3 text-center w-12 font-semibold text-muted-foreground">{hole}</th>
              ))}
              <th className="p-4 text-center font-bold text-foreground bg-primary/10">Total</th>
            </tr>
            {/* Par Row */}
            {matchCourse && (
              <tr className="bg-muted/30 text-xs">
                <td className="p-2 text-left text-xs font-medium sticky left-0 bg-muted/30 backdrop-blur z-10 text-muted-foreground">Par</td>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                  <td key={hole} className="p-2 text-center font-medium text-muted-foreground">{getHolePar(hole)}</td>
                ))}
                <td className="p-2 text-center font-bold text-muted-foreground bg-primary/5">{matchCourse.totalPar}</td>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p: Player) => {
              const isCurrentUser = p.userId === user?.id;
              const canEditPlayerScore = canEditScoresAndBets || isCurrentUser;
              
              return (
                <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${isCurrentUser ? "bg-accent/5" : ""}`}>
                  <td className={`p-2 font-semibold sticky left-0 bg-white/95 backdrop-blur z-10 ${isCurrentUser ? "text-primary" : "text-foreground"}`}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCurrentUser ? "bg-accent" : "bg-muted"}`} />
                        <span className="truncate text-sm font-semibold">{p.name}{isCurrentUser && " (You)"}</span>
                        {/* Handicap inline - only show when handicapped */}
                        {match?.isHandicapped && (
                          <>
                            {canEditScoresAndBets ? (
                              editingPlayerHandicap === p.id ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={playerHandicapEditValue}
                                  onChange={(e) => setPlayerHandicapEditValue(e.target.value)}
                                  onBlur={() => {
                                    const parsed = parseFloat(playerHandicapEditValue);
                                    if (!isNaN(parsed) && parsed >= -10 && parsed <= 54) {
                                      updatePlayerMatchHandicap.mutate({ 
                                        playerId: p.id, 
                                        handicapIndex: Math.round(parsed * 10) 
                                      });
                                    } else if (playerHandicapEditValue === '') {
                                      updatePlayerMatchHandicap.mutate({ 
                                        playerId: p.id, 
                                        handicapIndex: null 
                                      });
                                    }
                                    setEditingPlayerHandicap(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.currentTarget.blur();
                                    } else if (e.key === 'Escape') {
                                      setEditingPlayerHandicap(null);
                                    }
                                  }}
                                  autoFocus
                                  className="w-10 h-4 text-center text-[10px] border rounded px-0.5 font-normal flex-shrink-0"
                                  placeholder="HCP"
                                  data-testid={`input-player-handicap-${p.id}`}
                                />
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingPlayerHandicap(p.id);
                                    const hcp = p.handicapIndex;
                                    setPlayerHandicapEditValue(hcp !== null && hcp !== undefined ? (hcp / 10).toFixed(1) : '');
                                  }}
                                  className="w-8 h-4 text-center text-[10px] bg-muted/50 border rounded hover:bg-muted text-muted-foreground font-normal cursor-pointer inline-flex items-center justify-center flex-shrink-0"
                                  data-testid={`button-player-handicap-${p.id}`}
                                >
                                  {p.handicapIndex !== null && p.handicapIndex !== undefined 
                                    ? (p.handicapIndex / 10).toFixed(1) 
                                    : '-'}
                                </span>
                              )
                            ) : (
                              p.handicapIndex !== null && p.handicapIndex !== undefined && (
                                <span className="text-[10px] text-muted-foreground font-normal flex-shrink-0">
                                  ({(p.handicapIndex / 10).toFixed(1)})
                                </span>
                              )
                            )}
                          </>
                        )}
                      </div>
                      {/* Tee selector and Course Handicap - only show when handicapped */}
                      {match?.isHandicapped && (
                        <div className="flex items-center gap-1 mt-0.5">
                          {canEditScoresAndBets && courseTees && courseTees.length > 0 && (
                            <Select
                              value={p.teeId?.toString() || ''}
                              onValueChange={(value) => {
                                updatePlayerTee.mutate({ playerId: p.id, teeId: value ? parseInt(value) : null });
                              }}
                            >
                              <SelectTrigger className="h-5 w-20 text-[10px] px-1" data-testid={`select-player-tee-${p.id}`}>
                                <SelectValue placeholder="Tee" />
                              </SelectTrigger>
                              <SelectContent>
                                {courseTees.map((tee) => (
                                  <SelectItem key={tee.id} value={tee.id.toString()} className="text-xs">
                                    {tee.name}{tee.yardage ? ` (${tee.yardage.toLocaleString()})` : ''}{tee.slopeRating ? ` / ${tee.slopeRating}` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                          {/* Course Handicap display */}
                          {scorecardNetContext && (
                            <span 
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                scorecardNetContext.playersMissingData.has(p.id) 
                                  ? 'text-destructive bg-destructive/10' 
                                  : 'text-muted-foreground bg-muted/50'
                              }`}
                              title={scorecardNetContext.playersMissingData.has(p.id) 
                                ? "No handicap data — set handicap index or enter course handicap override in bet settings" 
                                : "Course Handicap (calculated from handicap index and tee slope)"}
                              data-testid={`course-hcp-${p.id}`}
                            >
                              CH: {scorecardNetContext.playersMissingData.has(p.id) ? '-' : (scorecardNetContext.courseHandicaps?.get(p.id) ?? '-')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                    const score = getScore(p.id, hole);
                    const isEditing = editingCell?.playerId === p.id && editingCell?.hole === hole;
                    const cellKey = `${p.id}-${hole}`;
                    
                    return (
                      <td 
                        key={hole} 
                        className="p-1 text-center border-l border-border/30"
                        onClick={() => canEditPlayerScore && handleCellClick(p.id, hole)}
                      >
                        {isEditing ? (
                          <input
                            ref={(el) => { inputRefs.current[cellKey] = el; }}
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={editValue}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setEditValue(val);
                              if (val.length === 1 && parseInt(val) >= 1 && parseInt(val) <= 9) {
                                const strokes = parseInt(val);
                                submitScore.mutate({ playerId: p.id, holeNumber: hole, strokes });
                                if (hole < 18) {
                                  setEditingCell({ playerId: p.id, hole: hole + 1 });
                                  setEditValue(getScore(p.id, hole + 1)?.toString() || "");
                                } else {
                                  setEditingCell(null);
                                }
                              }
                            }}
                            onBlur={() => handleScoreSubmit(p.id, hole)}
                            onKeyDown={(e) => handleKeyDown(e, p.id, hole)}
                            className="w-10 h-8 text-center border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono [appearance:textfield]"
                            data-testid={`input-score-${p.id}-${hole}`}
                          />
                        ) : (
                          <div 
                            className={`
                              inline-block rounded
                              ${canEditPlayerScore ? "cursor-pointer hover:bg-primary/10" : ""}
                            `}
                          >
                            <ScoreCell 
                              score={score} 
                              par={getHolePar(hole)} 
                              testId={`score-cell-${p.id}-${hole}`}
                              strokesReceived={getPlayerStrokesForHole(p.id, hole)}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-4 text-center font-bold text-lg bg-primary/5">
                    {(() => {
                      const totalScore = getPlayerScore(p.id);
                      const coursePar = matchCourse?.totalPar ?? 72;
                      if (!totalScore) return <span className="text-muted-foreground">-</span>;
                      const diff = totalScore - coursePar;
                      const colorClass = diff < 0 ? "text-red-500" : diff > 0 ? "text-blue-500" : "text-foreground";
                      return <span className={colorClass}>{totalScore}</span>;
                    })()}
                  </td>
                </tr>
              );
            })}
            
            {players.length === 0 && (
              <tr>
                <td colSpan={20} className="p-12 text-center text-muted-foreground">
                  No players yet. {!isPlayer && "Join the match to start tracking scores!"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Match Chat Section */}
      {user && (
        <MatchChat matchId={matchId!} currentUserId={user.id} />
      )}

      {showCopyBetsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCopyBetsDialog(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-lg">Copy Bets From Event</h3>
              <Button size="icon" variant="ghost" onClick={() => setShowCopyBetsDialog(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Select an event to copy all matches/bets from. Teams will be matched by player name.
            </p>
            <Select 
              value={selectedSourceEventId?.toString() || ""} 
              onValueChange={(val) => setSelectedSourceEventId(val ? parseInt(val) : null)}
            >
              <SelectTrigger className="w-full mb-4" data-testid="select-source-event">
                <SelectValue placeholder="Select an event..." />
              </SelectTrigger>
              <SelectContent>
                {allMatches
                  ?.filter(m => m.id !== matchId)
                  .map(m => (
                    <SelectItem key={m.id} value={m.id.toString()}>
                      {m.name} - {m.courseName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCopyBetsDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (selectedSourceEventId) {
                    try {
                      await copyBetsFromEvent.mutateAsync(selectedSourceEventId);
                      setShowCopyBetsDialog(false);
                      setSelectedSourceEventId(null);
                    } catch (err) {
                      console.error("Failed to copy bets:", err);
                    }
                  }
                }}
                disabled={!selectedSourceEventId || copyBetsFromEvent.isPending}
                data-testid="button-confirm-copy-bets"
              >
                {copyBetsFromEvent.isPending ? "Copying..." : "Copy Bets"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
