import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Trophy, Flag, Users, Calendar, ArrowLeft, Plus, Check, X, Minus, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RyderCupEventResponse, RyderCupPairingSide, MATCH_TYPES } from "@shared/schema";

export default function RyderCupEvent() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [recordResultDialogOpen, setRecordResultDialogOpen] = useState(false);
  const [selectedPairingId, setSelectedPairingId] = useState<number | null>(null);
  const [selectedWinnerId, setSelectedWinnerId] = useState<number | null>(null);
  const [winningMargin, setWinningMargin] = useState("");
  
  const [addSideMatchDialogOpen, setAddSideMatchDialogOpen] = useState(false);
  const [sideMatchSideA, setSideMatchSideA] = useState<string[]>([]);
  const [sideMatchSideB, setSideMatchSideB] = useState<string[]>([]);
  const [sideMatchPurse, setSideMatchPurse] = useState<string>("");

  const { data: event, isLoading } = useQuery<RyderCupEventResponse>({
    queryKey: ["/api/ryder-cup", id],
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

  const addSideMatchMutation = useMutation({
    mutationFn: async () => {
      if (!currentDay || sideMatchSideA.length === 0 || sideMatchSideB.length === 0) return;
      return apiRequest("POST", `/api/ryder-cup/${id}/side-matches`, {
        dayId: currentDay.id,
        matchFormat: "match_play_2_ball",
        purseAmount: sideMatchPurse ? Math.round(parseFloat(sideMatchPurse) * 100) : undefined,
        sideA: { playerNames: sideMatchSideA },
        sideB: { playerNames: sideMatchSideB },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
      toast({ title: "Side Match Added" });
      setAddSideMatchDialogOpen(false);
      setSideMatchSideA([]);
      setSideMatchSideB([]);
      setSideMatchPurse("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add side match", variant: "destructive" });
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
  const currentDay = event.days.find(d => d.dayNumber === selectedDay);

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

  const getAllPlayers = () => {
    const players: string[] = [];
    event.teams.forEach(team => {
      team.members.forEach(member => {
        players.push(member.playerName);
      });
    });
    return players;
  };

  const calculatePayouts = () => {
    const payouts: Record<string, number> = {};
    const allPlayers = [...(teamA?.members || []), ...(teamB?.members || [])];
    allPlayers.forEach(m => { payouts[m.playerName] = 0; });

    for (const day of event.days) {
      for (const pairing of day.pairings) {
        if (!pairing.result || !pairing.isPrimary) continue;
        
        for (const side of pairing.sides) {
          const players = [side.player1Name, side.player2Name].filter(Boolean);
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

    return payouts;
  };

  const payouts = calculatePayouts();

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
            <h3 className="font-semibold text-lg">{teamA?.name}</h3>
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
            <h3 className="font-semibold text-lg">{teamB?.name}</h3>
            <p className="text-4xl font-bold text-primary mt-2">
              {(teamB?.totalPoints || 0) / 10}
            </p>
            <p className="text-sm text-muted-foreground">points</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="schedule">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="schedule" data-testid="tab-schedule">Schedule</TabsTrigger>
          <TabsTrigger value="teams" data-testid="tab-teams">Teams</TabsTrigger>
          <TabsTrigger value="skins" data-testid="tab-skins">Skins</TabsTrigger>
          <TabsTrigger value="payouts" data-testid="tab-payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <div className="flex gap-2">
            {event.days.map((day) => (
              <Button
                key={day.id}
                variant={selectedDay === day.dayNumber ? "default" : "outline"}
                onClick={() => setSelectedDay(day.dayNumber)}
                data-testid={`button-day-${day.dayNumber}`}
              >
                Day {day.dayNumber}
              </Button>
            ))}
          </div>

          {currentDay && (
            <div className="space-y-3">
              <h3 className="font-semibold">Day {currentDay.dayNumber} Matches</h3>
              {currentDay.pairings.filter(p => p.isPrimary).map((pairing) => {
                const sideA = pairing.sides.find(s => s.teamId === teamA?.id);
                const sideB = pairing.sides.find(s => s.teamId === teamB?.id);
                const displayA = sideA ? getSideDisplay(sideA) : null;
                const displayB = sideB ? getSideDisplay(sideB) : null;
                
                return (
                  <Card key={pairing.id} data-testid={`card-pairing-${pairing.id}`}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div 
                            className="flex-1 p-3 rounded-lg text-center"
                            style={{ backgroundColor: `${displayA?.color}20` }}
                          >
                            <p className="font-medium">{displayA?.names}</p>
                            <p className="text-xs text-muted-foreground">{displayA?.teamName}</p>
                          </div>
                          <span className="text-muted-foreground font-semibold">vs</span>
                          <div 
                            className="flex-1 p-3 rounded-lg text-center"
                            style={{ backgroundColor: `${displayB?.color}20` }}
                          >
                            <p className="font-medium">{displayB?.names}</p>
                            <p className="text-xs text-muted-foreground">{displayB?.teamName}</p>
                          </div>
                        </div>
                        <div className="ml-4">
                          {pairing.result ? (
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
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => openRecordResult(pairing.id)}
                              data-testid={`button-record-result-${pairing.id}`}
                            >
                              Record Result
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">Side Matches</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddSideMatchDialogOpen(true)}
                    data-testid="button-add-side-match"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Side Match
                  </Button>
                </div>
                {currentDay.pairings.filter(p => !p.isPrimary).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No side matches for this day</p>
                ) : (
                  <div className="space-y-2">
                    {currentDay.pairings.filter(p => !p.isPrimary).map((pairing) => {
                      const sideA = pairing.sides[0];
                      const sideB = pairing.sides[1];
                      return (
                        <Card key={pairing.id} className="border-dashed">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between text-sm">
                              <span>
                                {sideA?.player1Name}{sideA?.player2Name ? ` & ${sideA.player2Name}` : ""} 
                                {" vs "}
                                {sideB?.player1Name}{sideB?.player2Name ? ` & ${sideB.player2Name}` : ""}
                              </span>
                              <div className="flex items-center gap-2">
                                {pairing.purseAmount && pairing.purseAmount > 0 && (
                                  <Badge variant="outline">{formatCurrency(pairing.purseAmount)}</Badge>
                                )}
                                {!pairing.result && (
                                  <Button size="sm" variant="ghost" onClick={() => openRecordResult(pairing.id)}>
                                    Result
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
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
                    <li key={member.id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span>{member.playerName}</span>
                      {member.handicapIndex !== null && (
                        <Badge variant="outline">{(member.handicapIndex / 10).toFixed(1)}</Badge>
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
                    <li key={member.id} className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span>{member.playerName}</span>
                      {member.handicapIndex !== null && (
                        <Badge variant="outline">{(member.handicapIndex / 10).toFixed(1)}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="skins">
          <Card>
            <CardHeader>
              <CardTitle>Daily Skins Game</CardTitle>
              <CardDescription>
                {formatCurrency(event.dailySkinsPot)} pot per day (rolls over if no winner)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {event.days.map((day) => (
                  <div key={day.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">Day {day.dayNumber}</h4>
                      <Badge variant={day.skinsDistributed ? "secondary" : "outline"}>
                        {day.skinsDistributed ? "Distributed" : "Pending"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Pot: {formatCurrency(event.dailySkinsPot + day.skinsCarryover)}
                      {day.skinsCarryover > 0 && (
                        <span className="text-green-600 ml-2">
                          (+{formatCurrency(day.skinsCarryover)} carryover)
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" /> Payout Summary
              </CardTitle>
              <CardDescription>
                Buy-in: {formatCurrency(event.buyInAmount)} | Total pot: {formatCurrency(event.buyInAmount * 12)}
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
                            style={{ borderColor: team?.color, color: team?.color }}
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
      </Tabs>

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

      <Dialog open={addSideMatchDialogOpen} onOpenChange={setAddSideMatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Side Match - Day {selectedDay}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Side A Players</Label>
                <div className="space-y-1 mt-1 max-h-40 overflow-y-auto border rounded p-2">
                  {getAllPlayers().map(name => (
                    <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sideMatchSideA.includes(name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSideMatchSideA([...sideMatchSideA, name]);
                            setSideMatchSideB(sideMatchSideB.filter(n => n !== name));
                          } else {
                            setSideMatchSideA(sideMatchSideA.filter(n => n !== name));
                          }
                        }}
                        data-testid={`checkbox-side-a-${name}`}
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <Label>Side B Players</Label>
                <div className="space-y-1 mt-1 max-h-40 overflow-y-auto border rounded p-2">
                  {getAllPlayers().map(name => (
                    <label key={name} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sideMatchSideB.includes(name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSideMatchSideB([...sideMatchSideB, name]);
                            setSideMatchSideA(sideMatchSideA.filter(n => n !== name));
                          } else {
                            setSideMatchSideB(sideMatchSideB.filter(n => n !== name));
                          }
                        }}
                        data-testid={`checkbox-side-b-${name}`}
                      />
                      {name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <Label>Purse Amount ($, optional)</Label>
              <Input
                type="number"
                value={sideMatchPurse}
                onChange={(e) => setSideMatchPurse(e.target.value)}
                placeholder="0"
                data-testid="input-side-match-purse"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddSideMatchDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addSideMatchMutation.mutate()}
                disabled={addSideMatchMutation.isPending || sideMatchSideA.length === 0 || sideMatchSideB.length === 0}
                data-testid="button-create-side-match"
              >
                Create Side Match
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
