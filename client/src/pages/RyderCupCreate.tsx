import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trophy, Users, ArrowLeft, ArrowRight, DollarSign, ChevronLeft, ChevronRight, Check, Flag, CalendarDays, Clock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type FullPlayerData = {
  players: { name: string; handicapIndex: number | null; showInRoster: boolean }[];
};

export default function RyderCupCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const [eventName, setEventName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [courseId, setCourseId] = useState<number | undefined>();
  const [useHandicaps, setUseHandicaps] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState(300);
  const [teamWinBonus, setTeamWinBonus] = useState(125);
  const [matchWinBonus, setMatchWinBonus] = useState(25);
  const [matchTieBonus, setMatchTieBonus] = useState(12.5);
  const [dailySkinsPot, setDailySkinsPot] = useState(212.5);
  const [closestToHolePayout, setClosestToHolePayout] = useState(0);

  const [useDifferentCourses, setUseDifferentCourses] = useState(false);
  const [dayConfigs, setDayConfigs] = useState<{ 
    dayNumber: number; 
    courseId?: number; 
    courseName: string;
    date: string;
    teeTimes: string[];
  }[]>([
    { dayNumber: 1, courseName: "", date: "", teeTimes: [] },
    { dayNumber: 2, courseName: "", date: "", teeTimes: [] },
    { dayNumber: 3, courseName: "", date: "", teeTimes: [] },
    { dayNumber: 4, courseName: "", date: "", teeTimes: [] },
  ]);

  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [teamAColor, setTeamAColor] = useState("#3b82f6");
  const [teamBColor, setTeamBColor] = useState("#ef4444");
  const [teamAMembers, setTeamAMembers] = useState<string[]>([]);
  const [teamBMembers, setTeamBMembers] = useState<string[]>([]);

  const { data: courses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/courses"],
  });

  const { data: playerData } = useQuery<FullPlayerData>({
    queryKey: ["/api/preset-players/full"],
  });

  const availablePlayers = useMemo(() => {
    if (!playerData?.players) return [];
    return playerData.players
      .filter(p => p.showInRoster)
      .map(p => ({ name: p.name, handicapIndex: p.handicapIndex }));
  }, [playerData]);

  const unassignedPlayers = useMemo(() => {
    const assigned = new Set([...teamAMembers, ...teamBMembers]);
    return availablePlayers.filter(p => !assigned.has(p.name));
  }, [availablePlayers, teamAMembers, teamBMembers]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: eventName,
        courseName: useDifferentCourses ? dayConfigs[0].courseName : courseName,
        courseId: useDifferentCourses ? dayConfigs[0].courseId : courseId,
        buyInAmount: Math.round(buyInAmount * 100),
        teamWinBonus: Math.round(teamWinBonus * 100),
        matchWinBonus: Math.round(matchWinBonus * 100),
        matchTieBonus: Math.round(matchTieBonus * 100),
        dailySkinsPot: Math.round(dailySkinsPot * 100),
        closestToHolePayout: Math.round(closestToHolePayout * 100),
        targetPoints: 65,
        useHandicaps,
        numberOfDays: 4,
        dayConfigs: dayConfigs.map(dc => ({
          dayNumber: dc.dayNumber,
          date: dc.date || undefined,
          teeTimes: dc.teeTimes.length > 0 ? dc.teeTimes : undefined,
          courseId: useDifferentCourses ? dc.courseId : courseId,
          courseName: useDifferentCourses ? dc.courseName : courseName,
        })),
        teamA: {
          name: teamAName,
          color: teamAColor,
          members: teamAMembers.map(name => {
            const player = availablePlayers.find(p => p.name === name);
            return { playerName: name, handicapIndex: player?.handicapIndex ?? undefined };
          }),
        },
        teamB: {
          name: teamBName,
          color: teamBColor,
          members: teamBMembers.map(name => {
            const player = availablePlayers.find(p => p.name === name);
            return { playerName: name, handicapIndex: player?.handicapIndex ?? undefined };
          }),
        },
      };
      return apiRequest("POST", "/api/ryder-cup", payload);
    },
    onSuccess: async (response) => {
      const event = await response.json();
      await apiRequest("POST", `/api/ryder-cup/${event.id}/generate-schedule`);
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup"] });
      toast({ title: "Event Created!", description: "Your Ryder Cup event and schedule have been created." });
      setLocation(`/ryder-cup/${event.id}`);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create event", variant: "destructive" });
    },
  });

  const addToTeam = (playerName: string, team: "A" | "B") => {
    if (team === "A" && teamAMembers.length < 6) {
      setTeamAMembers([...teamAMembers, playerName]);
    } else if (team === "B" && teamBMembers.length < 6) {
      setTeamBMembers([...teamBMembers, playerName]);
    }
  };

  const removeFromTeam = (playerName: string, team: "A" | "B") => {
    if (team === "A") {
      setTeamAMembers(teamAMembers.filter(n => n !== playerName));
    } else {
      setTeamBMembers(teamBMembers.filter(n => n !== playerName));
    }
  };

  const canProceedStep1 = eventName.length > 0 && (
    useDifferentCourses 
      ? dayConfigs.every(dc => dc.courseName.length > 0)
      : courseName.length > 0
  );
  const canProceedStep2 = teamAMembers.length === 6 && teamBMembers.length === 6;

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="grid gap-4">
        <div>
          <Label htmlFor="eventName">Event Name</Label>
          <Input
            id="eventName"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="e.g., 2026 Golf Betting Ryder Cup"
            data-testid="input-event-name"
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <Label>Different Course Each Day</Label>
            <p className="text-sm text-muted-foreground">Play a different course each day</p>
          </div>
          <Switch
            checked={useDifferentCourses}
            onCheckedChange={setUseDifferentCourses}
            data-testid="switch-different-courses"
          />
        </div>
        {!useDifferentCourses ? (
          <div>
            <Label htmlFor="course">Course (all days)</Label>
            <Select
              value={courseId?.toString() || ""}
              onValueChange={(val) => {
                const id = parseInt(val);
                setCourseId(id);
                const course = courses.find(c => c.id === id);
                if (course) setCourseName(course.name);
              }}
            >
              <SelectTrigger data-testid="select-course">
                <SelectValue placeholder="Select a course" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id.toString()}>
                    {course.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-3">
            <Label>Course for Each Day</Label>
            {[1, 2, 3, 4].map((dayNum) => (
              <div key={dayNum} className="flex items-center gap-3">
                <span className="text-sm font-medium w-16">Day {dayNum}</span>
                <Select
                  value={dayConfigs[dayNum - 1]?.courseId?.toString() || ""}
                  onValueChange={(val) => {
                    const id = parseInt(val);
                    const course = courses.find(c => c.id === id);
                    setDayConfigs(prev => prev.map(dc => 
                      dc.dayNumber === dayNum 
                        ? { ...dc, courseId: id, courseName: course?.name || "" }
                        : dc
                    ));
                  }}
                >
                  <SelectTrigger data-testid={`select-course-day-${dayNum}`} className="flex-1">
                    <SelectValue placeholder={`Select course for Day ${dayNum}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((course) => (
                      <SelectItem key={course.id} value={course.id.toString()}>
                        {course.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <Label>Use Handicaps</Label>
            <p className="text-sm text-muted-foreground">Enable net scoring for matches</p>
          </div>
          <Switch
            checked={useHandicaps}
            onCheckedChange={setUseHandicaps}
            data-testid="switch-handicaps"
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <CalendarDays className="w-5 h-5" /> Schedule (Optional)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Set dates and tee times for each day. You can also configure these later.
        </p>
        <div className="space-y-4">
          {dayConfigs.map((dc, idx) => (
            <div key={dc.dayNumber} className="p-3 border rounded-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Day {dc.dayNumber}</span>
                {dc.date && (
                  <span className="text-sm text-muted-foreground">
                    {new Date(dc.date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Date</Label>
                  <Input
                    type="date"
                    value={dc.date}
                    onChange={(e) => {
                      setDayConfigs(prev => prev.map((d, i) => 
                        i === idx ? { ...d, date: e.target.value } : d
                      ));
                    }}
                    data-testid={`input-date-day-${dc.dayNumber}`}
                  />
                </div>
                <div>
                  <Label className="text-sm">Tee Times</Label>
                  <div className="flex gap-1 flex-wrap min-h-9 items-center">
                    {dc.teeTimes.map((time, timeIdx) => (
                      <Badge key={timeIdx} variant="secondary" className="gap-1">
                        {time}
                        <button
                          type="button"
                          onClick={() => {
                            setDayConfigs(prev => prev.map((d, i) => 
                              i === idx 
                                ? { ...d, teeTimes: d.teeTimes.filter((_, ti) => ti !== timeIdx) }
                                : d
                            ));
                          }}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                    <Input
                      type="time"
                      className="w-24"
                      placeholder="Add"
                      onBlur={(e) => {
                        if (e.target.value) {
                          const timeStr = e.target.value;
                          const [hours, mins] = timeStr.split(':');
                          const hour = parseInt(hours);
                          const ampm = hour >= 12 ? 'PM' : 'AM';
                          const displayHour = hour % 12 || 12;
                          const formattedTime = `${displayHour}:${mins} ${ampm}`;
                          setDayConfigs(prev => prev.map((d, i) => 
                            i === idx && !d.teeTimes.includes(formattedTime)
                              ? { ...d, teeTimes: [...d.teeTimes, formattedTime].sort() }
                              : d
                          ));
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.currentTarget;
                          if (input.value) {
                            const timeStr = input.value;
                            const [hours, mins] = timeStr.split(':');
                            const hour = parseInt(hours);
                            const ampm = hour >= 12 ? 'PM' : 'AM';
                            const displayHour = hour % 12 || 12;
                            const formattedTime = `${displayHour}:${mins} ${ampm}`;
                            setDayConfigs(prev => prev.map((d, i) => 
                              i === idx && !d.teeTimes.includes(formattedTime)
                                ? { ...d, teeTimes: [...d.teeTimes, formattedTime].sort() }
                                : d
                            ));
                            input.value = '';
                          }
                        }
                      }}
                      data-testid={`input-tee-time-day-${dc.dayNumber}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t pt-4">
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <DollarSign className="w-5 h-5" /> Prize Configuration
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Buy-in ($)</Label>
            <Input
              type="number"
              value={buyInAmount}
              onChange={(e) => setBuyInAmount(parseFloat(e.target.value) || 0)}
              data-testid="input-buy-in"
            />
          </div>
          <div>
            <Label>Team Win Bonus ($)</Label>
            <Input
              type="number"
              value={teamWinBonus}
              onChange={(e) => setTeamWinBonus(parseFloat(e.target.value) || 0)}
              data-testid="input-team-win"
            />
          </div>
          <div>
            <Label>Match Win ($)</Label>
            <Input
              type="number"
              value={matchWinBonus}
              onChange={(e) => setMatchWinBonus(parseFloat(e.target.value) || 0)}
              data-testid="input-match-win"
            />
          </div>
          <div>
            <Label>Match Tie ($)</Label>
            <Input
              type="number"
              value={matchTieBonus}
              onChange={(e) => setMatchTieBonus(parseFloat(e.target.value) || 0)}
              data-testid="input-match-tie"
            />
          </div>
          <div>
            <Label>Daily Skins Pot ($)</Label>
            <Input
              type="number"
              value={dailySkinsPot}
              onChange={(e) => setDailySkinsPot(parseFloat(e.target.value) || 0)}
              data-testid="input-skins-pot"
            />
          </div>
          <div>
            <Label>Closest to Hole ($ per winner)</Label>
            <Input
              type="number"
              value={closestToHolePayout}
              onChange={(e) => setClosestToHolePayout(parseFloat(e.target.value) || 0)}
              data-testid="input-closest-to-hole"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <Input
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  className="text-lg font-semibold border-none p-0 h-auto"
                  data-testid="input-team-a-name"
                />
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={teamAColor}
                    onChange={(e) => setTeamAColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{teamAMembers.length}/6 players</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teamAMembers.map((name) => (
                <div key={name} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <span>{name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFromTeam(name, "A")}
                    data-testid={`button-remove-team-a-${name}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {teamAMembers.length < 6 && (
                <div className="text-center text-muted-foreground text-sm py-2">
                  Select {6 - teamAMembers.length} more player{6 - teamAMembers.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <Input
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  className="text-lg font-semibold border-none p-0 h-auto"
                  data-testid="input-team-b-name"
                />
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="color"
                    value={teamBColor}
                    onChange={(e) => setTeamBColor(e.target.value)}
                    className="w-6 h-6 rounded cursor-pointer"
                  />
                  <span className="text-sm text-muted-foreground">{teamBMembers.length}/6 players</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {teamBMembers.map((name) => (
                <div key={name} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <span>{name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeFromTeam(name, "B")}
                    data-testid={`button-remove-team-b-${name}`}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {teamBMembers.length < 6 && (
                <div className="text-center text-muted-foreground text-sm py-2">
                  Select {6 - teamBMembers.length} more player{6 - teamBMembers.length !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Available Players</CardTitle>
          <CardDescription>Click a player to add them to a team</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {unassignedPlayers.map((player) => (
              <div key={player.name} className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addToTeam(player.name, "A")}
                  disabled={teamAMembers.length >= 6}
                  style={{ borderColor: teamAColor }}
                  data-testid={`button-add-team-a-${player.name}`}
                >
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <Badge variant="secondary" className="px-3 py-1">
                  {player.name}
                  {player.handicapIndex !== null && (
                    <span className="ml-1 text-xs opacity-70">({(player.handicapIndex / 10).toFixed(1)})</span>
                  )}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addToTeam(player.name, "B")}
                  disabled={teamBMembers.length >= 6}
                  style={{ borderColor: teamBColor }}
                  data-testid={`button-add-team-b-${player.name}`}
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            ))}
            {unassignedPlayers.length === 0 && (
              <p className="text-muted-foreground text-sm">All players have been assigned to teams</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="w-5 h-5 text-green-500" />
            Review Your Event
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-muted-foreground">Event Name</Label>
              <p className="font-semibold">{eventName}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Course{useDifferentCourses ? "s" : ""}</Label>
              {useDifferentCourses ? (
                <div className="space-y-1">
                  {dayConfigs.map((dc) => (
                    <p key={dc.dayNumber} className="text-sm flex items-center gap-1">
                      <Flag className="w-3 h-3" /> Day {dc.dayNumber}: {dc.courseName}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="font-semibold flex items-center gap-1">
                  <Flag className="w-4 h-4" /> {courseName}
                </p>
              )}
            </div>
            <div>
              <Label className="text-muted-foreground">Format</Label>
              <p className="font-semibold">{useHandicaps ? "Handicapped" : "Scratch"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Buy-in</Label>
              <p className="font-semibold">${buyInAmount}</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3">Teams</h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: `${teamAColor}20`, borderLeft: `4px solid ${teamAColor}` }}>
                <h5 className="font-semibold mb-2">{teamAName}</h5>
                <ul className="text-sm space-y-1">
                  {teamAMembers.map(name => <li key={name}>{name}</li>)}
                </ul>
              </div>
              <div className="p-3 rounded-lg" style={{ backgroundColor: `${teamBColor}20`, borderLeft: `4px solid ${teamBColor}` }}>
                <h5 className="font-semibold mb-2">{teamBName}</h5>
                <ul className="text-sm space-y-1">
                  {teamBMembers.map(name => <li key={name}>{name}</li>)}
                </ul>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-2">Prize Structure</h4>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              <div>Team Win: ${teamWinBonus}/player</div>
              <div>Match Win: ${matchWinBonus}/player</div>
              <div>Match Tie: ${matchTieBonus}/player</div>
              <div>Daily Skins: ${dailySkinsPot}</div>
              {closestToHolePayout > 0 && <div>CTH: ${closestToHolePayout}/winner</div>}
            </div>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              After creation, a 4-day schedule will be automatically generated with 3 matches per day.
              Each player will partner with 4 of their 5 teammates across the event. First team to 6.5 points wins!
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/ryder-cup")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            Create Ryder Cup Event
          </h1>
          <p className="text-muted-foreground">Step {step} of 3</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {step === 1 && "Event Details"}
            {step === 2 && "Select Teams"}
            {step === 3 && "Confirm & Create"}
          </CardTitle>
          <CardDescription>
            {step === 1 && "Set up your event name, course, and prize structure"}
            {step === 2 && "Pick 6 players for each team"}
            {step === 3 && "Review and create your event"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep(step - 1)}
          disabled={step === 1}
          data-testid="button-previous"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={(step === 1 && !canProceedStep1) || (step === 2 && !canProceedStep2)}
            data-testid="button-next"
          >
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            data-testid="button-create-event"
          >
            {createMutation.isPending ? "Creating..." : "Create Event"}
          </Button>
        )}
      </div>
    </div>
  );
}
