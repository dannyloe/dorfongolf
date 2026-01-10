import { useMatches, useDeleteMatch } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Calendar, MapPin, ChevronRight, Trash2, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { ClaimPresetPlayerModal } from "@/components/ClaimPresetPlayerModal";

export default function Dashboard() {
  const { data: matches, isLoading } = useMatches();
  const { user } = useAuth();
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);

  useEffect(() => {
    // Only show modal once per session if user hasn't claimed a preset
    if (user && !user.presetPlayerName && !hasShownModal) {
      setShowPresetModal(true);
      setHasShownModal(true);
    }
  }, [user, hasShownModal]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 bg-muted/20 animate-pulse rounded-2xl" />
        <div className="h-32 bg-muted/20 animate-pulse rounded-2xl" />
        <div className="h-32 bg-muted/20 animate-pulse rounded-2xl" />
      </div>
    );
  }

  const activeMatches = matches?.filter(m => !m.completed) || [];
  const pastMatches = matches?.filter(m => m.completed) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-4xl font-display font-bold text-primary mb-2">Welcome back</h1>
          <p className="text-muted-foreground text-lg">Ready for another round?</p>
        </div>
        <Link href="/ledger">
          <Button variant="outline" className="gap-2" data-testid="button-view-ledger">
            <DollarSign className="w-4 h-4" />
            View Ledger
          </Button>
        </Link>
      </motion.div>

      {/* Active Events Section */}
      <section>
        <h2 className="text-xl font-bold font-display text-foreground mb-6 flex items-center gap-2">
          <div className="w-2 h-8 bg-accent rounded-full" />
          Active Events
        </h2>
        
        {activeMatches.length === 0 ? (
          <div className="bg-white border border-dashed border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground mb-4">No active events found.</p>
            <p className="text-sm font-medium text-primary">Click "New Event" to start playing!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {activeMatches.map((match) => (
              <MatchCard key={match.id} match={match} userId={user?.id} />
            ))}
          </div>
        )}
      </section>

      {/* Past Matches Section */}
      {pastMatches.length > 0 && (
        <section>
          <h2 className="text-xl font-bold font-display text-foreground mb-6 flex items-center gap-2">
            <div className="w-2 h-8 bg-muted rounded-full" />
            History
          </h2>
          <div className="grid gap-4 opacity-80 hover:opacity-100 transition-opacity">
            {pastMatches.map((match) => (
              <MatchCard key={match.id} match={match} isHistory userId={user?.id} />
            ))}
          </div>
        </section>
      )}

      {user && (
        <ClaimPresetPlayerModal
          open={showPresetModal}
          onClose={() => setShowPresetModal(false)}
          currentUserId={user.id}
          currentPresetName={user.presetPlayerName || null}
        />
      )}
    </div>
  );
}

function MatchCard({ match, isHistory = false, userId }: { match: any, isHistory?: boolean, userId?: string }) {
  const deleteMatch = useDeleteMatch();
  const [showConfirm, setShowConfirm] = useState(false);
  const isCreator = userId === match.creatorId;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (showConfirm) {
      deleteMatch.mutate(match.id);
      setShowConfirm(false);
    } else {
      setShowConfirm(true);
    }
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
  };

  return (
    <Link href={`/match/${match.id}`}>
      <motion.div
        whileHover={{ scale: 1.01, y: -2 }}
        whileTap={{ scale: 0.99 }}
        className={`
          group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 border cursor-pointer
          ${isHistory 
            ? "bg-white border-border hover:shadow-lg" 
            : "bg-white border-primary/20 shadow-xl shadow-primary/5 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40"}
        `}
      >
        <div className="absolute top-0 right-0 p-4 flex items-center gap-2">
          {isCreator && (
            showConfirm ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteMatch.isPending}
                  data-testid={`button-confirm-delete-${match.id}`}
                >
                  {deleteMatch.isPending ? "..." : "Confirm"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelDelete}
                  data-testid={`button-cancel-delete-${match.id}`}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDelete}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                data-testid={`button-delete-${match.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )
          )}
          {!isHistory && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
              In Progress
            </span>
          )}
        </div>
        
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center text-sm text-muted-foreground gap-2">
              <Calendar className="w-4 h-4" />
              {format(new Date(match.createdAt), "MMMM d, yyyy")}
            </div>
            
            <h3 className="text-xl font-bold font-display text-foreground group-hover:text-primary transition-colors">
              {match.name}
            </h3>
            
            <div className="flex items-center text-muted-foreground font-medium">
              <MapPin className="w-4 h-4 mr-1.5 text-accent" />
              {match.courseName}
            </div>
          </div>

          <div className="flex items-center self-end text-primary font-semibold text-sm group-hover:translate-x-1 transition-transform mt-8">
            View Scorecard <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
