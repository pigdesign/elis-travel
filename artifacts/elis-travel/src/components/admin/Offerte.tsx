import { MOCK_OFFERTE } from '../../data/mockData';
import { MapPin, Clock, Plus } from 'lucide-react';
import { useState } from 'react';
import React from 'react';
import { OffertaDetail } from './OffertaDetail';

export function Offerte() {
  const [selectedOffertaId, setSelectedOffertaId] = useState<string | null>(null);

  if (selectedOffertaId) {
    return <OffertaDetail offertaId={selectedOffertaId} onBack={() => setSelectedOffertaId(null)} />;
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-12 animate-in fade-in duration-500 w-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">Offerte e Pacchetti</h2>
          <p className="text-xs text-slate-500 mt-1">Catalogo delle proposte viaggio e performance commerciali.</p>
        </div>
        <button className="bg-brand-accent-500 hover:bg-brand-accent-600 text-white border border-brand-accent-600 px-4 py-2 rounded-lg text-xs font-bold transition-colors shadow-sm">
          + Crea Offerta
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-50 text-[11px] uppercase tracking-wider text-slate-400 font-bold bg-slate-50/50">
              <th className="py-4 px-6 w-1/3">Proposta / TO</th>
              <th className="py-4 px-6">Info Commerciali</th>
              <th className="py-4 px-6 text-center">Performance</th>
              <th className="py-4 px-6 text-right">Prezzo Base</th>
              <th className="py-4 px-4 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {MOCK_OFFERTE.map((offerta) => {
              let bageStato = 'bg-slate-100 text-slate-700 border-slate-200';
              if (offerta.stato === 'Pubblicata') bageStato = 'bg-emerald-50 text-emerald-700 border-emerald-200';
              if (offerta.stato === 'Bozza') bageStato = 'bg-amber-50 text-amber-700 border-amber-200';
              if (offerta.stato === 'Archiviata') bageStato = 'bg-slate-100 text-slate-500 border-slate-200';

              return (
                <tr 
                  key={offerta.id}
                  className={`transition-colors cursor-pointer group hover:bg-slate-50/80`}
                  onClick={() => setSelectedOffertaId(offerta.id)}
                >
                  <td className="py-5 px-6">
                    <p className="font-bold text-sm text-slate-900 leading-tight group-hover:text-brand-teal-700">{offerta.titolo}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 font-semibold">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400 group-hover:text-brand-teal-400" /> {offerta.destinazione}</span>
                      <span className="text-slate-300">•</span>
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">{offerta.tourOperator}</span>
                    </div>
                  </td>
                  <td className="py-5 px-6">
                    <div className="flex flex-col gap-1.5 items-start">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase border ${bageStato}`}>
                        {offerta.stato}
                      </span>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1 font-semibold">
                         <Clock className="w-3 h-3" /> <span className={offerta.validita === 'Scaduta' ? 'text-red-500 font-bold' : 'text-slate-700'}>{offerta.validita}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-5 px-6 text-center">
                    <div className="inline-flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-slate-800">{offerta.richieste}</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Leads gen.</span>
                    </div>
                  </td>
                  <td className="py-5 px-6 text-right">
                    <p className="text-sm font-bold text-slate-900">€ {offerta.prezzo.toLocaleString('it-IT')}</p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-1 uppercase tracking-wider">{offerta.durata}</p>
                  </td>
                  <td className="py-5 px-4 text-center">
                    <button className="bg-brand-teal-50 text-brand-teal-600 hover:bg-brand-teal-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                      Dettagli Offerta
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
