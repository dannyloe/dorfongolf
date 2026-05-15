import { motion } from "framer-motion";
import { Trophy, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Terms() {
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
            <h1 className="font-display font-bold text-3xl md:text-4xl mb-2">Terms &amp; Conditions</h1>
            <p className="text-muted-foreground text-sm mb-8">Last updated: May 2025</p>

            <div className="space-y-8 text-foreground">
              <Section title="Acceptance of Terms">
                <p>
                  By accessing or using Golf Betting (the "App"), you agree to be bound by these Terms and Conditions.
                  If you do not agree to these terms, please do not use the App. We may update these terms from time to
                  time; continued use of the App constitutes acceptance of any revised terms.
                </p>
              </Section>

              <Section title="Use of the App">
                <p className="mb-3">You agree to use Golf Betting only for lawful purposes and in accordance with these terms. You agree not to:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Use the App for any fraudulent, illegal, or unauthorized purpose.</li>
                  <li>Attempt to gain unauthorized access to any part of the App or its servers.</li>
                  <li>Upload or transmit any malicious code, spam, or harmful content.</li>
                  <li>Impersonate another person or entity.</li>
                  <li>Interfere with or disrupt the integrity or performance of the App.</li>
                </ul>
              </Section>

              <Section title="User Accounts">
                <p>
                  You are responsible for maintaining the confidentiality of your username and password and for all
                  activity that occurs under your account. You agree to notify us immediately of any unauthorized use
                  of your account. We reserve the right to suspend or terminate accounts that violate these terms or
                  engage in conduct we deem harmful to other users or the App.
                </p>
              </Section>

              <Section title="Betting Disclaimer">
                <p>
                  Golf Betting is a <strong>score tracking and bet record-keeping tool only</strong>. It is designed
                  to help friends log and tally the friendly wagers they have already agreed to among themselves during
                  golf rounds. The App does not facilitate, process, or hold any real money, and it is not a gambling
                  platform.
                </p>
                <p className="mt-3">
                  Users are solely responsible for ensuring their activities comply with all applicable local, state,
                  and federal laws regarding gambling and wagering. Golf Betting makes no representation that any
                  feature of the App is legal in your jurisdiction. Use the App responsibly.
                </p>
              </Section>

              <Section title="Intellectual Property">
                <p>
                  All content, design, and code within the App are the property of Golf Betting and its creators.
                  You may not copy, reproduce, distribute, or create derivative works from any part of the App
                  without express written permission.
                </p>
              </Section>

              <Section title="Limitation of Liability">
                <p>
                  Golf Betting is provided "as is" without warranties of any kind, express or implied. We do not
                  guarantee that the App will be error-free, uninterrupted, or free of security vulnerabilities.
                </p>
                <p className="mt-3">
                  To the fullest extent permitted by law, Golf Betting and its creators shall not be liable for any
                  indirect, incidental, special, consequential, or punitive damages arising from your use of the App,
                  including but not limited to loss of data, loss of profits, or any disputes arising from bet
                  tracking records.
                </p>
              </Section>

              <Section title="Governing Rules">
                <p>
                  These Terms and Conditions shall be governed by and construed in accordance with applicable law.
                  Any disputes arising under these terms shall be resolved through good-faith negotiation between
                  the parties. If a dispute cannot be resolved informally, the parties agree to submit to the
                  jurisdiction of the courts in the applicable jurisdiction.
                </p>
              </Section>

              <Section title="Contact">
                <p>
                  If you have any questions about these Terms and Conditions, please reach out through the App or
                  contact the administrator of your Golf Betting group.
                </p>
              </Section>
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
