import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trophy, Users, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Check, Flag, CalendarDays, Clock, Plus, X, TreePalm, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@shared/schema";

type FullPlayerData = {
  players: { name: string; handicapIndex: number | null; showInRoster: boolean }[];
};

const EVENT_TYPE_CONFIG: Record<EventType, { icon: typeof Trophy; description: string; defaultDays: number }> = {
  [EVENT_TYPES.RYDER_CUP]: {
    icon: Trophy,
    description: "Team vs team competition with scheduled pairings",
    defaultDays: 4,
  },
  [EVENT_TYPES.BUDDY_TRIP]: {
    icon: TreePalm,
    description: "Multi-day golf trip with friends, side matches, and skins",
    defaultDays: 3,
  },
  [EVENT_TYPES.TOURNAMENT]: {
    icon: Medal,
    description: "Individual or group tournament across multiple rounds",
    defaultDays: 2,
  },
};

export default function RyderCupCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);

  const [eventType, setEventType] = useState<EventType>(EVENT_TYPES.RYDER_CUP);
  const [eventName, setEventName] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>();
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
  const [numberOfDays, setNumberOfDays] = useState(4);
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

  const isTeamEvent = eventType === EVENT_TYPES.RYDER_CUP;
  const totalSteps = isTeamEvent ? 3 : 2;

  const { data: courses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/courses"],
  });

  const { data: myGroups = [] } = useQuery<{id: number; name: string; memberCount: number; playerCount: number; role: string}[]>({
    queryKey: ["/api/groups/my"],
    queryFn: async () => {
      const res = await fetch("/api/groups/my", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
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

  const updateNumberOfDays = (newCount: number) => {
    setNumberOfDays(newCount);
    setDayConfigs(prev => {
      const configs = [...prev];
      while (configs.length < newCount) {
        configs.push({ dayNumber: configs.length + 1, courseName: "", date: "", teeTimes: [] });
      }
      return configs.slice(0, newCount);
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const activeDayConfigs = dayConfigs.slice(0, numberOfDays);
      const payload: Record<string, unknown> = {
        name: eventName,
        eventType,
        groupId: selectedGroupId,
        courseName: useDifferentCourses ? activeDayConfigs[0].courseName : courseName,
        courseId: useDifferentCourses ? activeDayConfigs[0].courseId : courseId,
        buyInAmount: Math.round(buyInAmount * 100),
        matchWinBonus: Math.round(matchWinBonus * 100),
        matchTieBonus: Math.round(matchTieBonus * 100),
        dailySkinsPot: Math.round(dailySkinsPot * 100),
        closestToHolePayout: Math.round(closestToHolePayout * 100),
        useHandicaps,
        numberOfDays,
        dayConfigs: activeDayConfigs.map(dc => ({
          dayNumber: dc.dayNumber,
          date: dc.date || undefined,
          teeTimes: dc.teeTimes.length > 0 ? dc.teeTimes : undefined,
          courseId: useDifferentCourses ? dc.courseId : courseId,
          courseName: useDifferentCourses ? dc.courseName : courseName,
        })),
      };

      if (isTeamEvent) {
        payload.teamWinBonus = Math.round(teamWinBonus * 100);
        payload.targetPoints = 65;
        payload.teamA = {
          name: teamAName,
          color: teamAColor,
          members: teamAMembers.map(name => {
            const player = availablePlayers.find(p => p.name === name);
            return { playerName: name, handicapIndex: player?.handicapIndex ?? undefined };
          }),
        };
        payload.teamB = {
          name: teamBName,
          color: teamBColor,
          members: teamBMembers.map(name => {
            const player = availablePlayers.find(p => p.name === name);
            return { playerName: name, handicapIndex: player?.handicapIndex ?? undefined };
          }),
        };
      }

      return apiRequest("POST", "/api/ryder-cup", payload);
    },
    onSuccess: async (response) => {
      const event = await response.json();
      if (isTeamEvent) {
        await apiRequest("POST", `/api/ryder-cup/${event.id}/generate-schedule`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup"] });
      toast({ title: "Event Created!", description: `Your ${EVENT_TYPE_LABELS[eventType]} event has been created.` });
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
      ? dayConfigs.slice(0, numberOfDays).every(dc => dc.courseName.length > 0)
      : courseName.length > 0
  );
  const canProceedStep2Team = teamAMembers.length === 6 && teamBMembers.length === 6;

  const renderEventTypeSelection = () => (
    <div className="space-y-3 mb-6">
      <Label>Event Type</Label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(Object.entries(EVENT_TYPE_CONFIG) as [EventType, typeof EVENT_TYPE_CONFIG[EventType]][]).map(([type, config]) => {
          const Icon = config.icon;
          const selected = eventType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                setEventType(type);
                const defaultDays = config.defaultDays;
                updateNumberOfDays(defaultDays);
              }}
              className={`p-4 rounded-md border-2 text-left transition-colors ${
                selected 
                  ? "border-primary bg-primary/5" 
                  : "border-muted hover-elevate"
              }`}
              data-testid={`button-event-type-${type}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-5 h-5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                <span className="font-semibold">{EVENT_TYPE_LABELS[type]}</span>
              </div>
              <p className="text-sm text-muted-foreground">{config.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-6">
      {renderEventTypeSelection()}

      <div className="grid gap-4">
        <div>
          <Label htmlFor="eventName">Event Name</Label>
          <Input
            id="eventName"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder={eventType === EVENT_TYPES.RYDER_CUP ? "e.g., 2026 Ryder Cup" : eventType === EVENT_TYPES.BUDDY_TRIP ? "e.g., Myrtle Beach Trip 2026" : "e.g., Spring Championship"}
            data-testid="input-event-name"
          />
        </div>
        {myGroups.length > 0 && (
          <div>
            <Label htmlFor="group">Group</Label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <select
                value={selectedGroupId ?? ""}
                onChange={(e) => setSelectedGroupId(e.target.value ? parseInt(e.target.value) : undefined)}
                className="input-field pl-10 appearance-none cursor-pointer w-full"
                data-testid="select-group"
              >
                <option value="">No group</option>
                {myGroups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <Label>Number of Days</Label>
          <Select
            value={numberOfDays.toString()}
            onValueChange={(val) => updateNumberOfDays(parseInt(val))}
          >
            <SelectTrigger data-testid="select-num-days">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <SelectItem key={n} value={n.toString()}>{n} {n === 1 ? "day" : "days"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {Array.from({ length: numberOfDays }, (_, i) => i + 1).map((dayNum) => (
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
          {dayConfigs.slice(0, numberOfDays).map((dc, idx) => (
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
        <p className="text-sm text-muted-foreground">
          Payout settings can be configured after event creation in the Payouts tab.
        </p>
      </div>
    </div>
  );

  const renderTeamStep = () => (
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

  const renderReviewStep = () => (
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
              <Label className="text-muted-foreground">Type</Label>
              <p className="font-semibold">{EVENT_TYPE_LABELS[eventType]}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Course{useDifferentCourses ? "s" : ""}</Label>
              {useDifferentCourses ? (
                <div className="space-y-1">
                  {dayConfigs.slice(0, numberOfDays).map((dc) => (
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
              <Label className="text-muted-foreground">Duration</Label>
              <p className="font-semibold">{numberOfDays} {numberOfDays === 1 ? "day" : "days"}</p>
            </div>
          </div>

          {isTeamEvent && (
            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Teams</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-3 rounded-md" style={{ backgroundColor: `${teamAColor}10` }}>
                  <h5 className="font-semibold mb-2" style={{ color: teamAColor }}>{teamAName}</h5>
                  <ul className="text-sm space-y-1">
                    {teamAMembers.map(name => <li key={name}>{name}</li>)}
                  </ul>
                </div>
                <div className="p-3 rounded-md" style={{ backgroundColor: `${teamBColor}10` }}>
                  <h5 className="font-semibold mb-2" style={{ color: teamBColor }}>{teamBName}</h5>
                  <ul className="text-sm space-y-1">
                    {teamBMembers.map(name => <li key={name}>{name}</li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Payouts can be configured after event creation in the Payouts tab.
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-md">
            <p className="text-sm text-muted-foreground">
              {isTeamEvent
                ? `After creation, a ${numberOfDays}-day schedule will be automatically generated with 3 matches per day. Each player will partner with teammates across the event. First team to ${(65 / 10).toFixed(1)} points wins!`
                : `Your ${numberOfDays}-day event will be created. You can add side matches, skins, and track scores for each day.`
              }
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const isOnReviewStep = step === totalSteps;
  const isOnTeamStep = isTeamEvent && step === 2;

  const canProceed = () => {
    if (step === 1) return canProceedStep1;
    if (isOnTeamStep) return canProceedStep2Team;
    return true;
  };

  const stepTitle = () => {
    if (step === 1) return "Event Details";
    if (isOnTeamStep) return "Select Teams";
    return "Confirm & Create";
  };

  const stepDescription = () => {
    if (step === 1) return "Choose your event type and set up the basics";
    if (isOnTeamStep) return "Pick 6 players for each team";
    return "Review and create your event";
  };

  const EventIcon = EVENT_TYPE_CONFIG[eventType].icon;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/ryder-cup")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <EventIcon className="w-6 h-6 text-primary" />
            Create {EVENT_TYPE_LABELS[eventType]} Event
          </h1>
          <p className="text-muted-foreground">Step {step} of {totalSteps}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
          <div
            key={s}
            className={`flex-1 h-2 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{stepTitle()}</CardTitle>
          <CardDescription>{stepDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && renderStep1()}
          {isOnTeamStep && renderTeamStep()}
          {isOnReviewStep && renderReviewStep()}
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
        {!isOnReviewStep ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
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
