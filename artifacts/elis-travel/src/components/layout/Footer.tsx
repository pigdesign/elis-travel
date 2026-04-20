import { Link } from "wouter";
import { Map, Facebook, Twitter, Instagram, Youtube, Mail, Phone, MapPin } from "lucide-react";
import { Button } from "../shared/Button";

export function Footer() {
  return (
    <footer className="bg-foreground text-white pt-20 pb-10">
      <div className="container mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand Col */}
          <div className="space-y-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-accent-foreground">
                <Map className="w-5 h-5" />
              </div>
              <span className="text-2xl font-serif font-bold text-white">Elis Travel</span>
            </Link>
            <p className="text-white/70 leading-relaxed text-sm">
              We curate the most beautiful and adventurous travel experiences in Italy and around the world. Your dream vacation starts here.
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
            <h4 className="text-lg font-bold mb-6 font-serif">Quick Links</h4>
            <ul className="space-y-3">
              {['About Us', 'Destinations', 'Tours', 'Blog', 'Contact Us'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-white/70 hover:text-accent transition-colors text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Top Destinations */}
          <div>
            <h4 className="text-lg font-bold mb-6 font-serif">Top Destinations</h4>
            <ul className="space-y-3">
              {['Vietnam', 'Italy', 'Greece', 'Japan', 'Switzerland'].map((link) => (
                <li key={link}>
                  <a href="#" className="text-white/70 hover:text-accent transition-colors text-sm flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-lg font-bold mb-6 font-serif">Contact Info</h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-white/70 text-sm">
                <MapPin className="w-5 h-5 text-accent shrink-0" />
                <span>Via Roma 123, 00100 Rome, Italy</span>
              </li>
              <li className="flex items-center gap-3 text-white/70 text-sm">
                <Phone className="w-5 h-5 text-accent shrink-0" />
                <span>+39 06 1234 5678</span>
              </li>
              <li className="flex items-center gap-3 text-white/70 text-sm">
                <Mail className="w-5 h-5 text-accent shrink-0" />
                <span>ciao@elistravel.it</span>
              </li>
            </ul>
            <div className="mt-6">
              <h5 className="text-sm font-bold mb-3">Newsletter</h5>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  placeholder="Your email" 
                  className="bg-white/10 border border-white/20 rounded-full px-4 py-2 text-sm outline-none focus:border-accent w-full"
                />
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground px-4">
                  <Map className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 text-center text-white/50 text-sm">
          <p>&copy; {new Date().getFullYear()} Elis Travel. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
