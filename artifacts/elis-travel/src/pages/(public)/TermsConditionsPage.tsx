import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export function TermsConditionsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header solid />
      <main className="flex-1 pt-36 pb-16">
        <div className="max-w-4xl mx-auto px-4 md:px-8">
          <iframe
            src="https://www.iubenda.com/termini-e-condizioni/57118125"
            title="Termini e Condizioni"
            style={{ width: "100%", minHeight: "80vh", border: "none" }}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
