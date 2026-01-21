import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, ChevronLeft, ChevronRight, Settings, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Course, CourseTee, CourseHole, RyderCupPairing, RyderCupPairingSide } from "@shared/schema";

interface RyderCupPairingScore {
  id: number;
  sideId: number;
  holeNumber: number;
  player1Strokes: number | null;
  player2Strokes: number | null;
}

interface ScorecardData {
  pairing: RyderCupPairing;
  sides: (RyderCupPairingSide & { scores: RyderCupPairingScore[] })[];
  course: Course | null;
  eventId: number | null;
}

export default function RyderCupScorecard() {
  const { pairingId } = useParams<{ pairingId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentHole, setCurrentHole] = useState(1);
  const [editingPlayer, setEditingPlayer] = useState<{ sideIndex: number; playerNumber: 1 | 2 } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [playerSettingsOpen, setPlayerSettingsOpen] = useState<{ sideIndex: number; playerNumber: 1 | 2 } | null>(null);

  const { data: scorecard, isLoading } = useQuery<ScorecardData>({
    queryKey: ["/api/ryder-cup/pairings", pairingId, "scorecard"],
  });

  const { data: courseTees = [] } = useQuery<CourseTee[]>({
    queryKey: ["/api/courses", scorecard?.course?.id, "tees"],
    enabled: !!scorecard?.course?.id,
  });

  const { data: courseHoles = [] } = useQuery<CourseHole[]>({
    queryKey: ["/api/courses", scorecard?.course?.id, "holes"],
    enabled: !!scorecard?.course?.id,
  });

  const updatePlayerMutation = useMutation({
    mutationFn: async ({ sideId, playerNumber, handicapIndex, teeId }: {
      sideId: number;
      playerNumber: 1 | 2;
      handicapIndex?: number | null;
      teeId?: number | null;
    }) => {
      return apiRequest("PATCH", `/api/ryder-cup/sides/${sideId}/player`, {
        playerNumber,
        handicapIndex,
        teeId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup/pairings", pairingId, "scorecard"] });
      toast({ title: "Player settings updated" });
      setPlayerSettingsOpen(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update player settings", variant: "destructive" });
    },
  });

  const saveScoresMutation = useMutation({
    mutationFn: async ({ sideId, scores }: {
      sideId: number;
      scores: { holeNumber: number; player1Strokes: number | null; player2Strokes: number | null }[];
    }) => {
      return apiRequest("POST", `/api/ryder-cup/sides/${sideId}/scores`, { scores });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup/pairings", pairingId, "scorecard"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save score", variant: "destructive" });
    },
  });

  const goBack = () => {
    if (scorecard?.eventId) {
      setLocation(`/ryder-cup/${scorecard.eventId}`);
    } else {
      setLocation("/ryder-cup");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Scorecard not found</p>
        <Button variant="ghost" onClick={() => setLocation("/ryder-cup")} className="mt-4" data-testid="button-back-to-events">
          Back to Events
        </Button>
      </div>
    );
  }

  const { pairing, sides, course } = scorecard;
  const sideA = sides[0];
  const sideB = sides[1];

  const currentHoleData = courseHoles.find(h => h.holeNumber === currentHole);
  const holePar = currentHoleData?.par || 4;
  const holeHandicap = currentHoleData?.handicap ?? currentHole;

  const getPlayerScore = (side: typeof sideA, playerNumber: 1 | 2, holeNumber: number): number | null => {
    if (!side) return null;
    const score = side.scores.find(s => s.holeNumber === holeNumber);
    return playerNumber === 1 ? score?.player1Strokes ?? null : score?.player2Strokes ?? null;
  };

  const getPlayerTee = (side: typeof sideA, playerNumber: 1 | 2): CourseTee | undefined => {
    if (!side) return undefined;
    const teeId = playerNumber === 1 ? side.player1TeeId : side.player2TeeId;
    return courseTees.find(t => t.id === teeId);
  };

  const getPlayerHandicap = (side: typeof sideA, playerNumber: 1 | 2): number | null => {
    if (!side) return null;
    return playerNumber === 1 ? side.player1HandicapIndex : side.player2HandicapIndex;
  };

  const calculateCourseHandicap = (handicapIndex: number | null, tee: CourseTee | undefined): number | null => {
    if (handicapIndex === null || !tee) return null;
    const slopeRating = tee.slopeRating || 113;
    return Math.round(handicapIndex * (slopeRating / 113));
  };

  const handleScoreClick = (sideIndex: number, playerNumber: 1 | 2) => {
    const side = sideIndex === 0 ? sideA : sideB;
    const currentScore = getPlayerScore(side, playerNumber, currentHole);
    setEditValue(currentScore?.toString() || "");
    setEditingPlayer({ sideIndex, playerNumber });
  };

  const handleScoreSubmit = async () => {
    if (!editingPlayer) return;
    const side = editingPlayer.sideIndex === 0 ? sideA : sideB;
    if (!side) return;

    const strokes = editValue ? parseInt(editValue) : null;
    if (editValue && (isNaN(strokes!) || strokes! < 1 || strokes! > 15)) {
      toast({ title: "Invalid score", description: "Enter a number between 1 and 15", variant: "destructive" });
      return;
    }

    const existingScores = side.scores.find(s => s.holeNumber === currentHole);
    const player1Strokes = editingPlayer.playerNumber === 1 ? strokes : (existingScores?.player1Strokes ?? null);
    const player2Strokes = editingPlayer.playerNumber === 2 ? strokes : (existingScores?.player2Strokes ?? null);

    await saveScoresMutation.mutateAsync({
      sideId: side.id,
      scores: [{ holeNumber: currentHole, player1Strokes, player2Strokes }],
    });

    setEditingPlayer(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleScoreSubmit();
    } else if (e.key === "Escape") {
      setEditingPlayer(null);
      setEditValue("");
    }
  };

  const getScoreColor = (score: number | null, par: number): string => {
    if (score === null) return "text-muted-foreground";
    const diff = score - par;
    if (diff <= -2) return "text-yellow-500";
    if (diff === -1) return "text-red-500";
    if (diff === 0) return "text-foreground";
    if (diff === 1) return "text-blue-500";
    return "text-blue-700";
  };

  const getPlayerCourseHandicapOrNull = (side: typeof sideA, playerNumber: 1 | 2): number | null => {
    if (!side) return null;
    const handicapIndex = getPlayerHandicap(side, playerNumber);
    if (handicapIndex === null) return null;
    const tee = getPlayerTee(side, playerNumber);
    if (!tee) return null;
    return calculateCourseHandicap(handicapIndex, tee);
  };

  const getLowHandicap = (): number | null => {
    const handicaps = [
      sideA ? getPlayerCourseHandicapOrNull(sideA, 1) : null,
      sideA?.player2Name ? getPlayerCourseHandicapOrNull(sideA, 2) : null,
      sideB ? getPlayerCourseHandicapOrNull(sideB, 1) : null,
      sideB?.player2Name ? getPlayerCourseHandicapOrNull(sideB, 2) : null,
    ].filter((h): h is number => h !== null);
    if (handicaps.length === 0) return null;
    return Math.min(...handicaps);
  };

  const renderPlayerRow = (side: typeof sideA, sideIndex: number, playerNumber: 1 | 2) => {
    if (!side) return null;
    const playerName = playerNumber === 1 ? side.player1Name : side.player2Name;
    if (!playerName) return null;

    const score = getPlayerScore(side, playerNumber, currentHole);
    const tee = getPlayerTee(side, playerNumber);
    const handicapIndex = getPlayerHandicap(side, playerNumber);
    const courseHandicap = getPlayerCourseHandicapOrNull(side, playerNumber);
    const lowHandicap = getLowHandicap();
    const holeHcp = currentHoleData?.handicap ?? currentHole;
    const strokesOnHole = (courseHandicap !== null && lowHandicap !== null)
      ? getStrokesOnHole(courseHandicap, lowHandicap, holeHcp)
      : 0;
    const isEditing = editingPlayer?.sideIndex === sideIndex && editingPlayer?.playerNumber === playerNumber;

    return (
      <div
        key={`${sideIndex}-${playerNumber}`}
        className="flex items-center justify-between p-3 rounded-lg border bg-background"
        data-testid={`player-row-${sideIndex}-${playerNumber}`}
      >
        <div className="flex items-center gap-2 flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setPlayerSettingsOpen({ sideIndex, playerNumber })}
            data-testid={`button-settings-${sideIndex}-${playerNumber}`}
          >
            <Settings className="w-4 h-4" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-medium" data-testid={`text-player-name-${sideIndex}-${playerNumber}`}>{playerName}</span>
              {strokesOnHole > 0 && (
                <div className="flex items-center gap-0.5" data-testid={`handicap-dots-${sideIndex}-${playerNumber}`}>
                  {Array.from({ length: strokesOnHole }, (_, i) => (
                    <Circle key={i} className="w-3 h-3 fill-primary text-primary" />
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {tee && (
                <Badge variant="outline" className="text-xs py-0" data-testid={`badge-tee-${sideIndex}-${playerNumber}`}>
                  {tee.name}
                </Badge>
              )}
              {courseHandicap !== null && (
                <span data-testid={`text-handicap-${sideIndex}-${playerNumber}`}>HCP: {courseHandicap}</span>
              )}
            </div>
          </div>
        </div>

        <Input
          type="text"
          inputMode={isEditing ? "numeric" : "none"}
          pattern="[0-9]*"
          maxLength={2}
          readOnly={!isEditing}
          value={isEditing ? editValue : (score?.toString() ?? "-")}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={isEditing ? handleScoreSubmit : undefined}
          onKeyDown={isEditing ? handleKeyDown : undefined}
          onClick={() => !isEditing && handleScoreClick(sideIndex, playerNumber)}
          autoFocus={isEditing}
          className={`text-center text-xl font-bold cursor-pointer ${isEditing ? "" : getScoreColor(score, holePar)}`}
          data-testid={isEditing ? `input-score-${sideIndex}-${playerNumber}` : `button-score-${sideIndex}-${playerNumber}`}
        />
      </div>
    );
  };

  const getStrokesOnHole = (courseHandicap: number, lowHandicap: number, holeHcp: number): number => {
    const relativeHandicap = courseHandicap - lowHandicap;
    if (relativeHandicap <= 0) return 0;
    if (relativeHandicap <= 18) {
      return holeHcp <= relativeHandicap ? 1 : 0;
    }
    const baseStrokes = Math.floor(relativeHandicap / 18);
    const remainingStrokes = relativeHandicap % 18;
    return baseStrokes + (holeHcp <= remainingStrokes ? 1 : 0);
  };

  const calculateMatchStatus = () => {
    let aUp = 0;
    const holesPlayed: number[] = [];

    const lowHandicap = getLowHandicap();
    
    for (let hole = 1; hole <= 18; hole++) {
      const holeData = courseHoles.find(h => h.holeNumber === hole);
      const holeHcp = holeData?.handicap || hole;

      const getNetScore = (side: typeof sideA, playerNumber: 1 | 2): number | null => {
        const gross = side ? getPlayerScore(side, playerNumber, hole) : null;
        if (gross === null) return null;
        const courseHcp = getPlayerCourseHandicapOrNull(side, playerNumber);
        if (courseHcp === null || lowHandicap === null) return gross;
        const strokes = getStrokesOnHole(courseHcp, lowHandicap, holeHcp);
        return gross - strokes;
      };

      const aNet1 = getNetScore(sideA, 1);
      const aNet2 = sideA?.player2Name ? getNetScore(sideA, 2) : null;
      const bNet1 = getNetScore(sideB, 1);
      const bNet2 = sideB?.player2Name ? getNetScore(sideB, 2) : null;

      const aNets = [aNet1, aNet2].filter((n): n is number => n !== null);
      const bNets = [bNet1, bNet2].filter((n): n is number => n !== null);

      const aBest = aNets.length > 0 ? Math.min(...aNets) : undefined;
      const bBest = bNets.length > 0 ? Math.min(...bNets) : undefined;

      if (aBest !== undefined && bBest !== undefined) {
        holesPlayed.push(hole);
        if (aBest < bBest) aUp++;
        else if (bBest < aBest) aUp--;
      }
    }

    const thru = holesPlayed.length > 0 ? holesPlayed[holesPlayed.length - 1] : 0;

    if (aUp === 0) return { text: "All Square", thru };
    if (aUp > 0) return { text: `${sideA?.player1Name?.split(" ")[1] || "Team A"} ${aUp} UP`, thru };
    return { text: `${sideB?.player1Name?.split(" ")[1] || "Team B"} ${Math.abs(aUp)} UP`, thru };
  };

  const matchStatus = calculateMatchStatus();

  return (
    <div className="container max-w-lg mx-auto px-4 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={goBack} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold" data-testid="text-match-title">Match {pairing.matchNumber}</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-match-format">{pairing.matchFormat}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1" data-testid="match-header-side-a">
              <div className="font-medium" data-testid="text-header-side-a-player1">{sideA?.player1Name}</div>
              {sideA?.player2Name && <div className="font-medium" data-testid="text-header-side-a-player2">{sideA.player2Name}</div>}
            </div>
            <div className="px-4 text-center">
              <Badge variant="outline" className="text-lg px-3" data-testid="text-match-status">
                {matchStatus.text}
              </Badge>
              {matchStatus.thru > 0 && (
                <div className="text-xs text-muted-foreground mt-1" data-testid="text-match-thru">Thru {matchStatus.thru}</div>
              )}
            </div>
            <div className="text-center flex-1" data-testid="match-header-side-b">
              <div className="font-medium" data-testid="text-header-side-b-player1">{sideB?.player1Name}</div>
              {sideB?.player2Name && <div className="font-medium" data-testid="text-header-side-b-player2">{sideB.player2Name}</div>}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              disabled={currentHole === 1}
              onClick={() => setCurrentHole(h => Math.max(1, h - 1))}
              data-testid="button-prev-hole"
            >
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div className="text-center">
              <div className="text-2xl font-bold" data-testid="text-current-hole">Hole {currentHole}</div>
              <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground" data-testid="text-hole-info">
                <span data-testid="text-hole-par">Par {holePar}</span>
                <span data-testid="text-hole-hcp">HCP {holeHandicap}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={currentHole === 18}
              onClick={() => setCurrentHole(h => Math.min(18, h + 1))}
              data-testid="button-next-hole"
            >
              <ChevronRight className="w-6 h-6" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {sideA && (
            <div className="space-y-1">
              {renderPlayerRow(sideA, 0, 1)}
              {sideA.player2Name && renderPlayerRow(sideA, 0, 2)}
            </div>
          )}
          
          <div className="border-t my-3" />
          
          {sideB && (
            <div className="space-y-1">
              {renderPlayerRow(sideB, 1, 1)}
              {sideB.player2Name && renderPlayerRow(sideB, 1, 2)}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-center gap-1 flex-wrap">
        {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => {
          const hasScores = [
            getPlayerScore(sideA, 1, hole),
            sideA?.player2Name ? getPlayerScore(sideA, 2, hole) : null,
            getPlayerScore(sideB, 1, hole),
            sideB?.player2Name ? getPlayerScore(sideB, 2, hole) : null,
          ].some(s => s !== null);

          return (
            <Button
              key={hole}
              variant={currentHole === hole ? "default" : hasScores ? "secondary" : "outline"}
              size="icon"
              onClick={() => setCurrentHole(hole)}
              data-testid={`button-hole-${hole}`}
            >
              {hole}
            </Button>
          );
        })}
      </div>

      <Dialog open={playerSettingsOpen !== null} onOpenChange={(open) => !open && setPlayerSettingsOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-player-settings">Player Settings</DialogTitle>
          </DialogHeader>
          {playerSettingsOpen && (
            <PlayerSettingsForm
              side={playerSettingsOpen.sideIndex === 0 ? sideA : sideB}
              playerNumber={playerSettingsOpen.playerNumber}
              courseTees={courseTees}
              onSave={(handicapIndex, teeId) => {
                const side = playerSettingsOpen.sideIndex === 0 ? sideA : sideB;
                if (side) {
                  updatePlayerMutation.mutate({
                    sideId: side.id,
                    playerNumber: playerSettingsOpen.playerNumber,
                    handicapIndex,
                    teeId,
                  });
                }
              }}
              isLoading={updatePlayerMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const playerSettingsSchema = z.object({
  teeId: z.string().optional(),
  handicapIndex: z.string().optional(),
});

type PlayerSettingsFormData = z.infer<typeof playerSettingsSchema>;

function PlayerSettingsForm({
  side,
  playerNumber,
  courseTees,
  onSave,
  isLoading,
}: {
  side: RyderCupPairingSide | undefined;
  playerNumber: 1 | 2;
  courseTees: CourseTee[];
  onSave: (handicapIndex: number | null, teeId: number | null) => void;
  isLoading: boolean;
}) {
  const playerName = playerNumber === 1 ? side?.player1Name : side?.player2Name;
  
  const form = useForm<PlayerSettingsFormData>({
    resolver: zodResolver(playerSettingsSchema),
    defaultValues: {
      teeId: (playerNumber === 1 ? side?.player1TeeId : side?.player2TeeId)?.toString() || "",
      handicapIndex: (playerNumber === 1 ? side?.player1HandicapIndex : side?.player2HandicapIndex)?.toString() || "",
    },
  });

  const handleSubmit = (data: PlayerSettingsFormData) => {
    const hcp = data.handicapIndex ? parseFloat(data.handicapIndex) : null;
    const tee = data.teeId ? parseInt(data.teeId) : null;
    onSave(hcp, tee);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="text-lg font-medium" data-testid="text-settings-player-name">{playerName}</div>
        
        <FormField
          control={form.control}
          name="teeId"
          render={({ field }) => (
            <FormItem>
              <FormLabel data-testid="label-tee">Tee</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger data-testid="select-tee">
                    <SelectValue placeholder="Select tee" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {courseTees.map(tee => (
                    <SelectItem key={tee.id} value={tee.id.toString()} data-testid={`select-tee-option-${tee.id}`}>
                      {tee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="handicapIndex"
          render={({ field }) => (
            <FormItem>
              <FormLabel data-testid="label-handicap">Handicap Index</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g., 12.5"
                  data-testid="input-handicap"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-save-settings">
          {isLoading ? "Saving..." : "Save"}
        </Button>
      </form>
    </Form>
  );
}
