import { Link, useLocation } from "wouter";
import { Map, LayoutDashboard, Ticket, Users, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Offerte", href: "/admin/offers", icon: Ticket },
    { name: "Richieste", href: "/admin/leads", icon: Users },
  ];

  return (
    <div className="min-h-[100dvh] flex bg-muted/20">
      {/* Sidebar */}
      <aside className="w-64 bg-primary text-primary-foreground flex-shrink-0 border-r border-primary-border hidden md:flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-white/10 shrink-0">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center text-accent-foreground">
              <Map className="w-4 h-4" />
            </div>
            <span className="text-xl font-serif font-bold text-white">Elis Travel</span>
          </Link>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (location === "/admin" && item.href === "/admin/dashboard");
            return (
              <Link 
                key={item.name} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-medium text-sm",
                  isActive 
                    ? "bg-accent text-accent-foreground" 
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl text-white/70 hover:bg-white/10 hover:text-white transition-colors font-medium text-sm">
            <LogOut className="w-5 h-5" />
            Esci
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-border flex items-center px-8 shadow-sm shrink-0 md:hidden justify-between">
          <div className="font-bold font-serif text-primary text-xl">Elis Admin</div>
          <Link href="/" className="text-muted-foreground hover:text-foreground">Esci</Link>
        </header>
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
