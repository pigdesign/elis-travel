import { MOCK_LEADS } from '../../data/mockData';
import { Mail, Phone, Clock, MessageSquareText, Search, Filter, PhoneCall, AlertCircle, Link2, UserCheck, Inbox } from 'lucide-react';
import React, { useState } from 'react';

export function Leads() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in fade-in duration-500 flex flex-col h-full w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Richieste / Leads</h2>
          <p className="text-xs text-slate-500 mt-1">Gestisci le richieste di preventivo e adesione arrivate dal sito o via telefono.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden flex flex-col flex-1">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-50 flex gap-4 bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cerca per nome, email o telefono..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal-500/20 focus:border-brand-teal-500 transition-colors shadow-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            <Filter className="w-4 h-4" /> Filtra Stato
          </button>
        </div>

        {/* List */}
        <div className="divide-y divide-slate-50 flex-1 overflow-y-auto">
          {MOCK_LEADS.map((lead) => {
            let bageStato = 'bg-slate-100 text-slate-700';
            let circleColor = 'bg-slate-400';
            
            if (lead.stato === 'Nuova') { bageStato = 'bg-blue-50 text-blue-800 border-[0.5px] border-blue-200'; circleColor = 'bg-blue-500'; }
            if (lead.stato === 'Contattato') { bageStato = 'bg-amber-50 text-amber-800 border-[0.5px] border-amber-200'; circleColor = 'bg-amber-500'; }
            if (lead.stato === 'Preventivo Inviato') { bageStato = 'bg-purple-50 text-purple-800 border-[0.5px] border-purple-200'; circleColor = 'bg-purple-500'; }
            if (lead.stato === 'Vinto/Confermato') { bageStato = 'bg-emerald-50 text-emerald-800 border-[0.5px] border-emerald-200'; circleColor = 'bg-emerald-500'; }
            if (lead.stato === 'Perso') { bageStato = 'bg-red-50 text-red-800 border-[0.5px] border-red-200'; circleColor = 'bg-red-500'; }

            const isExpanded = expandedId === lead.id;

            return (
              <React.Fragment key={lead.id}>
                <div 
                  className={`p-4 transition-colors group cursor-pointer flex items-center gap-6 ${isExpanded ? 'bg-brand-teal-50/50' : 'hover:bg-slate-50'}`}
                  onClick={() => toggleRow(lead.id)}
                >
                  
                  {/* Lead Type Color Tab */}
                  <div className={`w-1 h-12 rounded-full hidden md:block ${
                    lead.tipo === 'Gita' ? 'bg-indigo-300' :
                    lead.tipo === 'Offerta' ? 'bg-emerald-300' : 'bg-slate-300'
                  }`} />

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0 shadow-sm border border-slate-200/50">
                    {lead.nome.charAt(0)}
                  </div>

                  {/* Info Grid */}
                  <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    
                    <div className="md:col-span-4 flex flex-col justify-center">
                      <h3 className="font-bold text-sm text-slate-900 truncate flex items-center gap-2">
                        {lead.nome}
                        {lead.isClienteEsistente && <UserCheck className="w-3 h-3 text-emerald-500" />}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-[11px] font-medium text-slate-500">
                        <span className="flex items-center gap-1 hover:text-brand-teal-600 truncate"><Mail className="w-3 h-3 text-slate-400" /> {lead.email}</span>
                        <span className="flex items-center gap-1 hover:text-brand-teal-600 shrink-0"><Phone className="w-3 h-3 text-slate-400" /> {lead.telefono}</span>
                      </div>
                    </div>

                    <div className="md:col-span-4 flex flex-col justify-center border-l-0 md:border-l border-slate-100 pl-0 md:pl-4">
                      <p className="text-xs font-bold text-slate-700 truncate mb-1">
                        {lead.interesse}
                      </p>
                      <div className="flex items-center gap-2 text-[10px]">
                         <span className="text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-bold">{lead.canale}</span>
                         {lead.daRichiamareOggi && (
                           <span className="flex items-center gap-1 text-red-600 bg-red-50/50 px-1.5 py-0.5 rounded font-bold">
                             <PhoneCall className="w-3 h-3" /> Da chiamare
                           </span>
                         )}
                      </div>
                    </div>

                    <div className="md:col-span-3 flex justify-start md:justify-center">
                       <div className="flex flex-col items-center gap-1.5">
                         <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${bageStato}`}>
                           {lead.stato}
                         </span>
                         <span className="text-[9px] text-slate-400 font-bold uppercase">
                           Ass. a: {lead.assegnatario}
                         </span>
                       </div>
                    </div>

                    <div className="md:col-span-1 flex justify-end items-center gap-3 pr-2">
                      {lead.note > 0 && (
                         <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded" title={`${lead.note} Note Inserite`}>
                           <MessageSquareText className="w-3 h-3" /> {lead.note}
                         </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* EXPANDED ROW */}
                {isExpanded && (
                  <div className="bg-slate-50 border-b border-t border-slate-100">
                     <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
                        
                        {/* Summary & History */}
                        <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5">
                           <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-brand-teal-500" /> Dettagli Richiesta
                           </h4>
                           <div className="space-y-4 text-xs">
                             <div>
                               <p className="text-[10px] uppercase text-slate-400 font-bold">Ricezione</p>
                               <p className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3 text-slate-400"/> {lead.tempo}</p>
                             </div>
                             <div>
                               <p className="text-[10px] uppercase text-slate-400 font-bold">Canale Origine</p>
                               <p className="font-semibold text-slate-800 flex items-center gap-1 mt-0.5"><Inbox className="w-3 h-3 text-slate-400"/> {lead.canale}</p>
                             </div>
                             <div>
                               <p className="text-[10px] uppercase text-slate-400 font-bold">Ultimo Contatto</p>
                               <p className="font-semibold text-slate-800">{lead.ultimoContatto}</p>
                             </div>
                             <div>
                               <p className="text-[10px] uppercase text-slate-400 font-bold">Profilo Cliente</p>
                               {lead.isClienteEsistente 
                                 ? <p className="font-semibold text-emerald-600 flex items-center gap-1 mt-0.5"><UserCheck className="w-3 h-3"/> Presente in Anagrafica Centrale</p>
                                 : <p className="font-semibold text-slate-500 mt-0.5">Nuovo Contatto (Non registrato)</p>
                               }
                             </div>
                           </div>
                        </div>

                        {/* Collegamento a Prodotto */}
                        <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5">
                           <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                              <Link2 className="w-4 h-4 text-emerald-500" /> Prodotto Collegato
                           </h4>
                           
                           {lead.tipo !== 'Generica' ? (
                             <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 relative overflow-hidden">
                               <div className={`absolute left-0 top-0 bottom-0 w-1 ${lead.tipo === 'Gita' ? 'bg-indigo-400' : 'bg-emerald-400'}`}></div>
                               <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">
                                 {lead.tipo === 'Gita' ? 'Gita di Gruppo' : 'Pacchetto Offerta'}
                               </p>
                               <p className="font-bold text-slate-900 text-sm leading-tight">{lead.interesse}</p>
                               
                               <button className="mt-3 text-[10px] font-bold text-brand-teal-600 hover:text-brand-teal-700 underline underline-offset-2">
                                 Apri dettaglio prodotto &rarr;
                               </button>
                             </div>
                           ) : (
                             <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center bg-slate-50/50">
                               <p className="text-xs font-bold text-slate-600">Richiesta Libera</p>
                               <p className="text-[10px] text-slate-400 mt-1">Non è stato specificato alcun prodotto di partenza. Richiesto preventivo su misura.</p>
                             </div>
                           )}

                           <div className="mt-5">
                             <button className="w-full bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 py-2 rounded-xl text-xs font-bold transition-colors">
                               Crea Preventivo
                             </button>
                           </div>
                        </div>

                        {/* Operatività & Note */}
                        <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-5 flex flex-col">
                           <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                              <MessageSquareText className="w-4 h-4 text-amber-500" /> Operatività Interna
                           </h4>
                           
                           <div className="flex-1">
                             <p className="text-[10px] uppercase text-slate-400 font-bold mb-2">Note ({lead.note})</p>
                             {lead.note > 0 ? (
                               <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-900 font-medium italic">
                                 "Il cliente ha chiesto di essere ricontattato dopo le 18:00 perché lavora. Preferisce stanza con vista mare."
                               </div>
                             ) : (
                               <div className="text-xs text-slate-400 italic">Nessuna nota aggiunta.</div>
                             )}
                           </div>
                           
                           <div className="mt-4 flex gap-2">
                              <button className="flex-1 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 py-2 rounded-xl text-xs font-bold transition-colors">
                                Aggiungi Nota
                              </button>
                              <button className="flex-[1.5] bg-brand-teal-600 text-white hover:bg-brand-teal-700 py-2 rounded-xl text-xs font-bold transition-colors">
                                Invia Messaggio
                              </button>
                           </div>
                        </div>

                     </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
