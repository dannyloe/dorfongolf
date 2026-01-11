import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { Loader2 } from "lucide-react";

// Pages
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import MatchDetail from "@/pages/MatchDetail";
import QuickScoreEntry from "@/pages/QuickScoreEntry";
import Ledger from "@/pages/Ledger";
import CourseSetup from "@/pages/CourseSetup";
import NotFound from "@/pages/not-found";

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/" />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function PublicRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <Landing />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={PublicRoute} />
      <Route path="/dashboard">
        <PrivateRoute component={Dashboard} />
      </Route>
      <Route path="/match/:id">
        <PrivateRoute component={MatchDetail} />
      </Route>
      <Route path="/match/:id/scores">
        <PrivateRoute component={QuickScoreEntry} />
      </Route>
      <Route path="/ledger">
        <PrivateRoute component={Ledger} />
      </Route>
      <Route path="/courses">
        <PrivateRoute component={CourseSetup} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
