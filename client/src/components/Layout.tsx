import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Trophy, Plus, BookOpen, MapPin, Users, Menu, Key, Bell } from "lucide-react";
import { CreateMatchModal } from "./CreateMatchModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: items = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const unreadCount = items.filter((n) => !n.readAt).length;

  const markRead = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => apiRequest("PATCH", "/api/notifications/read-all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const [, setLocation] = useLocation();

  function handleNotificationClick(n: Notification) {
    if (!n.readAt) {
      markRead.mutate(n.id);
    }
    setOpen(false);
    if (n.route) {
      setLocation(n.route);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[480px] overflow-y-auto p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">Notifications</span>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className="text-xs text-primary hover:underline"
              data-testid="button-mark-all-read"
            >
              Mark all read
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No notifications yet
          </div>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors ${!n.readAt ? "bg-primary/5" : ""}`}
              data-testid={`notification-item-${n.id}`}
            >
              <div className="flex items-start gap-2">
                {!n.readAt && (
                  <span className="mt-1.5 flex-shrink-0 w-2 h-2 rounded-full bg-primary" />
                )}
                <div className={!n.readAt ? "" : "ml-4"}>
                  <p className="text-sm font-medium leading-snug">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    {formatDistanceToNow(new Date(n.createdAt!), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const isActive = (path: string) => location === path;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mobile Menu */}
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="md:hidden">
                  <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                    <Menu className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard" className="flex items-center gap-2 w-full" data-testid="mobile-link-dashboard">
                      <Trophy className="w-4 h-4" />
                      Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/ledger" className="flex items-center gap-2 w-full" data-testid="mobile-link-ledger">
                      <BookOpen className="w-4 h-4" />
                      Ledger
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/courses" className="flex items-center gap-2 w-full" data-testid="mobile-link-courses">
                      <MapPin className="w-4 h-4" />
                      Courses
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/players" className="flex items-center gap-2 w-full" data-testid="mobile-link-players">
                      <Users className="w-4 h-4" />
                      Players
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/ryder-cup" className="flex items-center gap-2 w-full" data-testid="mobile-link-events">
                      <Trophy className="w-4 h-4" />
                      Events
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/groups" className="flex items-center gap-2 w-full" data-testid="mobile-link-groups">
                      <Users className="w-4 h-4" />
                      Groups
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2 w-full" data-testid="mobile-link-profile">
                      <User className="w-4 h-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/api-keys" className="flex items-center gap-2 w-full" data-testid="mobile-link-api-keys">
                      <Key className="w-4 h-4" />
                      API Keys
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsCreateOpen(true)} data-testid="mobile-button-new-event">
                    <Plus className="w-4 h-4 mr-2" />
                    New Event
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:rotate-6 transition-transform">
                <Trophy className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-xl text-foreground">Golf Betting</span>
            </Link>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-1 mr-4">
                <Link 
                  href="/dashboard" 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive('/dashboard') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="link-dashboard"
                >
                  Dashboard
                </Link>
                <Link 
                  href="/ledger" 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${isActive('/ledger') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="link-ledger"
                >
                  <BookOpen className="w-4 h-4" />
                  Ledger
                </Link>
                <Link 
                  href="/courses" 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${isActive('/courses') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="link-courses"
                >
                  <MapPin className="w-4 h-4" />
                  Courses
                </Link>
                <Link 
                  href="/players" 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${isActive('/players') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="link-players"
                >
                  <Users className="w-4 h-4" />
                  Players
                </Link>
                <Link 
                  href="/ryder-cup" 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${isActive('/ryder-cup') || location.startsWith('/ryder-cup') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="link-events"
                >
                  <Trophy className="w-4 h-4" />
                  Events
                </Link>
                <Link 
                  href="/groups" 
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${isActive('/groups') || location.startsWith('/groups') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  data-testid="link-groups"
                >
                  <Users className="w-4 h-4" />
                  Groups
                </Link>
              </nav>

              <button
                onClick={() => setIsCreateOpen(true)}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
              >
                <Plus className="w-4 h-4" /> New Event
              </button>

              <div className="h-6 w-px bg-border mx-2 hidden md:block" />

              <div className="flex items-center gap-1">
                <NotificationBell />

                <Link 
                  href="/profile" 
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity ml-1"
                  data-testid="link-profile"
                >
                  <span className="hidden sm:inline text-sm font-medium text-foreground">
                    {user.firstName || user.email?.split('@')[0]}
                  </span>
                  {user.profileImageUrl ? (
                    <img src={user.profileImageUrl} alt="Profile" className="w-8 h-8 rounded-full border border-border" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <User className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </Link>
                <button
                  onClick={() => logout()}
                  className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <Link 
              href="/api/login"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>

      {/* Mobile Create Button FAB - only show on dashboard */}
      {user && location === '/dashboard' && (
        <button
          onClick={() => setIsCreateOpen(true)}
          className="md:hidden fixed bottom-6 right-6 w-14 h-14 bg-accent text-accent-foreground rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-40"
        >
          <Plus className="w-8 h-8" />
        </button>
      )}

      <CreateMatchModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  );
}
