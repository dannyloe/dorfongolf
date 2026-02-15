import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trophy, Plus, Users, Calendar, Flag, ChevronRight, Trash2, TreePalm, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDeleteRyderCupEvent } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect, useMemo } from "react";
import type { RyderCupEvent } from "@shared/schema";
import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function RyderCupList() {
  const { data: events = [], isLoading } = useQuery<RyderCupEvent[]>({
    queryKey: ["/api/ryder-cup"],
  });

  const { data: myGroups = [] } = useQuery<{id: number; name: string; memberCount: number; playerCount: number; role: string}[]>({
    queryKey: ["/api/groups/my"],
    queryFn: async () => {
      const res = await fetch("/api/groups/my", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<number | null>>(new Set());

  useEffect(() => {
    if (myGroups.length > 0 && selectedGroupIds.size === 0) {
      const initial = new Set<number | null>(myGroups.map(g => g.id));
      initial.add(null);
      setSelectedGroupIds(initial);
    }
  }, [myGroups]);

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

  const filteredEvents = useMemo(() => {
    if (myGroups.length === 0 && selectedGroupIds.size === 0) return events;
    return events.filter(e => selectedGroupIds.has(e.groupId ?? null));
  }, [events, selectedGroupIds, myGroups]);

  const activeEvents = filteredEvents.filter(e => e.status !== "completed");
  const pastEvents = filteredEvents.filter(e => e.status === "completed");

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" />
            Events
          </h1>
          <p className="text-muted-foreground mt-1">
            Multi-day events: Ryder Cup, buddy trips, tournaments, and more
          </p>
        </div>
        <Link href="/ryder-cup/new">
          <Button data-testid="button-create-ryder-cup">
            <Plus className="w-4 h-4 mr-2" />
            New Event
          </Button>
        </Link>
      </div>

      {myGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="ryder-cup-group-filter">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Events Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first multi-day event - Ryder Cup, buddy trip, tournament, or more.
            </p>
            <Link href="/ryder-cup/new">
              <Button data-testid="button-create-first-event">
                <Plus className="w-4 h-4 mr-2" />
                Create First Event
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {activeEvents.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">No active events found.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {activeEvents.map((event) => (
                <RyderCupEventCard 
                  key={event.id} 
                  event={event} 
                  formatCurrency={formatCurrency}
                  isHistory={false}
                />
              ))}
            </div>
          )}

          {pastEvents.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-muted-foreground flex items-center gap-2">
                History
              </h2>
              <div className="grid gap-4">
                {pastEvents.map((event) => (
                  <RyderCupEventCard 
                    key={event.id} 
                    event={event} 
                    formatCurrency={formatCurrency}
                    isHistory={true}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EVENT_TYPE_ICONS: Record<string, typeof Trophy> = {
  [EVENT_TYPES.RYDER_CUP]: Trophy,
  [EVENT_TYPES.BUDDY_TRIP]: TreePalm,
  [EVENT_TYPES.TOURNAMENT]: Medal,
};

function RyderCupEventCard({ 
  event, 
  formatCurrency, 
  isHistory,
}: { 
  event: RyderCupEvent; 
  formatCurrency: (cents: number) => string;
  isHistory: boolean;
}) {
  const { user } = useAuth();
  const deleteEvent = useDeleteRyderCupEvent();
  const [showConfirm, setShowConfirm] = useState(false);
  const ADMIN_USER_ID = "52861828";
  const isAdmin = user?.id === ADMIN_USER_ID;
  const isCreator = user?.id === event.creatorId || isAdmin;
  const eventType = (event.eventType as EventType) || EVENT_TYPES.RYDER_CUP;
  const EventTypeIcon = EVENT_TYPE_ICONS[eventType] || Trophy;

  const updateStatus = useMutation({
    mutationFn: async (status: "active" | "completed") => {
      return apiRequest("PATCH", `/api/ryder-cup/${event.id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ryder-cup"] });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (showConfirm) {
      deleteEvent.mutate(event.id);
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
    <Link href={`/ryder-cup/${event.id}`}>
      <Card className="hover-elevate cursor-pointer group relative" data-testid={`card-ryder-cup-${event.id}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-xl font-display">{event.name}</CardTitle>
            <div className="flex items-center gap-2">
              {isCreator && (
                showConfirm ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleteEvent.isPending}
                      data-testid={`button-confirm-delete-ryder-cup-${event.id}`}
                    >
                      {deleteEvent.isPending ? "..." : "Confirm"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleCancelDelete}
                      data-testid={`button-cancel-delete-ryder-cup-${event.id}`}
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
                    data-testid={`button-delete-ryder-cup-${event.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )
              )}
              {event.status === "setup" ? (
                <Badge variant="outline">Setting Up</Badge>
              ) : !isHistory ? (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    updateStatus.mutate("completed");
                  }}
                  disabled={updateStatus.isPending}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 hover:bg-green-200 transition-colors cursor-pointer"
                  data-testid={`button-end-ryder-cup-${event.id}`}
                >
                  {updateStatus.isPending ? "..." : "In Progress"}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    updateStatus.mutate("active");
                  }}
                  disabled={updateStatus.isPending}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 transition-colors cursor-pointer"
                  data-testid={`button-reopen-ryder-cup-${event.id}`}
                >
                  {updateStatus.isPending ? "..." : "Ended"}
                </button>
              )}
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <Badge variant="secondary" className="gap-1">
              <EventTypeIcon className="w-3 h-3" />
              {EVENT_TYPE_LABELS[eventType]}
            </Badge>
            <div className="flex items-center gap-1">
              <Flag className="w-4 h-4" />
              {event.courseName}
            </div>
            <div className="flex items-center gap-1">
              Buy-in: {formatCurrency(event.buyInAmount)}
            </div>
            {event.useHandicaps && (
              <Badge variant="outline" className="text-xs">Handicapped</Badge>
            )}
          </div>
          {eventType === EVENT_TYPES.RYDER_CUP && event.targetPoints > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm font-medium">Target:</span>
              <span className="text-primary font-bold">{event.targetPoints / 10} pts</span>
              <span className="text-muted-foreground text-sm">to win</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
