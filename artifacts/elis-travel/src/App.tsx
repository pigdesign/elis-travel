import { Switch, Route, Router as WouterRouter } from "wouter";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AuthProvider } from "@/contexts/AuthContext";
import { HomePage } from "@/pages/(public)/HomePage";
import { ContactsPage } from "@/pages/(public)/ContactsPage";
import { OffersPage as PublicOffersPage } from "@/pages/(public)/OffersPage";
import { OfferDetailPage as PublicOfferDetailPage } from "@/pages/(public)/OfferDetailPage";
import { ExcursionsPage as PublicExcursionsPage } from "@/pages/(public)/ExcursionsPage";
import { ExcursionDetailPage as PublicExcursionDetailPage } from "@/pages/(public)/ExcursionDetailPage";
import { RidentPage } from "@/pages/(public)/RidentPage";
import { PrivacyPolicyPage } from "@/pages/(public)/PrivacyPolicyPage";
import { CookiePolicyPage } from "@/pages/(public)/CookiePolicyPage";
import { TermsConditionsPage } from "@/pages/(public)/TermsConditionsPage";
import { BookingPortalPage } from "@/pages/(public)/BookingPortalPage";
import { AdminLayout } from "@/pages/(admin)/layout/AdminLayout";
import { LoginPage } from "@/pages/(admin)/login/LoginPage";
import { CookieBanner } from "@/components/layout/CookieBanner";
import { DashboardPage } from "@/pages/(admin)/dashboard/DashboardPage";
import { ExcursionsPage } from "@/pages/(admin)/excursions/ExcursionsPage";
import { ExcursionDetailPage } from "@/pages/(admin)/excursions/ExcursionDetailPage";
import { VehiclesPage } from "@/pages/(admin)/vehicles/VehiclesPage";
import { OffersPage } from "@/pages/(admin)/offers/OffersPage";
import { OfferDetailPage } from "@/pages/(admin)/offers/OfferDetailPage";
import { LeadsPage } from "@/pages/(admin)/leads/LeadsPage";
import { CustomersPage } from "@/pages/(admin)/customers/CustomersPage";
import { SettingsPage } from "@/pages/(admin)/settings/SettingsPage";
import {
  PosterPreviewPage,
  type PosterSourceKind,
} from "@/pages/(admin)/pdf/PosterPreviewPage";
import {
  BOOKING_PORTAL_SESSION_KEY,
  cleanBookingPortalPath,
  selectBookingPortalToken,
} from "@/lib/booking-portal-token";
import { captureStripeReturnFromWindow } from "@/lib/booking-stripe-recovery";

const queryClient = new QueryClient();

function readBookingPortalToken(legacyToken?: string): string {
  if (typeof window === "undefined") return legacyToken ?? "";

  let sessionToken: string | null = null;
  try {
    sessionToken = window.sessionStorage.getItem(BOOKING_PORTAL_SESSION_KEY);
  } catch {
    // Alcuni browser possono disabilitare lo storage: il link resta comunque
    // utilizzabile nella navigazione corrente.
  }

  const queryToken = new URLSearchParams(window.location.search).get("token");
  const fragmentToken = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  ).get("token");
  const token = selectBookingPortalToken({
    queryToken: fragmentToken ?? queryToken,
    legacyToken,
    sessionToken,
  });

  if (token) {
    try {
      window.sessionStorage.setItem(BOOKING_PORTAL_SESSION_KEY, token);
    } catch {
      // Nessun fallback persistente: il token resta nello state React.
    }
  }

  if (
    fragmentToken ||
    queryToken ||
    legacyToken ||
    window.location.search ||
    window.location.hash
  ) {
    const cleanPath = cleanBookingPortalPath(window.location.pathname);
    window.history.replaceState(window.history.state, "", cleanPath);
  }

  return token;
}

function BookingPortalRoute({ legacyToken }: { legacyToken?: string }) {
  const [token] = useState(() => readBookingPortalToken(legacyToken));
  return <BookingPortalPage token={token} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/offerte" component={PublicOffersPage} />
      <Route path="/offerte/:slug">
        {(params) => <PublicOfferDetailPage offerIdOrSlug={params.slug} />}
      </Route>
      <Route path="/gite" component={PublicExcursionsPage} />
      <Route path="/gite/:slug">
        {(params) => (
          <PublicExcursionDetailPage excursionIdOrSlug={params.slug} />
        )}
      </Route>
      <Route path="/rident" component={RidentPage} />
      <Route path="/contatti" component={ContactsPage} />
      <Route path="/privacy-policy" component={PrivacyPolicyPage} />
      <Route path="/cookie-policy" component={CookiePolicyPage} />
      <Route path="/termini-e-condizioni" component={TermsConditionsPage} />
      <Route path="/prenotazione/:token">
        {(params) => <BookingPortalRoute legacyToken={params.token} />}
      </Route>
      <Route path="/prenotazione">{() => <BookingPortalRoute />}</Route>

      <Route path="/admin/login" component={LoginPage} />

      <Route path="/admin" nest>
        <Switch>
          {/* Anteprima locandina: fuori da AdminLayout per stampare la pagina pulita */}
          <Route path="/pdf/:kind/:id">
            {(params) => (
              <PosterPreviewPage
                kind={params.kind as PosterSourceKind}
                id={params.id}
              />
            )}
          </Route>
          <Route>
            <AdminLayout>
              <Switch>
                <Route path="/" component={DashboardPage} />
                <Route path="/dashboard" component={DashboardPage} />
                <Route path="/excursions" component={ExcursionsPage} />
                <Route path="/excursions/:id">
                  {(params) => <ExcursionDetailPage excursionId={params.id} />}
                </Route>
                <Route path="/vehicles" component={VehiclesPage} />
                <Route path="/offers" component={OffersPage} />
                <Route path="/offers/:id">
                  {(params) => <OfferDetailPage offerId={params.id} />}
                </Route>
                <Route path="/leads" component={LeadsPage} />
                <Route path="/customers" component={CustomersPage} />
                <Route path="/settings" component={SettingsPage} />
                <Route component={NotFound} />
              </Switch>
            </AdminLayout>
          </Route>
        </Switch>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  // Deve avvenire prima del mount delle route: Stripe aggiunge temporaneamente
  // il client secret all'URL di ritorno, che viene catturato in memoria e subito
  // rimosso dalla barra del browser.
  captureStripeReturnFromWindow();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
          <CookieBanner />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
