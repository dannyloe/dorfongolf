import { useMatch, useAddPlayer, useSubmitScore, useDeleteMatch, useCreateEventMatch, useDeleteEventMatch } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Calendar, UserPlus, Trophy, Plus, Trash2, Users, Swords, X, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateMatchPlayResults, getMatchStatus, calculateBetSettlements } from "@/lib/matchplay";

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

interface TeamMember {
  id: number;
  teamId: number;
  playerId: number;
  player?: Player;
}

interface Team {
  id: number;
  eventMatchId: number;
  name: string;
  members: TeamMember[];
}

interface EventMatch {
  id: number;
  eventId: number;
  name: string;
  matchType: string;
  unitAmount: number;
  teams: Team[];
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
  const createEventMatch = useCreateEventMatch(matchId);
  const deleteEventMatch = useDeleteEventMatch(matchId);
  
  const [newPlayerName, setNewPlayerName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ playerId: number; hole: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  // Event Match creation state
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [matchName, setMatchName] = useState("");
  const [unitAmount, setUnitAmount] = useState<number>(5);
  const [teamAPlayerIds, setTeamAPlayerIds] = useState<number[]>([]);
  const [teamBPlayerIds, setTeamBPlayerIds] = useState<number[]>([]);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);

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
  const eventMatches: EventMatch[] = match.eventMatches || [];
  const isCreator = user?.id === match.creatorId;
  const isPlayer = players.some((p: Player) => p.userId === user?.id);
  const currentPlayer = players.find((p: Player) => p.userId === user?.id);

  const getPlayerScore = (playerId: number) => {
    return scores.filter((s: Score) => s.playerId === playerId).reduce((acc, curr) => acc + curr.strokes, 0) || 0;
  };

  const getTeamNameFromPlayerIds = (playerIds: number[]) => {
    return playerIds
      .map(id => players.find(p => p.id === id)?.name || '')
      .filter(Boolean)
      .join('/');
  };

  const handleCreateEventMatch = () => {
    if (!matchName.trim() || teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) return;
    
    const autoTeamAName = getTeamNameFromPlayerIds(teamAPlayerIds);
    const autoTeamBName = getTeamNameFromPlayerIds(teamBPlayerIds);
    
    createEventMatch.mutate({
      name: matchName.trim(),
      matchType: "match_play",
      unitAmount: unitAmount * 100,
      teamA: { name: autoTeamAName, playerIds: teamAPlayerIds },
      teamB: { name: autoTeamBName, playerIds: teamBPlayerIds },
    }, {
      onSuccess: () => {
        setShowCreateMatch(false);
        setMatchName("");
        setUnitAmount(5);
        setTeamAPlayerIds([]);
        setTeamBPlayerIds([]);
      }
    });
  };

  const togglePlayerInTeam = (playerId: number, team: 'A' | 'B') => {
    if (team === 'A') {
      if (teamAPlayerIds.includes(playerId)) {
        setTeamAPlayerIds(teamAPlayerIds.filter(id => id !== playerId));
      } else {
        setTeamAPlayerIds([...teamAPlayerIds, playerId]);
        setTeamBPlayerIds(teamBPlayerIds.filter(id => id !== playerId));
      }
    } else {
      if (teamBPlayerIds.includes(playerId)) {
        setTeamBPlayerIds(teamBPlayerIds.filter(id => id !== playerId));
      } else {
        setTeamBPlayerIds([...teamBPlayerIds, playerId]);
        setTeamAPlayerIds(teamAPlayerIds.filter(id => id !== playerId));
      }
    }
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

      {/* Matches Section */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg flex items-center gap-2">
            <Swords className="w-5 h-5 text-primary" />
            Matches ({eventMatches.length})
          </h3>
          {isCreator && players.length >= 2 && (
            <Button
              size="sm"
              onClick={() => setShowCreateMatch(true)}
              data-testid="button-create-match"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Match
            </Button>
          )}
        </div>

        {/* Create Match Form */}
        {showCreateMatch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 p-4 bg-muted/30 rounded-xl border border-border"
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">Create Match Play</h4>
              <Button size="icon" variant="ghost" onClick={() => setShowCreateMatch(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Match Name</label>
                  <Input
                    placeholder="e.g., Front 9 Match"
                    value={matchName}
                    onChange={(e) => setMatchName(e.target.value)}
                    className="mt-1"
                    data-testid="input-match-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Wager ($ per player)</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="5"
                    value={unitAmount}
                    onChange={(e) => setUnitAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                    data-testid="input-unit-amount"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg min-h-[40px] flex items-center">
                    <span className="font-semibold text-primary text-sm">
                      {teamAPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamAPlayerIds) : "Select players..."}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {players.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => togglePlayerInTeam(p.id, 'A')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          teamAPlayerIds.includes(p.id)
                            ? "bg-primary text-primary-foreground"
                            : teamBPlayerIds.includes(p.id)
                            ? "bg-muted/50 text-muted-foreground line-through"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                        data-testid={`button-add-team-a-${p.id}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 px-3 py-2 bg-accent/10 rounded-lg min-h-[40px] flex items-center">
                    <span className="font-semibold text-accent text-sm">
                      {teamBPlayerIds.length > 0 ? getTeamNameFromPlayerIds(teamBPlayerIds) : "Select players..."}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {players.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => togglePlayerInTeam(p.id, 'B')}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          teamBPlayerIds.includes(p.id)
                            ? "bg-accent text-accent-foreground"
                            : teamAPlayerIds.includes(p.id)
                            ? "bg-muted/50 text-muted-foreground line-through"
                            : "bg-muted hover:bg-muted/80"
                        }`}
                        data-testid={`button-add-team-b-${p.id}`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                onClick={handleCreateEventMatch}
                disabled={!matchName.trim() || teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0 || createEventMatch.isPending}
                className="w-full"
                data-testid="button-submit-create-match"
              >
                {createEventMatch.isPending ? "Creating..." : "Create Match"}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Event Matches List */}
        {eventMatches.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {players.length < 2 
              ? "Add at least 2 players to create a match." 
              : "No matches yet. Create a match to track team competition!"}
          </p>
        ) : (
          <div className="space-y-3">
            {eventMatches.map((em) => {
              const teamA = em.teams[0];
              const teamB = em.teams[1];
              const results = calculateMatchPlayResults(em, scores);
              const status = teamA && teamB ? getMatchStatus(results, teamA, teamB) : 'Not started';
              const isExpanded = expandedMatch === em.id;

              return (
                <div key={em.id} className="border border-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedMatch(isExpanded ? null : em.id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    data-testid={`button-expand-match-${em.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-primary" />
                        <span className="font-semibold">{teamA?.name || "Team A"}</span>
                      </div>
                      <span className="text-muted-foreground">vs</span>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-accent" />
                        <span className="font-semibold">{teamB?.name || "Team B"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {em.unitAmount > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-muted rounded-full font-medium">
                          ${(em.unitAmount / 100).toFixed(2)}
                        </span>
                      )}
                      <span className="text-sm font-medium text-primary">{status}</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 space-y-4">
                        {/* Team Members */}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="font-medium text-primary mb-1">{teamA?.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {teamA?.members.map((m) => (
                                <span key={m.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                  {m.player?.name}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="font-medium text-accent mb-1">{teamB?.name}</p>
                            <div className="flex flex-wrap gap-1">
                              {teamB?.members.map((m) => (
                                <span key={m.id} className="px-2 py-0.5 bg-accent/10 text-accent rounded text-xs">
                                  {m.player?.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Match Play Scoreboard */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="p-2 text-left font-semibold">Hole</th>
                                {results.slice(0, 9).map((r) => (
                                  <th key={r.holeNumber} className="p-2 text-center font-medium">{r.holeNumber}</th>
                                ))}
                                <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                {results.slice(9, 18).map((r) => (
                                  <th key={r.holeNumber} className="p-2 text-center font-medium">{r.holeNumber}</th>
                                ))}
                                <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-border/50">
                                <td className="p-2 font-semibold text-primary">{teamA?.name}</td>
                                {results.slice(0, 9).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'A' ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                    {r.teamAScore ?? '-'}
                                  </td>
                                ))}
                                <td className="p-2 text-center font-semibold bg-muted/30">
                                  {results.slice(0, 9).filter(r => r.winner === 'A').length}
                                </td>
                                {results.slice(9, 18).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'A' ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                    {r.teamAScore ?? '-'}
                                  </td>
                                ))}
                                <td className="p-2 text-center font-semibold bg-muted/30">
                                  {results.slice(9, 18).filter(r => r.winner === 'A').length}
                                </td>
                              </tr>
                              <tr>
                                <td className="p-2 font-semibold text-accent">{teamB?.name}</td>
                                {results.slice(0, 9).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'B' ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                    {r.teamBScore ?? '-'}
                                  </td>
                                ))}
                                <td className="p-2 text-center font-semibold bg-muted/30">
                                  {results.slice(0, 9).filter(r => r.winner === 'B').length}
                                </td>
                                {results.slice(9, 18).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'B' ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                    {r.teamBScore ?? '-'}
                                  </td>
                                ))}
                                <td className="p-2 text-center font-semibold bg-muted/30">
                                  {results.slice(9, 18).filter(r => r.winner === 'B').length}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        {/* Running Status */}
                        <div className="flex justify-between items-center pt-2 border-t border-border">
                          <div className="text-sm">
                            <span className="font-medium">Total Holes Won: </span>
                            <span className="text-primary font-bold">{teamA?.name}: {results.filter(r => r.winner === 'A').length}</span>
                            <span className="mx-2">|</span>
                            <span className="text-accent font-bold">{teamB?.name}: {results.filter(r => r.winner === 'B').length}</span>
                          </div>
                          {isCreator && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteEventMatch.mutate(em.id)}
                              className="text-destructive hover:text-destructive"
                              data-testid={`button-delete-event-match-${em.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {/* Wager Summary */}
                        {em.unitAmount > 0 && (() => {
                          const settlement = calculateBetSettlements(em.unitAmount, teamA!, teamB!, results);
                          return (
                            <div className="pt-3 border-t border-border">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-semibold text-sm flex items-center gap-2">
                                  Wager Summary
                                  <span className="text-xs text-muted-foreground">(${(em.unitAmount / 100).toFixed(2)}/player)</span>
                                </h5>
                                {settlement.isComplete && (
                                  <span className={`text-xs px-2 py-0.5 rounded ${settlement.isTie ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>
                                    {settlement.isTie ? 'Match Halved - No Payouts' : `${settlement.winningTeamName} Wins!`}
                                  </span>
                                )}
                              </div>
                              
                              {!settlement.isComplete ? (
                                <p className="text-xs text-muted-foreground">Match in progress - pot: ${settlement.totalPot.toFixed(2)}</p>
                              ) : settlement.isTie ? (
                                <p className="text-xs text-muted-foreground">All bets returned</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {settlement.settlements.map((s) => (
                                    <div 
                                      key={s.playerId}
                                      className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-sm ${
                                        s.amount > 0 
                                          ? 'bg-primary/10 text-primary' 
                                          : 'bg-destructive/10 text-destructive'
                                      }`}
                                    >
                                      <span className="font-medium">{s.playerName}</span>
                                      <span className="font-bold">
                                        {s.amount > 0 ? '+' : ''}${s.amount.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
