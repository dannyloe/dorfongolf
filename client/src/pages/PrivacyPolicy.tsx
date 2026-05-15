import { motion } from "framer-motion";
import { Trophy, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
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
            <h1 className="font-display font-bold text-3xl md:text-4xl mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground text-sm mb-8">Last updated: May 2025</p>

            <div className="space-y-8 text-foreground">
              <Section title="Introduction">
                <p>
                  Golf Betting ("we", "us", or "our") is committed to protecting your privacy. This Privacy Policy explains
                  how we collect, use, and store information when you use our application. By using Golf Betting, you agree
                  to the practices described in this policy.
                </p>
              </Section>

              <Section title="Information We Collect">
                <p className="mb-3">We collect the following types of information:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Account information:</strong> Username, first and last name, email address, and password
                    (stored as a secure hash — we never store your plain-text password).
                  </li>
                  <li>
                    <strong>Golf data:</strong> Scores, match results, course details, bet amounts, and player statistics
                    you enter while using the app.
                  </li>
                  <li>
                    <strong>Phone number:</strong> Optionally provided for SMS features such as match notifications.
                  </li>
                  <li>
                    <strong>Usage data:</strong> Basic server logs including IP addresses and request timestamps, used
                    solely for debugging and security purposes.
                  </li>
                </ul>
              </Section>

              <Section title="How We Use Your Information">
                <p className="mb-3">We use your information solely to operate and improve the Golf Betting application:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>To authenticate you and keep your account secure.</li>
                  <li>To record and display your golf scores, bets, and match history.</li>
                  <li>To send SMS notifications related to matches you participate in (only if you opt in).</li>
                  <li>To process scorecard images you submit via text message using AI analysis.</li>
                  <li>To help you manage groups and invite other players.</li>
                </ul>
                <p className="mt-3">We do not sell, rent, or share your personal information with third parties for marketing purposes.</p>
              </Section>

              <Section title="SMS Communications">
                <p>
                  If you provide your phone number and opt in to SMS alerts, we may send you text messages related to
                  your golf matches, including match invitations, score updates, bet results, and match reminders.
                  We will not sell or share your phone number with third-party marketers. You can opt out at any time
                  by replying <strong>STOP</strong> to any message. For help, reply <strong>HELP</strong>.
                  Message and data rates may apply. Up to 4 messages per active match, per week.
                </p>
                <p className="mt-3">
                  SMS opt-in records are retained to demonstrate compliance with applicable regulations.
                </p>
              </Section>

              <Section title="Data Storage & Security">
                <p>
                  Your data is stored in a PostgreSQL database. We use industry-standard practices including encrypted
                  connections (HTTPS/TLS) and hashed passwords. Sessions are managed securely server-side. While we take
                  reasonable precautions, no system is completely immune to security risks, and we cannot guarantee
                  absolute security.
                </p>
                <p className="mt-3">
                  We retain your data for as long as your account exists. You may request deletion of your account and
                  associated data by contacting us.
                </p>
              </Section>

              <Section title="Third-Party Services">
                <p className="mb-3">Golf Betting integrates with the following third-party services:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>
                    <strong>Twilio:</strong> Used to send and receive SMS messages for match notifications and
                    scorecard submission. Your phone number may be processed by Twilio when you use SMS features.
                    Twilio's privacy policy applies to data processed through their platform.
                  </li>
                  <li>
                    <strong>Google Gemini AI:</strong> Used to analyze scorecard images you submit via text message.
                    Image data is sent to Google's API for processing. Google's privacy policy applies to data
                    processed through their platform.
                  </li>
                </ul>
              </Section>

              <Section title="Your Rights">
                <p>You have the right to access, correct, or request deletion of your personal data. To exercise these rights, please contact us using the information below.</p>
              </Section>

              <Section title="Contact">
                <p>
                  If you have any questions about this Privacy Policy or how we handle your data, please reach out
                  through the app or contact the administrator of your Golf Betting group.
                </p>
              </Section>
            </div>
          </div>
        </motion.div>
      </main>

      <footer className="border-t border-primary/5 py-8 bg-white/50 backdrop-blur-sm relative z-10">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>© 2025 Golf Betting. &nbsp;
            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
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
