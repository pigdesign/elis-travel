import { LayoutDashboard, Map, Compass, Users, PlaneTakeoff } from 'lucide-react';

export type View = 'dashboard' | 'gite' | 'offerte' | 'leads';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

export function Sidebar({ currentView, setCurrentView }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'gite', label: 'Gite di Gruppo', icon: Map },
    { id: 'offerte', label: 'Offerte & Pacchetti', icon: Compass },
    { id: 'leads', label: 'Richieste CRM', icon: Users },
  ];

  return (
    <aside className="w-[260px] bg-white text-slate-800 flex flex-col h-full shrink-0 border-r border-slate-100 shadow-[2px_0_10px_rgba(0,0,0,0.02)] z-10 relative">
      <div className="p-8 pb-6">
        <h1 className="text-2xl font-black tracking-tighter text-slate-900 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-teal-500 to-brand-teal-600 flex items-center justify-center shadow-sm text-white">
            <PlaneTakeoff className="w-5 h-5" />
          </div>
          Elis<span className="text-brand-teal-500">Travel</span>
        </h1>
        <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-2 ml-10">Tour Operator</p>
      </div>
      
      <nav className="flex-1 px-4 space-y-1.5 mt-4">
        <div className="px-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">Menu Principale</div>
        {menuItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as View)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                isActive 
                  ? 'bg-brand-teal-50 text-brand-teal-600 shadow-[inset_0_1px_3px_rgba(25,158,156,0.1)]' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <div className={`w-5 h-5 flex items-center justify-center shrink-0 transition-colors ${isActive ? 'text-brand-teal-500' : 'text-slate-400'}`}>
                <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-6 m-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-brand-teal-100 border border-brand-teal-50 flex items-center justify-center text-sm font-bold text-brand-teal-600">
          EA
        </div>
        <div className="text-left flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate">Admin Elis</p>
          <p className="text-[10px] font-semibold text-brand-teal-600 uppercase tracking-wide">Proprietario</p>
        </div>
      </div>
    </aside>
  );
}
