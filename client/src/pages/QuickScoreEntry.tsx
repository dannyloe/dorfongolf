import { useMatch, useSubmitScore, useCourses, useScanScorecard, ScannedPlayer, ScannedHole } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation, Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ArrowLeft, Check, EyeOff, Users, GripVertical, Camera, Loader2, AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useToast } from "@/hooks/use-toast";

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

interface SortablePlayerRowProps {
  player: Player;
  score: number | null;
  isEditing: boolean;
  isCurrentUser: boolean;
  canEdit: boolean;
  holePar: number;
  editValue: string;
  inputRef: (el: HTMLInputElement | null) => void;
  onHide: () => void;
  onScoreClick: () => void;
  onScoreChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

function SortablePlayerRow({
  player,
  score,
  isEditing,
  isCurrentUser,
  canEdit,
  holePar,
  editValue,
  inputRef,
  onHide,
  onScoreClick,
  onScoreChange,
  onBlur,
  onKeyDown,
}: SortablePlayerRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  const diff = score !== null ? score - holePar : null;
  const colorClass = diff === null ? "text-muted-foreground" : 
    diff < 0 ? "text-red-500" : diff > 0 ? "text-blue-500" : "text-foreground";
  
  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-4 rounded-lg border ${
        score !== null ? "bg-muted/30 border-border" : "bg-background border-dashed border-muted-foreground/30"
      }`}
      data-testid={`player-row-${player.id}`}
    >
      <div className="flex items-center gap-2">
        <div 
          {...attributes} 
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none p-1"
          data-testid={`drag-handle-${player.id}`}
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
          data-testid={`button-hide-player-${player.id}`}
        >
          <EyeOff className="w-4 h-4" />
        </Button>
        {score !== null && (
          <Check className="w-5 h-5 text-green-500" />
        )}
        <span 
          className={`font-medium ${isCurrentUser ? "text-primary" : "text-foreground"} ${canEdit ? "cursor-pointer" : ""}`}
          onClick={() => canEdit && !isEditing && onScoreClick()}
        >
          {player.name}
        </span>
      </div>
      
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={editValue}
          onChange={(e) => onScoreChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-16 h-12 text-center text-2xl font-bold border-2 border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 [appearance:textfield]"
          data-testid={`input-quick-score-${player.id}`}
        />
      ) : (
        <div 
          className={`w-16 h-12 flex items-center justify-center text-2xl font-bold rounded-lg ${
            score !== null ? colorClass : "text-muted-foreground"
          } ${canEdit ? "hover:bg-primary/10 cursor-pointer" : ""}`}
          onClick={() => canEdit && onScoreClick()}
          data-testid={`score-display-${player.id}`}
        >
          {score ?? "-"}
        </div>
      )}
    </div>
  );
}

export default function QuickScoreEntry() {
  const [, params] = useRoute("/match/:id/scores");
  const [, navigate] = useLocation();
  const matchId = parseInt(params?.id || "0");
  const { data: match, isLoading, error } = useMatch(matchId);
  const { data: coursesList } = useCourses();
  const { user } = useAuth();
  const submitScore = useSubmitScore(matchId);
  const scanScorecard = useScanScorecard();
  const { toast } = useToast();
  
  const [currentHole, setCurrentHole] = useState(1);
  const [editingPlayer, setEditingPlayer] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<Set<number>>(new Set());
  const [playerOrder, setPlayerOrder] = useState<number[]>([]);
  const inputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [showScanModal, setShowScanModal] = useState(false);
  const [scannedScores, setScannedScores] = useState<ScannedPlayer[]>([]);
  const [editableScores, setEditableScores] = useState<Record<string, Record<number, string>>>({});
  const [playerMappings, setPlayerMappings] = useState<Record<string, number | null>>({});
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (editingPlayer !== null && inputRefs.current[editingPlayer]) {
      inputRefs.current[editingPlayer]?.focus();
      inputRefs.current[editingPlayer]?.select();
    }
  }, [editingPlayer]);

  const players: Player[] = match?.players || [];
  
  useEffect(() => {
    if (players.length > 0 && playerOrder.length === 0) {
      setPlayerOrder(players.map(p => p.id));
    }
  }, [players, playerOrder.length]);

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading...</div>;
  if (error || !match) return <div className="p-12 text-center text-destructive">Event not found</div>;

  const scores: Score[] = match.scores || [];
  const isCreator = user?.id === match.creatorId;
  const isPlayer = players.some((p: Player) => p.userId === user?.id);
  
  const orderedPlayers = playerOrder.length > 0 
    ? playerOrder.map(id => players.find(p => p.id === id)).filter((p): p is Player => p !== undefined)
    : players;
  const visiblePlayers = orderedPlayers.filter(p => !hiddenPlayerIds.has(p.id));
  const hiddenPlayers = orderedPlayers.filter(p => hiddenPlayerIds.has(p.id));
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPlayerOrder((items) => {
        const currentOrder = items.length > 0 ? items : players.map(p => p.id);
        const oldIndex = currentOrder.indexOf(active.id as number);
        const newIndex = currentOrder.indexOf(over.id as number);
        return arrayMove(currentOrder, oldIndex, newIndex);
      });
    }
  };
  
  const matchCourse = coursesList?.find(c => c.name === match.courseName);
  const getHolePar = (hole: number) => matchCourse?.holes.find(h => h.holeNumber === hole)?.par ?? 4;
  
  const getScore = (playerId: number, hole: number): number | null => {
    const score = scores.find((s: Score) => s.playerId === playerId && s.holeNumber === hole);
    return score ? score.strokes : null;
  };

  const hidePlayer = (playerId: number) => {
    setHiddenPlayerIds(prev => new Set(Array.from(prev).concat(playerId)));
  };

  const showPlayer = (playerId: number) => {
    setHiddenPlayerIds(prev => {
      const next = new Set(prev);
      next.delete(playerId);
      return next;
    });
  };

  const handleScoreClick = (playerId: number) => {
    if (!isCreator && !isPlayer) return;
    const currentScore = getScore(playerId, currentHole);
    setEditingPlayer(playerId);
    setEditValue(currentScore?.toString() || "");
  };

  const handleScoreChange = (playerId: number, value: string) => {
    const val = value.replace(/\D/g, '');
    setEditValue(val);
    
    if (val.length === 1 && parseInt(val) >= 1 && parseInt(val) <= 9) {
      const strokes = parseInt(val);
      submitScore.mutate({ playerId, holeNumber: currentHole, strokes });
      
      const playerIndex = visiblePlayers.findIndex(p => p.id === playerId);
      if (playerIndex < visiblePlayers.length - 1) {
        const nextPlayer = visiblePlayers[playerIndex + 1];
        setEditingPlayer(nextPlayer.id);
        setEditValue(getScore(nextPlayer.id, currentHole)?.toString() || "");
      } else {
        setEditingPlayer(null);
        if (currentHole < 18) {
          setTimeout(() => setCurrentHole(currentHole + 1), 300);
        }
      }
    }
  };

  const handleBlur = (playerId: number) => {
    if (editValue && parseInt(editValue) > 0) {
      submitScore.mutate({ playerId, holeNumber: currentHole, strokes: parseInt(editValue) });
    }
    setEditingPlayer(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, playerId: number) => {
    if (e.key === 'Enter') {
      if (editValue && parseInt(editValue) > 0) {
        submitScore.mutate({ playerId, holeNumber: currentHole, strokes: parseInt(editValue) });
      }
      const playerIndex = visiblePlayers.findIndex(p => p.id === playerId);
      if (playerIndex < visiblePlayers.length - 1) {
        const nextPlayer = visiblePlayers[playerIndex + 1];
        setEditingPlayer(nextPlayer.id);
        setEditValue(getScore(nextPlayer.id, currentHole)?.toString() || "");
      } else {
        setEditingPlayer(null);
      }
    } else if (e.key === 'Escape') {
      setEditingPlayer(null);
    }
  };

  const allPlayersHaveScore = visiblePlayers.every(p => getScore(p.id, currentHole) !== null);
  const holePar = getHolePar(currentHole);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      
      try {
        const result = await scanScorecard.mutateAsync({
          imageBase64: base64,
          playerNames: players.map(p => p.name),
          courseName: match.courseName,
        });
        
        if (result.success && result.scores.length > 0) {
          setScannedScores(result.scores);
          const editable: Record<string, Record<number, string>> = {};
          const mappings: Record<string, number | null> = {};
          result.scores.forEach(ps => {
            editable[ps.playerName] = {};
            ps.holes.forEach(h => {
              if (h.holeNumber >= 1 && h.holeNumber <= 18) {
                editable[ps.playerName][h.holeNumber] = h.strokes?.toString() || '';
              }
            });
            const matchedPlayer = players.find(p => 
              p.name.toLowerCase() === ps.playerName.toLowerCase()
            );
            mappings[ps.playerName] = matchedPlayer?.id || null;
          });
          setEditableScores(editable);
          setPlayerMappings(mappings);
          setShowScanModal(true);
        } else {
          toast({
            variant: "destructive",
            title: "Scan Failed",
            description: "Could not extract scores from the image. Please try a clearer photo.",
          });
        }
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Scan Error",
          description: err instanceof Error ? err.message : "Failed to process scorecard",
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleConfirmScores = async () => {
    let successCount = 0;
    let errorCount = 0;
    
    for (const scannedName of Object.keys(editableScores)) {
      const playerId = playerMappings[scannedName];
      if (!playerId) continue;
      
      for (const [holeStr, strokesStr] of Object.entries(editableScores[scannedName])) {
        const holeNumber = parseInt(holeStr);
        const strokes = parseInt(strokesStr);
        
        if (!isNaN(strokes) && strokes > 0 && holeNumber >= 1 && holeNumber <= 18) {
          try {
            await submitScore.mutateAsync({ playerId, holeNumber, strokes });
            successCount++;
          } catch {
            errorCount++;
          }
        }
      }
    }
    
    setShowScanModal(false);
    setScannedScores([]);
    setEditableScores({});
    setPlayerMappings({});
    
    if (successCount > 0) {
      toast({
        title: "Scores Saved",
        description: `${successCount} score${successCount !== 1 ? 's' : ''} saved successfully.`,
      });
    }
    if (errorCount > 0) {
      toast({
        variant: "destructive",
        title: "Some Errors",
        description: `${errorCount} score${errorCount !== 1 ? 's' : ''} failed to save.`,
      });
    }
  };
  
  const calculateTotals = (scannedName: string) => {
    const scores = editableScores[scannedName] || {};
    let front9 = 0;
    let back9 = 0;
    let front9Count = 0;
    let back9Count = 0;
    
    for (let hole = 1; hole <= 9; hole++) {
      const val = parseInt(scores[hole] || '');
      if (!isNaN(val) && val > 0) {
        front9 += val;
        front9Count++;
      }
    }
    for (let hole = 10; hole <= 18; hole++) {
      const val = parseInt(scores[hole] || '');
      if (!isNaN(val) && val > 0) {
        back9 += val;
        back9Count++;
      }
    }
    
    return {
      front9: front9Count === 9 ? front9 : null,
      back9: back9Count === 9 ? back9 : null,
      total: front9Count === 9 && back9Count === 9 ? front9 + back9 : null,
    };
  };
  
  const getUsedPlayerIds = () => {
    return new Set(Object.values(playerMappings).filter((id): id is number => id !== null));
  };

  const getConfidenceIcon = (confidence?: 'high' | 'medium' | 'low') => {
    switch (confidence) {
      case 'high': return <CheckCircle2 className="w-3 h-3 text-green-500" />;
      case 'medium': return <AlertCircle className="w-3 h-3 text-yellow-500" />;
      case 'low': return <AlertCircle className="w-3 h-3 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href={`/match/${matchId}`}>
            <Button variant="ghost" size="icon" data-testid="button-back-to-match">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{match.name}</h1>
            <p className="text-sm text-muted-foreground">{match.courseName}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
            data-testid="input-scorecard-file"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={scanScorecard.isPending}
            data-testid="button-scan-scorecard"
          >
            {scanScorecard.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
          </Button>
        
          {hiddenPlayers.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-show-hidden-players">
                <Users className="w-4 h-4 mr-2" />
                {hiddenPlayers.length} Hidden
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <div className="text-sm font-medium mb-2 text-muted-foreground">Hidden Players</div>
              <div className="space-y-1">
                {hiddenPlayers.map(p => (
                  <Button
                    key={p.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => showPlayer(p.id)}
                    data-testid={`button-show-player-${p.id}`}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          )}
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentHole(Math.max(1, currentHole - 1))}
              disabled={currentHole === 1}
              data-testid="button-prev-hole"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            
            <div className="text-center">
              <CardTitle className="text-4xl font-bold text-primary">Hole {currentHole}</CardTitle>
              <p className="text-lg text-muted-foreground">Par {holePar}</p>
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentHole(Math.min(18, currentHole + 1))}
              disabled={currentHole === 18}
              data-testid="button-next-hole"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pt-4 space-y-3">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visiblePlayers.map(p => p.id)} strategy={verticalListSortingStrategy}>
              {visiblePlayers.map((player) => {
                const score = getScore(player.id, currentHole);
                const isEditing = editingPlayer === player.id;
                const isCurrentUser = player.userId === user?.id;
                const canEdit = isCreator || isCurrentUser;
                
                return (
                  <SortablePlayerRow
                    key={player.id}
                    player={player}
                    score={score}
                    isEditing={isEditing}
                    isCurrentUser={isCurrentUser}
                    canEdit={canEdit}
                    holePar={holePar}
                    editValue={editValue}
                    inputRef={(el) => { inputRefs.current[player.id] = el; }}
                    onHide={() => hidePlayer(player.id)}
                    onScoreClick={() => handleScoreClick(player.id)}
                    onScoreChange={(value) => handleScoreChange(player.id, value)}
                    onBlur={() => handleBlur(player.id)}
                    onKeyDown={(e) => handleKeyDown(e, player.id)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-4">
        {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
          const allHaveScore = visiblePlayers.every(p => getScore(p.id, hole) !== null);
          return (
            <Button
              key={hole}
              variant={hole === currentHole ? "default" : allHaveScore ? "secondary" : "outline"}
              size="sm"
              className={`min-w-10 ${hole === currentHole ? "" : allHaveScore ? "opacity-70" : ""}`}
              onClick={() => setCurrentHole(hole)}
              data-testid={`button-hole-${hole}`}
            >
              {hole}
            </Button>
          );
        })}
      </div>

      {allPlayersHaveScore && currentHole < 18 && (
        <Button 
          className="w-full mt-4" 
          onClick={() => setCurrentHole(currentHole + 1)}
          data-testid="button-continue-next-hole"
        >
          Continue to Hole {currentHole + 1}
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      )}

      <Dialog open={showScanModal} onOpenChange={setShowScanModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Review Scanned Scores</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {scannedScores.map((playerScore) => {
              const mappedPlayerId = playerMappings[playerScore.playerName];
              const mappedPlayer = mappedPlayerId ? players.find(p => p.id === mappedPlayerId) : null;
              const usedPlayerIds = getUsedPlayerIds();
              const totals = calculateTotals(playerScore.playerName);
              
              return (
                <div key={playerScore.playerName} className="space-y-3 p-3 border rounded-lg">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Scanned:</span>
                      <span className="font-semibold text-foreground">{playerScore.playerName}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Assign to:</span>
                      <Select
                        value={mappedPlayerId?.toString() || "unassigned"}
                        onValueChange={(val) => {
                          setPlayerMappings(prev => ({
                            ...prev,
                            [playerScore.playerName]: val === "unassigned" ? null : parseInt(val)
                          }));
                        }}
                      >
                        <SelectTrigger className="w-40" data-testid={`select-player-${playerScore.playerName}`}>
                          <SelectValue placeholder="Select player" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">-- Skip --</SelectItem>
                          {players.map(p => (
                            <SelectItem 
                              key={p.id} 
                              value={p.id.toString()}
                              disabled={usedPlayerIds.has(p.id) && p.id !== mappedPlayerId}
                            >
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {mappedPlayer && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-10 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(hole => {
                      const holeData = playerScore.holes.find(h => h.holeNumber === hole);
                      const value = editableScores[playerScore.playerName]?.[hole] || '';
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
                                setEditableScores(prev => ({
                                  ...prev,
                                  [playerScore.playerName]: {
                                    ...prev[playerScore.playerName],
                                    [hole]: val
                                  }
                                }));
                              }}
                              className="w-full h-8 text-center text-sm font-medium border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                              data-testid={`input-scan-${playerScore.playerName}-${hole}`}
                            />
                            <div className="absolute -top-1 -right-1">
                              {getConfidenceIcon(holeData?.confidence)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">OUT</div>
                      <div className="h-8 flex items-center justify-center text-sm font-bold bg-muted rounded">
                        {totals.front9 ?? '-'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-10 gap-1">
                    {[10, 11, 12, 13, 14, 15, 16, 17, 18].map(hole => {
                      const holeData = playerScore.holes.find(h => h.holeNumber === hole);
                      const value = editableScores[playerScore.playerName]?.[hole] || '';
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
                                setEditableScores(prev => ({
                                  ...prev,
                                  [playerScore.playerName]: {
                                    ...prev[playerScore.playerName],
                                    [hole]: val
                                  }
                                }));
                              }}
                              className="w-full h-8 text-center text-sm font-medium border rounded focus:outline-none focus:ring-2 focus:ring-primary/50"
                              data-testid={`input-scan-${playerScore.playerName}-${hole}`}
                            />
                            <div className="absolute -top-1 -right-1">
                              {getConfidenceIcon(holeData?.confidence)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">IN</div>
                      <div className="h-8 flex items-center justify-center text-sm font-bold bg-muted rounded">
                        {totals.back9 ?? '-'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">TOTAL</div>
                      <div className="h-8 w-12 flex items-center justify-center text-sm font-bold bg-primary/10 text-primary rounded">
                        {totals.total ?? '-'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span>High confidence</span>
            <AlertCircle className="w-4 h-4 text-yellow-500 ml-2" />
            <span>Medium confidence</span>
            <AlertCircle className="w-4 h-4 text-red-500 ml-2" />
            <span>Low confidence</span>
          </div>
          
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowScanModal(false);
                setScannedScores([]);
                setEditableScores({});
                setPlayerMappings({});
              }}
              data-testid="button-cancel-scan"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmScores}
              disabled={Object.values(playerMappings).every(id => id === null)}
              data-testid="button-confirm-scanned-scores"
            >
              Save Scores
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
