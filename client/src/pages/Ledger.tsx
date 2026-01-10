import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, subDays, startOfYear } from "date-fns";
import { Calendar, DollarSign, TrendingUp, TrendingDown, Filter, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { calculateLedger } from "@/lib/matchplay";

type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

export default function Ledger() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 90),
    to: new Date(),
  });

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (dateRange.from) params.set("start", dateRange.from.toISOString());
    if (dateRange.to) params.set("end", dateRange.to.toISOString());
    return params.toString();
  }, [dateRange]);

  const { data, isLoading } = useQuery({
    queryKey: [`/api/ledger?${queryParams}`],
  });

  const ledgerResults = useMemo(() => {
    if (!data?.eventMatches || !data?.scores) return null;
    return calculateLedger(data.eventMatches, data.scores);
  }, [data]);

  const quickFilters = [
    { label: "Last 30 Days", days: 30 },
    { label: "Last 90 Days", days: 90 },
    { label: "This Year", action: () => setDateRange({ from: startOfYear(new Date()), to: new Date() }) },
    { label: "All Time", action: () => setDateRange({ from: undefined, to: undefined }) },
  ];

  const totalPot = ledgerResults?.balances.reduce((sum, b) => sum + Math.abs(b.netBalance), 0) || 0;
  const topWinner = ledgerResults?.balances[0];
  const topLoser = ledgerResults?.balances[ledgerResults.balances.length - 1];

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
        <CardContent>
          {ledgerResults?.balances && ledgerResults.balances.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Matches</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">Lost</TableHead>
                  <TableHead className="text-right">Net Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerResults.balances.map((balance) => (
                  <TableRow key={balance.playerId} data-testid={`row-player-${balance.playerId}`}>
                    <TableCell className="font-medium">{balance.playerName}</TableCell>
                    <TableCell className="text-right">{balance.matchesPlayed}</TableCell>
                    <TableCell className="text-right text-green-600">
                      +${balance.totalWon.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
                      -${balance.totalLost.toFixed(2)}
                    </TableCell>
                    <TableCell className={`text-right font-bold ${balance.netBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
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
        <CardContent>
          {ledgerResults?.entries && ledgerResults.entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Match</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerResults.entries.map((entry, idx) => (
                  <TableRow key={`${entry.matchId}-${entry.playerId}-${idx}`} data-testid={`row-entry-${idx}`}>
                    <TableCell className="text-muted-foreground text-sm">
                      {entry.createdAt ? format(new Date(entry.createdAt), "MMM d, yyyy") : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{entry.matchName}</TableCell>
                    <TableCell>{entry.playerName}</TableCell>
                    <TableCell className={`text-right font-bold ${entry.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {entry.amount >= 0 ? "+" : ""}${entry.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
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
