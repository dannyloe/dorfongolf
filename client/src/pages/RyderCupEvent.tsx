import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Trophy, Flag, Users, Calendar, ArrowLeft, Plus, Check, X, Minus, DollarSign, Pencil, Clock, GripVertical, ClipboardList, ChevronLeft, ChevronRight, Circle, Camera, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useScanScorecard, ScannedPlayer } from "@/hooks/use-matches";
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
import type { RyderCupEventResponse, RyderCupPairingSide, RyderCupPairingSideWithScores, RyderCupPairingScore, MATCH_TYPES, Match, Course, CourseTee, CourseHole } from "@shared/schema";

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
  const [editingSideHandicap, setEditingSideHandicap] = useState<{ sideId: number; playerNumber: 1 | 2 } | null>(null);
  const [editingSideHandicapValue, setEditingSideHandicapValue] = useState("");
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

  const { data: courses = [] } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  // Get current day's course info for scorecard
  const currentDay = event?.days.find(d => d.dayNumber === selectedDay);
  const currentDayCourseId = currentDay?.courseId;

  const { data: courseTees = [] } = useQuery<CourseTee[]>({
    queryKey: ["/api/courses", currentDayCourseId, "tees"],
    enabled: !!currentDayCourseId,
  });

  const { data: courseHoles = [] } = useQuery<CourseHole[]>({
    queryKey: ["/api/courses", currentDayCourseId, "holes"],
    enabled: !!currentDayCourseId,
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

  const saveScoresMutation = useMutation({
    mutationFn: async ({ sideId, scores }: {
      sideId: number;
      scores: { holeNumber: number; player1Strokes: number | null; player2Strokes: number | null }[];
    }) => {
      return apiRequest("POST", `/api/ryder-cup/sides/${sideId}/scores`, { scores });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup", id] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save score", variant: "destructive" });
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
                              className="flex-1 p-3 rounded-lg"
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
                                const tee = courseTees.find(t => t.id === teeId) || courseTees[0];
                                const courseHcp = handicapIndex !== null && tee
                                  ? Math.round(handicapIndex * ((tee.slopeRating || 113) / 113))
                                  : null;
                                const isEditingThis = editingSideHandicap?.sideId === sideA?.id && editingSideHandicap?.playerNumber === playerNumber;
                                return (
                                  <div key={pIdx} className="flex items-center justify-between gap-2 py-1">
                                    <span className="font-medium text-sm truncate flex-1">{playerName}</span>
                                    <Select
                                      value={teeId?.toString() || ""}
                                      onValueChange={(val) => sideA && updateSidePlayerMutation.mutate({
                                        sideId: sideA.id,
                                        playerNumber,
                                        teeId: val ? parseInt(val) : null,
                                      })}
                                    >
                                      <SelectTrigger className="h-6 w-20 text-xs" data-testid={`select-tee-${sideA?.id}-${playerNumber}`}>
                                        <SelectValue placeholder="Tee" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {courseTees.map(t => (
                                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {isEditingThis ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          step="1"
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
                                        className={`text-xs w-8 justify-center cursor-pointer hover-elevate ${hasOverride ? "border-primary" : ""}`}
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
                            <span className="text-muted-foreground font-semibold">vs</span>
                            <div 
                              className="flex-1 p-3 rounded-lg"
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
                                const tee = courseTees.find(t => t.id === teeId) || courseTees[0];
                                const courseHcp = handicapIndex !== null && tee
                                  ? Math.round(handicapIndex * ((tee.slopeRating || 113) / 113))
                                  : null;
                                const isEditingThis = editingSideHandicap?.sideId === sideB?.id && editingSideHandicap?.playerNumber === playerNumber;
                                return (
                                  <div key={pIdx} className="flex items-center justify-between gap-2 py-1">
                                    <span className="font-medium text-sm truncate flex-1">{playerName}</span>
                                    <Select
                                      value={teeId?.toString() || ""}
                                      onValueChange={(val) => sideB && updateSidePlayerMutation.mutate({
                                        sideId: sideB.id,
                                        playerNumber,
                                        teeId: val ? parseInt(val) : null,
                                      })}
                                    >
                                      <SelectTrigger className="h-6 w-20 text-xs" data-testid={`select-tee-${sideB?.id}-${playerNumber}`}>
                                        <SelectValue placeholder="Tee" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {courseTees.map(t => (
                                          <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {isEditingThis ? (
                                      <div className="flex items-center gap-1">
                                        <Input
                                          type="number"
                                          step="1"
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
                                        className={`text-xs w-8 justify-center cursor-pointer hover-elevate ${hasOverride ? "border-primary" : ""}`}
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

                  const calculateCourseHandicap = (handicapIndex: number | null, tee: CourseTee | undefined): number | null => {
                    if (handicapIndex === null || !tee) return null;
                    const slopeRating = tee.slopeRating || 113;
                    return Math.round(handicapIndex * (slopeRating / 113));
                  };

                  const getPlayerTee = (side: RyderCupPairingSideWithScores, playerNumber: 1 | 2): CourseTee | undefined => {
                    const teeId = playerNumber === 1 ? side.player1TeeId : side.player2TeeId;
                    if (teeId) return courseTees.find(t => t.id === teeId);
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

                  const handleScoreSubmit = async (side: RyderCupPairingSideWithScores, hole: number) => {
                    if (!editingScore) return;
                    const strokes = editScoreValue ? parseInt(editScoreValue) : null;
                    if (editScoreValue && (isNaN(strokes!) || strokes! < 1 || strokes! > 15)) {
                      toast({ title: "Invalid score", description: "Enter 1-15", variant: "destructive" });
                      return;
                    }
                    const existingScore = side.scores.find(s => s.holeNumber === hole);
                    const player1Strokes = editingScore.playerNumber === 1 ? strokes : (existingScore?.player1Strokes ?? null);
                    const player2Strokes = editingScore.playerNumber === 2 ? strokes : (existingScore?.player2Strokes ?? null);
                    await saveScoresMutation.mutateAsync({
                      sideId: side.id,
                      scores: [{ holeNumber: hole, player1Strokes, player2Strokes }],
                    });
                    setEditingScore(null);
                    setEditScoreValue("");
                  };

                  const handleKeyDown = (e: React.KeyboardEvent, side: RyderCupPairingSideWithScores, hole: number) => {
                    if (e.key === "Enter") handleScoreSubmit(side, hole);
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
                                      onBlur={() => isEditing && handleScoreSubmit(side, hole)}
                                      onKeyDown={(e) => isEditing && handleKeyDown(e, side, hole)}
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
                                      onBlur={() => isEditing && handleScoreSubmit(side, hole)}
                                      onKeyDown={(e) => isEditing && handleKeyDown(e, side, hole)}
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
                      <span>{member.playerName}</span>
                      {editingMemberId === member.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
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
                      <span>{member.playerName}</span>
                      {editingMemberId === member.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
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
