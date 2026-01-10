import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Trophy, BarChart3, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Abstract Background Shapes */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      {/* Nav */}
      <nav className="container mx-auto px-6 py-6 flex justify-between items-center relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Trophy className="w-5 h-5" />
          </div>
          <span className="font-display font-bold text-2xl text-primary">Dorf on Golf</span>
        </div>
        <a 
          href="/api/login"
          className="px-6 py-2.5 rounded-full font-semibold text-primary border-2 border-primary/10 hover:bg-primary hover:text-white transition-all duration-300"
        >
          Sign In
        </a>
      </nav>

      {/* Hero */}
      <div className="container mx-auto px-6 pt-12 pb-24 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="font-display font-bold text-5xl md:text-7xl lg:text-8xl leading-tight mb-6 text-foreground">
              Track every stroke <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">
                Master your game.
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
              The modern scorecard for golf enthusiasts. Track real-time matches with friends, visualize stats, and keep your history in one beautiful place.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="/api/login"
                className="btn-primary text-lg px-8 py-4 group"
              >
                Start Tracking Free
                <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </motion.div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-24">
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
      
      {/* Footer */}
      <footer className="border-t border-primary/5 py-12 bg-white/50 backdrop-blur-sm">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p>© 2024 Dorf on Golf. Built with Replit.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc, delay }: { icon: any, title: string, desc: string, delay: number }) {
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
      <p className="text-muted-foreground leading-relaxed">
        {desc}
      </p>
    </motion.div>
  );
}
