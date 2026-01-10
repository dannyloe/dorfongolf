import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Hash, Award, Users } from "lucide-react";
import { useSubmitScore } from "@/hooks/use-matches";

interface Player {
  id: number;
  matchId: number;
  userId: string | null;
  name: string;
}

interface ScoreEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: number;
  players: Player[];
  existingScores?: { playerId: number; holeNumber: number; strokes: number }[];
}

export function ScoreEntryModal({ isOpen, onClose, matchId, players, existingScores = [] }: ScoreEntryModalProps) {
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(players[0]?.id || null);
  const [selectedHole, setSelectedHole] = useState<number>(1);
  const [strokes, setStrokes] = useState<number>(4);
  const submitScore = useSubmitScore(matchId);

  const getExistingScore = (playerId: number, hole: number) => {
    return existingScores.find(s => s.playerId === playerId && s.holeNumber === hole)?.strokes;
  };

  const handleSubmit = () => {
    if (selectedPlayer === null) return;
    
    submitScore.mutate(
      { playerId: selectedPlayer, holeNumber: selectedHole, strokes },
      {
        onSuccess: () => {
          // Move to next hole
          if (selectedHole < 18) {
            setSelectedHole(selectedHole + 1);
            const nextScore = getExistingScore(selectedPlayer, selectedHole + 1);
            setStrokes(nextScore || 4);
          } else {
            onClose();
          }
        },
      }
    );
  };

  const handlePlayerChange = (playerId: number) => {
    setSelectedPlayer(playerId);
    const score = getExistingScore(playerId, selectedHole);
    setStrokes(score || 4);
  };

  const handleHoleChange = (hole: number) => {
    setSelectedHole(hole);
    if (selectedPlayer !== null) {
      const score = getExistingScore(selectedPlayer, hole);
      setStrokes(score || 4);
    }
  };

  const increment = () => setStrokes(s => Math.min(s + 1, 15));
  const decrement = () => setStrokes(s => Math.max(s - 1, 1));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-4 border-b border-border flex justify-between items-center bg-primary text-primary-foreground">
              <h2 className="text-lg font-bold font-display">Enter Score</h2>
              <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Player Selection */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4" /> Select Player
                </label>
                <div className="flex flex-wrap gap-2">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => handlePlayerChange(player.id)}
                      className={`
                        px-3 py-2 rounded-lg text-sm font-medium transition-all
                        ${selectedPlayer === player.id 
                          ? "bg-primary text-white shadow-lg" 
                          : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"}
                      `}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hole Selection */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Hash className="w-4 h-4" /> Select Hole
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((hole) => {
                    const hasScore = selectedPlayer !== null && getExistingScore(selectedPlayer, hole) !== undefined;
                    const isSelected = selectedHole === hole;
                    
                    return (
                      <button
                        key={hole}
                        onClick={() => handleHoleChange(hole)}
                        className={`
                          aspect-square rounded-lg text-sm font-bold flex items-center justify-center transition-all
                          ${isSelected 
                            ? "bg-primary text-white shadow-lg scale-110 ring-2 ring-accent z-10" 
                            : hasScore 
                              ? "bg-primary/10 text-primary border border-primary/20" 
                              : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"}
                        `}
                      >
                        {hole}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Strokes Input */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4" /> Strokes
                </label>
                <div className="flex items-center justify-center gap-6 bg-muted/30 p-4 rounded-xl border border-border">
                  <button 
                    onClick={decrement}
                    className="w-12 h-12 rounded-full bg-white border border-border shadow-sm flex items-center justify-center text-xl font-bold hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    -
                  </button>
                  <span className="text-5xl font-display font-bold text-primary w-20 text-center">
                    {strokes}
                  </span>
                  <button 
                    onClick={increment}
                    className="w-12 h-12 rounded-full bg-white border border-border shadow-sm flex items-center justify-center text-xl font-bold hover:bg-gray-50 active:scale-95 transition-all"
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={submitScore.isPending || selectedPlayer === null}
                className="w-full btn-primary"
              >
                {submitScore.isPending ? "Saving..." : "Save Score"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
