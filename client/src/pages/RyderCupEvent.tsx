import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Trophy, Flag, Users, Calendar, ArrowLeft, Plus, Check, X, Minus, DollarSign, Pencil, Clock, GripVertical, ClipboardList } from "lucide-react";
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
import { useAuth } from "@/hooks/use-auth";
import type { RyderCupEventResponse, RyderCupPairingSide, MATCH_TYPES, Match, Course } from "@shared/schema";

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
  const [newTeeTime, setNewTeeTime] = useState("");
  const [draggingPairingId, setDraggingPairingId] = useState<number | null>(null);

  const { data: event, isLoading } = useQuery<RyderCupEventResponse>({
    queryKey: ["/api/ryder-cup", id],
  });

  const { data: sideMatches = [] } = useQuery<Match[]>({
    queryKey: ["/api/ryder-cup", id, "matches"],
    enabled: !!id,
  });

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
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

  const createSideMatchMutation = useMutation({
    mutationFn: async (): Promise<Match> => {
      const currentDayData = event?.days.find(d => d.dayNumber === selectedDay);
      const courseName = currentDayData?.courseName || event?.courseName || "";
      const courseId = currentDayData?.courseId || event?.courseId;
      
      // Create the match (inherit handicap setting from Ryder Cup event)
      const res = await apiRequest("POST", "/api/matches", {
        name: `Day ${selectedDay} Side Match`,
        courseName,
        courseId,
        ryderCupEventId: parseInt(id!),
        ryderCupDayNumber: selectedDay,
        groupId: null,
        isHandicapped: event?.useHandicaps ?? true,
      });
      const newMatch = await res.json();
      
      // Get all player names from both teams
      const allPlayerNames = [
        ...(event?.teams[0]?.members || []).map(m => m.playerName),
        ...(event?.teams[1]?.members || []).map(m => m.playerName),
      ];
      
      // Add all tournament players to the match
      for (const playerName of allPlayerNames) {
        await apiRequest("POST", `/api/matches/${newMatch.id}/players`, { name: playerName });
      }
      
      return newMatch;
    },
    onSuccess: (newMatch) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id, "matches"] });
      toast({ title: "Side match created with all players" });
      setLocation(`/match/${newMatch.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create side match", variant: "destructive" });
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
                {day.courseName && !day.date && (
                  <span className="text-xs opacity-75 font-normal">{day.courseName}</span>
                )}
              </Button>
            ))}
          </div>

          {currentDay && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold">Day {currentDay.dayNumber} Matches</h3>
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
                    {currentDay.date && (
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="w-3 h-3 mr-1" /> {new Date(currentDay.date).toLocaleDateString()}
                      </Badge>
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
                          <div className="ml-4 flex items-center gap-2">
                            <Link href={`/ryder-cup/pairing/${pairing.id}/scorecard`}>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-scorecard-${pairing.id}`}
                              >
                                <ClipboardList className="w-4 h-4" />
                              </Button>
                            </Link>
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
                            ) : isCreatorOrAdmin ? (
                              <Button
                                size="sm"
                                onClick={() => openRecordResult(pairing.id)}
                                data-testid={`button-record-result-${pairing.id}`}
                              >
                                Record Result
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                });
              })()}

              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">Side Matches</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => createSideMatchMutation.mutate()}
                    disabled={createSideMatchMutation.isPending}
                    data-testid="button-add-side-match"
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add Side Match
                  </Button>
                </div>
                {(() => {
                  const daySideMatches = sideMatches.filter(m => m.ryderCupDayNumber === selectedDay);
                  if (daySideMatches.length === 0) {
                    return <p className="text-sm text-muted-foreground">No side matches for this day</p>;
                  }
                  return (
                    <div className="space-y-2">
                      {daySideMatches.map((match) => (
                        <Card 
                          key={match.id} 
                          className="border-dashed cursor-pointer hover-elevate"
                          onClick={() => setLocation(`/match/${match.id}`)}
                          data-testid={`card-side-match-${match.id}`}
                        >
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="font-medium">{match.name || "Side Match"}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{match.courseName}</Badge>
                                {match.completed && (
                                  <Badge variant="secondary">
                                    <Check className="w-3 h-3 mr-1" /> Complete
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
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
    </div>
  );
}
