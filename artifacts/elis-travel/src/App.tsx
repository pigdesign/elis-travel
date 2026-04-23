import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AuthProvider } from "@/contexts/AuthContext";
import { HomePage } from "@/pages/(public)/HomePage";
import { ContactsPage } from "@/pages/(public)/ContactsPage";
import { AdminLayout } from "@/pages/(admin)/layout/AdminLayout";
import { LoginPage } from "@/pages/(admin)/login/LoginPage";
import { DashboardPage } from "@/pages/(admin)/dashboard/DashboardPage";
import { ExcursionsPage } from "@/pages/(admin)/excursions/ExcursionsPage";
import { ExcursionDetailPage } from "@/pages/(admin)/excursions/ExcursionDetailPage";
import { OffersPage } from "@/pages/(admin)/offers/OffersPage";
import { OfferDetailPage } from "@/pages/(admin)/offers/OfferDetailPage";
import { LeadsPage } from "@/pages/(admin)/leads/LeadsPage";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/contatti" component={ContactsPage} />

      <Route path="/admin/login" component={LoginPage} />

      <Route path="/admin" nest>
        <AdminLayout>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/excursions" component={ExcursionsPage} />
            <Route path="/excursions/:id">
              {(params) => <ExcursionDetailPage excursionId={params.id} />}
            </Route>
            <Route path="/offers" component={OffersPage} />
            <Route path="/offers/:id">
              {(params) => <OfferDetailPage offerId={params.id} />}
            </Route>
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
