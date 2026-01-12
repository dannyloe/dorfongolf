import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, Hash, Flag, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PlayerData {
  name: string;
  handicapIndex: number | null;
  defaultTeeId: number | null;
  defaultTeeName: string | null;
  aliases: string[];
  claimedByUserId: string | null;
  claimedByName: string | null;
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

function EditableTeeCell({ 
  player, 
  tees,
  onSave 
}: { 
  player: PlayerData;
  tees: AvailableTee[];
  onSave: (defaultTeeId: number | null) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const currentValue = player.defaultTeeId?.toString() || "none";

  const handleChange = (newValue: string) => {
    const teeId = newValue === "none" ? null : parseInt(newValue);
    if (teeId !== player.defaultTeeId) {
      onSave(teeId);
    }
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div 
        className="cursor-pointer hover:bg-muted/50 rounded px-2 py-1 min-w-[120px]"
        onClick={() => setIsEditing(true)}
        data-testid={`cell-tee-${player.name}`}
      >
        {player.defaultTeeName || <span className="text-muted-foreground">-</span>}
      </div>
    );
  }

  return (
    <Select value={currentValue} onValueChange={handleChange} open={true} onOpenChange={(open) => !open && setIsEditing(false)}>
      <SelectTrigger 
        className="w-[200px] h-8"
        data-testid={`select-tee-${player.name}`}
      >
        <SelectValue placeholder="Select tee" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">No default</SelectItem>
        {tees.map((tee) => (
          <SelectItem key={tee.id} value={tee.id.toString()}>
            {tee.courseName} - {tee.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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

  const { data, isLoading: isLoadingPlayers } = useQuery<PlayerDataResponse>({
    queryKey: ["/api/preset-players/full"],
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

  const handleUpdateTee = (playerName: string, defaultTeeId: number | null) => {
    updateMutation.mutate({ playerName, data: { defaultTeeId } });
  };

  const handleUpdateAliases = (playerName: string, aliases: string[]) => {
    toast({ 
      title: "Note", 
      description: "Alias editing requires code changes. Contact developer to update aliases." 
    });
  };

  const filteredPlayers = players.filter(player => {
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.aliases.some(a => a.toLowerCase().includes(query)) ||
      (player.claimedByName?.toLowerCase().includes(query))
    );
  });

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
                      <TableHead className="w-[220px]">
                        <div className="flex items-center gap-1">
                          <Flag className="h-3 w-3" />
                          Default Tee
                        </div>
                      </TableHead>
                      <TableHead>Aliases</TableHead>
                      <TableHead className="w-[150px]">
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Linked User
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlayers.map((player) => (
                      <TableRow key={player.name} data-testid={`row-player-${player.name}`}>
                        <TableCell className="font-medium">{player.name}</TableCell>
                        <TableCell>
                          <EditableHandicapCell 
                            player={player} 
                            onSave={(val) => handleUpdateHandicap(player.name, val)}
                          />
                        </TableCell>
                        <TableCell>
                          <EditableTeeCell 
                            player={player} 
                            tees={allTees}
                            onSave={(val) => handleUpdateTee(player.name, val)}
                          />
                        </TableCell>
                        <TableCell>
                          <EditableAliasesCell 
                            player={player}
                            onSave={(val) => handleUpdateAliases(player.name, val)}
                          />
                        </TableCell>
                        <TableCell>
                          <EditableLinkedUserCell player={player} />
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredPlayers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
    </div>
  );
}
