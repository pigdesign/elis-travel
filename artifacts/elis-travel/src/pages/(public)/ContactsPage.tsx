import { useState, type FormEvent } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import { useSubmitContactRequest } from "@workspace/api-client-react";
import { Mail, Phone, MapPin, Send, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

export function ContactsPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { mutate: submit, isPending, isSuccess, reset } = useSubmitContactRequest();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!name.trim() || !email.trim()) {
      setErrorMessage("Compila almeno nome e email.");
      return;
    }

    submit(
      {
        data: {
          customerName: name.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          message: message.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setName("");
          setEmail("");
          setPhone("");
          setMessage("");
        },
        onError: (err: unknown) => {
          const apiErr = err as { error?: string } | undefined;
          setErrorMessage(apiErr?.error ?? "Si è verificato un errore. Riprova più tardi.");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative pt-40 pb-20 bg-gradient-to-br from-primary to-primary/80 text-white">
        <div className="container mx-auto px-4 md:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">Contattaci</h1>
          <p className="text-white/80 max-w-2xl mx-auto text-lg">
            Hai un viaggio in mente? Scrivici e il nostro team ti risponderà al più presto.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 max-w-6xl mx-auto">
            {/* Info colonna sinistra */}
            <div className="space-y-8 lg:col-span-1">
              <div>
                <h2 className="text-2xl font-serif font-bold text-foreground mb-3">I nostri recapiti</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Vieni a trovarci in agenzia o contattaci direttamente per organizzare la tua prossima vacanza.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Sede</div>
                    <div className="text-muted-foreground text-sm">
                      via Cavour 59c<br />17051 Andora (SV)
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Telefono</div>
                    <div className="text-muted-foreground text-sm">+39 06 1234 5678</div>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Email</div>
                    <div className="text-muted-foreground text-sm">ciao@elistravel.it</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form colonna destra */}
            <div className="lg:col-span-2">
              <div className="bg-white border border-border rounded-2xl p-6 md:p-10 shadow-sm">
                {isSuccess ? (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-2xl font-serif font-bold text-foreground mb-2">
                      Richiesta inviata!
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      Grazie per averci contattato. Il nostro team ti risponderà entro 24 ore lavorative.
                    </p>
                    <Button
                      onClick={() => reset()}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      Invia un'altra richiesta
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <h2 className="text-2xl font-serif font-bold text-foreground mb-1">Inviaci un messaggio</h2>
                    <p className="text-muted-foreground text-sm mb-6">
                      I campi contrassegnati con <span className="text-accent">*</span> sono obbligatori.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Nome completo <span className="text-accent">*</span>
                        </label>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          disabled={isPending}
                          className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          placeholder="Mario Rossi"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Email <span className="text-accent">*</span>
                        </label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          disabled={isPending}
                          className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          placeholder="mario@email.it"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Telefono
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={isPending}
                        className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                        placeholder="+39 333 1234567"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Messaggio
                      </label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={5}
                        disabled={isPending}
                        className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 resize-none"
                        placeholder="Raccontaci che tipo di viaggio stai cercando..."
                      />
                    </div>

                    {errorMessage && (
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isPending}
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90 inline-flex items-center justify-center gap-2"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Invio in corso...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          Invia richiesta
                        </>
                      )}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
