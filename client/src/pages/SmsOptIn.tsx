import { useState } from "react";
import { motion } from "framer-motion";
import { Trophy, MessageSquare, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

export default function SmsOptIn() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Inline verification state (for logged-in users)
  const [verifyStep, setVerifyStep] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

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

    if (user) {
      // Logged-in flow: send verification code first
      setIsSendingCode(true);
      try {
        await apiRequest("POST", "/api/sms/send-setup-code", { phone: phoneNumber.trim() });
        toast({ title: "Code sent", description: "Check your phone for a 6-digit code." });
        setVerifyStep(true);
      } catch (err: any) {
        toast({ title: "Failed to send code", description: err?.message || "Please try again.", variant: "destructive" });
      } finally {
        setIsSendingCode(false);
      }
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

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyCode.trim() || verifyCode.length !== 6) {
      toast({ title: "Invalid code", description: "Please enter the 6-digit code.", variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/sms/phone-setup-verify", {
        phone: phoneNumber.trim(),
        code: verifyCode.trim(),
        consentGiven: true,
      });
      const data = await res.json();
      if (!data.verified) {
        toast({ title: "Invalid code", description: "The verification code is incorrect or expired. Please try again.", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      setSubmitted(true);
    } catch (err: any) {
      toast({ title: "Verification failed", description: err?.message || "The code may be incorrect or expired.", variant: "destructive" });
    } finally {
      setIsVerifying(false);
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
              <Link href={user ? "/dashboard" : "/"}>
                <Button variant="outline" data-testid="button-return-home">
                  {user ? "Go to Dashboard" : "Return to Golf Betting"}
                </Button>
              </Link>
            </motion.div>
          ) : verifyStep ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-2xl">Verify Your Phone</h2>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Enter the 6-digit code sent to <strong>{phoneNumber}</strong>.
              </p>
              <form onSubmit={handleVerifyCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="verifyCode">Verification Code <span className="text-destructive">*</span></Label>
                  <Input
                    id="verifyCode"
                    data-testid="input-sms-optin-verify-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={verifyCode}
                    onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setVerifyStep(false)}>
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={isVerifying} data-testid="button-sms-optin-verify">
                    {isVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Confirm &amp; Sign Up
                  </Button>
                </div>
              </form>
            </>
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
                  <p className="font-medium text-foreground">ETG Inc. d/b/a Golf Betting</p>
                  <p className="text-foreground font-medium text-xs uppercase tracking-wide">SMS is completely optional — not required to create an account or use the app.</p>
                  <p>By signing up, you consent to receive SMS notifications from <strong className="text-foreground">ETG Inc. d/b/a Golf Betting</strong> for match updates and score confirmations, including:</p>
                  <ul className="list-disc list-inside space-y-1 ml-1">
                    <li>Match invitations</li>
                    <li>Score updates</li>
                    <li>Bet results</li>
                    <li>Match reminders</li>
                  </ul>
                  <p><strong className="text-foreground">Message frequency:</strong> Up to 4 messages per active match, per week.</p>
                  <p>Message and data rates may apply.</p>
                  <p>Reply <strong className="text-foreground">HELP</strong> for help or <strong className="text-foreground">STOP</strong> to opt out at any time.</p>
                  <p>
                    SMS messages are delivered via Plivo. Your phone number may be processed by Plivo when you use SMS features.{" "}
                    <a href="https://www.plivo.com/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                      Plivo's Privacy Policy
                    </a>{" "}
                    applies to data processed through their platform.
                  </p>
                  <p>
                    See our{" "}
                    <Link href="/terms" className="text-primary underline underline-offset-2">
                      Terms of Service
                    </Link>
                    {" "}and{" "}
                    <Link href="/privacy" className="text-primary underline underline-offset-2">
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
                    I consent to receive SMS notifications from ETG Inc. d/b/a Golf Betting for match updates and score confirmations (optional, not required to use the service). I understand I can reply STOP to opt out at any time.
                  </Label>
                </div>

                <Button
                  type="submit"
                  data-testid="button-sms-optin-submit"
                  className="w-full"
                  disabled={isLoading || isSendingCode}
                >
                  {(isLoading || isSendingCode) ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {user ? "Send Verification Code" : "Yes, sign me up!"}
                </Button>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
