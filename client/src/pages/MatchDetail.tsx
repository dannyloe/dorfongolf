import { useMatch, useAddPlayer, useSubmitScore, useDeleteMatch } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Calendar, UserPlus, Trophy, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Player {
  id: number;
  matchId: number;
  userId: string | null;
  name: string;
}

interface Score {
  id: number;
  matchId: number;
  playerId: number;
  holeNumber: number;
  strokes: number;
}

export default function MatchDetail() {
  const [, params] = useRoute("/match/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id || "0");
  const { data: match, isLoading, error } = useMatch(matchId);
  const { user } = useAuth();
  const addPlayer = useAddPlayer(matchId);
  const submitScore = useSubmitScore(matchId);
  const deleteMatch = useDeleteMatch();
  
  const [newPlayerName, setNewPlayerName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ playerId: number; hole: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Focus input when editing cell changes
  useEffect(() => {
    if (editingCell) {
      const key = `${editingCell.playerId}-${editingCell.hole}`;
      const input = inputRefs.current[key];
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [editingCell]);

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading event details...</div>;
  if (error || !match) return <div className="p-12 text-center text-destructive">Event not found</div>;

  const players: Player[] = match.players || [];
  const scores: Score[] = match.scores || [];
  const isCreator = user?.id === match.creatorId;
  const isPlayer = players.some((p: Player) => p.userId === user?.id);
  const currentPlayer = players.find((p: Player) => p.userId === user?.id);

  const getPlayerScore = (playerId: number) => {
    return scores.filter((s: Score) => s.playerId === playerId).reduce((acc, curr) => acc + curr.strokes, 0) || 0;
  };

  const getScore = (playerId: number, hole: number): number | null => {
    const score = scores.find((s: Score) => s.playerId === playerId && s.holeNumber === hole);
    return score ? score.strokes : null;
  };

  const handleJoinMatch = () => {
    if (!user) return;
    const name = user.firstName 
      ? `${user.firstName} ${user.lastName || ''}`.trim() 
      : user.email || "Player";
    addPlayer.mutate({ name, userId: user.id });
  };

  const handleAddGuest = () => {
    if (!newPlayerName.trim()) return;
    addPlayer.mutate({ name: newPlayerName.trim() });
    setNewPlayerName("");
  };

  const handleCellClick = (playerId: number, hole: number) => {
    const currentScore = getScore(playerId, hole);
    setEditingCell({ playerId, hole });
    setEditValue(currentScore !== null ? String(currentScore) : "");
  };

  const handleScoreSubmit = (playerId: number, hole: number) => {
    const strokes = parseInt(editValue);
    if (!isNaN(strokes) && strokes >= 1 && strokes <= 20) {
      submitScore.mutate({ playerId, holeNumber: hole, strokes });
    }
    
    // Move to next hole
    if (hole < 18) {
      setEditingCell({ playerId, hole: hole + 1 });
      setEditValue(getScore(playerId, hole + 1)?.toString() || "");
    } else {
      setEditingCell(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, playerId: number, hole: number) => {
    if (e.key === "Enter") {
      handleScoreSubmit(playerId, hole);
    } else if (e.key === "Escape") {
      setEditingCell(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleScoreSubmit(playerId, hole);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="bg-white rounded-3xl p-8 shadow-xl shadow-black/5 border border-border/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-semibold tracking-wide uppercase text-xs">
              <Calendar className="w-4 h-4" />
              {match.createdAt && format(new Date(match.createdAt), "MMMM d, yyyy")}
            </div>
            <h1 className="text-4xl font-display font-bold text-foreground">{match.name}</h1>
            <div className="flex items-center gap-2 text-muted-foreground text-lg">
              <MapPin className="w-5 h-5 text-accent" />
              {match.courseName}
            </div>
          </div>

          <div className="flex gap-3">
            {!isPlayer && (
              <Button
                onClick={handleJoinMatch}
                disabled={addPlayer.isPending}
                className="btn-primary"
                data-testid="button-join-match"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {addPlayer.isPending ? "Joining..." : "Join Event"}
              </Button>
            )}
            {isCreator && (
              showDeleteConfirm ? (
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      deleteMatch.mutate(matchId, {
                        onSuccess: () => navigate("/")
                      });
                    }}
                    disabled={deleteMatch.isPending}
                    data-testid="button-confirm-delete-match"
                  >
                    {deleteMatch.isPending ? "Deleting..." : "Confirm Delete"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteConfirm(false)}
                    data-testid="button-cancel-delete-match"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid="button-delete-match"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Add Player Section (visible to creator) */}
      {isCreator && (
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
          <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Add Player
          </h3>
          <div className="flex gap-3">
            <Input
              placeholder="Enter player name..."
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddGuest()}
              className="flex-1"
              data-testid="input-player-name"
            />
            <Button 
              onClick={handleAddGuest} 
              disabled={!newPlayerName.trim() || addPlayer.isPending}
              data-testid="button-add-player"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </div>
      )}

      {/* Players List */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
        <h3 className="font-display font-bold text-lg mb-4 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent" />
          Players ({players.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {players.map((p: Player) => (
            <span 
              key={p.id} 
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                p.userId === user?.id 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {p.name} {p.userId === user?.id && "(You)"}
            </span>
          ))}
          {players.length === 0 && (
            <span className="text-muted-foreground">No players yet</span>
          )}
        </div>
      </div>

      {/* Scorecard Table */}
      <div className="glass-card rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary/5 text-primary">
              <th className="p-4 text-left font-bold w-48 sticky left-0 bg-white/95 backdrop-blur shadow-sm z-10">Player</th>
              {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                <th key={hole} className="p-3 text-center w-12 font-semibold text-muted-foreground">{hole}</th>
              ))}
              <th className="p-4 text-center font-bold text-foreground bg-primary/10">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {players.map((p: Player) => {
              const isCurrentUser = p.userId === user?.id;
              const canEdit = isCreator || isCurrentUser;
              
              return (
                <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${isCurrentUser ? "bg-accent/5" : ""}`}>
                  <td className={`p-4 font-semibold sticky left-0 bg-white/95 backdrop-blur z-10 ${isCurrentUser ? "text-primary" : "text-foreground"}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isCurrentUser ? "bg-accent" : "bg-muted"}`} />
                      {p.name} {isCurrentUser && "(You)"}
                    </div>
                  </td>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
                    const score = getScore(p.id, hole);
                    const isEditing = editingCell?.playerId === p.id && editingCell?.hole === hole;
                    const cellKey = `${p.id}-${hole}`;
                    
                    return (
                      <td 
                        key={hole} 
                        className="p-1 text-center border-l border-border/30"
                        onClick={() => canEdit && handleCellClick(p.id, hole)}
                      >
                        {isEditing ? (
                          <input
                            ref={(el) => { inputRefs.current[cellKey] = el; }}
                            type="number"
                            min="1"
                            max="20"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleScoreSubmit(p.id, hole)}
                            onKeyDown={(e) => handleKeyDown(e, p.id, hole)}
                            className="w-10 h-8 text-center border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                            data-testid={`input-score-${p.id}-${hole}`}
                          />
                        ) : (
                          <span 
                            className={`
                              font-mono font-medium inline-block w-10 h-8 leading-8 rounded
                              ${canEdit ? "cursor-pointer hover:bg-primary/10" : ""}
                              ${isCurrentUser ? "text-foreground" : "text-muted-foreground"}
                            `}
                            data-testid={`score-cell-${p.id}-${hole}`}
                          >
                            {score !== null ? score : "-"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-4 text-center font-bold text-lg bg-primary/5 text-primary">
                    {getPlayerScore(p.id) || "-"}
                  </td>
                </tr>
              );
            })}
            
            {players.length === 0 && (
              <tr>
                <td colSpan={20} className="p-12 text-center text-muted-foreground">
                  No players yet. {!isPlayer && "Join the match to start tracking scores!"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
