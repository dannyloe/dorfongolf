import { useState, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Users, Search, Hash, Link2, Shield, ShieldCheck, ChevronDown, ChevronUp, Plus, Trash2, MapPin, UserPlus, KeyRound, Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCourses } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@shared/models/auth";

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

function EditableNameCell({ 
  player, 
  onSave,
  isExpanded,
  onToggleExpand,
  courseDefaultsCount,
}: { 
  player: PlayerData;
  onSave: (newName: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  courseDefaultsCount: number;
}) {
  const [value, setValue] = useState(player.name);
  const [isEditing, setIsEditing] = useState(false);

  const handleBlur = () => {
    setIsEditing(false);
    const newName = value.trim();
    if (newName.length > 0 && newName !== player.name) {
      onSave(newName);
    } else {
      setValue(player.name);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setValue(player.name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[200px]"
        autoFocus
        data-testid={`input-name-${player.name}`}
      />
    );
  }

  return (
    <div 
      className="flex items-center gap-2 cursor-pointer"
      onClick={onToggleExpand}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      data-testid={`cell-name-${player.name}`}
    >
      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      <span className="hover:bg-muted/50 rounded px-1 py-0.5">{player.name}</span>
      {courseDefaultsCount > 0 && (
        <Badge variant="outline" className="text-xs">
          <MapPin className="h-3 w-3 mr-1" />
          {courseDefaultsCount}
        </Badge>
      )}
    </div>
  );
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
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [addingCourseForPlayer, setAddingCourseForPlayer] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedTeeId, setSelectedTeeId] = useState<string>("");
  const [showAddPlayerDialog, setShowAddPlayerDialog] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

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

  const { data: allSystemUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!(currentUser?.isAdmin),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password, username }: { userId: string; password: string; username?: string }) => {
      return apiRequest("PATCH", `/api/admin/users/${userId}/password`, { password, username });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setResetPasswordUserId(null);
      setResetPasswordUser(null);
      setNewPassword("");
      setNewUsername("");
      toast({ title: "Password updated" });
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

  const renameMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) => {
      return apiRequest("PUT", `/api/preset-players/${encodeURIComponent(oldName)}/rename`, { newName });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player-course-defaults"] });
      // Update expanded player if it was the one renamed
      if (expandedPlayer === variables.oldName) {
        setExpandedPlayer(variables.newName);
      }
      toast({ title: "Player renamed", description: `"${variables.oldName}" is now "${variables.newName}"` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleRenamePlayer = (oldName: string, newName: string) => {
    renameMutation.mutate({ oldName, newName });
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
                      <TableHead className="w-[60px]">
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Roster
                        </div>
                      </TableHead>
                      <TableHead className="w-[140px]">Player</TableHead>
                      <TableHead className="w-[100px]">
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3" />
                          Handicap
                        </div>
                      </TableHead>
                      <TableHead>Aliases</TableHead>
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
                        <Fragment key={player.name}>
                          <TableRow data-testid={`row-player-${player.name}`}>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Switch
                                checked={player.showInRoster}
                                onCheckedChange={(checked) => handleUpdateShowInRoster(player.name, checked)}
                                disabled={showInRosterMutation.isPending}
                                data-testid={`switch-roster-${player.name}`}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <EditableNameCell
                                player={player}
                                onSave={(newName) => handleRenamePlayer(player.name, newName)}
                                isExpanded={isExpanded}
                                onToggleExpand={() => setExpandedPlayer(isExpanded ? null : player.name)}
                                courseDefaultsCount={courseDefaults.length}
                              />
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
                        </Fragment>
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

      {/* Admin: User Accounts Management */}
      {currentUser?.isAdmin && (
        <Card className="mt-6">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              <CardTitle>User Accounts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {!allSystemUsers ? (
              <div className="text-center py-6 text-muted-foreground">Loading users…</div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Username</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="w-[80px]">Admin</TableHead>
                      <TableHead className="w-[120px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allSystemUsers.map(u => (
                      <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                        <TableCell className="font-mono text-sm">{u.username ?? <span className="text-muted-foreground italic">not set</span>}</TableCell>
                        <TableCell>
                          {u.presetPlayerName || [u.firstName, u.lastName].filter(Boolean).join(" ") || <span className="text-muted-foreground italic">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{u.email ?? "—"}</TableCell>
                        <TableCell>
                          {u.isAdmin ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : null}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            data-testid={`button-reset-password-${u.id}`}
                            onClick={() => {
                              setResetPasswordUserId(u.id);
                              setResetPasswordUser(u);
                              setNewUsername(u.username ?? "");
                              setNewPassword("");
                            }}
                          >
                            <KeyRound className="h-3 w-3 mr-1" />
                            Reset
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {allSystemUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No users found</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reset Password Dialog */}
      <Dialog open={!!resetPasswordUserId} onOpenChange={(open) => { if (!open) { setResetPasswordUserId(null); setResetPasswordUser(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Credentials</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Updating credentials for: <span className="font-medium text-foreground">{resetPasswordUser?.presetPlayerName || resetPasswordUser?.username || resetPasswordUser?.id}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reset-username">Username</Label>
              <Input
                id="reset-username"
                data-testid="input-reset-username"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                placeholder="username"
                autoCapitalize="none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-password">New Password</Label>
              <div className="relative">
                <Input
                  id="reset-password"
                  data-testid="input-reset-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowNewPassword(v => !v)}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResetPasswordUserId(null); setResetPasswordUser(null); }}>
              Cancel
            </Button>
            <Button
              data-testid="button-confirm-reset-password"
              disabled={!newPassword || newPassword.length < 6 || resetPasswordMutation.isPending}
              onClick={() => {
                if (!resetPasswordUserId) return;
                resetPasswordMutation.mutate({ userId: resetPasswordUserId, password: newPassword, username: newUsername || undefined });
              }}
            >
              {resetPasswordMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
