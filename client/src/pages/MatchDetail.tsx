import { useMatch, useAddPlayer, useSubmitScore, useDeleteMatch, useCreateEventMatch, useDeleteEventMatch, useCreatePress, useUpdateAutoPress, useCourses } from "@/hooks/use-matches";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Calendar, UserPlus, Trophy, Plus, Trash2, Users, Swords, X, ChevronDown, ChevronUp, Receipt, Camera, Filter } from "lucide-react";
import { format } from "date-fns";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calculateMatchPlayResults, getMatchStatus, calculateBetSettlements, calculateLedger, calculateCombinedMatchSettlements, calculateNassauResults, calculateNassauSettlements, calculateSkinsResults } from "@/lib/matchplay";
import { MATCH_TYPES, ALL_MATCH_OPTIONS, MATCH_TYPE_LABELS, WIZARD_TYPES, type MatchType } from "@shared/schema";
import { PRESET_PLAYERS } from "@shared/models/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  startHole?: number;
  parentMatchId?: number | null;
  autoPressOriginal?: boolean;
  autoPressAllPresses?: boolean;
  teams: Team[];
}

function ScoreCell({ score, par, testId }: { score: number | null; par: number; testId: string }) {
  if (score === null) {
    return <span className="font-mono font-medium inline-block w-10 h-8 leading-8 text-muted-foreground" data-testid={testId}>-</span>;
  }
  
  const diff = score - par;
  
  if (diff === 0) {
    return <span className="font-mono font-medium inline-block w-10 h-8 leading-8 text-foreground" data-testid={testId}>{score}</span>;
  }
  
  if (diff < 0) {
    const circleCount = Math.abs(diff);
    const circles = Array.from({ length: circleCount }, (_, i) => (
      <span 
        key={i} 
        className="absolute inset-0 flex items-center justify-center"
        style={{ 
          transform: `scale(${1 + i * 0.35})`,
        }}
      >
        <span className="w-6 h-6 rounded-full border-2 border-red-500" />
      </span>
    ));
    
    return (
      <span className="font-mono font-bold inline-flex items-center justify-center w-10 h-8 text-red-500 relative" data-testid={testId}>
        {circles}
        <span className="relative z-10">{score}</span>
      </span>
    );
  }
  
  const squareCount = Math.min(diff, 3);
  const squares = Array.from({ length: squareCount }, (_, i) => (
    <span 
      key={i} 
      className="absolute inset-0 flex items-center justify-center"
      style={{ 
        transform: `scale(${1 + i * 0.35})`,
      }}
    >
      <span className="w-6 h-6 border-2 border-blue-500" />
    </span>
  ));
  
  return (
    <span className="font-mono font-bold inline-flex items-center justify-center w-10 h-8 text-blue-500 relative" data-testid={testId}>
      {squares}
      <span className="relative z-10">{score}</span>
    </span>
  );
}

export default function MatchDetail() {
  const [, params] = useRoute("/match/:id");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id || "0");
  const { data: match, isLoading, error } = useMatch(matchId);
  const { data: coursesList } = useCourses();
  const { user } = useAuth();
  const addPlayer = useAddPlayer(matchId);
  const submitScore = useSubmitScore(matchId);
  const deleteMatch = useDeleteMatch();
  const createEventMatch = useCreateEventMatch(matchId);
  const deleteEventMatch = useDeleteEventMatch(matchId);
  const createPress = useCreatePress(matchId);
  const updateAutoPress = useUpdateAutoPress(matchId);
  
  const [newPlayerName, setNewPlayerName] = useState("");
  const [pressDialogMatch, setPressDialogMatch] = useState<number | null>(null);
  const [pressStartHole, setPressStartHole] = useState<number>(2);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingCell, setEditingCell] = useState<{ playerId: number; hole: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  
  // Event Match creation state
  const [showCreateMatch, setShowCreateMatch] = useState(false);
  const [selectedMatchType, setSelectedMatchType] = useState<MatchType>(MATCH_TYPES.MATCH_PLAY_1_BALL);
  const [unitAmount, setUnitAmount] = useState<number>(20);
  const [teamAPlayerIds, setTeamAPlayerIds] = useState<number[]>([]);
  const [teamBPlayerIds, setTeamBPlayerIds] = useState<number[]>([]);
  const [expandedMatch, setExpandedMatch] = useState<number | null>(null);
  const [autoPressOriginal, setAutoPressOriginal] = useState(true);
  const [addPlayerCollapsed, setAddPlayerCollapsed] = useState(true);
  const [matchesCollapsed, setMatchesCollapsed] = useState(false);
  const [ledgerCollapsed, setLedgerCollapsed] = useState(false);
  
  // Round Robin wizard state (two groups)
  const [isRoundRobinMode, setIsRoundRobinMode] = useState(false);
  const [roundRobinMatchType, setRoundRobinMatchType] = useState<MatchType>(MATCH_TYPES.MATCH_PLAY_1_BALL);
  const [roundRobinGroupAIds, setRoundRobinGroupAIds] = useState<number[]>([]);
  const [roundRobinGroupBIds, setRoundRobinGroupBIds] = useState<number[]>([]);
  const [roundRobinStep, setRoundRobinStep] = useState<'select' | 'preview'>('select');
  const [isCreatingRoundRobin, setIsCreatingRoundRobin] = useState(false);
  
  // Skins match state
  const [skinsPlayerIds, setSkinsPlayerIds] = useState<number[]>([]);
  
  // Match filter state
  const [filterByPlayer, setFilterByPlayer] = useState<string>("all");
  const [filterByMatchType, setFilterByMatchType] = useState<string>("all");
  
  // Selected player in standings (for filtering Match Results)
  const [selectedStandingsPlayer, setSelectedStandingsPlayer] = useState<number | null>(null);

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
  
  // Find course par data for this match
  const matchCourse = coursesList?.find(c => c.name === match.courseName);
  const getHolePar = (hole: number) => matchCourse?.holes.find(h => h.holeNumber === hole)?.par ?? 4;

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
    if (teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0) return;
    
    const autoTeamAName = getTeamNameFromPlayerIds(teamAPlayerIds);
    const autoTeamBName = getTeamNameFromPlayerIds(teamBPlayerIds);
    const autoMatchName = `${autoTeamAName} vs ${autoTeamBName}`;
    
    const isMatchPlay = selectedMatchType === MATCH_TYPES.MATCH_PLAY_1_BALL || selectedMatchType === MATCH_TYPES.MATCH_PLAY_2_BALL;
    const isNassau = selectedMatchType === MATCH_TYPES.NASSAU;
    
    createEventMatch.mutate({
      name: autoMatchName,
      matchType: selectedMatchType,
      unitAmount: unitAmount * 100,
      teamA: { name: autoTeamAName, playerIds: teamAPlayerIds },
      teamB: { name: autoTeamBName, playerIds: teamBPlayerIds },
      autoPressOriginal: (isMatchPlay || isNassau) ? autoPressOriginal : false,
      autoPressAllPresses: false,
      // Nassau-specific: initialize all three to the same value as autoPressOriginal
      autoPressNassauFront9: isNassau ? autoPressOriginal : true,
      autoPressNassauBack9: isNassau ? autoPressOriginal : true,
      autoPressNassauOverall: isNassau ? autoPressOriginal : true,
    }, {
      onSuccess: () => {
        setShowCreateMatch(false);
        setSelectedMatchType(MATCH_TYPES.MATCH_PLAY_1_BALL);
        setUnitAmount(20);
        setTeamAPlayerIds([]);
        setTeamBPlayerIds([]);
        setAutoPressOriginal(true);
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

  const toggleSkinsPlayer = (playerId: number) => {
    if (skinsPlayerIds.includes(playerId)) {
      setSkinsPlayerIds(skinsPlayerIds.filter(id => id !== playerId));
    } else {
      setSkinsPlayerIds([...skinsPlayerIds, playerId]);
    }
  };

  const handleCreateSkinsMatch = () => {
    if (skinsPlayerIds.length < 2) return;
    
    const playerNames = skinsPlayerIds.map(id => players.find(p => p.id === id)?.name || '').join(', ');
    const matchName = `Skins: ${playerNames}`;
    
    createEventMatch.mutate({
      name: matchName,
      matchType: MATCH_TYPES.SKINS,
      unitAmount: unitAmount * 100,
      teamA: { name: 'Skins Players', playerIds: skinsPlayerIds },
      teamB: { name: 'Skins Players', playerIds: skinsPlayerIds },
      autoPressOriginal: false,
      autoPressAllPresses: false,
    }, {
      onSuccess: () => {
        setShowCreateMatch(false);
        setSelectedMatchType(MATCH_TYPES.MATCH_PLAY_1_BALL);
        setUnitAmount(20);
        setSkinsPlayerIds([]);
      }
    });
  };

  // Generate all 2-player combinations from selected players
  const generateTwoPlayerTeams = (playerIds: number[]): [number, number][] => {
    const teams: [number, number][] = [];
    for (let i = 0; i < playerIds.length; i++) {
      for (let j = i + 1; j < playerIds.length; j++) {
        teams.push([playerIds[i], playerIds[j]]);
      }
    }
    return teams;
  };

  // Generate cross-product matches between Group A teams and Group B teams
  const generateRoundRobinMatches = (groupAIds: number[], groupBIds: number[]): { teamA: [number, number]; teamB: [number, number] }[] => {
    const groupATeams = generateTwoPlayerTeams(groupAIds);
    const groupBTeams = generateTwoPlayerTeams(groupBIds);
    const matches: { teamA: [number, number]; teamB: [number, number] }[] = [];

    // Cross-product: every Group A team vs every Group B team
    for (const teamA of groupATeams) {
      for (const teamB of groupBTeams) {
        matches.push({ teamA, teamB });
      }
    }
    return matches;
  };

  const getPlayerNameById = (id: number) => players.find(p => p.id === id)?.name || 'Unknown';

  const handleCreateRoundRobinMatches = async () => {
    if (roundRobinGroupAIds.length < 2 || roundRobinGroupBIds.length < 2) return;
    
    setIsCreatingRoundRobin(true);
    const matchPairings = generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds);
    
    try {
      for (const pairing of matchPairings) {
        const teamAName = pairing.teamA.map(id => getPlayerNameById(id)).join('/');
        const teamBName = pairing.teamB.map(id => getPlayerNameById(id)).join('/');
        
        await new Promise<void>((resolve, reject) => {
          createEventMatch.mutate({
            name: `${teamAName} vs ${teamBName}`,
            matchType: roundRobinMatchType,
            unitAmount: unitAmount * 100,
            teamA: { name: teamAName, playerIds: pairing.teamA },
            teamB: { name: teamBName, playerIds: pairing.teamB },
            autoPressOriginal: autoPressOriginal,
            autoPressAllPresses: false,
          }, {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          });
        });
      }
      
      // Reset wizard state
      setShowCreateMatch(false);
      setIsRoundRobinMode(false);
      setRoundRobinGroupAIds([]);
      setRoundRobinGroupBIds([]);
      setRoundRobinStep('select');
      setSelectedMatchType(MATCH_TYPES.MATCH_PLAY_1_BALL);
    } catch (error) {
      console.error('Error creating round robin matches:', error);
    } finally {
      setIsCreatingRoundRobin(false);
    }
  };

  const toggleRoundRobinPlayerInGroup = (playerId: number, group: 'A' | 'B') => {
    if (group === 'A') {
      if (roundRobinGroupAIds.includes(playerId)) {
        setRoundRobinGroupAIds(roundRobinGroupAIds.filter(id => id !== playerId));
      } else {
        setRoundRobinGroupAIds([...roundRobinGroupAIds, playerId]);
        setRoundRobinGroupBIds(roundRobinGroupBIds.filter(id => id !== playerId));
      }
    } else {
      if (roundRobinGroupBIds.includes(playerId)) {
        setRoundRobinGroupBIds(roundRobinGroupBIds.filter(id => id !== playerId));
      } else {
        setRoundRobinGroupBIds([...roundRobinGroupBIds, playerId]);
        setRoundRobinGroupAIds(roundRobinGroupAIds.filter(id => id !== playerId));
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
      {/* Header - Compact */}
      <div className="bg-white rounded-xl px-4 py-3 shadow-md border border-border/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-display font-bold text-foreground">{match.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="w-4 h-4 text-accent" />
              {match.courseName}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4 text-primary" />
              {match.createdAt && format(new Date(match.createdAt), "MMM d, yyyy")}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          {!isPlayer && (
            <Button
              size="sm"
              onClick={handleJoinMatch}
              disabled={addPlayer.isPending}
              data-testid="button-join-match"
            >
              <UserPlus className="w-4 h-4 mr-1" />
              {addPlayer.isPending ? "Joining..." : "Join"}
            </Button>
          )}
          {isCreator && (
            showDeleteConfirm ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    deleteMatch.mutate(matchId, {
                      onSuccess: () => navigate("/")
                    });
                  }}
                  disabled={deleteMatch.isPending}
                  data-testid="button-confirm-delete-match"
                >
                  {deleteMatch.isPending ? "..." : "Confirm"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  data-testid="button-cancel-delete-match"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-muted-foreground hover:text-destructive"
                data-testid="button-delete-match"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )
          )}
        </div>
      </div>

      {/* Add Player Section (visible to creator) - Collapsible */}
      {isCreator && (() => {
        const existingPlayerNames = players.map(p => p.name.toLowerCase());
        
        return (
          <div className="bg-white rounded-xl shadow-md border border-border/50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <button
                onClick={() => setAddPlayerCollapsed(!addPlayerCollapsed)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                data-testid="button-toggle-add-player"
              >
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Add Player ({players.length} added)
                </h3>
                {addPlayerCollapsed ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              <Link href={`/match/${matchId}/scores?scan=true`}>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="gap-1"
                  data-testid="button-scan-scorecard-header"
                >
                  <Camera className="w-4 h-4" />
                  Scan Scorecard
                </Button>
              </Link>
            </div>
            
            {!addPlayerCollapsed && (
              <div className="px-4 pb-4 pt-2 border-t border-border/50">
                {/* Preset Players Grid */}
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Quick add from roster:</p>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                    {PRESET_PLAYERS.map((name) => {
                      const isAdded = existingPlayerNames.includes(name.toLowerCase());
                      return (
                        <label
                          key={name}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer transition-colors ${
                            isAdded 
                              ? 'bg-primary/10 text-primary border border-primary/20' 
                              : 'bg-muted/50 hover:bg-muted border border-transparent'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isAdded}
                            onChange={() => {
                              if (!isAdded) {
                                addPlayer.mutate({ name });
                              }
                            }}
                            disabled={isAdded || addPlayer.isPending}
                            className="w-3 h-3 rounded"
                            data-testid={`checkbox-preset-${name.toLowerCase().replace(/\s+/g, '-')}`}
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                
                {/* Custom Name Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter player name..."
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddGuest()}
                    className="flex-1 h-8 text-sm"
                    data-testid="input-player-name"
                  />
                  <Button 
                    size="sm"
                    onClick={handleAddGuest} 
                    disabled={!newPlayerName.trim() || addPlayer.isPending}
                    data-testid="button-add-player"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Matches Section */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setMatchesCollapsed(!matchesCollapsed)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              data-testid="button-toggle-matches"
            >
              <h3 className="font-display font-bold text-lg flex items-center gap-2">
                <Swords className="w-5 h-5 text-primary" />
                Matches ({eventMatches.length})
              </h3>
              {matchesCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {isCreator && players.length >= 2 && !matchesCollapsed && (
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
          
          {!matchesCollapsed && eventMatches.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={filterByPlayer} onValueChange={setFilterByPlayer}>
                <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-filter-player">
                  <SelectValue placeholder="Player" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Players</SelectItem>
                  {players.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterByMatchType} onValueChange={setFilterByMatchType}>
                <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-filter-match-type">
                  <SelectValue placeholder="Match Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="match_play_1_ball">Match Play - 1 Ball</SelectItem>
                  <SelectItem value="match_play_2_ball">Match Play - 2 Ball</SelectItem>
                  <SelectItem value="stroke_play">Stroke Play</SelectItem>
                  <SelectItem value="nassau">Nassau</SelectItem>
                  <SelectItem value="skins">Skins</SelectItem>
                </SelectContent>
              </Select>
              {(filterByPlayer !== "all" || filterByMatchType !== "all") && (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  className="h-8 text-xs"
                  onClick={() => { setFilterByPlayer("all"); setFilterByMatchType("all"); }}
                  data-testid="button-clear-filters"
                >
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Create Match Form */}
        {!matchesCollapsed && showCreateMatch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 p-4 bg-muted/30 rounded-xl border border-border"
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-semibold">
                {isRoundRobinMode ? 'Round Robin - Match Play 1 Ball (2 man teams)' : 'Create Match Play'}
              </h4>
              <Button size="icon" variant="ghost" onClick={() => {
                setShowCreateMatch(false);
                setIsRoundRobinMode(false);
                setRoundRobinGroupAIds([]);
                setRoundRobinGroupBIds([]);
                setRoundRobinStep('select');
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Round Robin Wizard */}
            {isRoundRobinMode ? (
              <div className="space-y-4">
                {roundRobinStep === 'select' ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Wager ($ per player per match)</label>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="20"
                          value={unitAmount}
                          onChange={(e) => setUnitAmount(parseFloat(e.target.value) || 0)}
                          className="mt-1"
                          data-testid="input-rr-unit-amount"
                        />
                      </div>
                      <div className="flex items-end">
                        <div className="space-y-2 p-3 bg-muted/30 rounded-lg flex-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoPressOriginal}
                              onChange={(e) => setAutoPressOriginal(e.target.checked)}
                              className="w-4 h-4 rounded border-border"
                              data-testid="checkbox-rr-auto-press"
                            />
                            <span className="text-sm font-medium">Auto Press</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Select players for Group 1 (left) and Group 2 (right). All 2-man teams from Group 1 will play against all 2-man teams from Group 2.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg min-h-[40px] flex items-center">
                          <span className="font-semibold text-primary text-sm">
                            Group 1 ({roundRobinGroupAIds.length} players, {generateTwoPlayerTeams(roundRobinGroupAIds).length} teams)
                          </span>
                        </div>
                        <div className="space-y-1">
                          {players.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => toggleRoundRobinPlayerInGroup(p.id, 'A')}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                roundRobinGroupAIds.includes(p.id)
                                  ? "bg-primary text-primary-foreground"
                                  : roundRobinGroupBIds.includes(p.id)
                                  ? "bg-muted/50 text-muted-foreground line-through"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-rr-group-a-${p.id}`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 px-3 py-2 bg-accent/10 rounded-lg min-h-[40px] flex items-center">
                          <span className="font-semibold text-accent text-sm">
                            Group 2 ({roundRobinGroupBIds.length} players, {generateTwoPlayerTeams(roundRobinGroupBIds).length} teams)
                          </span>
                        </div>
                        <div className="space-y-1">
                          {players.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => toggleRoundRobinPlayerInGroup(p.id, 'B')}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                roundRobinGroupBIds.includes(p.id)
                                  ? "bg-accent text-accent-foreground"
                                  : roundRobinGroupAIds.includes(p.id)
                                  ? "bg-muted/50 text-muted-foreground line-through"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                              data-testid={`button-rr-group-b-${p.id}`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {roundRobinGroupAIds.length >= 2 && roundRobinGroupBIds.length >= 2 && (
                      <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-sm font-medium text-primary">
                          {generateTwoPlayerTeams(roundRobinGroupAIds).length} Group 1 teams x {generateTwoPlayerTeams(roundRobinGroupBIds).length} Group 2 teams = {generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds).length} matches
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsRoundRobinMode(false);
                          setRoundRobinGroupAIds([]);
                          setRoundRobinGroupBIds([]);
                        }}
                        className="flex-1"
                      >
                        Back
                      </Button>
                      <Button
                        onClick={() => setRoundRobinStep('preview')}
                        disabled={roundRobinGroupAIds.length < 2 || roundRobinGroupBIds.length < 2}
                        className="flex-1"
                        data-testid="button-rr-preview"
                      >
                        Preview Matches
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                      {generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds).map((match, idx) => {
                        const teamAName = match.teamA.map(id => getPlayerNameById(id)).join('/');
                        const teamBName = match.teamB.map(id => getPlayerNameById(id)).join('/');
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-white rounded-lg border border-border/50">
                            <span className="text-sm font-medium text-primary">{teamAName}</span>
                            <span className="text-xs text-muted-foreground">vs</span>
                            <span className="text-sm font-medium text-accent">{teamBName}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="p-3 bg-muted/50 rounded-lg text-sm">
                      <p><strong>Match Type:</strong> {MATCH_TYPE_LABELS[roundRobinMatchType]}</p>
                      <p><strong>Wager:</strong> ${unitAmount} per player per match</p>
                      <p><strong>Auto Press:</strong> {autoPressOriginal ? 'Enabled' : 'Disabled'}</p>
                      <p><strong>Total Matches:</strong> {generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds).length}</p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setRoundRobinStep('select')}
                        className="flex-1"
                        disabled={isCreatingRoundRobin}
                      >
                        Back
                      </Button>
                      <Button
                        onClick={handleCreateRoundRobinMatches}
                        disabled={isCreatingRoundRobin}
                        className="flex-1"
                        data-testid="button-rr-create"
                      >
                        {isCreatingRoundRobin ? 'Creating...' : `Create ${generateRoundRobinMatches(roundRobinGroupAIds, roundRobinGroupBIds).length} Matches`}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Match Type</label>
                  <Select
                    value={selectedMatchType}
                    onValueChange={(value) => {
                      if (value === WIZARD_TYPES.ROUND_ROBIN_2_MAN) {
                        setIsRoundRobinMode(true);
                        setRoundRobinMatchType(MATCH_TYPES.MATCH_PLAY_1_BALL);
                        setRoundRobinGroupAIds([]);
                        setRoundRobinGroupBIds([]);
                        setRoundRobinStep('select');
                      } else if (value === WIZARD_TYPES.ROUND_ROBIN_NASSAU) {
                        setIsRoundRobinMode(true);
                        setRoundRobinMatchType(MATCH_TYPES.NASSAU);
                        setRoundRobinGroupAIds([]);
                        setRoundRobinGroupBIds([]);
                        setRoundRobinStep('select');
                      } else if (value === MATCH_TYPES.SKINS) {
                        setSelectedMatchType(MATCH_TYPES.SKINS);
                        setSkinsPlayerIds(players.map(p => p.id));
                      } else {
                        setSelectedMatchType(value as MatchType);
                        setSkinsPlayerIds([]);
                      }
                    }}
                  >
                    <SelectTrigger className="mt-1" data-testid="select-match-type">
                      <SelectValue placeholder="Select match type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_MATCH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} data-testid={`option-${opt.value}`}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

              {/* Auto Press Option - For Match Play and Nassau */}
              {(selectedMatchType === MATCH_TYPES.MATCH_PLAY_1_BALL || selectedMatchType === MATCH_TYPES.MATCH_PLAY_2_BALL || selectedMatchType === MATCH_TYPES.NASSAU) && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPressOriginal}
                      onChange={(e) => setAutoPressOriginal(e.target.checked)}
                      className="w-4 h-4 rounded border-border"
                      data-testid="checkbox-auto-press"
                    />
                    <span className="text-sm font-medium">Auto Press</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedMatchType === MATCH_TYPES.NASSAU 
                      ? "When 2+ down: Win doubles bet, loss pushes. Applies to Front 9 (hole 9), Back 9 (hole 18), and Overall (hole 18)"
                      : "When 2+ down going into 18: Win doubles bet, loss pushes, tie unchanged"}
                  </p>
                </div>
              )}

              {/* Skins Player Selection */}
              {selectedMatchType === MATCH_TYPES.SKINS ? (
                <>
                  <div>
                    <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg">
                      <span className="font-semibold text-primary text-sm">
                        Players in Skins ({skinsPlayerIds.length} selected)
                      </span>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {players.map((p) => (
                        <label
                          key={p.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={skinsPlayerIds.includes(p.id)}
                            onChange={() => toggleSkinsPlayer(p.id)}
                            className="w-4 h-4 rounded border-border"
                            data-testid={`checkbox-skins-player-${p.id}`}
                          />
                          <span className={`text-sm ${skinsPlayerIds.includes(p.id) ? 'font-medium' : 'text-muted-foreground'}`}>
                            {p.name}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Pool: ${unitAmount * skinsPlayerIds.length} (${unitAmount} x {skinsPlayerIds.length} players)
                    </p>
                  </div>

                  <Button
                    onClick={handleCreateSkinsMatch}
                    disabled={skinsPlayerIds.length < 2 || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-skins"
                  >
                    {createEventMatch.isPending ? "Creating..." : "Create Skins Match"}
                  </Button>
                </>
              ) : (
                <>
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
                    disabled={teamAPlayerIds.length === 0 || teamBPlayerIds.length === 0 || createEventMatch.isPending}
                    className="w-full"
                    data-testid="button-submit-create-match"
                  >
                    {createEventMatch.isPending ? "Creating..." : "Create Match"}
                  </Button>
                </>
              )}
            </div>
            )}
          </motion.div>
        )}

        {/* Event Matches List */}
        {!matchesCollapsed && (() => {
          const filteredMatches = eventMatches.filter(em => {
            if (em.parentMatchId) return false;
            
            if (filterByMatchType !== "all" && em.matchType !== filterByMatchType) {
              return false;
            }
            
            if (filterByPlayer !== "all") {
              const playerId = parseInt(filterByPlayer);
              const allMembers = em.teams.flatMap(t => t.members.map(m => m.playerId));
              if (!allMembers.includes(playerId)) {
                return false;
              }
            }
            
            return true;
          });
          
          return eventMatches.length === 0 ? (
          <p className="text-muted-foreground text-sm mt-4">
            {players.length < 2 
              ? "Add at least 2 players to create a match." 
              : "No matches yet. Create a match to track team competition!"}
          </p>
        ) : filteredMatches.length === 0 ? (
          <p className="text-muted-foreground text-sm mt-4">
            No matches match the selected filters.
          </p>
        ) : (
          <div className="space-y-3 mt-4">
            {filteredMatches.map((em) => {
              const teamA = em.teams[0];
              const teamB = em.teams[1];
              const results = calculateMatchPlayResults(em, scores);
              const status = teamA && teamB ? getMatchStatus(results, teamA, teamB, em.matchType) : 'Not started';
              const isExpanded = expandedMatch === em.id;
              const pressMatches = eventMatches.filter(pm => pm.parentMatchId === em.id);

              return (
                <div key={em.id} className="border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center">
                    <button
                      onClick={() => setExpandedMatch(isExpanded ? null : em.id)}
                      className="flex-1 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-muted/30 transition-colors"
                      data-testid={`button-expand-match-${em.id}`}
                    >
                      <div className="flex items-center gap-2 sm:gap-4">
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Users className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                          <span className="font-semibold text-sm sm:text-base">{teamA?.name || "Team A"}</span>
                        </div>
                        <span className="text-muted-foreground text-xs sm:text-base">vs</span>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <Users className="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
                          <span className="font-semibold text-sm sm:text-base">{teamB?.name || "Team B"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                        <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                          {MATCH_TYPE_LABELS[em.matchType as MatchType] || em.matchType}
                        </span>
                        {em.unitAmount > 0 && (
                          <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 bg-muted rounded-full font-medium">
                            ${(em.unitAmount / 100).toFixed(2)}
                          </span>
                        )}
                        <span className="text-xs sm:text-sm font-medium text-primary">{status}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4" /> : <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4" />}
                      </div>
                    </button>
                    {isCreator && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mr-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Are you sure you want to delete this match?')) {
                            deleteEventMatch.mutate(em.id);
                          }
                        }}
                        disabled={deleteEventMatch.isPending}
                        data-testid={`button-delete-match-${em.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Collapsed Press Matches */}
                  {!isExpanded && pressMatches.length > 0 && (
                    <div className="px-4 pb-3 space-y-1">
                      {pressMatches.map((pm) => {
                        const pressResults = calculateMatchPlayResults(pm, scores);
                        const pressTeamA = pm.teams[0];
                        const pressTeamB = pm.teams[1];
                        const pressStatus = pressTeamA && pressTeamB ? getMatchStatus(pressResults, pressTeamA, pressTeamB, pm.matchType) : 'Not started';
                        return (
                          <div 
                            key={pm.id} 
                            className="flex items-center justify-between text-xs py-1 px-3 bg-muted/30 rounded"
                            data-testid={`press-collapsed-${pm.id}`}
                          >
                            <span className="font-medium">Press (Hole {pm.startHole})</span>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-muted rounded-full">
                                ${(pm.unitAmount / 100).toFixed(2)}
                              </span>
                              <span className="font-medium text-primary">{pressStatus}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="border-t border-border"
                    >
                      <div className="p-4 space-y-4">
                        {/* Skins Match View */}
                        {em.matchType === 'skins' ? (() => {
                          const includedPlayerIds = teamA?.members.map(m => m.playerId) || [];
                          const playerNames = new Map<number, string>();
                          teamA?.members.forEach(m => {
                            playerNames.set(m.playerId, m.player?.name || `Player ${m.playerId}`);
                          });
                          const skinsResult = calculateSkinsResults(includedPlayerIds, playerNames, scores, (em.unitAmount || 0) / 100);
                          
                          return (
                            <div className="space-y-4">
                              {/* Players in Skins */}
                              <div>
                                <p className="font-medium text-primary mb-2">Players ({includedPlayerIds.length})</p>
                                <div className="flex flex-wrap gap-1">
                                  {teamA?.members.map((m) => {
                                    const playerSkins = skinsResult.skinWinners.find(w => w.playerId === m.playerId);
                                    return (
                                      <span key={m.id} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                        {m.player?.name} {playerSkins?.skinsWon ? `(${playerSkins.skinsWon})` : ''}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Skins Scoreboard */}
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b border-border">
                                      <th className="p-2 text-left font-semibold">Hole</th>
                                      {Array.from({ length: 9 }, (_, i) => (
                                        <th key={i + 1} className="p-2 text-center font-medium">{i + 1}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">Out</th>
                                      {Array.from({ length: 9 }, (_, i) => (
                                        <th key={i + 10} className="p-2 text-center font-medium">{i + 10}</th>
                                      ))}
                                      <th className="p-2 text-center font-semibold bg-muted/30">In</th>
                                      <th className="p-2 text-center font-semibold bg-muted/30">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {/* Skin Winners Row */}
                                    <tr className="border-b border-border/50 bg-primary/5">
                                      <td className="p-2 font-semibold">Skin Won</td>
                                      {skinsResult.holeResults.slice(0, 9).map((r) => (
                                        <td 
                                          key={r.holeNumber} 
                                          className={`p-2 text-center ${r.isSkin ? 'bg-primary/20 text-primary font-bold' : ''}`}
                                        >
                                          {r.isSkin ? r.winnerName?.split(' ')[0] : (r.lowestScore !== null ? '-' : '')}
                                        </td>
                                      ))}
                                      <td className="p-2 text-center font-semibold bg-muted/30">
                                        {skinsResult.holeResults.slice(0, 9).filter(r => r.isSkin).length}
                                      </td>
                                      {skinsResult.holeResults.slice(9, 18).map((r) => (
                                        <td 
                                          key={r.holeNumber} 
                                          className={`p-2 text-center ${r.isSkin ? 'bg-primary/20 text-primary font-bold' : ''}`}
                                        >
                                          {r.isSkin ? r.winnerName?.split(' ')[0] : (r.lowestScore !== null ? '-' : '')}
                                        </td>
                                      ))}
                                      <td className="p-2 text-center font-semibold bg-muted/30">
                                        {skinsResult.holeResults.slice(9, 18).filter(r => r.isSkin).length}
                                      </td>
                                      <td className="p-2 text-center font-bold bg-muted/30">
                                        {skinsResult.totalSkins}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>

                              {/* Skins Summary */}
                              <div className="flex justify-between items-center pt-2 border-t border-border">
                                <div className="text-sm">
                                  <span className="font-medium">Total Pool: </span>
                                  <span className="font-bold">${skinsResult.totalPool.toFixed(2)}</span>
                                  <span className="text-muted-foreground mx-2">|</span>
                                  <span className="font-medium">Skins: </span>
                                  <span className="font-bold">{skinsResult.totalSkins}</span>
                                  {skinsResult.totalSkins > 0 && (
                                    <>
                                      <span className="text-muted-foreground mx-2">|</span>
                                      <span className="font-medium">Value each: </span>
                                      <span className="font-bold">${skinsResult.skinValue.toFixed(2)}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Skins Payouts */}
                              {skinsResult.isComplete && skinsResult.settlements.length > 0 && (
                                <div className="pt-3 border-t border-border">
                                  <h5 className="font-semibold text-sm mb-2">Settlements</h5>
                                  <div className="flex flex-wrap gap-2">
                                    {skinsResult.settlements.map((s) => (
                                      <span 
                                        key={s.playerId}
                                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                                          s.amount > 0 
                                            ? 'bg-primary/10 text-primary' 
                                            : s.amount < 0 
                                            ? 'bg-destructive/10 text-destructive'
                                            : 'bg-muted text-muted-foreground'
                                        }`}
                                      >
                                        {s.playerName}: {s.amount > 0 ? '+' : ''}{s.amount === 0 ? 'Even' : `$${s.amount.toFixed(2)}`}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })() : (
                        <>
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
                                {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                  <th className="p-2 text-center font-semibold text-xs">Auto Press</th>
                                )}
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
                                {(() => {
                                  const outResult = results[8];
                                  const hasOutScores = outResult?.teamAScore !== null;
                                  if (!hasOutScores) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{outResult.cumulativeA}</td>;
                                  }
                                  const outDiff = outResult ? outResult.cumulativeA - outResult.cumulativeB : 0;
                                  if (outDiff > 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{outDiff} UP</td>;
                                  if (outDiff < 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{Math.abs(outDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {results.slice(9, 18).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'A' ? 'bg-primary/20 text-primary font-bold' : ''}`}>
                                    {r.teamAScore ?? '-'}
                                  </td>
                                ))}
                                {(() => {
                                  const inResult = results[17];
                                  const hasInScores = inResult?.teamAScore !== null;
                                  if (!hasInScores) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{inResult.cumulativeA}</td>;
                                  }
                                  const inDiff = inResult ? inResult.cumulativeA - inResult.cumulativeB : 0;
                                  if (inDiff > 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{inDiff} UP</td>;
                                  if (inDiff < 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{Math.abs(inDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                  <td></td>
                                )}
                              </tr>
                              <tr className="border-b border-border/50">
                                <td className="p-2 font-semibold text-accent">{teamB?.name}</td>
                                {results.slice(0, 9).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'B' ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                    {r.teamBScore ?? '-'}
                                  </td>
                                ))}
                                {(() => {
                                  const outResult = results[8];
                                  const hasOutScores = outResult?.teamBScore !== null;
                                  if (!hasOutScores) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{outResult.cumulativeB}</td>;
                                  }
                                  const outDiff = outResult ? outResult.cumulativeB - outResult.cumulativeA : 0;
                                  if (outDiff > 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{outDiff} UP</td>;
                                  if (outDiff < 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{Math.abs(outDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {results.slice(9, 18).map((r) => (
                                  <td key={r.holeNumber} className={`p-2 text-center ${r.winner === 'B' ? 'bg-accent/20 text-accent font-bold' : ''}`}>
                                    {r.teamBScore ?? '-'}
                                  </td>
                                ))}
                                {(() => {
                                  const inResult = results[17];
                                  const hasInScores = inResult?.teamBScore !== null;
                                  if (!hasInScores) return <td className="p-2 text-center font-semibold bg-muted/30">-</td>;
                                  if (em.matchType === 'stroke_play') {
                                    return <td className="p-2 text-center font-semibold bg-muted/30">{inResult.cumulativeB}</td>;
                                  }
                                  const inDiff = inResult ? inResult.cumulativeB - inResult.cumulativeA : 0;
                                  if (inDiff > 0) return <td className="p-2 text-center font-semibold bg-accent/20 text-accent">{inDiff} UP</td>;
                                  if (inDiff < 0) return <td className="p-2 text-center font-semibold bg-primary/20 text-primary">{Math.abs(inDiff)} DN</td>;
                                  return <td className="p-2 text-center font-semibold bg-muted/30">AS</td>;
                                })()}
                                {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball' || em.matchType === 'nassau') && !em.parentMatchId && (
                                  <td></td>
                                )}
                              </tr>
                              {em.matchType === 'nassau' ? (
                                <>
                                  {/* Nassau: 3 status rows for Front 9, Back 9, Overall */}
                                  {(() => {
                                    const nassauResults = calculateNassauResults(em, scores);
                                    return (
                                      <>
                                        {/* Front 9 Status */}
                                        <tr className="border-t-2 border-border bg-blue-50/50 dark:bg-blue-950/30">
                                          <td className="p-2 font-semibold text-xs">Front 9</td>
                                          {nassauResults.front9.map((r) => {
                                            const diff = r.cumulativeA - r.cumulativeB;
                                            const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                            if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          {Array.from({ length: 9 }, (_, i) => (
                                            <td key={i + 10} className="p-2 text-center text-muted-foreground/30">-</td>
                                          ))}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          <td className="p-2 text-center">
                                            <Checkbox
                                              id={`autopress-nassau-front9-${em.id}`}
                                              checked={em.autoPressNassauFront9 ?? true}
                                              onCheckedChange={(checked) => {
                                                updateAutoPress.mutate({ 
                                                  eventMatchId: em.id, 
                                                  autoPressNassauFront9: checked === true 
                                                });
                                              }}
                                              disabled={updateAutoPress.isPending}
                                              data-testid={`checkbox-autopress-nassau-front9-${em.id}`}
                                            />
                                          </td>
                                        </tr>
                                        {/* Back 9 Status */}
                                        <tr className="border-t border-border/50 bg-green-50/50 dark:bg-green-950/30">
                                          <td className="p-2 font-semibold text-xs">Back 9</td>
                                          {Array.from({ length: 9 }, (_, i) => (
                                            <td key={i + 1} className="p-2 text-center text-muted-foreground/30">-</td>
                                          ))}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          {nassauResults.back9.map((r) => {
                                            const diff = r.cumulativeA - r.cumulativeB;
                                            const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                            if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          <td className="p-2 text-center">
                                            <Checkbox
                                              id={`autopress-nassau-back9-${em.id}`}
                                              checked={em.autoPressNassauBack9 ?? true}
                                              onCheckedChange={(checked) => {
                                                updateAutoPress.mutate({ 
                                                  eventMatchId: em.id, 
                                                  autoPressNassauBack9: checked === true 
                                                });
                                              }}
                                              disabled={updateAutoPress.isPending}
                                              data-testid={`checkbox-autopress-nassau-back9-${em.id}`}
                                            />
                                          </td>
                                        </tr>
                                        {/* Overall Status */}
                                        <tr className="border-t border-border/50 bg-amber-50/50 dark:bg-amber-950/30">
                                          <td className="p-2 font-semibold text-xs">Overall</td>
                                          {nassauResults.overall.slice(0, 9).map((r) => {
                                            const diff = r.cumulativeA - r.cumulativeB;
                                            const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                            if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          {nassauResults.overall.slice(9, 18).map((r) => {
                                            const diff = r.cumulativeA - r.cumulativeB;
                                            const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                            if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                            if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                            if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                            return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                          })}
                                          <td className="p-2 text-center bg-muted/30"></td>
                                          <td className="p-2 text-center">
                                            <Checkbox
                                              id={`autopress-nassau-overall-${em.id}`}
                                              checked={em.autoPressNassauOverall ?? true}
                                              onCheckedChange={(checked) => {
                                                updateAutoPress.mutate({ 
                                                  eventMatchId: em.id, 
                                                  autoPressNassauOverall: checked === true 
                                                });
                                              }}
                                              disabled={updateAutoPress.isPending}
                                              data-testid={`checkbox-autopress-nassau-overall-${em.id}`}
                                            />
                                          </td>
                                        </tr>
                                      </>
                                    );
                                  })()}
                                </>
                              ) : (
                                <tr className="border-t-2 border-border">
                                  <td className="p-2 font-semibold">Status</td>
                                  {results.slice(0, 9).map((r) => {
                                    const diff = r.cumulativeA - r.cumulativeB;
                                    const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                    if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                    if (em.matchType === 'stroke_play') {
                                      if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary">{Math.abs(diff)}</td>;
                                      if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent">{diff}</td>;
                                      return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground">T</td>;
                                    }
                                    if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary">{diff} UP</td>;
                                    if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent">{Math.abs(diff)} UP</td>;
                                    return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground">AS</td>;
                                  })}
                                  <td className="p-2 text-center bg-muted/30"></td>
                                  {results.slice(9, 18).map((r) => {
                                    const diff = r.cumulativeA - r.cumulativeB;
                                    const hasScores = r.teamAScore !== null && r.teamBScore !== null;
                                    if (!hasScores) return <td key={r.holeNumber} className="p-2 text-center">-</td>;
                                    if (em.matchType === 'stroke_play') {
                                      if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary">{Math.abs(diff)}</td>;
                                      if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent">{diff}</td>;
                                      return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground">T</td>;
                                    }
                                    if (diff > 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-primary">{diff} UP</td>;
                                    if (diff < 0) return <td key={r.holeNumber} className="p-2 text-center font-bold text-accent">{Math.abs(diff)} UP</td>;
                                    return <td key={r.holeNumber} className="p-2 text-center text-muted-foreground">AS</td>;
                                  })}
                                  <td className="p-2 text-center bg-muted/30"></td>
                                  {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball') && !em.parentMatchId && (
                                    <td className="p-2 text-center">
                                      <Checkbox
                                        id={`autopress-${em.id}`}
                                        checked={em.autoPressOriginal ?? true}
                                        onCheckedChange={(checked) => {
                                          updateAutoPress.mutate({ 
                                            eventMatchId: em.id, 
                                            autoPressOriginal: checked === true 
                                          });
                                        }}
                                        disabled={updateAutoPress.isPending}
                                        data-testid={`checkbox-autopress-${em.id}`}
                                      />
                                    </td>
                                  )}
                                </tr>
                              )}
                              {/* Press Match Rows */}
                              {pressMatches.map((pm) => {
                                const pressResults = calculateMatchPlayResults(pm, scores);
                                const pressStartHole = pm.startHole || 1;
                                return (
                                  <tr key={pm.id} className="border-t border-border/50 bg-muted/20">
                                    <td className="p-2 font-semibold text-xs">
                                      Press #{pressStartHole}
                                      <span className="ml-1 text-muted-foreground">(${(pm.unitAmount / 100).toFixed(2)})</span>
                                    </td>
                                    {Array.from({ length: 9 }, (_, i) => i + 1).map((holeNum) => {
                                      if (holeNum < pressStartHole) {
                                        return <td key={holeNum} className="p-2 text-center text-muted-foreground/30">-</td>;
                                      }
                                      const pressResult = pressResults.find(r => r.holeNumber === holeNum);
                                      if (!pressResult || pressResult.teamAScore === null || pressResult.teamBScore === null) {
                                        return <td key={holeNum} className="p-2 text-center">-</td>;
                                      }
                                      const diff = pressResult.cumulativeA - pressResult.cumulativeB;
                                      if (diff > 0) return <td key={holeNum} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                      if (diff < 0) return <td key={holeNum} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                      return <td key={holeNum} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                    })}
                                    <td className="p-2 text-center bg-muted/30"></td>
                                    {Array.from({ length: 9 }, (_, i) => i + 10).map((holeNum) => {
                                      if (holeNum < pressStartHole) {
                                        return <td key={holeNum} className="p-2 text-center text-muted-foreground/30">-</td>;
                                      }
                                      const pressResult = pressResults.find(r => r.holeNumber === holeNum);
                                      if (!pressResult || pressResult.teamAScore === null || pressResult.teamBScore === null) {
                                        return <td key={holeNum} className="p-2 text-center">-</td>;
                                      }
                                      const diff = pressResult.cumulativeA - pressResult.cumulativeB;
                                      if (diff > 0) return <td key={holeNum} className="p-2 text-center font-bold text-primary text-xs">{diff} UP</td>;
                                      if (diff < 0) return <td key={holeNum} className="p-2 text-center font-bold text-accent text-xs">{Math.abs(diff)} UP</td>;
                                      return <td key={holeNum} className="p-2 text-center text-muted-foreground text-xs">AS</td>;
                                    })}
                                    <td className="p-2 text-center bg-muted/30"></td>
                                    {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball') && !em.parentMatchId && (
                                      <td className="p-2 text-center">
                                        <Checkbox
                                          id={`autopress-press-${pm.id}`}
                                          checked={pm.autoPressOriginal ?? true}
                                          onCheckedChange={(checked) => {
                                            updateAutoPress.mutate({ 
                                              eventMatchId: pm.id, 
                                              autoPressOriginal: checked === true 
                                            });
                                          }}
                                          disabled={updateAutoPress.isPending}
                                          data-testid={`checkbox-autopress-${pm.id}`}
                                        />
                                      </td>
                                    )}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Running Status */}
                        <div className="flex justify-between items-center pt-2 border-t border-border">
                          <div className="text-sm">
                            {em.matchType === 'stroke_play' ? (
                              <>
                                <span className="font-medium">Total Strokes: </span>
                                <span className="text-primary font-bold">{teamA?.name}: {results[results.length - 1]?.cumulativeA ?? 0}</span>
                                <span className="mx-2">|</span>
                                <span className="text-accent font-bold">{teamB?.name}: {results[results.length - 1]?.cumulativeB ?? 0}</span>
                              </>
                            ) : (
                              <>
                                <span className="font-medium">Total Holes Won: </span>
                                <span className="text-primary font-bold">{teamA?.name}: {results.filter(r => r.winner === 'A').length}</span>
                                <span className="mx-2">|</span>
                                <span className="text-accent font-bold">{teamB?.name}: {results.filter(r => r.winner === 'B').length}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {(em.matchType === 'match_play_1_ball' || em.matchType === 'match_play_2_ball') && !em.parentMatchId && isCreator && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setPressDialogMatch(em.id);
                                  setPressStartHole(2);
                                }}
                                data-testid={`button-add-press-${em.id}`}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Press
                              </Button>
                            )}
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
                        </div>

                        {/* Press Dialog */}
                        {pressDialogMatch === em.id && (
                          <div className="pt-3 border-t border-border">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium">Start press on hole:</span>
                              <Select
                                value={pressStartHole.toString()}
                                onValueChange={(val) => setPressStartHole(parseInt(val))}
                              >
                                <SelectTrigger className="w-20" data-testid="select-press-hole">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 16 }, (_, i) => i + 2).map((hole) => (
                                    <SelectItem key={hole} value={hole.toString()}>
                                      {hole}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                onClick={() => {
                                  createPress.mutate({ eventMatchId: em.id, startHole: pressStartHole });
                                  setPressDialogMatch(null);
                                }}
                                disabled={createPress.isPending}
                                data-testid="button-confirm-press"
                              >
                                {createPress.isPending ? "Creating..." : "Create Press"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPressDialogMatch(null)}
                                data-testid="button-cancel-press"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Wager Summary - Combined for parent + all presses */}
                        {em.unitAmount > 0 && (() => {
                          const combined = calculateCombinedMatchSettlements(em, pressMatches, scores);
                          return (
                            <div className="pt-3 border-t border-border">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-semibold text-sm flex items-center gap-2">
                                  Wager Summary
                                  <span className="text-xs text-muted-foreground">
                                    ({combined.totalMatches} {combined.totalMatches === 1 ? 'match' : 'matches'} - ${combined.totalPot.toFixed(2)} total pot)
                                  </span>
                                </h5>
                                {combined.completedCount > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                    {combined.completedCount}/{combined.totalMatches} complete
                                  </span>
                                )}
                              </div>
                              
                              {combined.completedCount === 0 ? (
                                <p className="text-xs text-muted-foreground">Matches in progress</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {combined.playerTotals.map((p) => (
                                    <div 
                                      key={p.playerId}
                                      className={`flex justify-between items-center px-3 py-1.5 rounded-lg text-sm ${
                                        p.amount > 0 
                                          ? 'bg-primary/10 text-primary' 
                                          : p.amount < 0
                                          ? 'bg-destructive/10 text-destructive'
                                          : 'bg-muted text-muted-foreground'
                                      }`}
                                      data-testid={`wager-summary-${p.playerId}`}
                                    >
                                      <span className="font-medium">{p.playerName}</span>
                                      <span className="font-bold">
                                        {p.amount > 0 ? '+' : ''}${p.amount.toFixed(2)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        </>
                        )}

                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        );
        })()}
      </div>

      {/* Player Ledger */}
      {eventMatches.length > 0 && (() => {
        const { entries, balances } = calculateLedger(eventMatches, scores);
        const hasCompletedMatches = entries.some(e => e.isComplete);
        
        if (!hasCompletedMatches) return null;
        
        return (
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-border/50">
            <button
              onClick={() => setLedgerCollapsed(!ledgerCollapsed)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity w-full"
              data-testid="button-toggle-ledger"
            >
              <h3 className="font-display font-bold text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-accent" />
                Betting Ledger
              </h3>
              {ledgerCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            
            {!ledgerCollapsed && (
            <div className="grid md:grid-cols-[auto_1fr] gap-6 mt-4">
              {/* Player Balances */}
              <div className="min-w-fit">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Player Standings</h4>
                  {selectedStandingsPlayer !== null && (
                    <button
                      onClick={() => setSelectedStandingsPlayer(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-standings-filter"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {balances.map((b) => (
                    <button 
                      key={b.playerId}
                      onClick={() => setSelectedStandingsPlayer(selectedStandingsPlayer === b.playerId ? null : b.playerId)}
                      className={`w-full flex justify-between items-center gap-4 px-4 py-3 rounded-lg whitespace-nowrap transition-all ${
                        selectedStandingsPlayer === b.playerId
                          ? 'ring-2 ring-primary ring-offset-2'
                          : ''
                      } ${
                        b.netBalance > 0 
                          ? 'bg-primary/10 border border-primary/20' 
                          : b.netBalance < 0 
                          ? 'bg-destructive/10 border border-destructive/20'
                          : 'bg-muted'
                      }`}
                      data-testid={`ledger-balance-${b.playerId}`}
                    >
                      <div className="whitespace-nowrap text-left">
                        <span className="font-semibold">{b.playerName}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({b.matchesPlayed} {b.matchesPlayed === 1 ? 'match' : 'matches'})
                        </span>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <span className={`font-bold text-lg ${
                          b.netBalance > 0 ? 'text-primary' : b.netBalance < 0 ? 'text-destructive' : ''
                        }`}>
                          {b.netBalance > 0 ? '+' : ''}${b.netBalance.toFixed(2)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          W: ${b.totalWon.toFixed(2)} / L: ${b.totalLost.toFixed(2)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Individual Bets */}
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                  Match Results
                  {selectedStandingsPlayer !== null && (
                    <span className="ml-2 text-xs text-primary font-normal">
                      (filtered by {balances.find(b => b.playerId === selectedStandingsPlayer)?.playerName})
                    </span>
                  )}
                </h4>
                <div className="space-y-2">
                  {(() => {
                    const completedMatchIds = Array.from(new Set(entries.filter(e => e.isComplete).map(e => e.matchId)));
                    const filteredMatchIds = selectedStandingsPlayer !== null
                      ? completedMatchIds.filter(matchId => {
                          const matchEntries = entries.filter(e => e.matchId === matchId);
                          return matchEntries.some(e => e.playerId === selectedStandingsPlayer);
                        })
                      : completedMatchIds;
                    
                    if (filteredMatchIds.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground">
                          No match results for selected player.
                        </p>
                      );
                    }
                    
                    return filteredMatchIds.map((matchId) => {
                      const matchEntries = entries.filter(e => e.matchId === matchId);
                      const eventMatch = eventMatches.find(em => em.id === matchId);
                      const teamA = eventMatch?.teams[0];
                      const teamB = eventMatch?.teams[1];
                      const matchType = eventMatch?.matchType ? (MATCH_TYPE_LABELS[eventMatch.matchType as MatchType] || eventMatch.matchType) : '';
                      const matchTitle = teamA && teamB 
                        ? `${teamA.name} vs ${teamB.name}${matchType ? ` - ${matchType}` : ''}`
                        : matchEntries[0]?.matchName || 'Match';
                      
                      return (
                        <div key={matchId} className="bg-muted/50 rounded-lg p-3" data-testid={`ledger-match-${matchId}`}>
                          <div className="text-sm font-semibold mb-2">{matchTitle}</div>
                          <div className="grid grid-cols-2 gap-1">
                            {matchEntries.map((e) => (
                              <div 
                                key={e.playerId}
                                className={`flex justify-between text-xs px-2 py-1 rounded ${
                                  selectedStandingsPlayer === e.playerId ? 'ring-1 ring-primary' : ''
                                } ${
                                  e.amount > 0 
                                    ? 'text-primary bg-primary/5' 
                                    : e.amount < 0 
                                    ? 'text-destructive bg-destructive/5'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                <span>{e.playerName}</span>
                                <span className="font-medium">
                                  {e.amount > 0 ? '+' : ''}{e.amount === 0 ? 'Push' : `$${e.amount.toFixed(2)}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
            )}
          </div>
        );
      })()}

      {/* Scorecard Table */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Scorecard</h2>
        <div className="flex items-center gap-2">
          <Link href={`/match/${matchId}/scores?scan=true`}>
            <Button variant="outline" size="icon" data-testid="button-scan-scorecard">
              <Camera className="w-4 h-4" />
            </Button>
          </Link>
          <Link href={`/match/${matchId}/scores`}>
            <Button variant="outline" size="sm" data-testid="button-quick-score-entry">
              Quick Score Entry
            </Button>
          </Link>
        </div>
      </div>
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
            {/* Par Row */}
            {matchCourse && (
              <tr className="bg-muted/30 text-xs">
                <td className="p-2 text-left font-medium sticky left-0 bg-muted/30 backdrop-blur z-10 text-muted-foreground">Par</td>
                {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                  <td key={hole} className="p-2 text-center font-medium text-muted-foreground">{getHolePar(hole)}</td>
                ))}
                <td className="p-2 text-center font-bold text-muted-foreground bg-primary/5">{matchCourse.totalPar}</td>
              </tr>
            )}
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
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={2}
                            value={editValue}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '');
                              setEditValue(val);
                              if (val.length === 1 && parseInt(val) >= 1 && parseInt(val) <= 9) {
                                const strokes = parseInt(val);
                                submitScore.mutate({ playerId: p.id, holeNumber: hole, strokes });
                                if (hole < 18) {
                                  setEditingCell({ playerId: p.id, hole: hole + 1 });
                                  setEditValue(getScore(p.id, hole + 1)?.toString() || "");
                                } else {
                                  setEditingCell(null);
                                }
                              }
                            }}
                            onBlur={() => handleScoreSubmit(p.id, hole)}
                            onKeyDown={(e) => handleKeyDown(e, p.id, hole)}
                            className="w-10 h-8 text-center border border-primary rounded focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono [appearance:textfield]"
                            data-testid={`input-score-${p.id}-${hole}`}
                          />
                        ) : (
                          <div 
                            className={`
                              inline-block rounded
                              ${canEdit ? "cursor-pointer hover:bg-primary/10" : ""}
                            `}
                          >
                            <ScoreCell 
                              score={score} 
                              par={getHolePar(hole)} 
                              testId={`score-cell-${p.id}-${hole}`}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-4 text-center font-bold text-lg bg-primary/5">
                    {(() => {
                      const totalScore = getPlayerScore(p.id);
                      const coursePar = matchCourse?.totalPar ?? 72;
                      if (!totalScore) return <span className="text-muted-foreground">-</span>;
                      const diff = totalScore - coursePar;
                      const colorClass = diff < 0 ? "text-red-500" : diff > 0 ? "text-blue-500" : "text-foreground";
                      return <span className={colorClass}>{totalScore}</span>;
                    })()}
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
