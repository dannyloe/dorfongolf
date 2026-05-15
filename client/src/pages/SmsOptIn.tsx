import { useState } from "react";
import { motion } from "framer-motion";
import { Trophy, MessageSquare, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

export default function SmsOptIn() {
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!phoneNumber.trim()) {
      toast({ title: "Phone required", description: "Please enter your phone number.", variant: "destructive" });
      return;
    }
    if (!consentGiven) {
      toast({ title: "Consent required", description: "Please check the consent box to continue.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/sms/opt-in", { phoneNumber: phoneNumber.trim(), consentGiven });
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Something went wrong",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden px-4">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-2xl text-primary">Golf Betting</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center py-4"
              data-testid="sms-optin-success"
            >
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              </div>
              <h2 className="font-display font-bold text-2xl mb-2">You're signed up!</h2>
              <p className="text-muted-foreground mb-6">
                You'll receive SMS alerts for your Golf Betting matches. Reply <strong>STOP</strong> at any time to cancel.
              </p>
              <Link href="/">
                <Button variant="outline" data-testid="button-return-home">Return to Golf Betting</Button>
              </Link>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-2xl">SMS Alerts Opt-In</h2>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Sign up to receive text message alerts for your golf matches, bets, and results.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="phoneNumber">Phone Number <span className="text-destructive">*</span></Label>
                  <Input
                    id="phoneNumber"
                    data-testid="input-phone-number"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3 text-sm text-muted-foreground">
                  <p>By signing up, you agree to receive SMS text alerts from <strong className="text-foreground">Golf Betting</strong>, including:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1">
                    <li>Match invitations</li>
                    <li>Score updates</li>
                    <li>Bet results</li>
                    <li>Match reminders</li>
                  </ul>
                  <p><strong className="text-foreground">Message frequency:</strong> You will receive up to 4 messages per active match, per week.</p>
                  <p>Message and data rates may apply.</p>
                  <p>Reply <strong className="text-foreground">HELP</strong> for help or <strong className="text-foreground">STOP</strong> to cancel any time.</p>
                  <p>
                    See our{" "}
                    <Link href="/terms" className="text-primary underline underline-offset-2">
                      Terms of Service
                    </Link>
                    {" "}and{" "}
                    <Link href="/privacy-policy" className="text-primary underline underline-offset-2">
                      Privacy Policy
                    </Link>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent"
                    data-testid="checkbox-consent"
                    checked={consentGiven}
                    onCheckedChange={checked => setConsentGiven(checked === true)}
                  />
                  <Label htmlFor="consent" className="leading-snug cursor-pointer text-sm">
                    I agree to receive SMS text alerts from Golf Betting at the number above. I understand I can reply STOP to cancel at any time.
                  </Label>
                </div>

                <Button
                  type="submit"
                  data-testid="button-sms-optin-submit"
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Yes, sign me up!
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
