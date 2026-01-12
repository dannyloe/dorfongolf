import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Save, User, Users, Search, Pencil, Hash, Flag, Link2 } from "lucide-react";
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

function EditPlayerDialog({ 
  player, 
  tees,
  open, 
  onClose 
}: { 
  player: PlayerData | null; 
  tees: AvailableTee[];
  open: boolean; 
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [handicapIndex, setHandicapIndex] = useState("");
  const [defaultTeeId, setDefaultTeeId] = useState<string>("none");
  
  const updateMutation = useMutation({
    mutationFn: async (data: { handicapIndex: number | null; defaultTeeId: number | null }) => {
      return apiRequest("PUT", `/api/preset-players/${encodeURIComponent(player!.name)}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-players/full"] });
      toast({ title: "Player updated", description: `${player?.name} settings saved successfully` });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleOpen = () => {
    if (player) {
      setHandicapIndex(player.handicapIndex !== null ? (player.handicapIndex / 10).toString() : "");
      setDefaultTeeId(player.defaultTeeId?.toString() || "none");
    }
  };

  const handleSave = () => {
    const parsedHandicap = handicapIndex.trim() === "" ? null : parseFloat(handicapIndex);
    if (parsedHandicap !== null && (isNaN(parsedHandicap) || parsedHandicap < -10 || parsedHandicap > 54)) {
      toast({ title: "Invalid handicap", description: "Please enter a valid handicap index (e.g., 12.4)", variant: "destructive" });
      return;
    }
    
    updateMutation.mutate({
      handicapIndex: parsedHandicap !== null ? Math.round(parsedHandicap * 10) : null,
      defaultTeeId: defaultTeeId === "none" ? null : parseInt(defaultTeeId),
    });
  };

  if (!player) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (isOpen) handleOpen(); else onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Edit {player.name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="handicap">Handicap Index</Label>
            <Input
              id="handicap"
              type="number"
              step="0.1"
              placeholder="e.g., 12.4"
              value={handicapIndex}
              onChange={(e) => setHandicapIndex(e.target.value)}
              data-testid="input-handicap"
            />
            <p className="text-xs text-muted-foreground">
              Enter the player&apos;s USGA Handicap Index (e.g., 12.4)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="defaultTee">Default Tee</Label>
            <Select value={defaultTeeId} onValueChange={setDefaultTeeId}>
              <SelectTrigger data-testid="select-default-tee">
                <SelectValue placeholder="Select default tee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default</SelectItem>
                {tees.map((tee) => (
                  <SelectItem key={tee.id} value={tee.id.toString()}>
                    {tee.courseName} - {tee.name} {tee.slopeRating ? `(${tee.slopeRating / 10}/${(tee.courseRating || 0) / 10})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Default tee used for net scoring calculations
            </p>
          </div>
          
          {player.aliases.length > 0 && (
            <div className="space-y-2">
              <Label>Known Aliases</Label>
              <div className="flex flex-wrap gap-1">
                {player.aliases.map((alias) => (
                  <Badge key={alias} variant="secondary">
                    {alias}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {player.claimedByName && (
            <div className="space-y-2">
              <Label>Linked User</Label>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{player.claimedByName}</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-edit">
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={updateMutation.isPending}
            data-testid="button-save-player"
          >
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PlayerMaintenance() {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPlayer, setEditingPlayer] = useState<PlayerData | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const { data, isLoading: isLoadingPlayers } = useQuery<PlayerDataResponse>({
    queryKey: ["/api/preset-players/full"],
  });

  const players = data?.players || [];
  const allTees = data?.availableTees || [];

  const filteredPlayers = players.filter(player => {
    const query = searchQuery.toLowerCase();
    return (
      player.name.toLowerCase().includes(query) ||
      player.aliases.some(a => a.toLowerCase().includes(query)) ||
      (player.claimedByName?.toLowerCase().includes(query))
    );
  });

  const handleEditPlayer = (player: PlayerData) => {
    setEditingPlayer(player);
    setShowEditDialog(true);
  };

  const formatHandicap = (value: number | null) => {
    if (value === null) return "-";
    const hcp = value / 10;
    return hcp >= 0 ? hcp.toFixed(1) : `+${Math.abs(hcp).toFixed(1)}`;
  };

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
                      <TableHead className="w-[180px]">Player</TableHead>
                      <TableHead className="w-[100px] text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Hash className="h-3 w-3" />
                          Handicap
                        </div>
                      </TableHead>
                      <TableHead className="w-[150px]">
                        <div className="flex items-center gap-1">
                          <Flag className="h-3 w-3" />
                          Default Tee
                        </div>
                      </TableHead>
                      <TableHead>Aliases</TableHead>
                      <TableHead>
                        <div className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          Linked User
                        </div>
                      </TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPlayers.map((player) => (
                      <TableRow key={player.name} data-testid={`row-player-${player.name}`}>
                        <TableCell className="font-medium">{player.name}</TableCell>
                        <TableCell className="text-center">
                          {player.handicapIndex !== null ? (
                            <Badge variant="secondary">
                              {formatHandicap(player.handicapIndex)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {player.defaultTeeName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {player.aliases.length > 0 ? (
                              player.aliases.slice(0, 3).map((alias) => (
                                <Badge key={alias} variant="outline" className="text-xs">
                                  {alias}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground text-sm">-</span>
                            )}
                            {player.aliases.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{player.aliases.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {player.claimedByName || (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditPlayer(player)}
                            data-testid={`button-edit-${player.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
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

      <EditPlayerDialog
        player={editingPlayer}
        tees={allTees}
        open={showEditDialog}
        onClose={() => {
          setShowEditDialog(false);
          setEditingPlayer(null);
        }}
      />
    </div>
  );
}
