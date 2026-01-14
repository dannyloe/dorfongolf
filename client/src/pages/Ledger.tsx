import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, subDays, startOfYear } from "date-fns";
import { Calendar, DollarSign, TrendingUp, TrendingDown, Filter, ArrowLeft, MapPin, Users, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculateLedger, NetScoringContext } from "@/lib/matchplay";
import { useCourses, useGroups, useMatches } from "@/hooks/use-matches";
import { calculateCourseHandicap } from "@/lib/handicap";

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

  const { data: courses } = useCourses();
  const { data: groups } = useGroups();
  const { data: matches } = useMatches();

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("start", dateRange.from.toISOString());
    if (dateRange.to) params.set("end", dateRange.to.toISOString());
    return params.toString();
  }, [dateRange]);

  const { data, isLoading } = useQuery<{
    matches: Array<{ id: number; name: string | null; createdAt: string; courseId: number | null; groupId: number | null; isHandicapped?: boolean }>;
    eventMatches: Array<{ eventId: number; useNetScoring?: boolean; teams?: Array<{ members?: Array<{ playerId: number; player?: { handicapIndex: number | null; teeId: number | null } }> }>; [key: string]: any }>;
    scores: Array<any>;
    courseData?: Record<number, { holes: Array<{ holeNumber: number; handicap: number | null }>; tees: Array<{ id: number; slopeRating: number; courseRating: number }> }>;
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
      
      // Get all players from event matches for this match and build player handicaps
      const courseHandicaps = new Map<number, number>();
      for (const em of data.eventMatches) {
        if (em.eventId !== match.id) continue;
        
        for (const team of em.teams || []) {
          for (const member of team.members || []) {
            if (courseHandicaps.has(member.playerId)) continue;
            
            const player = member.player;
            if (!player || player.handicapIndex === null) continue;
            
            const teeId = player.teeId;
            
            if (teeId && teeLookup.has(teeId)) {
              const teeInfo = teeLookup.get(teeId)!;
              // calculateCourseHandicap expects handicapIndex in stored format (already * 10)
              const courseHandicap = calculateCourseHandicap(
                player.handicapIndex,
                teeInfo.slopeRating
              );
              courseHandicaps.set(member.playerId, courseHandicap);
            } else {
              // Fall back to handicap index as course handicap
              courseHandicaps.set(member.playerId, Math.round(player.handicapIndex / 10));
            }
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
        
        contextMap.set(match.id, { playerHandicaps, holeHandicaps, courseHandicaps });
      }
    }
    
    return contextMap.size > 0 ? contextMap : null;
  }, [data?.matches, data?.courseData, data?.eventMatches]);

  const ledgerResults = useMemo(() => {
    if (!filteredEventMatches || filteredEventMatches.length === 0 || !data?.scores) {
      return { balances: [], entries: [] };
    }
    return calculateLedger(filteredEventMatches as any, data.scores, netContextMap);
  }, [filteredEventMatches, data?.scores, netContextMap]);

  const quickFilters = [
    { label: "Last 30 Days", days: 30 },
    { label: "Last 90 Days", days: 90 },
    { label: "This Year", action: () => setDateRange({ from: startOfYear(new Date()), to: new Date() }) },
    { label: "All Time", action: () => setDateRange({ from: undefined, to: undefined }) },
  ];

  const totalPot = ledgerResults.balances.reduce((sum, b) => sum + Math.abs(b.netBalance), 0);
  const topWinner = ledgerResults.balances[0];
  const topLoser = ledgerResults.balances[ledgerResults.balances.length - 1];

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
      </div>

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
          {ledgerResults?.balances && ledgerResults.balances.length > 0 ? (
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
                {ledgerResults.balances.map((balance) => (
                  <TableRow key={balance.playerId} data-testid={`row-player-${balance.playerId}`}>
                    <TableCell className="font-medium whitespace-nowrap">{balance.playerName}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{balance.matchesPlayed}</TableCell>
                    <TableCell className="text-right text-green-600 whitespace-nowrap">
                      +${balance.totalWon.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-red-600 whitespace-nowrap">
                      -${balance.totalLost.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right font-bold whitespace-nowrap ${balance.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
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
          {ledgerResults?.entries && ledgerResults.entries.length > 0 ? (
            (() => {
              // Separate individual bets (Skins) from team-based bets
              const skinsEntries = ledgerResults.entries.filter(e => e.betType === 'Skins');
              const teamEntries = ledgerResults.entries.filter(e => e.betType !== 'Skins');
              
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
                            <div className="flex flex-col gap-1">
                              <div className={`text-sm ${row.teamAWon ? 'font-semibold text-green-600' : ''}`}>
                                {row.teamAMembers.join(', ') || 'Team A'}
                              </div>
                              <div className="text-xs text-muted-foreground">vs</div>
                              <div className={`text-sm ${row.teamBWon ? 'font-semibold text-green-600' : ''}`}>
                                {row.teamBMembers.join(', ') || 'Team B'}
                              </div>
                            </div>
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
    </div>
  );
}
