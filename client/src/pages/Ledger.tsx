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
import { calculateLedger } from "@/lib/matchplay";
import { useCourses, useGroups, useMatches } from "@/hooks/use-matches";

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
    matches: Array<{ id: number; name: string | null; createdAt: string; courseId: number | null; groupId: number | null }>;
    eventMatches: Array<{ eventId: number; [key: string]: any }>;
    scores: Array<any>;
  }>({
    queryKey: [`/api/ledger?${queryParams}`],
  });

  // Filter event matches based on selected filters
  const filteredEventMatches = useMemo(() => {
    if (!data?.eventMatches || !data?.matches) return [];
    
    let filtered = data.eventMatches;
    
    // Create a map of event IDs to match data for quick lookup
    const matchById = new Map();
    for (const match of data.matches) {
      matchById.set(match.id, match);
    }
    
    // Filter by event
    if (selectedEventId !== "all") {
      const eventId = parseInt(selectedEventId);
      filtered = filtered.filter((em: { eventId: number }) => em.eventId === eventId);
    }
    
    // Filter by group
    if (selectedGroupId !== "all") {
      const groupId = parseInt(selectedGroupId);
      filtered = filtered.filter((em: { eventId: number }) => {
        const match = matchById.get(em.eventId);
        return match?.groupId === groupId;
      });
    }
    
    // Filter by course
    if (selectedCourseId !== "all") {
      const courseId = parseInt(selectedCourseId);
      filtered = filtered.filter((em: { eventId: number }) => {
        const match = matchById.get(em.eventId);
        return match?.courseId === courseId;
      });
    }
    
    return filtered;
  }, [data, selectedEventId, selectedGroupId, selectedCourseId]);

  const ledgerResults = useMemo(() => {
    if (!filteredEventMatches || filteredEventMatches.length === 0 || !data?.scores) {
      return { balances: [], entries: [] };
    }
    return calculateLedger(filteredEventMatches as any, data.scores);
  }, [filteredEventMatches, data?.scores]);

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
            <div className="text-2xl font-bold" data-testid="text-events-count">{data?.matches?.length || 0}</div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  <TableHead className="whitespace-nowrap min-w-fit">Match</TableHead>
                  <TableHead className="whitespace-nowrap min-w-fit">Player</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Amount</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerResults.entries.map((entry, idx) => (
                  <TableRow key={`${entry.matchId}-${entry.playerId}-${idx}`} data-testid={`row-entry-${idx}`}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {entry.createdAt ? format(new Date(entry.createdAt), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{entry.matchName}</TableCell>
                    <TableCell className="whitespace-nowrap">{entry.playerName}</TableCell>
                    <TableCell className={`text-right font-bold whitespace-nowrap ${entry.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {entry.amount >= 0 ? "+" : ""}${entry.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        entry.isComplete 
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" 
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                      }`}>
                        {entry.isComplete ? "Complete" : "In Progress"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
