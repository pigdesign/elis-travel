import { ArrowLeft, Globe2, Tag, Target, Users, MapPin, PlaneTakeoff, ShieldCheck, Sun, Check, X, FileText, CopyPlus, Link, Hotel, Navigation, Bus } from 'lucide-react';
import { MOCK_OFFERTE } from '../../data/mockData';
import React from 'react';

interface OffertaDetailProps {
  offertaId: string;
  onBack: () => void;
}

export function OffertaDetail({ offertaId, onBack }: OffertaDetailProps) {
  const offerta = MOCK_OFFERTE.find(o => o.id === offertaId);

  if (!offerta) return <div>Offerta non trovata.</div>;

  let bageStato = 'bg-slate-100 text-slate-700 border-slate-200';
  if (offerta.stato === 'Pubblicata') bageStato = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (offerta.stato === 'Bozza') bageStato = 'bg-amber-50 text-amber-700 border-amber-200';
  if (offerta.stato === 'Archiviata') bageStato = 'bg-slate-100 text-slate-500 border-slate-200';

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in slide-in-from-right-4 duration-300 w-full overflow-hidden">
      {/* Header & Back */}
      <div className="mb-6">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-brand-teal-600 transition-colors mb-4 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Torna alle Offerte
        </button>
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">{offerta.titolo}</h1>
              <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border ${bageStato}`}>
                {offerta.stato}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm font-semibold text-slate-500">
              <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-brand-teal-500" /> {offerta.destinazione}</span>
               <span className="text-slate-300">•</span>
               <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md uppercase tracking-wider text-[11px] font-bold">{offerta.tourOperator}</span>
               <span className="text-slate-300">•</span>
               <span className="text-slate-500 text-[11px] font-mono tracking-wider">REF: {offerta.codicePratica}</span>
            </div>
          </div>
          <div className="flex gap-2">
             <button className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-2">
               <CopyPlus className="w-4 h-4" /> Duplica
             </button>
             <button className="bg-brand-accent-500 hover:bg-brand-accent-600 text-white border border-brand-accent-600 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-2">
               <FileText className="w-4 h-4" /> Modifica Offerta
             </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Contenuto Pacchetto (Informazione per il cliente) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-brand-teal-500" /> 
                Contenuto del Pacchetto <span className="text-[10px] font-normal uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md ml-2">Visibile ai Clienti</span>
            </h2>

           <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-6">
                
                {/* Prezzo e Quote */}
                <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-100 pb-5 mb-5 gap-4">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">Prezzo Pubblico</p>
                        <div className="flex items-baseline gap-2">
                            {offerta.aPartireDa && <span className="text-sm font-semibold text-slate-500">A partire da</span>}
                            <span className="text-4xl font-bold text-slate-900">€ {offerta.prezzoBase.toLocaleString('it-IT')}</span>
                            <span className="text-xs font-semibold text-slate-500"> / persona</span>
                        </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 max-w-sm">
                        <p className="text-[10px] font-bold text-amber-800 uppercase mb-1">Extra ed Esclusioni</p>
                        <p className="text-xs font-medium text-amber-700 leading-tight">{offerta.extraEsclusi}</p>
                    </div>
                </div>

                {/* Struttura del Viaggio */}
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Struttura del Viaggio</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Volo / Partenza da</p>
                        <p className="text-sm font-bold text-slate-800">{offerta.aeroportoPartenza}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Destinazione</p>
                        <p className="text-sm font-bold text-slate-800">{offerta.destinazioneFinale}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Durata</p>
                        <p className="text-sm font-bold text-slate-800">{offerta.notti} Notti / {offerta.notti + 1} Giorni</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Data / Periodo</p>
                        <p className="text-sm font-bold text-slate-800">{offerta.date}</p>
                    </div>
                </div>

                {/* Cosa comprende */}
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Servizi Inclusi</h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6 mb-6 text-sm font-medium">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${offerta.inclusi.volo ? 'bg-brand-teal-50 text-brand-teal-600' : 'bg-slate-50 text-slate-300'}`}>
                            <PlaneTakeoff className="w-4 h-4" />
                        </div>
                        <span className={offerta.inclusi.volo ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'}>Voli A/R</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${offerta.inclusi.hotel ? 'bg-brand-teal-50 text-brand-teal-600' : 'bg-slate-50 text-slate-300'}`}>
                            <Hotel className="w-4 h-4" />
                        </div>
                        <span className={offerta.inclusi.hotel ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'}>Pernottamento</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${offerta.inclusi.trasferimenti ? 'bg-brand-teal-50 text-brand-teal-600' : 'bg-slate-50 text-slate-300'}`}>
                            <Bus className="w-4 h-4" />
                        </div>
                        <span className={offerta.inclusi.trasferimenti ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'}>Trasferimenti loco</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${offerta.inclusi.assicurazione ? 'bg-brand-teal-50 text-brand-teal-600' : 'bg-slate-50 text-slate-300'}`}>
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                        <span className={offerta.inclusi.assicurazione ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'}>Assicurazione Med/Bag</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-teal-50 text-brand-teal-600 flex items-center justify-center">
                            <Sun className="w-4 h-4" />
                        </div>
                        <span className="text-slate-800">{offerta.trattamento}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${offerta.inclusi.escursioni ? 'bg-brand-teal-50 text-brand-teal-600' : 'bg-slate-50 text-slate-300'}`}>
                            <Navigation className="w-4 h-4" />
                        </div>
                        <span className={offerta.inclusi.escursioni ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'}>Escursioni guidate</span>
                    </div>
                </div>

                <div className="h-px bg-slate-100 my-6"></div>

                {/* Descrizione Breve e Punti di Forza */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Testo Pubblicitario</h3>
                        <p className="text-sm text-slate-600 leading-relaxed italic border-l-2 border-brand-teal-200 pl-3">
                            "{offerta.descrizioneBreve}"
                        </p>
                    </div>
                    <div>
                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Punti di Forza (Highlights)</h3>
                        <ul className="space-y-2">
                            {offerta.puntiForza.map((punto, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                    <span>{punto}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
                
                <div className="h-px bg-slate-100 my-6"></div>

                {/* Variazioni Prezzo */}
                <div>
                     <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Variazioni e Note Tariffarie</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-50 rounded-xl p-3 text-sm">
                            <span className="font-bold text-slate-700 block mb-1">Supplementi previsti:</span>
                            <span className="text-slate-600">{offerta.supplementi || 'Nessun supplemento standard'}</span>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-sm">
                            <span className="font-bold text-slate-700 block mb-1">Riduzioni previste:</span>
                            <span className="text-slate-600">{offerta.riduzioni || 'Nessuna riduzione applicabile'}</span>
                        </div>
                     </div>
                </div>

           </div>
        </div>

        {/* RIGHT COLUMN: Informazioni Interne / Admin */}
        <div className="lg:col-span-4 flex flex-col gap-6">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-500" /> 
                Gestione Interna <span className="text-[10px] font-normal uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md ml-2">Solo Staff</span>
            </h2>

           <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 p-6">
              
              <div className="space-y-5">
                 <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Dati Commerciali</h3>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col gap-3 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Fornitore / T.O.</span>
                            <span className="font-bold text-slate-900">{offerta.tourOperator}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Validità Offerta</span>
                            <span className={offerta.validita === 'Scaduta' ? 'text-red-500 font-bold' : 'text-slate-900 font-bold'}>{offerta.validita}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Formula Base</span>
                            <span className="font-bold text-slate-900">{offerta.formula}</span>
                        </div>
                    </div>
                 </div>

                 <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Performance (Leads)</h3>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col gap-3 text-sm">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Richieste generate</span>
                            <span className="font-bold text-brand-teal-600 text-lg">{offerta.richieste}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Ultimo interesse</span>
                            <span className="font-semibold text-slate-800">{offerta.dataUltimaRichiesta}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 font-medium">Fonte principale</span>
                            <span className="font-semibold text-slate-800">{offerta.origine}</span>
                        </div>
                    </div>
                 </div>

                 <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Note Condivise Staff</h3>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm font-medium text-amber-900 italic">
                       {offerta.noteInterne}
                    </div>
                 </div>
              </div>

               <div className="mt-6 pt-6 border-t border-slate-100">
                    <button className="w-full bg-slate-900 text-white hover:bg-slate-800 transition-colors py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm">
                        <Link className="w-4 h-4" /> Ottieni Link Pubblico
                    </button>
               </div>

           </div>
        </div>
      </div>
    </div>
  );
}
