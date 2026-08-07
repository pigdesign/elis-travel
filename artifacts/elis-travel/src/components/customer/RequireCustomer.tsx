import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

/**
 * Guardia delle pagine dell'area clienti.
 *
 * E una comodita per l'utente, non una misura di sicurezza: ogni endpoint
 * protetto ha la propria verifica lato server (requireCustomer), che rilegge
 * lo stato dell'account dal database a ogni richiesta. Qui evitiamo soltanto di
 * mostrare una pagina vuota a chi non ha sessione.
 */
export function RequireCustomer({ children }: { children: ReactNode }) {
  const { state } = useCustomerAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (state.status === "unauthenticated") {
      // La destinazione viene conservata: dopo l'accesso si torna dove si era.
      try {
        window.sessionStorage.setItem(
          "elis-travel.account-redirect",
          location,
        );
      } catch {
        // Storage disabilitato: si perde solo il ritorno alla pagina esatta.
      }
      navigate("/accedi");
    }
  }, [state.status, location, navigate]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  if (state.status === "unauthenticated") return null;

  return <>{children}</>;
}
