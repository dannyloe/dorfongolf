import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trophy, Plus, Users, Calendar, Flag, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDeleteRyderCupEvent } from "@/hooks/use-matches";
import { useAuth } from "@/hooks/use-auth";
import { useState, type ReactNode } from "react";
import type { RyderCupEvent } from "@shared/schema";

export default function RyderCupList() {
  const { data: events = [], isLoading } = useQuery<RyderCupEvent[]>({
    queryKey: ["/api/ryder-cup"],
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "setup":
        return <Badge variant="outline">Setting Up</Badge>;
      case "active":
        return <Badge className="bg-green-500">Active</Badge>;
      case "completed":
        return <Badge variant="secondary">Completed</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display flex items-center gap-3">
            <Trophy className="w-8 h-8 text-primary" />
            Ryder Cup Events
          </h1>
          <p className="text-muted-foreground mt-1">
            Multi-day team competitions with Ryder Cup style format
          </p>
        </div>
        <Link href="/ryder-cup/new">
          <Button data-testid="button-create-ryder-cup">
            <Plus className="w-4 h-4 mr-2" />
            New Event
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Trophy className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Ryder Cup Events Yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first Ryder Cup style event with 12 players split into two teams.
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
        <div className="grid gap-4">
          {events.map((event) => (
            <RyderCupEventCard 
              key={event.id} 
              event={event} 
              formatCurrency={formatCurrency}
              getStatusBadge={getStatusBadge}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RyderCupEventCard({ 
  event, 
  formatCurrency, 
  getStatusBadge 
}: { 
  event: RyderCupEvent; 
  formatCurrency: (cents: number) => string;
  getStatusBadge: (status: string) => ReactNode;
}) {
  const { user } = useAuth();
  const deleteEvent = useDeleteRyderCupEvent();
  const [showConfirm, setShowConfirm] = useState(false);
  const ADMIN_USER_ID = "52861828";
  const isAdmin = user?.id === ADMIN_USER_ID;
  const isCreator = user?.id === event.creatorId || isAdmin;

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
              {getStatusBadge(event.status)}
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Flag className="w-4 h-4" />
              {event.courseName}
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              12 Players
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              4 Days
            </div>
            <div className="flex items-center gap-1">
              Buy-in: {formatCurrency(event.buyInAmount)}
            </div>
            {event.useHandicaps && (
              <Badge variant="outline" className="text-xs">Handicapped</Badge>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm font-medium">Target:</span>
            <span className="text-primary font-bold">{event.targetPoints / 10} pts</span>
            <span className="text-muted-foreground text-sm">to win</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
