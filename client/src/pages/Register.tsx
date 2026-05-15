import { useState } from "react";
import { motion } from "framer-motion";
import { Trophy, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    email: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 6) {
      toast({ title: "Password too short", description: "Must be at least 6 characters", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/register", form);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/dashboard");
    } catch (err: any) {
      toast({
        title: "Registration failed",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md px-4"
      >
        {/* Logo */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-2xl text-primary">Golf Betting</span>
        </div>

        <div className="glass-card rounded-2xl p-8 shadow-xl">
          <h2 className="font-display font-bold text-2xl mb-6">Create Account</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  data-testid="input-firstName"
                  placeholder="John"
                  value={form.firstName}
                  onChange={e => update("firstName", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  data-testid="input-lastName"
                  placeholder="Smith"
                  value={form.lastName}
                  onChange={e => update("lastName", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                data-testid="input-email"
                type="email"
                placeholder="john@example.com"
                value={form.email}
                onChange={e => update("email", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="username">Username <span className="text-destructive">*</span></Label>
              <Input
                id="username"
                data-testid="input-username"
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="johngolf"
                value={form.username}
                onChange={e => update("username", e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={form.password}
                  onChange={e => update("password", e.target.value)}
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
              data-testid="button-register"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Account
            </Button>
          </form>

          <div className="flex items-center justify-center mt-4">
            <a
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </a>
          </div>

          <p className="text-xs text-muted-foreground text-center mt-4">
            By creating an account you agree to our{" "}
            <a href="/terms" className="hover:text-foreground underline underline-offset-2 transition-colors">Terms &amp; Conditions</a>
            {" "}and{" "}
            <a href="/privacy" className="hover:text-foreground underline underline-offset-2 transition-colors">Privacy Policy</a>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
