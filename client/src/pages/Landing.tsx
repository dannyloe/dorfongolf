import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Trophy, BarChart3, Users, CheckCircle2, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function Landing() {
  const { login, isLoggingIn } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login({ username, password });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err?.message || "Invalid username or password",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      {/* Nav */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-2xl text-primary">Golf Betting</span>
        </div>
      </nav>

      {/* Hero + Login */}
      <div className="container mx-auto px-6 pt-8 pb-24 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            {/* Left: headline */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="font-display font-bold text-5xl md:text-6xl leading-tight mb-6 text-foreground">
                Hardscrabble <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
                  Betting App
                </span>
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Stats don't lie.
              </p>
            </motion.div>

            {/* Right: login form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <div className="glass-card rounded-2xl p-8 shadow-xl">
                <h2 className="font-display font-bold text-2xl mb-6">Sign In</h2>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      data-testid="input-username"
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="your username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        data-testid="input-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(v => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    data-testid="button-login"
                    className="w-full"
                    disabled={isLoggingIn}
                  >
                    {isLoggingIn ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <ArrowRight className="w-4 h-4 mr-2" />
                    )}
                    Sign In
                  </Button>
                </form>
                <p className="text-sm text-muted-foreground text-center mt-4">
                  New user?{" "}
                  <a href="/register" className="text-primary hover:underline font-medium">
                    Create account
                  </a>
                </p>
              </div>
            </motion.div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <FeatureCard
              icon={<BarChart3 className="w-6 h-6 text-accent-foreground" />}
              title="Real-time Stats"
              desc="Live leaderboards and hole-by-hole analytics as you play."
              delay={0.2}
            />
            <FeatureCard
              icon={<Users className="w-6 h-6 text-accent-foreground" />}
              title="Multiplayer"
              desc="Create matches and invite friends to join instantly."
              delay={0.3}
            />
            <FeatureCard
              icon={<CheckCircle2 className="w-6 h-6 text-accent-foreground" />}
              title="History"
              desc="Keep a permanent record of every round you've ever played."
              delay={0.4}
            />
          </div>
        </div>
      </div>

      <footer className="border-t border-primary/5 py-12 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>© 2024 Golf Betting.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc, delay }: { icon: any; title: string; desc: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="glass-card p-8 rounded-2xl hover:bg-white transition-colors"
    >
      <div className="w-12 h-12 rounded-xl bg-accent mb-6 flex items-center justify-center shadow-lg shadow-accent/20">
        {icon}
      </div>
      <h3 className="text-xl font-bold font-display mb-3">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{desc}</p>
    </motion.div>
  );
}
