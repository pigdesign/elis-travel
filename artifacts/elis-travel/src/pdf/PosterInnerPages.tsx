import logoImg from "@assets/logo_locandina_elis.png";
import type { PosterModel } from "./model";
import { POSTER_AGENCY } from "./theme";
import type { PosterOrientation } from "./PosterCover";

interface PosterInnerPagesProps {
  model: PosterModel;
  orientation: PosterOrientation;
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
  const hasContent =
    Boolean(model.description) ||
    hasProgram ||
    hasServices ||
    model.pickupPoints.length > 0 ||
    Boolean(model.payment);

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
              <div className="poster-inner-header">
                <img src={logoImg} alt="Elis Travel" />
                <span className="poster-inner-badge">
                  <Icon />
                  {model.theme.label}
                </span>
              </div>
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
              <div className="poster-inner-body">
                {model.description && (
                  <section className="poster-inner-section">
                    <h2 className="poster-inner-title">{model.title}</h2>
                    <p className="poster-inner-description">{model.description}</p>
                  </section>
                )}

                {hasProgram && (
                  <section className="poster-inner-section">
                    <h2 className="poster-inner-title">Programma</h2>
                    {model.days.map((day) => (
                      <div key={day.dayNumber} className="poster-inner-day">
                        <div className="poster-day-marker">
                          <div className="poster-day-circle">{day.dayNumber}°</div>
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

                {model.pickupPoints.length > 0 && (
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

                {model.payment && (
                  <section className="poster-inner-section">
                    <h2 className="poster-inner-title">Come prenotare</h2>
                    <div className="poster-inner-payment">
                      {model.payment.depositPercentage && (
                        <div>
                          Acconto alla prenotazione: <strong>{model.payment.depositPercentage}%</strong>{" "}
                          della quota di partecipazione.
                        </div>
                      )}
                      {model.payment.iban && (
                        <div>
                          Bonifico bancario — IBAN: <strong>{model.payment.iban}</strong>
                          {model.payment.beneficiary && (
                            <> — Intestato a: {model.payment.beneficiary}</>
                          )}
                          {model.payment.bank && <> ({model.payment.bank})</>}
                        </div>
                      )}
                      {model.payment.notes && <div>{model.payment.notes}</div>}
                    </div>
                  </section>
                )}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Anteprima a schermo: fascia contatti in coda al documento */}
      <div className="poster-inner-footerband no-print">
        <strong>{POSTER_AGENCY.name}</strong> {POSTER_AGENCY.tagline} ·{" "}
        {POSTER_AGENCY.address} · {POSTER_AGENCY.phones} · {POSTER_AGENCY.email}
      </div>

      {/* Stampa: banda fissa che si ripete a fondo di ogni pagina fisica */}
      <div className="poster-print-footband">
        <span>
          <strong>{POSTER_AGENCY.name}</strong> {POSTER_AGENCY.tagline} ·{" "}
          {POSTER_AGENCY.address} · {POSTER_AGENCY.phones} · {POSTER_AGENCY.email}
        </span>
      </div>
    </div>
  );
}
