import { ArrowRight, Inbox, Map, Activity, DollarSign, Clock, Compass } from 'lucide-react';
import { View } from './Sidebar';
import { MOCK_METRICS, MOCK_LEADS, MOCK_GITE } from '../../data/mockData';

interface DashboardProps {
  setCurrentView: (view: View) => void;
}

export function Dashboard({ setCurrentView }: DashboardProps) {
  const upcomingGite = MOCK_GITE.filter(g => g.data > new Date().toISOString() || g.stato !== 'Annullata').slice(0, 3);
  const recentLeads = MOCK_LEADS.slice(0, 5);

  return (
    <div className="max-w-[1200px] mx-auto w-full h-full flex flex-col pt-2 pb-6 animate-in fade-in duration-500 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Panoramica</h2>
          <p className="text-xs text-slate-500">I dati principali della tua agenzia.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="bg-brand-accent-500 text-white border border-brand-accent-600 hover:bg-brand-accent-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
            + Gita
          </button>
          <button className="bg-brand-accent-500 text-white border border-brand-accent-600 hover:bg-brand-accent-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
            + Offerta
          </button>
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
            + Richiesta Manuale
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-12 gap-5 mb-5">
        <div className="col-span-12 md:col-span-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Inbox className="w-16 h-16 text-brand-teal-500" />
          </div>
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider relative z-10">Nuove Richieste</p>
          <div className="flex justify-between items-end mt-4 relative z-10">
            <span className="text-3xl font-black text-slate-800">{MOCK_METRICS.nuoveRichieste}</span>
            <span className="text-emerald-500 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-md">+3 oggi</span>
          </div>
        </div>
        
        <div className="col-span-12 md:col-span-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Compass className="w-16 h-16 text-brand-teal-500" />
          </div>
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider relative z-10">Offerte Attive</p>
          <div className="flex justify-between items-end mt-4 relative z-10">
            <span className="text-3xl font-black text-slate-800">{MOCK_METRICS.offerteAttive}</span>
            <span className="text-slate-400 text-xs font-bold italic bg-slate-50 px-2 py-1 rounded-md">Sul sito</span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Map className="w-16 h-16 text-brand-teal-500" />
          </div>
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider relative z-10">Gite in Programma</p>
          <div className="flex justify-between items-end mt-4 relative z-10">
            <span className="text-3xl font-black text-slate-800">{MOCK_METRICS.giteInProgramma}</span>
            <span className="text-amber-600 text-xs font-bold bg-amber-50 px-2 py-1 rounded-md">2 in attesa</span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-3 bg-gradient-to-br from-brand-teal-500 to-brand-teal-700 rounded-2xl p-5 shadow-lg shadow-brand-teal-500/20 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-16 h-16 text-white" />
          </div>
          <p className="text-xs text-brand-teal-100 uppercase font-bold tracking-wider relative z-10">Margine Mensile Est.</p>
          <div className="flex justify-between items-end mt-4 relative z-10">
            <span className="text-3xl font-black text-white">€ {(MOCK_METRICS.margineMese).toLocaleString('it-IT')}</span>
            <span className="text-brand-teal-50 text-xs font-bold bg-white/20 px-2 py-1 rounded-md backdrop-blur-sm">Goal 85%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-5 flex-1 mb-4">
        {/* Recent Leads + Alerts - Spans 4 columns */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
          
          {/* Operative Alerts */}
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-3 opacity-10">
               <Activity className="w-16 h-16 text-red-500" />
             </div>
             <h3 className="font-bold text-red-800 flex items-center gap-2 mb-3">
               <span className="w-2 h-2 rounded-full bg-red-500"></span>
               Da Attenzionare Oggi
             </h3>
             <ul className="text-sm text-red-900 space-y-2.5 relative z-10">
               <li className="flex justify-between items-center cursor-pointer hover:underline" onClick={() => setCurrentView('leads')}>
                 <span>2 Leads non richiamati</span>
                 <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Urgenti</span>
               </li>
               <li className="flex justify-between items-center cursor-pointer hover:underline" onClick={() => setCurrentView('gite')}>
                 <span>1 Gita sotto soglia min.</span>
                 <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">-14 gg</span>
               </li>
               <li className="flex justify-between items-center cursor-pointer hover:underline" onClick={() => setCurrentView('gite')}>
                 <span>3 Saldi mancanti</span>
                 <span className="text-[10px] bg-red-200 text-red-800 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">€ 450</span>
               </li>
             </ul>
          </div>
          
          <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] flex flex-col flex-1">
            <div className="flex justify-between items-center p-5 pb-3 border-b border-slate-50">
              <h2 className="font-bold text-slate-800">Ultime Richieste (CRM)</h2>
              <button onClick={() => setCurrentView('leads')} className="text-[10px] bg-brand-teal-50 text-brand-teal-700 font-bold px-3 py-1 rounded-full cursor-pointer hover:bg-brand-teal-100 transition-colors">
                Vedi tutte &rarr;
              </button>
            </div>
            <div className="p-3 pt-0 space-y-2 overflow-hidden flex-1">
              {recentLeads.map(lead => (
                <div key={lead.id} onClick={() => setCurrentView('leads')} className="p-3 rounded-xl border border-transparent hover:border-brand-teal-100 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition-all duration-200 group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 group-hover:bg-slate-200 transition-colors">
                      {lead.nome.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <div className="max-w-[120px]">
                      <p className="font-bold text-sm truncate text-slate-900 leading-tight">{lead.nome}</p>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{lead.interesse}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full block mb-1 inline-block border ${ 
                      lead.stato === 'Nuova' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      lead.stato === 'Contattato' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      lead.stato === 'Preventivo Inviato' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      lead.stato === 'Vinto/Confermato' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {lead.stato.split('/')[0]}
                    </span>
                    <span className="text-[10px] text-slate-400 block">{lead.tempo.replace('2 ore fa', '2m fa').replace('5 ore fa', '1h fa').replace('1 giorno fa','3h fa')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Focus Gite in Partenza - Spans 8 columns layout */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] flex flex-col overflow-hidden">
             <div className="flex justify-between items-center p-5 mb-0 border-b border-slate-50">
                <h2 className="font-bold text-slate-800">Gestione Gite ed Escursioni</h2>
                <button onClick={() => setCurrentView('gite')} className="text-xs text-brand-teal-600 font-bold cursor-pointer hover:underline">
                  Vedi tutte &rarr;
                </button>
             </div>
             <div className="overflow-x-auto px-5 pb-5 pt-3">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 uppercase">
                      <th className="pb-2 font-semibold">Destinazione / Data</th>
                      <th className="pb-2 font-semibold">Veicolo</th>
                      <th className="pb-2 font-semibold min-w-[120px]">Riempimento</th>
                      <th className="pb-2 font-semibold text-right">Economia</th>
                      <th className="pb-2 font-semibold text-right pl-4">Stato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                     {upcomingGite.map(gita => {
                       const percentualeIscritti = (gita.iscritti / gita.maxIscritti) * 100;
                       const percentoMinimo = (gita.minimo / gita.maxIscritti) * 100;
                       const confermata = gita.iscritti >= gita.minimo;
                       
                       const incasso = gita.iscritti * gita.prezzocliente;
                       const costiTotali = gita.costi.bus + (gita.iscritti * (gita.costi.pastoPpx + gita.costi.ingressiPpx + gita.costi.extraPpx));
                       const margine = incasso - costiTotali;
                       
                       let bageStato = 'bg-slate-100 text-slate-700';
                       if (gita.stato === 'Adesioni Aperte') bageStato = 'bg-amber-100 text-amber-700';
                       if (gita.stato === 'Confermata') bageStato = 'bg-emerald-100 text-emerald-700';

                       return (
                         <tr key={gita.id} className="group">
                           <td className="py-3">
                             <p className="font-bold text-sm text-slate-900">{gita.titolo}</p>
                             <p className="text-slate-400">{new Date(gita.data).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric'})}</p>
                           </td>
                           <td className="py-3 text-slate-600">{gita.veicolo.replace(' posti', 'p.')}</td>
                           <td className="py-3 pr-4">
                             <div className="flex items-center gap-2 mb-1">
                               <span className="font-bold">{gita.iscritti}/{gita.maxIscritti}</span>
                               <span className={`text-[10px] ${confermata ? 'text-emerald-600' : 'text-amber-600'}`}>
                                 {confermata ? '(OK)' : `-${gita.minimo - gita.iscritti} per min`}
                               </span>
                             </div>
                             <div className="h-2 bg-slate-200 rounded-full relative w-24 overflow-visible">
                               <div 
                                  className={`h-full rounded-full transition-all duration-1000 ${confermata ? 'bg-brand-teal-500' : 'bg-brand-teal-500'}`}
                                  style={{ width: `${percentualeIscritti}%` }}
                               />
                               <div 
                                 className="absolute top-[-4px] bottom-[-4px] w-[2px] bg-red-500 z-10"
                                 style={{ left: `${percentoMinimo}%` }}
                               />
                             </div>
                           </td>
                           <td className="py-3 text-right">
                             <p className="font-bold text-sm">€{Math.max(margine, 0)}</p>
                             <p className="text-[10px] text-slate-400">{margine < 0 ? 'In perdita' : 'Margine stimato'}</p>
                           </td>
                           <td className="py-3 text-right pl-4">
                             <span className={`text-[10px] font-semibold uppercase px-2 py-1 rounded-full ${bageStato}`}>
                               {gita.stato === 'Adesioni Aperte' ? 'Aperta' : 'Confermata'}
                             </span>
                           </td>
                         </tr>
                       )
                     })}
                  </tbody>
                </table>
             </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
             {/* Sub content blocks */}
             <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)]">
                <div className="flex justify-between items-center mb-5">
                   <h2 className="font-bold text-slate-800 text-sm">Pacchetti in Vetrina</h2>
                   <button onClick={() => setCurrentView('offerte')} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors">+ Nuova</button>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {/* Just some dummy summary data for offers */}
                  <div className="flex gap-3 items-center p-3 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
                    <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center text-xl shrink-0 shadow-sm border border-slate-100">🌴</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate">Fuga alle Maldive</p>
                      <p className="text-[10px] text-slate-500 truncate">7 Notti | Da €1.850</p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md">Pubbl.</span>
                  </div>
                  <div className="flex gap-3 items-center p-3 border border-slate-100 rounded-xl hover:border-slate-200 transition-colors">
                    <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center text-xl shrink-0 shadow-sm border border-slate-100">🇪🇸</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-xs truncate">Tour Andalusia</p>
                      <p className="text-[10px] text-slate-500 truncate">5 Notti | Da €890</p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 px-2 py-1 rounded-md">Bozza</span>
                  </div>
                </div>
             </div>

             <div className="bg-gradient-to-br from-brand-teal-50 to-white border border-brand-teal-100 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between">
                <div>
                   <h2 className="font-bold text-brand-teal-900 text-sm mb-1">Focus Riempimento</h2>
                   <p className="text-[10px] text-brand-teal-700 mb-5">Prossime in partenza con priorità di vendita</p>
                </div>
                <div className="space-y-4 pb-1">
                   {upcomingGite.map(gita => {
                     const perc = Math.round((gita.iscritti / gita.maxIscritti) * 100);
                     const critico = perc < (gita.minimo / gita.maxIscritti) * 100;
                     return (
                      <div key={'focus-'+gita.id}>
                        <div className="flex justify-between text-[10px] font-bold mb-1">
                          <span className="text-brand-teal-900">{gita.destinazione}</span>
                          <span className={critico ? 'text-red-500' : 'text-brand-teal-700'}>{perc}% {critico && '⚠️'}</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${critico ? 'bg-red-400' : 'bg-brand-teal-500'}`} style={{width: `${perc}%`}}></div>
                        </div>
                      </div>
                     )
                   })}
                </div>
             </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

