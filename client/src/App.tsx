import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/Layout";
import { Loader2 } from "lucide-react";

// Pages
import Landing from "@/pages/Landing";
import Register from "@/pages/Register";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import Terms from "@/pages/Terms";
import Dashboard from "@/pages/Dashboard";
import MatchDetail from "@/pages/MatchDetail";
import QuickScoreEntry from "@/pages/QuickScoreEntry";
import Ledger from "@/pages/Ledger";
import CourseSetup from "@/pages/CourseSetup";
import PlayerMaintenance from "@/pages/PlayerMaintenance";
import RyderCupList from "@/pages/RyderCupList";
import RyderCupCreate from "@/pages/RyderCupCreate";
import RyderCupEvent from "@/pages/RyderCupEvent";
import RyderCupScorecard from "@/pages/RyderCupScorecard";
import Profile from "@/pages/Profile";
import Groups from "@/pages/Groups";
import SmsOptIn from "@/pages/SmsOptIn";
import SmsConsent from "@/pages/SmsConsent";
import PhoneSetup from "@/pages/PhoneSetup";
import AdminScanLogs from "@/pages/AdminScanLogs";
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

function RegisterRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <Register />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={PublicRoute} />
      <Route path="/register" component={RegisterRoute} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms" component={Terms} />
      <Route path="/sms" component={SmsConsent} />
      <Route path="/sms-opt-in">
        <Redirect to="/sms" />
      </Route>
      <Route path="/phone-setup" component={PhoneSetup} />
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
      <Route path="/players">
        <PrivateRoute component={PlayerMaintenance} />
      </Route>
      <Route path="/ryder-cup">
        <PrivateRoute component={RyderCupList} />
      </Route>
      <Route path="/ryder-cup/new">
        <PrivateRoute component={RyderCupCreate} />
      </Route>
      <Route path="/ryder-cup/:id">
        <PrivateRoute component={RyderCupEvent} />
      </Route>
      <Route path="/ryder-cup/pairing/:pairingId/scorecard">
        <PrivateRoute component={RyderCupScorecard} />
      </Route>
      <Route path="/profile">
        <PrivateRoute component={Profile} />
      </Route>
      <Route path="/groups">
        <PrivateRoute component={Groups} />
      </Route>
      <Route path="/admin/scan-logs">
        <PrivateRoute component={AdminScanLogs} />
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
