import { useLocation } from "wouter";
import { LayoutDashboard, Ticket, Users, LogOut, Loader2, Mountain, UserRound, Bus } from "lucide-react";
import logoImg from "@assets/logo_sito_bianco_ELISTRAVEL_def_1776683532402.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useListLeads } from "@workspace/api-client-react";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { state, logout } = useAuth();
  const { data: leads = [] } = useListLeads();
  const newLeadsCount = leads.filter((l) => l.status === "new").length;

  useEffect(() => {
    if (state.status === "unauthenticated") {
      navigate("~/admin/login");
    }
  }, [state.status, navigate]);

  if (state.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return null;
  }

  const navItems = [
    { name: "Dashboard", path: "~/admin/dashboard", matchPath: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Gite di Gruppo", path: "~/admin/excursions", matchPath: "/admin/excursions", icon: Mountain },
    { name: "Mezzi", path: "~/admin/vehicles", matchPath: "/admin/vehicles", icon: Bus },
    { name: "Offerte", path: "~/admin/offers", matchPath: "/admin/offers", icon: Ticket },
    { name: "Richieste", path: "~/admin/leads", matchPath: "/admin/leads", icon: Users },
    { name: "Clienti", path: "~/admin/customers", matchPath: "/admin/customers", icon: UserRound },
  ];

  const handleLogout = () => {
    void logout().then(() => navigate("~/admin/login"));
  };

  return (
    <div className="min-h-[100dvh] flex bg-muted/30">
      <aside className="w-64 flex-shrink-0 hidden md:flex flex-col"
        style={{ background: "linear-gradient(160deg, hsl(193 95% 28%) 0%, hsl(193 90% 22%) 100%)" }}
      >
        <div className="h-16 flex items-center px-5 border-b border-white/10 shrink-0">
          <button
            onClick={() => navigate("~/")}
            className="flex items-center gap-2.5 group"
          >
            <img
              src={logoImg}
              alt="Elis Travel"
              className="h-10 w-auto object-contain"
            />
          </button>
        </div>

        <nav className="flex-1 py-5 px-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              location === item.matchPath ||
              location.startsWith(item.matchPath + "/") ||
              (location === "/admin" && item.matchPath === "/admin/dashboard");
            return (
              <button
                key={item.name}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all font-medium text-sm text-left",
                  isActive
                    ? "bg-accent text-white shadow-sm"
                    : "text-white/65 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className={cn("w-4.5 h-4.5 flex-shrink-0", isActive ? "text-white" : "text-white/65")} />
                <span className="flex-1 text-[13px]">{item.name}</span>
                {item.matchPath === "/admin/leads" && newLeadsCount > 0 && (
                  <span className="bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none shadow-sm">
                    {newLeadsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-0.5">
          {state.user && (
            <div className="px-3.5 py-2 text-white/40 text-xs truncate">
              {state.user.name}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-white/65 hover:bg-white/10 hover:text-white transition-all font-medium text-sm text-left"
          >
            <LogOut className="w-4.5 h-4.5" />
            <span className="text-[13px]">Esci</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-border flex items-center px-8 shadow-sm shrink-0 md:hidden justify-between">
          <div className="font-bold font-serif text-primary text-xl">Elis Admin</div>
          <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            Esci
          </button>
        </header>
        <main className="flex-1 p-6 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
