import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Trophy, Phone, CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

type Step = "phone" | "code" | "done";

export default function PhoneSetup() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [location] = useLocation();
  const token = new URLSearchParams(window.location.search).get("t") ?? undefined;

  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [consentGiven, setConsentGiven] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      toast({ title: "Phone required", description: "Please enter your phone number.", variant: "destructive" });
      return;
    }
    setIsSending(true);
    try {
      await apiRequest("POST", "/api/sms/send-setup-code", {
        phone: phoneNumber.trim(),
        ...(token ? { token } : {}),
      });
      toast({ title: "Code sent", description: "Check your phone for a 6-digit code." });
      setStep("code");
    } catch (err: any) {
      toast({ title: "Failed to send code", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      toast({ title: "Invalid code", description: "Please enter the 6-digit code.", variant: "destructive" });
      return;
    }
    if (!consentGiven) {
      toast({ title: "Consent required", description: "Please check the consent box to continue.", variant: "destructive" });
      return;
    }
    setIsVerifying(true);
    try {
      const res = await apiRequest("POST", "/api/sms/phone-setup-verify", {
        phone: phoneNumber.trim(),
        code: code.trim(),
        consentGiven: true,
        ...(token ? { token } : {}),
      });
      const data = await res.json();
      if (!data.verified) {
        toast({ title: "Invalid code", description: "The verification code is incorrect or expired. Please try again.", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      setStep("done");
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
          {step === "done" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center py-4"
              data-testid="phone-setup-success"
            >
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
              </div>
              <h2 className="font-display font-bold text-2xl mb-2">You're all set!</h2>
              <p className="text-muted-foreground mb-6">
                Your phone is verified. You'll receive SMS alerts for your Golf Betting matches. Reply <strong>STOP</strong> any time to cancel.
              </p>
              <Link href={user ? "/dashboard" : "/"}>
                <Button variant="outline" data-testid="button-phone-setup-done">
                  {user ? "Go to Dashboard" : "Return to Golf Betting"}
                </Button>
              </Link>
            </motion.div>
          ) : step === "phone" ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <Phone className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-2xl">Phone Setup</h2>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Add your phone number to receive SMS alerts for matches, bets, and results.
              </p>

              <form onSubmit={handleSendCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                  <Input
                    id="phone"
                    data-testid="input-phone-setup-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    required
                  />
                </div>

                <Button
                  type="submit"
                  data-testid="button-phone-setup-send"
                  className="w-full"
                  disabled={isSending}
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Send Verification Code
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                <h2 className="font-display font-bold text-2xl">Verify &amp; Opt In</h2>
              </div>
              <p className="text-muted-foreground text-sm mb-6">
                Enter the 6-digit code sent to <strong>{phoneNumber}</strong>, then agree to receive match alerts.
              </p>

              <form onSubmit={handleVerify} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification Code <span className="text-destructive">*</span></Label>
                  <Input
                    id="code"
                    data-testid="input-phone-setup-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>

                <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 text-sm text-muted-foreground">
                  <p>By completing setup, you agree to receive SMS text alerts from <strong className="text-foreground">Golf Betting</strong> including match invitations, score updates, bet results, and reminders.</p>
                  <p>Message and data rates may apply. Reply <strong className="text-foreground">STOP</strong> to cancel, <strong className="text-foreground">HELP</strong> for help.</p>
                  <p>
                    See our{" "}
                    <Link href="/terms" className="text-primary underline underline-offset-2">Terms</Link>
                    {" "}and{" "}
                    <Link href="/privacy-policy" className="text-primary underline underline-offset-2">Privacy Policy</Link>.
                  </p>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="consent"
                    data-testid="checkbox-phone-setup-consent"
                    checked={consentGiven}
                    onCheckedChange={checked => setConsentGiven(checked === true)}
                  />
                  <Label htmlFor="consent" className="leading-snug cursor-pointer text-sm">
                    I agree to receive SMS alerts from Golf Betting. I can reply STOP to cancel at any time.
                  </Label>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep("phone")}
                    data-testid="button-phone-setup-back"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    data-testid="button-phone-setup-verify"
                    className="flex-1"
                    disabled={isVerifying}
                  >
                    {isVerifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Complete Setup
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
