import { Link } from "wouter";
import { Button } from "@/components/shared/Button";
import { Menu, X, LayoutDashboard, UserRound, Phone } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import logoImg from "@assets/logo_sito_bianco_ELISTRAVEL_def_1776683532402.webp";
import stickyLogoImg from "@assets/elis_color_4k.png";
import { useAuthUser } from "@/contexts/AuthContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";

/**
 * Sotto questa larghezza il menu completo non sta su una riga (servono circa
 * 1100px): si usa l'hamburger. Deve combaciare con il prefisso `xl:` qui sotto.
 */
const DESKTOP_NAV_QUERY = "(min-width: 1280px)";

/**
 * `solid` forza da subito l'aspetto "scrollato": sfondo bianco e testo scuro
 * (sotto i 1280px: sfondo arancione e logo bianco, vedi `solidLook`).
 *
 * Serve alle pagine senza foto scura in cima — portale prenotazione, area
 * clienti — dove il menu bianco su fondo chiaro semplicemente non si vede.
 * Il default resta invariato per non toccare home e pagine con hero.
 */
export function Header({ solid = false }: { solid?: boolean } = {}) {
  const [isScrolled, setIsScrolled] = useState(solid);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const authUser = useAuthUser();
  const { state: customerState } = useCustomerAuth();

  // Chi ha gia la sessione entra direttamente nella sua area; gli altri passano
  // dalla pagina di accesso. Mentre lo stato e in caricamento mostriamo comunque
  // la voce, puntata alla pagina di accesso: un menu che appare in ritardo o
  // cambia sotto il dito e peggio di un clic in piu.
  const areaClientiHref =
    customerState.status === "authenticated" ? "/area-clienti" : "/accedi";
  const areaClientiLabel =
    customerState.status === "authenticated"
      ? customerState.account.firstName?.trim() || "Area clienti"
      : "Area clienti";

  useEffect(() => {
    if (solid) return;
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [solid]);

  // Barre del telefono nell'arancione del sito. Safari da iOS 26 ignora
  // theme-color e colora la barra di stato (e quella in basso) con lo sfondo
  // del body: sotto i 1280px, sulle pagine pubbliche, il body diventa
  // arancione (regola `body.site-chrome` in index.css). Ogni pagina ha già il
  // suo fondo pieno, quindi l'arancione si vede solo nelle barre e quando la
  // pagina "rimbalza" oltre i bordi.
  useEffect(() => {
    document.body.classList.add("site-chrome");
    return () => document.body.classList.remove("site-chrome");
  }, []);

  // Menu aperto: la pagina sotto non scorre, Esc lo chiude, e se la finestra
  // si allarga fino al menu completo il pannello si chiude da solo.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    const mq = window.matchMedia(DESKTOP_NAV_QUERY);
    const onWide = () => {
      if (mq.matches) setMobileMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onWide);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onWide);
    };
  }, [mobileMenuOpen]);

  // Header "pieno": a pagina scrollata, o col menu aperto perché logo e voci
  // restino leggibili anche sopra la foto dell'hero. Sotto i 1280px è
  // arancione (accent) con il logo bianco, come la barra del browser
  // (theme-color in index.html); da 1280px resta bianco col logo a colori.
  const solidLook = isScrolled || mobileMenuOpen;
  const closeMenu = () => setMobileMenuOpen(false);

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Offerte", href: "/offerte" },
    { name: "Crociere", href: "/offerte?category=crociera" },
    { name: "Vacanze", href: "/offerte?category=vacanza" },
    { name: "Gite", href: "/gite" },
    { name: "Turismo Dentale", href: "/rident" },
    { name: "Contatti", href: "/contatti" },
  ];

  return (
    <>
      <header
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          solidLook
            ? "bg-white/75 backdrop-blur-md shadow-sm py-4 max-xl:bg-accent"
            : "bg-transparent py-6",
          mobileMenuOpen && "bg-accent"
        )}
      >
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex shrink-0 items-center gap-3 group" onClick={closeMenu}>
              <img
                src={logoImg}
                alt="Elis Travel"
                className={cn(
                  "h-[52px] w-auto object-contain group-hover:scale-105 transition-transform",
                  solidLook && "xl:hidden"
                )}
              />
              <img
                src={stickyLogoImg}
                alt="Elis Travel"
                className={cn(
                  "hidden h-[52px] w-auto object-contain group-hover:scale-105 transition-transform",
                  solidLook && "xl:block"
                )}
              />
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden xl:flex items-center gap-8">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors hover:text-accent",
                    isScrolled ? "text-foreground" : "text-white/90"
                  )}
                >
                  {link.name}
                </a>
              ))}
            </nav>

            <div className="hidden xl:flex items-center gap-3">
              {authUser && (
                <Link href="/admin">
                  <button
                    className={cn(
                      "inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-accent",
                      isScrolled ? "text-foreground" : "text-white/90"
                    )}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Amministrazione
                  </button>
                </Link>
              )}
              <Link href={areaClientiHref}>
                <button
                  className={cn(
                    "inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-accent",
                    isScrolled ? "text-foreground" : "text-white/90"
                  )}
                >
                  <UserRound className="w-4 h-4" />
                  {areaClientiLabel}
                </button>
              </Link>
              <Link href="/gite">
                <Button className="bg-accent text-accent-foreground hover:bg-accent/90 border-none">
                  Prenota ora
                </Button>
              </Link>
            </div>

            {/* Tablet e telefono: "Prenota ora" resta a vista dove c'è spazio,
                il resto sta nel menu. */}
            <div className="flex items-center gap-2 xl:hidden">
              <Link href="/gite" className="hidden sm:block" onClick={closeMenu}>
                <Button
                  className={cn(
                    "border-none",
                    // sull'header arancione il pulsante diventa bianco
                    solidLook
                      ? "bg-white text-accent hover:bg-white/90"
                      : "bg-accent text-accent-foreground hover:bg-accent/90"
                  )}
                >
                  Prenota ora
                </Button>
              </Link>
              <button
                type="button"
                className="-mr-2.5 p-2.5 rounded-full"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label={mobileMenuOpen ? "Chiudi il menu" : "Apri il menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="menu-mobile"
              >
                {mobileMenuOpen ? (
                  <X className="w-6 h-6 text-white" />
                ) : (
                  <Menu className="w-6 h-6 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <nav
            id="menu-mobile"
            aria-label="Menu principale"
            className="xl:hidden absolute top-full left-0 w-full bg-white shadow-lg max-h-[calc(100dvh-5.25rem)] overflow-y-auto overscroll-contain"
          >
            <div className="container mx-auto px-4 md:px-8 pb-6">
              <ul>
                {navLinks.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="flex min-h-12 items-center border-b border-border/70 text-base font-medium text-foreground transition-colors hover:text-accent"
                      onClick={closeMenu}
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
                {authUser && (
                  <li>
                    <Link
                      href="/admin"
                      className="flex min-h-12 items-center gap-2 border-b border-border/70 text-base font-medium text-foreground transition-colors hover:text-accent"
                      onClick={closeMenu}
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      Amministrazione
                    </Link>
                  </li>
                )}
                <li>
                  <Link
                    href={areaClientiHref}
                    className="flex min-h-12 items-center gap-2 border-b border-border/70 text-base font-medium text-foreground transition-colors hover:text-accent"
                    onClick={closeMenu}
                  >
                    <UserRound className="w-4 h-4" />
                    {areaClientiLabel}
                  </Link>
                </li>
              </ul>
              <Link href="/gite" className="mt-6 block" onClick={closeMenu}>
                <Button className="h-12 w-full bg-accent text-accent-foreground text-base hover:bg-accent/90 border-none">
                  Prenota ora
                </Button>
              </Link>
              <a
                href="tel:+390182646447"
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-base font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Phone className="w-4 h-4" />
                Chiamaci: 0182 64 64 47
              </a>
            </div>
          </nav>
        )}
      </header>

      {/* Velo sotto il pannello: un tocco fuori dal menu lo chiude. Sta fuori
          dall'header perché il backdrop-blur dell'header farebbe da contenitore
          ai figli `fixed`. */}
      {mobileMenuOpen && (
        <div
          className="xl:hidden fixed inset-0 z-40 bg-black/30"
          aria-hidden="true"
          onClick={closeMenu}
        />
      )}
    </>
  );
}
