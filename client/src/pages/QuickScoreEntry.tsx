import { useMatch, useSubmitScore, useSubmitScoresBulk, useCourses, useScanScorecard, ScannedPlayer, ScannedHole, useAddPlayer } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useVoiceInput, VoiceCommand } from "@/hooks/use-voice-input";
import { resolvePlayerAlias, PRESET_PLAYERS } from "@shared/models/auth";
import { queryClient } from "@/lib/queryClient";
import { useRoute, useLocation, Link } from "wouter";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, ArrowLeft, Check, EyeOff, Users, GripVertical, Camera, Loader2, AlertCircle, CheckCircle2, ChevronDown, Mic, MicOff, UserPlus } from "lucide-react";
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
  const submitScoresBulk = useSubmitScoresBulk(matchId);
  const scanScorecard = useScanScorecard();
  const addPlayer = useAddPlayer(matchId);
  const { toast } = useToast();
  
  const [currentHole, setCurrentHole] = useState(1);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [hiddenPlayerIds, setHiddenPlayerIds] = useState<Set<number>>(new Set());
  const [playerOrder, setPlayerOrder] = useState<number[]>([]);
  const inputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const [showScanModal, setShowScanModal] = useState(false);
  const [inFlightSaves, setInFlightSaves] = useState(0);
  const [scannedScores, setScannedScores] = useState<ScannedPlayer[]>([]);
  const [editableScores, setEditableScores] = useState<Record<string, Record<number, string>>>({});
  const [playerMappings, setPlayerMappings] = useState<Record<string, number | null>>({});
  const [suggestedPresets, setSuggestedPresets] = useState<Record<string, string | null>>({});
  const [scanInProgress, setScanInProgress] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const lastScanFileRef = useRef<File | null>(null);
  
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
  
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('scan') === 'true' && fileInputRef.current) {
      setTimeout(() => fileInputRef.current?.click(), 100);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const playerNames = useMemo(() => players.map(p => p.name), [players]);
  
  const handleVoiceCommand = useCallback((command: VoiceCommand) => {
    if (command.type === "score" && command.score !== undefined) {
      let targetPlayerId: number | undefined;
      
      if (command.playerName) {
        const matchedPlayer = players.find(p => 
          p.name.toLowerCase().includes(command.playerName!.toLowerCase()) ||
          command.playerName!.toLowerCase().includes(p.name.split(/[\s\/]/)[0].toLowerCase())
        );
        targetPlayerId = matchedPlayer?.id;
      }
      
      if (!targetPlayerId && players.length > 0) {
        targetPlayerId = players[0].id;
      }
      
      if (targetPlayerId) {
        let actualScore = command.score;
        if (command.score <= 0) {
          const holePar = coursesList?.find(c => c.name === match?.courseName)?.holes.find(h => h.holeNumber === currentHole)?.par ?? 4;
          actualScore = holePar + command.score;
        }
        
        if (actualScore >= 1 && actualScore <= 15) {
          const targetHole = command.hole || currentHole;
          submitScore.mutate({ playerId: targetPlayerId, holeNumber: targetHole, strokes: actualScore });
          
          const playerName = players.find(p => p.id === targetPlayerId)?.name || "Player";
          setVoiceFeedback(`${playerName}: ${actualScore} on hole ${targetHole}`);
          setTimeout(() => setVoiceFeedback(null), 3000);
          
          toast({
            title: "Score Recorded",
            description: `${playerName} scored ${actualScore} on hole ${targetHole}`,
          });
        }
      }
    }
  }, [players, currentHole, coursesList, match?.courseName, submitScore, toast]);

  const { 
    isListening, 
    isSupported: voiceSupported, 
    transcript, 
    error: voiceError,
    toggleListening 
  } = useVoiceInput({
    onCommand: handleVoiceCommand,
    playerNames,
    continuous: false,
  });

  useEffect(() => {
    if (voiceError) {
      toast({
        variant: "destructive",
        title: "Voice Error",
        description: voiceError,
      });
    }
  }, [voiceError, toast]);

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

  // Downscale + recompress the chosen image in the browser before upload so we
  // don't ship a 4-6 MB base64 blob over the wire. Targets ~1600 px on the
  // long edge as JPEG q=0.82, which keeps scorecards plenty legible to Gemini
  // while typically dropping payload size by 5-10x.
  const compressImage = async (file: File, maxEdge = 1600, quality = 0.82): Promise<string> => {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error('Failed to read image'));
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(file);
    });
    try {
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('Failed to decode image'));
        i.src = dataUrl;
      });
      const longEdge = Math.max(img.width, img.height);
      const scale = longEdge > maxEdge ? maxEdge / longEdge : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL('image/jpeg', quality);
      // Only use the compressed version if it's actually smaller.
      return out.length < dataUrl.length ? out : dataUrl;
    } catch {
      return dataUrl;
    }
  };

  const runScan = async (file: File) => {
    setScanError(null);
    setScanInProgress(true);
    setShowScanModal(true);
    setScannedScores([]);
    setEditableScores({});
    setPlayerMappings({});
    setSuggestedPresets({});

    try {
      const base64 = await compressImage(file);
      const result = await scanScorecard.mutateAsync({
        imageBase64: base64,
        playerNames: players.map(p => p.name),
        courseName: match.courseName,
      });

      if (result.success && result.scores.length > 0) {
        setScannedScores(result.scores);
        const editable: Record<string, Record<number, string>> = {};
        const mappings: Record<string, number | null> = {};
        const presets: Record<string, string | null> = {};

        result.scores.forEach(ps => {
          editable[ps.playerName] = {};
          ps.holes.forEach(h => {
            if (h.holeNumber >= 1 && h.holeNumber <= 18) {
              editable[ps.playerName][h.holeNumber] = h.strokes?.toString() || '';
            }
          });
          const resolvedName = resolvePlayerAlias(ps.playerName);
          const matchedPlayer = players.find(p =>
            p.name.toLowerCase() === ps.playerName.toLowerCase() ||
            p.name.toLowerCase() === resolvedName.toLowerCase()
          );
          mappings[ps.playerName] = matchedPlayer?.id || null;

          if (!matchedPlayer) {
            const presetMatch = PRESET_PLAYERS.find(preset =>
              preset.toLowerCase() === ps.playerName.toLowerCase() ||
              preset.toLowerCase() === resolvedName.toLowerCase()
            );
            presets[ps.playerName] = presetMatch || null;
          } else {
            presets[ps.playerName] = null;
          }
        });
        setEditableScores(editable);
        setPlayerMappings(mappings);
        setSuggestedPresets(presets);
      } else {
        setScanError("Could not extract scores from the image. Please try a clearer photo.");
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Failed to process scorecard");
    } finally {
      setScanInProgress(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    lastScanFileRef.current = file;
    e.target.value = '';
    void runScan(file);
  };

  // Runs the player-add + bulk-score-save in the background using a snapshot
  // of the scan state captured at click time. The modal is closed before this
  // runs, so it must not read any live React state.
  const runScorecardSave = async (snapshot: {
    playerMappings: Record<string, number | null>;
    suggestedPresets: Record<string, string | null>;
    editableScores: Record<string, Record<number, string>>;
  }) => {
    let successCount = 0;
    let errorCount = 0;
    let addedPlayerCount = 0;
    const addPlayerErrors: string[] = [];

    const updatedMappings = { ...snapshot.playerMappings };
    const addedPresets = new Set<string>();

    for (const [scannedName, presetName] of Object.entries(snapshot.suggestedPresets)) {
      if (presetName && !updatedMappings[scannedName] && !addedPresets.has(presetName)) {
        try {
          const newPlayer = await addPlayer.mutateAsync({ name: presetName });
          updatedMappings[scannedName] = newPlayer.id;
          addedPresets.add(presetName);
          addedPlayerCount++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          addPlayerErrors.push(`Failed to add ${presetName}: ${errMsg}`);
        }
      } else if (presetName && addedPresets.has(presetName)) {
        for (const [otherName, id] of Object.entries(updatedMappings)) {
          if (snapshot.suggestedPresets[otherName] === presetName && id !== null) {
            updatedMappings[scannedName] = id;
            break;
          }
        }
      }
    }

    if (addPlayerErrors.length > 0) {
      toast({
        variant: "destructive",
        title: "Player Addition Errors",
        description: addPlayerErrors.join("; "),
      });
    }

    const bulkEntries: { playerId: number; holeNumber: number; strokes: number }[] = [];
    for (const scannedName of Object.keys(snapshot.editableScores)) {
      const playerId = updatedMappings[scannedName];
      if (!playerId) continue;

      for (const [holeStr, strokesStr] of Object.entries(snapshot.editableScores[scannedName])) {
        const holeNumber = parseInt(holeStr);
        const strokes = parseInt(strokesStr);

        if (!isNaN(strokes) && strokes > 0 && holeNumber >= 1 && holeNumber <= 18) {
          bulkEntries.push({ playerId, holeNumber, strokes });
        }
      }
    }

    if (bulkEntries.length > 0) {
      try {
        const result = await submitScoresBulk.mutateAsync(bulkEntries);
        successCount += result.count;
      } catch {
        errorCount += bulkEntries.length;
      }
    }

    if (addedPlayerCount > 0 || successCount > 0) {
      const parts = [];
      if (addedPlayerCount > 0) {
        parts.push(`${addedPlayerCount} player${addedPlayerCount !== 1 ? 's' : ''} added`);
      }
      if (successCount > 0) {
        parts.push(`${successCount} score${successCount !== 1 ? 's' : ''} saved`);
      }
      toast({
        title: "Scorecard saved",
        description: parts.join(", ") + ".",
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
  
  const handleConfirmScores = () => {
    // Snapshot the current scan state and reset the modal immediately so the
    // user can take another picture while this scorecard saves in the background.
    const snapshot = {
      playerMappings: { ...playerMappings },
      suggestedPresets: { ...suggestedPresets },
      editableScores: JSON.parse(JSON.stringify(editableScores)) as Record<string, Record<number, string>>,
    };

    setShowScanModal(false);
    setScannedScores([]);
    setEditableScores({});
    setSuggestedPresets({});
    setPlayerMappings({});

    setInFlightSaves(n => n + 1);
    void runScorecardSave(snapshot).finally(() => {
      setInFlightSaves(n => Math.max(0, n - 1));
    });
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
          
          {voiceSupported && (
            <Button
              variant={isListening ? "default" : "outline"}
              size="icon"
              onClick={toggleListening}
              className={isListening ? "bg-red-500 hover:bg-red-600 animate-pulse" : ""}
              data-testid="button-voice-input"
            >
              {isListening ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </Button>
          )}
          
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

          {inFlightSaves > 0 && (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20"
              data-testid="status-scorecard-saves-in-flight"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>
                Saving {inFlightSaves} scorecard{inFlightSaves !== 1 ? "s" : ""}…
              </span>
            </div>
          )}
        
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

      {(isListening || voiceFeedback || transcript) && (
        <div className={`mb-4 p-3 rounded-lg border ${
          isListening ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800" : "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
        }`}>
          <div className="flex items-center gap-2">
            {isListening ? (
              <>
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Listening... {transcript && `"${transcript}"`}
                </span>
              </>
            ) : voiceFeedback ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                <span className="text-sm font-medium text-green-700 dark:text-green-300">
                  {voiceFeedback}
                </span>
              </>
            ) : null}
          </div>
          {isListening && (
            <p className="text-xs text-muted-foreground mt-1">
              Say: "[Player name] scored [number]" or "birdie", "par", "bogey"
            </p>
          )}
        </div>
      )}

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

      <Dialog open={showScanModal} onOpenChange={(open) => {
        setShowScanModal(open);
        if (!open) {
          setScannedScores([]);
          setEditableScores({});
          setPlayerMappings({});
          setSuggestedPresets({});
          setScanError(null);
          setScanInProgress(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {scanInProgress ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span>Scanning scorecard…</span>
                </>
              ) : scanError ? (
                <>
                  <AlertCircle className="w-4 h-4 text-destructive" />
                  <span>Scan failed</span>
                </>
              ) : (
                <span>Review Scanned Scores</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {scanInProgress && scannedScores.length === 0 && (
            <div className="space-y-3 py-4" data-testid="scan-skeleton">
              <p className="text-sm text-muted-foreground">
                Reading the scorecard. The review will appear here in a few seconds.
              </p>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 p-3 border rounded-lg animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-muted rounded" />
                    <div className="h-8 w-48 bg-muted rounded" />
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {Array.from({ length: 10 }).map((_, k) => (
                      <div key={k} className="h-8 bg-muted rounded" />
                    ))}
                  </div>
                  <div className="grid grid-cols-10 gap-1">
                    {Array.from({ length: 10 }).map((_, k) => (
                      <div key={k} className="h-8 bg-muted rounded" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {scanError && !scanInProgress && (
            <div
              className="my-4 p-4 border border-destructive/40 bg-destructive/5 rounded-lg flex items-start gap-3"
              data-testid="scan-error"
            >
              <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <p className="text-sm text-foreground">{scanError}</p>
                {lastScanFileRef.current && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const f = lastScanFileRef.current;
                      if (f) void runScan(f);
                    }}
                    data-testid="button-retry-scan"
                  >
                    <Camera className="w-3 h-3 mr-1.5" />
                    Try again
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-6">
            {scannedScores.map((playerScore) => {
              const mappedPlayerId = playerMappings[playerScore.playerName];
              const mappedPlayer = mappedPlayerId ? players.find(p => p.id === mappedPlayerId) : null;
              const suggestedPreset = suggestedPresets[playerScore.playerName];
              const usedPlayerIds = getUsedPlayerIds();
              const totals = calculateTotals(playerScore.playerName);
              const willAutoAdd = !mappedPlayerId && suggestedPreset;
              
              return (
                <div key={playerScore.playerName} className={`space-y-3 p-3 border rounded-lg ${willAutoAdd ? 'border-emerald-500 bg-emerald-50/50' : ''}`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Scanned:</span>
                      <span className="font-semibold text-foreground">{playerScore.playerName}</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Assign to:</span>
                      <Select
                        value={
                          mappedPlayerId 
                            ? `id:${mappedPlayerId}` 
                            : suggestedPreset 
                              ? `preset:${suggestedPreset}` 
                              : "unassigned"
                        }
                        onValueChange={(val) => {
                          if (val === "unassigned") {
                            setPlayerMappings(prev => ({ ...prev, [playerScore.playerName]: null }));
                            setSuggestedPresets(prev => ({ ...prev, [playerScore.playerName]: null }));
                          } else if (val.startsWith("id:")) {
                            const playerId = parseInt(val.substring(3));
                            setPlayerMappings(prev => ({ ...prev, [playerScore.playerName]: playerId }));
                            setSuggestedPresets(prev => ({ ...prev, [playerScore.playerName]: null }));
                          } else if (val.startsWith("preset:")) {
                            const presetName = val.substring(7);
                            setPlayerMappings(prev => ({ ...prev, [playerScore.playerName]: null }));
                            setSuggestedPresets(prev => ({ ...prev, [playerScore.playerName]: presetName }));
                          }
                        }}
                      >
                        <SelectTrigger className="w-48" data-testid={`select-player-${playerScore.playerName}`}>
                          <SelectValue placeholder="Select player" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassigned">-- Skip --</SelectItem>
                          {players.length > 0 && (
                            <>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">In Match</div>
                              {players.map(p => (
                                <SelectItem 
                                  key={`id:${p.id}`} 
                                  value={`id:${p.id}`}
                                  disabled={usedPlayerIds.has(p.id) && p.id !== mappedPlayerId}
                                >
                                  {p.name}
                                </SelectItem>
                              ))}
                            </>
                          )}
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Add from Roster</div>
                          {PRESET_PLAYERS
                            .filter(preset => !players.some(p => p.name === preset))
                            .map(preset => {
                              const alreadySelected = Object.entries(suggestedPresets)
                                .some(([name, p]) => p === preset && name !== playerScore.playerName);
                              return (
                                <SelectItem 
                                  key={`preset:${preset}`} 
                                  value={`preset:${preset}`}
                                  disabled={alreadySelected}
                                >
                                  <span className="flex items-center gap-1">
                                    <UserPlus className="w-3 h-3 text-emerald-600" />
                                    {preset}
                                  </span>
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                      {mappedPlayer && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {willAutoAdd && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <UserPlus className="w-4 h-4" />
                        </span>
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
                setSuggestedPresets({});
                setScanError(null);
                setScanInProgress(false);
              }}
              data-testid="button-cancel-scan"
            >
              {scanInProgress || scanError ? "Close" : "Cancel"}
            </Button>
            {!scanInProgress && !scanError && scannedScores.length > 0 && (
              <Button
                onClick={handleConfirmScores}
                disabled={
                  Object.values(playerMappings).every(id => id === null) &&
                  Object.values(suggestedPresets).every(p => p === null)
                }
                data-testid="button-confirm-scanned-scores"
              >
                {Object.values(suggestedPresets).some(p => p !== null)
                  ? "Add Players & Save Scores"
                  : "Save Scores"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
