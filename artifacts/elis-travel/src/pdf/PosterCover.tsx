import { useLayoutEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";
import logoImg from "@assets/logo_locandina_elis.png";
import type { PosterModel } from "./model";
import { POSTER_AGENCY, POSTER_BACKGROUNDS } from "./theme";

export type PosterOrientation = "portrait" | "landscape";

/**
 * Titolo auto-adattivo: cerca (per bisezione) il corpo più grande che riempie
 * il riquadro disponibile senza sforare né in larghezza né in altezza.
 * Due parole → molto grande; titolo lungo → si riduce e va a capo.
 */
function AutoFitTitle({ text, orientation }: { text: string; orientation: PosterOrientation }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const el = elRef.current;
    if (!box || !el) return;

    const fit = () => {
      // Il riquadro fa da vincolo massimo durante la ricerca…
      box.style.height = "";
      let lo = 16;
      let hi = orientation === "portrait" ? 64 : 62;
      let best = lo;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        el.style.fontSize = `${mid}pt`;
        const fits =
          el.scrollHeight <= box.clientHeight + 1 &&
          el.scrollWidth <= box.clientWidth + 1;
        if (fits) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      el.style.fontSize = `${best}pt`;
      // …poi collassa sull'altezza reale del testo, così kicker e riga data
      // restano attaccati al titolo qualunque sia il corpo calcolato.
      box.style.height = `${el.scrollHeight}px`;
    };

    fit();
    // Rimisura quando i font web finiscono di caricare (le metriche cambiano)
    document.fonts?.ready.then(fit).catch(() => {});
  }, [text, orientation]);

  return (
    <div ref={boxRef} className="poster-title-box">
      <h1 ref={elRef} className="poster-title">
        {text}
      </h1>
    </div>
  );
}

interface PosterCoverProps {
  model: PosterModel;
  orientation: PosterOrientation;
  /** Testo data eventualmente modificato dall'operatore nel form. */
  dateLabel: string;
  /** Quanti giorni mostrare in copertina (il resto va nelle pagine interne). */
  maxDays: number;
}

/** Evidenzia le cifre in arancio, come nel mockup ("DAL 17 AL 19 APRILE"). */
function DateLabel({ text }: { text: string }) {
  const parts = text.split(/(\d+)/);
  return (
    <>
      {parts.map((part, i) =>
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

/** Etichetta prezzo: forma SVG del grafico + testi sovrapposti ruotati. */
function PriceTag({ model }: { model: PosterModel }) {
  return (
    <div className="poster-pricetag">
      <img src={model.theme.assets.tag} alt="" />
      <div className="tag-text">
        <div className="tag-quota">QUOTA</div>
        {model.priceLabel ? (
          <>
            <div className="tag-price">{model.priceLabel}</div>
            <div className="tag-person">A PERSONA</div>
          </>
        ) : (
          <div className="tag-price tag-price--request">
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
 * Centra verticalmente la timeline nel pannello orizzontale con un margine
 * esplicito calcolato. Sostituisce margin auto / justify-content: il motore
 * di stampa di Chrome perde l'ultimo elemento della colonna quando lo
 * spazio è distribuito dal flex in un documento multipagina.
 */
function useCenterInPanel(ref: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const center = () => {
      const side = root.parentElement;
      if (!side?.classList.contains("poster-side")) return;
      root.style.marginTop = "";
      const cs = getComputedStyle(side);
      const avail =
        side.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const free = avail - root.getBoundingClientRect().height;
      if (free > 0) root.style.marginTop = `${free / 2}px`;
    };

    center();
    document.fonts?.ready.then(center).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Nasconde da fondo lista le voci che non stanno nella colonna (mai testi
 * affettati a metà riga in stampa); se taglia qualcosa mostra la nota
 * "dettaglio completo all'interno" del blocco.
 */
function useTrimServices(ref: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;

    const trim = () => {
      const items = Array.from(box.querySelectorAll<HTMLElement>(".poster-services-list li"));
      items.forEach((li) => {
        li.style.display = li.classList.contains("svc-note") && li.dataset.capped !== "1" ? "none" : "";
      });
      const fits = () => box.scrollHeight <= box.clientHeight + 1;
      if (fits()) return;

      const blocks = Array.from(box.querySelectorAll<HTMLElement>(".poster-services-block")).reverse();
      for (const block of blocks) {
        if (fits()) break;
        const blockItems = Array.from(
          block.querySelectorAll<HTMLElement>(".poster-services-list li:not(.svc-note)"),
        );
        const note = block.querySelector<HTMLElement>(".svc-note");
        let trimmed = false;
        for (let i = blockItems.length - 1; i >= 0 && !fits(); i--) {
          blockItems[i].style.display = "none";
          trimmed = true;
          if (note) note.style.display = "";
        }
        if (trimmed && note && !fits()) note.style.display = "";
      }
      // Extrema ratio: via anche le note se ancora non ci sta
      if (!fits()) {
        box.querySelectorAll<HTMLElement>(".svc-note").forEach((n) => (n.style.display = "none"));
      }
    };

    trim();
    document.fonts?.ready.then(trim).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Nasconde da fondo timeline i giorni/attività che sforano la colonna
 * verticale e mostra la nota "programma completo all'interno".
 * Nel pannello orizzontale non serve: lì bastano i padding.
 */
function useTrimTimeline(
  ref: React.RefObject<HTMLDivElement | null>,
  itemSelector: string,
  deps: unknown[],
) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !root.closest(".pv-lower")) return;

    const trim = () => {
      const items = Array.from(root.querySelectorAll<HTMLElement>(itemSelector));
      const note = root.querySelector<HTMLElement>(".poster-timeline-more");
      items.forEach((el) => {
        el.style.display = "";
      });
      if (note) note.style.display = note.dataset.capped === "1" ? "" : "none";

      // La colonna ha altezza definita (grid-template-rows: 100%):
      // scrollHeight rivela l'overflow del contenuto
      const fits = () => root.scrollHeight <= root.clientHeight + 1;
      if (fits()) return;
      for (let i = items.length - 1; i > 0 && !fits(); i--) {
        items[i].style.display = "none";
        if (note) note.style.display = "";
      }
    };

    trim();
    document.fonts?.ready.then(trim).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Timeline({ model, maxDays }: { model: PosterModel; maxDays: number }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const isSingle = model.days.length === 1;
  useTrimTimeline(rootRef, isSingle ? ".cover-activity" : ".poster-day", [model, maxDays]);
  useCenterInPanel(rootRef, [model, maxDays]);
  if (model.days.length === 0) {
    // Fallback: senza programma giorno-per-giorno mostriamo i punti di forza.
    if (model.highlights.length === 0) return null;
    return (
      <ul ref={rootRef as unknown as React.RefObject<HTMLUListElement>} className="poster-highlights">
        {model.highlights.slice(0, 8).map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
    );
  }

  // Giornata singola: la colonna si riempie con le attività della giornata
  // (orari + tappe) invece della timeline multi-giorno, altrimenti resta vuota.
  if (model.days.length === 1) {
    const day = model.days[0];
    const activities = day.activities.slice(0, 8);
    return (
      <div ref={rootRef} className="poster-timeline poster-timeline--single">
        <div className="poster-day">
          <div className="poster-day-marker">
            <div className="poster-day-circle">{day.dayNumber}°</div>
            <span className="giorno">GIORNO</span>
          </div>
          <div className="poster-day-text">
            <div className="accent">{day.accentLine}</div>
            {day.mainLine && <div className="main">{day.mainLine}</div>}
          </div>
        </div>
        {activities.length > 0 && (
          <div className="poster-day-activities">
            {/* In copertina solo orario + titolo: la spiegazione completa
                sta nelle pagine interne, così il programma non si taglia */}
            {activities.map((act, i) => (
              <div key={i} className="cover-activity">
                {act.time && <span className="time">{act.time}</span>}
                <span className="text">
                  <strong>{act.title}</strong>
                </span>
              </div>
            ))}
            <TimelineMoreNote capped={day.activities.length > activities.length} />
          </div>
        )}
        {activities.length === 0 && model.description && (
          <p className="poster-cover-description">{model.description}</p>
        )}
      </div>
    );
  }

  const visible = model.days.slice(0, maxDays);
  const hasMore = model.days.length > visible.length;

  return (
    <div ref={rootRef} className="poster-timeline">
      {visible.map((day) => (
        <div key={day.dayNumber} className="poster-day">
          <div className="poster-day-marker">
            <div className="poster-day-circle">{day.dayNumber}°</div>
            <span className="giorno">GIORNO</span>
          </div>
          <div className="poster-day-text">
            <div className="accent">{day.accentLine}</div>
            {day.mainLine && <div className="main">{day.mainLine}</div>}
          </div>
        </div>
      ))}
      <TimelineMoreNote capped={hasMore} />
    </div>
  );
}

/* Nota "programma completo": nel markup c'è sempre, visibile se la lista è
   già tagliata in partenza; il trim JS la mostra anche quando nasconde
   voci che non stanno nella colonna. */
function TimelineMoreNote({ capped }: { capped: boolean }) {
  return (
    <div
      className="poster-timeline-more"
      data-capped={capped ? "1" : undefined}
      style={capped ? undefined : { display: "none" }}
    >
      Programma completo all'interno
    </div>
  );
}

function ServicesBlock({
  title,
  items,
  max,
}: {
  title: string;
  items: string[];
  max: number;
}) {
  if (items.length === 0) return null;
  const visible = items.slice(0, max);
  const truncated = items.length > visible.length;
  return (
    <div className="poster-services-block">
      <div className="poster-services-title">{title}</div>
      <ul className="poster-services-list">
        {visible.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
        {/* Nota sempre nel DOM: la mostra anche il trimmer JS quando
            nasconde voci che non stanno nella colonna */}
        <li
          className="svc-note"
          data-capped={truncated ? "1" : "0"}
          style={truncated ? undefined : { display: "none" }}
        >
          … dettaglio completo all'interno
        </li>
      </ul>
    </div>
  );
}

function Footer() {
  return (
    <div className="poster-footer">
      <div className="f-line1">
        <strong>{POSTER_AGENCY.name}</strong> {POSTER_AGENCY.tagline}
      </div>
      <div className="f-line2">{POSTER_AGENCY.address}</div>
      <div className="f-line3">
        {POSTER_AGENCY.phones} - {POSTER_AGENCY.email}
      </div>
    </div>
  );
}

export function PosterCover({ model, orientation, dateLabel, maxDays }: PosterCoverProps) {
  const isPortrait = orientation === "portrait";
  const pageClass = isPortrait
    ? "poster-page poster-page--portrait pv"
    : "poster-page poster-page--landscape ph";

  const servicesRef = useRef<HTMLDivElement>(null);
  const phServicesRef = useRef<HTMLDivElement>(null);
  useTrimServices(servicesRef, [model, orientation, maxDays]);
  useTrimServices(phServicesRef, [model, orientation, maxDays]);

  return (
    <div className={pageClass}>
      {model.coverImageUrl && (
        <div className="poster-photo">
          <img src={model.coverImageUrl} alt={model.title} />
        </div>
      )}

      {/* Sfondo del grafico con finestra foto sagomata: copre la foto ai bordi */}
      <img
        className="poster-bg-overlay"
        src={isPortrait ? POSTER_BACKGROUNDS.portrait : POSTER_BACKGROUNDS.landscape}
        alt=""
      />

      <div className="poster-logo">
        <img src={logoImg} alt="Elis Travel" />
      </div>

      {/* Onda categoria del grafico: icona + etichetta già disegnate dentro */}
      <img
        className="poster-wave"
        src={isPortrait ? model.theme.assets.waveV : model.theme.assets.waveH}
        alt={model.theme.label}
      />

      {isPortrait ? (
        <>
          <div className="poster-body">
            <div className="poster-kicker">{model.kicker}</div>
            <AutoFitTitle text={model.title} orientation={orientation} />
            {dateLabel && (
              <div className="poster-daterow">
                <CalendarDays />
                <span>
                  <DateLabel text={dateLabel} />
                </span>
              </div>
            )}
          </div>
          {/* Zona inferiore: parte sotto la foto e sotto il cartellino prezzo */}
          <div className="pv-lower">
            <Timeline model={model} maxDays={maxDays} />
            <div className="poster-services" ref={servicesRef}>
              {/* Cap prudente: coi corpi grandi le liste lunghe sforerebbero
                  la colonna; il resto va nelle pagine interne */}
              <ServicesBlock title="La quota include" items={model.included} max={7} />
              <ServicesBlock title="La quota non include" items={model.excluded} max={4} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="poster-side">
            <Timeline model={model} maxDays={maxDays} />
          </div>
          <div className="poster-body">
            <div className="poster-kicker">{model.kicker}</div>
            <AutoFitTitle text={model.title} orientation={orientation} />
            {dateLabel && (
              <div className="poster-daterow">
                <CalendarDays />
                <span>
                  <DateLabel text={dateLabel} />
                </span>
              </div>
            )}
          </div>
          {/* Liste in basso su due colonne, come nel mockup orizzontale */}
          <div className="ph-services" ref={phServicesRef}>
            <ServicesBlock title="La quota include" items={model.included} max={9} />
            <ServicesBlock title="La quota non include" items={model.excluded} max={5} />
          </div>
        </>
      )}

      <PriceTag model={model} />
      <Footer />
    </div>
  );
}
