import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, subDays, startOfYear } from "date-fns";
import { Calendar, DollarSign, TrendingUp, TrendingDown, Filter, ArrowLeft, MapPin, Users, Trophy, Plus, Trash2, X, ChevronDown, ChevronRight, Loader2, Download } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { calculateLedger, NetScoringContext, calculateNassauResults, calculateMatchPlayResults, calculateDeathMatchResults, calculateTwoThreeBallResults, calculateOneTwoThreeBallResults, buildResultText, getMatchWinner, type LedgerEntry, type NassauResults, type HoleResult } from "@/lib/matchplay";
import { MatchScorecardPanel } from "@/components/MatchScorecardPanel";
import { useCourses, useGroups, useMatches, usePresetPlayers } from "@/hooks/use-matches";
import { calculateCourseHandicap } from "@/lib/handicap";
import { apiRequest } from "@/lib/queryClient";

type DetailType = "won" | "lost" | "net" | null;

type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

export default function Ledger() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [detailModal, setDetailModal] = useState<{
    playerId: number;
    playerName: string;
    type: DetailType;
  } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  
  // Manual bet dialog state
  const [addBetOpen, setAddBetOpen] = useState(false);
  const [betDescription, setBetDescription] = useState("");
  const [betEntries, setBetEntries] = useState<{ presetPlayerId: number | null; playerName: string; amount: string }[]>([
    { presetPlayerId: null, playerName: "", amount: "" },
    { presetPlayerId: null, playerName: "", amount: "" },
  ]);
  

  const { data: courses } = useCourses();
  const { data: groups } = useGroups();
  const { data: matches } = useMatches();
  const { data: presetPlayers } = usePresetPlayers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Query for manual bets
  const { data: manualBets } = useQuery<{
    id: number;
    description: string;
    createdAt: string | null;
    entries: { id: number; playerName: string; presetPlayerId: number | null; amount: number }[];
  }[]>({
    queryKey: ["/api/manual-bets"],
  });
  
  // Mutation to create manual bet
  const createBetMutation = useMutation({
    mutationFn: async (data: { description: string; entries: { playerName: string; presetPlayerId?: number; amount: number }[] }) => {
      return apiRequest("POST", "/api/manual-bets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manual-bets"] });
      toast({ title: "Bet recorded successfully" });
      setAddBetOpen(false);
      setBetDescription("");
      setBetEntries([{ presetPlayerId: null, playerName: "", amount: "" }, { presetPlayerId: null, playerName: "", amount: "" }]);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  
  // Mutation to delete manual bet
  const deleteBetMutation = useMutation({
    mutationFn: async (betId: number) => {
      return apiRequest("DELETE", `/api/manual-bets/${betId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/manual-bets"] });
      toast({ title: "Bet deleted" });
    },
  });
  
  
  // Helper functions for add bet dialog
  const addBetEntry = () => {
    setBetEntries([...betEntries, { presetPlayerId: null, playerName: "", amount: "" }]);
  };
  
  const removeBetEntry = (index: number) => {
    if (betEntries.length > 2) {
      setBetEntries(betEntries.filter((_, i) => i !== index));
    }
  };
  
  const updateBetEntryPlayer = (index: number, presetPlayerId: number) => {
    const updated = [...betEntries];
    const player = presetPlayers?.find((p: { id: number; name: string }) => p.id === presetPlayerId);
    updated[index].presetPlayerId = presetPlayerId;
    updated[index].playerName = player?.name || "";
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
    
    const validEntries = betEntries.filter(e => e.presetPlayerId && e.playerName.trim() && e.amount);
    if (validEntries.length < 2) {
      toast({ title: "At least 2 players required", variant: "destructive" });
      return;
    }
    
    // Check for duplicate players by presetPlayerId
    const playerIds = validEntries.map(e => e.presetPlayerId);
    if (new Set(playerIds).size !== playerIds.length) {
      toast({ title: "Each player can only appear once", variant: "destructive" });
      return;
    }
    
    const total = calculateBetTotal();
    if (Math.abs(total) > 0.01) {
      toast({ title: "Total must equal zero", description: `Current total: $${total.toFixed(2)}`, variant: "destructive" });
      return;
    }
    
    createBetMutation.mutate({
      description: betDescription.trim(),
      entries: validEntries.map(e => ({
        playerName: e.playerName.trim(),
        presetPlayerId: e.presetPlayerId!,
        amount: Math.round(parseFloat(e.amount) * 100), // Convert to cents
      })),
    });
  };

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("start", dateRange.from.toISOString());
    if (dateRange.to) params.set("end", dateRange.to.toISOString());
    return params.toString();
  }, [dateRange]);

  const { data, isLoading } = useQuery<{
    matches: Array<{ id: number; name: string | null; createdAt: string; courseId: number | null; groupId: number | null; isHandicapped?: boolean; ryderCupEventId?: number | null; ryderCupDayNumber?: number | null }>;
    eventMatches: Array<{ id: number; eventId: number; useNetScoring?: boolean; teams?: Array<{ members?: Array<{ playerId: number; player?: { handicapIndex: number | null; teeId: number | null; name?: string } }> }>; [key: string]: any }>;
    scores: Array<any>;
    courseData?: Record<number, { holes: Array<{ holeNumber: number; handicap: number | null }>; tees: Array<{ id: number; slopeRating: number; courseRating: number }> }>;
    ryderCupPlayerDataByEventAndDay?: Record<number, Record<number, Record<string, { handicapIndex: number | null; teeId: number | null }>>>;
    ryderCupScoresByEventAndDay?: Record<number, Record<number, Record<string, Record<number, number>>>>;
    storedResults?: Array<{ id: number; eventMatchId: number; playerId: number; playerName: string; amount: number; betType: string | null; isComplete: boolean; isAutoPress: boolean; teamName: string | null; teamIndex: number | null }>;
  }>({
    queryKey: [`/api/ledger?${queryParams}`],
  });

  // Filter matches based on selected filters
  const filteredMatches = useMemo(() => {
    if (!data?.matches) return [];
    
    let filtered = data.matches;
    
    // Filter by event
    if (selectedEventId !== "all") {
      const eventId = parseInt(selectedEventId);
      filtered = filtered.filter((m) => m.id === eventId);
    }
    
    // Filter by group
    if (selectedGroupId !== "all") {
      const groupId = parseInt(selectedGroupId);
      filtered = filtered.filter((m) => m.groupId === groupId);
    }
    
    // Filter by course
    if (selectedCourseId !== "all") {
      const courseId = parseInt(selectedCourseId);
      filtered = filtered.filter((m) => m.courseId === courseId);
    }
    
    return filtered;
  }, [data?.matches, selectedEventId, selectedGroupId, selectedCourseId]);

  // Get filtered match IDs for event match filtering
  const filteredMatchIds = useMemo(() => {
    return new Set(filteredMatches.map(m => m.id));
  }, [filteredMatches]);

  // Filter event matches based on filtered matches
  const filteredEventMatches = useMemo(() => {
    if (!data?.eventMatches) return [];
    
    return data.eventMatches.filter((em: { eventId: number }) => 
      filteredMatchIds.has(em.eventId)
    );
  }, [data?.eventMatches, filteredMatchIds]);

  // Build net context map for each match (keyed by matchId/eventId)
  const netContextMap = useMemo(() => {
    if (!data?.matches || !data?.courseData || !data?.eventMatches) return null;
    
    const contextMap = new Map<number, NetScoringContext>();
    
    // Build a lookup from matchId to courseId
    const matchToCourse = new Map<number, number>();
    for (const match of data.matches) {
      if (match.courseId && match.isHandicapped) {
        matchToCourse.set(match.id, match.courseId);
      }
    }
    
    // For each match, build a netContext from its players and course data
    for (const match of data.matches) {
      if (!match.courseId || !match.isHandicapped) continue;
      
      const courseInfo = data.courseData[match.courseId];
      if (!courseInfo) continue;
      
      // Build hole handicaps map
      const holeHandicaps = new Map<number, number>();
      for (const hole of courseInfo.holes) {
        if (hole.handicap !== null) {
          holeHandicaps.set(hole.holeNumber, hole.handicap);
        }
      }
      
      // Build tee lookup
      const teeLookup = new Map<number, { slopeRating: number; courseRating: number }>();
      for (const tee of courseInfo.tees) {
        teeLookup.set(tee.id, { slopeRating: tee.slopeRating, courseRating: tee.courseRating });
      }
      
      // Calculate course par from holes (holes data includes par field at runtime)
      const coursePar = (courseInfo.holes as Array<{ par?: number }>).reduce((sum: number, h) => sum + (h.par ?? 0), 0);
      
      // Get Ryder Cup player data if this is a Ryder Cup side match
      const rcPlayerData = (match.ryderCupEventId && match.ryderCupDayNumber && data.ryderCupPlayerDataByEventAndDay)
        ? data.ryderCupPlayerDataByEventAndDay[match.ryderCupEventId]?.[match.ryderCupDayNumber]
        : undefined;
      
      // For each event match under this parent match, build a separate context keyed by em.id
      // This is critical because calculateLedger looks up net context by em.id
      for (const em of data.eventMatches) {
        if (em.eventId !== match.id) continue;
        
        const courseHandicaps = new Map<number, number>();
        
        for (const team of em.teams || []) {
          for (const member of team.members || []) {
            if (courseHandicaps.has(member.playerId)) continue;
            
            const player = member.player;
            if (!player) continue;
            
            // For Ryder Cup side matches, use the pairing data as authoritative source
            const playerName = player.name;
            const pairingData = playerName ? rcPlayerData?.[playerName] : undefined;
            const handicapIndex = pairingData?.handicapIndex ?? player.handicapIndex;
            const teeId = pairingData?.teeId ?? player.teeId;
            
            if (handicapIndex === null) continue;
            
            if (teeId && teeLookup.has(teeId)) {
              const teeInfo = teeLookup.get(teeId)!;
              // calculateCourseHandicap expects handicapIndex in stored format (already * 10)
              // USGA formula: Handicap Index × (Slope ÷ 113) + (Course Rating - Par)
              const courseHandicap = calculateCourseHandicap(
                handicapIndex,
                teeInfo.slopeRating,
                teeInfo.courseRating,
                coursePar
              );
              courseHandicaps.set(member.playerId, courseHandicap);
            } else {
              // Fall back to handicap index as course handicap
              courseHandicaps.set(member.playerId, Math.round(handicapIndex / 10));
            }
          }
        }
        
        if (courseHandicaps.size > 0 && holeHandicaps.size > 0) {
          // Calculate relative handicaps (playerHandicaps) based on courseHandicaps
          const minHandicap = Math.min(...Array.from(courseHandicaps.values()));
          const playerHandicaps = new Map<number, number>();
          courseHandicaps.forEach((ch, playerId) => {
            playerHandicaps.set(playerId, ch - minHandicap);
          });
          
          // Key by em.id (event match ID) to match what calculateLedger expects
          contextMap.set(em.id, { playerHandicaps, holeHandicaps, courseHandicaps, playersMissingData: new Set<number>() });
        }
      }
    }
    
    return contextMap.size > 0 ? contextMap : null;
  }, [data?.matches, data?.courseData, data?.eventMatches, data?.ryderCupPlayerDataByEventAndDay]);

  const eventMatchToParentId = useMemo(() => {
    const map = new Map<number, number>();
    for (const em of data?.eventMatches || []) {
      map.set((em as any).id, (em as any).eventId);
    }
    return map;
  }, [data?.eventMatches]);

  const ledgerResults = useMemo(() => {
    if (!filteredEventMatches || filteredEventMatches.length === 0) {
      return { balances: [], entries: [] };
    }
    
    // Get the set of filtered event match IDs
    const filteredEventMatchIds = new Set(filteredEventMatches.map((em: { id: number }) => em.id));
    
    // Check if we have stored results for these event matches
    const relevantStoredResults = (data?.storedResults || []).filter(r => filteredEventMatchIds.has(r.eventMatchId));
    
    // Build lookup from eventMatchId to match metadata for display
    const eventMatchToMetadata = new Map<number, { matchName: string; createdAt?: string; teamAMembers?: string[]; teamBMembers?: string[] }>();
    for (const em of filteredEventMatches as Array<{ id: number; eventId: number; name?: string; teams?: Array<{ members?: Array<{ player?: { name?: string } }> }> }>) {
      const match = data?.matches?.find(m => m.id === em.eventId);
      eventMatchToMetadata.set(em.id, {
        matchName: (em as any).name || match?.name || `Match ${em.eventId}`,
        createdAt: match?.createdAt,
        teamAMembers: em.teams?.[0]?.members?.map(m => m.player?.name || '').filter(Boolean) || [],
        teamBMembers: em.teams?.[1]?.members?.map(m => m.player?.name || '').filter(Boolean) || [],
      });
    }
    
    // Build a set of match IDs that are Ryder Cup side matches
    const ryderCupMatchIds = new Set<number>();
    for (const match of data?.matches || []) {
      if (match.ryderCupEventId && match.ryderCupDayNumber) {
        ryderCupMatchIds.add(match.id);
      }
    }
    
    // Get event match to match ID mapping
    const eventMatchToMatchId = new Map<number, number>();
    for (const em of filteredEventMatches as Array<{ id: number; eventId: number }>) {
      eventMatchToMatchId.set(em.id, em.eventId);
    }
    
    // Determine which event matches have stored results (but exclude Ryder Cup matches)
    const storedResultsByEventMatch = new Map<number, typeof relevantStoredResults>();
    for (const r of relevantStoredResults) {
      // Skip stored results for Ryder Cup side matches - always recalculate those
      const matchId = eventMatchToMatchId.get(r.eventMatchId);
      if (matchId && ryderCupMatchIds.has(matchId)) continue;
      
      const existing = storedResultsByEventMatch.get(r.eventMatchId) || [];
      existing.push(r);
      storedResultsByEventMatch.set(r.eventMatchId, existing);
    }
    
    // Identify event matches that need calculation (no stored results OR is Ryder Cup match)
    const eventMatchesWithStoredResults = new Set(storedResultsByEventMatch.keys());
    const eventMatchesNeedingCalculation = filteredEventMatches.filter(
      (em: { id: number; eventId: number }) => {
        // Always recalculate Ryder Cup side matches to ensure consistency
        if (ryderCupMatchIds.has(em.eventId)) return true;
        // Calculate if no stored results
        return !eventMatchesWithStoredResults.has(em.id);
      }
    );
    
    // Build resultText/nassauLeg for stored entries by recalculating from scores
    // (eventMatchResults schema has no winner/margin fields, so we recompute per-row)
    const betTypeToNassauLeg = (betType: string | null | undefined): 'F9' | 'B9' | 'Ov' | undefined => {
      if (betType === 'Front 9') return 'F9';
      if (betType === 'Back 9') return 'B9';
      if (betType === 'Overall') return 'Ov';
      return undefined;
    };

    // Helper: pick the right NassauResults leg based on a betName/betType string
    const pickLegHoles = (legResults: NassauResults, betName: string): HoleResult[] => {
      if (betName.includes('Front 9') || betName.startsWith('F9')) return legResults.front9;
      if (betName.includes('Back 9') || betName.startsWith('B9')) return legResults.back9;
      return legResults.overall;
    };

    // Pre-compute calculation results per event match (indexed by em.id)
    type EmPrecomp = {
      matchType: string;
      em: any;
      nassauRes?: NassauResults;
      mpResults?: HoleResult[];
      dmResults?: ReturnType<typeof calculateDeathMatchResults>;
      ttbResults?: ReturnType<typeof calculateTwoThreeBallResults>;
      otzbResults?: ReturnType<typeof calculateOneTwoThreeBallResults>;
    };
    const emPrecomputed = new Map<number, EmPrecomp>();

    for (const em of filteredEventMatches as Array<any>) {
      if (!storedResultsByEventMatch.has(em.id)) continue;
      const parentMatchId = eventMatchToMatchId.get(em.id);
      if (!parentMatchId) continue;
      const emScores = (data?.scores || []).filter((s: any) => s.matchId === parentMatchId);
      // Use net context for handicapped matches so resultText reflects net scores
      const emNetCtx = (em.useNetScoring && netContextMap ? netContextMap.get(em.id) || null : null) as NetScoringContext | null;
      try {
        if (em.matchType === 'nassau') {
          emPrecomputed.set(em.id, { matchType: em.matchType, em, nassauRes: calculateNassauResults(em, emScores, emNetCtx) });
        } else if (em.matchType === 'death_match') {
          emPrecomputed.set(em.id, { matchType: em.matchType, em, dmResults: calculateDeathMatchResults(em, emScores, emNetCtx) });
        } else if (em.matchType === 'two_three_ball') {
          emPrecomputed.set(em.id, { matchType: em.matchType, em, ttbResults: calculateTwoThreeBallResults(em, emScores, emNetCtx) });
        } else if (em.matchType === 'one_two_three_ball') {
          emPrecomputed.set(em.id, { matchType: em.matchType, em, otzbResults: calculateOneTwoThreeBallResults(em, emScores, emNetCtx) });
        } else if (em.matchType && em.matchType !== 'skins') {
          emPrecomputed.set(em.id, { matchType: em.matchType, em, mpResults: calculateMatchPlayResults(em, emScores, emNetCtx) });
        }
      } catch (_) {}
    }

    // Build entries from stored results (excluding Ryder Cup matches which we recalculate)
    const storedEntries: LedgerEntry[] = relevantStoredResults
      .filter(r => {
        const matchId = eventMatchToMatchId.get(r.eventMatchId);
        // Exclude Ryder Cup side matches - we recalculate those
        return !(matchId && ryderCupMatchIds.has(matchId));
      })
      .map(r => {
        const metadata = eventMatchToMetadata.get(r.eventMatchId) || { matchName: `Match ${r.eventMatchId}` };
        const nassauLeg = betTypeToNassauLeg(r.betType);
        // Compute resultText per row based on the pre-computed match results and the row's betType
        let resultText: string | undefined;
        const precomp = emPrecomputed.get(r.eventMatchId);
        if (precomp) {
          const { em, nassauRes, mpResults, dmResults, ttbResults, otzbResults } = precomp;
          try {
            if (nassauRes && nassauLeg) {
              const legHoles = nassauLeg === 'F9' ? nassauRes.front9 : nassauLeg === 'B9' ? nassauRes.back9 : nassauRes.overall;
              const w = getMatchWinner(legHoles);
              const complete = legHoles.length > 0 && legHoles.every(h => h.teamAScore !== null && h.teamBScore !== null);
              resultText = buildResultText(legHoles, w, complete) || undefined;
            } else if (dmResults) {
              const bt = r.betType;
              const isBB = bt === 'Best Ball';
              const is2B = bt === '2nd Ball';
              if (isBB || is2B) {
                const legHoles = isBB ? dmResults.bestBall.results : dmResults.secondBall.results;
                const complete = isBB ? dmResults.bestBall.isComplete : dmResults.secondBall.isComplete;
                const w = isBB ? dmResults.bestBall.winner : dmResults.secondBall.winner;
                resultText = buildResultText(legHoles, w, complete) || undefined;
              }
            } else if (ttbResults) {
              const bt = r.betType || '';
              const legResults = bt.startsWith('2 Ball') ? ttbResults.twoBall : ttbResults.threeBall;
              const legHoles = pickLegHoles(legResults, bt);
              const w = getMatchWinner(legHoles);
              const complete = legHoles.length > 0 && legHoles.every(h => h.teamAScore !== null && h.teamBScore !== null);
              resultText = buildResultText(legHoles, w, complete) || undefined;
            } else if (otzbResults) {
              const bt = r.betType || '';
              const legResults = bt.startsWith('1 Ball') ? otzbResults.oneBall : otzbResults.twoThirdBall;
              const legHoles = pickLegHoles(legResults, bt);
              const w = getMatchWinner(legHoles, em.matchType);
              const complete = legHoles.length > 0 && legHoles.every(h => h.teamAScore !== null && h.teamBScore !== null);
              resultText = buildResultText(legHoles, w, complete, em.matchType) || undefined;
            } else if (mpResults) {
              const w = getMatchWinner(mpResults, em.matchType);
              const complete = mpResults.length > 0 && mpResults.every((h: HoleResult) => h.teamAScore !== null && h.teamBScore !== null);
              resultText = buildResultText(mpResults, w, complete, em.matchType) || undefined;
            }
          } catch (_) {}
        }
        return {
          matchId: r.eventMatchId,
          matchName: metadata.matchName,
          playerId: r.playerId,
          playerName: r.playerName,
          amount: r.amount / 100, // Convert cents to dollars
          betType: r.betType || undefined,
          isComplete: r.isComplete,
          isAutoPress: r.isAutoPress,
          teamName: r.teamName || undefined,
          teamIndex: r.teamIndex ?? undefined,
          createdAt: metadata.createdAt,
          teamAMembers: metadata.teamAMembers,
          teamBMembers: metadata.teamBMembers,
          pressHole: undefined as number | null | undefined,
          resultText,
          nassauLeg,
        };
      });
    
    // Convert Ryder Cup scores to the format expected by calculateLedger
    // This matches the logic in RyderCupEvent.tsx for consistency
    const convertedScores: Array<{ playerId: number; matchId: number; holeNumber: number; strokes: number }> = [];
    const rcMatchIds = new Set<number>(); // Track which matchIds have converted scores
    
    if (data?.ryderCupScoresByEventAndDay) {
      for (const em of eventMatchesNeedingCalculation as Array<{ id: number; eventId: number; teams?: Array<{ members?: Array<{ playerId: number; player?: { name?: string } }> }> }>) {
        const match = data.matches?.find(m => m.id === em.eventId);
        if (!match?.ryderCupEventId || !match?.ryderCupDayNumber) continue;
        
        const dayScores = data.ryderCupScoresByEventAndDay[match.ryderCupEventId]?.[match.ryderCupDayNumber];
        if (!dayScores) continue;
        
        rcMatchIds.add(em.eventId); // Mark this match as having RC scores
        
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
    
    // Merge converted Ryder Cup scores with regular scores for non-RC matches
    // Filter out regular scores for matches that have converted RC scores
    const regularScores = (data?.scores || []).filter((s: { matchId: number }) => !rcMatchIds.has(s.matchId));
    const scoresToUse = [...convertedScores, ...regularScores];
    
    // Calculate entries for event matches without stored results
    let calculatedEntries: LedgerEntry[] = [];
    if (eventMatchesNeedingCalculation.length > 0 && scoresToUse.length > 0) {
      const calculated = calculateLedger(eventMatchesNeedingCalculation as any, scoresToUse, netContextMap);
      calculatedEntries = calculated.entries.map(e => ({
        matchId: e.matchId,
        matchName: e.matchName,
        playerId: e.playerId,
        playerName: e.playerName,
        amount: e.amount,
        betType: e.betType || undefined,
        isComplete: e.isComplete,
        isAutoPress: e.isAutoPress || false,
        teamName: e.teamName || undefined,
        teamIndex: e.teamIndex,
        createdAt: eventMatchToMetadata.get(e.matchId)?.createdAt,
        teamAMembers: eventMatchToMetadata.get(e.matchId)?.teamAMembers,
        teamBMembers: eventMatchToMetadata.get(e.matchId)?.teamBMembers,
        pressHole: e.pressHole,
        resultText: e.resultText,
        nassauLeg: e.nassauLeg,
      }));
    }
    
    // Merge all entries
    const entries: LedgerEntry[] = [...storedEntries, ...calculatedEntries];
    
    // Aggregate balances from all entries
    const playerTotals = new Map<number, { name: string; won: number; lost: number; matches: Set<number> }>();
    
    for (const entry of entries) {
      if (!playerTotals.has(entry.playerId)) {
        playerTotals.set(entry.playerId, { name: entry.playerName, won: 0, lost: 0, matches: new Set() });
      }
      const totals = playerTotals.get(entry.playerId)!;
      if (entry.amount > 0) {
        totals.won += entry.amount;
      } else {
        totals.lost += Math.abs(entry.amount);
      }
      totals.matches.add(entry.matchId);
    }
    
    const balances = Array.from(playerTotals.entries()).map(([playerId, totals]) => ({
      playerId,
      playerName: totals.name,
      totalWon: totals.won,
      totalLost: totals.lost,
      netBalance: totals.won - totals.lost,
      matchesPlayed: totals.matches.size,
    }));
    
    return { entries, balances };
  }, [filteredEventMatches, data?.scores, data?.storedResults, data?.matches, data?.ryderCupScoresByEventAndDay, netContextMap]);
  
  // Combine ledger results with manual bets
  const combinedLedgerResults = useMemo(() => {
    const baseLedger = ledgerResults;
    
    // Create a map of player balances keyed by presetPlayerId (or playerName as fallback)
    // Use a composite key: presetPlayerId if available, otherwise playerName
    const balanceMap = new Map<string, { playerId: number; playerName: string; presetPlayerId?: number; won: number; lost: number; netBalance: number; matchesPlayed?: number }>();
    
    const getPlayerKey = (playerId: number, playerName: string, presetPlayerId?: number | null): string => {
      // Use presetPlayerId as primary key if available, fallback to playerName
      return presetPlayerId ? `preset:${presetPlayerId}` : `name:${playerName.toLowerCase().trim()}`;
    };
    
    // Add base ledger balances
    for (const balance of baseLedger.balances) {
      const key = getPlayerKey(balance.playerId, balance.playerName, (balance as any).presetPlayerId);
      balanceMap.set(key, {
        playerId: balance.playerId,
        playerName: balance.playerName,
        presetPlayerId: (balance as any).presetPlayerId,
        won: balance.totalWon,
        lost: balance.totalLost,
        netBalance: balance.netBalance,
        matchesPlayed: balance.matchesPlayed,
      });
    }
    
    // Add manual bet entries
    const manualBetEntries: LedgerEntry[] = [];
    
    if (manualBets) {
      for (const bet of manualBets) {
        for (const entry of bet.entries) {
          const amountInDollars = entry.amount / 100; // Convert from cents
          const presetPlayerId = (entry as any).presetPlayerId;
          const key = getPlayerKey(entry.id, entry.playerName, presetPlayerId);
          
          // Get or create player balance entry
          if (!balanceMap.has(key)) {
            balanceMap.set(key, {
              playerId: presetPlayerId || entry.id,
              playerName: entry.playerName,
              presetPlayerId: presetPlayerId || undefined,
              won: 0,
              lost: 0,
              netBalance: 0,
            });
          }
          
          const playerBalance = balanceMap.get(key)!;
          if (amountInDollars >= 0) {
            playerBalance.won += amountInDollars;
          } else {
            playerBalance.lost += Math.abs(amountInDollars);
          }
          playerBalance.netBalance += amountInDollars;
          
          // Add to entries for detailed breakdown
          manualBetEntries.push({
            matchId: bet.id,
            matchName: bet.description,
            playerId: presetPlayerId || entry.id,
            playerName: entry.playerName,
            betType: 'Manual Bet',
            isComplete: true,
            amount: amountInDollars,
            isAutoPress: false,
            teamName: undefined,
            teamIndex: undefined,
            createdAt: bet.createdAt || undefined,
            teamAMembers: undefined,
            teamBMembers: undefined,
            pressHole: undefined,
          });
        }
      }
    }
    
    // Convert balanceMap back to sorted array
    const combinedBalances = Array.from(balanceMap.values())
      .sort((a, b) => b.netBalance - a.netBalance);
    
    return {
      balances: combinedBalances,
      entries: [...baseLedger.entries, ...manualBetEntries],
    };
  }, [ledgerResults, manualBets]);

  const quickFilters = [
    { label: "Last 30 Days", days: 30 },
    { label: "Last 90 Days", days: 90 },
    { label: "This Year", action: () => setDateRange({ from: startOfYear(new Date()), to: new Date() }) },
    { label: "All Time", action: () => setDateRange({ from: undefined, to: undefined }) },
  ];

  const totalPot = combinedLedgerResults.balances.reduce((sum, b) => sum + Math.abs(b.netBalance), 0);
  const topWinner = combinedLedgerResults.balances[0];
  const topLoser = combinedLedgerResults.balances[combinedLedgerResults.balances.length - 1];

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="h-12 bg-muted/20 animate-pulse rounded-lg w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />
          <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />
          <div className="h-32 bg-muted/20 animate-pulse rounded-xl" />
        </div>
        <div className="h-96 bg-muted/20 animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" data-testid="button-back-to-dashboard">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-display font-bold text-primary">Player Ledger</h1>
            <p className="text-muted-foreground">
              Track winnings and losses across all events
            </p>
          </div>
        </div>
        <a
          href={`/api/export/scores.xlsx${dateRange.from || dateRange.to ? `?${new URLSearchParams([...(dateRange.from ? [["start", dateRange.from.toISOString()]] : []), ...(dateRange.to ? [["end", dateRange.to.toISOString()]] : [])]).toString()}` : ""}`}
          download
          data-testid="button-export-excel"
        >
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export Scores
          </Button>
        </a>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2">
        {quickFilters.map((filter) => (
          <Button
            key={filter.label}
            variant="outline"
            size="sm"
            onClick={() => {
              if (filter.action) {
                filter.action();
              } else if (filter.days) {
                setDateRange({ from: subDays(new Date(), filter.days), to: new Date() });
              }
            }}
            data-testid={`button-filter-${filter.label.toLowerCase().replace(/\s/g, "-")}`}
          >
            {filter.label}
          </Button>
        ))}
        
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="ml-2" data-testid="button-custom-date-range">
              <Filter className="w-4 h-4 mr-2" />
              Custom Range
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>

        {dateRange.from && (
          <span className="text-sm text-muted-foreground ml-4">
            {format(dateRange.from, "MMM d, yyyy")} - {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : "Present"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedEventId} onValueChange={setSelectedEventId}>
            <SelectTrigger className="w-44" data-testid="select-filter-event">
              <SelectValue placeholder="All Events" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              {data?.matches?.map((match: { id: number; name: string | null; createdAt: string }) => (
                <SelectItem key={match.id} value={match.id.toString()}>
                  {match.name || format(new Date(match.createdAt), "MMM d, yyyy")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="w-36" data-testid="select-filter-group">
              <SelectValue placeholder="All Groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {groups?.map((group: { id: number; name: string }) => (
                <SelectItem key={group.id} value={group.id.toString()}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
            <SelectTrigger className="w-44" data-testid="select-filter-course">
              <SelectValue placeholder="All Courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses?.map((course: { id: number; name: string }) => (
                <SelectItem key={course.id} value={course.id.toString()}>
                  {course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(selectedEventId !== "all" || selectedGroupId !== "all" || selectedCourseId !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedEventId("all");
              setSelectedGroupId("all");
              setSelectedCourseId("all");
            }}
            data-testid="button-clear-filters"
          >
            Clear Filters
          </Button>
        )}
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddBetOpen(true)}
          data-testid="button-add-bet"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Bet
        </Button>
        
      </div>
      
      {/* Add Bet Dialog */}
      <Dialog open={addBetOpen} onOpenChange={setAddBetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Manual Bet</DialogTitle>
            <DialogDescription>
              Enter bet results. Amounts must sum to zero (what one loses, another gains).
            </DialogDescription>
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
              {betEntries.map((entry, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Select
                    value={entry.presetPlayerId?.toString() || ""}
                    onValueChange={(value) => updateBetEntryPlayer(index, parseInt(value))}
                  >
                    <SelectTrigger className="flex-1" data-testid={`select-bet-player-${index}`}>
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {presetPlayers?.map((p: { id: number; name: string }) => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
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
                disabled={createBetMutation.isPending || calculateBetTotal() !== 0}
                data-testid="button-save-bet"
              >
                {createBetMutation.isPending ? "Saving..." : "Save Bet"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Events in Range</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-events-count">{filteredMatches.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Winner</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {topWinner && topWinner.netBalance > 0 ? (
              <>
                <div className="text-2xl font-bold text-green-600" data-testid="text-top-winner-amount">
                  +${topWinner.netBalance.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground" data-testid="text-top-winner-name">{topWinner.playerName}</p>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Top Loser</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            {topLoser && topLoser.netBalance < 0 ? (
              <>
                <div className="text-2xl font-bold text-red-600" data-testid="text-top-loser-amount">
                  ${topLoser.netBalance.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground" data-testid="text-top-loser-name">{topLoser.playerName}</p>
              </>
            ) : (
              <div className="text-2xl font-bold text-muted-foreground">-</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Player Balances
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {combinedLedgerResults?.balances && combinedLedgerResults.balances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap min-w-fit">Player</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Matches</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Won</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Lost</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Net Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combinedLedgerResults.balances.map((balance) => (
                  <TableRow key={balance.playerId} data-testid={`row-player-${balance.playerId}`}>
                    <TableCell className="font-medium whitespace-nowrap">{balance.playerName}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{balance.matchesPlayed}</TableCell>
                    <TableCell 
                      className="text-right text-green-600 whitespace-nowrap cursor-pointer hover:underline"
                      onClick={() => setDetailModal({ playerId: balance.playerId, playerName: balance.playerName, type: "won" })}
                      data-testid={`cell-won-${balance.playerId}`}
                    >
                      +${balance.won.toFixed(2)}
                    </TableCell>
                    <TableCell 
                      className="text-right text-red-600 whitespace-nowrap cursor-pointer hover:underline"
                      onClick={() => setDetailModal({ playerId: balance.playerId, playerName: balance.playerName, type: "lost" })}
                      data-testid={`cell-lost-${balance.playerId}`}
                    >
                      -${balance.lost.toFixed(2)}
                    </TableCell>
                    <TableCell 
                      className={`text-right font-bold whitespace-nowrap cursor-pointer hover:underline ${balance.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}
                      onClick={() => setDetailModal({ playerId: balance.playerId, playerName: balance.playerName, type: "net" })}
                      data-testid={`cell-net-${balance.playerId}`}
                    >
                      {balance.netBalance >= 0 ? "+" : ""}${balance.netBalance.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No completed bets in this date range.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {combinedLedgerResults?.entries && combinedLedgerResults.entries.length > 0 ? (
            (() => {
              // Bet type detection helpers
              const nassauBetTypes = new Set(['Front 9', 'Back 9', 'Overall']);
              const isNassauLeg = (bt?: string) => !!bt && nassauBetTypes.has(bt);
              const isDeathMatchLeg = (bt?: string) => bt === 'Best Ball' || bt === '2nd Ball';
              const isTTBLeg = (bt?: string) => !!bt && (bt.startsWith('2 Ball –') || bt.startsWith('3rd Ball –'));
              const isOTZBLeg = (bt?: string) => !!bt && (bt.startsWith('1 Ball –') || bt.startsWith('2nd3rd Ball –'));
              const isManualBet = (bt?: string) => bt === 'Manual Bet';

              const deriveNassauLeg = (bt?: string): 'F9' | 'B9' | 'Ov' | undefined => {
                if (bt === 'Front 9') return 'F9';
                if (bt === 'Back 9') return 'B9';
                if (bt === 'Overall') return 'Ov';
                return undefined;
              };
              const parseTTBLeg = (bt: string): { prefix: string; leg: 'F9' | 'B9' | 'Ov' } | null => {
                const m = bt.match(/^(2 Ball|3rd Ball|1 Ball|2nd3rd Ball) – (Front 9|Back 9|Overall)$/);
                if (!m) return null;
                const leg: 'F9' | 'B9' | 'Ov' = m[2] === 'Front 9' ? 'F9' : m[2] === 'Back 9' ? 'B9' : 'Ov';
                return { prefix: m[1], leg };
              };

              const getGroupType = (bt?: string): string => {
                if (bt === 'Skins') return 'skins';
                if (isManualBet(bt)) return 'manual';
                if (isDeathMatchLeg(bt)) return 'death_match';
                if (isTTBLeg(bt)) return 'ttb';
                if (isOTZBLeg(bt)) return 'otzb';
                if (isNassauLeg(bt)) return 'nassau';
                return 'other';
              };

              const getGroupKey = (entry: typeof combinedLedgerResults.entries[number]): string => {
                const bt = entry.betType;
                const gt = getGroupType(bt);
                if (gt === 'skins') return `skins-${entry.matchId}`;
                if (gt === 'manual') return `manual-${entry.matchId}`;
                if (gt === 'death_match') return `dm-${entry.matchId}`;
                if (gt === 'ttb') return `ttb-${entry.matchId}`;
                if (gt === 'otzb') return `otzb-${entry.matchId}`;
                if (gt === 'nassau') {
                  const baseName = (entry.matchName || '').replace(/ - (Front 9|Back 9|Overall)$/, '');
                  return `nassau-${entry.matchId}-${baseName}`;
                }
                return `other-${entry.matchId}-${bt || 'default'}-${entry.matchName}`;
              };

              const getBetTypeLabel = (bt?: string): string => {
                if (bt === 'Skins') return 'Skins';
                if (isManualBet(bt)) return 'Manual Bet';
                if (isDeathMatchLeg(bt)) return 'Death Match';
                if (isTTBLeg(bt)) return '2/3 Ball';
                if (isOTZBLeg(bt)) return '1/2/3 Ball';
                if (isNassauLeg(bt)) return 'Nassau';
                return bt || 'Match Play';
              };

              type GroupRow = {
                key: string;
                groupType: string;
                betTypeLabel: string;
                matchId: number;
                matchName: string;
                isAutoPress?: boolean;
                pressHole?: number | null;
                createdAt?: string;
                isComplete: boolean;
                teamAMembers: string[];
                teamBMembers: string[];
                teamAAmount: number;
                teamBAmount: number;
                teamAPlayerIds: Set<number>;
                teamBPlayerIds: Set<number>;
                processedPlayers: Set<number>;
                nassauLegs: Record<string, { teamAAmount: number; teamBAmount: number; resultText?: string; isAutoPress?: boolean }>;
                resultText?: string;
                deathMatchLegs: Record<string, { teamAAmount: number; teamBAmount: number; resultText?: string }>;
                ttbSubLegs: Record<string, Record<string, { teamAAmount: number; teamBAmount: number; resultText?: string; isAutoPress?: boolean }>>;
                otzbSubLegs: Record<string, Record<string, { teamAAmount: number; teamBAmount: number; resultText?: string; isAutoPress?: boolean }>>;
                skinsPlayers: { name: string; amount: number }[];
                manualPlayers: { name: string; amount: number }[];
              };

              const groupedMap: Record<string, GroupRow> = {};

              for (const entry of combinedLedgerResults.entries) {
                const key = getGroupKey(entry);
                const groupType = getGroupType(entry.betType);
                const bt = entry.betType;

                if (!groupedMap[key]) {
                  let baseName = entry.matchName || '';
                  if (groupType === 'nassau') baseName = baseName.replace(/ - (Front 9|Back 9|Overall)$/, '');
                  if (groupType === 'ttb' || groupType === 'otzb') baseName = baseName.replace(/ - (2 Ball|3rd Ball|1 Ball|2nd3rd Ball) – (Front 9|Back 9|Overall)$/, '');
                  groupedMap[key] = {
                    key, groupType,
                    betTypeLabel: getBetTypeLabel(bt),
                    matchId: entry.matchId,
                    matchName: baseName,
                    isAutoPress: entry.isAutoPress,
                    pressHole: entry.pressHole,
                    createdAt: entry.createdAt,
                    isComplete: entry.isComplete,
                    teamAMembers: entry.teamAMembers || [],
                    teamBMembers: entry.teamBMembers || [],
                    teamAAmount: 0, teamBAmount: 0,
                    teamAPlayerIds: new Set(), teamBPlayerIds: new Set(),
                    processedPlayers: new Set(),
                    nassauLegs: {}, resultText: undefined,
                    deathMatchLegs: {}, ttbSubLegs: {}, otzbSubLegs: {},
                    skinsPlayers: [], manualPlayers: [],
                  };
                }

                const group = groupedMap[key];

                if (groupType === 'nassau') {
                  const leg = entry.nassauLeg || deriveNassauLeg(bt);
                  if (leg) {
                    if (!group.nassauLegs[leg]) {
                      group.nassauLegs[leg] = { teamAAmount: 0, teamBAmount: 0, resultText: entry.resultText, isAutoPress: entry.isAutoPress };
                    }
                    const dedupKey = entry.playerId * 100 + (leg === 'F9' ? 1 : leg === 'B9' ? 2 : 3);
                    if (!group.processedPlayers.has(dedupKey)) {
                      group.processedPlayers.add(dedupKey);
                      const teamIdx = entry.teamIndex;
                      if (teamIdx === 0 || teamIdx === undefined) {
                        group.nassauLegs[leg].teamAAmount += entry.amount;
                        group.teamAAmount += entry.amount;
                        group.teamAPlayerIds.add(entry.playerId);
                      } else {
                        group.nassauLegs[leg].teamBAmount += entry.amount;
                        group.teamBAmount += entry.amount;
                        group.teamBPlayerIds.add(entry.playerId);
                      }
                    }
                  }
                } else if (groupType === 'death_match') {
                  if (!group.deathMatchLegs[bt!]) {
                    group.deathMatchLegs[bt!] = { teamAAmount: 0, teamBAmount: 0, resultText: entry.resultText };
                  }
                  const subKey = bt === 'Best Ball' ? 1 : 2;
                  const dedupKey = entry.playerId * 10 + subKey;
                  if (!group.processedPlayers.has(dedupKey)) {
                    group.processedPlayers.add(dedupKey);
                    const teamIdx = entry.teamIndex;
                    if (teamIdx === 0 || teamIdx === undefined) {
                      group.deathMatchLegs[bt!].teamAAmount += entry.amount;
                      group.teamAAmount += entry.amount;
                      group.teamAPlayerIds.add(entry.playerId);
                    } else {
                      group.deathMatchLegs[bt!].teamBAmount += entry.amount;
                      group.teamBAmount += entry.amount;
                      group.teamBPlayerIds.add(entry.playerId);
                    }
                  }
                } else if (groupType === 'ttb' || groupType === 'otzb') {
                  const subLegs = groupType === 'ttb' ? group.ttbSubLegs : group.otzbSubLegs;
                  const parsed = parseTTBLeg(bt!);
                  if (parsed) {
                    const { prefix, leg } = parsed;
                    if (!subLegs[prefix]) subLegs[prefix] = {};
                    if (!subLegs[prefix][leg]) {
                      subLegs[prefix][leg] = { teamAAmount: 0, teamBAmount: 0, resultText: entry.resultText, isAutoPress: entry.isAutoPress };
                    }
                    const prefixIdx = (prefix === '2 Ball' || prefix === '1 Ball') ? 0 : 3000;
                    const dedupKey = entry.playerId * 10000 + prefixIdx + (leg === 'F9' ? 1 : leg === 'B9' ? 2 : 3);
                    if (!group.processedPlayers.has(dedupKey)) {
                      group.processedPlayers.add(dedupKey);
                      const teamIdx = entry.teamIndex;
                      if (teamIdx === 0 || teamIdx === undefined) {
                        subLegs[prefix][leg].teamAAmount += entry.amount;
                        group.teamAAmount += entry.amount;
                        group.teamAPlayerIds.add(entry.playerId);
                      } else {
                        subLegs[prefix][leg].teamBAmount += entry.amount;
                        group.teamBAmount += entry.amount;
                        group.teamBPlayerIds.add(entry.playerId);
                      }
                    }
                  }
                } else if (groupType === 'skins') {
                  if (!group.processedPlayers.has(entry.playerId)) {
                    group.processedPlayers.add(entry.playerId);
                    group.skinsPlayers.push({ name: entry.playerName, amount: entry.amount });
                  }
                } else if (groupType === 'manual') {
                  if (!group.processedPlayers.has(entry.playerId)) {
                    group.processedPlayers.add(entry.playerId);
                    group.manualPlayers.push({ name: entry.playerName, amount: entry.amount });
                  }
                } else {
                  if (!group.processedPlayers.has(entry.playerId)) {
                    group.processedPlayers.add(entry.playerId);
                    const teamIdx = entry.teamIndex;
                    if (teamIdx === 0 || teamIdx === undefined) {
                      group.teamAAmount += entry.amount;
                      group.teamAPlayerIds.add(entry.playerId);
                    } else {
                      group.teamBAmount += entry.amount;
                      group.teamBPlayerIds.add(entry.playerId);
                    }
                  }
                  if (entry.resultText && !group.resultText) group.resultText = entry.resultText;
                }
              }

              const allRows = Object.values(groupedMap).sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              });

              const AutoPressBadge = () => (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-amber-500 text-amber-600 text-[9px] font-bold flex-shrink-0" title="Auto Press">P</span>
              );

              const StatusBadge = ({ isComplete }: { isComplete: boolean }) => (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  isComplete
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                }`}>
                  {isComplete ? "Complete" : "In Progress"}
                </span>
              );

              const NassauLegSummary = ({ legs }: { legs: Record<string, { teamAAmount: number; teamBAmount: number; resultText?: string; isAutoPress?: boolean }> }) => {
                const legOrder: Array<'F9' | 'B9' | 'Ov'> = ['F9', 'B9', 'Ov'];
                const parts = legOrder.map(leg => {
                  const l = legs[leg];
                  if (!l) return null;
                  const won = l.teamAAmount !== 0 || l.teamBAmount !== 0;
                  return (
                    <span key={leg} className="inline-flex items-center gap-0.5">
                      <span className="text-muted-foreground">{leg}</span>{' '}
                      <span className={won ? 'text-foreground' : 'text-muted-foreground'}>{l.resultText || '–'}</span>
                      {l.isAutoPress && <AutoPressBadge />}
                    </span>
                  );
                }).filter(Boolean);
                return (
                  <>
                    {parts.map((p, i) => (
                      <span key={i} className="inline-flex items-center">
                        {i > 0 && <span className="mx-1 text-muted-foreground">·</span>}
                        {p}
                      </span>
                    ))}
                  </>
                );
              };

              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6" />
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="min-w-[280px]">Match / Result</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRows.map((row, idx) => {
                      const parentMatchId = eventMatchToParentId.get(row.matchId);
                      const rowKey = row.key;
                      const isExpanded = expandedRows.has(rowKey);

                      const expandBtn = parentMatchId ? (
                        <button
                          data-testid={`expand-row-${idx}`}
                          onClick={() => toggleRow(rowKey)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      ) : null;

                      const expandPanel = isExpanded && parentMatchId ? (
                        <TableRow key={`${rowKey}-panel`}>
                          <TableCell colSpan={5} className="p-0">
                            <MatchScorecardPanel parentMatchId={parentMatchId} eventMatchId={row.matchId} />
                          </TableCell>
                        </TableRow>
                      ) : null;

                      // --- Skins row ---
                      if (row.groupType === 'skins') {
                        const winners = row.skinsPlayers.filter(p => p.amount > 0);
                        const skinsTotal = winners.reduce((sum, p) => sum + p.amount, 0);
                        return (
                          <>
                            <TableRow key={rowKey} data-testid={`row-skins-${idx}`}>
                              <TableCell>{expandBtn}</TableCell>
                              <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                                {row.createdAt ? format(new Date(row.createdAt), "MMM d, yyyy") : "-"}
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="text-xs text-muted-foreground mb-0.5">{row.matchName}</div>
                                <div className="text-sm font-semibold">Skins</div>
                                {winners.length > 0 && (
                                  <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                                    {winners.map((p, i) => (
                                      <span key={i} className="inline-flex items-center gap-1">
                                        {i > 0 && <span>·</span>}
                                        <span className="text-green-600 font-medium">{p.name}</span>
                                        <span className="text-green-600">+${p.amount.toFixed(2)}</span>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <span className={`font-bold ${skinsTotal > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>${skinsTotal.toFixed(2)}</span>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <StatusBadge isComplete={row.isComplete} />
                              </TableCell>
                            </TableRow>
                            {expandPanel}
                          </>
                        );
                      }

                      // --- Manual bet row ---
                      if (row.groupType === 'manual') {
                        const winner = row.manualPlayers.reduce<{ name: string; amount: number } | null>(
                          (best, p) => (!best || p.amount > best.amount) ? p : best, null
                        );
                        const winAmt = winner && winner.amount > 0 ? winner.amount : 0;
                        return (
                          <TableRow key={rowKey} data-testid={`row-manual-${idx}`}>
                            <TableCell />
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {row.createdAt ? format(new Date(row.createdAt), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="text-sm">
                                {winner && winAmt > 0 ? (
                                  <>
                                    <span className="font-semibold text-green-600">{winner.name}</span>
                                    {' wins '}
                                    <span className="font-semibold text-green-600">${winAmt.toFixed(2)}</span>
                                    <span className="text-muted-foreground"> – {row.matchName}</span>
                                  </>
                                ) : (
                                  <span className="text-muted-foreground">{row.matchName}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className={`font-bold ${winAmt > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>${winAmt.toFixed(2)}</span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <StatusBadge isComplete={row.isComplete} />
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // --- Team-based bet rows (nassau, death_match, ttb, otzb, other) ---
                      const teamAName = row.teamAMembers.length > 0 ? row.teamAMembers.join(', ') : 'Team A';
                      const teamBName = row.teamBMembers.length > 0 ? row.teamBMembers.join(', ') : 'Team B';
                      const teamAWon = row.teamAAmount > 0;
                      const teamBWon = row.teamBAmount > 0;
                      const isTie = row.teamAAmount === 0 && row.teamBAmount === 0;
                      const winnerName = teamAWon ? teamAName : teamBName;
                      const loserName = teamAWon ? teamBName : teamAName;
                      const aCount = row.teamAPlayerIds.size || 1;
                      const bCount = row.teamBPlayerIds.size || 1;
                      const perPersonAmount = teamAWon
                        ? Math.abs(row.teamAAmount) / aCount
                        : teamBWon
                        ? Math.abs(row.teamBAmount) / bCount
                        : 0;

                      const line1 = isTie ? (
                        <div className="flex flex-wrap items-center gap-x-1 text-sm">
                          <span className="font-semibold">{teamAName}</span>
                          <span className="text-muted-foreground">tied</span>
                          <span className="font-semibold">{teamBName}</span>
                          <span className="text-muted-foreground">–</span>
                          <span className="text-xs text-muted-foreground">{row.betTypeLabel}</span>
                          <span className="text-xs text-muted-foreground">$0.00</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-1 text-sm">
                          <span className="font-semibold text-green-600">{winnerName}</span>
                          <span className="text-muted-foreground">wins</span>
                          <span className="font-semibold text-green-600">${perPersonAmount.toFixed(2)}</span>
                          <span className="text-muted-foreground">from</span>
                          <span className="font-semibold">{loserName}</span>
                          <span className="text-muted-foreground">–</span>
                          <span className="text-xs text-muted-foreground">{row.betTypeLabel}</span>
                          {row.isAutoPress && row.groupType === 'other' && <AutoPressBadge />}
                        </div>
                      );

                      const line2 = (() => {
                        if (row.groupType === 'nassau') {
                          return (
                            <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-0.5">
                              <NassauLegSummary legs={row.nassauLegs} />
                            </div>
                          );
                        }
                        if (row.groupType === 'death_match') {
                          const bb = row.deathMatchLegs['Best Ball'];
                          const sb = row.deathMatchLegs['2nd Ball'];
                          return (
                            <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap items-center gap-x-1">
                              {bb && (
                                <span className="inline-flex items-center gap-1">
                                  <span>Best Ball:</span>
                                  <span className={(bb.teamAAmount !== 0 || bb.teamBAmount !== 0) ? 'text-foreground' : ''}>{bb.resultText || '–'}</span>
                                </span>
                              )}
                              {bb && sb && <span className="mx-0.5">·</span>}
                              {sb && (
                                <span className="inline-flex items-center gap-1">
                                  <span>2nd Ball:</span>
                                  <span className={(sb.teamAAmount !== 0 || sb.teamBAmount !== 0) ? 'text-foreground' : ''}>{sb.resultText || '–'}</span>
                                </span>
                              )}
                            </div>
                          );
                        }
                        if (row.groupType === 'ttb') {
                          return (
                            <div className="mt-0.5 space-y-0.5">
                              {(['2 Ball', '3rd Ball'] as const).map(prefix => {
                                const legs = row.ttbSubLegs[prefix];
                                if (!legs || Object.keys(legs).length === 0) return null;
                                return (
                                  <div key={prefix} className="text-xs text-muted-foreground flex items-center gap-1">
                                    <span className="font-medium text-foreground/70">{prefix}:</span>
                                    <NassauLegSummary legs={legs} />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        if (row.groupType === 'otzb') {
                          return (
                            <div className="mt-0.5 space-y-0.5">
                              {(['1 Ball', '2nd3rd Ball'] as const).map(prefix => {
                                const legs = row.otzbSubLegs[prefix];
                                if (!legs || Object.keys(legs).length === 0) return null;
                                return (
                                  <div key={prefix} className="text-xs text-muted-foreground flex items-center gap-1">
                                    <span className="font-medium text-foreground/70">{prefix}:</span>
                                    <NassauLegSummary legs={legs} />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }
                        if (row.groupType === 'other' && row.resultText) {
                          return <div className="mt-0.5 text-xs text-muted-foreground">{row.resultText}</div>;
                        }
                        return null;
                      })();

                      return (
                        <>
                          <TableRow key={rowKey} data-testid={`row-group-${idx}`}>
                            <TableCell>{expandBtn}</TableCell>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {row.createdAt ? format(new Date(row.createdAt), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell className="py-2">
                              <div className="text-xs text-muted-foreground mb-0.5">{row.matchName}</div>
                              {line1}
                              {line2}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className={`font-bold ${isTie ? 'text-muted-foreground' : 'text-green-600'}`}>
                                {isTie ? '$0.00' : `$${perPersonAmount.toFixed(2)}`}
                              </span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <StatusBadge isComplete={row.isComplete} />
                            </TableCell>
                          </TableRow>
                          {expandPanel}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              );
            })()
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              No transactions in this date range.
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Manual Bets Section */}
      {manualBets && manualBets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Manual Bets
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manualBets.map((bet) => (
                  <TableRow key={bet.id} data-testid={`row-manual-bet-${bet.id}`}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {bet.createdAt ? format(new Date(bet.createdAt), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{bet.description}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {bet.entries.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-2">
                            <span className="text-sm">{entry.playerName}</span>
                            <span className={`text-sm font-medium ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {entry.amount >= 0 ? '+' : ''}${(entry.amount / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteBetMutation.mutate(bet.id)}
                        disabled={deleteBetMutation.isPending}
                        data-testid={`button-delete-bet-${bet.id}`}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={detailModal !== null} onOpenChange={(open) => !open && setDetailModal(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto" data-testid="dialog-ledger-detail">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title">
              {detailModal?.playerName} - {detailModal?.type === "won" ? "Winnings" : detailModal?.type === "lost" ? "Losses" : "All Transactions"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {detailModal && combinedLedgerResults?.entries && (() => {
              const playerEntries = combinedLedgerResults.entries.filter(e => e.playerId === detailModal.playerId);
              const filteredEntries = detailModal.type === "won" 
                ? playerEntries.filter(e => e.amount > 0)
                : detailModal.type === "lost"
                ? playerEntries.filter(e => e.amount < 0)
                : playerEntries;
              
              if (filteredEntries.length === 0) {
                return <div className="text-muted-foreground text-center py-4" data-testid="text-no-transactions">No transactions</div>;
              }
              
              const total = filteredEntries.reduce((sum, e) => sum + e.amount, 0);
              
              return (
                <>
                  <div className="space-y-2">
                    {filteredEntries.map((entry, idx) => {
                      const isSkins = entry.betType === 'Skins';
                      const isManual = entry.betType === 'Manual Bet';
                      const hasTeamData = !!(entry.teamAMembers && entry.teamBMembers &&
                        entry.teamAMembers.length > 0 && entry.teamBMembers.length > 0);
                      const isTeamBet = !isSkins && !isManual && hasTeamData;
                      const dateLabel = entry.createdAt
                        ? format(new Date(entry.createdAt), "MMM d, yyyy")
                        : null;

                      if (isTeamBet) {
                        const playerTeamIdx = entry.teamIndex ?? 0;
                        const teamAName = entry.teamAMembers!.join('/');
                        const teamBName = entry.teamBMembers!.join('/');
                        const isTie = entry.amount === 0;
                        const playerWon = entry.amount > 0;
                        const teamAWon = !isTie && (
                          (playerTeamIdx === 0 && playerWon) ||
                          (playerTeamIdx === 1 && !playerWon)
                        );
                        const teamBWon = !isTie && (
                          (playerTeamIdx === 1 && playerWon) ||
                          (playerTeamIdx === 0 && !playerWon)
                        );
                        const perPerson = Math.abs(entry.amount);
                        const teamAHasSelected = playerTeamIdx === 0;
                        const teamBHasSelected = playerTeamIdx === 1;

                        return (
                          <div
                            key={`${entry.matchId}-${entry.betType}-${idx}`}
                            className="bg-muted/50 rounded-lg p-3"
                            data-testid={`detail-row-${idx}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-semibold truncate">{entry.betType || 'Match Play'}</span>
                                {entry.isAutoPress && (
                                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-amber-500 text-amber-600 text-[10px] font-bold" title="Auto Press">
                                    P
                                  </span>
                                )}
                                {entry.pressHole && (
                                  <span className="text-xs text-muted-foreground">Press hole {entry.pressHole}</span>
                                )}
                              </div>
                              <span className={`text-sm font-bold ${isTie ? 'text-muted-foreground' : 'text-primary'}`}>
                                {isTie ? 'Tie' : `$${perPerson.toFixed(2)}/person`}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className={`rounded-lg p-2 ${teamAWon ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'} ${teamAHasSelected ? 'ring-1 ring-primary' : ''}`}>
                                <div className={`text-xs font-medium ${teamAWon ? 'text-primary' : isTie ? 'text-muted-foreground' : 'text-destructive'}`}>
                                  {teamAName} {teamAWon && '(Won)'}
                                </div>
                              </div>
                              <div className={`rounded-lg p-2 ${teamBWon ? 'bg-primary/10 border border-primary/30' : 'bg-muted/50'} ${teamBHasSelected ? 'ring-1 ring-primary' : ''}`}>
                                <div className={`text-xs font-medium ${teamBWon ? 'text-primary' : isTie ? 'text-muted-foreground' : 'text-destructive'}`}>
                                  {teamBName} {teamBWon && '(Won)'}
                                </div>
                              </div>
                            </div>
                            {dateLabel && (
                              <div className="text-xs text-muted-foreground mt-2">{dateLabel}</div>
                            )}
                          </div>
                        );
                      }

                      // Skins / Manual / fallback: simple row
                      const matchLabel = (() => {
                        const opponentMembers = entry.teamIndex === 0
                          ? entry.teamBMembers
                          : entry.teamAMembers;
                        if (opponentMembers && opponentMembers.length > 0) {
                          return `vs ${opponentMembers.join(' & ')}`;
                        }
                        const opponentEntry = combinedLedgerResults.entries.find(e =>
                          e.matchId === entry.matchId &&
                          e.betType === entry.betType &&
                          e.teamIndex !== entry.teamIndex &&
                          e.teamName
                        );
                        if (opponentEntry?.teamName) {
                          return `vs ${opponentEntry.teamName}`;
                        }
                        return entry.matchName?.split(' - ')[0] || 'Match';
                      })();

                      return (
                        <div
                          key={`${entry.matchId}-${entry.betType}-${idx}`}
                          className="bg-muted/50 rounded-lg p-3 flex items-center justify-between gap-3"
                          data-testid={`detail-row-${idx}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{matchLabel}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{entry.betType || 'Match Play'}</span>
                              {entry.pressHole && <span>· Press #{entry.pressHole}</span>}
                              {dateLabel && <span>· {dateLabel}</span>}
                            </div>
                          </div>
                          <div className={`text-sm font-bold ${entry.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {entry.amount >= 0 ? '+' : ''}${entry.amount.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t pt-2 mt-2 flex justify-between items-center font-bold" data-testid="row-total">
                    <span>Total</span>
                    <span className={total >= 0 ? "text-green-600" : "text-red-600"} data-testid="text-total-amount">
                      {total >= 0 ? "+" : ""}${total.toFixed(2)}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
