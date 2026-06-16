import { Link } from "wouter";
import { Map, Facebook, Twitter, Instagram, Youtube, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "../shared/Button";
import logoImg from "@assets/INSEGNA_ELISTRAVEL_def_orange_1776683850682.webp";

export function Footer() {
  return (
    <footer className="bg-foreground text-white pt-20 pb-10">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 mb-16">
          {/* Brand Col */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center">
              <img src={logoImg} alt="Elis Travel" className="h-16 w-auto object-contain" />
            </Link>
            <p className="text-white/70 leading-relaxed text-sm">
              Curiamo le esperienze di viaggio più belle e avventurose in Italia e nel mondo. La vacanza dei tuoi sogni inizia qui.
            </p>
            <div className="flex gap-4">
              {[Facebook, Twitter, Instagram, Youtube].map((Icon, i) => (
                <a key={i} href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors">
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-bold mb-6 font-serif">Link rapidi</h4>
            <ul className="space-y-3">
              {[
                { label: 'Chi siamo', href: '/contatti' },
                { label: 'Offerte & Pacchetti', href: '/offerte' },
                { label: 'Gite di Gruppo', href: '/gite' },
                { label: 'Contattaci', href: '/contatti' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-white/70 hover:text-accent transition-colors text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Top Destinations */}
          <div>
            <h4 className="text-lg font-bold mb-6 font-serif">Tipologie di viaggio</h4>
            <ul className="space-y-3">
              {[
                { label: 'Tutte le Offerte', href: '/offerte' },
                { label: 'Crociere', href: '/offerte?category=crociera' },
                { label: 'Vacanze', href: '/offerte?category=vacanza' },
                { label: 'Gite in Giornata', href: '/gite' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-white/70 hover:text-accent transition-colors text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Note Legali */}
          <div>
            <h4 className="text-lg font-bold mb-6 font-serif">Note Legali</h4>
            <ul className="space-y-3">
              {[
                { label: 'Termini e Condizioni', href: '/termini-e-condizioni' },
                { label: 'Privacy Policy', href: '/privacy-policy' },
                { label: 'Cookie Policy', href: '/cookie-policy' },
              ].map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-white/70 hover:text-accent transition-colors text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-lg font-bold mb-6 font-serif">Contatti</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-white/70 text-sm">
                <MapPin className="w-5 h-5 text-accent shrink-0" />
                <span>Via Cavour 59C - Andora SV</span>
              </li>
              <li className="flex items-center gap-3 text-white/70 text-sm">
                <Phone className="w-5 h-5 text-accent shrink-0" />
                <div className="flex flex-col gap-1">
                  <a href="tel:+390182646447" className="hover:text-accent transition-colors">0182 64 64 47</a>
                  <a href="tel:+393911717007" className="hover:text-accent transition-colors">391 17 17 007</a>
                </div>
              </li>
              <li className="flex items-center gap-3 text-white/70 text-sm">
                <Mail className="w-5 h-5 text-accent shrink-0" />
                <a href="mailto:info@elis-travel.it" className="hover:text-accent transition-colors">info@elis-travel.it</a>
              </li>
            </ul>
            <div className="mt-6">
              <h5 className="text-sm font-bold mb-3">Newsletter</h5>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  placeholder="La tua email" 
                  className="bg-white/10 border border-white/20 rounded-full px-4 py-2 text-sm outline-none focus:border-accent w-full"
                />
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground px-4">
                  <Map className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 text-white/50 text-sm">
          <p>&copy; {new Date().getFullYear()} Elis Travel. Tutti i diritti riservati.</p>
        </div>
      </div>
    </footer>
  );
}
