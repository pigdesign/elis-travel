import "express-session";

declare module "express-session" {
  interface SessionData {
    adminUser: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
    // Chiave dell'area clienti, deliberatamente separata da adminUser: le due
    // sessioni vivono su cookie e store diversi e non devono mai fare da
    // fallback l'una per l'altra. La guardia lato cliente rilegge comunque
    // stato e verifica dell'account dal database, perche una sessione a 90
    // giorni non puo essere l'unica fonte di verita su un account bloccato.
    customerAccount: {
      accountId: string;
      email: string;
    };
  }
}
