import { useLocation } from "wouter";
import { Map, LayoutDashboard, Ticket, Users, LogOut, Loader2, Mountain, UserRound } from "lucide-react";
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
    { name: "Offerte", path: "~/admin/offers", matchPath: "/admin/offers", icon: Ticket },
    { name: "Richieste", path: "~/admin/leads", matchPath: "/admin/leads", icon: Users },
    { name: "Clienti", path: "~/admin/customers", matchPath: "/admin/customers", icon: UserRound },
  ];

  const handleLogout = () => {
    void logout().then(() => navigate("~/admin/login"));
  };

  return (
    <div className="min-h-[100dvh] flex bg-muted/20">
      <aside className="w-64 bg-primary text-primary-foreground flex-shrink-0 border-r border-primary-border hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0">
          <button
            onClick={() => navigate("~/")}
            className="flex items-center gap-2 group"
          >
            <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-accent-foreground">
              <Map className="w-4 h-4" />
            </div>
            <span className="text-xl font-serif font-bold text-white">Elis Travel</span>
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
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
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm text-left",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="flex-1">{item.name}</span>
                {item.matchPath === "/admin/leads" && newLeadsCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {newLeadsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-1">
          {state.user && (
            <div className="px-4 py-2 text-white/50 text-xs truncate">
              {state.user.name}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors font-medium text-sm text-left"
          >
            <LogOut className="w-5 h-5" />
            Esci
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
        <main className="flex-1 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
