import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "ElisTravel · Manuale segreteria",
      description: "Manuale operativo del pannello di amministrazione ElisTravel",
      defaultLocale: "root",
      locales: {
        root: { label: "Italiano", lang: "it" },
      },
      customCss: ["./src/styles/custom.css"],
      social: [],
      sidebar: [
        {
          label: "Inizia qui",
          items: [
            { label: "Benvenuta in ElisTravel", slug: "" },
            { label: "Accesso e sicurezza", slug: "iniziare/accesso" },
            { label: "Orientarsi nel pannello", slug: "iniziare/orientarsi" },
          ],
        },
        {
          label: "Lavoro quotidiano",
          items: [
            { label: "Gestire una richiesta", slug: "procedure/gestire-richiesta" },
            { label: "Prenotazione telefonica", slug: "procedure/prenotazione-telefonica" },
            { label: "Registrare un pagamento", slug: "procedure/registrare-pagamento" },
            { label: "Correggere i partecipanti", slug: "procedure/correggere-partecipanti" },
            { label: "Annullamento e rimborso", slug: "procedure/annullamento-rimborso" },
          ],
        },
        {
          label: "Funzionalità",
          items: [
            { label: "Dashboard", slug: "funzionalita/dashboard" },
            { label: "Clienti e RMS", slug: "funzionalita/clienti" },
            { label: "Gite e prenotazioni", slug: "funzionalita/gite" },
            { label: "Pagamenti", slug: "funzionalita/pagamenti" },
            { label: "Offerte e pacchetti", slug: "funzionalita/offerte" },
            { label: "Richieste CRM", slug: "funzionalita/richieste" },
            { label: "Account clienti", slug: "funzionalita/account-clienti" },
            { label: "Mezzi e impostazioni", slug: "funzionalita/impostazioni" },
          ],
        },
        {
          label: "Assistenza",
          items: [
            { label: "Problemi frequenti", slug: "assistenza/problemi-frequenti" },
            { label: "Glossario degli stati", slug: "assistenza/glossario-stati" },
          ],
        },
      ],
    }),
  ],
});
