import { motion } from "framer-motion";
import { Trophy, MessageSquare, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function SmsConsent() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div style={{ padding: "40px", maxWidth: "900px", margin: "0 auto", fontFamily: "system-ui, Arial, sans-serif", lineHeight: "1.6" }}>
        <h1>Golf Betting SMS Notifications</h1>
        <p><strong>ETG Inc. d/b/a Golf Betting</strong> sends optional transactional SMS notifications regarding golf matches, scorecards, and results to users of dorfongolf.com.</p>
        <h2>How to Opt In</h2>
        <ol>
          <li>Create an account or log in at <a href="https://dorfongolf.com">dorfongolf.com</a></li>
          <li>Go to your account settings and add your phone number (this step is optional)</li>
          <li>
            Check the consent checkbox with the following exact text:<br /><br />
            <strong>"I consent to receive SMS notifications from ETG Inc. d/b/a Golf Betting for match updates and score confirmations. (Message &amp; data rates may apply. This is optional and not required to create an account or use the service.)"</strong>
          </li>
        </ol>
        <p><strong>SMS is completely optional.</strong> You can use all features of Golf Betting without opting in to SMS.</p>
        <p>
          <strong>Message Frequency:</strong> 1–5 messages per golf round.<br />
          Reply <strong>STOP</strong> to unsubscribe at any time.<br />
          Reply <strong>HELP</strong> for help.
        </p>
        <p>
          <a href="/privacy">Privacy Policy</a> |{" "}
          <a href="/terms">Terms of Service</a>
        </p>
      </div>

      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <nav className="container mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-2xl text-primary">Golf Betting</span>
        </div>
        <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </nav>

      <main className="container mx-auto px-6 pb-24 relative z-10 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="glass-card rounded-2xl p-8 md:p-12 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-primary" />
              </div>
              <h1 className="font-display font-bold text-3xl md:text-4xl">Golf Betting SMS Notifications</h1>
            </div>
            <p className="text-sm font-medium text-foreground mb-1">ETG Inc. d/b/a Golf Betting</p>
            <p className="text-muted-foreground text-sm mb-8">
              ETG Inc. d/b/a Golf Betting sends optional transactional SMS messages related to your golf matches,
              including match confirmations, scorecard results, and bet summaries. You are never required to provide
              a phone number to create an account or use the app.
            </p>

            <div className="space-y-8 text-foreground">
              <Section title="How to Opt In">
                <p className="mb-4">SMS notifications are set up from within the app after you have an account:</p>
                <ol className="list-decimal pl-5 space-y-4">
                  <li>Create an account or log in at <Link href="/" className="text-primary underline underline-offset-2">golfbetting.app</Link>.</li>
                  <li>Go to your <strong>Profile</strong> page (tap your name in the menu).</li>
                  <li>
                    Enter your phone number and check the consent box:
                    <span className="block mt-2 p-3 bg-muted rounded-lg text-sm text-muted-foreground italic">
                      "I agree to receive SMS notifications for match updates and score confirmations from Golf Betting
                      (optional — not required to use the service)."
                    </span>
                  </li>
                </ol>
                <p className="mt-4 text-sm">SMS consent is completely optional and is not required to use any feature of the app.</p>
              </Section>

              <div className="text-muted-foreground leading-relaxed space-y-2 text-sm">
                <p><strong className="text-foreground">Message frequency:</strong> Typically 1–5 messages per golf round or match. Message &amp; data rates may apply.</p>
                <p>Reply <strong className="text-foreground">STOP</strong> to any message to opt out at any time.</p>
                <p>Reply <strong className="text-foreground">HELP</strong> to any message for assistance.</p>
                <p className="pt-1">
                  <Link href="/privacy" className="text-primary underline underline-offset-2">Privacy Policy</Link>
                  {" · "}
                  <Link href="/terms" className="text-primary underline underline-offset-2">Terms &amp; Conditions</Link>
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-primary/5 py-8 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>© 2025 Golf Betting. &nbsp;
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            {" · "}
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display font-bold text-xl mb-3 text-foreground">{title}</h2>
      <div className="text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}
