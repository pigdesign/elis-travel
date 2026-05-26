import { Calendar, Users, Info, ChevronDown, ChevronUp, MapPin, Bus, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import { MOCK_GITE } from '../../data/mockData';
import { useState } from 'react';
import React from 'react';
import { GitaDetail } from './GitaDetail';

export function Gite() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedGitaId, setSelectedGitaId] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  if (selectedGitaId) {
    return <GitaDetail gitaId={selectedGitaId} onBack={() => setSelectedGitaId(null)} />;
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in fade-in duration-500 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Gite ed Escursioni</h2>
          <p className="text-xs text-slate-500 mt-1">Gestione operativa, riempimento e conto economico.</p>
        </div>
        <button className="bg-brand-accent-500 hover:bg-brand-accent-600 text-white border border-brand-accent-600 px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm">
          + Nuova Gita
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-50 text-[11px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50/50">
                <th className="py-4 px-6 w-1/4">Gita / Evento</th>
                <th className="py-4 px-6">Stato</th>
                <th className="py-4 px-6 min-w-[180px]">Piano Adesioni</th>
                <th className="py-4 px-6 text-right">Margine Stimato</th>
                <th className="py-4 px-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {MOCK_GITE.map((gita) => {
                const incasso = gita.iscritti * gita.prezzocliente;
                const costiTotali = gita.costi.bus + (gita.iscritti * (gita.costi.pastoPpx + gita.costi.ingressiPpx + gita.costi.extraPpx));
                const marginePrevisto = incasso - costiTotali;
                
                const percentualeIscritti = (gita.iscritti / gita.maxIscritti) * 100;
                const percentoMinimo = (gita.minimo / gita.maxIscritti) * 100;
                const confermata = gita.iscritti >= gita.minimo;
                
                let bageStato = 'bg-slate-100 text-slate-700 border border-slate-200';
                if (gita.stato === 'Raccolta Adesioni') bageStato = 'bg-brand-teal-50 text-brand-teal-700 border border-brand-teal-200';
                if (gita.stato === 'Minimo Raggiunto') bageStato = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
                if (gita.stato === 'Confermata') bageStato = 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm';
                if (gita.stato === 'Annullata') bageStato = 'bg-red-50 text-red-700 border border-red-200';

                const isExpanded = expandedId === gita.id;

                return (
                  <React.Fragment key={gita.id}>
                    <tr 
                      className={`transition-colors cursor-pointer group ${isExpanded ? 'bg-brand-teal-50/50' : 'hover:bg-slate-50/80'}`}
                      onClick={() => toggleRow(gita.id)}
                    >
                      <td className="py-5 px-6">
                        <p className="font-bold text-sm text-slate-900 leading-tight">{gita.titolo}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 font-semibold">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {gita.destinazione}</span>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-slate-400" /> {new Date(gita.data).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric'})}</span>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <div className="flex flex-col items-start gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${bageStato}`}>
                            {gita.stato}
                          </span>
                        </div>
                      </td>
                      <td className="py-5 px-6">
                        <div className="mb-1.5 flex justify-between items-end">
                          <div className="text-xs">
                            <span className="font-bold text-slate-900">{gita.iscritti} adesioni</span>
                            <span className="text-slate-400"> (max {gita.maxIscritti})</span>
                          </div>
                          {gita.stato !== 'Annullata' && (
                            <div className={`text-[10px] font-bold bg-white px-1.5 py-0.5 rounded-sm shadow-sm border border-slate-100 ${confermata ? 'text-emerald-500' : 'text-amber-500'}`}>
                              {confermata ? 'OK' : `-${gita.minimo - gita.iscritti} per Minimo`}
                            </div>
                          )}
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full relative overflow-visible">
                          <div 
                            className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-red-500 z-10 shadow-sm"
                            style={{ left: `${percentoMinimo}%` }}
                            title={`Soglia minima: ${gita.minimo}`}
                          />
                          <div 
                             className={`h-full rounded-full transition-all duration-1000 ${
                               gita.stato === 'Annullata' ? 'bg-red-400' :
                               confermata ? 'bg-emerald-500' : 'bg-brand-teal-400'
                             }`}
                             style={{ width: `${percentualeIscritti}%` }}
                          />
                        </div>
                        <div className="mt-1.5 flex gap-2 text-[10px] text-slate-500 font-semibold whitespace-nowrap">
                           <span><span className="text-slate-700 font-bold">{gita.acconti}</span> acconti</span>
                           <span className="text-slate-300">•</span>
                           <span><span className="text-slate-700 font-bold">{gita.saldi}</span> saldi</span>
                        </div>
                      </td>
                      <td className="py-5 px-6 text-right">
                         <p className="text-xs text-slate-500">Ricavi strimati: <span className="font-semibold text-slate-700">€{incasso.toLocaleString('it-IT')}</span></p>
                         <p className={`text-sm mt-0.5 font-bold ${marginePrevisto >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                           Margine: €{marginePrevisto.toLocaleString('it-IT')}
                         </p>
                      </td>
                      <td className="py-5 px-4 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-brand-teal-600 rounded-md hover:bg-brand-teal-50 transition-colors">
                           {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </td>
                    </tr>
                    
                    {/* EXPANDED DETAILS */}
                    {isExpanded && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={5} className="p-0">
                          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                            
                            {/* Card 1: Dettaglio Economico */}
                            <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-emerald-500" /> Conto Economico
                              </h4>
                              <div className="space-y-2.5 text-xs">
                                <div className="flex justify-between text-slate-600">
                                  <span>Prezzo Cliente:</span>
                                  <span className="font-semibold text-slate-900">€{gita.prezzocliente.toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-50 my-2 pt-2"></div>
                                <div className="flex justify-between items-end text-slate-600 mb-1">
                                  <div>
                                    <span className="block">Costo Bus (Fisso)</span>
                                  </div>
                                  <span className="font-semibold text-slate-900">€{gita.costi.bus.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-end text-slate-600 mb-1">
                                  <div>
                                     <span className="block">Costi Variabili (Totale)</span>
                                     <span className="text-[9px] text-slate-400">€{(gita.costi.pastoPpx + gita.costi.ingressiPpx + gita.costi.extraPpx).toFixed(2)}/px * {gita.iscritti}px</span>
                                  </div>
                                  <span className="font-semibold text-slate-900">€{(costiTotali - gita.costi.bus).toFixed(2)}</span>
                                </div>
                                <div className="border-t border-slate-50 my-2 pt-2"></div>
                                <div className="flex justify-between text-slate-600 font-bold mb-1">
                                  <span>Totale Costi:</span>
                                  <span className="text-red-500">- €{costiTotali.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600 font-bold">
                                  <span>Incasso Previsto:</span>
                                  <span className="text-emerald-600">+ €{incasso.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-sm bg-slate-50 p-3 rounded-xl mt-3 border border-slate-100">
                                  <span>Margine Netto:</span>
                                  <span className={marginePrevisto >= 0 ? "text-emerald-600" : "text-red-500"}>€{marginePrevisto.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Card 2: Dettaglio Adesioni */}
                            <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5 flex flex-col">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Users className="w-4 h-4 text-brand-teal-500" /> Stato Adesioni
                              </h4>
                              
                              <div className="grid grid-cols-2 gap-3 mb-5 flex-1">
                                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase">Aderenti</p>
                                  <p className="text-2xl font-bold text-slate-800 mt-1">{gita.iscritti}</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase">Mancanti al Min.</p>
                                  {confermata ? (
                                    <p className="text-xl font-bold text-emerald-500 mt-2 flex justify-center items-center gap-1"><CheckCircle2 className="w-4 h-4"/> OK</p>
                                  ) : (
                                    <p className="text-2xl font-bold text-amber-500 mt-1">{gita.minimo - gita.iscritti}</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="space-y-3">
                                <div>
                                  <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1.5">
                                    <span>Hanno pagato l'Acconto</span>
                                    <span>{gita.acconti} ({Math.round(gita.acconti/(gita.iscritti||1)*100)}%)</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full"><div className="h-full bg-brand-teal-400 rounded-full" style={{width:`${(gita.acconti/gita.iscritti)*100}%`}}></div></div>
                                </div>
                                <div>
                                  <div className="flex justify-between text-[10px] font-bold text-slate-600 mb-1.5">
                                    <span>Hanno pagato il Saldo</span>
                                    <span>{gita.saldi} ({Math.round(gita.saldi/(gita.iscritti||1)*100)}%)</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full"><div className="h-full bg-emerald-400 rounded-full" style={{width:`${(gita.saldi/gita.iscritti)*100}%`}}></div></div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Card 3: Switch Veicolo */}
                            <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5">
                              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Bus className="w-4 h-4 text-indigo-400" /> Logistica Mezzo
                              </h4>
                              
                              <div className="mb-5">
                                <p className="text-[10px] text-slate-500 font-bold uppercase mb-2">Mezzo Attuale</p>
                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-800">{gita.veicolo}</span>
                                  <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">Max {gita.maxIscritti}p</span>
                                </div>
                              </div>
                              
                              {gita.switchVeicolo && gita.switchVeicolo.attivo ? (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                      <p className="text-xs font-bold text-amber-800">Possibile Cambio Mezzo</p>
                                      <p className="text-[10px] text-amber-700 mt-1">
                                        Se raggiungiamo <b>{gita.switchVeicolo.soglia} adesioni</b>, si passa al <span className="font-semibold">{gita.switchVeicolo.prossimoVeicolo}</span>.
                                      </p>
                                      <p className="text-[10px] text-amber-700 mt-1.5 font-semibold">
                                        Impatto sul costo fisso: +€{gita.switchVeicolo.impattoCosto}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs text-slate-400 text-center py-5 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                  Nessun switch mezzo previsto
                                </div>
                              )}
                              
                              <div className="mt-5 flex gap-2">
                                <button className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm">Modifica</button>
                                <button 
                                  onClick={() => setSelectedGitaId(gita.id)}
                                  className="flex-[2] bg-brand-teal-600 text-white hover:bg-brand-teal-700 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm"
                                >
                                  Vedi Dettaglio Completo
                                </button>
                              </div>
                            </div>
                            
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

