import { useState, useEffect } from "react";
import { Settings, Save, Loader2 } from "lucide-react";
import {
  useGetAdminSettings,
  useUpdateAdminSettings,
  getGetAdminSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetAdminSettings();
  const { mutateAsync, isPending } = useUpdateAdminSettings({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(getGetAdminSettingsQueryKey(), data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      },
    },
  });

  const [iban, setIban] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [bank, setBank] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setIban(settings.payment_iban ?? "");
      setBeneficiary(settings.payment_beneficiary ?? "");
      setBank(settings.payment_bank ?? "");
      setNotes(settings.payment_notes ?? "");
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await mutateAsync({
        data: {
          payment_iban: iban.trim(),
          payment_beneficiary: beneficiary.trim(),
          payment_bank: bank.trim(),
          payment_notes: notes.trim(),
        },
      });
    } catch {
      setErrorMsg("Impossibile salvare le impostazioni. Riprova.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" />
          Impostazioni
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configurazione delle coordinate di pagamento utilizzate nei testi email alle prenotazioni.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          Coordinate di pagamento
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Intestatario del conto
            </label>
            <input
              type="text"
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="Es. Elis Travel S.r.l."
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-settings-beneficiary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">IBAN</label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="Es. IT60X0542811101000000123456"
              className="w-full px-3 py-2 border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-settings-iban"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Banca</label>
            <input
              type="text"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="Es. Banca Intesa Sanpaolo"
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-settings-bank"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Causale suggerita
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Prenotazione gita – [cognome]"
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-settings-notes"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Verrà usata come causale predefinita nell'email. Se lasciata vuota, verrà generata automaticamente.
            </p>
          </div>

          {errorMsg && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {errorMsg}
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 font-medium"
              data-testid="button-settings-save"
            >
              {isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Salvataggio…</>
              ) : (
                <><Save className="w-4 h-4" />Salva impostazioni</>
              )}
            </button>
            {saved && (
              <span className="text-sm text-emerald-700 font-medium">Salvato!</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
