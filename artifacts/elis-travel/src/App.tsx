import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AuthProvider } from "@/contexts/AuthContext";
import { HomePage } from "@/pages/(public)/HomePage";
import { AdminLayout } from "@/pages/(admin)/layout/AdminLayout";
import { LoginPage } from "@/pages/(admin)/login/LoginPage";
import { DashboardPage } from "@/pages/(admin)/dashboard/DashboardPage";
import { OffersPage } from "@/pages/(admin)/offers/OffersPage";
import { LeadsPage } from "@/pages/(admin)/leads/LeadsPage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />

      <Route path="/admin/login" component={LoginPage} />

      <Route path="/admin" nest>
        <AdminLayout>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/offers" component={OffersPage} />
            <Route path="/leads" component={LeadsPage} />
            <Route component={NotFound} />
          </Switch>
        </AdminLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
