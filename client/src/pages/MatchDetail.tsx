import { useMatch, useJoinMatch } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useRoute } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Calendar, UserPlus, Trophy, Share2 } from "lucide-react";
import { format } from "date-fns";
import { ScoreEntryModal } from "@/components/ScoreEntryModal";
import { useState } from "react";

export default function MatchDetail() {
  const [, params] = useRoute("/match/:id");
  const matchId = parseInt(params?.id || "0");
  const { data: match, isLoading, error } = useMatch(matchId);
  const { user } = useAuth();
  const joinMatch = useJoinMatch();
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);

  if (isLoading) return <div className="p-12 text-center text-muted-foreground">Loading match details...</div>;
  if (error || !match) return <div className="p-12 text-center text-destructive">Match not found</div>;

  const isParticipant = match.participants?.some(p => p.userId === user?.id);
  
  // Calculate totals
  const getParticipantScore = (userId: string) => {
    return match.scores?.filter(s => s.userId === userId).reduce((acc, curr) => acc + curr.strokes, 0) || 0;
  };
  
  // Get score for specific user and hole
  const getScore = (userId: string, hole: number) => {
    return match.scores?.find(s => s.userId === userId && s.holeNumber === hole)?.strokes || "-";
  };

  const currentUserScores = match.scores?.filter(s => s.userId === user?.id).reduce((acc, curr) => ({ ...acc, [curr.holeNumber]: curr.strokes }), {}) || {};

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="bg-white rounded-3xl p-8 shadow-xl shadow-black/5 border border-border/50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-primary font-semibold tracking-wide uppercase text-xs">
              <Calendar className="w-4 h-4" />
              {format(new Date(match.createdAt!), "MMMM d, yyyy")}
            </div>
            <h1 className="text-4xl font-display font-bold text-foreground">{match.name}</h1>
            <div className="flex items-center gap-2 text-muted-foreground text-lg">
              <MapPin className="w-5 h-5 text-accent" />
              {match.courseName}
            </div>
          </div>

          <div className="flex gap-3">
             {!isParticipant ? (
              <button
                onClick={() => joinMatch.mutate(match.id)}
                disabled={joinMatch.isPending}
                className="btn-primary"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {joinMatch.isPending ? "Joining..." : "Join Match"}
              </button>
            ) : (
              <button
                onClick={() => setIsScoreModalOpen(true)}
                className="btn-primary"
              >
                <Trophy className="w-4 h-4 mr-2" />
                Enter Score
              </button>
            )}
          </div>
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
            {match.participants?.map((p) => {
              const isCurrentUser = p.userId === user?.id;
              return (
                <tr key={p.id} className={`hover:bg-muted/30 transition-colors ${isCurrentUser ? "bg-accent/5" : ""}`}>
                  <td className={`p-4 font-semibold sticky left-0 bg-white/95 backdrop-blur z-10 ${isCurrentUser ? "text-primary" : "text-foreground"}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${isCurrentUser ? "bg-accent" : "bg-muted"}`} />
                      {p.user.firstName || "Player"} {isCurrentUser && "(You)"}
                    </div>
                  </td>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map(hole => (
                    <td key={hole} className="p-3 text-center border-l border-border/30">
                      <span className={`font-mono font-medium ${isCurrentUser ? "text-foreground" : "text-muted-foreground"}`}>
                        {getScore(p.userId, hole)}
                      </span>
                    </td>
                  ))}
                  <td className="p-4 text-center font-bold text-lg bg-primary/5 text-primary">
                    {getParticipantScore(p.userId)}
                  </td>
                </tr>
              );
            })}
            
            {(!match.participants || match.participants.length === 0) && (
              <tr>
                <td colSpan={20} className="p-12 text-center text-muted-foreground">
                  No players yet. Be the first to join!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ScoreEntryModal 
        isOpen={isScoreModalOpen} 
        onClose={() => setIsScoreModalOpen(false)} 
        matchId={matchId}
        existingScores={currentUserScores}
      />
    </div>
  );
}
