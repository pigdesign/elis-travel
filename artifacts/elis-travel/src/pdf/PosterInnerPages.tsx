import { CalendarDays } from "lucide-react";
import logoImg from "@assets/logo_locandina_elis.png";
import type { PosterModel } from "./model";
import { POSTER_AGENCY } from "./theme";
import type { PosterOrientation } from "./PosterCover";

/**
 * Sezione "Punti di raccolta" nascosta su richiesta del cliente: i dati
 * continuano ad arrivare dall'API e restano nel modello, quindi per
 * rimetterla basta riportare questa costante a true.
 */
const PICKUP_SECTION_ENABLED = false;

interface PosterInnerPagesProps {
  model: PosterModel;
  orientation: PosterOrientation;
}

/**
 * Contatti agenzia su due righe. Ogni voce è un blocco indivisibile: su una
 * riga sola il testo andava a capo dove capitava, spezzando in due il
 * trattino dell'indirizzo email.
 */
function AgencyContacts() {
  return (
    <div className="poster-contacts">
      <div>
        <span className="nb">
          <strong>{POSTER_AGENCY.name}</strong> {POSTER_AGENCY.tagline}
        </span>{" "}
        · <span className="nb">{POSTER_AGENCY.address}</span>
      </div>
      <div>
        <span className="nb">{POSTER_AGENCY.phones}</span> ·{" "}
        <span className="nb">{POSTER_AGENCY.email}</span>
      </div>
    </div>
  );
}

/** Evidenzia le cifre in arancio, come sulla copertina. */
function DateLabel({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+)/).map((part, i) =>
        /^\d+$/.test(part) ? (
          <span key={i} className="num">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/**
 * Testata della prima pagina interna: riprende la parte alta della copertina
 * (foto, titolo, sottotitolo, luogo, date, prezzo) perché la scheda possa
 * essere inviata da sola, senza locandina, restando comprensibile.
 */
function InnerHero({ model }: { model: PosterModel }) {
  return (
    <div className="poster-inner-hero">
      {model.coverImageUrl && (
        <img className="hero-photo" src={model.coverImageUrl} alt={model.title} />
      )}
      <div className="hero-veil" />

      <div className="hero-content">
        <div className="hero-kicker">{model.kicker}</div>
        <h1 className="hero-title">{model.title}</h1>
        {model.subtitle && <p className="hero-subtitle">{model.subtitle}</p>}
        {model.location && <p className="hero-location">{model.location}</p>}
        {model.dateLabel && (
          <div className="hero-date">
            <CalendarDays />
            <span>
              <DateLabel text={model.dateLabel} />
            </span>
          </div>
        )}
      </div>

      <div className="hero-price">
        <div className="q">QUOTA</div>
        {model.priceLabel ? (
          <>
            <div className="v">{model.priceLabel}</div>
            <div className="pp">A PERSONA</div>
          </>
        ) : (
          <div className="v v--request">
            SU
            <br />
            RICHIESTA
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Pagine interne della scheda completa: descrizione, programma giorno per
 * giorno integrale, quota include/non include, punti di raccolta (gite) e
 * condizioni di pagamento. Il contenuto fluisce su più pagine A4; l'header
 * (thead) si ripete su ogni pagina stampata.
 */
export function PosterInnerPages({ model, orientation }: PosterInnerPagesProps) {
  const Icon = model.theme.icon;

  const hasProgram = model.days.some((d) => d.activities.length > 0 || d.mainLine);
  const hasServices = model.included.length > 0 || model.excluded.length > 0;
  const hasContent = Boolean(model.description) || hasProgram || hasServices;

  if (!hasContent) return null;

  return (
    <div
      className={
        orientation === "landscape"
          ? "poster-inner-wrap poster-inner-wrap--landscape"
          : "poster-inner-wrap"
      }
    >
      <table className="poster-inner">
        <thead>
          <tr>
            <td>
              {/* Si ripete su ogni pagina stampata e riserva lo spazio della
                  fascia fissa qui sotto; a schermo è alto zero.
                  La fascia NON sta qui dentro perché il browser ripeterebbe
                  la stessa identica versione anche sulla prima pagina, dove
                  invece serve quella pulita (la testata grande dice già
                  titolo e quota). */}
              <div className="poster-inner-headspace" />
            </td>
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td>
              {/* In stampa si ripete a fine pagina e riserva lo spazio per
                  la banda footer fissa; a schermo è alto zero */}
              <div className="poster-inner-endspace" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>
              {/* Blocco della PRIMA pagina: in stampa risale sopra lo spazio
                  riservato dal thead e copre la fascia fissa, che quindi
                  resta visibile solo dalla seconda pagina in poi */}
              <div className="poster-inner-firstpage">
                <div className="poster-inner-header">
                  <img src={logoImg} alt="Elis Travel" />
                  <span className="poster-inner-badge">
                    <Icon />
                    {model.theme.label}
                  </span>
                </div>
                <InnerHero model={model} />
              </div>
              <div className="poster-inner-body">
                {model.description && (
                  <section className="poster-inner-section">
                    {/* Il nome della gita è già nella testata qui sopra: qui
                        serve un titolo di sezione, non una ripetizione */}
                    <h2 className="poster-inner-title">Informazioni</h2>
                    <p className="poster-inner-description">{model.description}</p>
                  </section>
                )}

                {hasProgram && (
                  <section className="poster-inner-section">
                    <h2 className="poster-inner-title">Programma</h2>
                    {model.days.map((day) => (
                      <div key={day.dayNumber} className="poster-inner-day">
                        <div className="poster-day-marker">
                          <div className="poster-day-circle">{day.dayNumber}</div>
                          <span className="giorno" style={{ color: "var(--poster-navy)" }}>
                            GIORNO
                          </span>
                        </div>
                        <div className="poster-inner-day-content">
                          <div className="poster-inner-day-head">
                            <span className="accent">{day.accentLine}</span>
                            {day.mainLine && <span className="main">{day.mainLine}</span>}
                          </div>
                          {day.activities.map((act, i) => (
                            <div key={i} className="poster-inner-activity">
                              {act.time && <span className="time">{act.time}</span>}
                              <span>
                                <span className="title">{act.title}</span>
                                {act.description && <> — {act.description}</>}
                              </span>
                            </div>
                          ))}
                          {day.imageUrl && (
                            <img
                              src={day.imageUrl}
                              alt={day.accentLine}
                              className="poster-inner-day-photo"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </section>
                )}

                {hasServices && (
                  <section className="poster-inner-section">
                    <div className="poster-inner-cols">
                      {model.included.length > 0 && (
                        <div>
                          <h2 className="poster-inner-title">La quota include</h2>
                          <ul className="poster-inner-list">
                            {model.included.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {model.excluded.length > 0 && (
                        <div>
                          <h2 className="poster-inner-title">La quota non include</h2>
                          <ul className="poster-inner-list">
                            {model.excluded.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </section>
                )}

                {PICKUP_SECTION_ENABLED && model.pickupPoints.length > 0 && (
                  <section className="poster-inner-section">
                    <h2 className="poster-inner-title">Punti di raccolta</h2>
                    {model.pickupPoints.map((pp, i) => (
                      <div key={i} className="poster-inner-pickup">
                        <span className="place">
                          {pp.city} — {pp.name}
                          {pp.address ? `, ${pp.address}` : ""}
                        </span>
                        {pp.time && <span className="time">ORE {pp.time}</span>}
                      </div>
                    ))}
                  </section>
                )}

                {/* Niente acconto/IBAN: la scheda circola come materiale
                    informativo generale e le modalità di pagamento cambiano
                    caso per caso. Qui restano solo i contatti. */}
                <section className="poster-inner-section">
                  <h2 className="poster-inner-title">Come prenotare</h2>
                  <div className="poster-inner-payment">
                    <div>
                      Per informazioni e prenotazioni contattaci al{" "}
                      <strong>{POSTER_AGENCY.phones}</strong>, scrivi a{" "}
                      <strong>{POSTER_AGENCY.email.toLowerCase()}</strong> oppure visita{" "}
                      <strong>{POSTER_AGENCY.website}</strong>.
                    </div>
                    <div>
                      Puoi anche passare in agenzia: {POSTER_AGENCY.addressPretty}.
                    </div>
                  </div>
                </section>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Stampa: fascia fissa in cima a OGNI pagina fisica. Sulla prima resta
          nascosta sotto il blocco di apertura (opaco, z-index maggiore), così
          titolo e quota in piccolo si vedono solo dalla seconda in poi. */}
      <div className="poster-inner-printheader">
        <img src={logoImg} alt="Elis Travel" />
        <div className="poster-inner-header-id">
          <div className="t">{model.title}</div>
          <div className="p">
            {model.priceLabel ? (
              <>
                QUOTA <strong>{model.priceLabel}</strong> A PERSONA
              </>
            ) : (
              <>QUOTA SU RICHIESTA</>
            )}
          </div>
        </div>
        <span className="poster-inner-badge">
          <Icon />
          {model.theme.label}
        </span>
      </div>

      {/* Anteprima a schermo: fascia contatti in coda al documento */}
      <div className="poster-inner-footerband no-print">
        <AgencyContacts />
      </div>

      {/* Stampa: banda fissa che si ripete a fondo di ogni pagina fisica */}
      <div className="poster-print-footband">
        <AgencyContacts />
      </div>
    </div>
  );
}
