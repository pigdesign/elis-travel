/**
 * Divide il nome scritto nel form di prenotazione in nome e cognome.
 *
 * Il form pubblico raccoglie un campo unico (`customerName`), mentre l'account
 * ha due campi separati perche servono a rivolgersi al cliente per nome. Una
 * divisione perfetta e impossibile — "Maria Teresa De Luca" non ha una risposta
 * unica — ma l'unico uso reale del risultato e il saluto in cima all'area
 * personale, quindi la prima parola come nome e il resto come cognome sbaglia
 * di rado e non fa danni quando sbaglia.
 *
 * L'anagrafica ufficiale resta quella della prenotazione: questa e solo una
 * comodita di presentazione.
 */
export function splitCustomerName(fullName: string | null | undefined): {
  firstName: string | null;
  lastName: string | null;
} {
  const parts = (fullName ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}
