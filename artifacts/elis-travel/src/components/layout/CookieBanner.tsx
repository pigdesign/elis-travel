import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/shared/Button";
import { Cookie, X } from "lucide-react";

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Controlla se l'utente ha già accettato i cookie
    const hasAccepted = localStorage.getItem("elis_cookie_consent");
    if (!hasAccepted) {
      setIsVisible(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem("elis_cookie_consent", "accepted");
    setIsVisible(false);
  };

  const declineCookies = () => {
    localStorage.setItem("elis_cookie_consent", "declined");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pointer-events-none">
      <div className="max-w-4xl mx-auto bg-white border border-border shadow-2xl rounded-2xl p-5 md:p-6 pointer-events-auto flex flex-col md:flex-row gap-6 items-start md:items-center">
        
        <div className="flex-1 flex gap-4 items-start">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 hidden sm:flex">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-foreground mb-1 text-base">Informativa sui Cookie</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Questo sito utilizza cookie tecnici strettamente necessari e, con il tuo consenso, cookie di profilazione per migliorare la tua esperienza di navigazione. 
              Puoi scoprire di più leggendo la nostra <Link href="/cookie-policy" className="text-primary hover:underline font-medium">Cookie Policy</Link> e 
              l'<Link href="/privacy-policy" className="text-primary hover:underline font-medium">Informativa sulla Privacy</Link>.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
          <Button 
            variant="outline" 
            onClick={declineCookies}
            className="w-full sm:w-auto"
          >
            Solo necessari
          </Button>
          <Button 
            onClick={acceptCookies}
            className="w-full sm:w-auto"
          >
            Accetta tutti
          </Button>
        </div>

        <button 
          onClick={declineCookies}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Chiudi"
        >
          <X className="w-5 h-5" />
        </button>

      </div>
    </div>
  );
}
