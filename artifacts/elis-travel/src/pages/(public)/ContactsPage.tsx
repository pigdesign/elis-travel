import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/shared/Button";
import {
  useSubmitContactRequest,
  useListPublicCatalog,
} from "@workspace/api-client-react";
import {
  Mail,
  Phone,
  MapPin,
  Send,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";

const contactSchema = z.object({
  customerName: z.string().trim().min(2, "Inserisci il tuo nome (min. 2 caratteri)."),
  email: z.string().trim().toLowerCase().email("Indirizzo email non valido."),
  phone: z.string().trim().max(40, "Numero troppo lungo.").optional().or(z.literal("")),
  productRef: z.string().optional(),
  message: z
    .string()
    .trim()
    .max(2000, "Messaggio troppo lungo (max 2000 caratteri).")
    .optional()
    .or(z.literal("")),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactsPage() {
  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors },
    setError,
    clearErrors,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      customerName: "",
      email: "",
      phone: "",
      productRef: "",
      message: "",
    },
  });

  const { data: catalog } = useListPublicCatalog();
  const {
    mutate: submit,
    isPending,
    isSuccess,
    reset: resetMutation,
  } = useSubmitContactRequest();

  const rootError = errors.root?.message;

  const onSubmit = (values: ContactFormValues) => {
    clearErrors("root");
    submit(
      {
        data: {
          customerName: values.customerName,
          email: values.email,
          phone: values.phone?.trim() ? values.phone.trim() : null,
          message: values.message?.trim() ? values.message.trim() : null,
          productRef: values.productRef ? values.productRef : null,
        },
      },
      {
        onSuccess: () => {
          resetForm();
        },
        onError: (err: unknown) => {
          let serverMessage: string | undefined;
          if (err && typeof err === "object") {
            const e = err as { name?: string; data?: { error?: string }; error?: string };
            serverMessage = e.data?.error ?? e.error;
          }
          setError("root", {
            type: "server",
            message: serverMessage ?? "Si è verificato un errore. Riprova più tardi.",
          });
        },
      }
    );
  };

  const handleNewRequest = () => {
    resetMutation();
    resetForm();
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
            <div className="space-y-8 lg:col-span-1">
              <div>
                <h2 className="text-2xl font-serif font-bold text-foreground mb-3">
                  I nostri recapiti
                </h2>
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
                      onClick={handleNewRequest}
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      Invia un'altra richiesta
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                    <h2 className="text-2xl font-serif font-bold text-foreground mb-1">
                      Inviaci un messaggio
                    </h2>
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
                          {...register("customerName")}
                          disabled={isPending}
                          aria-invalid={!!errors.customerName}
                          className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          placeholder="Mario Rossi"
                        />
                        {errors.customerName && (
                          <p className="text-xs text-red-600 mt-1">{errors.customerName.message}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1.5">
                          Email <span className="text-accent">*</span>
                        </label>
                        <input
                          type="email"
                          {...register("email")}
                          disabled={isPending}
                          aria-invalid={!!errors.email}
                          className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                          placeholder="mario@email.it"
                        />
                        {errors.email && (
                          <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Telefono
                      </label>
                      <input
                        type="tel"
                        {...register("phone")}
                        disabled={isPending}
                        className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                        placeholder="+39 333 1234567"
                      />
                      {errors.phone && (
                        <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Prodotto di interesse
                      </label>
                      <select
                        {...register("productRef")}
                        disabled={isPending}
                        className="w-full px-4 py-2.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                      >
                        <option value="">Richiesta generica</option>
                        {catalog?.offers && catalog.offers.length > 0 && (
                          <optgroup label="Offerte viaggio">
                            {catalog.offers.map((o) => (
                              <option key={`offer:${o.id}`} value={`offer:${o.id}`}>
                                {o.name}
                                {o.destination ? ` — ${o.destination}` : ""}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {catalog?.excursions && catalog.excursions.length > 0 && (
                          <optgroup label="Gite ed escursioni">
                            {catalog.excursions.map((ex) => (
                              <option key={`excursion:${ex.id}`} value={`excursion:${ex.id}`}>
                                {ex.name}
                                {ex.location ? ` — ${ex.location}` : ""}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1.5">
                        Messaggio
                      </label>
                      <textarea
                        {...register("message")}
                        rows={5}
                        disabled={isPending}
                        className="w-full px-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 resize-none"
                        placeholder="Raccontaci che tipo di viaggio stai cercando..."
                      />
                      {errors.message && (
                        <p className="text-xs text-red-600 mt-1">{errors.message.message}</p>
                      )}
                    </div>

                    {rootError && (
                      <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span>{rootError}</span>
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
