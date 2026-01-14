import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Trophy, Plus, BookOpen, MapPin, Users, Menu } from "lucide-react";
import { CreateMatchModal } from "./CreateMatchModal";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Simple active link helper
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
                    <Link href="/ryder-cup" className="flex items-center gap-2 w-full" data-testid="mobile-link-ryder-cup">
                      <Trophy className="w-4 h-4" />
                      Ryder Cup
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2 w-full" data-testid="mobile-link-profile">
                      <User className="w-4 h-4" />
                      Profile
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
                  data-testid="link-ryder-cup"
                >
                  <Trophy className="w-4 h-4" />
                  Ryder Cup
                </Link>
              </nav>

              <button
                onClick={() => setIsCreateOpen(true)}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
              >
                <Plus className="w-4 h-4" /> New Event
              </button>

              <div className="h-6 w-px bg-border mx-2 hidden md:block" />

              <div className="flex items-center gap-3">
                <Link 
                  href="/profile" 
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
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

      {/* Mobile Create Button FAB */}
      {user && (
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
