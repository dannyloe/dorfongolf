import { useMatches, useDeleteMatch, useUpdateMatchStatus, useCloneEvent, useGroups } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Calendar, MapPin, ChevronRight, Trash2, DollarSign, Copy, Users, Tag } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, useMemo } from "react";
import { ClaimPresetPlayerModal } from "@/components/ClaimPresetPlayerModal";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const { data: matches, isLoading } = useMatches();
  const { data: groups } = useGroups();
  const { user } = useAuth();
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [hasShownModal, setHasShownModal] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number | null>>(new Set());

  const { data: myGroups = [] } = useQuery<{id: number; name: string; memberCount: number; playerCount: number; role: string}[]>({
    queryKey: ["/api/groups/my"],
    queryFn: async () => {
      const res = await fetch("/api/groups/my", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch groups");
      return res.json();
    },
  });

  const groupsById = useMemo(() => {
    const map = new Map<number, string>();
    groups?.forEach((g: { id: number; name: string }) => map.set(g.id, g.name));
    return map;
  }, [groups]);

  useEffect(() => {
    if (myGroups.length > 0 && selectedGroupIds.size === 0) {
      const initial = new Set<number | null>(myGroups.map(g => g.id));
      initial.add(null);
      setSelectedGroupIds(initial);
    }
  }, [myGroups]);

  useEffect(() => {
    if (user && !user.presetPlayerName && !hasShownModal) {
      setShowPresetModal(true);
      setHasShownModal(true);
    }
  }, [user, hasShownModal]);

  const toggleGroup = (groupId: number | null) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedGroupIds.size === myGroups.length + 1) {
      setSelectedGroupIds(new Set());
    } else {
      const all = new Set<number | null>(myGroups.map(g => g.id));
      all.add(null);
      setSelectedGroupIds(all);
    }
  };

  const filteredMatches = useMemo(() => {
    if (!matches) return [];
    if (myGroups.length === 0 && selectedGroupIds.size === 0) return matches;
    return matches.filter(m => selectedGroupIds.has(m.groupId ?? null));
  }, [matches, selectedGroupIds, myGroups]);

  const groupedMatches = useMemo(() => {
    const gMap = new Map<number | null, typeof filteredMatches>();
    for (const m of filteredMatches) {
      const key = m.groupId ?? null;
      if (!gMap.has(key)) gMap.set(key, []);
      gMap.get(key)!.push(m);
    }
    return gMap;
  }, [filteredMatches]);

  const activeMatches = filteredMatches.filter(m => !m.completed);
  const pastMatches = filteredMatches.filter(m => m.completed);

  const showGroupedSections = selectedGroupIds.size > 1;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 bg-muted/20 animate-pulse rounded-2xl" />
        <div className="h-32 bg-muted/20 animate-pulse rounded-2xl" />
        <div className="h-32 bg-muted/20 animate-pulse rounded-2xl" />
      </div>
    );
  }

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

      {myGroups.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center" data-testid="group-filter-bar">
          <span className="text-sm font-medium text-muted-foreground mr-1">Filter:</span>
          <Badge
            className={`cursor-pointer toggle-elevate ${selectedGroupIds.size === myGroups.length + 1 ? 'toggle-elevated' : ''}`}
            variant={selectedGroupIds.size === myGroups.length + 1 ? "default" : "outline"}
            onClick={toggleAll}
            data-testid="filter-all-groups"
          >
            All
          </Badge>
          {myGroups.map(group => (
            <Badge
              key={group.id}
              className={`cursor-pointer toggle-elevate ${selectedGroupIds.has(group.id) ? 'toggle-elevated' : ''}`}
              variant={selectedGroupIds.has(group.id) ? "default" : "outline"}
              onClick={() => toggleGroup(group.id)}
              data-testid={`filter-group-${group.id}`}
            >
              {group.name}
            </Badge>
          ))}
          <Badge
            className={`cursor-pointer toggle-elevate ${selectedGroupIds.has(null) ? 'toggle-elevated' : ''}`}
            variant={selectedGroupIds.has(null) ? "default" : "outline"}
            onClick={() => toggleGroup(null)}
            data-testid="filter-ungrouped"
          >
            Ungrouped
          </Badge>
        </div>
      )}

      {showGroupedSections ? (
        <>
          {Array.from(groupedMatches.entries())
            .sort(([a], [b]) => {
              if (a === null) return 1;
              if (b === null) return -1;
              return 0;
            })
            .map(([groupId, groupMatchList]) => {
              const active = groupMatchList.filter(m => !m.completed);
              const completed = groupMatchList.filter(m => m.completed);
              const groupName = groupId === null ? "Ungrouped" : (groupsById.get(groupId) || myGroups.find(g => g.id === groupId)?.name || `Group ${groupId}`);

              return (
                <section key={groupId ?? "ungrouped"} data-testid={`group-section-${groupId ?? 'ungrouped'}`}>
                  <h2 className="text-xl font-bold font-display text-foreground mb-6 flex items-center gap-2">
                    <div className="w-2 h-8 bg-accent rounded-full" />
                    {groupName}
                  </h2>

                  {active.length > 0 && (
                    <div className="grid gap-4 mb-6">
                      {active.map((match) => (
                        <MatchCard key={match.id} match={match} userId={user?.id} groupsById={groupsById} />
                      ))}
                    </div>
                  )}

                  {completed.length > 0 && (
                    <div className="grid gap-4 opacity-80 hover:opacity-100 transition-opacity">
                      {completed.map((match) => (
                        <MatchCard key={match.id} match={match} isHistory userId={user?.id} groupsById={groupsById} />
                      ))}
                    </div>
                  )}

                  {active.length === 0 && completed.length === 0 && (
                    <div className="bg-white border border-dashed border-border rounded-2xl p-12 text-center">
                      <p className="text-muted-foreground">No events in this group.</p>
                    </div>
                  )}
                </section>
              );
            })}
        </>
      ) : (
        <>
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
                  <MatchCard key={match.id} match={match} userId={user?.id} groupsById={groupsById} />
                ))}
              </div>
            )}
          </section>

          {pastMatches.length > 0 && (
            <section>
              <h2 className="text-xl font-bold font-display text-foreground mb-6 flex items-center gap-2">
                <div className="w-2 h-8 bg-muted rounded-full" />
                History
              </h2>
              <div className="grid gap-4 opacity-80 hover:opacity-100 transition-opacity">
                {pastMatches.map((match) => (
                  <MatchCard key={match.id} match={match} isHistory userId={user?.id} groupsById={groupsById} />
                ))}
              </div>
            </section>
          )}
        </>
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

function MatchCard({ match, isHistory = false, userId, groupsById }: { match: any, isHistory?: boolean, userId?: string, groupsById: Map<number, string> }) {
  const deleteMatch = useDeleteMatch();
  const updateStatus = useUpdateMatchStatus();
  const cloneEvent = useCloneEvent();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const ADMIN_USER_ID = "52861828";
  const isAdmin = userId === ADMIN_USER_ID;
  const isCreator = userId === match.creatorId || isAdmin;

  const handleClone = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const newMatch = await cloneEvent.mutateAsync(match.id);
      toast({
        title: "Event cloned",
        description: "A new event has been created with today's date.",
      });
      navigate(`/match/${newMatch.id}`);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to clone event",
        description: error.message,
      });
    }
  };

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
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleClone}
                  disabled={cloneEvent.isPending}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                  title="Clone Event"
                  data-testid={`button-clone-${match.id}`}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleDelete}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  data-testid={`button-delete-${match.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </>
            )
          )}
          {!isHistory ? (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                updateStatus.mutate({ matchId: match.id, completed: true });
              }}
              disabled={updateStatus.isPending}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors cursor-pointer"
              data-testid={`button-end-event-${match.id}`}
            >
              {updateStatus.isPending ? "..." : "In Progress"}
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                updateStatus.mutate({ matchId: match.id, completed: false });
              }}
              disabled={updateStatus.isPending}
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
              data-testid={`button-reopen-event-${match.id}`}
            >
              {updateStatus.isPending ? "..." : "Ended"}
            </button>
          )}
        </div>
        
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="flex items-center text-sm text-muted-foreground gap-2">
              <Calendar className="w-4 h-4" />
              {format(new Date(match.createdAt), "MMMM d, yyyy")}
            </div>
            
            <h3 className="text-xl font-bold font-display text-foreground group-hover:text-primary transition-colors">
              {match.name || format(new Date(match.createdAt), "MMMM d, yyyy")}
            </h3>
            
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center text-muted-foreground font-medium">
                <MapPin className="w-4 h-4 mr-1.5 text-accent" />
                {match.courseName}
              </div>
              {match.groupId && groupsById.get(match.groupId) && (
                <div className="flex items-center text-muted-foreground text-sm">
                  <Tag className="w-3.5 h-3.5 mr-1 text-primary" />
                  {groupsById.get(match.groupId)}
                </div>
              )}
            </div>
            
            {match.players && match.players.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mt-1">
                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {match.players.map((p: any) => p.name).join(", ")}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center self-end text-primary font-semibold text-sm group-hover:translate-x-1 transition-transform mt-8">
            View Scorecard <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
