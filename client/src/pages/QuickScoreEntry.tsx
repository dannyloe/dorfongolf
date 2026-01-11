import { useMatch, useSubmitScore, useCourses } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useRoute, useLocation, Link } from "wouter";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ArrowLeft, Check, EyeOff, Users, GripVertical } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  
  const [currentHole, setCurrentHole] = useState(1);
  const [editingPlayer, setEditingPlayer] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<Set<number>>(new Set());
  const [playerOrder, setPlayerOrder] = useState<number[]>([]);
  const inputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  
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
    </div>
  );
}
