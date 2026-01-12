import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Users, Search, Hash, Link2, Shield, ShieldCheck, ChevronDown, ChevronUp, Plus, Trash2, MapPin, UserPlus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCourses } from "@/hooks/use-matches";

interface PlayerData {
  name: string;
  handicapIndex: number | null;
  defaultTeeId: number | null;
  defaultTeeName: string | null;
  aliases: string[];
  claimedByUserId: string | null;
  claimedByName: string | null;
  isAdmin: boolean | null;
  showInRoster: boolean;
}

interface AvailableTee {
  id: number;
  courseId: number;
  name: string;
  color: string | null;
  slopeRating: number | null;
  courseRating: number | null;
  courseName: string;
}

interface PlayerDataResponse {
  players: PlayerData[];
  availableTees: AvailableTee[];
}

interface PlayerCourseDefault {
  id: number;
  presetPlayerName: string;
  courseId: number;
  teeId: number;
  updatedAt: string | null;
}

interface Course {
  id: number;
  name: string;
}

function EditableHandicapCell({ 
  player, 
  onSave 
}: { 
  player: PlayerData;
  onSave: (handicapIndex: number | null) => void;
}) {
  const [value, setValue] = useState(
    player.handicapIndex !== null ? (player.handicapIndex / 10).toString() : ""
  );
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    const parsed = value.trim() === "" ? null : parseFloat(value);
    if (parsed !== null && (isNaN(parsed) || parsed < -10 || parsed > 54)) {
      setValue(player.handicapIndex !== null ? (player.handicapIndex / 10).toString() : "");
      return;
    }
    const newValue = parsed !== null ? Math.round(parsed * 10) : null;
    if (newValue !== player.handicapIndex) {
      onSave(newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setValue(player.handicapIndex !== null ? (player.handicapIndex / 10).toString() : "");
      setIsEditing(false);
    }
  };

  const formatDisplay = (val: number | null) => {
    if (val === null) return "-";
    const hcp = val / 10;
    return hcp >= 0 ? hcp.toFixed(1) : `+${Math.abs(hcp).toFixed(1)}`;
  };

  if (!isEditing) {
    return (
      <div 
        className="cursor-pointer hover:bg-muted/50 rounded px-2 py-1 min-w-[60px] text-center"
        onClick={() => setIsEditing(true)}
        data-testid={`cell-handicap-${player.name}`}
      >
        {formatDisplay(player.handicapIndex)}
      </div>
    );
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-20 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      autoFocus
      data-testid={`input-handicap-${player.name}`}
    />
  );
}

function EditableAliasesCell({ 
  player,
  onSave 
}: { 
  player: PlayerData;
  onSave: (aliases: string[]) => void;
}) {
  const [value, setValue] = useState(player.aliases.join(", "));
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    const newAliases = value.split(",").map(a => a.trim()).filter(a => a.length > 0);
    const currentAliases = player.aliases;
    if (JSON.stringify(newAliases) !== JSON.stringify(currentAliases)) {
      onSave(newAliases);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setValue(player.aliases.join(", "));
      setIsEditing(false);
    }
  };

  if (!isEditing) {
    return (
      <div 
        className="cursor-pointer hover:bg-muted/50 rounded px-2 py-1 min-h-[28px]"
        onClick={() => setIsEditing(true)}
        data-testid={`cell-aliases-${player.name}`}
      >
        <div className="flex flex-wrap gap-1">
          {player.aliases.length > 0 ? (
            player.aliases.map((alias) => (
              <Badge key={alias} variant="outline" className="text-xs">
                {alias}
              </Badge>
            ))
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Enter aliases..."
        className="w-full"
        autoFocus
        data-testid={`input-aliases-${player.name}`}
      />
      <p className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
        Separate aliases with commas
      </p>
    </div>
  );
}

function EditableLinkedUserCell({ 
  player 
}: { 
  player: PlayerData;
}) {
  return (
    <div className="text-sm">
      {player.claimedByName || (
        <span className="text-muted-foreground">-</span>
      )}
    </div>
  );
}

export default function PlayerMaintenance() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [addingCourseForPlayer, setAddingCourseForPlayer] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedTeeId, setSelectedTeeId] = useState<string>("");
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");

  const { data, isLoading: isLoadingPlayers } = useQuery<PlayerDataResponse>({
    queryKey: ["/api/preset-players/full"],
  });

  const { data: courses } = useCourses();

  const { data: allCourseDefaults } = useQuery<PlayerCourseDefault[]>({
    queryKey: ["/api/player-course-defaults"],
  });

  const players = data?.players || [];
  const allTees = data?.availableTees || [];

  const updateMutation = useMutation({
    mutationFn: async ({ playerName, data }: { playerName: string; data: { handicapIndex?: number | null; defaultTeeId?: number | null } }) => {
      return apiRequest("PUT", `/api/preset-players/${encodeURIComponent(playerName)}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleUpdateHandicap = (playerName: string, handicapIndex: number | null) => {
    updateMutation.mutate({ playerName, data: { handicapIndex } });
  };

  const updateAliasesMutation = useMutation({
    mutationFn: async ({ playerName, aliases }: { playerName: string; aliases: string[] }) => {
      return apiRequest("PUT", `/api/preset-players/${encodeURIComponent(playerName)}/aliases`, { aliases });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
      toast({ title: "Aliases updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleUpdateAliases = (playerName: string, aliases: string[]) => {
    updateAliasesMutation.mutate({ playerName, aliases });
  };

  const showInRosterMutation = useMutation({
    mutationFn: async ({ playerName, showInRoster }: { playerName: string; showInRoster: boolean }) => {
      return apiRequest("PUT", `/api/preset-players/${encodeURIComponent(playerName)}/show-in-roster`, { showInRoster });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
      toast({ title: "Roster visibility updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleUpdateShowInRoster = (playerName: string, showInRoster: boolean) => {
    showInRosterMutation.mutate({ playerName, showInRoster });
  };

  const adminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      return apiRequest("PUT", `/api/users/${userId}/admin`, { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
      toast({ title: "Admin status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleToggleAdmin = (userId: string, isAdmin: boolean) => {
    adminMutation.mutate({ userId, isAdmin });
  };

  const upsertCourseDefaultMutation = useMutation({
    mutationFn: async ({ playerName, courseId, teeId }: { playerName: string; courseId: number; teeId: number }) => {
      return apiRequest("PUT", `/api/player-course-defaults/${encodeURIComponent(playerName)}/${courseId}`, { teeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-course-defaults"] });
      setAddingCourseForPlayer(null);
      setSelectedCourseId("");
      setSelectedTeeId("");
      toast({ title: "Course default saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteCourseDefaultMutation = useMutation({
    mutationFn: async ({ playerName, courseId }: { playerName: string; courseId: number }) => {
      return apiRequest("DELETE", `/api/player-course-defaults/${encodeURIComponent(playerName)}/${courseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-course-defaults"] });
      toast({ title: "Course default removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getPlayerCourseDefaults = (playerName: string) => {
    return (allCourseDefaults || []).filter(d => d.presetPlayerName === playerName);
  };

  const createPlayerMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/preset-players", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
      setShowAddPlayerDialog(false);
      setNewPlayerName("");
      toast({ title: "Player added to roster" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAddPlayer = () => {
    const trimmedName = newPlayerName.trim();
    if (trimmedName.length === 0) return;
    createPlayerMutation.mutate(trimmedName);
  };

  const getTeesForCourse = (courseId: number) => {
    return allTees.filter(t => t.courseId === courseId);
  };

  const getTeeInfo = (teeId: number) => {
    return allTees.find(t => t.id === teeId);
  };

  const getCourseInfo = (courseId: number) => {
    return courses?.find(c => c.id === courseId);
  };

  const filteredPlayers = players.filter(player => {
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.aliases.some(a => a.toLowerCase().includes(query)) ||
      (player.claimedByName?.toLowerCase().includes(query))
    );
  }).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6" />
            <CardTitle>Player Maintenance</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search players, aliases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                  data-testid="input-search-players"
                />
              </div>
              <Badge variant="secondary">
                {filteredPlayers.length} players
              </Badge>
              <Button 
                size="sm" 
                onClick={() => setShowAddPlayerDialog(true)}
                data-testid="button-add-player"
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Add Player
              </Button>
            </div>

            {isLoadingPlayers ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading players...
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Player</TableHead>
                      <TableHead className="w-[100px]">
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          Handicap
                        </div>
                      </TableHead>
                      <TableHead>Aliases</TableHead>
                      <TableHead className="w-[100px]">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Show in Roster
                        </div>
                      </TableHead>
                      <TableHead className="w-[150px]">
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Linked User
                        </div>
                      </TableHead>
                      <TableHead className="w-[80px]">
                        <div className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Admin
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlayers.map((player) => {
                      const isExpanded = expandedPlayer === player.name;
                      const courseDefaults = getPlayerCourseDefaults(player.name);
                      const coursesWithDefaults = courseDefaults.map(d => d.courseId);
                      const availableCoursesToAdd = (courses || []).filter(c => !coursesWithDefaults.includes(c.id));
                      
                      return (
                        <>
                          <TableRow key={player.name} data-testid={`row-player-${player.name}`} className="cursor-pointer" onClick={() => setExpandedPlayer(isExpanded ? null : player.name)}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                {player.name}
                                {courseDefaults.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    <MapPin className="h-3 w-3 mr-1" />
                                    {courseDefaults.length}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <EditableHandicapCell 
                                player={player} 
                                onSave={(val) => handleUpdateHandicap(player.name, val)}
                              />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <EditableAliasesCell 
                                player={player}
                                onSave={(val) => handleUpdateAliases(player.name, val)}
                              />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={player.showInRoster}
                                onCheckedChange={(checked) => handleUpdateShowInRoster(player.name, checked)}
                                disabled={showInRosterMutation.isPending}
                                data-testid={`switch-roster-${player.name}`}
                              />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <EditableLinkedUserCell player={player} />
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {player.claimedByUserId ? (
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={player.isAdmin ?? false}
                                    onCheckedChange={(checked) => handleToggleAdmin(player.claimedByUserId!, checked)}
                                    disabled={adminMutation.isPending}
                                    data-testid={`switch-admin-${player.name}`}
                                  />
                                  {player.isAdmin && (
                                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${player.name}-expanded`}>
                              <TableCell colSpan={6} className="bg-muted/30 p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                      <MapPin className="h-4 w-4" />
                                      Course-Specific Tees
                                    </h4>
                                    {addingCourseForPlayer !== player.name && availableCoursesToAdd.length > 0 && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setAddingCourseForPlayer(player.name);
                                          setSelectedCourseId("");
                                          setSelectedTeeId("");
                                        }}
                                        data-testid={`button-add-course-${player.name}`}
                                      >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add Course
                                      </Button>
                                    )}
                                  </div>
                                  
                                  {courseDefaults.length === 0 && addingCourseForPlayer !== player.name && (
                                    <p className="text-sm text-muted-foreground">
                                      No course-specific tees configured. Click "Add Course" to set a preferred tee for each course.
                                    </p>
                                  )}
                                  
                                  {courseDefaults.length > 0 && (
                                    <div className="space-y-2">
                                      {courseDefaults.map((cd) => {
                                        const course = getCourseInfo(cd.courseId);
                                        const tee = getTeeInfo(cd.teeId);
                                        const teesForCourse = getTeesForCourse(cd.courseId);
                                        return (
                                          <div key={cd.id} className="flex items-center justify-between bg-background rounded-md p-2 border">
                                            <div className="flex items-center gap-3">
                                              <span className="font-medium text-sm">{course?.name || "Unknown"}</span>
                                              <Select
                                                value={cd.teeId.toString()}
                                                onValueChange={(newTeeId) => {
                                                  upsertCourseDefaultMutation.mutate({
                                                    playerName: player.name,
                                                    courseId: cd.courseId,
                                                    teeId: parseInt(newTeeId),
                                                  });
                                                }}
                                              >
                                                <SelectTrigger className="w-[140px] h-8" data-testid={`select-course-tee-${player.name}-${cd.courseId}`}>
                                                  <SelectValue>{tee?.name || "Select tee"}</SelectValue>
                                                </SelectTrigger>
                                                <SelectContent>
                                                  {teesForCourse.map((t) => (
                                                    <SelectItem key={t.id} value={t.id.toString()}>
                                                      {t.name}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              onClick={() => deleteCourseDefaultMutation.mutate({
                                                playerName: player.name,
                                                courseId: cd.courseId,
                                              })}
                                              data-testid={`button-delete-course-${player.name}-${cd.courseId}`}
                                            >
                                              <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  
                                  {addingCourseForPlayer === player.name && (
                                    <div className="flex items-center gap-2 bg-background rounded-md p-2 border">
                                      <Select value={selectedCourseId} onValueChange={(val) => {
                                        setSelectedCourseId(val);
                                        setSelectedTeeId("");
                                      }}>
                                        <SelectTrigger className="w-[180px]" data-testid={`select-new-course-${player.name}`}>
                                          <SelectValue placeholder="Select course" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableCoursesToAdd.map((c) => (
                                            <SelectItem key={c.id} value={c.id.toString()}>
                                              {c.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {selectedCourseId && (
                                        <Select value={selectedTeeId} onValueChange={setSelectedTeeId}>
                                          <SelectTrigger className="w-[140px]" data-testid={`select-new-tee-${player.name}`}>
                                            <SelectValue placeholder="Select tee" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {getTeesForCourse(parseInt(selectedCourseId)).map((t) => (
                                              <SelectItem key={t.id} value={t.id.toString()}>
                                                {t.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}
                                      <Button
                                        size="sm"
                                        disabled={!selectedCourseId || !selectedTeeId || upsertCourseDefaultMutation.isPending}
                                        onClick={() => {
                                          upsertCourseDefaultMutation.mutate({
                                            playerName: player.name,
                                            courseId: parseInt(selectedCourseId),
                                            teeId: parseInt(selectedTeeId),
                                          });
                                        }}
                                        data-testid={`button-save-course-${player.name}`}
                                      >
                                        Save
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setAddingCourseForPlayer(null);
                                          setSelectedCourseId("");
                                          setSelectedTeeId("");
                                        }}
                                        data-testid={`button-cancel-course-${player.name}`}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                    {filteredPlayers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No players found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showAddPlayerDialog} onOpenChange={setShowAddPlayerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Player to Roster</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              placeholder="Enter player name..."
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPlayerName.trim()) {
                  handleAddPlayer();
                }
              }}
              data-testid="input-new-player-name"
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowAddPlayerDialog(false);
                setNewPlayerName("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddPlayer}
              disabled={!newPlayerName.trim() || createPlayerMutation.isPending}
              data-testid="button-confirm-add-player"
            >
              {createPlayerMutation.isPending ? "Adding..." : "Add Player"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
