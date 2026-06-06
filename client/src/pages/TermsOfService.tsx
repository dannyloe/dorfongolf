import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import { Link } from "wouter";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 max-w-2xl mx-auto"
      >
        <div className="flex items-center gap-2 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-2xl text-primary">Golf Betting</span>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl space-y-6 text-sm text-muted-foreground leading-relaxed">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Terms of Service</h1>
            <p className="text-sm font-medium text-foreground mb-1">ETG Inc. d/b/a Golf Betting</p>
            <p className="text-xs text-muted-foreground">Last updated: May 2025</p>
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Golf Betting, operated by ETG Inc. d/b/a Golf Betting ("the App"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the App.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">2. Description of Service</h2>
            <p>
              Golf Betting is a scorecard and bet-tracking application for recreational golfers. It allows users to record scores, track friendly wagers, and communicate with other players. The App does not facilitate real-money gambling transactions.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate information and to notify us promptly of any unauthorized use of your account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">4. SMS Communications</h2>
            <p>
              If you opt in to SMS alerts, you consent to receive text messages from Golf Betting regarding match invitations, score updates, bet results, and match reminders. You may opt out at any time by replying <strong className="text-foreground">STOP</strong> to any message. Message and data rates may apply. Up to 4 messages per active match, per week.
            </p>
            <p>
              SMS messages are delivered via Plivo. Your phone number may be processed by Plivo when you use SMS features. Data processed through Plivo is subject to{" "}
              <a href="https://www.plivo.com/legal/privacy/" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                Plivo's Privacy Policy
              </a>.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">5. Acceptable Use</h2>
            <p>
              You agree not to misuse the App, including but not limited to: attempting to access other users' data, submitting false or misleading information, or using the App for any unlawful purpose.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">6. Disclaimer of Warranties</h2>
            <p>
              The App is provided "as is" without warranties of any kind. We do not guarantee that the App will be error-free or uninterrupted.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Golf Betting shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">8. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the App after changes are posted constitutes your acceptance of the revised Terms.
            </p>
          </section>

          <div className="pt-2 border-t border-border">
            <Link href="/privacy-policy" className="text-primary underline underline-offset-2 mr-4">
              Privacy Policy
            </Link>
            <Link href="/sms-opt-in" className="text-primary underline underline-offset-2">
              SMS Opt-In
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
