import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// Contesto dell'area clienti, deliberatamente separato da AuthContext (admin).
// Le due sessioni vivono su cookie e store diversi e non devono mai fare da
// ripiego l'una per l'altra: unirle qui rimetterebbe in circolo la confusione
// di privilegi che la separazione lato server serve a evitare.

export type CustomerAccount = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  mobile: string | null;
  status: string;
  lastLoginAt: string | null;
  /** Se ha impostato una password puo entrare senza aspettare l'email. */
  hasPassword: boolean;
};

type CustomerAuthState =
  | { status: "loading" }
  | { status: "authenticated"; account: CustomerAccount }
  | { status: "unauthenticated" };

type CustomerAuthContextValue = {
  state: CustomerAuthState;
  /** Chiede il link di accesso. Non rivela mai se l'indirizzo esiste. */
  requestMagicLink: (email: string) => Promise<{ message: string }>;
  /** Consuma il token ricevuto via email e apre la sessione. */
  consumeToken: (token: string) => Promise<CustomerAccount>;
  /** Accesso con la password, per chi ha scelto di impostarne una. */
  loginWithPassword: (
    email: string,
    password: string,
  ) => Promise<CustomerAccount>;
  /** Imposta o cambia la password dell'account. */
  setPassword: (input: {
    password: string;
    currentPassword?: string;
  }) => Promise<void>;
  /** Torna al solo accesso con link. */
  removePassword: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function CustomerAuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<CustomerAuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/account/me", { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { account: CustomerAccount };
        setState({ status: "authenticated", account: data.account });
      } else {
        setState({ status: "unauthenticated" });
      }
    } catch {
      setState({ status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requestMagicLink = useCallback(async (email: string) => {
    const res = await fetch("/api/account/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      throw new Error(
        await readError(res, "Non siamo riusciti a inviare il link. Riprova."),
      );
    }
    const data = (await res.json()) as { message: string };
    return { message: data.message };
  }, []);

  const consumeToken = useCallback(async (token: string) => {
    const res = await fetch("/api/account/magic-link/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      throw new Error(await readError(res, "Link non valido o scaduto."));
    }
    const data = (await res.json()) as { account: CustomerAccount };
    setState({ status: "authenticated", account: data.account });
    return data.account;
  }, []);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/account/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error(await readError(res, "Email o password non corretti."));
      }
      const data = (await res.json()) as { account: CustomerAccount };
      setState({ status: "authenticated", account: data.account });
      return data.account;
    },
    [],
  );

  const setPassword = useCallback(
    async (input: { password: string; currentPassword?: string }) => {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(
          await readError(res, "Non siamo riusciti a salvare la password."),
        );
      }
      // Il riepilogo dell'account porta `hasPassword`: rileggerlo tiene
      // allineata l'interfaccia senza doverlo dedurre qui.
      await refresh();
    },
    [refresh],
  );

  const removePassword = useCallback(async () => {
    const res = await fetch("/api/account/password", {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(
        await readError(res, "Non siamo riusciti a rimuovere la password."),
      );
    }
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/account/logout", {
      method: "POST",
      credentials: "include",
    });
    setState({ status: "unauthenticated" });
  }, []);

  return (
    <CustomerAuthContext.Provider
      value={{
        state,
        requestMagicLink,
        consumeToken,
        loginWithPassword,
        setPassword,
        removePassword,
        logout,
        refresh,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error(
      "useCustomerAuth deve essere usato dentro CustomerAuthProvider",
    );
  }
  return ctx;
}

export function useCustomerAccount(): CustomerAccount | null {
  const { state } = useCustomerAuth();
  return state.status === "authenticated" ? state.account : null;
}
