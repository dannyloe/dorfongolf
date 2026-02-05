import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, subDays, startOfYear } from "date-fns";
import { Calendar, DollarSign, TrendingUp, TrendingDown, Filter, ArrowLeft, MapPin, Users, Trophy, Plus, Trash2, X } from "lucide-react";
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
import { calculateLedger, NetScoringContext } from "@/lib/matchplay";
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
          contextMap.set(em.id, { playerHandicaps, holeHandicaps, courseHandicaps });
        }
      }
    }
    
    return contextMap.size > 0 ? contextMap : null;
  }, [data?.matches, data?.courseData, data?.eventMatches, data?.ryderCupPlayerDataByEventAndDay]);

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
    
    // Build entries from stored results (excluding Ryder Cup matches which we recalculate)
    const storedEntries = relevantStoredResults
      .filter(r => {
        const matchId = eventMatchToMatchId.get(r.eventMatchId);
        // Exclude Ryder Cup side matches - we recalculate those
        return !(matchId && ryderCupMatchIds.has(matchId));
      })
      .map(r => {
        const metadata = eventMatchToMetadata.get(r.eventMatchId) || { matchName: `Match ${r.eventMatchId}` };
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
    let calculatedEntries: typeof storedEntries = [];
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
      }));
    }
    
    // Merge all entries
    const entries = [...storedEntries, ...calculatedEntries];
    
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
    const manualBetEntries: typeof baseLedger.entries = [];
    
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
              // Separate individual bets (Skins) from team-based bets
              const skinsEntries = combinedLedgerResults.entries.filter(e => e.betType === 'Skins');
              const teamEntries = combinedLedgerResults.entries.filter(e => e.betType !== 'Skins');
              
              // Group team-based entries by match+betType to consolidate team view
              // Use teamIndex (0 or 1) as authoritative team identifier
              const groupedEntries = teamEntries.reduce((acc, entry, idx) => {
                const key = `${entry.matchId}-${entry.betType || 'default'}-${entry.matchName}`;
                if (!acc[key]) {
                  acc[key] = {
                    matchId: entry.matchId,
                    matchName: entry.matchName,
                    betType: entry.betType,
                    isAutoPress: entry.isAutoPress,
                    pressHole: entry.pressHole,
                    createdAt: entry.createdAt,
                    isComplete: entry.isComplete,
                    teamAMembers: entry.teamAMembers || [],
                    teamBMembers: entry.teamBMembers || [],
                    teamAAmount: 0,
                    teamBAmount: 0,
                    processedPlayers: new Set<number>(),
                  };
                }
                // Use teamIndex to route amounts to correct team bucket
                // Prevent duplicate player counting using playerId
                if (!acc[key].processedPlayers.has(entry.playerId)) {
                  acc[key].processedPlayers.add(entry.playerId);
                  // Use teamIndex (0=Team A, 1=Team B), throw error if undefined for team games
                  const teamIdx = entry.teamIndex;
                  if (teamIdx === undefined) {
                    console.warn(`Missing teamIndex for entry: ${entry.matchName} - ${entry.playerName}`);
                  }
                  if (teamIdx === 0 || teamIdx === undefined) {
                    acc[key].teamAAmount += entry.amount;
                  } else {
                    acc[key].teamBAmount += entry.amount;
                  }
                }
                return acc;
              }, {} as Record<string, {
                matchId: number;
                matchName: string;
                betType?: string;
                isAutoPress?: boolean;
                pressHole?: number | null;
                createdAt?: string;
                isComplete: boolean;
                teamAMembers: string[];
                teamBMembers: string[];
                teamAAmount: number;
                teamBAmount: number;
                processedPlayers: Set<number>;
              }>);

              // Convert to list and compute winning team info
              const groupedList = Object.values(groupedEntries).map(group => {
                // Determine winner based on accumulated team amounts
                const teamAWon = group.teamAAmount > 0;
                const teamBWon = group.teamBAmount > 0;
                const isTie = group.teamAAmount === 0 && group.teamBAmount === 0;
                const winAmount = Math.max(Math.abs(group.teamAAmount), Math.abs(group.teamBAmount));
                
                return {
                  ...group,
                  teamAWon,
                  teamBWon,
                  isTie,
                  winAmount,
                  isSkins: false,
                };
              });
              
              // Add skins entries as individual rows (grouped by match but showing individual results)
              const skinsGrouped = skinsEntries.reduce((acc, entry) => {
                const key = `${entry.matchId}-skins`;
                if (!acc[key]) {
                  acc[key] = {
                    matchId: entry.matchId,
                    matchName: entry.matchName,
                    betType: 'Skins',
                    isAutoPress: false,
                    pressHole: entry.pressHole,
                    createdAt: entry.createdAt,
                    isComplete: entry.isComplete,
                    players: [] as { name: string; amount: number }[],
                  };
                }
                acc[key].players.push({ name: entry.playerName, amount: entry.amount });
                return acc;
              }, {} as Record<string, {
                matchId: number;
                matchName: string;
                betType: string;
                isAutoPress: boolean;
                pressHole?: number | null;
                createdAt?: string;
                isComplete: boolean;
                players: { name: string; amount: number }[];
              }>);
              
              const skinsRows = Object.values(skinsGrouped).map(group => ({
                ...group,
                teamAMembers: group.players.map(p => p.name),
                teamBMembers: [] as string[],
                teamAWon: false,
                teamBWon: false,
                isTie: false,
                winAmount: 0,
                isSkins: true,
                playerResults: group.players,
              }));
              
              // Combine both types of entries
              const allRows = [...groupedList, ...skinsRows].sort((a, b) => {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return dateB - dateA;
              });

              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap min-w-fit">Match</TableHead>
                      <TableHead className="whitespace-nowrap min-w-fit">Bet Type</TableHead>
                      <TableHead className="whitespace-nowrap min-w-fit">Players/Teams</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Result</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allRows.map((row, idx) => {
                      if (row.isSkins && 'playerResults' in row) {
                        // Skins row - show individual player results
                        const winners = row.playerResults.filter((p: { amount: number }) => p.amount > 0);
                        const losers = row.playerResults.filter((p: { amount: number }) => p.amount < 0);
                        const totalWinnings = winners.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
                        
                        return (
                          <TableRow key={`${row.matchId}-skins-${idx}`} data-testid={`row-skins-${idx}`}>
                            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                              {row.createdAt ? format(new Date(row.createdAt), "MMM d, yyyy") : "-"}
                            </TableCell>
                            <TableCell className="font-medium">
                              <span className="whitespace-nowrap">{row.matchName}</span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <span className="text-sm">Skins</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 text-sm">
                                {winners.length > 0 && (
                                  <div className="text-green-600">
                                    {winners.map((p: { name: string; amount: number }) => `${p.name} +$${p.amount.toFixed(2)}`).join(', ')}
                                  </div>
                                )}
                                {losers.length > 0 && (
                                  <div className="text-red-600">
                                    {losers.map((p: { name: string; amount: number }) => `${p.name} $${p.amount.toFixed(2)}`).join(', ')}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className="font-bold text-green-600">${totalWinnings.toFixed(2)}</span>
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                row.isComplete 
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                              }`}>
                                {row.isComplete ? "Complete" : "In Progress"}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      }
                      
                      // Team-based bet row
                      return (
                        <TableRow key={`${row.matchId}-${row.betType}-${idx}`} data-testid={`row-group-${idx}`}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {row.createdAt ? format(new Date(row.createdAt), "MMM d, yyyy") : "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span className="whitespace-nowrap">{row.matchName?.split(' - ')[0]}</span>
                              {row.pressHole && (
                                <span className="text-xs text-muted-foreground">Press on hole {row.pressHole}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <span className="text-sm">{row.betType || 'Match Play'}</span>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const teamAName = row.teamAMembers.length > 0 ? row.teamAMembers.join(', ') : null;
                              const teamBName = row.teamBMembers.length > 0 ? row.teamBMembers.join(', ') : null;
                              
                              // If we have both team names, show traditional view
                              if (teamAName && teamBName) {
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className={`text-sm ${row.teamAWon ? 'font-semibold text-green-600' : ''}`}>
                                      {teamAName}
                                    </div>
                                    <div className="text-xs text-muted-foreground">vs</div>
                                    <div className={`text-sm ${row.teamBWon ? 'font-semibold text-green-600' : ''}`}>
                                      {teamBName}
                                    </div>
                                  </div>
                                );
                              }
                              
                              // Try to find team names from all entries for this match
                              const matchEntries = combinedLedgerResults.entries.filter(e => e.matchId === row.matchId);
                              const teamAFromEntries = matchEntries.filter(e => e.teamIndex === 0).map(e => e.playerName);
                              const teamBFromEntries = matchEntries.filter(e => e.teamIndex === 1).map(e => e.playerName);
                              const teamADisplay = teamAName || (teamAFromEntries.length > 0 ? Array.from(new Set(teamAFromEntries)).join(', ') : null);
                              const teamBDisplay = teamBName || (teamBFromEntries.length > 0 ? Array.from(new Set(teamBFromEntries)).join(', ') : null);
                              
                              // Also try teamName field from entries
                              if (!teamADisplay || !teamBDisplay) {
                                const teamAEntry = matchEntries.find(e => e.teamIndex === 0 && e.teamName);
                                const teamBEntry = matchEntries.find(e => e.teamIndex === 1 && e.teamName);
                                const finalTeamA = teamADisplay || teamAEntry?.teamName || 'Team A';
                                const finalTeamB = teamBDisplay || teamBEntry?.teamName || 'Team B';
                                
                                return (
                                  <div className="flex flex-col gap-1">
                                    <div className={`text-sm ${row.teamAWon ? 'font-semibold text-green-600' : ''}`}>
                                      {finalTeamA}
                                    </div>
                                    <div className="text-xs text-muted-foreground">vs</div>
                                    <div className={`text-sm ${row.teamBWon ? 'font-semibold text-green-600' : ''}`}>
                                      {finalTeamB}
                                    </div>
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="flex flex-col gap-1">
                                  <div className={`text-sm ${row.teamAWon ? 'font-semibold text-green-600' : ''}`}>
                                    {teamADisplay}
                                  </div>
                                  <div className="text-xs text-muted-foreground">vs</div>
                                  <div className={`text-sm ${row.teamBWon ? 'font-semibold text-green-600' : ''}`}>
                                    {teamBDisplay}
                                  </div>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {row.isTie ? (
                              <span className="text-muted-foreground">Tie</span>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <span className={`font-bold ${row.teamAWon || row.teamBWon ? 'text-green-600' : 'text-muted-foreground'}`}>
                                  ${row.winAmount.toFixed(2)}
                                </span>
                                {row.isAutoPress && (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border-2 border-amber-500 text-amber-600 text-xs font-bold" title="Auto Press">
                                    P
                                  </span>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.isComplete 
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            }`}>
                              {row.isComplete ? "Complete" : "In Progress"}
                            </span>
                          </TableCell>
                        </TableRow>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Match</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEntries.map((entry, idx) => (
                        <TableRow key={`${entry.matchId}-${entry.betType}-${idx}`}>
                          <TableCell className="text-sm">
                            <div className="flex flex-col">
                              <span>
                                {(() => {
                                  // Show opponent name instead of full match name
                                  // First try teamAMembers/teamBMembers from metadata
                                  const opponentMembers = entry.teamIndex === 0 
                                    ? entry.teamBMembers 
                                    : entry.teamAMembers;
                                  if (opponentMembers && opponentMembers.length > 0) {
                                    return `vs ${opponentMembers.join(' & ')}`;
                                  }
                                  // Fallback: Find opponent from ALL entries in same match with different teamIndex
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
                                })()}
                              </span>
                              {entry.createdAt && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(entry.createdAt), "MMM d, yyyy")}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col">
                              <span>{entry.betType || 'Match Play'}</span>
                              {entry.pressHole && (
                                <span className="text-xs text-muted-foreground">Press #{entry.pressHole}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className={`text-right font-medium ${entry.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {entry.amount >= 0 ? "+" : ""}${entry.amount.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t pt-2 flex justify-between items-center font-bold" data-testid="row-total">
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
