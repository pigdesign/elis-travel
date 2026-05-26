import { ArrowLeft, MapPin, Calendar, Bus, Users, TrendingUp, Download, CheckCircle2, AlertTriangle, FileText, Settings, User } from 'lucide-react';
import { MOCK_GITE } from '../../data/mockData';
import React, { useState } from 'react';

interface GitaDetailProps {
  gitaId: string;
  onBack: () => void;
}

export function GitaDetail({ gitaId, onBack }: GitaDetailProps) {
  const gita = MOCK_GITE.find(g => g.id === gitaId);

  if (!gita) return <div>Gita non trovata.</div>;

  const incasso = gita.iscritti * gita.prezzocliente;
  const costiTotali = gita.costi.bus + (gita.iscritti * (gita.costi.pastoPpx + gita.costi.ingressiPpx + gita.costi.extraPpx));
  const marginePrevisto = incasso - costiTotali;
  const confermata = gita.iscritti >= gita.minimo;
  const percentualeRiempimento = Math.min(100, Math.round((gita.iscritti / gita.maxIscritti) * 100));

  let bageStato = 'bg-slate-100 text-slate-700';
  if (gita.stato === 'Minimo Raggiunto') bageStato = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (gita.stato === 'Raccolta Adesioni') bageStato = 'bg-brand-teal-50 text-brand-teal-700 border border-brand-teal-200';
  if (gita.stato === 'Confermata') bageStato = 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  if (gita.stato === 'Annullata') bageStato = 'bg-red-50 text-red-700 border border-red-200';

  // Generiamo falsi iscritti per la demo
  const mockPartecipanti = Array.from({ length: gita.iscritti }).map((_, i) => ({
    id: i,
    nome: ['Marco Rossi', 'Giulia Bianchi', 'Luca Verdi', 'Francesca Neri', 'Alessandro Costa', 'Sofia Ricci', 'Matteo Esposito', 'Chiara Romano', 'Davide Moretti', 'Elena Bruno'][i % 10] + (i >= 10 ? ` ${i + 1}` : ''),
    pagamento: i < gita.saldi ? 'Saldo' : i < gita.acconti ? 'Acconto' : 'Prenotato',
    posti: 1,
    dataPrenotazione: '2024-03-' + (10 + (i % 20)).toString().padStart(2, '0')
  }));

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in slide-in-from-right-4 duration-300 w-full">
      {/* Header & Back */}
      <div className="mb-6">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand-teal-600 transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Torna all'elenco Gite
        </button>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{gita.titolo}</h1>
              <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${bageStato}`}>
                {gita.stato}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold text-slate-500">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-teal-500" /> {gita.destinazione}</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-brand-teal-500" /> {new Date(gita.data).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric'})}</span>
            </div>
          </div>
          <div className="flex gap-2">
             <button className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-2">
               <FileText className="w-4 h-4" /> Esporta Foglio Viaggio
             </button>
             <button className="bg-brand-accent-500 hover:bg-brand-accent-600 text-white border border-brand-accent-600 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-2">
               <Settings className="w-4 h-4" /> Gestisci Evento
             </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN: Adesioni */}
        <div className="lg:col-span-2 space-y-6">
           {/* Box Partecipanti */}
           <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
             <div className="p-5 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                  <Users className="w-4 h-4 text-brand-teal-500" />
                  Lista Partecipanti ({gita.iscritti})
                </h3>
                <button className="text-[11px] font-bold text-brand-teal-600 hover:underline">
                  Aggiungi Partecipante +
                </button>
             </div>
             
             {/* Progress Status */}
             <div className="p-6 border-b border-slate-50">
                <div className="flex justify-between items-end mb-2">
                  <div className="text-sm">
                    <span className="font-bold text-slate-900 text-2xl">{gita.iscritti} / {gita.maxIscritti}</span>
                    <span className="text-slate-500 font-semibold ml-2">posti occupati</span>
                  </div>
                  <div className="text-right">
                    {confermata ? (
                      <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1 justify-end">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Quota minima raggiunta
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-500 flex items-center gap-1 justify-end">
                        <AlertTriangle className="w-3.5 h-3.5" /> Mancano {gita.minimo - gita.iscritti} persone al minimo
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full relative overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ${
                       gita.stato === 'Annullata' ? 'bg-red-400' :
                       confermata ? 'bg-emerald-500' : 'bg-brand-teal-400'
                     }`}
                    style={{ width: `${percentualeRiempimento}%` }}
                  />
                </div>
             </div>

             {/* Table Partecipanti */}
             <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
               <table className="w-full text-left border-collapse">
                 <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_#f8fafc]">
                   <tr className="border-b border-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50/80 backdrop-blur-sm">
                     <th className="py-3 px-6">Nominativo</th>
                     <th className="py-3 px-6">Posti</th>
                     <th className="py-3 px-6">Stato Pagamento</th>
                     <th className="py-3 px-6 text-right">Data Pren.</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {mockPartecipanti.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                        <td className="py-4 px-6 md:w-1/3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-teal-50 flex items-center justify-center text-brand-teal-700 font-bold text-xs">
                              {p.nome.charAt(0)}
                            </div>
                            <span className="font-bold text-xs text-slate-800">{p.nome}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-600 font-semibold">{p.posti} px</td>
                        <td className="py-4 px-6">
                           <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                             ${p.pagamento === 'Saldo' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : ''}
                             ${p.pagamento === 'Acconto' ? 'bg-amber-50 text-amber-600 border border-amber-100' : ''}
                             ${p.pagamento === 'Prenotato' ? 'bg-slate-100 text-slate-500 border border-slate-200' : ''}
                           `}>
                             {p.pagamento}
                           </span>
                        </td>
                        <td className="py-4 px-6 text-right text-[11px] text-slate-400 font-semibold">
                          {new Date(p.dataPrenotazione).toLocaleDateString('it-IT')}
                        </td>
                      </tr>
                    ))}
                 </tbody>
               </table>
             </div>
           </div>
        </div>

        {/* RIGHT COLUMN: Dettagli Fiscali e Logistici */}
        <div className="space-y-6">
           
           {/* Conto Economico */}
           <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> 
                Conto Economico
              </h3>
              
              <div className="space-y-3.5 text-xs">
                 <div className="flex justify-between items-center text-slate-600">
                   <span className="font-medium">Prezzo di Vendita (ppx)</span>
                   <span className="font-bold text-slate-900 border border-slate-100 px-2 py-1 rounded bg-slate-50">€ {gita.prezzocliente.toFixed(2)}</span>
                 </div>
                 
                 <div className="h-px bg-slate-50 my-2"></div>
                 
                 <div className="space-y-4">
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Costi Variabili (Totali x {gita.iscritti}px)</p>
                   
                   <div className="flex justify-between items-end text-slate-600">
                     <div>
                       <span className="block font-medium">Pasto Ristorante</span>
                       <span className="text-[10px] text-slate-400">€ {gita.costi.pastoPpx.toFixed(2)} / persona</span>
                     </div>
                     <span className="font-bold text-slate-800">€ {(gita.costi.pastoPpx * gita.iscritti).toFixed(2)}</span>
                   </div>
                   
                   <div className="flex justify-between items-end text-slate-600">
                     <div>
                       <span className="block font-medium">Ingressi e Tariffe</span>
                       <span className="text-[10px] text-slate-400">€ {gita.costi.ingressiPpx.toFixed(2)} / persona</span>
                     </div>
                     <span className="font-bold text-slate-800">€ {(gita.costi.ingressiPpx * gita.iscritti).toFixed(2)}</span>
                   </div>
                   
                   <div className="flex justify-between items-end text-slate-600">
                     <div>
                       <span className="block font-medium">Extra / Guide</span>
                       <span className="text-[10px] text-slate-400">€ {gita.costi.extraPpx.toFixed(2)} / persona</span>
                     </div>
                     <span className="font-bold text-slate-800">€ {(gita.costi.extraPpx * gita.iscritti).toFixed(2)}</span>
                   </div>
                 </div>

                 <div className="h-px bg-slate-50 my-2"></div>

                 <div className="space-y-2">
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Costi Fissi</p>
                   <div className="flex justify-between text-slate-600">
                     <span>Pullman (Fisso)</span>
                     <span className="font-semibold text-slate-800">€ {gita.costi.bus.toFixed(2)}</span>
                   </div>
                 </div>

                 <div className="h-px bg-slate-50 my-2"></div>

                 <div className="pt-2">
                   <div className="flex justify-between text-slate-600 font-bold mb-1.5 text-sm">
                     <span>Totale Costi</span>
                     <span className="text-red-500">- € {costiTotali.toFixed(2)}</span>
                   </div>
                   <div className="flex justify-between text-slate-600 font-bold text-sm">
                     <span>Incasso Attuale ({gita.iscritti}px)</span>
                     <span className="text-emerald-600">+ € {incasso.toFixed(2)}</span>
                   </div>
                 </div>

                 <div className="flex justify-between items-center font-bold text-sm bg-slate-50 p-4 rounded-xl mt-4 border border-slate-100">
                   <span className="uppercase text-[11px] tracking-wider text-slate-500">Margine Netto</span>
                   <span className={`text-xl ${marginePrevisto >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                     € {marginePrevisto.toFixed(2)}
                   </span>
                 </div>
              </div>
           </div>

           {/* Logistica */}
           <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-5 flex items-center gap-2">
                <Bus className="w-4 h-4 text-indigo-400" /> 
                Logistica Trasporti
              </h3>
              
              <div className="space-y-4">
                 <div>
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Mezzo Incaricato</p>
                   <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                       <span className="text-xs font-bold text-slate-800">{gita.veicolo}</span>
                     </div>
                     <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded font-bold">{gita.maxIscritti} Posti</span>
                   </div>
                 </div>

                 {gita.switchVeicolo && gita.switchVeicolo.attivo && (
                   <div className="bg-brand-teal-50/50 border border-brand-teal-100/50 rounded-xl p-3">
                     <p className="text-[10px] uppercase font-bold text-brand-teal-700 tracking-wider mb-1">Piano Scalabilità</p>
                     <p className="text-xs text-brand-teal-900 font-medium">Scatta il <span className="font-bold">{gita.switchVeicolo.prossimoVeicolo}</span> a <span className="font-bold">{gita.switchVeicolo.soglia} adesioni</span> (+€{gita.switchVeicolo.impattoCosto} fissi).</p>
                   </div>
                 )}

                 <div>
                   <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1.5">Note Operative</p>
                   <div className="text-xs text-slate-600 font-medium bg-slate-50 rounded-xl p-3 border border-slate-100 italic">
                     Ritrovo in Piazzale d'Armi alle ore 06:45. L'autista (Paolo) invierà dettagli della targa il giorno prima. Rientro stimato ore 20:30.
                   </div>
                 </div>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}
