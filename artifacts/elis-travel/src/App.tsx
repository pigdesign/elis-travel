import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { HomePage } from "@/pages/(public)/HomePage";
import { AdminLayout } from "@/pages/(admin)/layout/AdminLayout";
import { DashboardPage } from "@/pages/(admin)/dashboard/DashboardPage";
import { OffersPage } from "@/pages/(admin)/offers/OffersPage";
import { LeadsPage } from "@/pages/(admin)/leads/LeadsPage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      
      {/* Admin routes wrapped in Layout */}
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
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
