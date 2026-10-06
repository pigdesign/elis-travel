// La prenotazione da cui il cliente parte per accedere all'area clienti.
//
// Il portale la deposita qui quando il cliente sceglie "Accedi", la pagina di
// accesso la ritira e la manda insieme alla richiesta del link (o alla
// password): il server la lega all'accesso e il cliente si ritrova il viaggio
// fra i suoi senza tornare nell'email a premere "Collega".
//
// sessionStorage e non localStorage: serve solo al passaggio portale -> accesso
// nella stessa scheda. Il resto del tragitto (l'email aperta magari sul
// telefono) lo fa il server, che lega la prenotazione al link di accesso.

const KEY = "elis.bookingAfterLogin";

export function rememberBookingForLogin(bookingToken: string): void {
  if (!bookingToken) return;
  try {
    window.sessionStorage.setItem(KEY, bookingToken);
  } catch {
    // Archivio non disponibile: si entra lo stesso, il pulsante resta.
  }
}

/** Legge e cancella: un passaggio vale per un solo accesso. */
export function takeBookingForLogin(): string {
  try {
    const value = window.sessionStorage.getItem(KEY) ?? "";
    window.sessionStorage.removeItem(KEY);
    return value.trim().slice(0, 512);
  } catch {
    return "";
  }
}
